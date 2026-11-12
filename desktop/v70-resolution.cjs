/**
 * V7.0 multi-resolution capture: boots the real game, reaches home, then
 * resizes the BrowserWindow across the four acceptance resolutions, capturing
 * reachability + screenshots at each size.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v70');
const SHOT = path.join(OUT, 'screenshots', 'resolution');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v70-resolution.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

const SIZES = [
  { w: 1280, h: 720, name: '1280x720' },
  { w: 1366, h: 768, name: '1366x768' },
  { w: 1600, h: 900, name: '1600x900' },
  { w: 1920, h: 1080, name: '1920x1080' },
];

app.whenReady().then(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 150) }; }
  };
  const shot = async (name) => {
    try {
      const img = await winRef().webContents.capturePage();
      fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG());
    } catch (e) { logf('[shot-fail] ' + name + ' ' + e.message); }
  };
  logf('begin');
  await wait(14000);
  // drive creation to home (compact loop)
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
        if (inp && inp.value!=='V70多分辨率'){ inp.value='V70多分辨率'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V70多分辨率') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && st.action === 'home') home = true;
    await wait(650);
  }
  logf('home=' + home);
  await wait(2000);

  const result = { home, sizes: [] };
  for (const sz of SIZES) {
    try { winRef().setSize(sz.w, sz.h); } catch (e) { logf('setSize fail: ' + e.message); }
    await wait(1600);
    const audit = await run(`(function(){
      var body=document.querySelector('#UiBody'); var limit=body?Math.round(body.getBoundingClientRect().height):innerHeight;
      var keys=['v64-useSkill','v64-toggleSpeed','v63-toggleAuto','v63-upgradeClick','v63-enterTower','v64-openEquip','v64-openGoals'];
      var out={}; for(var i=0;i<keys.length;i++){var e=document.querySelector('[data-action="'+keys[i]+'"]');if(!e){out[keys[i]]=null;continue;}var r=e.getBoundingClientRect();out[keys[i]]={bottom:Math.round(r.bottom),inFirstScreen:r.bottom<=limit};}
      var clipped=0; var all=document.querySelectorAll('#UiBody *');
      for(var j=0;j<all.length;j++){var el=all[j]; if(el.children.length) continue; var t=(el.textContent||'').trim(); if(!t) continue; var r2=el.getBoundingClientRect(); if(r2.width<1||r2.height<1) continue; var s2=getComputedStyle(el); if(el.scrollWidth>el.clientWidth+2 && s2.overflow!=='visible') clipped++;}
      return {viewport:{w:innerWidth,h:innerHeight}, firstScreen:Object.keys(out).filter(function(k){return out[k]&&out[k].inFirstScreen;}).length+'\/7',
        overflowX:document.documentElement.scrollWidth>innerWidth+2, overflowY:document.documentElement.scrollHeight>innerHeight+2, clipped:clipped,
        stage:(function(){var s3=document.querySelector('.ux65-stage');return s3?{w:Math.round(s3.getBoundingClientRect().width),h:Math.round(s3.getBoundingClientRect().height)}:null;})()};
    })()`);
    result.sizes.push({ size: sz.name, audit });
    logf(sz.name + ' -> ' + JSON.stringify(audit));
    await shot('res-' + sz.name);
  }
  fs.writeFileSync(path.join(OUT, 'v70-resolution-audit.json'), JSON.stringify(result, null, 2));
  logf('DONE');
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
