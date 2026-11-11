/**
 * V6.8 resolution + button-reachability acceptance.
 * Uses an existing isolated save so it lands directly on the playable home
 * screen, then resizes the SAME real window through the four target resolutions.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v68');
const SHOT = path.join(OUT, 'screenshots', 'after');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [[1280, 720], [1366, 768], [1600, 900], [1920, 1080]];
const errors = [];

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (_e2, level, message) => {
    if (level >= 2 && !/Security Warning/.test(message)) errors.push(String(message).slice(0, 250));
  });
});

app.whenReady().then(async () => {
  fs.mkdirSync(SHOT, { recursive: true });
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.error('NO_WINDOW'); app.exit(1); return; }
  const run = (js) => win.webContents.executeJavaScript(js).catch((e) => ({ __error: String(e) }));
  const result = { timestamp: new Date().toISOString(), resolutions: [] };

  // Resuming an existing save can open an event/settlement modal. A modal is
  // supposed to block background buttons, so dismiss it before hit-testing
  // otherwise every blocked result would be a false positive.
  result.dismissedModals = 0;
  for (let i = 0; i < 6; i++) {
    const closed = await run(`(function(){
      var layer = document.querySelector('#PopupLayer');
      var b = document.querySelector('#PopupLayer [data-vevent-choice="__auto"]')
        || document.querySelector('#EventOkBtn')
        || document.querySelector('.ux-popup-close')
        || document.querySelector('[data-action="closePopup"]')
        || (layer ? layer.querySelector('button') : null);
      if (b) { b.click(); return 'clicked'; }
      if (layer && layer.innerHTML.trim()) { layer.innerHTML = ''; return 'cleared'; }
      return false;
    })()`);
    if (!closed) break;
    result.dismissedModals++;
    await wait(700);
  }

  const audit = `(function(){
    var body = document.querySelector('#UiBody');
    var limit = body ? Math.round(body.getBoundingClientRect().height) : Math.round(innerHeight);
    var keys = ['v64-useSkill','v64-toggleSpeed','v63-toggleAuto','v63-upgradeClick','v63-enterTower','v64-openEquip','v64-openGoals','v63-tapAttack'];
    var ctrls = {};
    for (var i=0;i<keys.length;i++){
      var e = document.querySelector('[data-action="'+keys[i]+'"]');
      if (!e) { ctrls[keys[i]] = null; continue; }
      var r = e.getBoundingClientRect();
      var hit = null;
      try { var h=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); hit = h ? h.tagName+'.'+(h.className||'').toString().slice(0,40) : 'NULL'; } catch(err){ hit='ERR'; }
      ctrls[keys[i]] = {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),bottom:Math.round(r.bottom),inFirstScreen:r.bottom<=limit,hit:hit};
    }
    var stage = document.querySelector('.ux65-stage');
    var sr = stage ? stage.getBoundingClientRect() : null;
    var clipped = [];
    var all = document.querySelectorAll('*');
    for (var j=0;j<all.length;j++){
      var el=all[j]; if(el.children.length) continue;
      var t=(el.textContent||'').trim(); if(!t) continue;
      if (el.scrollWidth > el.clientWidth+2 && getComputedStyle(el).overflow !== 'visible' && el.clientWidth>0) clipped.push(t.slice(0,28));
    }
    return {
      viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},
      bodyLimit: limit,
      bodyMaxScroll: body ? body.scrollHeight-body.clientHeight : null,
      stage: sr ? {x:Math.round(sr.left),y:Math.round(sr.top),w:Math.round(sr.width),h:Math.round(sr.height)} : null,
      enemySprite: !!document.getElementById('Ux66EnemySprite'),
      squadSprites: document.querySelectorAll('.ux66-squad-sprite').length,
      skillBtns: document.querySelectorAll('.ux64-skill-btn').length,
      controls: ctrls,
      firstScreenCount: Object.keys(ctrls).filter(function(k){return ctrls[k]&&ctrls[k].inFirstScreen;}).length,
      totalControls: keys.length,
      clippedTexts: clipped.slice(0,12),
      hasOverflowX: document.documentElement.scrollWidth > innerWidth
    };
  })()`;

  for (const [w, h] of SIZES) {
    win.setSize(w, h);
    await wait(1800);
    const data = await run(audit);
    const name = `res-${w}x${h}`;
    try {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG());
      data.screenshot = name + '.png';
    } catch (e) { data.screenshotError = String(e.message); }
    result.resolutions.push({ target: `${w}x${h}`, ...data });
    console.log(`[res] ${w}x${h} firstScreen=${data.firstScreenCount}/${data.totalControls} viewport=${JSON.stringify(data.viewport)} stage=${JSON.stringify(data.stage)}`);
  }

  // Full button audit at the baseline resolution
  win.setSize(1280, 720);
  await wait(1200);
  result.buttonAudit = await run(`(function(){
    // A pending event modal legitimately blocks background buttons and is
    // re-created on every UI refresh. Temporarily hide it for hit-testing so
    // the audit measures LAYOUT reachability, not modal behaviour.
    var modal = document.querySelector('.ux-modal-layer');
    var suppressed = !!modal;
    if (modal) modal.style.setProperty('display', 'none', 'important');
    var nodes = document.querySelectorAll('[data-action], button');
    var out = [];
    for (var i=0;i<nodes.length;i++){
      var el=nodes[i], s=getComputedStyle(el), r=el.getBoundingClientRect();
      var visible = s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity)>0 && r.width>0 && r.height>0;
      if (!visible) continue;
      var cx=r.left+r.width/2, cy=r.top+r.height/2, hit=null, blocked=null;
      if (cx>=0&&cy>=0&&cx<=innerWidth&&cy<=innerHeight){
        try { var h=document.elementFromPoint(cx,cy); hit=h?(h.tagName+'.'+(h.className||'').toString().slice(0,40)):'NULL'; blocked = h ? !(el===h||el.contains(h)||h.contains(el)) : null; } catch(e){}
      }
      out.push({
        key: el.getAttribute('data-action') || ('btn:'+(el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,20)),
        text:(el.innerText||'').replace(/\\s+/g,' ').trim().slice(0,30),
        disabled: !!el.disabled || el.getAttribute('aria-disabled')==='true',
        w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.left),y:Math.round(r.top),
        fontSize:s.fontSize, cursor:s.cursor, hit:hit, blocked:blocked
      });
    }
    if (modal) modal.style.removeProperty('display');
    return { total: out.length, disabled: out.filter(function(x){return x.disabled;}).length,
             blocked: out.filter(function(x){return x.blocked===true;}).length,
             tiny: out.filter(function(x){return x.w<28||x.h<28;}).length,
             modalSuppressed: suppressed,
             controls: out };
  })()`);
  result.errors = errors;
  fs.writeFileSync(path.join(OUT, 'v68-resolution-audit.json'), JSON.stringify(result, null, 2));
  console.log('[V68] buttonAudit total=' + result.buttonAudit.total + ' disabled=' + result.buttonAudit.disabled + ' blocked=' + result.buttonAudit.blocked);
  console.log('[V68] RESOLUTION_AUDIT_DONE');
  app.exit(0);
}).catch((e) => { console.error('FATAL', e); app.exit(1); });
