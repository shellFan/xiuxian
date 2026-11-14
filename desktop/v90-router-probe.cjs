/**
 * V9.0 page-router probe: verifies the five-page architecture end-to-end.
 * CAVE(洞府) → BATTLE(战斗,独立页) → state continuity → GROWTH(养成) → PROJECT(挑战) → TASKS.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v90');
const SHOT = path.join(OUT, 'screenshots', 'after');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v90-router-probe.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 150) }; }
  };
  const shot = async (name) => {
    try {
      const img = await winRef().webContents.capturePage();
      fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG());
      logf('[shot] ' + name);
    } catch (e) { logf('[shot-fail] ' + name); }
  };
  const clickNav = (tab) => run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('` + tab + `')>=0){ items[i].click(); return 1; } } var el=document.querySelector('[data-nav="` + tab + `"]'); if(el){el.click(); return 2;} return 0; })()`);
  const pageProbe = () => run(`(function(){
    var f=window.__GAME_FACADE__; var ab=null; try{ ab=f&&f.queryAutoBattle?f.queryAutoBattle():null; }catch(e){}
    return {
      screenMarker: {
        cave: !!document.querySelector('.ux-cave-battle-card'),
        battle: !!document.querySelector('.ux65-stage'),
        growth: !!document.querySelector('.ux-grow-syns'),
        challenge: (document.body.innerText||'').indexOf('项目攻坚')>=0,
        tasks: (document.body.innerText||'').indexOf('今日工作')>=0
      },
      battleAlive: !!document.getElementById('Ux66EnemySprite'),
      enemyHp: ab&&ab.enemy?ab.enemy.hp:null,
      stage: ab?ab.stage:null,
      status: ab?ab.status:null
    };
  })()`);

  await wait(14000);
  // creation → home
  let home = false;
  for (let i = 0; i < 40 && !home; i++) {
    const st = await run(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn') || document.querySelector('#V2EventOk');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__, q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      if (document.querySelector('.ux-cave-battle-card') || document.querySelector('.ux65-stage')) return {action:'home'};
      function click(sel){ var e=document.querySelector(sel); if(!e) return null; if(e.disabled) return 'disabled'; e.click(); return 'ok'; }
      function primary(){ return click('[data-creation-action="advance"]') || click('[data-creation-action="finalize"]') || click('[data-creation-action="start-game"]') || click('[data-creation-action="onboarding-skip"]') || click('[data-creation-action="onboarding-next"]'); }
      var wiz = !!document.querySelector('.v59-creation');
      if (!wiz) { var r = primary(); return r ? {action:'primary'} : {action:'wait'}; }
      if (!d) return {action:'nodraft'};
      var s = d.step;
      if (s==='INDUSTRY'){ if(!d.industry) return {action:'ind',result:click('[data-creation-choice="industry:INTERNET"]')}; }
      else if (s==='DIRECTION'){ if(!d.direction) return {action:'dir',result:click('[data-creation-choice="direction:TECH_RND"]')}; }
      else if (s==='PROFESSION'){ if(!d.professionConfirmed) return {action:'prof',result:click('[data-creation-choice="profession:JAVA_BACKEND"]')}; }
      else if (s==='IDENTITY'){ var inp=document.querySelector('#v59-nickname');
        if(!d.background) return {action:'bg',result:click('[data-creation-choice="background:ORDINARY_WORKER"]')};
        if (inp && inp.value!=='V90路由'){ inp.value='V90路由'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V90路由') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && (st.action === 'home' || st.action === 'primary')) home = true;
    await wait(650);
  }
  logf('creation done, home-ish=' + home);
  await wait(2500);

  const result = { pages: [] };
  // CAVE
  result.pages.push({ page: 'CAVE', state: await pageProbe() });
  await shot('v90-01-cave');
  // → BATTLE
  await clickNav('战斗');
  await wait(1500);
  const battle = await pageProbe();
  result.pages.push({ page: 'BATTLE', state: battle });
  await shot('v90-02-battle');
  // combat continues: tap attack twice
  await run(`(function(){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b){b.click(); b.click();} return 1; })()`);
  await wait(1200);
  const battle2 = await pageProbe();
  result.pages.push({ page: 'BATTLE+tap', state: battle2 });
  // → GROWTH
  await clickNav('养成');
  await wait(1500);
  result.pages.push({ page: 'GROWTH', state: await pageProbe() });
  await shot('v90-03-growth');
  // → PROJECT(挑战)
  await clickNav('挑战');
  await wait(1500);
  result.pages.push({ page: 'PROJECT', state: await pageProbe() });
  await shot('v90-04-challenge');
  // → TASKS
  await clickNav('任务');
  await wait(1500);
  result.pages.push({ page: 'TASKS', state: await pageProbe() });
  await shot('v90-05-tasks');
  // back to BATTLE — state must persist (no re-init)
  await clickNav('战斗');
  await wait(1500);
  const back = await pageProbe();
  result.pages.push({ page: 'BATTLE-again', state: back });
  await shot('v90-06-battle-again');

  result.assessment = {
    caveRenders: result.pages[0].state.screenMarker.cave,
    battleRenders: battle.screenMarker.battle,
    battleAlive: battle.battleAlive,
    combatProgressed: battle2.battleAlive && (battle.enemyHp !== null ? battle2.enemyHp !== battle.enemyHp : true),
    growthRenders: result.pages[3].state.screenMarker.growth,
    challengeRenders: result.pages[4].state.screenMarker.challenge,
    tasksRenders: result.pages[5].state.screenMarker.tasks,
    battleStatePersisted: back.battleAlive && back.stage === battle.stage
  };
  logf('assessment=' + JSON.stringify(result.assessment));
  fs.writeFileSync(path.join(OUT, 'v90-router-probe.json'), JSON.stringify(result, null, 2));
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
