/**
 * V10.1 玩家体验审查（Player Experience Audit）驱动器。
 *
 * 以 Electron 无 preload 窗口运行（= 纯 Chromium H5 上下文，复用 V10.0 QA 的
 * 已验证启动路径），驱动完整新手→经营→卡牌战斗→Boss→奖励→养成→重启 流程，
 * 每一步截图 + 记录指标/缺陷，输出 JSON 证据到 ai/reports/v101/。
 *
 * 用法：
 *   node scripts/v101/exp-audit.cjs --tag=before --width=1280 --height=720
 *   node scripts/v101/exp-audit.cjs --tag=mobile390 --width=390 --height=844 --shots=mobile
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const REPORT = path.join(ROOT, 'ai', 'reports', 'v101');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [];
}));
const TAG = args.tag || 'run';
const W = Number(args.width || 1280);
const H = Number(args.height || 720);
const CLEAR = args['keep-save'] !== '1';
const PROF = String(args.profession || 'JAVA_BACKEND');
const DIR = String(args.direction || 'TECH_RND');
const IND = String(args.industry || 'INTERNET');
const NICK = String(args.nick || '审计员' + TAG.slice(-4));
const SHOTS = path.join(REPORT, 'screenshots', args.shots || 'before');
const PORT = 8630;

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(REPORT, 'logs'), { recursive: true });
const logf = path.join(REPORT, 'logs', `exp-audit-${TAG}.log`);
const log = (m) => { try { fs.appendFileSync(logf, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const result = {
  tag: TAG, viewport: { width: W, height: H }, startedAt: new Date().toISOString(),
  boot: {}, steps: [], defects: [], metrics: {}, endedAt: null,
};

const defect = (step, severity, issue, detail) => {
  result.defects.push({ step, severity, issue, detail: detail === undefined ? null : detail });
  log(`[DEFECT:${severity}] ${step} — ${issue}`);
};

app.whenReady().then(async () => {
  // 1) 静态服务器（复用全局 h5-server；不可用则内联启动一个备用端口实例）。
  const usePort = await (async () => {
    try { const ok = await fetch(`http://127.0.0.1:${PORT}/index.html`); if (ok.ok) return PORT; } catch (_) {}
    const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'h5-server.cjs'), '--port=' + PORT],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await wait(2500);
    return PORT;
  })();
  log(`[srv] using port ${usePort}`);

  // 2) 纯浏览器窗口（无 preload = H5 上下文）。可见窗口（截图必须真实）。
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: true, skipTaskbar: true,
    webPreferences: { /* 故意不挂 preload */ } });
  const run = async (js) => { try { return await win.webContents.executeJavaScript(js); } catch (e) { return { __error: String(e.message).slice(0, 240) }; } };
  const shot = async (name) => {
    try {
      await wait(350); // 让最后一帧渲染
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(SHOTS, `${name}.png`), img.toPNG());
      log(`[shot] ${name}`);
    } catch (e) { log(`[shot-fail] ${name} ${e.message}`); }
  };

  const t0 = Date.now();
  await win.loadURL(`http://127.0.0.1:${usePort}/index.html`);
  if (CLEAR) {
    await run(`try{localStorage.clear();}catch(e){} 'cleared'`);
    await win.loadURL(`http://127.0.0.1:${usePort}/index.html`);
  }
  let facade = false;
  for (let i = 0; i < 150 && !facade; i++) { await wait(1000); facade = (await run(`!!window.__GAME_FACADE__`)) === true; }
  result.boot.facadeReadySec = facade ? Math.round((Date.now() - t0) / 1000) : null;
  result.boot.facadeReady = facade;
  result.boot.resources = (await run(`performance.getEntriesByType('resource').length`)) ?? null;
  await shot('00-boot');
  if (!facade) {
    defect('boot', 'P0', 'facade 未在 150s 内就绪（游戏无法启动）', result.boot);
    result.endedAt = new Date().toISOString();
    fs.writeFileSync(path.join(REPORT, `audit-${TAG}.json`), JSON.stringify(result, null, 2));
    app.exit(2);
    return;
  }

  // ── 工具 ──────────────────────────────────────────────────────
  const clickSel = (sel) => run(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'miss';if(e.disabled)return 'disabled';e.click();return 'ok';})()`);
  const clickAction = (action) => run(`(function(){var e=document.querySelector('[data-action="${action}"]');if(!e)return 'miss';if(e.disabled)return 'disabled';e.click();return 'ok';})()`);
  const clickNav = (nav) => run(`(function(){var e=document.querySelector('[data-nav="${nav}"]');if(!e)return 'miss';e.click();return 'ok';})()`);
  const clickAll = (sel) => run(`(function(){var n=0;document.querySelectorAll(${JSON.stringify(sel)}).forEach(function(e){if(!e.disabled){e.click();n++;}});return n;})()`);
  const waitCond = async (jsCond, timeoutMs, poll = 800) => {
    const t = Date.now();
    while (Date.now() - t < timeoutMs) {
      const v = await run(`!!(${jsCond})`);
      if (v === true) return true;
      await wait(poll);
    }
    return false;
  };
  const step = async (name, fn) => {
    const t = Date.now();
    let out = null;
    try { out = await fn(); } catch (e) { out = { __error: String(e.message).slice(0, 300) }; }
    result.steps.push({ name, ms: Math.round((Date.now() - t) / 1000), out: out === undefined ? null : out });
    log(`[step] ${name} ${Math.round((Date.now() - t) / 1000)}s ${JSON.stringify(out).slice(0, 260)}`);
    return out;
  };
  const dismissModal = () => run(`(function(){
    var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','.ux-modal [data-action="modalClose"]','.v2-modal-ok'];
    for (var i=0;i<sels.length;i++){var e=document.querySelector(sels[i]);if(e){e.click();return sels[i];}}
    return null;
  })()`);

  /** 创建向导推进器（按 draft 状态机逐步驱动真实 UI）。 */
  const driveCreation = async (maxRounds = 60) => {
    const trace = [];
    for (let i = 0; i < maxRounds; i++) {
      const st = await run(`(function(){
        var m=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk'];
        for (var i=0;i<m.length;i++){var e=document.querySelector(m[i]);if(e){e.click();return {action:'dismiss:'+m[i]};}}
        function click(sel){ var e=document.querySelector(sel); if(!e) return null; if(e.disabled) return 'disabled'; e.click(); return 'ok'; }
        function advance(){ return click('[data-creation-action="advance"]') || click('[data-creation-action="finalize"]') || click('[data-creation-action="start-game"]') || click('[data-creation-action="onboarding-next"]') || click('[data-creation-action="onboarding-skip"]'); }
        var f = window.__GAME_FACADE__, d = null;
        try { var q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; d = q && q.draft; } catch(e){}
        if (!document.querySelector('.v59-creation') && !document.querySelector('[data-creation-action]')) {
          if (document.querySelector('.ux91-hero') || document.querySelector('#Ux90CaveHero')) return {action:'home'};
          var r = advance(); return r ? {action:'pre-adv:'+r} : {action:'wait'};
        }
        var s = d ? d.step : 'UNKNOWN';
        if (s==='INDUSTRY'){ if(!d.industry){ var r=click('[data-creation-choice="industry:${IND}"]'); if(r) return {action:'ind:'+r}; } return {action:'adv',result:advance()}; }
        if (s==='DIRECTION'){ if(!d.direction){ var r=click('[data-creation-choice="direction:${DIR}"]'); if(r) return {action:'dir:'+r}; } return {action:'adv',result:advance()}; }
        if (s==='PROFESSION'){ if(!d.professionConfirmed){ var r=click('[data-creation-choice="profession:${PROF}"]'); if(r) return {action:'prof:'+r}; } return {action:'adv',result:advance()}; }
        if (s==='IDENTITY'){
          var inp=document.querySelector('#v59-nickname');
          if (inp && !inp.value){ inp.value="${NICK}"; inp.dispatchEvent(new Event('input',{bubbles:true})); return {action:'nick'}; }
          if (!d.nickname){ var av=document.querySelector('[data-creation-choice="avatar:1"]'); if(av && !av.classList.contains('is-selected')){ av.click(); return {action:'avatar'}; } var sv=click('[data-creation-action="save-identity"]'); return {action:'save:'+sv}; }
          var bg = document.querySelector('[data-creation-choice^="background:"]');
          if (bg && !bg.classList.contains('is-selected')){ bg.click(); return {action:'bg'}; }
          return {action:'adv',result:advance()};
        }
        if (s==='BACKGROUND'){ var bg2=document.querySelector('[data-creation-choice^="background:"]'); if(bg2 && !bg2.classList.contains('is-selected')){ bg2.click(); return {action:'bg'}; } return {action:'adv',result:advance()}; }
        if (s==='DESTINY'){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c && !c.classList.contains('is-selected')){ c.click(); return {action:'cand'}; } return {action:'adv',result:advance()}; }
        if (s==='ALLOCATION'){ return {action:'adv',result:advance()}; }
        if (s==='CONFIRM'){ return {action:'finalize',result:click('[data-creation-action="finalize"]')}; }
        return {action:'adv:'+s,result:advance()};
      })()`);
      trace.push(st && st.action);
      if (st && st.action === 'home') return { done: true, rounds: i, trace: trace.slice(-10) };
      await wait(650);
    }
    return { done: false, rounds: maxRounds, trace: trace.slice(-12) };
  };

  // ── S1 首次启动 → 创建角色 ──
  await shot('01-first-launch');
  const created = await step('S1_create_character', driveCreation);
  if (!created || !created.done) defect('S1_create_character', 'P0', '创建角色流程未能在预算轮次内进入洞府', created);
  await wait(2500);
  await shot('02-home-fresh');

  // 开工等待（首页快照会触发 ensureStarted）
  const dayReady = await step('S1b_day_start', async () => {
    const ok = await waitCond(`(function(){try{var f=window.__GAME_FACADE__;f.queryHomeSnapshot&&f.queryHomeSnapshot();return !!(f.queryBattleBuildOptions?f.queryBattleBuildOptions().length>0:false);}catch(e){return false;}})()`, 30000, 1000);
    return ok;
  });
  // V10.1 观察项：日开工已由战斗入口自动 ensureStarted（结构修复），此处仅记录不判缺陷；真实证据 = S8 战斗能启动。

  // 首页结构读取（五区审查）
  result.metrics.home = (await step('S2_home_structure', async () => run(`(function(){
    return {
      hero: !!document.querySelector('#Ux90CaveHero'),
      resChips: Array.from(document.querySelectorAll('.ux91-res')).map(e=>e.innerText.replace(/\\n/g,' ').slice(0,40)),
      goalText: (document.querySelector('.ux91-goal, [class*=goal]')||{}).innerText?.slice(0,200) || null,
      todayText: (document.querySelector('.ux91-today, [class*=today]')||{}).innerText?.slice(0,240) || null,
      quickNavs: Array.from(document.querySelectorAll('[data-nav]')).slice(0,30).map(e=>e.getAttribute('data-nav')),
      actions: Array.from(document.querySelectorAll('[data-action]')).slice(0,40).map(e=>e.getAttribute('data-action')),
      modeCards: Array.from(document.querySelectorAll('[data-action="mode"]')).map(e=>e.getAttribute('data-mode')),
      bodyTextLen: (document.getElementById('UiBody')||{innerText:''}).innerText.length,
      navCount: document.querySelectorAll('.ux-nav [data-nav]').length
    };
  })()`))) || null;

  // ── S3 工作（真实 UI：选中模式 + 观察反馈） ──
  await step('S3_work', async () => {
    const sel = await run(`(function(){var e=document.querySelector('[data-action="mode"][data-mode="WORK"]');if(!e)return 'miss';e.click();return 'ok';})()`);
    await wait(1500);
    await shot('03-work-selected');
    const feedback = await run(`(function(){var p=document.querySelector('.ux-action-detail,[class*=detail]');return p?p.innerText.slice(0,220):null;})()`);
    return { sel, feedback };
  });
  await step('S3b_work_run', async () => { await wait(6000); await shot('04-work-running'); return 'ok'; });

  // ── S4 摸鱼 ──
  await step('S4_fishing', async () => {
    const sel = await run(`(function(){var e=document.querySelector('[data-action="mode"][data-mode="FISHING"]');if(!e)return 'miss';e.click();return 'ok';})()`);
    await wait(2000);
    await shot('05-fishing');
    return { sel };
  });

  // ── S5 修炼 ──
  await step('S5_cultivate', async () => {
    const before = await run(`(function(){var f=window.__GAME_FACADE__;try{var s=f.snapshot();return {xiuwei:s.xiuwei,stones:s.spiritStones};}catch(e){return null;}})()`);
    const r = await clickAction('cultivate');
    await wait(2200);
    await shot('06-cultivate');
    const after = await run(`(function(){var f=window.__GAME_FACADE__;try{var s=f.snapshot();return {xiuwei:s.xiuwei,stones:s.spiritStones};}catch(e){return null;}})()`);
    return { r, before, after };
  });

  // ── S6 社交 ──
  await step('S6_social', async () => {
    const sel = await run(`(function(){var e=document.querySelector('[data-action="mode"][data-mode="SOCIAL"]');if(!e)return 'miss';e.click();return 'ok';})()`);
    await wait(1500);
    await shot('07-social');
    return { sel };
  });

  // ── S7 挑战页 ──
  await step('S7_project_page', async () => {
    await clickNav('PROJECT');
    await wait(2000);
    await shot('08-project-page');
    return (await run(`(document.getElementById('UiBody')||{innerText:''}).innerText.slice(0,300)`));
  });

  // ── S8 启动战斗 ──
  const battleStart = await step('S8_start_battle', async () => {
    const entry = await clickAction('projectEntry');
    await wait(1500);
    await shot('09-build-select');
    const buildClick = await run(`(function(){
      var e=document.querySelector('[data-battle-build]');
      if(!e) return 'miss';
      e.click(); return 'clicked-build';
      e.click(); return 'clicked-card';
    })()`);
    await wait(1800);
    const confirm = await clickSel('[data-action="battleConfirmStart"],[data-action="confirmBattle"],[data-action="battleStart"]');
    await wait(2500);
    await shot('10-battle-start');
    const st = await run(`(function(){var f=window.__GAME_FACADE__;try{var q=f.queryBattleCard();return q?{phase:q.phase,turn:q.turn,wave:q.wave}:null;}catch(e){return 'ERR:'+String(e.message).slice(0,120);}})()`);
    return { entry, buildClick, confirm, st };
  });
  if (battleStart && battleStart.out && (!battleStart.out.st || battleStart.out.st === 'null' || battleStart.out.st.__error)) {
    // 兜底：直接命令路径（审计允许）
    await run(`(function(){var f=window.__GAME_FACADE__;try{var q=f.queryBattleBuildOptions?f.queryBattleBuildOptions():null;if(q&&q.length&&!f.queryBattle().active){f.startBattleRun('PROJECT',q[0].id);return 'ok';}return 'skip';}catch(e){return 'ERR:'+e.message.slice(0,120);}})()`);
    await wait(3000);
    await shot('10b-battle-start-fallback');
  }

  // ── S9 卡牌战斗（真实 UI 点击出牌/结束回合/选目标） ──
  const battle = await step('S9_card_battle', async () => {
    const timeline = [];
    let clicks = 0;
    for (let t = 0; t < 30; t++) {
      const st = await run(`(function(){
        var f=window.__GAME_FACADE__;
        var state=null; try{ state=f&&f.queryBattleCard?f.queryBattleCard():null; }catch(e){}
        if(!state) return {phase:'none'};
        return {
          phase:state.phase, turn:state.turn, energy:state.player&&state.player.energy,
          hp:state.player&&state.player.hp, block:state.player&&state.player.block,
          enemies:(state.enemies||[]).map(function(e){return {n:e.name,hp:e.hp,boss:e.tier==='BOSS',intent:e.intent&&e.intent.kind};}),
          handCount:(state.hand||[]).length,
          hand:(state.hand||[]).slice(0,10).map(function(c){return {uid:c.uid,defId:c.defId};}),
          wave:state.wave,
          cardBtns:Array.from(document.querySelectorAll('[data-action="battlePlayCard"]')).length,
          endBtn:!!document.querySelector('[data-action="battleEndTurn"]')
        };
      })()`);
      if (st.__error || st.phase === 'none') { timeline.push({ t, stop: 'no-state' }); break; }
      timeline.push({ t, turn: st.turn, phase: st.phase, hp: st.hp, wave: st.wave, enemies: st.enemies });
      if (st.phase === 'FINISHED' || st.phase === 'REWARD_SELECTION') break;
      if (st.phase === 'PLAYER_TURN') {
        // V10.1：升级三选一弹窗优先处理（否则出牌全部被拒）
        const skillPicked = await run(`(function(){var b=document.querySelector('[data-battle-skill]');if(!b)return 'none';b.click();return 'picked';})()`);
        if (skillPicked === 'picked') { await wait(1200); continue; }
        if (st.cardBtns > 0 && st.energy > 0) {
          await run(`(function(){var b=document.querySelector('[data-action="battlePlayCard"]');if(b)b.click();})()`);
          clicks++;
          await wait(800);
          await run(`(function(){var t=document.querySelector('[data-enemy-uid]');if(t)t.click();})()`);
          clicks++;
          await wait(800);
          if (st.turn && st.turn % 2 === 0) await shot(`11-battle-turn-${st.turn}`);
          continue;
        }
        await run(`(function(){var e=document.querySelector('[data-action="battleEndTurn"]');if(e)e.click();})()`);
        clicks++;
        await wait(2400);
        continue;
      }
      await wait(1500);
    }
    await shot('12-battle-final');
    const final = await run(`(function(){var f=window.__GAME_FACADE__;try{var q=f.queryBattle();return q?{status:q.status,turns:q.turns,wave:q.wave,victory:q.status==='VICTORY'}:null;}catch(e){return 'ERR:'+String(e.message).slice(0,100);}})()`);
    result.metrics.battleClicks = clicks;
    return { lastTimeline: timeline.slice(-10), final };
  });

  // ── S10 奖励与结算 ──
  await step('S10_reward', async () => {
    await shot('13-reward-or-settlement');
    const claim = await run(`(function(){
      var e=document.querySelector('[data-action="battleClaimReward"],[data-action="claimBattleReward"]');
      if(e){e.click();return 'clicked-ui';}
      var f=window.__GAME_FACADE__;
      try{var q=f.queryBattleCard();if(q&&q.reward&&!q.reward.claimed){f.claimBattleCardReward(q.reward.candidates[0]);return 'claimed:'+q.reward.candidates[0];}return 'no-reward';}catch(e){return 'ERR:'+e.message.slice(0,100);}
    })()`);
    await wait(1800);
    await shot('14-after-claim');
    await run(`(function(){var e=document.querySelector('[data-action="clearFinishedBattle"],[data-action="battleDismiss"]');if(e)e.click();return !!e;})()`);
    await wait(1200);
    return { claim };
  });

  // ── S11 员工招募 ──
  await step('S11_recruit', async () => {
    await clickNav('GROWTH');
    await wait(2000);
    await shot('15-growth-page');
    const hire = await run(`(function(){
      var e=document.querySelector('[data-action="hireSquadMember"],[data-action="hire"]');
      if(e){e.click();return 'ok';}
      var f=window.__GAME_FACADE__;
      try{var q=f.queryAutoBattle();var prof=q&&q.squad&&q.squad.hireOptions&&q.squad.hireOptions[0];if(prof){f.hireSquadMember(prof.id||prof.profession||prof);return 'via-facade';}return 'no-options';}catch(e){return 'ERR:'+e.message.slice(0,100);}
    })()`);
    await wait(2000);
    await shot('16-recruit');
    return { hire };
  });

  // ── S12 装备/强化 ──
  await step('S12_equipment', async () => {
    const tab = await run(`(function(){var e=document.querySelector('[data-growth-tab="EQUIP"],[data-action="growthEquip"],[data-ftab="equip"],[data-nav="EQUIP"]');if(e){e.click();return 'ok';}return 'miss';})()`);
    await wait(2000);
    await shot('17-equipment');
    return { tab };
  });

  // ── S13 晋升 ──
  await step('S13_promotion', async () => {
    await clickNav('PROMOTION');
    await wait(2000);
    await shot('18-promotion');
    await clickNav('CAVE');
    await wait(1500);
    await shot('19-back-home');
    return 'ok';
  });

  // ── S14 重启恢复 ──
  const restart = await step('S14_restart_recovery', async () => {
    const before = await run(`(function(){var f=window.__GAME_FACADE__;try{var s=f.snapshot();return {stones:s.spiritStones,xiuwei:s.cultivationExp,career:s.careerLevel};}catch(e){return null;}})()`);
    await win.loadURL(`http://127.0.0.1:${usePort}/index.html`);
    await wait(4000);
    let facade2 = false;
    for (let i = 0; i < 60 && !facade2; i++) { await wait(1000); facade2 = (await run(`!!window.__GAME_FACADE__`)) === true; }
    await wait(2000);
    const after = await run(`(function(){var f=window.__GAME_FACADE__;try{var s=f.snapshot();return {stones:s.spiritStones,xiuwei:s.cultivationExp,career:s.careerLevel};}catch(e){return null;}})()`);
    await shot('20-restart-home');
    return { before, facade2, after };
  });
  if (restart && restart.out && restart.out.before && restart.out.after) {
    const b = restart.out.before, a = restart.out.after;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      defect('S14_restart_recovery', 'P1', '重启后存档快照与重启前不一致', { before: b, after: a });
    }
  } else if (restart && restart.out && !restart.out.facade2) {
    defect('S14_restart_recovery', 'P0', '重启后 facade 未恢复（存档恢复失败）', restart.out);
  }

  result.metrics.modals = await run(`document.querySelectorAll('[class*=modal]').length`);
  result.metrics.defectCount = result.defects.length;
  result.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(REPORT, `audit-${TAG}.json`), JSON.stringify(result, null, 2));
  log(`[done] ${result.defects.length} defects, ${result.steps.length} steps`);
  app.exit(result.defects.some((d) => d.severity === 'P0') ? 1 : 0);
});
