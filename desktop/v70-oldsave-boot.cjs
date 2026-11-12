/**
 * V7.0 old-save boot check: boots the real game against a v13-era legacy save
 * (wrapped game-save format), waits past boot, then records what loaded.
 * Expectation: no crash, migration preserves economy fields, backfill wizard
 * shows (designed flow for old saves without creation records).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v70');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v70-oldsave-boot.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  await wait(16000);
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 150) }; }
  };
  const state = await run(`(function(){
    var f=window.__GAME_FACADE__;
    var q=null; try{ q=f&&f.queryCharacterCreation?f.queryCharacterCreation():null; }catch(e){}
    var hud=null; try{ hud=f?f.queryHUD?f.queryHUD():null:null; }catch(e){}
    var p=f&&f.player?f.player:null;
    return {
      facade:!!f,
      creationStatus:q?{status:q.status,mode:q.draft&&q.draft.mode}:null,
      salary:p?p.salary:null, cultivation:p?p.cultivationExp:null, stones:p?p.spiritStones:null,
      careerLevel:p?p.careerLevel:null,
      wizardOnScreen:!!document.querySelector('.v59-creation'),
      errorScreen:(document.body.innerText||'').includes('游戏启动失败'),
      bodyHead:(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,120)
    };
  })()`);
  logf('state=' + JSON.stringify(state));
  try {
    const img = await winRef().webContents.capturePage();
    fs.mkdirSync(path.join(OUT, 'screenshots', 'oldsave'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'screenshots', 'oldsave', 'oldsave-boot.png'), img.toPNG());
  } catch (_) {}
  fs.writeFileSync(path.join(OUT, 'v70-oldsave-boot.json'), JSON.stringify(state, null, 2));
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
