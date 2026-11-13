/**
 * V8.0 V7.2 — animation probe: verifies the five enemy sprite animations
 * (idle/attack/hit/death/victory) with real frame sequencing (background-position
 * samples), plus combat feel signals (damage float layer, hit fx, victory overlay).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v80');
const SHOT = path.join(OUT, 'screenshots', 'after');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v80-anim-probe.log');
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
  await wait(14000);
  // drive creation to home (same compact loop)
  let home = false;
  for (let i = 0; i < 40 && !home; i++) {
    const st = await run(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__, q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      if (document.querySelector('.ux65-stage') || document.querySelector('[data-action="v63-tapAttack"]')) return {action:'home'};
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
        if (inp && inp.value!=='V80动画'){ inp.value='V80动画'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V80动画') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && st.action === 'home') home = true;
    await wait(650);
  }
  logf('home=' + home);
  if (!home) { app.exit(1); return; }
  await wait(3000);

  const result = { home, idleFrames: [], observations: {} };
  // 1. IDLE frame sequence: sample background-position 8x @ 260ms (idle 4fps → ~1 frame per sample)
  for (let i = 0; i < 8; i++) {
    const s = await run(`(function(){
      var el=document.getElementById('Ux66EnemySprite');
      if(!el) return null;
      var cs=getComputedStyle(el);
      return { bg:cs.backgroundImage.slice(0,90), pos:cs.backgroundPosition, size:cs.backgroundSize };
    })()`);
    result.idleFrames.push(s);
    await wait(260);
  }
  const positions = result.idleFrames.filter(Boolean).map(s => s.pos);
  result.observations.idleFrameVariety = Array.from(new Set(positions)).length;
  logf('idle variety=' + result.observations.idleFrameVariety + ' positions=' + JSON.stringify(positions.slice(0, 8)));

  // 2. TAP ATTACK: capture frames rapidly through attack/hit window + float dmg
  const hpBefore = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return v&&v.enemy?v.enemy.hp:null; })()`);
  const frames = [];
  for (let i = 0; i < 10; i++) {
    if (i === 1) { await run(`(function(){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); return 1; })()`); }
    const s = await run(`(function(){
      var el=document.getElementById('Ux66EnemySprite');
      var fx=document.getElementById('Ux65DmgLayer');
      return { pos: el?getComputedStyle(el).backgroundPosition:null,
        bg: el?getComputedStyle(el).backgroundImage.slice(0,80):null,
        floats: fx?fx.children.length:0,
        hitFx: !!document.querySelector('.ux65-hit') };
    })()`);
    frames.push(s);
    await wait(160);
  }
  const hpAfter = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return v&&v.enemy?v.enemy.hp:null; })()`);
  result.observations.tapAttackHpDelta = (hpBefore !== null && hpAfter !== null) ? hpBefore - hpAfter : null;
  result.observations.tapFramesSampled = frames.filter(Boolean).length;
  result.observations.floatDmgSeen = frames.some(s => s && s.floats > 0);
  result.observations.hitFxSeen = frames.some(s => s && s.hitFx);
  logf('tap: hpDelta=' + result.observations.tapAttackHpDelta + ' floatsSeen=' + result.observations.floatDmgSeen + ' hitFx=' + result.observations.hitFxSeen);
  await shot('anim-01-combat');

  // 3. SKILL cast: distinct icons present + skill result
  const skill = await run(`(function(){
    var icons=Array.prototype.map.call(document.querySelectorAll('.ux64-skill-icon'),function(i){return i.getAttribute('src');});
    var b=document.querySelector('[data-action="v64-useSkill"]:not([disabled])');
    var name=b?b.getAttribute('data-skill'):null;
    if(b) b.click();
    return { icons:icons, cast:name };
  })()`);
  result.observations.skillIcons = skill && skill.icons;
  result.observations.skillCast = skill && skill.cast;
  await wait(500);
  await shot('anim-02-skill');

  // 4. wait for enemy kill → death animation + victory overlay
  let victorySeen = false;
  for (let i = 0; i < 30 && !victorySeen; i++) {
    const s = await run(`(function(){
      var st=document.querySelector('.ux65-enemy-status');
      return { status: st?(st.className||''):null, text: st?(st.innerText||'').slice(0,12):null };
    })()`);
    if (s && s.status && String(s.status).includes('victory')) { victorySeen = true; result.observations.victoryOverlay = s.text; }
    await wait(1000);
  }
  result.observations.victorySeen = victorySeen;
  logf('victory seen=' + victorySeen);
  await shot('anim-03-victory');

  fs.writeFileSync(path.join(OUT, 'v80-anim-probe.json'), JSON.stringify(result, null, 2));
  logf('DONE');
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
