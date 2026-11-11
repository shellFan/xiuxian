/**
 * V6.8 Baseline UI audit — real Electron renderer, isolated save.
 *
 * Reuses the project's proven v65/v66 harness pattern:
 *   require('./main.cjs') -> app.whenReady -> executeJavaScript + capturePage
 *
 * Run with:
 *   XIUXIAN_USER_DATA=<isolated dir> electron.exe desktop/v68-before.cjs
 *
 * This script NEVER touches the real player save and NEVER drives the user's
 * desktop input. It only reads/queries its own BrowserWindow.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v68');
const SHOT = path.join(OUT, 'screenshots', 'before');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rendererErrors = [];
const rendererExceptions = [];
const consoleErrors = [];

app.on('browser-window-created', (_event, win) => {
  try { win.setSkipTaskbar(true); } catch (_) { /* noop */ }
  try {
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    dbg.on('message', (_e, method, params) => {
      if (method === 'Runtime.exceptionThrown') {
        const d = params.exceptionDetails || {};
        rendererExceptions.push({
          text: d.text || '',
          description: (d.exception && d.exception.description) || '',
          url: d.url || '',
          line: d.lineNumber,
        });
      }
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        consoleErrors.push((params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 400));
      }
    });
    dbg.sendCommand('Runtime.enable').catch(() => {});
  } catch (_) { /* debugger unavailable */ }
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) rendererErrors.push(String(message).slice(0, 400));
  });
  win.webContents.on('render-process-gone', (_e, d) => {
    rendererErrors.push('RENDER_PROCESS_GONE ' + JSON.stringify(d));
  });
});

app.whenReady().then(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  const steps = [];
  const result = {
    timestamp: new Date().toISOString(),
    phase: 'BEFORE',
    head: process.env.V68_HEAD || 'unknown',
    steps,
  };
  const shot = async (name) => {
    try {
      const img = await winRef().webContents.capturePage();
      fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG());
      steps.push({ type: 'shot', name, ok: true });
      console.log('[shot] ' + name);
      return true;
    } catch (e) {
      steps.push({ type: 'shot', name, ok: false, error: String(e) });
      console.log('[shot-fail] ' + name + ' ' + e.message);
      return false;
    }
  };
  const winRef = () => BrowserWindow.getAllWindows()[0];
  const run = async (js) => {
    try { return await winRef().webContents.executeJavaScript(js); }
    catch (e) { console.log('[js-err] ' + String(e.message).slice(0, 160)); return { __error: String(e.message) }; }
  };

  await wait(14000); // fixed wait: polling interferes with Cocos boot (per v65 harness)
  if (!winRef()) { console.error('FAIL: no BrowserWindow'); app.exit(1); return; }

  const boot = await run(`(function(){
    return {
      title: document.title,
      href: location.href,
      canvas: !!document.querySelector('canvas'),
      overlay: !!document.getElementById('UiOverlay'),
      stage: !!document.querySelector('.ux65-stage'),
      chooseProfession: document.querySelectorAll('[data-choose-profession]').length,
      actionCount: document.querySelectorAll('[data-action]').length,
      bodyText: (document.body.innerText||'').slice(0, 600)
    };
  })()`);
  result.boot = boot;
  console.log('[boot] ' + JSON.stringify(boot));
  await shot('01-boot');

  // --- character creation (fresh isolated save) ---
  const choose = await run(`(function(){
    var b = document.querySelector('[data-choose-profession]:not([disabled])');
    if (!b) return { clicked:false, reason:'no profession button' };
    b.click();
    return { clicked:true, label:(b.innerText||'').slice(0,40) };
  })()`);
  result.characterCreation = choose;
  console.log('[choose] ' + JSON.stringify(choose));
  if (choose && choose.clicked) await shot('02-character-created');
  await wait(6000);

  // wait for battle stage
  let stageReady = false;
  for (let i = 0; i < 8; i++) {
    stageReady = await run(`!!document.querySelector('.ux65-stage')`).catch(() => false);
    if (stageReady) break;
    await wait(2000);
  }
  result.stageReady = !!stageReady;
  await shot('03-home-battle');

  // --- full interactive control audit ---
  const controls = await run(`(function(){
    function vis(el){
      var s = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
      if (r.width < 1 || r.height < 1) return false;
      return true;
    }
    var out = [];
    var nodes = document.querySelectorAll('[data-action]');
    for (var i=0;i<nodes.length;i++){
      var el = nodes[i];
      var r = el.getBoundingClientRect();
      var visible = vis(el);
      var cx = r.left + r.width/2, cy = r.top + r.height/2;
      var top = null, occluded = null;
      if (visible && cx >= 0 && cy >= 0) {
        try {
          var hit = document.elementFromPoint(cx, cy);
          top = hit ? (hit.tagName + '.' + (hit.className||'').toString().slice(0,50)) : null;
          occluded = hit ? !(el === hit || el.contains(hit)) : null;
        } catch(e) { occluded = 'error'; }
      }
      out.push({
        action: el.getAttribute('data-action'),
        tag: el.tagName,
        text: (el.innerText || el.value || '').replace(/\\s+/g,' ').trim().slice(0, 40),
        visible: visible,
        disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
        w: Math.round(r.width), h: Math.round(r.height),
        x: Math.round(r.left), y: Math.round(r.top),
        fontSize: getComputedStyle(el).fontSize,
        occluded: occluded,
        hitTop: top
      });
    }
    return out;
  })()`);
  result.controls = controls;

  const layout = await run(`(function(){
    var all = document.querySelectorAll('*');
    var texts = [];
    for (var i=0;i<all.length;i++){
      var el = all[i];
      if (el.children.length) continue;
      var t = (el.textContent||'').trim();
      if (!t) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') {
        texts.push({ text: t.slice(0,40), scrollW: el.scrollWidth, clientW: el.clientWidth });
      }
    }
    return {
      domNodes: all.length,
      viewport: { w: innerWidth, h: innerHeight },
      devicePixelRatio: devicePixelRatio,
      canvas: (function(){ var c=document.querySelector('canvas'); return c ? {w:c.width,h:c.height,cssW:c.getBoundingClientRect().width,cssH:c.getBoundingClientRect().height} : null; })(),
      stage: (function(){ var s=document.querySelector('.ux65-stage'); return s ? {w:s.getBoundingClientRect().width,h:s.getBoundingClientRect().height,cls:s.className} : null; })(),
      spriteCount: document.querySelectorAll('.ux66-squad-sprite').length,
      enemySprite: !!document.getElementById('Ux66EnemySprite'),
      cssCharRemains: !!document.querySelector('.ux65-char-body'),
      sceneBg: !!document.querySelector('.ux66-scene-bg'),
      skillBtns: document.querySelectorAll('[data-skill], [data-action="v64-useSkill"]').length,
      truncatedTexts: texts.slice(0, 30),
      scrollOverflow: { docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight, winW: innerWidth, winH: innerHeight },
      visibleButtonCount: (function(){ var n=0, b=document.querySelectorAll('button,[data-action]'); for(var i=0;i<b.length;i++){var r=b[i].getBoundingClientRect(); var s=getComputedStyle(b[i]); if(r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden') n++;} return n; })()
    };
  })()`);
  result.layout = layout;
  console.log('[layout] ' + JSON.stringify(layout));

  // --- core interaction screenshots ---
  await run(`(function(){ var b=document.querySelector('[data-action="v63-tapAttack"]'); if(b) b.click(); return !!b; })()`);
  await wait(300);
  await shot('04-tap-attack');

  const skillClick = await run(`(function(){
    var b = document.querySelector('.ux64-skill-btn--ready[data-skill]') || document.querySelector('[data-action="v64-useSkill"]');
    if (!b) return { clicked:false, reason:'no skill button' };
    b.click();
    return { clicked:true, label:(b.innerText||'').slice(0,40) };
  })()`);
  result.firstSkill = skillClick;
  await wait(500);
  await shot('05-skill-release');

  await run(`(function(){ var b=document.querySelector('[data-action="v64-toggleSpeed"]'); if(b) b.click(); return !!b; })()`);
  await wait(400);
  await shot('06-speed-toggle');
  await run(`(function(){ var b=document.querySelector('[data-action="v64-toggleSpeed"]'); if(b) b.click(); return !!b; })()`);
  await wait(300);

  // --- panel walk: open -> capture -> verify -> close ---
  const panels = [
    { name: '07-equipment', open: 'v64-openEquip', close: 'v64-closeEquip' },
    { name: '08-goals', open: 'v64-openGoals', close: 'v64-closeGoals' },
    { name: '09-hire-menu', open: 'v63-hireMenu', close: 'v63-closeHireMenu' },
    { name: '10-tower', open: 'v63-enterTower', close: 'v63-exitTower' },
    { name: '11-chest', open: 'v63-openChest', close: null },
    { name: '12-card-battle', open: 'v63-gotoCardBattle', close: null },
  ];
  result.panels = [];
  for (const p of panels) {
    const before = await run(`(function(){ return document.querySelectorAll('.ux-modal,.ux-popup,[class*="panel"],[class*="overlay"]').length; })()`);
    const clicked = await run(`(function(){
      var b = document.querySelector('[data-action="${p.open}"]');
      if (!b) return { clicked:false, reason:'action not in DOM' };
      var r = b.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { clicked:false, reason:'zero-size button' };
      b.click();
      return { clicked:true };
    })()`);
    await wait(900);
    await shot(p.name);
    const after = await run(`(function(){
      return {
        modalCount: document.querySelectorAll('.ux-modal,.ux-popup,[class*="panel"],[class*="overlay"]').length,
        bodyText: (document.body.innerText||'').slice(-500)
      };
    })()`);
    result.panels.push({ name: p.name, open: p.open, before, clicked, after });
    if (p.close) {
      await run(`(function(){ var b=document.querySelector('[data-action="${p.close}"]'); if(b) b.click(); return true; })()`);
    } else {
      await run(`(function(){
        var b = document.querySelector('[data-action="closePopup"],.ux-popup-close,.ux-modal-close');
        if (b) b.click();
        return true;
      })()`);
    }
    await wait(400);
  }

  // --- final battle progress ---
  await wait(4000);
  const progress = await run(`(function(){
    function t(sel){ var e=document.querySelector(sel); return e ? (e.innerText||'').trim().slice(0,60) : null; }
    return {
      stageNum: t('.ux65-stage-num'), enemyName: t('.ux65-enemy-name'),
      hpText: t('.ux65-enemy-hp-text'), power: t('.ux65-power'),
      speed: t('.ux64-speed-btn'),
      bodyTail: (document.body.innerText||'').slice(-400)
    };
  })()`);
  result.progress = progress;
  await shot('13-battle-progress');

  result.rendererErrors = rendererErrors.slice(0, 60);
  result.rendererExceptions = rendererExceptions.slice(0, 30);
  result.consoleErrors = consoleErrors.slice(0, 60);
  result.errorCounts = {
    rendererErrors: rendererErrors.length,
    exceptions: rendererExceptions.length,
    consoleErrors: consoleErrors.length,
  };
  fs.writeFileSync(path.join(OUT, 'v68-before-audit.json'), JSON.stringify(result, null, 2));
  console.log('[V68] errorCounts=' + JSON.stringify(result.errorCounts));
  console.log('[V68] controls=' + (Array.isArray(controls) ? controls.length : 'ERR'));
  console.log('[V68] BEFORE_AUDIT_DONE');
  app.exit(0);
}).catch((e) => {
  console.error('[V68] FATAL ' + (e && e.stack || e));
  try { fs.writeFileSync(path.join(OUT, 'v68-before-fatal.txt'), String(e && e.stack || e)); } catch (_) {}
  app.exit(1);
});
