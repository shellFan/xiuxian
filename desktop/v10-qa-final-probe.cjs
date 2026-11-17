/** V10 QA 终版：原子化（单次 executeJavaScript 内）捕捉 FIGHTING 窗口 → 连击 + bug_bomb 联动。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('./main.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const EV = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'evidence');
app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });
app.whenReady().then(async () => {
  const w = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => { try { return await w().webContents.executeJavaScript(js); } catch (e) { return { __error: String(e.message).slice(0, 200) }; } };
  await wait(9000);
  for (let i = 0; i < 12; i++) { await run(`(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','[data-offline-decision-action]']; for(var j=0;j<sels.length;j++){ var m=document.querySelector(sels[j]); if(m){ m.click(); return 1; } } return 0; })()`); await wait(500); }
  await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); return 1; } } return 0; })()`);
  await wait(1500);

  const ATOMIC = `(function(){
    var f=window.__GAME_FACADE__, ab=null;
    try{ ab=f.queryAutoBattle(); }catch(e){ return {phase:'no-ab'}; }
    if(!ab) return {phase:'no-ab'};
    var out = { phase:'skip', status:ab.status, stage:ab.stage, comboBefore:ab.comboCount, bugBefore:ab.enemyBugDebuff||0 };
    if (ab.status !== 'FIGHTING') return out;
    out.phase = 'fighting';
    if (out.comboBefore < 5) {
      for(var i=0;i<20;i++){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); }
      try{ ab=f.queryAutoBattle(); }catch(e){}
      out.comboAfter = ab?ab.comboCount:null;
      out.comboDom = !!document.querySelector('.ux65-combo');
      out.comboText = document.querySelector('.ux65-combo') ? document.querySelector('.ux65-combo').innerText : null;
    } else { out.comboAfter = out.comboBefore; out.comboDom = !!document.querySelector('.ux65-combo'); }
    if (ab && ab.stage >= 5 && !(ab.activeSkills||[]).length) { /* placeholder */ }
    var bombUnlocked = true;
    try { out.bombCast = f.useActiveSkill('bug_bomb'); } catch(e){ out.bombCast = {err:String(e).slice(0,100)}; }
    try{ ab=f.queryAutoBattle(); }catch(e){}
    out.bugRightAfter = ab?ab.enemyBugDebuff:null;
    out.bombStatus = ab?ab.status:null;
    return out;
  })()`;

  let captured = null, comboCaptured = null;
  for (let i = 0; i < 120 && !(captured && comboCaptured); i++) {
    const r = await run(ATOMIC);
    if (r && r.phase === 'fighting') {
      if (!comboCaptured && typeof r.comboAfter === 'number' && r.comboAfter >= 5) comboCaptured = r;
      if (!captured && typeof r.bugRightAfter === 'number' && r.bugRightAfter > 0) captured = r;
    }
    await wait(400);
  }
  const result = { combo: comboCaptured, bomb: captured };
  fs.writeFileSync(path.join(EV, 'qa-combo-final.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  app.exit(0);
}).catch((e) => { console.log('FATAL ' + (e && e.stack || e)); app.exit(1); });
