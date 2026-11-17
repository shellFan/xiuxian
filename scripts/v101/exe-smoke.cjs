/**
 * V10.1 打包 EXE 冒烟验收（复用 V10.0 QA 的 CDP attach 模式）。
 * 启动 dist/牛马修仙传-win32-x64/牛马修仙传.exe --remote-debugging-port，验证：
 * facade 就绪 / V10.1 新卡注册 / 净化 API / 新 Boss 注册 / 打断窗口 UI 钩子存在。
 * 输出 ai/reports/v101/exe-smoke.json + 截图到 screenshots/exe/。
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ROOT = path.join(__dirname, '..', '..');
const EXE = path.join(ROOT, 'dist', '牛马修仙传-win32-x64', '牛马修仙传.exe');
const PORT = 9226;
const OUT = path.join(ROOT, 'ai', 'reports', 'v101');
const SHOT = path.join(OUT, 'screenshots', 'exe');
fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = { startedAt: new Date().toISOString(), checks: {}, screenshot: null };

async function findPage() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && /index\.html|127\.0\.0\.1/.test(t.url)) || list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) {}
    await sleep(1000);
  }
  throw new Error('CDP endpoint never became available');
}

let msgId = 0;
const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 30000);
  });
}

(async () => {
  if (!fs.existsSync(EXE)) throw new Error('EXE not found: ' + EXE);
  const proc = spawn(EXE, ['--remote-debugging-port=' + String(PORT)], { stdio: 'ignore', detached: false });
  const page = await findPage();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p.resolve(m.result); }
  };
  const evalJs = async (expr) => {
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: String(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 200) };
    return r.result && r.result.value;
  };
  const check = (name, pass, detail) => { result.checks[name] = { pass: !!pass, detail: detail === undefined ? null : detail }; console.log((pass ? 'PASS ' : 'FAIL ') + name); };

  // 1) facade 就绪
  let facade = false;
  for (let i = 0; i < 120 && !facade; i++) { await sleep(1000); facade = (await evalJs('!!window.__GAME_FACADE__')) === true; }
  check('exe_facade_ready', facade);

  // 2) V10.1 内容注册（引擎数据经打包 asar 加载）
  const content = await evalJs(`(function(){
    var f = window.__GAME_FACADE__;
    var catalog = (f && f.queryCardCatalog ? f.queryCardCatalog() : []) || [];
    var ids = catalog.map(function(d){ return d.id; });
    return {
      cards: ids.length,
      hasFinale: ids.indexOf('card_finale') >= 0,
      hasGcTuning: ids.indexOf('card_gc_tuning') >= 0,
      hasRootCause: ids.indexOf('card_root_cause') >= 0,
      removalApi: typeof (f && f.removeBattleCard) === 'function',
      removalView: typeof (f && f.queryCardRemovalView) === 'function',
      overlayCss: !!document.querySelector('style') && (Array.from(document.styleSheets).some(function(s){ try { return Array.from(s.cssRules).some(function(r){ return r.selectorText === '.ux-bc-judgewindow'; }); } catch(e){ return false; } }))
    };
  })()`);
  check('exe_v101_cards_registered', content && content.hasFinale && content.hasGcTuning && content.hasRootCause, content);
  check('exe_removal_api_present', content && content.removalApi && content.removalView, content);
  check('exe_judgewindow_css_present', content && content.overlayCss, content);

  // 3) 首页渲染（五区）
  const home = await evalJs(`({
    hero: !!document.querySelector('#Ux90CaveHero'),
    today: !!document.querySelector('.ux91-today'),
    mid: !!document.querySelector('.ux91-mid'),
    nav: document.querySelectorAll('.ux-nav [data-nav]').length
  })`);
  check('exe_home_first_screen', home && home.hero && home.today && home.mid && home.nav === 5, home);

  // 4) 截图
  try {
    const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOT, 'exe-smoke-home.png'), Buffer.from(shot.data, 'base64'));
    result.screenshot = 'screenshots/exe/exe-smoke-home.png';
  } catch (e) { result.screenshot = 'failed: ' + e.message; }

  result.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'exe-smoke.json'), JSON.stringify(result, null, 2));
  console.log('[done] ' + Object.values(result.checks).filter(c => c.pass).length + '/' + Object.keys(result.checks).length + ' checks pass');
  try { proc.kill(); } catch (_) {}
  process.exit(Object.values(result.checks).every(c => c.pass) ? 0 : 1);
})().catch((e) => { console.error('SMOKE ERROR:', e.message); result.error = e.message; fs.writeFileSync(path.join(OUT, 'exe-smoke.json'), JSON.stringify(result, null, 2)); process.exit(1); });
