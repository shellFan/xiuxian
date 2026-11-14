/**
 * V9.0 — H5 独立静态服务器。
 *
 * 以纯静态 HTTP 服务 desktop/build/web-desktop（无 Electron 主进程 API）。
 * 浏览器打开 http://127.0.0.1:8630/ 即可游玩；存档走 localStorage
 * （bootstrap 的 LocalStorageAdapter 分支）。
 *
 * 用法：node scripts/h5-server.cjs [--port 8630] [--root desktop/build/web-desktop]
 * 也可挂任意静态托管（GitHub Pages / Nginx / 对象存储+CDN）。
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const port = Number((args.find((a) => a === '--port') || [])[1]) || Number(process.env.H5_PORT) || 8630;
const rootArg = args.indexOf('--root');
const root = path.resolve(rootArg >= 0 ? args[rootArg + 1] : path.join(__dirname, '..', 'desktop', 'build', 'web-desktop'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
  '.plist': 'application/xml',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('[h5] index.html not found under ' + root);
  console.error('[h5] build first: npm run pc:build && npm run pc:copy');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log('[h5] serving ' + root);
  console.log('[h5] http://127.0.0.1:' + port + '/');
  console.log('[h5] LAN: http://<本机IP>:' + port + '/  （手机同一 WiFi 可直接打开）');
});
