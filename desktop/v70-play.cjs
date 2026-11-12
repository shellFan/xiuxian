/**
 * V7.0 real playthrough + UI/gameplay acceptance harness.
 *
 * Runs the actual Electron game with an ISOLATED save (XIUXIAN_USER_DATA).
 * Drives the real character-creation wizard, reaches the actual home/battle
 * screen, then audits every interactive control and exercises the core loop.
 *
 *   V70_PHASE=before|after   -> screenshot + JSON output directory
 *   XIUXIAN_USER_DATA=<dir>  -> isolated save (never the player's real save)
 *
 * Same script is used for BEFORE and AFTER so screenshots are comparable.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const PHASE = (process.env.V70_PHASE || 'before').replace(/[^a-zA-Z0-9_-]/g, '') || 'before';
const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v70');
const SHOT = path.join(OUT, 'screenshots', PHASE);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(OUT, 'v70-' + PHASE + '-harness.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11,19) + ' ' + m + String.fromCharCode(10)); } catch (_) {} console.log(m); };
const exceptions = [];
const consoleErrors = [];
const rendererWarnings = [];

app.on('browser-window-created', (_event, win) => {
  try { win.setSkipTaskbar(true); } catch (_) {}
  try {
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    dbg.on('message', (_e, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        const d = params.exceptionDetails || {};
        exceptions.push({ text: d.text || '', description: (d.exception && d.exception.description || '').slice(0, 400) });
      }
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        consoleErrors.push((params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 300));
      }
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
  } catch (_) {}
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !/Security Warning/.test(message)) rendererWarnings.push(String(message).slice(0, 300));
  });
});

app.whenReady().then(async () => {
  logf('whenReady begin, OUT=' + OUT);
  fs.mkdirSync(SHOT, { recursive: true });
  const result = {
    phase: PHASE,
    timestamp: new Date().toISOString(),
    head: process.env.V70_HEAD || 'unknown',
    creationSteps: [],
    shots: [],
  };
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { return { __error: String(e.message).slice(0, 200) }; }
  };
  const shot = async (name) => {
    try {
      const img = await winRef().webContents.capturePage();
      const file = path.join(SHOT, name + '.png');
      fs.writeFileSync(file, img.toPNG());
      result.shots.push({ name, bytes: img.toPNG().length });
      console.log('[shot] ' + name);
      return true;
    } catch (e) {
      result.shots.push({ name, error: String(e.message) });
      console.log('[shot-fail] ' + name);
      return false;
    }
  };

  logf('start 14s boot wait');
  await wait(14000);
  logf('boot wait done, windows=' + BrowserWindow.getAllWindows().length);
  if (!winRef()) { console.error('FAIL: no BrowserWindow'); app.exit(1); return; }
  await shot('01-boot');

  // ───────────────────────────────────────────────────────────────────────
  // Drive the REAL character creation flow, one real DOM click per round.
  // ───────────────────────────────────────────────────────────────────────
  let homeReached = false;
  for (let round = 0; round < 40; round++) {
    const step = await run(`(function(){
      // 1. dismiss any blocking modal first
      var modal = document.querySelector('[data-vevent-choice="__auto"]')
        || document.querySelector('#EventOkBtn')
        || document.querySelector('[data-action="guideSkip"]');
      if (modal) { var t=(modal.innerText||'').trim().slice(0,30); modal.click(); return {action:'dismiss-modal', label:t}; }

      var f = window.__GAME_FACADE__;
      var q = null;
      try { q = f && f.queryCharacterCreation ? f.queryCharacterCreation() : null; } catch(e) {}
      var d = q && q.draft ? q.draft : null;
      var wiz = !!document.querySelector('.v59-creation');
      var home = !!document.querySelector('.ux65-stage') || !!document.querySelector('[data-action="v63-tapAttack"]');
      if (home) return {action:'home-reached'};

      function click(sel){ var e=document.querySelector(sel); if(!e) return null; if(e.disabled) return 'disabled'; e.click(); return 'ok'; }
      function primary(){ return click('[data-creation-action="advance"]') || click('[data-creation-action="finalize"]') || click('[data-creation-action="start-game"]') || click('[data-creation-action="onboarding-skip"]') || click('[data-creation-action="onboarding-next"]'); }

      if (!wiz) {
        var r = primary();
        if (r) return {action:'nonwizard-primary', result:r};
        return {action:'wait', bodyText:(document.body.innerText||'').slice(0,160)};
      }
      if (!d) return {action:'wait-no-draft'};
      var s = d.step;
      if (s === 'INDUSTRY') {
        if (!d.industry) return {action:'choose-industry', result:click('[data-creation-choice="industry:INTERNET"]'), step:s};
      } else if (s === 'DIRECTION') {
        if (!d.direction) return {action:'choose-direction', result:click('[data-creation-choice="direction:TECH_RND"]'), step:s};
      } else if (s === 'PROFESSION') {
        // Service requires professionConfirmed (not just a default professionId).
        if (!d.professionConfirmed) return {action:'choose-profession', result:click('[data-creation-choice="profession:JAVA_BACKEND"]'), step:s};
      } else if (s === 'IDENTITY') {
        var inp = document.querySelector('#v59-nickname');
        if (!d.background) return {action:'choose-background', result:click('[data-creation-choice="background:ORDINARY_WORKER"]'), step:s};
        if (inp && inp.value !== 'V68试玩') { inp.value = 'V68试玩'; inp.dispatchEvent(new Event('change',{bubbles:true})); return {action:'fill-nickname', step:s}; }
        if (d.nickname !== 'V68试玩') return {action:'save-identity', result:click('[data-creation-action="save-identity"]'), step:s};
      } else if (s === 'DESTINY') {
        if (!d.selectedCandidateId) { var c=document.querySelector('[data-creation-choice^="candidate:"]'); if(c){c.click(); return {action:'choose-destiny', result:'ok', step:s};} }
      } else if (s === 'ALLOCATION') {
        var plus = document.querySelector('[data-creation-action="allocate"][data-stat="insight"][data-delta="1"]:not([disabled])');
        if (plus && (!d.allocation || !d.allocation.insight)) { plus.click(); return {action:'allocate-insight', result:'ok', step:s}; }
      } else if (s === 'CONFIRM') {
        return {action:'finalize', result:click('[data-creation-action="finalize"]'), step:s};
      }
      return {action:'advance', step:s, result:primary()};
    })()`);
    result.creationSteps.push({ round, ...(step || {}) });
    console.log('[creation] ' + JSON.stringify(step));
    if (step && step.action === 'home-reached') { homeReached = true; break; }
    await wait(650);
    // Capture the PROFESSION step BEFORE any choice is made — this is the screen
    // where V6.8 fixed the "card looks selected but service is unconfirmed" bug.
    if (step && step.action === 'advance' && step.step === 'DIRECTION') {
      await shot('02a-profession-unconfirmed');
    }
  }
  result.homeReached = homeReached;
  await shot('02-after-creation');

  if (!homeReached) {
    result.finalScreen = await run(`(function(){ return { text:(document.body.innerText||'').slice(0,1200), html:(document.getElementById('UiOverlay')||{}).innerHTML ? document.getElementById('UiOverlay').innerHTML.slice(0,600) : '' }; })()`);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Home/battle audit on the REAL playable screen
  // ───────────────────────────────────────────────────────────────────────
  await wait(2500);
  await shot('03-home');

  const snapshot = () => run(`(function(){
    function t(sel){ var e=document.querySelector(sel); return e ? (e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,80) : null; }
    var f=window.__GAME_FACADE__;
    var state=null;
    try { state = f && f.queryAutoBattle ? f.queryAutoBattle() : null; } catch(e){}
    try { state = state || (f && f.queryV63AutoBattle ? f.queryV63AutoBattle() : null); } catch(e){}
    return {
      stage: t('.ux65-stage-num'), enemy: t('.ux65-enemy-name'),
      hp: t('.ux65-enemy-hp-text'), power: t('.ux65-power'),
      autoState: state ? JSON.stringify(state).slice(0,900) : null,
      stageClass: (document.querySelector('.ux65-stage')||{}).className || null,
      bodyHead: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,900)
    };
  })()`);
  result.homeSnapshot = await snapshot();

  // Full interactive control audit (all data-* driven controls, not just data-action)
  result.controls = await run(`(function(){
    var sel = '[data-action],[data-nav],[data-goto-page],[data-skill],[data-creation-action],[data-creation-choice],[data-vevent-choice],[data-tasktab],[data-achtab],[data-codex-tab],[data-ai-npc],[data-ai-send],button';
    var nodes = document.querySelectorAll(sel);
    var out = [];
    for (var i=0;i<nodes.length;i++){
      var el = nodes[i];
      var s = getComputedStyle(el), r = el.getBoundingClientRect();
      var visible = s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity)>0 && r.width>0 && r.height>0;
      var cx=r.left+r.width/2, cy=r.top+r.height/2;
      var occluded=null;
      if (visible && cx>=0 && cy>=0 && cx<=innerWidth && cy<=innerHeight) {
        try { var hit=document.elementFromPoint(cx,cy); occluded = hit ? !(el===hit||el.contains(hit)||hit.contains(el)) : null; } catch(e){}
      }
      out.push({
        key: el.getAttribute('data-action') || el.getAttribute('data-nav') || el.getAttribute('data-goto-page') || el.getAttribute('data-skill') || el.getAttribute('data-creation-action') || el.getAttribute('data-creation-choice') || el.getAttribute('data-vevent-choice') || ('btn:'+(el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,18)),
        tag: el.tagName, text:(el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,36),
        visible:visible, disabled:!!el.disabled||el.getAttribute('aria-disabled')==='true',
        w:Math.round(r.width), h:Math.round(r.height), x:Math.round(r.left), y:Math.round(r.top),
        fontSize:s.fontSize, occluded:occluded
      });
    }
    return out;
  })()`);

  result.layout = await run(`(function(){
    var all=document.querySelectorAll('*'), clipped=[];
    for (var i=0;i<all.length;i++){
      var el=all[i]; if(el.children.length) continue;
      var t=(el.textContent||'').trim(); if(!t) continue;
      var r=el.getBoundingClientRect(); if(r.width<1||r.height<1) continue;
      var s=getComputedStyle(el);
      if (el.scrollWidth>el.clientWidth+2 && s.overflow!=='visible') clipped.push({text:t.slice(0,32),sw:el.scrollWidth,cw:el.clientWidth});
    }
    return {
      domNodes:all.length,
      viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},
      canvas:(function(){var c=document.querySelector('canvas');return c?{w:c.width,h:c.height,cssW:Math.round(c.getBoundingClientRect().width),cssH:Math.round(c.getBoundingClientRect().height)}:null;})(),
      stage:(function(){var s=document.querySelector('.ux65-stage');return s?{w:Math.round(s.getBoundingClientRect().width),h:Math.round(s.getBoundingClientRect().height),cls:s.className}:null;})(),
      spriteCount:document.querySelectorAll('.ux66-squad-sprite').length,
      enemySprite:!!document.getElementById('Ux66EnemySprite'),
      sceneBg:!!document.querySelector('.ux66-scene-bg'),
      cssCharRemains:!!document.querySelector('.ux65-char-body'),
      skillBtns:document.querySelectorAll('[data-skill],[data-action="v64-useSkill"]').length,
      visibleControls:(function(){var n=0,b=document.querySelectorAll('button,[data-action]');for(var i=0;i<b.length;i++){var r=b[i].getBoundingClientRect();if(r.width>0&&r.height>0&&getComputedStyle(b[i]).display!=='none')n++;}return n;})(),
      clippedTexts:clipped.slice(0,25),
      overflow:{docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight,winW:innerWidth,winH:innerHeight}
    };
  })()`);

  // Are the combat controls actually reachable without scrolling?
  result.reachability = await run(`(function(){
    var body = document.querySelector('#UiBody');
    var limit = body ? Math.round(body.getBoundingClientRect().height) : Math.round(innerHeight);
    var keys = ['v64-useSkill','v64-toggleSpeed','v63-toggleAuto','v63-upgradeClick','v63-enterTower','v64-openEquip','v64-openGoals'];
    var out = {};
    for (var i=0;i<keys.length;i++){
      var e = document.querySelector('[data-action="' + keys[i] + '"]');
      if (!e) { out[keys[i]] = null; continue; }
      var r = e.getBoundingClientRect();
      out[keys[i]] = { y:Math.round(r.top), bottom:Math.round(r.bottom), inFirstScreen: r.bottom <= limit };
    }
    return { viewportLimit: limit, controls: out,
      firstScreenCount: Object.keys(out).filter(function(k){ return out[k] && out[k].inFirstScreen; }).length,
      total: keys.length };
  })()`);

  // ── core interactions ──
  result.interactions = [];
  const interact = async (name, js, settleMs) => {
    const before = await snapshot();
    const r = await run(js);
    await wait(settleMs || 500);
    await shot(name);
    const after = await snapshot();
    result.interactions.push({ name, click:r, before, after });
    return { r, before, after };
  };

  await interact('04-tap-attack', `(function(){var b=document.querySelector('[data-action="v63-tapAttack"]');if(!b)return{found:false};b.click();return{found:true,text:(b.innerText||'').slice(0,30)};})()`, 350);
  await interact('05-skill-1', `(function(){var b=document.querySelectorAll('[data-skill],[data-action="v64-useSkill"]')[0];if(!b)return{found:false};b.click();return{found:true,text:(b.innerText||'').slice(0,30)};})()`, 600);
  await interact('06-skill-2', `(function(){var b=document.querySelectorAll('[data-skill],[data-action="v64-useSkill"]')[1];if(!b)return{found:false};b.click();return{found:true,text:(b.innerText||'').slice(0,30)};})()`, 600);
  await interact('07-skill-3', `(function(){var b=document.querySelectorAll('[data-skill],[data-action="v64-useSkill"]')[2];if(!b)return{found:false};b.click();return{found:true,text:(b.innerText||'').slice(0,30)};})()`, 600);
  await interact('08-skill-4', `(function(){var b=document.querySelectorAll('[data-skill],[data-action="v64-useSkill"]')[3];if(!b)return{found:false};b.click();return{found:true,text:(b.innerText||'').slice(0,30)};})()`, 600);
  await interact('09-speed-toggle', `(function(){var b=document.querySelector('[data-action="v64-toggleSpeed"]');if(!b)return{found:false};b.click();return{found:true};})()`, 400);

  // ── panels ──
  const panels = [
    { name:'10-equipment', open:'v64-openEquip', close:'v64-closeEquip' },
    { name:'11-goals', open:'v64-openGoals', close:'v64-closeGoals' },
    { name:'12-squad-hire', open:'v63-hireMenu', close:'v63-closeHireMenu' },
    { name:'13-tower', open:'v63-enterTower', close:'v63-exitTower' },
    { name:'14-chest', open:'v63-openChest', close:null },
    { name:'15-card-battle', open:'v63-gotoCardBattle', close:null },
  ];
  result.panels = [];
  for (const p of panels) {
    const clicked = await run(`(function(){var b=document.querySelector('[data-action="${p.open}"]');if(!b)return{found:false};var r=b.getBoundingClientRect();if(r.width<1)return{found:true,zeroSize:true};b.click();return{found:true};})()`);
    await wait(850);
    await shot(p.name);
    const opened = await run(`(function(){return{text:(document.body.innerText||'').replace(/\\s+/g,' ').slice(-420),modalCount:document.querySelectorAll('.ux-modal,.ux-popup,[class*="dialog"],[class*="panel"]').length};})()`);
    result.panels.push({ name:p.name, open:p.open, clicked, opened });
    if (p.close) await run(`(function(){var b=document.querySelector('[data-action="${p.close}"]');if(b)b.click();return true;})()`);
    else await run(`(function(){var b=document.querySelector('[data-action="closePopup"],.ux-popup-close,.ux-modal-close,[data-action="abandonBattle"]');if(b)b.click();return true;})()`);
    await wait(350);
  }

  // ── observe real auto-battle progression ──
  const beforeProgress = await snapshot();
  await wait(10000);
  const afterProgress = await snapshot();
  result.autoBattleProgress = { beforeProgress, afterProgress };
  await shot('16-battle-progress');

  // ── save file ──
  try {
    const dataDir = process.env.XIUXIAN_USER_DATA || '';
    const saveDir = path.join(dataDir, 'xiuxian-save');
    if (fs.existsSync(saveDir)) {
      result.saveFiles = fs.readdirSync(saveDir).map((f) => ({ name: f, bytes: fs.statSync(path.join(saveDir, f)).size }));
    }
  } catch (_) {}

  result.errors = {
    exceptions: exceptions.slice(0, 30), exceptionCount: exceptions.length,
    consoleErrors: consoleErrors.slice(0, 30), consoleErrorCount: consoleErrors.length,
    rendererWarnings: rendererWarnings.slice(0, 20), rendererWarningCount: rendererWarnings.length,
  };
  fs.writeFileSync(path.join(OUT, `v70-${PHASE}-play.json`), JSON.stringify(result, null, 2));
  console.log('[V70] homeReached=' + homeReached + ' controls=' + (Array.isArray(result.controls) ? result.controls.length : 'ERR'));
  console.log('[V70] errors=' + JSON.stringify({ e: exceptions.length, c: consoleErrors.length, w: rendererWarnings.length }));
  console.log('[V70] ' + PHASE.toUpperCase() + '_PLAY_DONE');
  app.exit(0);
}).catch((e) => {
  console.error('[V70] FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(path.join(OUT, `v70-${PHASE}-fatal.txt`), String(e && e.stack || e)); } catch (_) {}
  app.exit(1);
});
