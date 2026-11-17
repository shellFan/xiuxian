/** V10 QA 诊断：一次性 dump 运行时各 facade 视图的真实字段形态。 */
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
  // 恢复已有存档（tmp/v10qa-save 已有 save.json），关掉弹窗
  for (let i = 0; i < 10; i++) { await run(`(function(){ var m=document.querySelector('[data-vevent-choice="__auto"]')||document.querySelector('#EventOkBtn')||document.querySelector('#V2EventOk'); if(m) m.click(); return 1; })()`); await wait(600); }
  const dump = await run(`(function(){
    var f = window.__GAME_FACADE__;
    var out = {};
    try { var ab = f.queryAutoBattle ? f.queryAutoBattle() : null;
      out.abKeys = ab ? Object.keys(ab) : null;
      out.enemyKeys = ab && ab.enemy ? Object.keys(ab.enemy) : null;
      out.enemySample = ab && ab.enemy ? { kind: ab.enemy.kind, bossFlag: ab.enemy.bossFlag, id: ab.enemy.id, name: ab.enemy.name, hp: ab.enemy.hp, phase2Active: ab.enemy.phase2Active } : null;
      out.comboCount = ab ? ab.comboCount : 'no-ab';
      out.stage = ab ? ab.stage : null;
    } catch(e) { out.abErr = String(e).slice(0,150); }
    try { var c = f.queryCharacterProfile ? f.queryCharacterProfile() : null;
      out.charKeys = c ? Object.keys(c) : null;
      out.charSample = c ? { name: c.name, nickname: c.nickname, level: c.level, careerLevel: c.careerLevel } : null;
    } catch(e) { out.charErr = String(e).slice(0,150); }
    out.facadeMethods = Object.keys(f).filter(function(k){ return typeof f[k]==='function'; }).slice(0, 60);
    return out;
  })()`);
  fs.writeFileSync(path.join(EV, 'qa-shape-dump.json'), JSON.stringify(dump, null, 2));
  console.log(JSON.stringify(dump, null, 2));
  // 连击真实性验证：切战斗页 → 连点 → 立即读 comboCount
  await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); return 1; } } return 0; })()`);
  await wait(1500);
  await run(`(function(){ for(var i=0;i<15;i++){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); } return 1; })()`);
  await wait(250);
  const combo = await run(`(function(){ var f=window.__GAME_FACADE__; var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} var el=document.querySelector('.ux65-combo');
    return { ab: !!ab, comboCount: ab?ab.comboCount:'NO_AB', domCombo: !!el, text: el?el.innerText:null, tapsSeen: ab?ab.totalTaps:'-',
      tapBtnExists: !!document.querySelector('[data-action="v63-tapAttack"]') }; })()`);
  fs.writeFileSync(path.join(EV, 'qa-combo-probe.json'), JSON.stringify(combo, null, 2));
  console.log('COMBO=' + JSON.stringify(combo));
  app.exit(0);
}).catch((e) => { console.log('FATAL ' + (e && e.stack || e)); app.exit(1); });
