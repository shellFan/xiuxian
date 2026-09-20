// V4 acceptance capture: real Electron renderer, full workday scenario screenshots.
// Usage: npx electron v4-capture.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.on('browser-window-created', (_event, win) => {
  const session = win.webContents.debugger;
  try {
    session.attach('1.3');
    session.on('message', (_debugEvent, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        console.error('RENDERER_EXCEPTION ' + JSON.stringify(params.exceptionDetails).slice(0, 400));
      }
    });
    session.sendCommand('Runtime.enable').catch((error) => {
      console.error('RENDERER_DIAGNOSTICS_UNAVAILABLE ' + error.message);
    });
  } catch (error) {
    console.error('RENDERER_DIAGNOSTICS_UNAVAILABLE ' + error.message);
  }
});

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
  await wait(2000);

  const dismiss = async () => {
    for (var i = 0; i < 8; i++) {
      const gone = await win.webContents.executeJavaScript(`(function(){
        var layer=document.getElementById('PopupLayer');
        if(!layer||!layer.innerHTML) return true;
        var ok=document.getElementById('V2EventOk'); if(ok){ok.click();return false;}
        var opt=document.querySelector('[data-vevent-choice]'); if(opt){opt.click();return false;}
        var off=document.getElementById('OffNormalBtn'); if(off){off.click();return false;}
        var dl=document.querySelector('[data-action=closePopup]'); if(dl){dl.click();return false;}
        return true;})()`);
      await wait(700);
      if (gone) break;
    }
    await wait(900);
  };
  const shot = async (name) => {
    await wait(1400);
    fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
    console.log('shot ' + name);
  };
  const run = async (script) => win.webContents.executeJavaScript(script);

  // 1. dismiss boot popups (offline reward) and capture the clean home
  await run(`(function(){ var b=document.getElementById('OffNormalBtn'); if(b) b.click(); var c=document.getElementById('OffCloseBtn'); if(c) c.click(); return true; })()`);
  await shot('home-1280x720');

  // 2. WORK mode at 10:00
  await run(`(function(){ var f=window.__GAME_FACADE__; f.devJumpToHour(10, 0); f.changeWorkMode('WORK'); return true; })()`);
  await shot('home-work');

  // 3. FISHING mode (paid fishing projection)
  await run(`(function(){ var f=window.__GAME_FACADE__; f.changeWorkMode('FISHING'); return true; })()`);
  await shot('home-fishing');

  // 4. 17:55 danger window
  await run(`(function(){ var f=window.__GAME_FACADE__; f.devJumpToHour(17, 55); f.changeWorkMode('WORK'); return true; })()`);
  await shot('home-1755');

  // 5. 18:05 free overtime contrast (salary stopped)
  await run(`(function(){ var f=window.__GAME_FACADE__; f.devJumpToHour(18, 5); f.startVoluntaryOvertime(2*3600, false); return true; })()`);
  await shot('home-free-overtime');

  // 6. finish overtime, then force the blame event chain
  await run(`(function(){ var f=window.__GAME_FACADE__; f.finishOvertime(); return true; })()`);
  await dismiss();
  await run(`(function(){ var f=window.__GAME_FACADE__; if(!f.devForceEvent('wp_blame_api_s0')) return 'force-failed'; return 'forced'; })()`);
  await wait(1600);
  await shot('blame-event');

  // close the event modal by picking the evidence反击 if visible else first choice
  await run(`(function(){
    var btns=document.querySelectorAll('.ux-event-option[data-vevent-choice]');
    var pick=null;
    btns.forEach(function(b){ if(b.textContent.indexOf('Git')>=0) pick=b; });
    if(!pick && btns.length) pick=btns[0];
    if(pick) pick.click();
    var ok=document.getElementById('V2EventOk'); if(ok) ok.click();
    return true; })()`);
  await wait(1200);
  await shot('blame-evidence');

  // 7. weekend: jump to Saturday 10:00
  await dismiss();
  await run(`(function(){
    var f=window.__GAME_FACADE__;
    var now=new Date(Date.now()+f.queryGameClock ? 0 : 0);
    var d=new Date(); var add=(6-d.getDay()+7)%7; if(add===0) add=7;
    f.devAdvanceTime(add*86400000);
    f.devJumpToHour(10, 0);
    return true; })()`);
  await shot('home-weekend');

  // 8. back after hours on Monday and settle the day
  await dismiss();
  await run(`(function(){
    var f=window.__GAME_FACADE__;
    var d=new Date(); var back=(7-d.getDay()+7)%7; if(back===0) back=0;
    if(back) f.devAdvanceTime(back*86400000);
    f.devJumpToHour(18, 30);
    try { f.settleDay(); } catch(e) {}
    return true; })()`);
  await shot('daily-settlement');

  const finalState = await run(`(function(){
    var body=document.getElementById('UiBody');
    return { scrollable: body ? body.scrollHeight > body.clientHeight + 2 : null, earned: (document.querySelector('.ux-earned-main b')||{}).textContent || null };
  })()`);
  console.log('final ' + JSON.stringify(finalState));
  console.log('V4_CAPTURE_DONE');
  app.exit(0);
}).catch((error) => {
  console.error('CAPTURE_FAILED ' + (error && error.stack || error));
  app.exit(1);
});
