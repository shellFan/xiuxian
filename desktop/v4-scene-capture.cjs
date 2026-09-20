// Focused V4 scene capture: fresh save, then blame chain / overtime / weekend / settlement.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'ai', 'reports', 'screenshots');
  fs.mkdirSync(out, { recursive: true });
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('No desktop window');
  win.setMinimumSize(1100, 650);
  win.setContentSize(1280, 720);

  const run = (script) => win.webContents.executeJavaScript(script);
  const shot = async (name) => {
    await wait(1500);
    fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
    console.log('shot ' + name);
  };
  const dismiss = async () => {
    for (var i = 0; i < 10; i++) {
      const gone = await run(`(function(){
        var layer=document.getElementById('PopupLayer');
        if(!layer||!layer.innerHTML) return true;
        var ok=document.getElementById('V2EventOk'); if(ok){ok.click();return false;}
        var opt=document.querySelector('[data-vevent-choice]'); if(opt){opt.click();return false;}
        var off=document.getElementById('OffNormalBtn'); if(off){off.click();return false;}
        var dl=document.querySelector('[data-action=closePopup]'); if(dl){dl.click();return false;}
        return true;})()`);
      await wait(800);
      if (gone) break;
    }
    await wait(1300);
  };

  // fresh save -> reload state
  await run(`(function(){ window.__GAME_FACADE__.clearSave(); return true; })()`);
  await wait(800);
  await dismiss();
  await run(`(function(){ var f=window.__GAME_FACADE__; f.devJumpToHour(10, 20); f.changeWorkMode('WORK'); return true; })()`);
  await wait(1200);
  await dismiss();

  // blame chain event (fresh save has no cooldowns)
  const forced = await run(`(function(){ return String(window.__GAME_FACADE__.devForceEvent('wp_blame_api_s0')); })()`);
  console.log('force blame -> ' + forced);
  await wait(1800);
  await shot('blame-event');

  // pick 【行，我看看】 -> creates an assigned P0 task
  const picked = await run(`(function(){
    var btns=document.querySelectorAll('.ux-event-option[data-vevent-choice]');
    var pick=null;
    btns.forEach(function(b){ if(b.textContent.indexOf('行，我看看')>=0) pick=b; });
    if(!pick && btns.length) pick=btns[0];
    if(!pick) return 'no-options';
    pick.click();
    var ok=document.getElementById('V2EventOk');
    if(ok) setTimeout(function(){ ok.click(); }, 400);
    return 'picked'; })()`);
  console.log('pick -> ' + picked);
  await shot('blame-evidence');
  await dismiss();

  // agenda now shows the assigned task
  const agendaInfo = await run(`(function(){
    return { items: Array.from(document.querySelectorAll('.ux-agenda-item .ux-agenda-title')).map(function(n){return n.textContent;}), prio: document.querySelectorAll('.ux-prio.p0').length };
  })()`);
  console.log('agenda ' + JSON.stringify(agendaInfo));
  await shot('agenda-assigned');

  // free overtime contrast at 18:05
  await run(`(function(){ var f=window.__GAME_FACADE__; f.devJumpToHour(18, 5); f.startVoluntaryOvertime(2*3600, false); return true; })()`);
  await shot('home-free-overtime');

  console.log('V4_SCENE_DONE');
  app.exit(0);
}).catch((error) => {
  console.error('CAPTURE_FAILED ' + (error && error.stack || error));
  app.exit(1);
});
