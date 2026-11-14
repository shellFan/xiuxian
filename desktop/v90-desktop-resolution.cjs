/** V9.0 desktop resolution probe — 4 desktop sizes on the new五页 architecture. */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'ai', 'reports', 'v90');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v90-desktop-resolution.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

const SIZES = [[1280, 720], [1366, 768], [1600, 900], [1920, 1080]];

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  require('./main.cjs');
  const waitBoot = wait(15000);
  const winRef = () => BrowserWindow.getAllWindows()[0];
  await waitBoot;
  const win = winRef();

  const run = async (js) => { try { return await win.webContents.executeJavaScript(js); } catch (e) { return { __error: String(e.message).slice(0, 150) }; } };
  const shot = async (name) => { try { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, 'screenshots', 'desktop', name + '.png'), img.toPNG()); } catch (e) { logf('[shot-fail] ' + name); } };

  let home = false;
  for (let i = 0; i < 40 && !home; i++) {
    const st = await run(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn') || document.querySelector('#V2EventOk');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__, q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      if (document.querySelector('.ux-cave-battle-card')) return {action:'home'};
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
        if (inp && inp.value!=='V90桌面'){ inp.value='V90桌面'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V90桌面') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && (st.action === 'home' || st.action === 'primary')) home = true;
    await wait(650);
  }
  logf('home=' + home);
  await wait(2000);

  const results = [];
  for (const [w, h] of SIZES) {
    win.setContentSize(w, h);
    await wait(1200);
    const audit = await run(`(function(){
      var body=document.querySelector('#UiBody')||document.body;
      var overflowX = document.documentElement.scrollWidth > innerWidth + 2;
      var clipped=0; var all=body.querySelectorAll('*');
      for(var j=0;j<all.length;j++){var el=all[j]; if(el.children.length) continue; var t=(el.textContent||'').trim(); if(!t) continue; var r2=el.getBoundingClientRect(); if(r2.width<1||r2.height<1) continue; var s2=getComputedStyle(el); if(el.scrollWidth>el.clientWidth+2 && s2.overflow!=='visible') clipped++;}
      // battle page reachability
      var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); break; } }
      return { w: innerWidth, h: innerHeight, overflowX: overflowX, clipped: clipped };
    })()`);
    // battle-page reachability after nav
    await wait(1200);
    const battleReach = await run(`(function(){
      var body=document.querySelector('#UiBody')||document.body;
      var limit=Math.round(body.getBoundingClientRect().height);
      var keys=['v64-useSkill','v63-toggleAuto','v63-upgradeClick','v64-openEquip'];
      var out={}; for(var i=0;i<keys.length;i++){var e=document.querySelector('[data-action="'+keys[i]+'"]');if(!e){out[keys[i]]=null;continue;}var r=e.getBoundingClientRect();out[keys[i]]={bottom:Math.round(r.bottom),inFirst:r.bottom<=limit};}
      return { firstScreen:Object.keys(out).filter(function(k){return out[k]&&out[k].inFirst;}).length+'/'+keys.length,
        battleStage:!!document.querySelector('.ux65-stage'),
        overflowX: document.documentElement.scrollWidth > innerWidth + 2 };
    })()`);
    results.push({ size: w + 'x' + h, caveAudit: audit, battleReach });
    logf(w + 'x' + h + ' cave=' + JSON.stringify(audit) + ' battle=' + JSON.stringify(battleReach));
    await shot('desktop-' + w + 'x' + h);
    // back to cave for the next size iteration
    await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('洞府')>=0){ items[i].click(); return 1; } } return 0; })()`);
    await wait(800);
  }
  fs.writeFileSync(path.join(OUT, 'v90-desktop-resolution.json'), JSON.stringify({ home, results }, null, 2));
  logf('DONE');
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
