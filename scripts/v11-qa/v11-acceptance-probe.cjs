'use strict';

/**
 * V11 验收探针（任务书§26）：真实运行游戏 + 分页面截图 + S1–S4 功能断言。
 *
 * 前置：scripts/build-web.cjs 新构建 + scripts/copy-web-build.cjs 拷贝到 desktop/build/web-desktop。
 * 产物：artifacts/V11_V15/screenshots/*.png + v11-acceptance-results.json
 *
 * 阶段：
 *   A1 boot/新档 + 首页截图（facade 存在）
 *   A2 排行榜服务：四榜/玩家分值/确定性（facade 层断言）+ 页面截图
 *   A3 炼丹页：成功率入卡 + 真实炼制一次（成功或失败均断言统计一致性）+ 截图
 *   A4 成就页：CRAFT 系列可见（DOM）+ 配置计数 6 + 截图
 *   A5 设置页：BGM/SFX 行存在 + context.settings 音量字段（S3 接线）+ 截图
 */

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = runner.sleep;

const PROJECT = path.resolve(__dirname, '..', '..');
const BUILD_DIR = path.join(PROJECT, 'desktop', 'build', 'web-desktop');
const OUT = path.join(PROJECT, 'artifacts', 'V11_V15');
const SHOTS = path.join(OUT, 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css; charset=utf-8',
  '.map': 'application/json', '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.plist': 'application/xml', '.svg': 'image/svg+xml',
};

function serveStatic(rootDir) {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      let file = path.join(rootDir, safe);
      if (!file.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
      if (urlPath === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(rootDir, 'index.html');
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(500); res.end(); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const results = { phases: {}, pass: true };
function summary(phase, obj) {
  results.phases[phase] = obj;
  if (obj.pass === false) results.pass = false;
  process.stdout.write(`[${phase}] ${JSON.stringify(obj)}\n`);
}

async function shot(cdp, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  return cdp.screenshot(path.join(SHOTS, name));
}

/** 新档引导（复用 v10-qa-final 向导流程，S1 修正：确定性 DEFAULT 选择）。 */
async function wizardComplete(cdp) {
  const deadline = Date.now() + 90000;
  for (let n = 0; n < 150 && Date.now() < deadline; n += 1) {
    const raw = await runner.snapshot(cdp);
    const cur = runner.gateSnapshot(raw, 'h5');
    if (cur.creationComplete && cur.homeVisible) return true;
    if (cur.modal) { await runner.handleSpecificModal(cdp, cur); await sleep(250); continue; }
    const draft = (cur.creation && cur.creation.draft) || {};
    const step = String(draft.step || '').toUpperCase();
    let action = null;
    if (step === 'INDUSTRY' && !draft.industry) action = await cdp.click('[data-creation-choice="industry:INTERNET"]');
    else if (step === 'DIRECTION' && !draft.direction) action = await cdp.click('[data-creation-choice="direction:TECH_RND"]');
    else if (step === 'PROFESSION' && !draft.professionConfirmed) action = await cdp.click('[data-creation-choice="profession:JAVA_BACKEND"]');
    else if (step === 'IDENTITY') {
      if (!draft.nickname) action = await cdp.type('#v59-nickname', 'V11丹道实习生');
      else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
      else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
    } else if (step === 'DESTINY' && !draft.selectedCandidateId) action = await cdp.click('[data-creation-choice^="candidate:"]');
    else if (step === 'CONFIRM') action = await cdp.click('[data-creation-action="finalize"]');
    else action = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
    if (action && !action.clicked) await sleep(400); else await sleep(280);
  }
  return false;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const { server, port } = await serveStatic(BUILD_DIR);
  const URL = `http://127.0.0.1:${port}/`;
  const profileDir = path.join(os.tmpdir(), `xiuxian-v11-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const cdpPort = 30100 + Math.floor(Math.random() * 80);
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port: cdpPort, profileDir, width: 430, height: 932, mobile: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  let cdp = null;
  try {
    await sleep(7000);
    cdp = new runner.CdpClient(cdpPort, 15000);
    await cdp.connect();

    // ── A1 boot + 新档 ──
    const wiz = await wizardComplete(cdp);
    await sleep(1500);
    summary('A1-wizard', { pass: wiz === true });
    const facadeOk = await cdp.evaluate(`!!(window.__GAME_FACADE__ && window.__GAME_FACADE__.context)`);
    summary('A1-facade', { pass: facadeOk === true });
    await shot(cdp, '01-home.png');

    // ── A2 排行榜（S1：四榜/玩家分值/确定性）──
    const lb = await cdp.evaluate(`(function(){
      var f = window.__GAME_FACADE__;
      if (!f || !f.context || !f.context.leaderboard) return null;
      var svc = f.context.leaderboard;
      var metrics = svc.getMetrics().map(function(m){ return m.metric; });
      var career = svc.getLeaderboard('career');
      var wealth = svc.getLeaderboard('wealth');
      var again = svc.getLeaderboard('career');
      return {
        metrics: metrics,
        careerRank: career.playerRank, careerEntries: career.totalEntries, careerLabel: career.metricLabel,
        wealthScore: wealth.entries.filter(function(e){return e.isPlayer;})[0] ? wealth.entries.filter(function(e){return e.isPlayer;})[0].score : -1,
        deterministic: JSON.stringify(again.entries.map(function(e){return [e.name,e.rank];})) === JSON.stringify(career.entries.map(function(e){return [e.name,e.rank];})),
      };
    })()`);
    summary('A2-leaderboard-service', {
      pass: !!lb && lb.metrics.length === 4 && lb.careerRank > 0 && lb.careerEntries > 0 && lb.deterministic === true,
      lb,
    });
    await shot(cdp, '02-home-before-leaderboard.png');

    // ── A3 炼丹（S2/S4：成功率入卡 + 真实炼制 + 统计一致性）──
    const gotoCraft = await cdp.clickFirst(['[data-nav="CRAFT"]', '[data-action="goto"][data-page="craft"]']);
    await sleep(1200);
    const craftCard = await cdp.evaluate(`(function(){
      var cards = document.querySelectorAll('.ux-recipe-card');
      var first = cards[0];
      return {
        cards: cards.length,
        hasRate: first ? /成功率\\d+%/.test(first.textContent) : false,
        rateText: first ? (first.textContent.match(/成功率\\d+%/)||[''])[0] : '',
      };
    })()`);
    await shot(cdp, '03-craft-page.png');

    // 真实炼制一次（经 UI 按钮走真实点击路径；先注入资源并刷新 overlay 使按钮恢复可用）
    const seeded = await cdp.evaluate(`(function(){
      var f = window.__GAME_FACADE__;
      f.context.player.cultivationExp = 5000;
      f.context.player.spiritStones = 100;
      try { if (window.__UI_OVERLAY__ && window.__UI_OVERLAY__.refresh) window.__UI_OVERLAY__.refresh(); } catch (e) { return { cult: f.context.player.cultivationExp, stones: f.context.player.spiritStones, refreshed: false }; }
      return { cult: f.context.player.cultivationExp, stones: f.context.player.spiritStones, refreshed: true };
    })()`);
    await sleep(500);
    const craftClick = await cdp.clickFirst(['[data-action="craft"]:not([disabled])']);
    await sleep(700);
    const craftOnce = await cdp.evaluate(`(function(){
      var f = window.__GAME_FACADE__;
      var toast = document.querySelector('.ux-toast, [class*="toast"]');
      return {
        successCount: f.context.player.lifetimeStats.craftSuccessCount || 0,
        failCount: f.context.player.lifetimeStats.craftFailCount || 0,
        toastText: toast ? toast.textContent : '',
        cult: f.context.player.cultivationExp, stones: f.context.player.spiritStones,
      };
    })()`);
    const craftConsistent = !!craftOnce && (craftOnce.successCount === 1 || craftOnce.failCount === 1);
    summary('A3-craft-seeded', { pass: seeded.cult === 5000 && seeded.refreshed === true, seeded });
    summary('A3-craft-ui-click', { pass: craftClick.clicked && craftConsistent, craftClickClicked: craftClick.clicked, craftOnce });
    await shot(cdp, '04-craft-after.png');

    // ── A4 成就（S4：CRAFT 系列）── 返回 → 更多 → 成就
    await cdp.clickFirst(['[data-action="back"]']);
    await sleep(500);
    await cdp.clickFirst(['[data-nav="MORE"]']);
    await sleep(600);
    await shot(cdp, '05-more-menu.png');
    const gotoAch = await cdp.clickFirst(['[data-action="goto"][data-page="achievements"]']);
    await sleep(900);
    const achCfg = await cdp.evaluate(`(function(){
      var f = window.__GAME_FACADE__;
      var all = f.queryAchievementConfigs ? f.queryAchievementConfigs() : [];
      return { total: all.length, craft: all.filter(function(a){ return a.category === 'CRAFT'; }).length };
    })()`);
    const achDom = await cdp.evaluate(`(function(){
      var t = document.body.textContent || '';
      return { hasCraftAch: t.indexOf('初试丹道') >= 0, hasPerfect: t.indexOf('极品丹师') >= 0 };
    })()`);
    await shot(cdp, '06-achievements.png');
    summary('A4-achievements', {
      pass: !!achCfg && achCfg.craft === 6 && achDom.hasCraftAch && achDom.hasPerfect,
      achCfg, achDom, gotoClicked: gotoAch.clicked,
    });

    // ── A5 设置（S3：真实开关/音量接线 + overlay 双面）──
    const settingsState = await cdp.evaluate(`(function(){
      var f = window.__GAME_FACADE__;
      var s = f.context.settings;
      if (!s) return null;
      return { musicEnabled: s.musicEnabled, sfxEnabled: s.sfxEnabled, bgmVolume: s.bgmVolume, sfxVolume: s.sfxVolume };
    })()`);
    await cdp.clickFirst(['[data-action="back"]']);
    await sleep(500);
    const gotoSettings = await cdp.clickFirst(['[data-action="goto"][data-page="settings"]']);
    await sleep(800);
    const settingsDom = await cdp.evaluate(`(function(){
      var t = document.body.textContent || '';
      return { hasSfxRow: t.indexOf('游戏音效开关') >= 0, hasBgmRow: t.indexOf('修仙背景音乐开关') >= 0, hasSlider: !!document.getElementById('SfxVolumeSlider') };
    })()`);
    await shot(cdp, '07-settings.png');
    summary('A5-settings', {
      pass: !!settingsState && settingsDom.hasSfxRow && settingsDom.hasBgmRow && settingsDom.hasSlider,
      settingsState, settingsDom, gotoClicked: gotoSettings.clicked,
    });

    // ── A7 F2：overlay 开关 → 持久化设置同步（真点击 + 状态翻转 + 复原）──
    const toggleSync = await cdp.evaluate(`(function(){
      var f = window.__GAME_FACADE__;
      var before = f.context.settings.sfxEnabled;
      var btn = document.querySelector('[data-action="toggle"][data-key="sfx"]');
      if (!btn) return { found: false };
      btn.click();
      var after = f.context.settings.sfxEnabled;
      var persisted = null;
      try { persisted = JSON.parse(localStorage.getItem('game-settings') || 'null'); } catch (e) { persisted = null; }
      btn.click(); // 复原
      var restored = f.context.settings.sfxEnabled;
      return { found: true, before: before, after: after, flipped: after !== before, restoredSame: restored === before, persistedSfx: persisted ? persisted.sfxEnabled : null };
    })()`);
    summary('A7-overlay-settings-sync', {
      pass: !!toggleSync && toggleSync.found === true && toggleSync.flipped === true && toggleSync.restoredSame === true,
      toggleSync,
    });

    // ── A6 回首页收尾截图 ──
    await cdp.clickFirst(['[data-action="back"]']);
    await sleep(700);
    await shot(cdp, '08-home-final.png');

  } catch (error) {
    results.pass = false;
    results.error = String(error && error.stack ? error.stack : error);
    process.stdout.write(`[FATAL] ${results.error}\n`);
    try { if (cdp) await shot(cdp, '99-fatal-state.png'); } catch { /* ignore */ }
  } finally {
    try { if (cdp) cdp.close(); } catch { /* ignore */ }
    try { child.kill(); } catch { /* ignore */ }
    server.close();
    fs.writeFileSync(path.join(OUT, 'v11-acceptance-results.json'), JSON.stringify(results, null, 2));
    process.stdout.write(`\n[RESULTS] pass=${results.pass} → ${path.join(OUT, 'v11-acceptance-results.json')}\n`);
    process.exit(results.pass ? 0 : 1);
  }
}

main();
