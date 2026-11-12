/**
 * V7.0 card-battle end-to-end harness.
 * Loads a crafted save sitting at the stage-12 cardBoss handoff, then drives
 * the REAL DOM through: BOSS_PENDING → project page → build select → card
 * battle turns → victory reward → back to auto-battle (stage advanced).
 *
 *   XIUXIAN_USER_DATA = dir preloaded by ai/work/v70-craft-card-save.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v70');
const SHOT = path.join(OUT, 'screenshots', 'cardbattle');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v70-card-verify.log');
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
    fs.writeFileSync(path.join(OUT, 'v70-card-verify.json'), JSON.stringify(result, null, 2));
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

  // 4. drive the card battle with real DOM clicks
  const playTurn = () => run(`(function(){
    var f=window.__GAME_FACADE__;
    var v=null; try{ v=f&&f.queryBattleCard?f.queryBattleCard():null; }catch(e){}
    if(!v) return {view:null};

    // modals first (a real player must answer these): skill 3-choose-1, workplace events, generic confirms
    var skillBtn=document.querySelector('[data-battle-skill]');
    if(skillBtn){ skillBtn.click(); return {action:'choose-skill', skill:skillBtn.getAttribute('data-battle-skill')}; }
    var evtBtn=document.querySelector('[data-vevent-choice]');
    if(evtBtn){ evtBtn.click(); return {action:'event-choice', label:(evtBtn.innerText||'').slice(0,30)}; }
    var okBtn=document.querySelector('#EventOkBtn')||document.querySelector('[data-action="guideSkip"]');
    if(okBtn){ okBtn.click(); return {action:'dismiss-modal', label:(okBtn.innerText||'').slice(0,20)}; }
    var buildEntry=document.querySelector('[data-action="projectEntry"]');
    if(buildEntry && !v.hand) { return {action:'battle-finished-back-to-project', over:true}; }

    // reward layer first
    var rw=document.querySelector('[data-action="battleRewardPick"]');
    if(rw){ rw.click(); return {action:'reward-pick'}; }
    var rws=document.querySelector('[data-action="battleRewardSkip"]');
    if(rws){ rws.click(); return {action:'reward-skip'}; }

    if(v.phase==='VICTORY_SETTLED' || v.phase==='DEFEAT_SETTLED' || v.phase==='FINISHED' || v.over) return {phase:v.phase, over:true};
    if(v.phase==='REWARD_SELECTION' && !document.querySelector('[data-action="battleRewardPick"]') && !document.querySelector('[data-action="battleRewardSkip"]')) return {phase:v.phase, over:true};

    if(document.querySelector('.ux-bc-card.is-selected')){
      var alive=null;
      (v.enemies||[]).forEach(function(e){ if(!alive && e.hp>0) alive=e; });
      var enemyEl = alive ? document.querySelector('[data-enemy-uid="' + alive.uid + '"]') : null;
      if(!enemyEl) enemyEl=document.querySelector('[data-enemy-uid]');
      if(enemyEl){
        enemyEl.click();
        var toastEl=document.querySelector('.ux-toast');
        return {action:'click-enemy', target:alive&&alive.uid, phase:v.phase, hp:v.player&&v.player.hp, enemy:(v.enemies&&v.enemies[0]&&v.enemies[0].hp), toast:toastEl?(toastEl.innerText||'').slice(0,60):null};
      }
    }
    var usable=document.querySelector('.ux-bc-card.is-usable[data-action="battlePlayCard"]');
    if(usable){
      usable.click();
      return {action:'play', card:usable.getAttribute('data-card'), phase:v.phase, hp:v.player&&v.player.hp, enemy:(v.enemies&&v.enemies[0]&&v.enemies[0].hp), needsTarget:true};
    }
    var end=document.querySelector('[data-action="battleEndTurn"]');
    if(end){ end.click(); return {action:'end-turn', phase:v.phase, hp:v.player&&v.player.hp, enemy:(v.enemies&&v.enemies[0]&&v.enemies[0].hp)}; }
    return {action:'none', phase:v.phase, hp:v.player&&v.player.hp, enemy:(v.enemies&&v.enemies[0]&&v.enemies[0].hp)};
  })()`);

  let battleOver = false;
  let turns = 0;
  let victorySeen = false;
  let defeatSeen = false;
  let rewardClaimed = false;
  let lastActionKey = '';
  let repeatCount = 0;
  let diagDumped = false;
  for (turns = 0; turns < 400 && !battleOver; turns++) {
    const r = await playTurn();
    mark('turn', { n: turns, ...(r || {}) });
    const akey = r ? (r.action + ':' + (r.card || r.target || '') + ':' + r.phase) : 'null';
    repeatCount = akey === lastActionKey ? repeatCount + 1 : 0;
    lastActionKey = akey;
    if (repeatCount >= 8 && !diagDumped) {
      diagDumped = true;
      const dg = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryBattleCard?f.queryBattleCard():null; var dom={};
        try { var B=f.queryBattle?f.queryBattle():null; dom.battle={active:!!B, skillOffers:B?B.skillOffers:null, source:B?B.source:null, phase:B?B.phase:null, turnN:B?B.turnNumber:null}; } catch(e0) { dom.battle={err:String(e0.message).slice(0,100)}; }
        try { var OL=window.__UI_OVERLAY__; if(OL&&OL.dispatchNextModal) OL.dispatchNextModal(); } catch(eD) {}
        try { var PL0=document.getElementById('PopupLayer'); dom.afterDispatch=(PL0.innerHTML||'').slice(0,80); dom.v2Available=!!(window.V2UI&&window.V2UI.maybeShowV2EventModal); if(window.V2UI){ window.V2UI.maybeShowV2EventModal(); } var PL1=document.getElementById('PopupLayer'); dom.afterV2Call=(PL1.innerHTML||'').slice(0,120); dom.v2EventNow=(function(){ var f2=window.__GAME_FACADE__; try{ var w=f2&&f2.queryV2CurrentEvent?f2.queryV2CurrentEvent():null; return w?w.id:null; }catch(e3){ return 'THROWS:'+String(e3.message).slice(0,60); } })(); } catch(e4) { dom.v2Err=String(e4.message).slice(0,140); }
        try { var PL=document.getElementById('PopupLayer'); dom.popupAfterDispatch=PL?(PL.innerHTML||'').slice(0,150):'NO-LAYER-ELEMENT'; dom.popupIds=Object.keys(document.body.children).map(function(c){return c.id||c.className;}).slice(0,12); } catch(e2) { dom.popupAfterDispatch='err'; }
        try { var u=document.querySelector('.ux-bc-card.is-usable[data-action="battlePlayCard"]');
          if(u){ var uid=u.getAttribute('data-card'); var r1=f.playBattleCard(uid,null); dom.facadePlay={uid:uid, result:JSON.stringify(r1).slice(0,120)}; }
          else { dom.facadePlay={uid:null, note:'no usable card in DOM'}; }
        } catch(e) { dom.facadePlay={err:String(e.message).slice(0,140)}; }
        dom.selected=!!document.querySelector('.ux-bc-card.is-selected');
        dom.enemyUids=(Array.prototype.map.call(document.querySelectorAll('[data-enemy-uid]'),function(e){return e.getAttribute('data-enemy-uid')+'@hp'+(e.innerText||'').slice(0,20);}))||[];
        dom.usableCount=document.querySelectorAll('.ux-bc-card.is-usable').length;
        dom.layerText=(function(){var l=document.getElementById('UiPopupLayer')||document.querySelector('.ux-modal-layer');return l?(l.innerText||'').slice(0,200):null;})();
        return {view:v?{phase:v.phase,energy:v.player&&v.player.energy,hand:(v.hand||[]).map(function(c){return c.uid+'/'+c.defId;}),enemies:(v.enemies||[]).map(function(e){return e.uid+':'+e.hp;}),reward:!!v.reward,turnN:v.turn}:null, dom:dom};
      })()`);
      mark('stuck-diag', dg);
    }
    if (r && r.action === 'reward-pick') { rewardClaimed = true; await wait(900); continue; }
    if (r && (r.phase === 'VICTORY' || r.phase === 'DEFEAT' || r.over)) {
      if (r.phase === 'VICTORY') victorySeen = true;
      if (r.phase === 'DEFEAT') defeatSeen = true;
      battleOver = true;
      mark('battle-over', r);
      await shot('04-card-battle-end');
      break;
    }
    await wait(650);
  }
  mark('battle-summary', { turns, victorySeen, defeatSeen, rewardClaimed });
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
  result.pass = victorySeen && rewardClaimed && st && st.status === 'FIGHTING' && st.stage >= 13;
  result.errors = { exceptions: exceptions.slice(0, 20), exceptionCount: exceptions.length };
  fs.writeFileSync(path.join(OUT, 'v70-card-verify.json'), JSON.stringify(result, null, 2));
  logf('PASS=' + result.pass + ' victory=' + victorySeen + ' reward=' + rewardClaimed + ' stage=' + (st && st.stage));
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
