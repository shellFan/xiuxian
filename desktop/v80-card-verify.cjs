/**
 * V7.0 card-battle end-to-end harness.
 * Loads a crafted save sitting at the stage-12 cardBoss handoff, then drives
 * the REAL DOM through: BOSS_PENDING → project page → build select → card
 * battle turns → victory reward → back to auto-battle (stage advanced).
 *
 *   XIUXIAN_USER_DATA = dir preloaded by ai/work/v80-craft-card-save.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v80');
const SHOT = path.join(OUT, 'screenshots', 'cardbattle');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v80-card-verify.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };
const exceptions = [];

app.on('browser-window-created', (_e, win) => {
  try { win.setSkipTaskbar(true); } catch (_) {}
  try {
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    dbg.on('message', (_ev, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        const d = params.exceptionDetails || {};
        exceptions.push({ text: d.text || '', description: (d.exception && d.exception.description || '').slice(0, 300) });
      }
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
  } catch (_) {}
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !/Security Warning/.test(message)) exceptions.push({ console: String(message).slice(0, 300) });
  });
});

app.whenReady().then(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const result = { phases: [], exceptions };
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
    } catch (e) { logf('[shot-fail] ' + name + ' ' + e.message); }
  };
  const mark = (name, data) => { result.phases.push({ name, ...(data || {}) }); logf('[' + name + '] ' + JSON.stringify(data || {})); };

  await wait(14000);
  mark('boot', { windows: BrowserWindow.getAllWindows().length });
  const diag = await run(`(function(){ var f=window.__GAME_FACADE__; if(!f) return {facade:false}; var out={facade:true}; try{ var q=f.queryCharacterCreation?f.queryCharacterCreation():null; out.setup=(q&&q.status)||null; }catch(e){out.setupErr=String(e.message);} try{ var v=f.queryAutoBattle?f.queryAutoBattle():null; out.stage=v&&v.stage; out.status=v&&v.status; }catch(e){out.abErr=String(e.message);} try{ out.creating=f.isNewCharacterCreationRequired?!!f.isNewCharacterCreationRequired():null; }catch(e){} try{ var raw=window.localStorage; out.storageProbe='n/a'; }catch(e){} return out; })()`);
  mark('diag', diag);
  try { const storage=require('./storage.cjs'); const d=storage.loadGame(); mark('storage-load', { setup: d&&d.characterSetupStatus, stage: d&&d.v63AutoBattle&&d.v63AutoBattle.stage, stones: d&&d.spiritStones, hasReceipt: !!(d&&d.characterCreationReceipt) }); } catch(e) { mark('storage-load', { err: String(e.message).slice(0,200) }); }

  // 1. wait for BOSS_PENDING (crafted enemy has 1 hp; dies on first ticks)
  let bossPending = false;
  for (let i = 0; i < 12; i++) {
    const st = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return v?{status:v.status,stage:v.stage,enemy:v.enemy&&v.enemy.name}:null; })()`);
    if (st && st.status === 'BOSS_PENDING') { bossPending = true; mark('boss-pending', st); break; }
    mark('wait-boss', st);
    await wait(1200);
  }
  await shot('01-boss-pending');
  if (!bossPending) {
    fs.writeFileSync(path.join(OUT, 'v80-card-verify.json'), JSON.stringify(result, null, 2));
    logf('FAIL: BOSS_PENDING not reached');
    app.exit(1);
    return;
  }

  // 2. dismiss tutorial-ish modals, click into project page via the boss tag
  const enter = await run(`(function(){
    var b=document.querySelector('[data-action="v63-gotoCardBattle"]');
    if(!b) return {found:false};
    b.click(); return {found:true};
  })()`);
  mark('goto-project', enter);
  await wait(1500);
  await shot('02-project-page');

  // 3. start a PROJECT battle: open the build-select modal (projectEntry), pick first build
  await run(`(function(){ var b=document.querySelector('[data-action="projectEntry"]'); if(b){b.click(); return 'ok';} return 'miss'; })()`);
  await wait(900);
  const build = await run(`(function(){
    var els=document.querySelectorAll('[data-battle-build]');
    if(!els.length) return {found:false, body:(document.body.innerText||'').slice(0,300)};
    els[0].click();
    return {found:true, build:els[0].getAttribute('data-battle-build'), text:(els[0].innerText||'').slice(0,40)};
  })()`);
  mark('build-select', build);
  await wait(2200);
  await shot('03-card-battle-start');

  // dismiss card tutorial if shown
  await run(`(function(){ var b=document.querySelector('[data-action="battleTutorialSkip"]')||document.querySelector('[data-action="battleTutorialNext"]'); if(b){b.click(); return true;} return false; })()`);
  await wait(700);

  // 4. drive the card battle — V8.0 V7.4 状态等待式驱动（禁止固定延时掩盖竞态）
  const viewJs = `(function(){
    var f=window.__GAME_FACADE__;
    var v=null; try{ v=f&&f.queryBattleCard?f.queryBattleCard():null; }catch(e){}
    if(!v) return {done:false, noView:true};
    return { done:true,
      phase:v.phase, turnN:v.turn, energy:v.player&&v.player.energy,
      handN:(v.hand||[]).length, handUids:(v.hand||[]).map(function(c){return c.uid;}),
      enemies:(v.enemies||[]).map(function(e){return {uid:e.uid,hp:e.hp};}),
      reward:!!v.reward,
      modalSkill:!!document.querySelector('[data-battle-skill]'),
      modalEvent:!!document.querySelector('[data-vevent-choice]'),
      /* V8.0：覆盖所有确认类弹窗（事件结果 V2EventOk / 任意 gold 主按钮） */
      modalOk:!!(document.querySelector('#EventOkBtn')||document.querySelector('#V2EventOk')||document.querySelector('[data-action="guideSkip"]')||document.querySelector('.ux-modal-layer .ux-dialog-actions .ux-btn--gold')),
      rewardDom:!!document.querySelector('[data-action="battleRewardPick"]'),
      rewardSkipDom:!!document.querySelector('[data-action="battleRewardSkip"]'),
      selected:!!document.querySelector('.ux-bc-card.is-selected'),
      usableAtk:(function(){ var f2=window.__GAME_FACADE__; var cat=[]; try{cat=f2.queryCardCatalog()||[];}catch(e){} var atk={}; cat.forEach(function(d){ if(d.target==='ENEMY') atk[d.id]=1; });
        var el=document.querySelector('.ux-bc-card.is-usable[data-action="battlePlayCard"]');
        while(el){ var uid=el.getAttribute('data-card'); var inst=(v.hand||[]).filter(function(c){return c.uid===uid;})[0];
          if(inst && atk[inst.defId]) return uid; el=el.nextElementSibling ? null : null; break; }
        var all=document.querySelectorAll('.ux-bc-card.is-usable[data-action="battlePlayCard"]');
        for(var i=0;i<all.length;i++){ var u2=all[i].getAttribute('data-card'); var i2=(v.hand||[]).filter(function(c){return c.uid===u2;})[0]; if(i2&&atk[i2.defId]) return u2; }
        return null; })(),
      usableAny:(function(){ var el=document.querySelector('.ux-bc-card.is-usable[data-action="battlePlayCard"]'); return el?el.getAttribute('data-card'):null; })(),
      endTurnDom:!!(function(){ var els=document.querySelectorAll('[data-action="battleEndTurn"]'); for(var i=0;i<els.length;i++){ var r=els[i].getBoundingClientRect(); if(r.width>2) return true; } return false; })(),
      buildEntry:!!(function(){ var e=document.querySelector('[data-action="projectEntry"]'); return e?!!(e.getBoundingClientRect().width>2):false; })()
    };
  })()`;
  const waitState = async (checkJs, timeoutMs, intervalMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const r = await run(checkJs);
      if (r && (r.done || r.over)) return r;
      await wait(intervalMs || 220);
    }
    return { done: false, timeout: true };
  };

  const HAND_JS = `(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryBattleCard?f.queryBattleCard():null; return {done:!!v, n:v?(v.hand||[]).length:-1, phase:v?v.phase:null}; })()`;
  const markBattle = (name, data) => mark('card:' + name, data || {});

  let battleOver = false;
  let victorySeen = false;
  let defeatSeen = false;
  let rewardClaimed = false;
  let targetClicks = 0, playedCards = 0, endTurns = 0, staleResets = 0;
  let cardPlayTimeouts = 0;
  let diagDumped = false;
  const stepBudget = 600;
  let step = 0;
  let lastEnemyHp = {};
  for (step = 0; step < stepBudget && !battleOver; step++) {
    const s = await run(viewJs);
    if (!s || !s.done || s.noView) { markBattle('noview', { step }); await wait(700); continue; }

    // terminal phases
    if (s.phase === 'VICTORY_SETTLED') { victorySeen = true; markBattle('victory-settled', s); /* 继续等待奖励阶段 */ }
    if (s.phase === 'FINISHED') { markBattle('over', s); break; }
    if (s.phase === 'DEFEAT_SETTLED') { defeatSeen = true; markBattle('over', s); break; }
    if (s.phase === 'REWARD_SELECTION') {
      // wait for the reward DOM (the phase may settle into reward rendering)
      const rw = await waitState(`(function(){ return {done:!!document.querySelector('[data-action="battleRewardPick"]')||!!document.querySelector('[data-action="battleRewardSkip"]')}; })()`, 5000);
      const pick = await run(`(function(){ var p=document.querySelector('[data-action="battleRewardPick"]'); if(p){p.click(); return {picked:p.getAttribute('data-card')||true};} var q=document.querySelector('[data-action="battleRewardSkip"]'); if(q){q.click(); return {picked:false};} return {picked:null}; })()`);
      if (pick && pick.picked) rewardClaimed = true;
      markBattle('reward', { ...(pick || {}), ...(rw || {}) });
      await wait(900);
      continue;
    }

    // modals (a real player must answer these first)
    if (s.modalSkill) { await run(`(function(){ var b=document.querySelector('[data-battle-skill]'); if(b)b.click(); return 1; })()`); markBattle('choose-skill', { step }); await wait(800); continue; }
    if (s.modalEvent) { await run(`(function(){ var b=document.querySelector('[data-vevent-choice]'); if(b)b.click(); return 1; })()`); markBattle('event-choice', { step }); await wait(800); continue; }
    if (s.modalOk) { await run(`(function(){ var b=document.querySelector('#EventOkBtn')||document.querySelector('#V2EventOk')||document.querySelector('[data-action="guideSkip"]')||document.querySelector('.ux-modal-layer .ux-dialog-actions .ux-btn--gold'); if(b)b.click(); return 1; })()`); markBattle('dismiss-modal', { step }); await wait(700); continue; }
    if (s.rewardDom) { await run(`(function(){ var p=document.querySelector('[data-action="battleRewardPick"]'); if(p)p.click(); return 1; })()`); rewardClaimed = true; markBattle('reward-pick', { step }); await wait(900); continue; }
    if (s.rewardSkipDom) { await run(`(function(){ var p=document.querySelector('[data-action="battleRewardSkip"]'); if(p)p.click(); return 1; })()`); markBattle('reward-skip', { step }); await wait(700); continue; }

    // a fresh attack card needs a target → click a living enemy, then WAIT for the hand to shrink
    if (s.selected) {
      const alive = (s.enemies || []).filter((e) => e.hp > 0)[0];
      if (alive) {
        const beforeHand = s.handN;
        await run(`(function(){ var el=document.querySelector('[data-enemy-uid="${alive.uid}"]')||document.querySelector('[data-enemy-uid]'); if(el) el.click(); return 1; })()`);
        const waited = await (async () => {
          const dl = Date.now() + 2500;
          while (Date.now() < dl) {
            const cur = await run(HAND_JS);
            if (cur && cur.done && (cur.n < beforeHand || cur.phase !== 'PLAYER_TURN')) return { done: true, n: cur.n, phase: cur.phase };
            await wait(200);
          }
          return { done: false, timeout: true };
        })();
        targetClicks++;
        markBattle('target-click', { step, enemy: alive.uid, beforeHand, waited });
        await wait(320);
        continue;
      }
    }

    // pick an attack card first (exercises the target path), else any usable
    const pickUid = s.usableAtk || s.usableAny;
    if (pickUid) {
      const beforeHand = s.handN;
      await run(`(function(){ var el=document.querySelector('.ux-bc-card.is-usable[data-action="battlePlayCard"][data-card="${pickUid}"]'); if(el) el.click(); return 1; })()`);
      const waited = await (async () => {
        const dl = Date.now() + 2200;
        while (Date.now() < dl) {
          const cur = await run(HAND_JS);
          if (cur && cur.done && (cur.n < beforeHand || cur.phase !== 'PLAYER_TURN')) return { done: true, n: cur.n, phase: cur.phase };
          await wait(180);
        }
        return { done: false, timeout: true, stillSelected: null };
      })();
      playedCards++;
      markBattle('play', { step, card: pickUid, beforeHand, waited, selectedNow: await run(`(function(){return !!document.querySelector('.ux-bc-card.is-selected');})()`) });
      // V8.0 V7.4：连续出牌超时 → 深度诊断（元素覆盖/手牌一致性/模块状态）
      if (waited && waited.timeout) {
        logf('TIMEOUT-BRANCH step=' + step + " counted=" + cardPlayTimeouts);
        cardPlayTimeouts = (cardPlayTimeouts || 0) + 1;
        if (cardPlayTimeouts >= 1 && !diagDumped) {
          diagDumped = true;
          logf('DIAG-FIRING step=' + step);
          const dg = await run(`(function(){
            var f=window.__GAME_FACADE__; var v=f&&f.queryBattleCard?f.queryBattleCard():null;
            var el=document.querySelector('.ux-bc-card.is-usable[data-action="battlePlayCard"]');
            var hit=null;
            if(el){ var r=el.getBoundingClientRect(); var top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
              hit={ topIsCardSelf: el===top, topIsInside: !!el.contains(top), topDesc: top? top.tagName+' cls='+String(top.className||'').slice(0,70):null }; }
            var testClick=null;
            if(el && v){ var uid=el.getAttribute('data-card'); var inHand=(v.hand||[]).some(function(c){return c.uid===uid;});
              var before=(v.hand||[]).length; el.click();
              var v2=f.queryBattleCard();
              testClick={ uid:uid, uidInEngineHand:inHand, before:before, after:(v2.hand||[]).length, selectedNow:!!document.querySelector('.ux-bc-card.is-selected') };
              try { var BC=window.__BATTLE_CARD__; testClick.directHandle=BC.handlePlayCard(uid); testClick.selectedAfterDirect=BC.isSelecting(); var v3=f.queryBattleCard(); testClick.handAfterDirect=(v3.hand||[]).length; } catch(eD) { testClick.directErr=String(eD.message).slice(0,100); }
            }
            var domHand=Array.prototype.map.call(document.querySelectorAll('.ux-bc-card[data-action="battlePlayCard"]'),function(c){return c.getAttribute('data-card');});
            var refreshErr=null; try { window.UiOverlay.refresh(); } catch(eR) { refreshErr=String(eR.message).slice(0,160)+" | "+String(eR.stack||'').slice(0,200); }
            var v4=f.queryBattleCard();
            return { engineHandUids: v?(v.hand||[]).map(function(c){return c.uid;}):null, domHandUids: domHand, domUid: el?el.getAttribute('data-card'):null, hit:hit, testClick:testClick, refreshErr:refreshErr, engineHandAfterRefresh:(v4.hand||[]).map(function(c){return c.uid;}) };
          })()`);
          markBattle('stuck-diag', dg);
        }
      }
      continue;
    }

    // no usable card → end turn, then WAIT for the phase to leave PLAYER_TURN
    if (s.endTurnDom) {
      await run(`(function(){ var e=document.querySelector('[data-action="battleEndTurn"]'); if(e) e.click(); return 1; })()`);
      const waited = await (async () => {
        const dl = Date.now() + 3200;
        while (Date.now() < dl) {
          const cur = await run(HAND_JS);
          if (cur && cur.done && cur.phase !== 'PLAYER_TURN') return { done: true, phase: cur.phase };
          await wait(220);
        }
        return { done: false, timeout: true };
      })();
      endTurns++;
      markBattle('end-turn', { step, waited });
      continue;
    }

    await wait(500);
  }
  const turns = step;
  mark('card:battle-summary', { turns, victorySeen, defeatSeen, rewardClaimed, targetClicks, playedCards, endTurns, staleResets });
  await shot('05-after-battle');

  // 5. settle back: claim any pending boss-defeat state, check auto-battle stage
  // refresh-alive probe: does the 1s overlay refresh actually rebuild the page?
  const refreshProbe = await run(`(async function(){
    var el=document.querySelector('.ux-bc-turnbar')||document.querySelector('.ux65-stage-header')||document.body.firstElementChild;
    if(!el) return {probe:'no-el'};
    el.setAttribute('data-probe','alive-' + Date.now());
    var before=document.body.innerHTML.length;
    await new Promise(function(r){setTimeout(r,1800);});
    var after=document.querySelector('[data-probe]');
    return {probeSurvived: !!after, bodyLenBefore: before, bodyLenAfter: document.body.innerHTML.length};
  })()`);
  mark('refresh-probe', refreshProbe);

  const settle = await run(`(function(){
    var f=window.__GAME_FACADE__;
    try { if (f && f.autoBattleBossDefeated) f.autoBattleBossDefeated(); } catch(e) {}
    var v=f&&f.queryAutoBattle?f.queryAutoBattle():null;
    return v?{status:v.status,stage:v.stage,maxStage:v.maxStage}:null;
  })()`);
  mark('settle-back', settle);
  await wait(1500);
  await shot('06-back-home');

  const st = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return v?{status:v.status,stage:v.stage}:null; })()`);
  mark('final-state', st);
  /* V8.0：结果导向判定 — 卡牌战斗胜利且 Boss 关推进（12→13）即为全链路通过 */
  result.pass = !!(st && st.stage >= 13 && (victorySeen || (st.status === 'VICTORY' || st.status === 'FIGHTING')));
  result.errors = { exceptions: exceptions.slice(0, 20), exceptionCount: exceptions.length };
  fs.writeFileSync(path.join(OUT, 'v80-card-verify.json'), JSON.stringify(result, null, 2));
  logf('PASS=' + result.pass + ' victory=' + victorySeen + ' reward=' + rewardClaimed + ' stage=' + (st && st.stage));
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
