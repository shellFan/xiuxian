'use strict';

/**
 * V10.1 — 广告 UI 入口接线（QA-BUG-013 修复）真实浏览器验证探针。
 *
 * 修复内容：离线「看广告 ×2」入口接入唯一可达的启动流 showWelcomeBackPopup：
 *   - 未领取结算显示金色「📺 看广告 ×2 领取」按钮（金色=增益、蓝色=正常领取）
 *   - 广告完成后 claimOfflineDouble（RewardProvider 边界，服务层三重防重）
 *   - 广告取消：不发放、重建启动简报，玩家可正常领取
 *   - 广告失败（result!=granted）：回落普通领取（与 Cocos OFFLINE_REWARD 弹窗同语义）
 *
 * 验证阶段：
 *   W1 boot + 新档（无离线结算）→ 欢迎简报不出现广告按钮（fresh 玩家守卫）
 *   W2 注入 2h 离线 → reload → 简报出现双按钮 + 预览数值
 *   W3 点广告按钮 → 广告弹窗倒计时 → 完成 → 双倍领取（灵石 = 预览×2）
 *   W4 再次注入新结算 → 点广告 → 取消 → 不发放（灵石不变）→ 简报重建 → 正常领取 +1×
 *   W5 接线后 UiOverlay.showOfflinePopup 桥仍然存在（QA 探针兼容）
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runner = require(path.join(__dirname, '..', 'v10-final', 'cdp-runner.cjs'));
const sleep = runner.sleep;

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const URL = urlIdx >= 0 ? args[urlIdx + 1] : 'http://127.0.0.1:8633/';
const RUN = path.resolve(__dirname, '..', '..', 'ai', 'reports', 'v10.1', 'ad-wiring');
const SHOTS = path.resolve(__dirname, '..', '..', 'docs', 'QA', 'screenshots');

const results = { phases: {}, pass: true };
function summary(phase, obj) {
  results.phases[phase] = obj;
  if (obj.pass === false) results.pass = false;
  process.stdout.write(`[${phase}] ${JSON.stringify(obj)}\n`);
}
async function shot(cdp, name) {
  try { fs.mkdirSync(SHOTS, { recursive: true }); await cdp.screenshot(path.join(SHOTS, name)); } catch { /* evidence best-effort */ }
}

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
      if (!draft.nickname) action = await cdp.type('#v59-nickname', 'V101广告员');
      else if (!draft.background) action = await cdp.click('[data-creation-choice="background:ORDINARY_WORKER"]');
      else action = await cdp.clickFirst(['[data-creation-action="advance"]', '[data-creation-action="save-identity"]']);
    } else if (step === 'DESTINY' && !draft.selectedCandidateId) action = await cdp.click('[data-creation-choice^="candidate:"]');
    else if (step === 'CONFIRM') action = await cdp.click('[data-creation-action="finalize"]');
    else action = await cdp.clickFirst(['[data-creation-action="start-game"]', '[data-creation-action="onboarding-skip"]', '[data-creation-action="onboarding-next"]', '[data-creation-action="advance"]', '[data-creation-action="finalize"]']);
    if (action && !action.clicked) await sleep(400); else await sleep(280);
  }
  return false;
}

/** 注入离线窗口：把 lastSaveTime 拨回 hoursAgo 小时前并 reload。
 * 关键：先屏蔽本页 Storage 写入再 reload——pagehide save flush（旧页卸载保存）
 * 会把 lastSaveTime 刷回当前时刻，覆盖注入值（首轮实测 effective=3.365s 即此因）。 */
async function injectOffline(cdp, hoursAgo) {
  await cdp.evaluate(`(function(){
    var KEY='game-save';
    var raw=localStorage.getItem(KEY);
    if(!raw) return 'NO_SAVE';
    var save=JSON.parse(raw);
    save.lastSaveTime = Date.now() - ${Math.round(hoursAgo * 3600 * 1000)};
    localStorage.setItem(KEY, JSON.stringify(save));
    try { Storage.prototype.setItem = function(){}; } catch (e) {}
    location.reload();
    return 'OK';
  })()`);
  await sleep(6500);
}

async function waitForBoot(cdp, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 30000);
  for (let n = 0; Date.now() < deadline; n += 1) {
    const raw = await runner.snapshot(cdp);
    const cur = runner.gateSnapshot(raw, 'h5');
    if (cur.facadeReady && cur.homeVisible) return cur;
    if (cur.modal) { await runner.handleSpecificModal(cdp, cur); await sleep(200); continue; }
    await sleep(400);
  }
  return null;
}

async function popupState(cdp) {
  return cdp.evaluate(`(function(){
    var q=function(s){var e=document.querySelector(s);return e?{visible:e.offsetParent!==null||e.getClientRects().length>0,text:(e.innerText||'').slice(0,40)}:null;};
    var f=window.__GAME_FACADE__;
    var eco={salary:null,cul:null,stones:null};
    try{ var s=f&&f.snapshot&&f.snapshot(); if(s){eco.salary=s.salary; eco.cul=s.cultivationExp; eco.stones=s.spiritStones;} }catch(e){ eco.err=String(e.message); }
    return {
      doubleBtn: q('#WelcomeDoubleBtn'),
      continueBtn: q('#WelcomeContinueBtn'),
      adCount: q('#AdCount'),
      adCancel: q('#AdCancelBtn'),
      welcomeTitle: q('.ux-welcome-title'),
      salary: eco.salary, cult: eco.cul, spiritStones: eco.stones,
    };
  })()`);
}

async function main() {
  const port = 29600 + Math.floor(Math.random() * 80);
  const profileDir = path.join(os.tmpdir(), `xiuxian-adwire-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.mkdirSync(RUN, { recursive: true });
  const spec = runner.buildLaunchSpec({ mode: 'h5', browser: 'chrome', url: URL, port, profileDir, width: 430, height: 932, mobile: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(spec.command, spec.args, { env, stdio: 'ignore', windowsHide: true });
  let cdp = null;
  try {
    await sleep(7000);
    cdp = new runner.CdpClient(port, 15000);
    await cdp.connect();

    // W1 boot + wizard（新档）
    const wiz = await wizardComplete(cdp);
    await sleep(1500);
    summary('W1-boot', { pass: wiz === true });
    const fresh = await popupState(cdp);
    summary('W1-fresh-no-double-btn', {
      pass: !fresh.doubleBtn && !fresh.welcomeTitle,
      fresh: { welcome: !!fresh.welcomeTitle, doubleBtn: !!fresh.doubleBtn },
    });

    // W2 注入 2 小时离线
    await injectOffline(cdp, 2);
    const booted = await waitForBoot(cdp, 40000);
    await sleep(1800); // 启动欢迎弹窗 1.2s 延迟
    let st = await popupState(cdp);
    // 简报可能被启动延迟延迟出现——轮询 10s
    for (let i = 0; i < 20 && !(st.welcomeTitle && st.continueBtn); i += 1) {
      await sleep(500);
      st = await popupState(cdp);
    }
    await shot(cdp, 'v101-welcome-double-btn.png');
    summary('W2-offline-welcome-popup', {
      pass: !!(st.welcomeTitle && st.continueBtn && st.doubleBtn),
      state: st,
    });

    // 预览基线（facade 层）
    const preview = await cdp.evaluate(`(function(){
      var f=window.__GAME_FACADE__;
      if(!f||!f.prepareWelcomeBackSummary) return null;
      var s=f.prepareWelcomeBackSummary();
      return s&&s.simulation?{stones:s.simulation.spiritStones,salary:s.simulation.salary,cult:s.simulation.cultivation,effective:s.simulation.effectiveSeconds}:null;
    })()`);
    summary('W2-preview', { pass: !!preview && preview.effective > 0, preview });

    // W3 广告双倍领取（逐组件断言：非零组件增量=预览×2，±10% 容忍心跳漂移）
    const beforeClaim = await popupState(cdp);
    const click1 = await cdp.click('#WelcomeDoubleBtn');
    await sleep(600);
    const adSt = await popupState(cdp);
    summary('W3-ad-popup-open', { pass: !!(click1.clicked && adSt.adCount && adSt.adCancel), adSt });
    await shot(cdp, 'v101-ad-popup.png');
    // 3 秒倒计时（900ms tick）→ 完成；等待 4.5s 覆盖
    await sleep(4500);
    st = await popupState(cdp);
    const compCheck2x = (sim, before, after) => {
      if (!sim || !before || !after) return { ok: false, reason: 'missing data' };
      const nonZero = [];
      const STATE_KEY = { salary: 'salary', cult: 'cult', stones: 'spiritStones' };
      for (const key of ['salary', 'cult', 'stones']) {
        const expected = (sim[key] || 0) * 2;
        const stateKey = STATE_KEY[key];
        const beforeV = typeof before[stateKey] === 'number' ? before[stateKey] : 0;
        const afterV = typeof after[stateKey] === 'number' ? after[stateKey] : 0;
        const delta = afterV - beforeV;
        const tol = Math.max(2, expected * 0.1);
        if (Math.abs(delta - expected) > tol) return { ok: false, key, delta, expected };
        if ((sim[key] || 0) > 0) nonZero.push(key);
      }
      return { ok: true, nonZero };
    };
    const w3 = compCheck2x(preview, beforeClaim, st);
    await shot(cdp, 'v101-after-double.png');
    summary('W3-double-claimed', {
      pass: w3.ok === true && !st.adCount,
      ...w3,
      sim: preview ? { salary: preview.salary, cult: preview.cult, stones: preview.stones } : null,
      note: '深夜离线分段工资/修为=0 属预期（UTC+8 分段器），灵石组件承担断言',
    });

    // W4 取消路径：新结算（lastSaveTime 变化 → 新 settlementId）
    await injectOffline(cdp, 1);
    await waitForBoot(cdp, 40000);
    await sleep(2000);
    let st2 = await popupState(cdp);
    for (let i = 0; i < 20 && !(st2.welcomeTitle && st2.doubleBtn); i += 1) {
      await sleep(500);
      st2 = await popupState(cdp);
    }
    const preview4 = await cdp.evaluate(`(function(){
      var f=window.__GAME_FACADE__;
      if(!f||!f.prepareWelcomeBackSummary) return null;
      var s=f.prepareWelcomeBackSummary();
      return s&&s.simulation?{salary:s.simulation.salary,cult:s.simulation.cultivation,stones:s.simulation.spiritStones}:null;
    })()`);
    const beforeCancel = { salary: st2.salary, cult: st2.cult, spiritStones: st2.spiritStones };
    summary('W4-second-welcome', { pass: !!(st2.welcomeTitle && st2.doubleBtn), preview4, beforeCancel });
    await cdp.click('#WelcomeDoubleBtn');
    // 等广告弹窗出现后立即取消（带重试轮询，600ms 单击可能撞上 DOM 重建）
    let cancel = null;
    for (let i = 0; i < 8; i += 1) {
      await sleep(300);
      cancel = await cdp.click('#AdCancelBtn');
      if (cancel && cancel.clicked) break;
    }
    await sleep(800);
    let st3 = await popupState(cdp);
    // 取消后简报应被重建（onCancel → showWelcomeBackPopup）；三资源纹丝不动 = 未发放
    const noGrant = typeof beforeCancel.salary === 'number'
      ? st3.salary === beforeCancel.salary && st3.cult === beforeCancel.cult && st3.spiritStones === beforeCancel.spiritStones
      : false;
    const cancelOk = cancel.clicked && !st3.adCount && !!st3.continueBtn && noGrant;
    await shot(cdp, 'v101-after-cancel.png');
    summary('W4-cancel-no-grant', {
      pass: cancelOk,
      cancelClicked: !!(cancel && cancel.clicked),
      adCountAfter: st3.adCount,
      welcomeTitleAfter: st3.welcomeTitle,
      after: { salary: st3.salary, cult: st3.cult, stones: st3.spiritStones, welcomeRestored: !!st3.continueBtn, doubleBtnBack: !!st3.doubleBtn },
    });
    // 正常领取（逐组件 = 预览 1×，至少一个非零组件真实入账）
    await cdp.click('#WelcomeContinueBtn');
    await sleep(900);
    const st4 = await popupState(cdp);
    const compCheck1x = (sim, before, after) => {
      if (!sim || !before || !after) return { ok: false, reason: 'missing data' };
      const nonZero = [];
      const STATE_KEY = { salary: 'salary', cult: 'cult', stones: 'spiritStones' };
      for (const key of ['salary', 'cult', 'stones']) {
        const expected = sim[key] || 0;
        const stateKey = STATE_KEY[key];
        const beforeV = typeof before[stateKey] === 'number' ? before[stateKey] : 0;
        const afterV = typeof after[stateKey] === 'number' ? after[stateKey] : 0;
        const delta = afterV - beforeV;
        const tol = Math.max(2, expected * 0.1);
        if (Math.abs(delta - expected) > tol) return { ok: false, key, delta, expected };
        if (expected > 0) nonZero.push(key);
      }
      return { ok: true, nonZero };
    };
    const w4c = compCheck1x(preview4, beforeCancel, st4);
    summary('W4-normal-claim-after-cancel', {
      pass: w4c.ok === true && w4c.nonZero.length > 0 && !st4.welcomeTitle,
      ...w4c,
      after: { salary: st4.salary, cult: st4.cult, stones: st4.spiritStones },
    });

    // W5 兼容桥
    const bridge = await cdp.evaluate(`(function(){return typeof (window.UiOverlay&&window.UiOverlay.showOfflinePopup);})()`);
    summary('W5-bridge-kept', { pass: bridge === 'function', bridge });
  } catch (error) {
    results.pass = false;
    results.error = String(error && error.stack || error);
    console.error(results.error);
  } finally {
    try { if (cdp) await cdp.close(); } catch { /* noop */ }
    try { child.kill(); } catch { /* noop */ }
    fs.writeFileSync(path.join(RUN, `result-${Date.now()}.json`), JSON.stringify(results, null, 2));
    process.stdout.write(`RESULT ${results.pass ? 'PASS' : 'FAIL'}\n`);
    process.exit(results.pass ? 0 : 1);
  }
}

main();
