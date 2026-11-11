/**
 * V6.8 layout reachability probe — answers: can a real player actually reach
 * the skill bar / tap-attack / growth buttons inside the visible window?
 * Reuses an existing isolated save so it lands directly on the home screen.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('./main.cjs');

const OUT = path.join(__dirname, '..', 'ai', 'reports', 'v68');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.error('NO_WINDOW'); app.exit(1); return; }
  const run = (js) => win.webContents.executeJavaScript(js).catch((e) => ({ __error: String(e) }));

  const probe = await run(`(function(){
    function info(sel){
      var e = document.querySelector(sel);
      if (!e) return null;
      var s = getComputedStyle(e), r = e.getBoundingClientRect();
      return {
        sel: sel, cls: e.className && e.className.toString().slice(0,90),
        rect: {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
        overflowX: s.overflowX, overflowY: s.overflowY,
        clientH: e.clientHeight, scrollH: e.scrollHeight, scrollTop: e.scrollTop,
        maxScroll: e.scrollHeight - e.clientHeight,
        zIndex: s.zIndex, position: s.position, transform: s.transform,
        pointerEvents: s.pointerEvents
      };
    }
    var sels = ['html','body','#UiOverlay','.ux-screen','#UiBody','.ux-body','.ux-body--home',
                '.ux65-stage','.ux64-skillbar','.ux64-skill-bar','.ux-nav','.ux-bottom-nav',
                '.ux-footer','#GameDiv','#Cocos3dGameContainer'];
    var containers = [];
    for (var i=0;i<sels.length;i++){ var x=info(sels[i]); if(x) containers.push(x); }

    // hit-test the centre of the four skill buttons and the tap-attack button
    var targets = ['[data-action="v64-useSkill"]','[data-action="v63-tapAttack"]','[data-action="v64-toggleSpeed"]','[data-action="v64-openEquip"]'];
    var hits = targets.map(function(sel){
      var e=document.querySelector(sel); if(!e) return {sel:sel,found:false};
      var r=e.getBoundingClientRect(); var cx=r.left+r.width/2, cy=r.top+r.height/2;
      var hit = null;
      try { var h=document.elementFromPoint(cx,cy); hit = h ? (h.tagName+'.'+(h.className||'').toString().slice(0,70)) : 'NULL(out of viewport)'; } catch(err){ hit='ERR:'+err.message; }
      return {sel:sel, rect:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}, centre:{x:Math.round(cx),y:Math.round(cy)}, hit:hit, inViewport: cy < innerHeight};
    });

    // what covers the bottom strip?
    var strip = [];
    for (var y=620; y<=700; y+=20){
      for (var x=350; x<=950; x+=200){
        try { var h=document.elementFromPoint(x,y); strip.push({x:x,y:y,el:h?(h.tagName+'.'+(h.className||'').toString().slice(0,45)):'NULL'}); } catch(e){}
      }
    }

    // find every scrollable ancestor of the tap-attack button
    var chain = [];
    var el = document.querySelector('[data-action="v63-tapAttack"]');
    while (el && chain.length < 12){
      var s=getComputedStyle(el);
      chain.push({tag:el.tagName, id:el.id, cls:(el.className||'').toString().slice(0,60),
        oy:s.overflowY, clientH:el.clientHeight, scrollH:el.scrollHeight, maxScroll:el.scrollHeight-el.clientHeight});
      el=el.parentElement;
    }

    // try scrolling the most likely scroll container
    var body = document.querySelector('#UiBody') || document.querySelector('.ux-body');
    var scrollTest = null;
    if (body){
      var before = body.scrollTop;
      body.scrollTop = 500;
      var after = body.scrollTop;
      var tap = document.querySelector('[data-action="v63-tapAttack"]');
      var r2 = tap ? tap.getBoundingClientRect() : null;
      scrollTest = {before:before, after:after, moved:after>before, tapYAfter:r2?Math.round(r2.top):null};
      body.scrollTop = before;
    }
    return {
      viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},
      containers: containers, hits: hits, bottomStrip: strip, ancestorChain: chain, scrollTest: scrollTest
    };
  })()`);

  fs.writeFileSync(path.join(OUT, 'v68-layout-probe.json'), JSON.stringify(probe, null, 2));
  console.log(JSON.stringify(probe, null, 2));
  console.log('[V68] LAYOUT_PROBE_DONE');
  app.exit(0);
}).catch((e) => { console.error('FATAL', e); app.exit(1); });
