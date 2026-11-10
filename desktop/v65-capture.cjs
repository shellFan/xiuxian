// V6.5 before-screenshot capture: real Electron renderer
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.on('browser-window-created', (_event, win) => {
  const dbg = win.webContents.debugger;
  try {
    dbg.attach('1.3');
    dbg.on('message', (_e, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        console.error('RENDERER_EXCEPTION ' + JSON.stringify(params.exceptionDetails).slice(0, 300));
      }
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
  } catch (e) { /* ignore */ }
});

require('./main.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'ai', 'reports', 'v65', 'screenshots', 'before');
  fs.mkdirSync(out, { recursive: true });
  await wait(14000); // fixed wait - polling interferes with Cocos loading
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('No window');

  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, name + '.png'), img.toPNG());
    console.log('[shot] ' + name);
  };
  const run = async (js) => win.webContents.executeJavaScript(js).catch(e => { console.log('[js-err] ' + e.message.slice(0, 100)); });

  // 1. Home / battle area (main screen)
  await shot('01-home-battle');

  // 2. Click attack (tap once, capture mid-effect)
  await run(`(function(){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); return true; })()`);
  await wait(300);
  await shot('02-tap-attack');

  // 3. Skill bar close-up (check unlocked skills)
  await run(`(function(){ var b=document.querySelector('[data-action^="v64-useSkill"]:not(.ux64-skill--locked)'); if(b) b.click(); return !!b; })()`);
  await wait(800);
  await shot('03-skill-release');

  // 4. Speed toggle
  await run(`(function(){ var b=document.querySelector('[data-action="v64-toggleSpeed"]'); if(b) b.click(); return true; })()`);
  await wait(500);
  await shot('04-speed-2x');
  // toggle back
  await run(`(function(){ var b=document.querySelector('[data-action="v64-toggleSpeed"]'); if(b) b.click(); return true; })()`);
  await wait(300);

  // 5. Equip panel
  await run(`(function(){ var b=document.querySelector('[data-action="v64-openEquip"]'); if(b) b.click(); return true; })()`);
  await wait(1000);
  await shot('05-equip-panel');
  await run(`(function(){ var b=document.querySelector('[data-action="v64-closeEquip"]'); if(b) b.click(); return true; })()`);
  await wait(500);

  // 6. Goals panel (daily + seven-day + achievements)
  await run(`(function(){ var b=document.querySelector('[data-action="v64-openGoals"]'); if(b) b.click(); return true; })()`);
  await wait(1000);
  await shot('06-goals-panel');
  await run(`(function(){ var b=document.querySelector('[data-action="v64-closeGoals"]'); if(b) b.click(); return true; })()`);
  await wait(500);

  // 7. Squad zone (hire menu if available)
  await run(`(function(){ var b=document.querySelector('[data-action="v63-hireMenu"]'); if(b) b.click(); return true; })()`);
  await wait(1000);
  await shot('07-hire-menu');
  await run(`(function(){ var b=document.querySelector('.ux63-hire-close'); if(b) b.click(); return true; })()`);
  await wait(500);

  // 8. Wait for some kills then capture battle progress
  await wait(5000);
  await shot('08-battle-progress');

  // 9. AI commentator area (if present)
  await run(`(function(){ var el=document.querySelector('.ux63-ai-comment, #Ux63AiComment'); if(el) return true; return false; })()`);
  await shot('09-ai-comment');

  // 10. Full page (capture entire overlay)
  await shot('10-full-page');

  console.log('\nV65_CAPTURE_COMPLETE');
  app.quit();
}).catch(e => { console.error(e); app.exit(1); });