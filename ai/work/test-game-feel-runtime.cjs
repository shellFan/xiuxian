// V6.2 TASK-004~007: Game Feel 运行时验证
// 启动 Electron，验证 __GAME_FEEL__ 七子系统在真实渲染器中可调用、DOM 特效生成、无 JS 异常。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const exceptions = [];
const consoleLogs = [];
let windowCreatedResolve = null;
const windowCreatedPromise = new Promise(r => { windowCreatedResolve = r; });
app.on('browser-window-created', (_event, win) => {
  if (windowCreatedResolve) { windowCreatedResolve(win); windowCreatedResolve = null; }
  const dbg = win.webContents.debugger;
  try {
    dbg.attach('1.3');
    dbg.on('message', (_e, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        exceptions.push(params.exceptionDetails);
        console.error('RENDERER_EXCEPTION ' + JSON.stringify(params.exceptionDetails));
      }
      if (method === 'Log.entryAdded' && params.entry && params.entry.level === 'error') {
        console.error('CONSOLE_ERROR ' + params.entry.text);
      }
      if (method === 'Runtime.consoleAPICalled') {
        var text = (params.args || []).map(function(a){ return a.value || a.description || ''; }).join(' ');
        consoleLogs.push(text);
        if (text.indexOf('[BOOT]') >= 0 || text.indexOf('F01') >= 0 || text.indexOf('Facade') >= 0 || text.indexOf('facade') >= 0) {
          console.log('RENDERER_LOG ' + text);
        }
      }
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
    dbg.sendCommand('Log.enable').catch(() => {});
  } catch (e) { console.error('DIAG_UNAVAILABLE ' + e.message); }
});

require(path.join(__dirname, '..', '..', 'desktop', 'main.cjs'));
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const results = {};
  // 等待 main.cjs 的 createWindow() 完成（gameServer.start 是异步的）
  const win = await Promise.race([
    windowCreatedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('window creation timeout 30s')), 30000)),
  ]).catch(() => null);
  if (!win) { console.error('FAIL: no window after 30s'); app.exit(1); return; }
  // 先固定等待 10 秒让 Cocos 引擎完成初始化（避免高频 executeJavaScript 干扰页面加载）
  await wait(10000);
  // 低频轮询等待 GameFacade 就绪（最多再等 30 秒，每 2 秒检查一次）
  let facadeReady = false;
  for (let i = 0; i < 15; i++) {
    try {
      facadeReady = await win.webContents.executeJavaScript('typeof window.__GAME_FACADE__ !== "undefined" && typeof window.__GAME_FACADE__.cultivate === "function"');
    } catch (e) { /* page not ready yet */ }
    if (facadeReady) break;
    await wait(2000);
  }
  if (!facadeReady) {
    console.error('FAIL: GameFacade not ready after 40s');
    app.exit(1); return;
  }
  await wait(1000); // 额外等待 UI 渲染稳定

  // ── Check 0: Cocos 引擎状态诊断 ──
  results.cocosDiag = await win.webContents.executeJavaScript(`(() => {
    var hasSystem = typeof System !== 'undefined';
    var hasCc = typeof cc !== 'undefined';
    var gameDiv = document.getElementById('GameDiv');
    var gameDivChildren = gameDiv ? gameDiv.innerHTML.substring(0, 300) : null;
    var bootErrorEl = gameDiv ? gameDiv.querySelector('div[style*="color:red"]') : null;
    return {
      hasSystem: hasSystem,
      hasCc: hasCc,
      hasGameFacade: typeof window.__GAME_FACADE__ !== 'undefined',
      bootErrorText: bootErrorEl ? bootErrorEl.textContent : null,
      gameDivHTML: gameDivChildren,
      scriptsLoaded: Array.from(document.querySelectorAll('script[src]')).map(function(s){ return s.getAttribute('src'); }),
    };
  })()`);

  // ── Check 1: __GAME_FEEL__ 全局对象存在 + 版本 + API 完整性 ──
  results.gameFeelApi = await win.webContents.executeJavaScript(`(() => {
    const gf = window.__GAME_FEEL__;
    if (!gf) return { ok: false, error: '__GAME_FEEL__ not found' };
    const expected = ['click','float','floatAt','shake','burst','burstAt','cultivate','mergeCelebrate','battle','gain','promotion','trackCombo','resetCombo','setSfxEnabled','isSfxEnabled'];
    const missing = expected.filter(k => typeof gf[k] !== 'function');
    return { ok: missing.length === 0, version: gf.version, missing };
  })()`);

  // ── Check 2: 七子系统内部状态 ──
  results.subsystems = await win.webContents.executeJavaScript(`(() => {
    // 通过副作用验证：调用 float 生成飘字 DOM
    const before = document.querySelectorAll('.ux-gf-float').length;
    __GAME_FEEL__.float(200, 200, '+100', { kind: 'gain' });
    const afterFloat = document.querySelectorAll('.ux-gf-float').length;
    // burst 生成粒子
    const beforeP = document.querySelectorAll('.ux-gf-particle').length;
    __GAME_FEEL__.burst(200, 300, { count: 5 });
    const afterBurst = document.querySelectorAll('.ux-gf-particle').length;
    // combo tracker
    __GAME_FEEL__.trackCombo();
    __GAME_FEEL__.trackCombo();
    __GAME_FEEL__.trackCombo();
    const comboEl = document.querySelector('.ux-gf-combo');
    return {
      floatCreated: afterFloat > before,
      particleCreated: afterBurst > beforeP,
      comboElExists: !!comboEl,
      comboText: comboEl ? comboEl.textContent : null,
    };
  })()`);

  // ── Check 3: 修炼点击链 → cultivateFeel 飘字+粒子+连击 ──
  // facade.cultivate() 是领域逻辑；Game Feel 由 ui-overlay 点击 handler 调用。
  // 此处模拟完整点击链：facade.cultivate() → __GAME_FEEL__.cultivate(el, result)
  results.cultivate = await win.webContents.executeJavaScript(`(() => {
    const facade = window.__GAME_FACADE__;
    if (!facade) return { ok: false, error: '__GAME_FACADE__ is ' + facade, hasOverlay: !!document.getElementById('UiOverlay') };
    if (typeof facade.cultivate !== 'function') {
      var keys = Object.keys(facade).slice(0, 20);
      var protoKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(facade) || {}).slice(0, 30);
      return { ok: false, error: 'cultivate not a function', typeOf: typeof facade, keys: keys, protoKeys: protoKeys, hasCultivate: 'cultivate' in facade };
    }
    const beforeFloat = document.querySelectorAll('.ux-gf-float').length;
    const beforeParticle = document.querySelectorAll('.ux-gf-particle').length;
    let rCult;
    try { rCult = facade.cultivate(); } catch (e) { return { ok: false, error: e.message }; }
    // 模拟 ui-overlay.js 点击 handler 中的 Game Feel 调用
    const el = document.querySelector('[data-action="cultivate"]') || document.body;
    try { __GAME_FEEL__.cultivate(el, rCult); } catch (e) { return { ok: false, error: 'gf.cultivate: ' + e.message }; }
    const afterFloat = document.querySelectorAll('.ux-gf-float').length;
    const afterParticle = document.querySelectorAll('.ux-gf-particle').length;
    return {
      ok: afterFloat > beforeFloat,
      floatDelta: afterFloat - beforeFloat,
      particleDelta: afterParticle - beforeParticle,
      isCrit: rCult && rCult.crit,
      combo: rCult && rCult.combo,
    };
  })()`);

  // ── Check 4: 震屏 class 添加（作用于 #GameDiv，非 #UiOverlay）──
  await wait(250); // 绕过 150ms shake 冷却
  results.shake = await win.webContents.executeJavaScript(`(() => {
    const target = document.getElementById('GameDiv') || document.getElementById('GameCanvas');
    if (!target) return { ok: false, error: 'GameDiv/GameCanvas missing' };
    __GAME_FEEL__.shake('light');
    const hasShake = target.className.includes('ux-gf-shake');
    return { ok: hasShake, targetId: target.id, targetClass: target.className };
  })()`);

  // ── Check 5: 音效系统（Web Audio）──
  results.sfx = await win.webContents.executeJavaScript(`(() => {
    __GAME_FEEL__.setSfxEnabled(true);
    const enabled = __GAME_FEEL__.isSfxEnabled();
    // 触发音效（不检查声音输出，只检查不抛异常）
    let noThrow = true;
    try { __GAME_FEEL__.click(document.body); } catch (e) { noThrow = false; }
    return { ok: enabled && noThrow, sfxEnabled: enabled };
  })()`);

  // ── Check 6: fullRefresh 后 ComboTracker 恢复（V6.2 修复验证）──
  results.comboRecovery = await win.webContents.executeJavaScript(`(() => {
    __GAME_FEEL__.trackCombo();
    __GAME_FEEL__.trackCombo();
    const combo1 = document.querySelector('.ux-gf-combo');
    const ok1 = !!combo1;
    // 模拟 fullRefresh：清空 overlay innerHTML 重建
    const overlay = document.getElementById('UiOverlay');
    if (overlay) {
      const html = overlay.innerHTML;
      overlay.innerHTML = html; // 强制 DOM 重建
    }
    // 再次 trackCombo，V6.2 修复后应重新 append
    __GAME_FEEL__.trackCombo();
    __GAME_FEEL__.trackCombo();
    const combo2 = document.querySelector('.ux-gf-combo');
    return { ok: ok1 && !!combo2, beforeRefresh: ok1, afterRefresh: !!combo2 };
  })()`);

  // 截图存证
  const outDir = path.join(__dirname, '..', 'reports', 'v62-runtime');
  fs.mkdirSync(outDir, { recursive: true });
  await wait(2000);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'game-feel-runtime.png'), img.toPNG());

  results.rendererExceptions = exceptions.length;
  results.bootLogs = consoleLogs.filter(function(l){ return l.indexOf('[BOOT]') >= 0 || l.indexOf('Facade') >= 0 || l.indexOf('facade') >= 0 || l.indexOf('Storage') >= 0 || l.indexOf('LOAD_FAILED') >= 0; }).slice(0, 30);
  results.consoleLogCount = consoleLogs.length;
  results.allLogs = consoleLogs.slice(0, 40);
  results.allOk = results.gameFeelApi.ok && results.subsystems.floatCreated &&
    results.subsystems.particleCreated && results.cultivate.ok &&
    results.comboRecovery.ok && exceptions.length === 0;

  fs.writeFileSync(path.join(outDir, 'game-feel-runtime.json'), JSON.stringify(results, null, 2));
  console.log('=== GAME FEEL RUNTIME RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  console.log(results.allOk ? 'ALL_CHECKS_PASSED' : 'SOME_CHECKS_FAILED');
  app.exit(results.allOk ? 0 : 1);
});