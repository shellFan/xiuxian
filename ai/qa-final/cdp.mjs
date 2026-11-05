// ai/qa-final/cdp.mjs — minimal CDP driver for the packaged EXE (independent QA evidence).
// Provides: launch, connect, evaluate, console capture, screenshots, graceful/force close.
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { WsClient } from './ws.mjs';

export const QA = {
  root: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..'),
  exe: path.join('D:', 'git', 'fan', 'xiuxian-gv2', 'dist', '牛马修仙传-win32-x64', '牛马修仙传.exe'),
  saveDir: process.env.XIUXIAN_USER_DATA ? path.join(process.env.XIUXIAN_USER_DATA, 'xiuxian-save') : path.join(os.homedir(), 'AppData', 'Roaming', 'xiuxian-desktop', 'xiuxian-save'),
  evidenceDir: path.join('D:', 'git', 'fan', 'xiuxian-gv2', 'ai', 'qa-final', 'evidence'),
  shotsDir: path.join('D:', 'git', 'fan', 'xiuxian-gv2', 'ai', 'qa-final', 'shots'),
  debugPort: 9333,
  isolatedUserData: null, // 由测试脚本设置（隔离存档目录）
};

export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
export function sha256Buf(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function exeSha() {
  const exeSha = sha256(QA.exe);
  const asar = path.join(path.dirname(QA.exe), 'resources', 'app.asar');
  return { exeSha, asarSha: sha256(asar) };
}

export function killLeftovers() {
  try {
    execSync(`powershell -NoProfile -Command "Get-Process | Where-Object { try { $_.Path -like '*xiuxian*dist*' } catch { $false } } | Stop-Process -Force"`, { stdio: 'ignore' });
  } catch { /* none */ }
  return sleep(1500);
}

export function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

/** Graceful close by PID (WM_CLOSE), escalate to force. Returns {graceful, exitCode}. */
export async function closeExe(child) {
  try { execSync(`taskkill /PID ${child.pid}`, { stdio: 'ignore' }); } catch { /* may already be gone */ }
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    if (!alive(child.pid)) return { graceful: true };
  }
  try { execSync(`taskkill /PID ${child.pid} /F`, { stdio: 'ignore' }); } catch {}
  await sleep(1500);
  return { graceful: !alive(child.pid) };
}

export function readSaveFile(name = 'save.json') {
  const p = path.join(QA.saveDir, name);
  if (!fs.existsSync(p)) return null;
  return { path: p, bytes: fs.readFileSync(p), sha: sha256(p), mtime: fs.statSync(p).mtimeMs };
}
export function writeSaveFile(content, name = 'save.json') {
  fs.mkdirSync(QA.saveDir, { recursive: true });
  const p = path.join(QA.saveDir, name);
  fs.writeFileSync(p, content);
  return readSaveFile(name);
}
export function removeSaveFiles() {
  for (const f of ['save.json', 'save.backup.json', 'save.tmp.json']) {
    try { fs.rmSync(path.join(QA.saveDir, f), { force: true }); } catch {}
  }
}

/** Launch the real packaged EXE with a CDP debug port. Resolves once the page target exists. */
export async function launchExe({ logFile } = {}) {
  killLeftovers();
  const logStream = logFile ? fs.openSync(logFile, 'a') : null;
  const child = spawn(QA.exe, ['--enable-logging', `--remote-debugging-port=${QA.debugPort}`], {
    // V5.9-O.2 §47：XIUXIAN_USER_DATA 隔离（main.cjs initStorage 优先读它）。
    env: { ...process.env, ...(QA.isolatedUserData ? { XIUXIAN_USER_DATA: QA.isolatedUserData } : {}) },
    stdio: logStream ? ['ignore', logStream, logStream] : 'ignore',
  });
  // Wait for the CDP HTTP endpoint + page target
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const targets = await listTargets();
      const page = targets.find((t) => t.type === 'page' && /index\.html/.test(t.url));
      if (page) return { child, page };
    } catch { /* not up yet */ }
  }
  throw new Error('CDP page target not found within 45s');
}

export function listTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${QA.debugPort}/json`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

/** CDP session over our raw WS client. */
export class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.console = []; this.ws.onmessage = (t) => this._onmsg(t); }
  static async connect(port = QA.debugPort) {
    const targets = await listTargets();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    const ws = await WsClient.connect(page.webSocketDebuggerUrl);
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable').catch(() => {});
    cdp.ws.onclose = () => { cdp.closed = true; };
    return cdp;
  }
  _onmsg(text) {
    const msg = JSON.parse(text);
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message + ' ' + (msg.error.data ?? '')));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const entry = {
        type: msg.params.type,
        ts: msg.params.timestamp,
        text: msg.params.args.map((a) => a.value !== undefined ? String(a.value) : (a.description ?? a.type)).join(' '),
      };
      this.console.push(entry);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.console.push({ type: 'EXCEPTION', ts: Date.now(), text: (d.exception?.description ?? d.text ?? 'exception').slice(0, 500) });
    }
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 30000);
    });
  }
  /** Evaluate an expression; returns the JSON value (remote object desc on failure). */
  async eval(expr) {
    let r;
    try {
      r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    } catch (e) {
      // V5.9-O.2 诊断：协议层报错时携带表达式片段，便于定位触发源。
      throw new Error(`eval protocol error [${String(expr).slice(0, 100)}]: ${String(e).slice(0, 120)}`);
    }
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }
  async screenshot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(QA.shotsDir, name.endsWith('.png') ? name : name + '.png');
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return { file, sha: sha256(file) };
  }
  consoleSince(index) { return this.console.slice(index); }
  get consoleCount() { return this.console.length; }
  close() { this.ws.close(); }
}

/** Install a pre-document script that runs BEFORE the page bundle (survives reloads). */
export async function addInitScript(cdp, source) {
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
}
