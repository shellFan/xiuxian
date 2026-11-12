/**
 * V7.0 restart-recovery check: attach to the relaunched packaged EXE via CDP,
 * read the recovered game state, screenshot, write JSON, exit.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'reports', 'v70');
const PORT = Number(process.env.V70_CDP_PORT || 9225);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = { startedAt: new Date().toISOString(), recovered: false };

async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /127\.0\.0\.1|index\.html/.test(t.url)) || list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) { /* not up yet */ }
    await sleep(1000);
  }
  return null;
}

function connect(page) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let nextId = 0;
    const api = {
      cmd(method, params = {}) {
        return new Promise((res, rej) => {
          const id = ++nextId;
          const t = setTimeout(() => rej(new Error('cdp timeout ' + method)), 15000);
          ws.send(JSON.stringify({ id, method, params }));
          const onMsg = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id === id) { clearTimeout(t); ws.removeEventListener('message', onMsg); res(msg); }
          };
          ws.addEventListener('message', onMsg);
        });
      },
      evaluate(expression) {
        return this.cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => r.result && r.result.result ? r.result.result.value : null);
      },
      close() { try { ws.close(); } catch (_) {} },
    };
    ws.onopen = () => resolve(api);
    ws.onerror = () => reject(new Error('ws error'));
  });
}

(async () => {
  const page = await findPage();
  if (!page) { report.error = 'devtools never came up'; fs.writeFileSync(path.join(OUT, 'v70-exe-restart.json'), JSON.stringify(report, null, 2)); process.exit(1); return; }
  const api = await connect(page);
  await api.cmd('Runtime.enable');
  await api.cmd('Page.enable');
  // wait for boot
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const s = await api.evaluate(`(function(){return {overlay:!!document.getElementById('UiOverlay'), len:(document.body.innerText||'').length};})()`);
    if (s && s.overlay && s.len > 50) { ready = true; break; }
    await sleep(1000);
  }
  report.bootReady = ready;
  if (ready) {
    await sleep(4000);
    // dismiss any modal, then read authoritative state
    await api.evaluate(`(function(){ var m=document.querySelector('[data-vevent-choice="__auto"]')||document.querySelector('#EventOkBtn'); if(m) m.click(); return true; })()`);
    await sleep(2500);
    report.state = await api.evaluate(`(function(){
      var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null;
      var t=function(sel){var e=document.querySelector(sel);return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60):null;};
      return { stage:t('.ux65-stage-num'), enemy:t('.ux65-enemy-name'),
        battle:{stage:v&&v.stage,maxStage:v&&v.maxStage,kills:v&&v.totalKills,speed:v&&v.speedMultiplier,status:v&&v.status},
        home:!!document.querySelector('.ux65-stage'), creation:!!document.querySelector('.v59-creation'),
        domNodes:document.querySelectorAll('*').length };
    })()`);
    const img = await api.cmd('Page.captureScreenshot', { format: 'png' });
    if (img.result && img.result.data) {
      fs.mkdirSync(path.join(OUT, 'screenshots', 'exe'), { recursive: true });
      fs.writeFileSync(path.join(OUT, 'screenshots', 'exe', 'exe-04-restart.png'), Buffer.from(img.result.data, 'base64'));
    }
    report.recovered = !!(report.state && report.state.home && report.state.battle && report.state.battle.stage > 0);
  }
  report.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'v70-exe-restart.json'), JSON.stringify(report, null, 2));
  console.log('[RESTART] recovered=' + report.recovered + ' state=' + JSON.stringify(report.state || report.error || null));
  api.close();
  process.exit(report.recovered ? 0 : 1);
})().catch((e) => {
  report.error = String(e && e.stack || e);
  try { fs.writeFileSync(path.join(OUT, 'v70-exe-restart.json'), JSON.stringify(report, null, 2)); } catch (_) {}
  console.error('[RESTART] FATAL ' + report.error);
  process.exit(1);
});
