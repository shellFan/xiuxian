// Capture the real desktop runtime for the scheme-B home (§166/§167).
// Boots the actual Electron app, drives the DOM overlay, saves PNGs to
// ai/reports/screenshots/ui-b/ and asserts the 1280×720 no-scroll contract.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'screenshots', 'ui-b');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function dismissPopups(win) {
  let lastTitle = '';
  for (let i = 0; i < 40; i++) {
    const has = await win.webContents.executeJavaScript(
      `document.querySelector('#PopupLayer .ux-modal-layer') !== null`,
    );
    if (!has) return true;
    lastTitle = await win.webContents.executeJavaScript(`(function () {
      var layer = document.querySelector('#PopupLayer');
      var modal = layer && layer.querySelector('.ux-modal-layer');
      var t = modal && (modal.querySelector('.ux-header-title') || modal.querySelector('.ux-dialog-title'));
      return t ? t.textContent : '(no title)';
    })()`);
    await win.webContents.executeJavaScript(`(function () {
      var layer = document.querySelector('#PopupLayer');
      var btn = layer.querySelector('.ux-welcome-continue') ||
                layer.querySelector('[data-offline-decision-action]') ||
                layer.querySelector('#BattleDoneOk') || layer.querySelector('#SettleOk') ||
                layer.querySelector('#V2EventOk') || layer.querySelector('#DefenseOk') ||
                layer.querySelector('.ux-event-option') ||
                layer.querySelector('.ux-dialog-actions .ux-btn') ||
                layer.querySelector('.ux-close');
      if (btn) btn.click(); else if (layer) layer.innerHTML = '';
    })()`);
    await wait(800);
  }
  console.error('POPUP_STILL_OPEN after dismiss loop, last title: ' + lastTitle);
  return false;
}

async function shot(win, name) {
  await wait(600);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  console.log('CAPTURED ' + name);
}

app.on('browser-window-created', (_e, win) => {
  const dbg = win.webContents.debugger;
  try {
    dbg.attach('1.3');
    dbg.on('message', (_ev, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        console.error('RENDERER_EXCEPTION ' + JSON.stringify(params.exceptionDetails));
      }
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
  } catch (e) { console.error('DIAGNOSTICS_UNAVAILABLE ' + e.message); }
});

require('./main.cjs');
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { shots: [], checks: {} };
  try {
    let win = null;
    for (let i = 0; i < 60 && !win; i++) {
      win = BrowserWindow.getAllWindows()[0] || null;
      if (!win) await wait(500);
    }
    if (!win) throw new Error('no desktop window');
    // 等 Cocos boot + facade 就绪（最长 60s），避免拍到 DEMO 数据
    let ready = false;
    for (let i = 0; i < 120; i++) {
      ready = await win.webContents.executeJavaScript(
        `!!(window.__GAME_FACADE__ && window.__GAME_FACADE__.snapshot && window.__GAME_FACADE__.queryWorkToday)`,
      ).catch(() => false);
      if (ready) break;
      await wait(500);
    }
    if (!ready) throw new Error('facade not ready within 60s');
    console.log('FACADE_READY after wait');
    win.setMinimumSize(900, 600);
    win.setContentSize(1280, 720);
    await wait(3000);
    // 回到工作日上午，保证截图呈现标准工作日场景（§108：不鼓励无脑加班）
    // devOffset 会随多次 DEV 跳时在存档中累积，先清零再跳，避免日期漂移。
    await win.webContents.executeJavaScript(`(function () {
      var f = window.__GAME_FACADE__;
      try {
        if (f && f.context && f.context.clockV2 && f.context.clockV2.setDevOffsetMs) f.context.clockV2.setDevOffsetMs(0);
      } catch (e) { console.error('OFFSET_RESET_FAIL ' + e.message); }
      if (f && f.devJumpToHour) f.devJumpToHour(9, 5);
      if (window.UiOverlay) window.UiOverlay.refresh();
    })()`);
    await wait(1500);
    await dismissPopups(win);
    await win.webContents.executeJavaScript(`window.UiOverlay && window.UiOverlay.refresh()`);

    // 1280 默认（努力工作）
    report.checks.home1280 = await win.webContents.executeJavaScript(`(function () {
      var body = document.querySelector('#UiBody');
      return {
        fits: body.scrollHeight <= body.clientHeight,
        metrics: [body.scrollHeight, body.clientHeight],
        detail: document.querySelector('.ux-detail') ? document.querySelector('.ux-detail').getAttribute('data-detail-type') : null
      };
    })()`);
    await shot(win, 'home-1280-default');

    // 四个动作详情
    for (const [name, action] of [['work', 'WORK'], ['fishing', 'FISHING'], ['cultivate', 'CULTIVATING'], ['social', 'SOCIAL']]) {
      await win.webContents.executeJavaScript(`document.querySelector('[data-select-action="${action}"]').click()`);
      await shot(win, 'home-1280-' + name);
    }

    // 修炼一次：真实调用（冷却允许时）
    await win.webContents.executeJavaScript(`(function () {
      var btn = document.querySelector('.ux-detail-side [data-action="cultivate"]');
      if (btn && !btn.disabled) btn.click();
    })()`);
    await shot(win, 'home-1280-cultivate-result');

    // 17:55 加班询问：跳到当天 17:55，主动触发老板询问 → OFFERED
    await win.webContents.executeJavaScript(`(function () {
      var f = window.__GAME_FACADE__;
      if (f && f.devJumpToHour) f.devJumpToHour(17, 55);
      if (window.UiOverlay) window.UiOverlay.refresh();
    })()`);
    await wait(1500);
    console.log('CLOCK_BEFORE_OFFER ' + await win.webContents.executeJavaScript(
      `JSON.stringify(window.__GAME_FACADE__.queryGameClock())`));
    await win.webContents.executeJavaScript(`(function () {
      var f = window.__GAME_FACADE__;
      try {
        if (f && f.offerOvertime) f.offerOvertime('REQUESTED', true, 2 * 3600);
      } catch (e) { console.error('OFFER_FAIL ' + e.message); }
      if (window.UiOverlay) window.UiOverlay.refresh();
    })()`);
    await wait(1500);
    console.log('OT_STATE ' + await win.webContents.executeJavaScript(
      `JSON.stringify(window.__GAME_FACADE__.queryOvertime())`));
    await dismissPopups(win);
    await shot(win, 'home-1280-1755');

    // 18:00 下班结算
    await win.webContents.executeJavaScript(`(function () {
      var f = window.__GAME_FACADE__;
      if (f && f.devJumpToHour) f.devJumpToHour(18, 0);
      if (window.UiOverlay) window.UiOverlay.refresh();
    })()`);
    await wait(900);
    await shot(win, 'home-1280-overtime');
    await dismissPopups(win);

    // 1600 / 1920
    win.setContentSize(1600, 900);
    await wait(1200);
    await shot(win, 'home-1600');
    win.setContentSize(1920, 1080);
    await wait(1200);
    await shot(win, 'home-1920');

    // 回到 1280 复核
    win.setContentSize(1280, 720);
    await wait(1000);
    report.checks.home1280Recheck = await win.webContents.executeJavaScript(`(function () {
      var body = document.querySelector('#UiBody');
      return { fits: body.scrollHeight <= body.clientHeight, metrics: [body.scrollHeight, body.clientHeight] };
    })()`);

    fs.writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2));
    console.log('UI_B_CAPTURE_COMPLETE ' + OUT);
    app.exit(0);
  } catch (error) {
    console.error('CAPTURE_FAILED', error);
    try { fs.writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2)); } catch { /* noop */ }
    app.exit(1);
  }
}).catch((error) => { console.error(error); app.exit(1); });
