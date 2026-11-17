/**
 * V10.0 独立 QA：卡牌战斗 3 局完整实测。
 * 入口：BOSS_PENDING Boss 标签 → 项目页 → projectEntry → 选 Build → 卡牌战斗。
 * 驱动：状态等待式（每步读 queryBattleCard 视图后行动，禁止固定延时掩盖竞态）。
 * 判定：每局完整走完（出牌→回合→奖励→结算），输出 evidence/qa-cards.json。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('./main.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa');
const EV = path.join(OUT, 'evidence');
const SHOT = path.join(OUT, 'screenshots');
const wait2 = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(EV, 'qa-cards.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

const result = { startedAt: new Date().toISOString(), battles: [], checks: {} };
const check = (name, pass, detail) => {
  result.checks[name] = { pass: !!pass, detail: detail === undefined ? null : detail };
  logf('[CHECK] ' + name + '=' + (pass ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(detail === undefined ? null : detail));
};

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 200) }; }
  };
  const shot = async (name) => {
    try {
      const img = await winRef().webContents.capturePage();
      fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG());
      logf('[shot] ' + name);
    } catch (e) { logf('[shot-fail] ' + name); }
  };
  const DISMISS = `(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','[data-offline-decision-action]','[data-action="battleTutorialSkip"]','[data-action="battleTutorialNext"]','[data-action="guideSkip"]']; for(var j=0;j<sels.length;j++){ var m=document.querySelector(sels[j]); if(m){ m.click(); return sels[j]; } } return null; })()`;

  await wait(9000);
  for (let i = 0; i < 15; i++) { await run(DISMISS); await wait(500); }

  const viewJs = `(function(){
    var f=window.__GAME_FACADE__;
    var v=null; try{ v=f&&f.queryBattleCard?f.queryBattleCard():null; }catch(e){}
    if(!v) return {done:false, noView:true};
    return { done:true,
      phase:v.phase, turnN:v.turn, energy:v.player&&v.player.energy,
      handN:(v.hand||[]).length,
      enemies:(v.enemies||[]).map(function(e){return {uid:e.uid,hp:e.hp};}),
      reward:!!v.reward,
      modalSkill:!!document.querySelector('[data-battle-skill]'),
      modalEvent:!!document.querySelector('[data-vevent-choice]'),
      modalOk:!!(document.querySelector('#EventOkBtn')||document.querySelector('#V2EventOk')||document.querySelector('[data-action="guideSkip"]')||document.querySelector('.ux-modal-layer .ux-dialog-actions .ux-btn--gold')),
      rewardDom:!!document.querySelector('[data-action="battleRewardPick"]'),
      rewardSkipDom:!!document.querySelector('[data-action="battleRewardSkip"]'),
      selected:!!document.querySelector('.ux-bc-card.is-selected'),
      usableAny:(function(){ var el=document.querySelector('.ux-bc-card.is-usable[data-action="battlePlayCard"]'); return el?el.getAttribute('data-card'):null; })(),
      endTurnVisible:(function(){ var els=document.querySelectorAll('[data-action="battleEndTurn"]'); for(var i=0;i<els.length;i++){ var r=els[i].getBoundingClientRect(); if(r.width>2) return true; } return false; })(),
      panelVisible:(function(){ var p=document.querySelector('.ux-battle2'); if(!p) return false; var r=p.getBoundingClientRect(); return r.width>10; })()
    };
  })()`;

  const startBattle = async () => {
    // 路径 A：战斗页 BOSS_PENDING 标签
    await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); return 1; } } return 0; })()`);
    await wait2(1200);
    await run(DISMISS);
    const tag = await run(`(function(){ var b=document.querySelector('[data-action="v63-gotoCardBattle"]'); if(b){ b.click(); return 'tag'; } return null; })()`);
    await wait2(1500);
    // 路径 B：项目页 projectEntry
    const entry = await run(`(function(){ var b=document.querySelector('[data-action="projectEntry"]'); if(b && b.getBoundingClientRect().width>2){ b.click(); return 'entry'; } return null; })()`);
    if (!entry) {
      // 兜底：直接导航项目页再找
      await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('挑战')>=0|| (items[i].innerText||'').indexOf('项目')>=0){ items[i].click(); return 1; } } return 0; })()`);
      await wait2(1500);
      await run(`(function(){ var b=document.querySelector('[data-action="projectEntry"]'); if(b) b.click(); return 1; })()`);
    }
    await wait2(1000);
    const build = await run(`(function(){
      var els=document.querySelectorAll('[data-battle-build]');
      if(!els.length) return {found:false};
      for(var i=0;i<els.length;i++){ if(els[i].getBoundingClientRect().width>2){ els[i].click(); return {found:true, build:els[i].getAttribute('data-battle-build')}; } }
      els[0].click(); return {found:true, build:els[0].getAttribute('data-battle-build')};
    })()`);
    logf('startBattle entry=' + entry + ' tag=' + tag + ' build=' + JSON.stringify(build));
    await wait2(2500);
    await run(DISMISS);
    return { tag: tag, entry: entry, build: build };
  };

  const driveBattle = async (battleNo) => {
    const rec = { battle: battleNo, started: false, playedCards: 0, targetClicks: 0, endTurns: 0, rewards: 0, victory: false, defeat: false, finished: false, skillChoices: 0, events: 0 };
    const deadline = Date.now() + 4 * 60 * 1000;
    let handNPrev = -1, stallSteps = 0;
    while (Date.now() < deadline && !rec.finished) {
      const s = await run(viewJs);
      if (!s || !s.done || s.noView) {
        // 面板不可见 → 尝试判断是否已经结束
        const st2 = await run(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return ab?{status:ab.status,stage:ab.stage}:null; })()`);
        if (st2 && (st2.status === 'FIGHTING' || st2.status === 'VICTORY') && battleNo > 1) { rec.finished = true; rec.stoppedNoView = true; break; }
        await run(DISMISS);
        stallSteps++;
        if (stallSteps > 25) { rec.stalled = true; break; }
        await wait2(700); continue;
      }
      if (!rec.started && s.panelVisible) { rec.started = true; logf('battle' + battleNo + ' panel visible, phase=' + s.phase); await shot('qa-card-' + battleNo + '-start'); }
      if (s.phase === 'FINISHED' || s.phase === 'VICTORY_SETTLED' || s.phase === 'DEFEAT_SETTLED') {
        rec.victory = s.phase !== 'DEFEAT_SETTLED';
        rec.defeat = s.phase === 'DEFEAT_SETTLED';
        // FINISHED 可能还需领取奖励 → 若有 reward DOM 继续领取后再退出
        if (s.phase === 'FINISHED' && !s.rewardDom && !s.rewardSkipDom) { rec.finished = true; break; }
      }
      if (s.phase === 'REWARD_SELECTION' || s.rewardDom || s.rewardSkipDom) {
        const pick = await run(`(function(){ var p=document.querySelector('[data-action="battleRewardPick"]'); if(p){p.click(); return {picked:p.getAttribute('data-card')||true};} var q=document.querySelector('[data-action="battleRewardSkip"]'); if(q){q.click(); return {picked:false};} return {picked:null}; })()`);
        if (pick && pick.picked) rec.rewards++;
        await wait2(900); continue;
      }
      if (s.modalSkill) { await run(`(function(){ var b=document.querySelector('[data-battle-skill]'); if(b)b.click(); return 1; })()`); rec.skillChoices++; await wait2(800); continue; }
      if (s.modalEvent) { await run(`(function(){ var b=document.querySelector('[data-vevent-choice]'); if(b)b.click(); return 1; })()`); rec.events++; await wait2(800); continue; }
      if (s.modalOk) { await run(DISMISS); await wait2(700); continue; }
      // 已选卡 → 点目标，等待手牌缩减
      if (s.selected) {
        const alive = (s.enemies || []).filter((e) => e.hp > 0)[0];
        if (alive) {
          const beforeHand = s.handN;
          await run(`(function(){ var el=document.querySelector('[data-enemy-uid="` + alive.uid + `"]')||document.querySelector('[data-enemy-uid]'); if(el) el.click(); return 1; })()`);
          const dl = Date.now() + 2500;
          let landed = false;
          while (Date.now() < dl) {
            const cur = await run(viewJs);
            if (cur && cur.done && (cur.handN < beforeHand || cur.phase !== 'PLAYER_TURN')) { landed = true; break; }
            await wait2(200);
          }
          rec.targetClicks++;
          if (!landed) { await run(`(function(){ var f=window.__GAME_FACADE__; try{ if(f.cancelCardSelection) f.cancelCardSelection(); }catch(e){} var c=document.querySelector('.ux-bc-card.is-selected'); if(c) c.click(); return 1; })()`); }
          await wait2(300);
          continue;
        }
      }
      // 有可用牌 → 点牌（等待选中状态出现）
      if (s.usableAny && !s.selected) {
        const uid = s.usableAny;
        await run(`(function(){ var el=document.querySelector('.ux-bc-card.is-usable[data-card="` + uid + `"]'); if(el) el.click(); return 1; })()`);
        const dl = Date.now() + 1500;
        let sel = false;
        while (Date.now() < dl) {
          const cur = await run(viewJs);
          if (cur && cur.done && cur.selected) { sel = true; break; }
          if (cur && cur.done && cur.handN < s.handN) { sel = true; break; } // 无目标牌直接结算
          await wait2(200);
        }
        rec.playedCards++;
        if (!sel) await wait2(300);
        continue;
      }
      // 无可用牌 → 结束回合
      if (s.endTurnVisible && s.phase === 'PLAYER_TURN') {
        await run(`(function(){ var b=document.querySelector('[data-action="battleEndTurn"]'); if(b) b.click(); return 1; })()`);
        rec.endTurns++;
        await wait2(1100);
        continue;
      }
      await wait2(500);
    }
    rec.durationMs = 4 * 60 * 1000 - (deadline - Date.now());
    await shot('qa-card-' + battleNo + '-end');
    logf('battle' + battleNo + ' result=' + JSON.stringify({ victory: rec.victory, defeat: rec.defeat, played: rec.playedCards, turns: rec.endTurns, rewards: rec.rewards, started: rec.started, stalled: !!rec.stalled }));
    return rec;
  };

  // 局前状态
  const preStage = await run(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return ab?{status:ab.status,stage:ab.stage}:null; })()`);
  logf('pre-battles state=' + JSON.stringify(preStage));

  // 完成 3 局
  for (let n = 1; n <= 3; n++) {
    const st = await startBattle();
    const probe = await run(viewJs);
    if (!probe || !probe.done || !probe.panelVisible) {
      // 一局都没开始则记录失败原因
      result.battles.push({ battle: n, error: 'panel_not_visible', entry: st });
      check('battle_' + n + '_started', false, { entry: st, probe: probe });
      break;
    }
    check('battle_' + n + '_started', true, { build: st.build && st.build.build });
    const rec = await driveBattle(n);
    result.battles.push(rec);
    check('battle_' + n + '_completed', rec.finished === true && (rec.victory || rec.defeat), { victory: rec.victory, defeat: rec.defeat, played: rec.playedCards, turns: rec.endTurns });
  }

  const completed = result.battles.filter((b) => b.finished && (b.victory || b.defeat));
  const victories = result.battles.filter((b) => b.victory);
  // Boss 通关后阶段应推进
  await wait2(3000);
  const postStage = await run(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return ab?{status:ab.status,stage:ab.stage,maxStage:ab.maxStage}:null; })()`);
  check('boss_battle_unblocks_stage', !!(postStage && postStage.status !== 'BOSS_PENDING'), { pre: preStage, post: postStage });
  result.summary = {
    battlesAttempted: result.battles.length,
    battlesCompleted: completed.length,
    victories: victories.length,
    playedCardsTotal: result.battles.reduce((a, b) => a + (b.playedCards || 0), 0),
  };
  result.summary.verdict = completed.length >= 3 ? 'PASS' : (completed.length >= 1 ? 'PARTIAL' : 'FAIL');
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(EV, 'qa-cards.json'), JSON.stringify(result, null, 2));
  logf('VERDICT=' + result.summary.verdict + ' completed=' + completed.length + '/3');
  app.exit(result.summary.verdict === 'PASS' ? 0 : 2);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
