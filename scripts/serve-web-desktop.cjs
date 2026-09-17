/**
 * 牛马修仙传 PC V1 — Standalone HTTP server for browser testing
 *
 * Serves the Cocos web-desktop build via HTTP so you can test in a browser
 * (not Electron). This isolates whether the black screen is an Electron issue
 * or a Cocos build issue.
 *
 * Usage: node scripts/serve-web-desktop.cjs
 * Then open: http://127.0.0.1:PORT
 *
 * Also runs smoke tests to verify key files exist.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

const rootDir = path.resolve(path.join(__dirname, '..', 'build', 'web-desktop'));

if (!fs.existsSync(rootDir)) {
  console.error(`[serve] Build directory not found: ${rootDir}`);
  console.error('[serve] Run Cocos build first');
  process.exit(1);
}

// ── Smoke tests ─────────────────────────────────────────────────────────────
const criticalFiles = [
  'index.html', 'index.js', 'application.js', 'style.css',
  'src/system.bundle.js', 'src/import-map.json', 'src/polyfills.bundle.js',
];

let smokePass = true;
for (const file of criticalFiles) {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    console.log(`[smoke] ✓ ${file} (${(size / 1024).toFixed(1)}KB)`);
  } else {
    console.error(`[smoke] ✗ ${file} MISSING`);
    smokePass = false;
  }
}

// Check assets directory
const assetsDir = path.join(rootDir, 'assets');
if (fs.existsSync(assetsDir)) {
  const assetFiles = findFiles(assetsDir).length;
  console.log(`[smoke] ✓ assets/ (${assetFiles} files)`);
} else {
  console.error('[smoke] ✗ assets/ directory MISSING');
  smokePass = false;
}

// Check cocos-js directory
const cocosDir = path.join(rootDir, 'cocos-js');
if (fs.existsSync(cocosDir)) {
  const engineFiles = findFiles(cocosDir).length;
  console.log(`[smoke] ✓ cocos-js/ (${engineFiles} files)`);
} else {
  console.error('[smoke] ✗ cocos-js/ directory MISSING');
  smokePass = false;
}

if (!smokePass) {
  console.error('[smoke] Critical files missing — build may be incomplete');
}

// ── Start server ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); res.end('Bad Request'); return;
  }
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

  const filePath = path.normalize(path.join(rootDir, urlPath));
  if (!filePath.startsWith(rootDir + path.sep) && filePath !== rootDir) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  if (!fs.existsSync(filePath)) {
    console.warn(`[serve] 404: ${urlPath}`);
    res.writeHead(404); res.end('Not Found'); return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`\n[serve] 🎮 牛马修仙传 Web Desktop Server`);
  console.log(`[serve] Root: ${rootDir}`);
  console.log(`[serve] URL:  http://127.0.0.1:${port}`);
  console.log(`[serve] Press Ctrl+C to stop\n`);
});

function findFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? findFiles(p) : [p];
  });
}