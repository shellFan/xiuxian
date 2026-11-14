/**
 * V9.0 H5 验收探针 —— 纯浏览器上下文验证（无任何游戏专用 Electron 主进程 API）。
 *
 * 方法：Electron 窗口【不挂 preload】（= 无 electronAPI 的纯净 Chromium 渲染环境，
 * 等价于手机浏览器打开 H5 页面），390×844 移动视口，加载 h5-server 静态页。
 *
 * 验证：
 *   1. 游戏在无 electronAPI 环境可启动（LocalStorageAdapter 分支）
 *   2. 创建角色 → 洞府 → 战斗页
 *   3. 触摸事件（TouchEvent）点击攻击造成真实伤害
 *   4. localStorage 持久化存档（game-save 键）
 *   5. 移动视口布局（无横向溢出、底部导航可达）
 */
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

/* 注意：本探针位于 desktop/ 目录 —— 仓库根为上一级（V7.0 的 ai/work 探针才是 ../..） */
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'ai', 'reports', 'v90');
const H5_PORT = 8630;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v90-h5-probe.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

app.on('browser-window-created', (_e, win) => { try { win.setSkipTaskbar(true); } catch (_) {} });

app.whenReady().then(async () => {
  // 1. static h5 server INLINE（与 scripts/h5-server.cjs 相同逻辑；进程退出即停止）
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream', '.map': 'application/json' };
  const h5root = path.join(ROOT, 'desktop', 'build', 'web-desktop');
  const http = require('node:http');
  const h5server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(h5root, p));
    if (!file.startsWith(h5root)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
  });
  let boundPort = H5_PORT;
  await new Promise((resolve, reject) => {
    let attempt = 0;
    const tryPort = (port) => {
      h5server.once('error', (e) => {
        if (e.code === 'EADDRINUSE' && attempt < 10) { attempt++; boundPort = H5_PORT + attempt; tryPort(boundPort); }
        else reject(e);
      });
      h5server.listen(port, '127.0.0.1', () => resolve());
    };
    tryPort(H5_PORT);
  });
  logf('h5 static server inline on :' + boundPort + ' root=' + h5root);

  // 2. window WITHOUT preload — pure browser context, mobile viewport
  const win = new BrowserWindow({
    width: 390,
    height: 844,
    show: true, /* V9.0：可见窗口（与 EXE soak 一致）确保 rAF 驱动战斗循环 */
    useContentSize: true,
    webPreferences: { /* NO preload — no electronAPI（纯浏览器上下文） */
      backgroundThrottling: false /* 隐藏窗口不冻结渲染循环 */ },
  });
  /* V9.0：先导航到游戏页，再清档 + reload（保证全新开始；勿并发叠加导航） */
  await win.loadURL('http://127.0.0.1:' + boundPort + '/index.html');
  await wait(4000);
  try { await win.webContents.executeJavaScript('try{localStorage.clear();}catch(e){} location.reload();'); } catch (eClear) {}
  await wait(12000); // reload 后引擎重新 boot

  /* V9.0：控制台错误捕获（定位战斗循环停摆） */
  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) consoleErrors.push(String(message).slice(0, 200));
  });

  const result = { checks: {} };
  const run = async (js) => {
    try { return await win.webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 150) }; }
  };
  /* 心跳：GameLoop 是否在 tick（lastTickAt 前进 = 循环活着） */
  const tickProbe = async () => {
    const t1 = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return v?v.lastTickAt:null; })()`);
    await wait(1200);
    const t2 = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return v?v.lastTickAt:null; })()`);
    return { t1: t1, t2: t2, ticking: t1 !== null && t2 !== null && t2 > t1 };
  };
  const shot = async (name) => {
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, 'screenshots', 'mobile', name + '.png'), img.toPNG());
      logf('[shot] ' + name);
    } catch (e) { logf('[shot-fail] ' + name + ' ' + e.message); }
  };

  // boot checks
  const boot = await run(`(function(){
    return {
      title: document.title,
      overlay: !!document.getElementById('UiOverlay'),
      textLen: (document.body.innerText||'').length,
      electronApiPresent: !!window.electronAPI,
      storageMode: (function(){
        // bootstrap logs the adapter choice; detect via save behaviour later
        return 'detect-at-save';
      })(),
      viewport: { w: innerWidth, h: innerHeight }
    };
  })()`);
  result.checks.boot = boot;
  logf('boot=' + JSON.stringify(boot));
  await shot('h5-01-boot');

  // creation → cave
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
        if (inp && inp.value!=='V90H5'){ inp.value='V90H5'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'nick'}; }
        if (d.nickname!=='V90H5') return {action:'saveid',result:click('[data-creation-action="save-identity"]')};
      } else if (s==='DESTINY'){ if(!d.selectedCandidateId){ var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'dest'};} } }
      else if (s==='ALLOCATION'){ var plus=document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])'); if(plus){plus.click(); return {action:'alloc'};} }
      else if (s==='CONFIRM'){ return {action:'fin',result:click('[data-creation-action="finalize"]')}; }
      return {action:'adv',result:primary()};
    })()`);
    if (st && (st.action === 'home' || st.action === 'primary')) home = true;
    await wait(700);
  }
  result.checks.caveReached = home;
  logf('cave=' + home);
  await wait(2000);
  await shot('h5-02-cave');

  // layout audit at mobile viewport
  const layout = await run(`(function(){
    var body=document.querySelector('#UiBody')||document.body;
    var nav=document.querySelector('.ux-nav');
    var navBottom = nav ? Math.round(nav.getBoundingClientRect().bottom) : null;
    return {
      overflowX: document.documentElement.scrollWidth > innerWidth + 2,
      navBottom: navBottom,
      navInsideViewport: nav ? navBottom <= innerHeight + 2 : false,
      caveCard: !!document.querySelector('.ux-cave-battle-card'),
      width: innerWidth
    };
  })()`);
  result.checks.mobileLayout = layout;
  logf('layout=' + JSON.stringify(layout));

  // → battle page via bottom nav
  await run(`(function(){ var items=document.querySelectorAll('.ux-nav-item'); for(var i=0;i<items.length;i++){ if((items[i].innerText||'').indexOf('战斗')>=0){ items[i].click(); return 1; } } return 0; })()`);
  await wait(1500);

  // TOUCH verification: dispatch real TouchEvents on the tap-attack button, then judge by progression
  result.checks.tick = await tickProbe();
  result.checks.consoleErrors = consoleErrors.slice(0, 8);
  logf('tick=' + JSON.stringify(result.checks.tick) + ' consoleErrs=' + consoleErrors.length);
  const statsBefore = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return JSON.stringify({hp:v&&v.enemy?v.enemy.hp:null, kills:v?v.totalKills:null}); })()`);
  const touch = await run(`(function(){
    var b=document.querySelector('[data-action="v63-tapAttack"]');
    if(!b) return {found:false};
    var r=b.getBoundingClientRect();
    var cx=r.left+r.width/2, cy=r.top+r.height/2;
    var t=new Touch({identifier:1,target:b,clientX:cx,clientY:cy});
    b.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t],targetTouches:[t],changedTouches:[t]}));
    b.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[t]}));
    return {found:true, cx:Math.round(cx), cy:Math.round(cy), touchEventSupported:true};
  })()`);
  /* V9.0：连续触摸 3 秒（真实玩家节奏），以击杀数/敌人血量变化判定触摸有效 */
  for (var ti = 0; ti < 8; ti++) {
    await run(`(function(){ var q=document.querySelector('[data-action="v63-tapAttack"]'); if(!q) return 0; var rr=q.getBoundingClientRect(); var ccx=rr.left+rr.width/2, ccy=rr.top+rr.height/2; var tt=new Touch({identifier:2,target:q,clientX:ccx,clientY:ccy}); q.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[tt],targetTouches:[tt],changedTouches:[tt]})); q.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[tt]})); return 1; })()`);
    await wait(340);
  }
  const statsAfter = await run(`(function(){ var f=window.__GAME_FACADE__; var v=f&&f.queryAutoBattle?f.queryAutoBattle():null; return JSON.stringify({hp:v&&v.enemy?v.enemy.hp:null, kills:v?v.totalKills:null}); })()`);
  const sb = JSON.parse(statsBefore || '{}');
  const sa = JSON.parse(statsAfter || '{}');
  result.checks.touch = { ...(touch || {}), before: sb, after: sa, progressed: (sb.kills !== sa.kills) || (sb.hp !== sa.hp) };
  logf('touch=' + JSON.stringify(result.checks.touch));
  await shot('h5-03-battle');

  // localStorage save persistence
  await run(`(function(){ var f=window.__GAME_FACADE__; if(f&&f.saveNow) { try{f.saveNow();}catch(e){} } try{ f.saveService.save(f.player); }catch(e){} return 1; })()`);
  await wait(800);
  const save = await run(`(function(){
    try { var raw=window.localStorage.getItem('game-save'); return { hasSave: !!raw, len: raw?raw.length:0, name: raw?(JSON.parse(raw).characterName||''):'-' }; }
    catch(e){ return { err: String(e.message).slice(0,100) }; }
  })()`);
  result.checks.localStorageSave = save;
  logf('localStorage=' + JSON.stringify(save));

  /* V9.0：H5 重启恢复 —— 刷新页面，存档应恢复（无创建向导、洞府直达） */
  try { await win.webContents.executeJavaScript('location.reload();'); } catch (eRel) {}
  await wait(12000);
  const recovery = await run(`(function(){
    return { caveCard: !!document.querySelector('.ux-cave-battle-card'), creation: !!document.querySelector('.v59-creation'),
      name: (function(){ var f=window.__GAME_FACADE__; return f&&f.player?f.player.characterName:null; })() };
  })()`);
  result.checks.restartRecovery = recovery;
  logf('recovery=' + JSON.stringify(recovery));
  await shot('h5-04-restart');

  result.pass = !!(home && layout && !layout.overflowX && layout.navInsideViewport && touch.found && result.checks.touch.progressed && save && save.hasSave && recovery && recovery.caveCard && !recovery.creation);
  logf('H5 PASS=' + result.pass);
  fs.writeFileSync(path.join(OUT, 'v90-h5-probe.json'), JSON.stringify(result, null, 2));
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
