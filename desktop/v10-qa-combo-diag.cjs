/** V10 QA 专项：连击路径诊断 + 技能联动 debuff 时机修正。 */
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
  // 切到战斗页
  await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); return 1; } } return 0; })()`);
  await wait(1500);

  const diag = {};
  // A. bridge 存在性
  diag.bridge = await run(`(function(){ return { v63: typeof window.__V63__, overlay: !!window.__UI_OVERLAY__, tapBtn: !!document.querySelector('[data-action="v63-tapAttack"]'), arena: !!document.querySelector('.ux65-arena') }; })()`);
  // B. 等待 FIGHTING 状态
  let fighting = false;
  for (let i = 0; i < 20 && !fighting; i++) {
    const s = await run(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return { status: ab?ab.status:null, stage: ab?ab.stage:null }; })()`);
    if (s && s.status === 'FIGHTING') { fighting = true; diag.stage = s.stage; }
    await wait(800);
  }
  diag.fightingReached = fighting;
  // C. DOM 路径连击：连点按钮，立即读
  diag.domCombo = await run(`(function(){
    var before = null; var f=window.__GAME_FACADE__; try{ before=f.queryAutoBattle().comboCount; }catch(e){}
    var clicked=0;
    for(var i=0;i<20;i++){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b){ b.click(); clicked++; } }
    var after=null; try{ after=f.queryAutoBattle().comboCount; }catch(e){}
    var el=document.querySelector('.ux65-combo');
    return { before: before, clicked: clicked, after: after, dom: !!el, text: el?el.innerText:null };
  })()`);
  // D. facade 直调路径
  diag.facadeCombo = await run(`(function(){
    var f=window.__GAME_FACADE__; var has = typeof f.tapAttack;
    var rets=[]; for(var i=0;i<10;i++){ try{ rets.push(f.tapAttack ? (f.tapAttack().comboCount!==undefined?'v':'x') : 'noMethod'); }catch(e){ rets.push('err'); } }
    var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){}
    return { methodType: has, rets: rets.slice(0,3), comboAfter: ab?ab.comboCount:null };
  })()`);
  // E. 若到 stage>=5：bug_bomb 联动
  let bomb = null;
  for (let i = 0; i < 40; i++) {
    const s = await run(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return { status: ab?ab.status:null, stage: ab?ab.stage:null }; })()`);
    if (s && s.status === 'FIGHTING' && s.stage >= 5) {
      bomb = await run(`(function(){
        var f=window.__GAME_FACADE__, r={};
        try { r.cast = f.useActiveSkill('bug_bomb'); } catch(e){ r.cast={err:String(e).slice(0,100)}; }
        var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){}
        r.bugRightAfter = ab?ab.enemyBugDebuff:undefined;
        return r;
      })()`);
      await wait(1200);
      const after = await run(`(function(){ var f=window.__GAME_FACADE__, ab=null; try{ ab=f.queryAutoBattle(); }catch(e){} return ab?{bug:ab.enemyBugDebuff, tagDom: !!document.querySelector('.ux65-debuff--bug')}:null; })()`);
      bomb.bugAfter1s = after;
      break;
    }
    await wait(800);
  }
  diag.bomb = bomb;
  fs.writeFileSync(path.join(EV, 'qa-combo-diag.json'), JSON.stringify(diag, null, 2));
  console.log(JSON.stringify(diag, null, 2));
  app.exit(0);
}).catch((e) => { console.log('FATAL ' + (e && e.stack || e)); app.exit(1); });
