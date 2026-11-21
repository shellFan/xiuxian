/**
 * serve-build.cjs — 静态服务 desktop/build/web-desktop（验收/浸泡探针用）。
 * 用法：node scripts/v11-qa/serve-build.cjs [--port 8640] [--dir <buildDir>]
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const dirIdx = args.indexOf('--dir');
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 8640;
const ROOT = path.resolve(dirIdx >= 0 ? args[dirIdx + 1] : path.join(PROJECT, 'desktop', 'build', 'web-desktop'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.plist': 'application/xml',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let file = path.join(ROOT, safe);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (urlPath === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, 'index.html');
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500);
    res.end();
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`[serve-build] ${ROOT} → http://127.0.0.1:${PORT}/`));
