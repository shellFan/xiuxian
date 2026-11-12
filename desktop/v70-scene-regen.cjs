/**
 * V7.0 场景重生成 — 仅重绘 5 张场景背景为 640×480。
 *
 * 背景：场景原为 640×320，舞台(640×483)用 background-size:cover 拉伸后
 * 两侧被裁（月亮半切在右缘、窗户被裁出左缘）。drawScene 本身按 w/h 相对
 * 布局，重生成即可恢复完整构图。
 *
 * 运行方式（不能从 Bash 直接启动 Electron，见 V70-BASELINE.md §5）：
 *   powershell -File ai/work/v70-run-play.ps1 -Script v70-scene-regen.cjs -Phase sceneregen ...
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'assets', 'sprites');
const SHEETS_DIR = path.join(OUT_DIR, 'sheets');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const DRAW_LIB = path.join(__dirname, 'v66-sprite-draw.js');

const THEMES = ['office', 'mountain', 'heaven', 'void', 'tower'];
const W = 640;
const H = 480;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGF = path.join(__dirname, '..', 'ai', 'reports', 'v70', 'v70-sceneregen.log');
const logf = (m) => { try { fs.appendFileSync(LOGF, new Date().toISOString().slice(11, 19) + ' ' + m + '\n'); } catch (_) {} console.log(m); };

app.whenReady().then(async () => {
  logf('begin OUT_DIR=' + OUT_DIR);
  const drawCode = fs.readFileSync(DRAW_LIB, 'utf-8');
  const htmlPath = path.join(OUT_DIR, '_v70-scene.html');
  fs.writeFileSync(htmlPath, '<!DOCTYPE html><html><head><meta charset="utf-8"><title>V70SceneGen</title></head><body><canvas id="sceneCanvas" width="' + W + '" height="' + H + '"></canvas><script>' + drawCode + '</script></body></html>');
  const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { offscreen: true, contextIsolation: false, nodeIntegration: false } });
  await win.loadFile(htmlPath);
  await wait(1000);
  for (const theme of THEMES) {
    const dataURL = await win.webContents.executeJavaScript(`
      (function() {
        var canvas = document.getElementById('sceneCanvas');
        canvas.width = ${W}; canvas.height = ${H};
        var ctx = canvas.getContext('2d');
        window.__SPRITE_DRAW__.drawScene(ctx, '${theme}', ${W}, ${H});
        return canvas.toDataURL('image/png');
      })()
    `);
    const file = path.join(SHEETS_DIR, `scene_${theme}.png`);
    fs.writeFileSync(file, Buffer.from(String(dataURL).split(',')[1], 'base64'));
    logf('[SCENE-REGEN] ' + file);
  }
  // 同步 manifest 中的场景尺寸
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (m && m.scenes) {
      for (const t of THEMES) {
        if (m.scenes[t]) { m.scenes[t].w = W; m.scenes[t].h = H; }
      }
      fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
      logf('[SCENE-REGEN] manifest updated');
    }
  } catch (e) { logf('[SCENE-REGEN] manifest skip: ' + e.message); }
  win.destroy();
  try { fs.unlinkSync(htmlPath); } catch (e) {}
  app.exit(0);
}).catch((e) => { logf('FATAL ' + (e && e.stack || e)); app.exit(1); });
