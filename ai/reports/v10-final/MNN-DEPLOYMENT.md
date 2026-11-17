# V10.0 FINAL — MNN-Pocket-0.3B 部署报告

## 核验结论（官方来源）

| 项目 | 结果 |
|---|---|
| 模型仓库 | HuggingFace `taobao-mnn/MNN-Pocket-0.3B-MNN`（MNN INT4 部署格式）与 `taobao-mnn/MNN-Pocket-0.3B`（原始权重） |
| 许可证 | Apache-2.0（LICENSE.txt 实测下载核对，与 alibaba/MNN 同 SHA） |
| 部署包大小 | llm.mnn.weight 171,481,330B + llm.mnn 953,112B + tokenizer.mtok 1,710,861B ≈ **174MB**（与"约173MB"资料一致） |
| 上下文/速度 | 32K 上下文与 iPhone 350 tok/s 为官方宣传口径，**未在 Windows 复现速度**（本机实测见下） |
| Windows 推理路径 | **PyPI 官方 wheel `MNN==3.6.2`（cp312-win_amd64）+ MNN.llm Python API**；GitHub releases 的 windows zip 仅为 include/lib 开发包，无可执行 LLM 工具 |

## 本机部署（真实安装 + 校验 + 推理）

- 安装目录：`%LOCALAPPDATA%\xiuxian-mnn`（venv + model 独立目录，**不入游戏安装包**）。
- SHA-256 校验（安装脚本内固化）：三个模型文件全部与 HuggingFace LFS oid 一致：
  - llm.mnn.weight `c9e0f2950718…248d` ✓
  - llm.mnn `d42a7d9c7152…1d7c` ✓
  - tokenizer.mtok `9f806cad88e8…4440` ✓
- 运行时：`MNN.llm.create(config.json).load()` CPU 4 线程加载成功。

## 交付脚本（scripts/mnn/）

| 脚本 | 功能 |
|---|---|
| install-mnn.ps1 | venv + pip MNN==3.6.2 + 模型下载（hf-mirror 主 / huggingface 备）+ SHA-256 校验 |
| start-mnn.ps1 | 启动 OpenAI 兼容服务（127.0.0.1:7860），PID 文件 + 日志 + /health 等待就绪（幂等） |
| stop-mnn.ps1 | 按 PID 文件停止（幂等） |
| health-check.ps1 | /health 探针 + 可选真实推理探针（MNN_HEALTH_FULL=1） |
| mnn-serve.py | Python HTTP 服务：/health、/v1/chat/completions（OpenAI 兼容非流式）；单并发锁（503 busy）；输出上限 |

## 真实推理实测（Windows CPU）

```
POST /v1/chat/completions  system="你是修仙游戏NPC掌门清虚道人…" user="如何提升修为？"
→ {"content":"修为清虚道人，行善积德，悟道自成。","elapsed_ms":642}   # 48 tokens ≈ 75 tok/s
health-check.ps1 (FULL=1) → probe OK 267ms
```

- **REAL_MNN = PASS**（Windows 真实推理，非 mock）。
- 游戏内 E2E：飞剑传书→掌门→发送消息→回复气泡显示 `MNN-0.3B` 模式徽章 +
  模型生成的中文回复（截图 `desktop/16b-npc-chat-reply.png`）。
- iPhone 350 tok/s 未复现亦未采信：Windows CPU 实测约 75 tok/s，满足 NPC 对话时延（<1s）。

## 与游戏桥接（ai-bridge.cjs）

- `MNN_CHAT_URL`（默认 127.0.0.1:7860）→ /v1/chat/completions；失败自动降级规则引擎。
- 修复重复历史缺陷：push 前快照历史，用户消息在模型侧恰好出现一次（mock 端点回归测试验证）。
- 并发防护：同 NPC 在途请求未结束直接走规则引擎（不排队、不阻塞战斗循环）。
- Prompt 注入面：仅产出文本；输入清洗（控制字符/长度上限）；模型无任何游戏状态修改通道。
