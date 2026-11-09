// 诊断: Cocos引擎加载状态
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
require(path.join(__dirname, '..', '..', 'desktop', 'main.cjs'));
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  // 等窗口创建
  let win = null;
  for (let i = 0; i < 60; i++) {
    await wait(500);
    win = BrowserWindow.getAllWindows()[0];
    if (win) break;
  }
  if (!win) { console.error('NO WINDOW'); app.exit(1); return; }
  console.log('Window found, waiting for page load...');
  await wait(15000);
  
  const diag = await win.webContents.executeJavaScript(`(() => {
    var director = typeof cc !== 'undefined' && cc.director ? cc.director : null;
    var scene = director ? director.getScene() : null;
    var game = typeof cc !== 'undefined' && cc.game ? cc.game : null;
    return {
      hasSystem: typeof System !== 'undefined',
      hasCc: typeof cc !== 'undefined',
      hasGameFacade: typeof window.__GAME_FACADE__ !== 'undefined',
      hasDirector: !!director,
      sceneName: scene ? scene.name : null,
      gameRunning: game ? game.frameRate : null,
      canvasOpacity: (document.getElementById('GameCanvas') || {}).style ? document.getElementById('GameCanvas').style.opacity : 'N/A',
      bootError: (document.querySelector('#GameDiv div[style*="red"]') || {}).textContent || null,
      uiOverlayHTML: (document.getElementById('UiOverlay') || {}).innerHTML?.substring(0, 200) || 'N/A',
    };
  })()`).catch(e => ({ error: e.message }));
  
  console.log('=== COSCOS DIAG ===');
  console.log(JSON.stringify(diag, null, 2));
  app.exit(0);
});