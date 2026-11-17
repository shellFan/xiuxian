/**
 * V10.0 独立 QA：H5 纯浏览器验证。
 * Electron 窗口不挂 preload（无 electronAPI）= 纯 Chromium 浏览器上下文，移动端视口 390×844。
 * 内联启动 scripts/h5-server.cjs（ELECTRON_RUN_AS_NODE 子进程）。
 * 验证：游戏可启动 → 创建 → 洞府五区 → 战斗推进 → 连击 → localStorage 存档。
 */
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const EV = path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'evidence');
const SHOT = path.join(OUT_SHOTS());
function OUT_SHOTS() { return path.join(__dirname, '..', 'ai', 'reports', 'v10-qa', 'screenshots'); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(EV, 'qa-h5.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };
const result = { startedAt: new Date().toISOString(), checks: {} };
const check = (name, pass, detail) => {
  result.checks[name] = { pass: !!pass, detail: detail === undefined ? null : detail };
  logf('[CHECK] ' + name + '=' + (pass ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(detail === undefined ? null : detail));
};
const PORT = 8630;

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  // 1. 启动 H5 静态服务器（electron 以 node 模式跑）
  const serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'h5-server.cjs'), '--port=' + String(PORT)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', (d) => logf('[h5srv] ' + String(d).trim().slice(0, 120)));
  serverProc.stderr.on('data', (d) => logf('[h5srv-err] ' + String(d).trim().slice(0, 160)));
  await wait(2500);

  // 2. 纯浏览器窗口（无 preload），移动端视口
  const win = new BrowserWindow({
    width: 390, height: 844, useContentSize: true, show: false, skipTaskbar: true,
    webPreferences: { /* 故意不挂 preload */ },
  });
  await win.loadURL('http://127.0.0.1:' + PORT + '/index.html');
  await wait(3000);
  await win.webContents.executeJavaScript('try{localStorage.clear();}catch(e){} "cleared"');
  await win.loadURL('http://127.0.0.1:' + PORT + '/index.html');
  await wait(8000);

  const run = async (js) => { try { return await win.webContents.executeJavaScript(js); } catch (e) { return { __error: String(e.message).slice(0, 200) }; } };
  const shot = async (name) => {
    try { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT_SHOTS(), name + '.png'), img.toPNG()); logf('[shot] ' + name); }
    catch (e) { logf('[shot-fail] ' + name); }
  };
  const shot0 = async (name) => { try { win.show(); } catch (_) {} await shot(name); };

  // 启动检查：facade 存在、无 electronAPI（纯浏览器）
  const boot = await run(`(function(){
    return { facade: !!window.__GAME_FACADE__, electronApi: typeof window.electronAPI, ua: navigator.userAgent.slice(0,60), vw: window.innerWidth };
  })()`);
  check('h5_facade_ready', boot.facade === true, boot);
  check('h5_pure_browser_no_preload', boot.electronApi === 'undefined', boot.electronApi);
  check('h5_mobile_viewport', boot.vw >= 380 && boot.vw <= 410, boot.vw);

  // 创建角色
  let home = false;
  for (let i = 0; i < 90 && !home; i++) {
    const st = await run(`(function(){
      var modal = document.querySelector('[data-vevent-choice="__auto"]') || document.querySelector('#EventOkBtn') || document.querySelector('#V2EventOk');
      if (modal) { modal.click(); return {action:'dismiss'}; }
      var f = window.__GAME_FACADE__, q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e){}
      var d = q && q.draft ? q.draft : null;
      if (document.querySelector('.ux91-hero') || document.querySelector('.ux65-stage')) return {action:'home'};
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
        if (inp && inp.value!=='V10QA_H5'){ inp.value='V10QA_H5'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V10QA_H5') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && (st.action === 'home' || st.action === 'primary')) home = true;
    await wait(600);
  }
  const char5 = await run(`(function(){ var f=window.__GAME_FACADE__; var c=null; try{ c=f.queryCharacterProfile?f.queryCharacterProfile():null; }catch(e){} return c?{name:c.name}:null; })()`);
  check('h5_creation_completed', home === true && char5 && char5.name === 'V10QA_H5', { home: home, char: char5 });
  await shot0('qa-09-h5-home-mobile');

  // 洞府五区（移动端）
  const cave = await run(`(function(){
    var q=function(s){return document.querySelector(s);};
    return { res: !!q('.ux91-res'), goal: !!q('.ux91-goal'), hero: !!q('.ux91-hero'), today: !!q('.ux91-today'), quick: !!q('.ux91-quick'), bar: !!q('.ux91-chapter-bar'),
      nav: document.querySelectorAll('.ux-nav-item').length, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 };
  })()`);
  check('h5_cave_five_areas', !!(cave.res && cave.goal && cave.hero && cave.today && cave.quick), cave);
  check('h5_no_horizontal_overflow', cave.overflowX === false, cave.overflowX);
  check('h5_nav_pages', cave.nav === 5, cave.nav);

  // 战斗页 + 推进 + 连击
  await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); return 1; } } return 0; })()`);
  await wait(2000);
  let combo = null;
  for (let i = 0; i < 60 && !(combo && combo.comboCount >= 5); i++) {
    combo = await run(`(function(){
      var f=window.__GAME_FACADE__; var ab=null; try{ ab=f.queryAutoBattle(); }catch(e){ return {skip:'no-ab'}; }
      if (!ab || ab.status !== 'FIGHTING') return { skip: ab ? ab.status : 'null' };
      for(var j=0;j<20;j++){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); }
      try{ ab=f.queryAutoBattle(); }catch(e){}
      return { stage: ab?ab.stage:null, comboCount: ab?ab.comboCount:null, alive: !!document.getElementById('Ux66EnemySprite') };
    })()`);
    await wait(400);
  }
  check('h5_battle_renders', !!(combo && combo.alive), combo);
  check('h5_combo_works', !!(combo && combo.comboCount >= 5), combo);
  await shot0('qa-10-h5-battle-mobile');

  // localStorage 存档
  const save = await run(`(function(){
    var raw = localStorage.getItem('game-save');
    if (!raw) return { hasSave: false };
    var o = null; try { o = JSON.parse(raw); } catch(e) { return { hasSave: true, parseErr: true }; }
    return { hasSave: true, len: raw.length, name: o.name || (o.characterName || ''), stage: o.v63AutoBattle ? o.v63AutoBattle.stage : null, version: o.saveVersion };
  })()`);
  check('h5_localstorage_save', !!(save.hasSave && save.len > 500), save);
  // 重载恢复
  await win.loadURL('http://127.0.0.1:' + PORT + '/index.html');
  await wait(8000);
  let rec = null;
  for (let i = 0; i < 20 && !rec; i++) {
    await run(`(function(){ var sels=['[data-vevent-choice="__auto"]','#EventOkBtn','#V2EventOk','#WelcomeContinueBtn','[data-offline-decision-action]']; for(var j=0;j<sels.length;j++){ var m=document.querySelector(sels[j]); if(m){ m.click(); return 1; } } return 0; })()`);
    const v = await run(`(function(){ var f=window.__GAME_FACADE__; var c=null; try{ c=f.queryCharacterProfile?f.queryCharacterProfile():null; }catch(e){} if(!c||!c.name) return null; return {name:c.name}; })()`);
    if (v && v.name === 'V10QA_H5') rec = v;
    await wait(800);
  }
  check('h5_reload_recovery', !!(rec && rec.name === 'V10QA_H5'), rec);
  await shot0('qa-11-h5-recovered-mobile');

  const names = Object.keys(result.checks);
  const failed = names.filter((n) => !result.checks[n].pass);
  result.summary = { total: names.length, passed: names.length - failed.length, failed: failed, verdict: failed.length === 0 ? 'PASS' : 'FAIL' };
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(EV, 'qa-h5.json'), JSON.stringify(result, null, 2));
  logf('VERDICT=' + result.summary.verdict + ' passed=' + result.summary.passed + '/' + result.summary.total);
  try { serverProc.kill(); } catch (_) {}
  app.exit(result.summary.verdict === 'PASS' ? 0 : 2);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); try { app.exit(1); } catch (_) {} });
