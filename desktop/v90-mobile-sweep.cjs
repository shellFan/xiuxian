/**
 * V9.0 mobile width sweep — real Chromium at four mobile viewports,
 * verifying layout/no-overflow/touch per width. Saves screenshots.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'ai', 'reports', 'v90');
const H5_PORT = 8632;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v90-mobile-sweep.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

const WIDTHS = [[360, 640], [375, 812], [414, 896], [430, 932]];

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  const http = require('node:http');
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream' };
  const h5root = path.join(ROOT, 'desktop', 'build', 'web-desktop');
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(h5root, p));
    if (!file.startsWith(h5root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(H5_PORT, '127.0.0.1', r));
  logf('server on :' + H5_PORT);

  const win = new BrowserWindow({ width: 390, height: 844, show: true, useContentSize: true, webPreferences: { backgroundThrottling: false } });
  await win.loadURL('http://127.0.0.1:' + H5_PORT + '/index.html');
  await wait(4000);
  try { await win.webContents.executeJavaScript('try{localStorage.clear();}catch(e){} location.reload();'); } catch (_) {}
  await wait(12000);

  const run = async (js) => {
    try { return await win.webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 150) }; }
  };
  const shot = async (name) => {
    try { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, 'screenshots', 'mobile', name + '.png'), img.toPNG()); } catch (e) { logf('[shot-fail] ' + name); }
  };

  // reach cave
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
        if (inp && inp.value!=='V90扫宽'){ inp.value='V90扫宽'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V90扫宽') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
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
  for (const [w, h] of WIDTHS) {
    win.setContentSize(w, h);
    await wait(1200);
    const audit = await run(`(function(){
      var nav=document.querySelector('.ux-nav');
      var overflowX = document.documentElement.scrollWidth > innerWidth + 2;
      var tapTargets = (function(){ var bad=0; var els=document.querySelectorAll('button,[data-action]'); for(var i=0;i<els.length;i++){ var r=els[i].getBoundingClientRect(); if(r.width>4&&r.height>4&&r.height<28) bad++; } return bad; })();
      return { width: innerWidth, height: innerHeight, overflowX: overflowX, navTop: nav?Math.round(nav.getBoundingClientRect().top):null, smallTapTargets: tapTargets };
    })()`);
    results.push({ w, h, ...audit });
    logf(w + 'x' + h + ' -> ' + JSON.stringify(audit));
    await shot('mobile-' + w + 'x' + h);
  }
  fs.writeFileSync(path.join(OUT, 'v90-mobile-sweep.json'), JSON.stringify({ home, results }, null, 2));
  logf('DONE');
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
