// V6.2 TASK-008~014: 合成/战斗/晋升特效运行时验证
// 验证 mergeCelebrate / battleFeel / gainFeel / promotionFeel 在真实渲染器中产生 DOM 特效。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const exceptions = [];
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
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
  } catch (e) { console.error('DIAG_UNAVAILABLE ' + e.message); }
});

require(path.join(__dirname, '..', '..', 'desktop', 'main.cjs'));
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const results = {};
  const win = await Promise.race([
    windowCreatedPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
  ]).catch(() => null);
  if (!win) { console.error('FAIL: no window'); app.exit(1); return; }

  // 固定等待 10 秒让 Cocos 引擎完成初始化
  await wait(10000);
  // 低频轮询等待 GameFacade 就绪
  let facadeReady = false;
  for (let i = 0; i < 15; i++) {
    try {
      facadeReady = await win.webContents.executeJavaScript('typeof window.__GAME_FACADE__ !== "undefined"');
    } catch (e) {}
    if (facadeReady) break;
    await wait(2000);
  }
  if (!facadeReady) { console.error('FAIL: facade not ready'); app.exit(1); return; }
  await wait(1000);

  // ── Check 1: mergeCelebrate 普通合成 ──
  results.mergeNormal = await win.webContents.executeJavaScript(`(() => {
    var gf = window.__GAME_FEEL__;
    var beforeCelebrate = document.querySelectorAll('.ux-gf-celebrate').length;
    var beforeParticle = document.querySelectorAll('.ux-gf-particle').length;
    gf.mergeCelebrate({ level: 2, salaryReward: 100, cultivationReward: 50, tierName: '测试阶', tierEmoji: '✨' });
    var afterCelebrate = document.querySelectorAll('.ux-gf-celebrate').length;
    var afterParticle = document.querySelectorAll('.ux-gf-particle').length;
    var celebrateEl = document.querySelector('.ux-gf-celebrate');
    return {
      ok: afterCelebrate > beforeCelebrate && afterParticle > beforeParticle,
      celebrateDelta: afterCelebrate - beforeCelebrate,
      particleDelta: afterParticle - beforeParticle,
      celebrateHTML: celebrateEl ? celebrateEl.innerHTML.substring(0, 150) : null,
    };
  })()`);

  // ── Check 2: mergeCelebrate 新最高等级（heavy shake + is-max class）──
  await wait(2000); // 等待庆祝层移除
  results.mergeMax = await win.webContents.executeJavaScript(`(() => {
    var gf = window.__GAME_FEEL__;
    var beforeCelebrate = document.querySelectorAll('.ux-gf-celebrate').length;
    gf.mergeCelebrate({ level: 5, isNewMax: true, salaryReward: 500, cultivationReward: 200, tierName: '最高阶', tierEmoji: '👑' });
    var celebrateEl = document.querySelector('.ux-gf-celebrate');
    var gameDiv = document.getElementById('GameDiv');
    return {
      ok: !!celebrateEl && celebrateEl.className.includes('is-max'),
      hasMaxClass: celebrateEl ? celebrateEl.className.includes('is-max') : false,
      hasHeavyShake: gameDiv ? gameDiv.className.includes('ux-gf-shake-heavy') : false,
    };
  })()`);

  // ── Check 3: battleFeel hit（伤害飘字 + flash + shake）──
  await wait(2000);
  results.battleHit = await win.webContents.executeJavaScript(`(() => {
    var gf = window.__GAME_FEEL__;
    var target = document.createElement('div');
    target.id = 'test-battle-target';
    document.body.appendChild(target);
    var beforeFloat = document.querySelectorAll('.ux-gf-float.is-damage').length;
    gf.battle('hit', { value: 42, targetEl: target });
    var afterFloat = document.querySelectorAll('.ux-gf-float.is-damage').length;
    var hasFlash = target.className.includes('ux-gf-flash');
    var gameDiv = document.getElementById('GameDiv');
    return {
      ok: afterFloat > beforeFloat && hasFlash,
      floatDelta: afterFloat - beforeFloat,
      hasFlash: hasFlash,
      hasShake: gameDiv ? gameDiv.className.includes('ux-gf-shake') : false,
    };
  })()`);

  // ── Check 4: battleFeel victory（3波粒子 + victory音效）──
  // victory 粒子通过 setTimeout 延迟创建（0/200/400ms），需异步等待后检查
  await wait(500); // 绕过 shake 冷却
  results.battleVictory = await win.webContents.executeJavaScript(`new Promise(function(resolve) {
    var gf = window.__GAME_FEEL__;
    var beforeParticle = document.querySelectorAll('.ux-gf-particle').length;
    gf.battle('victory', {});
    setTimeout(function() {
      var afterParticle = document.querySelectorAll('.ux-gf-particle').length;
      resolve({ ok: afterParticle > beforeParticle, particleDelta: afterParticle - beforeParticle });
    }, 600);
  })`);

  // ── Check 5: gainFeel（资源飘字 + 可选粒子）──
  await wait(1000);
  results.gain = await win.webContents.executeJavaScript(`(() => {
    var gf = window.__GAME_FEEL__;
    var el = document.createElement('div');
    document.body.appendChild(el);
    var beforeFloat = document.querySelectorAll('.ux-gf-float').length;
    var beforeParticle = document.querySelectorAll('.ux-gf-particle').length;
    gf.gain(el, '+¥1000 工资', { burst: 6, sfx: 'reward' });
    var afterFloat = document.querySelectorAll('.ux-gf-float').length;
    var afterParticle = document.querySelectorAll('.ux-gf-particle').length;
    return {
      ok: afterFloat > beforeFloat && afterParticle > beforeParticle,
      floatDelta: afterFloat - beforeFloat,
      particleDelta: afterParticle - beforeParticle,
    };
  })()`);

  // ── Check 6: promotionFeel（晋升横幅 + 4波粒子 + heavy shake）──
  // promotion 粒子通过 setTimeout 延迟创建（0/150/300/450ms），需异步等待后检查
  await wait(1000);
  results.promotion = await win.webContents.executeJavaScript(`new Promise(function(resolve) {
    var gf = window.__GAME_FEEL__;
    var beforeBanner = document.querySelectorAll('.ux-gf-promo-banner').length;
    var beforeParticle = document.querySelectorAll('.ux-gf-particle').length;
    gf.promotion();
    var afterBanner = document.querySelectorAll('.ux-gf-promo-banner').length;
    var gameDiv = document.getElementById('GameDiv');
    var hasHeavyShake = gameDiv ? gameDiv.className.includes('ux-gf-shake-heavy') : false;
    setTimeout(function() {
      var afterParticle = document.querySelectorAll('.ux-gf-particle').length;
      var banner = document.querySelector('.ux-gf-promo-banner');
      resolve({
        ok: afterBanner > beforeBanner && afterParticle > beforeParticle,
        bannerDelta: afterBanner - beforeBanner,
        particleDelta: afterParticle - beforeParticle,
        bannerText: banner ? banner.textContent : null,
        hasHeavyShake: hasHeavyShake,
      });
    }, 700);
  })`);

  // 截图存证
  const outDir = path.join(__dirname, '..', 'reports', 'v62-runtime');
  fs.mkdirSync(outDir, { recursive: true });
  await wait(1500);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, 'fx-runtime.png'), img.toPNG());

  results.rendererExceptions = exceptions.length;
  results.allOk = results.mergeNormal.ok && results.mergeMax.ok && results.battleHit.ok &&
    results.battleVictory.ok && results.gain.ok && results.promotion.ok && exceptions.length === 0;

  fs.writeFileSync(path.join(outDir, 'fx-runtime.json'), JSON.stringify(results, null, 2));
  console.log('=== FX RUNTIME RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  console.log(results.allOk ? 'ALL_CHECKS_PASSED' : 'SOME_CHECKS_FAILED');
  app.exit(results.allOk ? 0 : 1);
});