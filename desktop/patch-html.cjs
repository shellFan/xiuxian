/**
 * 牛马修仙传 PC V1 — Post-build HTML/CSS patcher
 *
 * Patches the Cocos web-desktop build output for PC desktop:
 *   - Title: "牛马修仙传" (not project name)
 *   - Remove header/footer from default Cocos template
 *   - GameDiv: fullscreen (100vw × 100vh)
 *   - Background: #dfe9e8 (not white)
 *   - No border around GameDiv
 *   - Enhanced error logging for System.import
 *
 * Usage: node patch-html.cjs [build-dir]
 * Default build-dir: ./build/web-desktop
 */
const fs = require('fs');
const path = require('path');

const buildDir = process.argv[2] || path.join(__dirname, 'build', 'web-desktop');
const htmlPath = path.join(buildDir, 'index.html');
const cssPath = path.join(buildDir, 'style.css');
const GAME_WIDTH = 720;
const GAME_HEIGHT = 1280;

// Creator 3.8 reads screen settings from this file, not legacy Canvas fields.
const settingsPath = path.join(buildDir, 'src', 'settings.json');
if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.screen.designResolution = { width: GAME_WIDTH, height: GAME_HEIGHT, policy: 2 };
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
}

// ── Patch index.html ────────────────────────────────────────────────────────
if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, 'utf-8');

  // Fix title
  html = html.replace(
    /<title>.*?<\/title>/,
    '<title>牛马修仙传</title>'
  );

  // Remove header
  html = html.replace(
    /<h1[^>]*class="header"[^>]*>.*?<\/h1>/,
    ''
  );

  // Remove footer (may span multiple lines)
  html = html.replace(
    /<p[^>]*class="footer"[^>]*>[\s\S]*?<\/p>/,
    ''
  );

  // Fix GameDiv sizing: fullscreen, no border
  html = html.replace(
    /<div id="GameDiv"[^>]*>/,
    '<div id="GameDiv">'
  );

  // Older local builds carried a runtime injection script that is not part of
  // the source tree. Remove stale references so copied builds are
  // self-contained and rely on the scene's GameUIController.
  html = html.replace(/\s*<script[^>]+src=["']pc-patch\.js["'][^>]*><\/script>/gi, '');

  // Keep the HTML canvas intrinsic size aligned with Main.scene's portrait design.
  html = html.replace(
    /<canvas\b[^>]*\bid="GameCanvas"[^>]*>/,
    `<canvas id="GameCanvas" width="${GAME_WIDTH}" height="${GAME_HEIGHT}" tabindex="99">`
  );

  // Enhance System.import error logging
  html = html.replace(
    /System\.import\('\.\/index\.js'\)\.catch\(function\(err\)\s*\{\s*console\.error\(err\);\s*\}\)/,
    `System.import('./index.js').catch(function(err) {
      console.error('[COCOS BOOT ERROR]', err);
      if (err && err.stack) console.error('[COCOS BOOT STACK]', err.stack);
      var div = document.getElementById('GameDiv');
      if (div) div.innerHTML = '<div style="color:red;padding:20px;font-size:16px;">游戏启动失败: ' + (err && err.message || err) + '</div>';
    })`
  );

  // Add viewport meta for desktop
  if (!html.includes('viewport')) {
    html = html.replace(
      '</head>',
      '  <meta name="viewport" content="width=720,initial-scale=1">\n</head>'
    );
  }

  // ── Inject DOM Overlay UI ──────────────────────────────────────────────────
  // Copy ui-overlay.css and ui-overlay.js to build dir
  const overlayCss = path.join(__dirname, 'ui-overlay.css');
  const overlayJs  = path.join(__dirname, 'ui-overlay.js');
  const overlayV2Js = path.join(__dirname, 'ui-overlay-v2.js');
  const destCss    = path.join(buildDir, 'ui-overlay.css');
  const destJs     = path.join(buildDir, 'ui-overlay.js');
  const destV2Js   = path.join(buildDir, 'ui-overlay-v2.js');

  if (fs.existsSync(overlayCss)) {
    fs.copyFileSync(overlayCss, destCss);
    console.log('[patch-html] Copied ui-overlay.css');
  }
  if (fs.existsSync(overlayJs)) {
    fs.copyFileSync(overlayJs, destJs);
    console.log('[patch-html] Copied ui-overlay.js');
  }
  if (fs.existsSync(overlayV2Js)) {
    fs.copyFileSync(overlayV2Js, destV2Js);
    console.log('[patch-html] Copied ui-overlay-v2.js');
  }

  // Copy sliced design assets (docs/img/image5.png → desktop/assets/ui-slice)
  const sliceSrc = path.join(__dirname, 'assets', 'ui-slice');
  const sliceDest = path.join(buildDir, 'ui-slice');
  if (fs.existsSync(sliceSrc)) {
    fs.mkdirSync(sliceDest, { recursive: true });
    let copied = 0;
    for (const f of fs.readdirSync(sliceSrc)) {
      if (!f.endsWith('.png') && !f.endsWith('.json')) continue;
      fs.copyFileSync(path.join(sliceSrc, f), path.join(sliceDest, f));
      copied++;
    }
    console.log(`[patch-html] Copied ui-slice assets (${copied} files)`);
  }

  // Inject <link> and <script> into index.html
  // Position overlay relative to GameDiv for correct scaling
  const overlayLink = '<link rel="stylesheet" href="ui-overlay.css">';
  const overlayScript = '<script src="ui-overlay-v2.js"></script>\n  <script src="ui-overlay.js"></script>';

  if (!html.includes('ui-overlay.css')) {
    html = html.replace('</head>', `  ${overlayLink}\n</head>`);
  }
  if (!html.includes('ui-overlay.js')) {
    html = html.replace('</body>', `  ${overlayScript}\n</body>`);
  }
  if (html.includes('ui-overlay.js') && !html.includes('ui-overlay-v2.js')) {
    html = html.replace(
      '<script src="ui-overlay.js"></script>',
      '<script src="ui-overlay-v2.js"></script>\n  <script src="ui-overlay.js"></script>',
    );
  }

  // Ensure #UiOverlay fills GameDiv (GameDiv already has position:absolute from style.css)
  const overlayPositionCss = `
/* DOM Overlay — fills GameDiv coordinate system */
#UiOverlay {
  position: absolute;
  inset: 0;
  z-index: 10;
}
`;
  if (!html.includes('#UiOverlay')) {
    html = html.replace('</head>', `  <style>${overlayPositionCss}</style>\n</head>`);
  }

  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log('[patch-html] Injected DOM Overlay UI');
} else {
  console.warn('[patch-html] index.html not found at:', htmlPath);
}

// ── Patch style.css ─────────────────────────────────────────────────────────
if (fs.existsSync(cssPath)) {
  let css = fs.readFileSync(cssPath, 'utf-8');

  // Body: fullscreen, no margin, game background color
  css = css.replace(
    /body\s*\{[^}]*\}/,
    `body {
  cursor: default;
  padding: 0;
  border: 0;
  margin: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #dfe9e8;
  font-family: Helvetica, Verdana, Arial, sans-serif;
}`
  );

  // GameDiv: fullscreen, no border
  css = css.replace(
    /#GameDiv\s*\{[^}]*\}/,
    `#GameDiv {
  width: min(100vw, 56.25vh);
  height: min(100vh, 177.77777778vw);
  margin: auto;
  position: absolute;
  inset: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
}`
  );

  // Canvas: keep the authored 720x1280 portrait design as the visual ceiling.
  // Only scale down on smaller windows; never enlarge the design artwork on a
  // large desktop viewport, otherwise the reference card looks stretched.
  const portraitCanvasRule = '#Cocos3dGameContainer, #GameCanvas { width: 100%; height: 100%; display: block; }';
  if (/#(?:Cocos3dGameContainer,\s*)?#GameCanvas\s*\{/.test(css)) {
    css = css.replace(/#(?:Cocos3dGameContainer,\s*)?#GameCanvas\s*\{[^}]*\}/, portraitCanvasRule);
  } else {
    css += `\n${portraitCanvasRule}\n`;
  }

  fs.writeFileSync(cssPath, css, 'utf-8');
  console.log('[patch-html] Patched style.css');
} else {
  console.warn('[patch-html] style.css not found at:', cssPath);
}

console.log('[patch-html] Done');
