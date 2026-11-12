/**
 * V7.0 sprite probe — targeted diagnosis of enemy/squad sprite rendering.
 * Boots the real game, drives creation to home, waits into combat, then dumps
 * computed styles of #Ux66EnemySprite and squad sprite containers.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const PHASE = (process.env.V70_PHASE || 'probe').replace(/[^a-zA-Z0-9_-]/g, '') || 'probe';
const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v70');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v70-' + PHASE + '-probe.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

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
      fs.writeFileSync(path.join(OUT, 'screenshots', PHASE, name + '.png'), img.toPNG());
    } catch (_) {}
  };
  logf('probe begin');
  await wait(14000);
  // drive creation to home (same flow as v70-play)
  let homeReached = false;
  for (let round = 0; round < 40 && !homeReached; round++) {
    const step = await run(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn') || document.querySelector('[data-action="guideSkip"]');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__; var q=null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      var wiz = !!document.querySelector('.v59-creation');
      var home = !!document.querySelector('.ux65-stage') || !!document.querySelector('[data-action="v63-tapAttack"]');
      if (home) return {action:'home'};
      function click(sel){ var e=document.querySelector(sel); if(!e) return null; if(e.disabled) return 'disabled'; e.click(); return 'ok'; }
      function primary(){ return click('[data-creation-action="advance"]') || click('[data-creation-action="finalize"]') || click('[data-creation-action="start-game"]') || click('[data-creation-action="onboarding-skip"]') || click('[data-creation-action="onboarding-next"]'); }
      if (!wiz) { var r=primary(); if (r) return {action:'primary',result:r}; return {action:'wait'}; }
      if (!d) return {action:'nodraft'};
      var s=d.step;
      if (s==='INDUSTRY'){ if(!d.industry) return {action:'ind',result:click('[data-creation-choice="industry:INTERNET"]')}; }
      else if (s==='DIRECTION'){ if(!d.direction) return {action:'dir',result:click('[data-creation-choice="direction:TECH_RND"]')}; }
      else if (s==='PROFESSION'){ if(!d.professionConfirmed) return {action:'prof',result:click('[data-creation-choice="profession:JAVA_BACKEND"]')}; }
      else if (s==='IDENTITY'){ var inp=document.querySelector('#v59-nickname');
        if(!d.background) return {action:'bg',result:click('[data-creation-choice="background:ORDINARY_WORKER"]')};
        if (inp && inp.value!=='V70探针'){ inp.value='V70探针'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V70探针') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (step && step.action === 'home') homeReached = true;
    await wait(650);
  }
  logf('homeReached=' + homeReached);
  if (!homeReached) { app.exit(1); return; }

  // early dump at exactly the same timing as the play harness (2.5s after home)
  const early = await run(String.raw`(function(){
    var el=document.getElementById("Ux66EnemySprite");
    var av=document.querySelector(".ux66-squad-sprite");
    function st(e){ if(!e) return null; var s=getComputedStyle(e); return {bg:s.backgroundImage.slice(0,120), op:s.opacity, w:Math.round(e.getBoundingClientRect().width)}; }
    return {t:"2.5s", enemy:st(el), squad:st(av)};
  })()`);
  logf("early=" + JSON.stringify(early));
  await wait(12000);
  const dump = await run(`(function(){
    function style(el){ if(!el) return null; var s=getComputedStyle(el); var r=el.getBoundingClientRect(); return {
      bg:s.backgroundImage.slice(0,160), w:r.width, h:r.height, x:Math.round(r.left), y:Math.round(r.top),
      display:s.display, opacity:s.opacity, visibility:s.visibility, z:s.zIndex, overflow:s.overflow,
      cls:el.className, parentCls:(el.parentElement||{}).className||'' }; }
    var enemy = document.getElementById('Ux66EnemySprite');
    var stage = document.querySelector('.ux65-enemy-stage');
    var squad = document.querySelectorAll('.ux66-squad-sprite');
    var f = window.__GAME_FACADE__; var v=null;
    try { v = f && f.queryAutoBattle ? f.queryAutoBattle() : null; } catch(e){}
    // network probe: try loading the expected sheet directly
    var probe = { enemy: style(enemy), enemyStage: stage ? (function(){var s=getComputedStyle(stage),r=stage.getBoundingClientRect();return{w:r.width,h:r.height,x:Math.round(r.left),y:Math.round(r.top),display:s.display,html:stage.innerHTML.slice(0,300)};})() : null,
      squadCount: squad.length, squadFirst: squad[0] ? style(squad[0]) : null,
      battle: v ? {stage:v.stage, status:v.status, enemy:v.enemy&&{name:v.enemy.name,hp:v.enemy.hp,isBoss:v.enemy.isBoss}} : null,
      sheets: (function(){ var out=[]; for(var i=0;i<70;i++){ var img=new Image(); out.push(null); }
        return 'deferred'; })(),
      testImgs: 'deferred' };
    return probe;
  })()`);
  logf('dump=' + JSON.stringify(dump));
  // async image load probes
  const imgTest = await run(`(function(){
    return new Promise(function(res){
      var names=['bug_idle','requirement_idle','javabackend_idle','debt_idle'];
      var out={},done=0;
      names.forEach(function(n){
        var img=new Image();
        img.onload=function(){out[n]='ok:'+img.naturalWidth+'x'+img.naturalHeight; done++; if(done===names.length)res(out);};
        img.onerror=function(){out[n]='ERR'; done++; if(done===names.length)res(out);};
        img.src='assets/sprites/sheets/'+n+'.png';
      });
      setTimeout(function(){res(out);},5000);
    });
  })()`);
  logf('imgTest=' + JSON.stringify(imgTest));
  await shot('sprite-probe-home');
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
