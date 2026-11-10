// V6.5 诊断：检查overlay状态+V63桥接+战斗区渲染
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

require('./main.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  await wait(14000);
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.error('FAIL: No window'); app.exit(1); }

  // 处理职业选择
  await win.webContents.executeJavaScript(`(function(){
    var btn = document.querySelector('[data-choose-profession]:not([disabled])');
    if (btn) btn.click();
    return true;
  })()`).catch(() => {});
  await wait(6000);

  const diag = await win.webContents.executeJavaScript(`(function(){
    var r = {};
    r.viewport = { w: window.innerWidth, h: window.innerHeight };
    r.overlayExists = !!document.getElementById('UiOverlay');
    r.v63Exists = !!window.__V63__;
    r.v63BattleHtml = window.__V63__ ? (window.__V63__.battleAreaHtml() || '').substring(0, 200) : 'NO_V63';
    r.facadeExists = !!window.__GAME_FACADE__;
    var overlay = document.getElementById('UiOverlay');
    if (overlay) {
      r.overlayDisplay = overlay.style.display || getComputedStyle(overlay).display;
      r.overlayChildCount = overlay.children.length;
      var homePage = overlay.querySelector('.ux-home');
      r.homeExists = !!homePage;
      if (homePage) {
        r.homeChildren = Array.from(homePage.children).map(function(c) {
          return c.className.split(' ')[0] || c.tagName;
        });
      }
      // Check for old battle area
      r.oldBattleExists = !!overlay.querySelector('.ux63-battle');
      r.newStageExists = !!overlay.querySelector('.ux65-stage');
      // Check visible page
      var pages = overlay.querySelectorAll('.ux-page');
      r.pageCount = pages.length;
      r.visiblePages = Array.from(pages).filter(function(p) {
        return p.style.display !== 'none' && !p.classList.contains('is-hidden');
      }).map(function(p) { return p.className.split(' ')[1] || 'unknown'; });
    }
    // Check what renderHome returns
    r.profSelected = (function() {
      try {
        var f = window.__GAME_FACADE__;
        if (!f) return 'no-facade';
        var cs = f.queryCharacterCreation ? f.queryCharacterCreation() : null;
        return cs ? cs.status : 'no-creation-state';
      } catch(e) { return 'error: ' + e.message; }
    })();
    return r;
  })()`).catch(e => ({ error: String(e) }));

  console.log('[V65-DIAG]', JSON.stringify(diag, null, 2));
  app.exit(0);
});