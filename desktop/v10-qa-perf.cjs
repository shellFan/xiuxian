/**
 * V10.0 独立 QA：打包 EXE 性能 soak（5 分钟，CDP 采样）。
 * 用法: node desktop/v10-qa-perf.cjs
 * 前置: EXE 已由 tmp/v10qa-exe-run.ps1 启动（CDP 端口 9226）。
 * 采样: 每 10s — JSHeapUsedMB / rAF FPS(1s 计数) / document.hidden；
 * 监听: console error / exception。
 * 输出: evidence/qa-perf.json
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PORT = Number(process.env.V10QA_EXE_PORT || 9226);
const MINUTES = Number(process.env.V10QA_PERF_MIN || 5);
const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'evidence');
const SHOT = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logf = (m) => { try { fs.appendFileSync(path.join(OUT, 'qa-perf.log'), new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /127\.0\.0\.1|index\.html/.test(t.url)) || list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) {}
    await sleep(1000);
  }
  throw new Error('DevTools endpoint never became available');
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 20000);
  });
}

(async () => {
  const page = await findPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const consoleErrors = [];
  const exceptions = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p.resolve(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(String((m.params.args || []).map((a) => a.value || a.description || '').join(' ')).slice(0, 200));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(m.params.exceptionDetails && (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text)).slice(0, 200));
    }
  };
  const evalJs = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.value;
  };
  await send(ws, 'Runtime.enable', {});
  await send(ws, 'Page.enable', {});
  await send(ws, 'Emulation.setCPUThrottlingRate', { rate: 1 });

  logf('attached; sampling ' + MINUTES + 'min');
  const samples = [];
  const deadline = Date.now() + MINUTES * 60 * 1000;
  while (Date.now() < deadline) {
    const fps = await evalJs(`new Promise(function(res){ var n=0; var t0=performance.now(); function f(){ n++; if(performance.now()-t0<1000) requestAnimationFrame(f); else res(n); } requestAnimationFrame(f); })`);
    const heap = await evalJs(`(function(){ try { return performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576*10)/10 : null; } catch(e){ return null; } })()`);
    const state = await evalJs(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return { hidden: document.hidden, stage: ab?ab.stage:null, status: ab?ab.status:null }; })()`);
    samples.push({ t: new Date().toISOString().slice(11, 19), fps: fps, heapMB: heap, stage: state && state.stage, status: state && state.status });
    logf('sample fps=' + fps + ' heap=' + heap + 'MB stage=' + (state && state.stage));
    await sleep(10000);
  }
  const fpsVals = samples.map((s) => s.fps).filter((v) => typeof v === 'number' && v > 0);
  const heapVals = samples.map((s) => s.heapMB).filter((v) => typeof v === 'number');
  const result = {
    startedAt: new Date().toISOString(), minutes: MINUTES, samples: samples,
    summary: {
      sampleCount: samples.length,
      fpsMin: Math.min.apply(null, fpsVals), fpsAvg: Math.round(fpsVals.reduce((a, b) => a + b, 0) / Math.max(1, fpsVals.length) * 10) / 10,
      heapMinMB: Math.min.apply(null, heapVals), heapMaxMB: Math.max.apply(null, heapVals),
      heapGrowMB: heapVals.length >= 2 ? Math.round((heapVals[heapVals.length - 1] - heapVals[0]) * 10) / 10 : null,
      consoleErrors: consoleErrors.length, exceptions: exceptions.length,
      consoleErrorList: consoleErrors.slice(0, 10), exceptionList: exceptions.slice(0, 10),
    },
  };
  result.summary.verdict = (result.summary.fpsMin >= 30 && exceptions.length === 0 && consoleErrors.length <= 3) ? 'PASS' : 'REVIEW';
  fs.writeFileSync(path.join(OUT, 'qa-perf.json'), JSON.stringify(result, null, 2));
  logf('SUMMARY=' + JSON.stringify(result.summary));
  process.exit(0);
})().catch((e) => { logf('FATAL ' + (e && e.stack || e)); process.exit(1); });
