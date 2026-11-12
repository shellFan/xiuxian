/**
 * V6.6 Sprite Sheet 生成器 (Electron离屏渲染)
 * 加载包含 v66-sprite-draw.js 的HTML页面，通过executeJavaScript调用绘制函数
 * 输出: desktop/assets/sprites/sheets/*.png + manifest.json
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'assets', 'sprites');
const SHEETS_DIR = path.join(OUT_DIR, 'sheets');
const FRAMES_DIR = path.join(OUT_DIR, 'frames');
const DRAW_LIB = path.join(__dirname, 'v66-sprite-draw.js');

const FRAME_W = 128;
const FRAME_H = 128;

// ── 角色配置 ──
const CHARACTERS = {
  hero:       { type: 'char', skin: '#f5c8a0', hair: '#2a1a0a', outfit: '#ffd700', outfitDark: '#b8960a', eyeColor: '#2a1a0a', accessory: 'sword', aura: 'rgba(255,215,0,0.3)' },
  javabackend:{ type: 'char', skin: '#f5c8a0', hair: '#1a1a2a', outfit: '#8a6adf', outfitDark: '#5a4a9f', eyeColor: '#2a1a2a', accessory: 'keyboard', aura: 'rgba(138,106,223,0.3)' },
  frontend:   { type: 'char', skin: '#f5c8a0', hair: '#3a2a1a', outfit: '#4ade80', outfitDark: '#2a8a50', eyeColor: '#2a1a2a', accessory: 'palette', aura: 'rgba(74,222,128,0.3)' },
  qa:         { type: 'char', skin: '#f5c8a0', hair: '#2a2a2a', outfit: '#f59e0b', outfitDark: '#b8700a', eyeColor: '#2a1a2a', accessory: 'magnifier', aura: 'rgba(245,158,11,0.3)' },
  devops:     { type: 'char', skin: '#f5c8a0', hair: '#1a3a3a', outfit: '#14b8a6', outfitDark: '#0a7a6e', eyeColor: '#1a2a2a', accessory: 'shield', aura: 'rgba(20,184,166,0.3)' },
};

const ENEMIES = {
  requirement: { type: 'enemy', shape: 'paper',   body: '#e8e0d0', bodyDark: '#b8a890', eye: '#ff4444' },
  bug:         { type: 'enemy', shape: 'bug',     body: '#6b8f3a', bodyDark: '#4a6a20', eye: '#ffdd44' },
  debt:        { type: 'enemy', shape: 'tower',   body: '#8a7a6a', bodyDark: '#5a4a3a', eye: '#ff6600' },
  overtime:    { type: 'enemy', shape: 'ghost',   body: '#a8c8e8', bodyDark: '#6888a8', eye: '#88ddff' },
  kpi:         { type: 'enemy', shape: 'puppet',  body: '#c8a8a8', bodyDark: '#886868', eye: '#ff3300' },
};

const BOSSES = {
  client:    { type: 'enemy', shape: 'demon', body: '#cc3333', bodyDark: '#881a1a', eye: '#ffdd44', scale: 1.4, accessory: 'contract' },
  incident:  { type: 'enemy', shape: 'demon', body: '#3366cc', bodyDark: '#1a3a88', eye: '#ff6600', scale: 1.4, accessory: 'fire' },
  kpiLord:   { type: 'enemy', shape: 'demon', body: '#8833cc', bodyDark: '#5a1a88', eye: '#ffdd44', scale: 1.5, accessory: 'lightning' },
};

const ANIMATIONS = {
  idle:    { frames: 4, fps: 4,  loop: true },
  attack:  { frames: 4, fps: 8,  loop: false },
  hit:     { frames: 3, fps: 8,  loop: false },
  death:   { frames: 4, fps: 6,  loop: false },
  victory: { frames: 4, fps: 4,  loop: true },
};

const SCENES = {
  office:   { w: 640, h: 480 },
  mountain: { w: 640, h: 480 },
  heaven:   { w: 640, h: 480 },
  void:     { w: 640, h: 480 },
  tower:    { w: 640, h: 480 },
},
  mountain: { w: 640, h: 320 },
  heaven:   { w: 640, h: 320 },
  void:     { w: 640, h: 320 },
  tower:    { w: 640, h: 320 },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 构建绘制HTML页面
function buildHtmlPage() {
  const drawCode = fs.readFileSync(DRAW_LIB, 'utf-8');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>SpriteGen</title></head>
<body>
<canvas id="frameCanvas" width="${FRAME_W}" height="${FRAME_H}"></canvas>
<canvas id="sheetCanvas" width="${FRAME_W}" height="${FRAME_H}"></canvas>
<canvas id="sceneCanvas" width="640" height="320"></canvas>
<script>${drawCode}</script>
</body></html>`;
}

function writeDataURL(dataURL, outPath) {
  const base64 = dataURL.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
}

async function generateAll() {
  ensureDir(OUT_DIR);
  ensureDir(SHEETS_DIR);
  ensureDir(FRAMES_DIR);

  const htmlPath = path.join(OUT_DIR, '_gen.html');
  fs.writeFileSync(htmlPath, buildHtmlPage());

  const win = new BrowserWindow({
    width: 800, height: 600,
    show: false,
    webPreferences: { offscreen: true, contextIsolation: false, nodeIntegration: false },
  });

  await win.loadFile(htmlPath);
  // 等待绘制库加载
  await new Promise(r => setTimeout(r, 1000));

  const manifest = {
    version: 'V6.6',
    frameSize: { w: FRAME_W, h: FRAME_H },
    characters: {},
    enemies: {},
    bosses: {},
    scenes: {},
  };

  const allTargets = [
    { name: 'characters', configs: CHARACTERS },
    { name: 'enemies', configs: ENEMIES },
    { name: 'bosses', configs: BOSSES },
  ];

  for (const group of allTargets) {
    for (const [charName, cfg] of Object.entries(group.configs)) {
      console.log(`[SPRITE] Generating ${group.name}/${charName}...`);
      const charManifest = {};

      for (const [animName, animCfg] of Object.entries(ANIMATIONS)) {
        const totalFrames = animCfg.frames;
        const frameDataUrls = [];

        for (let f = 0; f < totalFrames; f++) {
          const drawFn = cfg.type === 'char' ? 'drawChar' : 'drawEnemy';
          const cfgJson = JSON.stringify(cfg);

          const dataURL = await win.webContents.executeJavaScript(`
            (function() {
              var canvas = document.getElementById('frameCanvas');
              var ctx = canvas.getContext('2d');
              var D = window.__SPRITE_DRAW__;
              D.${drawFn}(ctx, ${cfgJson}, '${animName}', ${f}, ${totalFrames});
              return canvas.toDataURL('image/png');
            })()
          `);
          frameDataUrls.push(dataURL);

          // 保存单帧
          const framePath = path.join(FRAMES_DIR, `${charName}_${animName}_${f}.png`);
          writeDataURL(dataURL, framePath);
        }

        // 水平拼接成sprite sheet
        const sheetW = FRAME_W * totalFrames;
        const sheetDataURL = await win.webContents.executeJavaScript(`
          (function() {
            var frameCanvas = document.getElementById('frameCanvas');
            var sheetCanvas = document.getElementById('sheetCanvas');
            sheetCanvas.width = ${sheetW};
            sheetCanvas.height = ${FRAME_H};
            var sctx = sheetCanvas.getContext('2d');
            sctx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
            var frameImgs = ${JSON.stringify(frameDataUrls.map(() => null))};
            var promises = ${JSON.stringify(frameDataUrls)}.map(function(url, i) {
              return new Promise(function(resolve) {
                var img = new Image();
                img.onload = function() { resolve({img: img, i: i}); };
                img.src = url;
              });
            });
            return Promise.all(promises).then(function(results) {
              results.forEach(function(r) {
                sctx.drawImage(r.img, r.i * ${FRAME_W}, 0);
              });
              return sheetCanvas.toDataURL('image/png');
            });
          })()
        `);

        const sheetPath = path.join(SHEETS_DIR, `${charName}_${animName}.png`);
        writeDataURL(sheetDataURL, sheetPath);

        charManifest[animName] = {
          frames: totalFrames,
          fps: animCfg.fps,
          loop: animCfg.loop,
          sheet: `sheets/${charName}_${animName}.png`,
          sheetWidth: sheetW,
          frameFiles: Array.from({ length: totalFrames }, (_, i) =>
            `frames/${charName}_${animName}_${i}.png`
          ),
        };
      }

      manifest[group.name][charName] = charManifest;
    }
  }

  // 生成场景背景
  for (const [theme, sceneCfg] of Object.entries(SCENES)) {
    console.log(`[SCENE] Generating ${theme}...`);
    const dataURL = await win.webContents.executeJavaScript(`
      (function() {
        var canvas = document.getElementById('sceneCanvas');
        canvas.width = ${sceneCfg.w};
        canvas.height = ${sceneCfg.h};
        var ctx = canvas.getContext('2d');
        window.__SPRITE_DRAW__.drawScene(ctx, '${theme}', ${sceneCfg.w}, ${sceneCfg.h});
        return canvas.toDataURL('image/png');
      })()
    `);
    const scenePath = path.join(SHEETS_DIR, `scene_${theme}.png`);
    writeDataURL(dataURL, scenePath);
    manifest.scenes[theme] = {
      w: sceneCfg.w, h: sceneCfg.h,
      file: `sheets/scene_${theme}.png`,
    };
  }

  // 写manifest
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('[SPRITE] manifest.json written');

  // 清理临时HTML
  try { fs.unlinkSync(htmlPath); } catch (e) {}

  win.destroy();
  return manifest;
}

app.whenReady().then(async () => {
  try {
    const m = await generateAll();
    const totalSheets = Object.values(m.characters).reduce((a, c) => a + Object.keys(c).length, 0)
      + Object.values(m.enemies).reduce((a, c) => a + Object.keys(c).length, 0)
      + Object.values(m.bosses).reduce((a, c) => a + Object.keys(c).length, 0)
      + Object.keys(m.scenes).length;
    console.log(`\n[SPRITE] DONE: ${totalSheets} sprite sheets + ${Object.keys(m.scenes).length} scenes`);
    console.log(`[SPRITE] Output: ${OUT_DIR}`);
    app.exit(0);
  } catch (err) {
    console.error('[SPRITE] FATAL:', err);
    app.exit(1);
  }
});