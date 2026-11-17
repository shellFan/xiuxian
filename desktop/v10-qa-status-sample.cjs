const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'); const path = require('node:path');
require('./main.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EV = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'evidence');
app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });
app.whenReady().then(async () => {
  const w = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => { try { return await w().webContents.executeJavaScript(js); } catch (e) { return { __error: String(e.message).slice(0,200) }; } };
  await wait(9000);
  for (let i = 0; i < 10; i++) { await run(`(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','[data-offline-decision-action]']; for(var j=0;j<sels.length;j++){ var m=document.querySelector(sels[j]); if(m){ m.click(); return 1; } } return 0; })()`); await wait(500); }
  const samples = [];
  for (let i = 0; i < 30; i++) {
    const s = await run(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return ab?{status:ab.status,stage:ab.stage,hp:ab.enemy&&ab.enemy.hp,maxHp:ab.enemy&&ab.enemy.maxHp,kills:ab.totalKills,victoryTimer:ab.victoryTimer,defeatTimer:ab.defeatTimer,auto:ab.autoEnabled}:null; })()`);
    samples.push(s); await wait(500);
  }
  fs.writeFileSync(path.join(EV, 'qa-status-sample.json'), JSON.stringify(samples, null, 2));
  console.log(JSON.stringify(samples, null, 2));
  app.exit(0);
}).catch((e) => { console.log('FATAL ' + (e && e.stack || e)); app.exit(1); });
