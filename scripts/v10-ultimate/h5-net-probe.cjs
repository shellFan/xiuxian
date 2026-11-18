'use strict';
/** 诊断探针 v3：CDP Network 域抓完整请求时间线（含挂起请求）。 */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const runner = require('D:/git/fan/xiuxian/scripts/v10-final/cdp-runner.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const port = 29600 + Math.floor(Math.random() * 1000);
  const profileDir = path.join(os.tmpdir(), `xiuxian-netprobe-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: 'http://127.0.0.1:8633/', port, profileDir });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  const cdp = new runner.CdpClient(port, 20000, { record() {} });
  await sleep(5000);
  await cdp.connect();
  await cdp.command('Network.enable');
  const events = [];
  // 在既有 onmessage 之前插入 Network 事件分流（保留 command 泵与原逻辑）
  const pending = cdp.pending;
  const origOnMessage = cdp.ws.onmessage;
  cdp.ws.onmessage = (event) => {
    let m; try { m = JSON.parse(event.data); } catch (_) { if (origOnMessage) return origOnMessage(event); return; }
    if (m.id !== undefined && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
      if (m.error) p.reject(new Error(`${m.error.code || ''} ${m.error.message || 'CDP error'}`)); else p.resolve(m.result || {});
      return;
    }
    const meth = m.method || '';
    if (meth.startsWith('Network.')) {
      const p = m.params || {};
      const reqId = p.requestId;
      if (meth === 'Network.requestWillBeSent') events.push({ id: reqId, ev: 'REQ', url: (p.request && p.request.url || '').replace('http://127.0.0.1:8633/', ''), at: p.timestamp });
      else if (meth === 'Network.responseReceived') events.push({ id: reqId, ev: 'RESP', status: p.response && p.response.status });
      else if (meth === 'Network.loadingFailed') events.push({ id: reqId, ev: 'FAIL', errorText: p.errorText, canceled: p.canceled });
      else if (meth === 'Network.loadingFinished') events.push({ id: reqId, ev: 'DONE' });
    } else if (origOnMessage) {
      // 交给原处理（console 捕获等）
      try { origOnMessage(event); } catch (_) {}
    }
  };
  await cdp.command('Page.enable');
  await cdp.command('Page.reload', { ignoreCache: true });
  await sleep(25000);
  // 汇总：每个 id 的最终状态
  const byId = new Map();
  for (const e of events) {
    const cur = byId.get(e.id) || { url: e.url || '', evs: [] };
    if (e.url) cur.url = e.url;
    cur.evs.push(e.ev + (e.status ? ':' + e.status : '') + (e.errorText ? ':' + e.errorText : ''));
    byId.set(e.id, cur);
  }
  const unfinished = [...byId.entries()].filter(([_, v]) => !v.evs.some(x => x.startsWith('DONE') || x.startsWith('RESP')));
  console.log('total requests:', byId.size, 'unfinished (never DONE/RESP):');
  for (const [id, v] of unfinished.slice(0, 20)) console.log('  STALLED:', v.url, JSON.stringify(v.evs));
  console.log('--- tail of timeline (last 25 events) ---');
  for (const e of events.slice(-25)) console.log(' ', e.ev, e.url || e.id, e.status || e.errorText || '');
  cdp.close();
  try { child.kill(); } catch (_) {}
  process.exit(0);
})().catch(e => { console.error('FATAL', e && e.stack || e); process.exit(1); });
