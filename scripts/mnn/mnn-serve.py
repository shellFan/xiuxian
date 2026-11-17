#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
牛马修仙传 V10 — MNN-Pocket-0.3B 本地推理服务 (OpenAI 兼容).

仅监听 127.0.0.1；只产出文本；绝不接触游戏存档/数值。
游戏侧 ai-bridge.cjs 以 MNN_CHAT_URL 指向本服务 (默认 http://127.0.0.1:7860)。

端点:
  GET  /health                -> {"status":"ok","ready":bool,"model":...}
  POST /v1/chat/completions   -> OpenAI chat.completions 兼容 JSON (非流式)
并发: 同一时刻只允许 1 个推理请求, 其余返回 503 busy (游戏桥接会立即降级规则引擎)。
"""
import argparse
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 7860
DEFAULT_MODEL_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "xiuxian-mnn", "model")
MAX_INPUT_CHARS = 2000
MAX_OUTPUT_TOKENS = 128
MAX_OUTPUT_CHARS = 600
INFER_LOCK = threading.Lock()
STATE = {"ready": False, "model": "mnn-pocket-0.3b", "loaded_at": None, "infer_count": 0, "last_error": None}


def build_prompt(messages, chat_template):
    """Render an OpenAI-style message list with the model's chat template."""
    system = ""
    turns = []
    for m in messages:
        role = str(m.get("role", "user"))
        content = str(m.get("content", ""))[:MAX_INPUT_CHARS]
        if role == "system":
            system = content
        elif role in ("user", "assistant"):
            turns.append((role, content))
    if not turns:
        turns = [("user", "你好")]
    if chat_template:
        parts = []
        if system:
            parts.append(chat_template["system"].format(content=system))
        for role, content in turns:
            parts.append(chat_template[role].format(content=content))
        parts.append(chat_template["assistant_end"])
        return "".join(parts)
    lines = []
    if system:
        lines.append("[设定]" + system)
    for role, content in turns:
        lines.append(("[玩家]" if role == "user" else "[NPC]") + content)
    lines.append("[NPC]")
    return "\n".join(lines)


def make_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            sys.stderr.write("[mnn-serve] " + (fmt % args) + "\n")

        def _json(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path.rstrip("/") in ("/health", "/v1/health"):
                return self._json(200, {"status": "ok", "ready": STATE["ready"], "model": STATE["model"],
                                        "infer_count": STATE["infer_count"], "last_error": STATE["last_error"]})
            return self._json(404, {"error": "not found"})

        def do_POST(self):
            if self.path.rstrip("/") not in ("/v1/chat/completions", "/chat/completions"):
                return self._json(404, {"error": "not found"})
            if not STATE["ready"]:
                return self._json(503, {"error": {"message": "model not ready", "type": "service_unavailable"}})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                messages = payload.get("messages") or []
                max_tokens = min(int(payload.get("max_tokens") or MAX_OUTPUT_TOKENS), MAX_OUTPUT_TOKENS)
            except Exception as exc:
                return self._json(400, {"error": {"message": "bad request: " + str(exc), "type": "invalid_request_error"}})
            if not messages:
                return self._json(400, {"error": {"message": "messages required", "type": "invalid_request_error"}})
            if not INFER_LOCK.acquire(blocking=False):
                return self._json(503, {"error": {"message": "busy", "type": "service_unavailable"}})
            try:
                started = time.time()
                prompt = build_prompt(messages, engine.get("chat_template"))
                text = engine["generate"](prompt, max_tokens)
                elapsed = time.time() - started
                STATE["infer_count"] += 1
                return self._json(200, {
                    "id": "chatcmpl-%d" % int(time.time() * 1000),
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": STATE["model"],
                    "choices": [{"index": 0, "message": {"role": "assistant", "content": text},
                                 "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": len(prompt), "completion_tokens": max_tokens,
                              "total_tokens": len(prompt) + max_tokens},
                    "elapsed_ms": round(elapsed * 1000),
                })
            except Exception as exc:
                STATE["last_error"] = str(exc)[:300]
                return self._json(500, {"error": {"message": "inference failed: " + str(exc), "type": "internal_error"}})
            finally:
                INFER_LOCK.release()

    return Handler


def _qwen_chat_template():
    return {
        "system": "<|im_start|>system\n{content}<|im_end|>\n",
        "user": "<|im_start|>user\n{content}<|im_end|>\n",
        "assistant_end": "<|im_start|>assistant\n",
    }


def load_engine(model_dir):
    from MNN import llm  # deferred: lets /health work even if the engine import is slow
    config_path = os.path.join(model_dir, "config.json")
    if not os.path.exists(config_path):
        raise FileNotFoundError("MNN config not found: " + config_path)
    chat_template = None
    tpl_path = os.path.join(model_dir, "chat_template.jinja")
    if os.path.exists(tpl_path):
        with open(tpl_path, "r", encoding="utf-8") as fh:
            raw = fh.read()
        if "im_start" in raw:
            chat_template = _qwen_chat_template()
    print("[mnn-serve] loading model from %s ..." % model_dir, flush=True)
    started = time.time()
    engine_llm = llm.create(config_path)
    engine_llm.load()

    def generate(prompt, max_tokens):
        stream = engine_llm.response(prompt)
        if isinstance(stream, str):
            return stream[:MAX_OUTPUT_CHARS].strip()
        chunks = []
        total = 0
        for token in stream:
            piece = token if isinstance(token, str) else str(token)
            chunks.append(piece)
            total += len(piece)
            if total >= MAX_OUTPUT_CHARS:
                break
        return "".join(chunks).strip()

    STATE["ready"] = True
    STATE["loaded_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    print("[mnn-serve] model ready in %.1fs" % (time.time() - started), flush=True)
    return {"generate": generate, "chat_template": chat_template}


def _load_safely(engine, model_dir):
    try:
        loaded = load_engine(model_dir)
        engine["generate"] = loaded["generate"]
        engine["chat_template"] = loaded["chat_template"]
    except Exception as exc:
        STATE["last_error"] = str(exc)[:300]
        print("[mnn-serve] FATAL model load failed: %s" % exc, flush=True)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="MNN-Pocket-0.3B OpenAI-compatible local server")
    parser.add_argument("--port", type=int, default=int(os.environ.get("MNN_CHAT_PORT", DEFAULT_PORT)))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--model-dir", default=os.environ.get("MNN_MODEL_DIR", DEFAULT_MODEL_DIR))
    parser.add_argument("--lazy", action="store_true", help="serve /health immediately, load model in background")
    args = parser.parse_args()

    engine = {"generate": lambda p, m: "", "chat_template": None}
    if args.lazy:
        threading.Thread(target=_load_safely, args=(engine, args.model_dir), daemon=True).start()
    else:
        _load_safely(engine, args.model_dir)

    server = ThreadingHTTPServer((args.host, args.port), make_handler(engine))
    print("[mnn-serve] listening on http://%s:%d (health: /health)" % (args.host, args.port), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
