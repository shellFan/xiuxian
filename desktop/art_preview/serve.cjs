'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const allowedRoots = [
  path.join(repoRoot, 'desktop', 'art_preview'),
  path.join(repoRoot, 'assets', 'textures', 'ui', 'character_cards')
];
const host = '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '4177', 10);
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.cjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8']
]);

function send(res, status, body, headOnly = false, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(headOnly ? undefined : body);
}

function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const server = http.createServer((req, res) => {
  const method = req.method || '';
  if (method !== 'GET' && method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', false, { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    const rawPath = (req.url || '/').split(/[?#]/, 1)[0];
    pathname = decodeURIComponent(rawPath);
  } catch (_) {
    send(res, 400, 'Bad Request', method === 'HEAD');
    return;
  }

  const normalizedPath = pathname.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  if (segments.some(segment => segment === '..' || segment === '.' || segment.startsWith('.')) || normalizedPath.includes(':') || normalizedPath.includes('\0')) {
    send(res, 403, 'Forbidden', method === 'HEAD');
    return;
  }

  if (normalizedPath === '/') {
    res.writeHead(302, { Location: '/desktop/art_preview/index.html', 'X-Content-Type-Options': 'nosniff' });
    res.end();
    return;
  }
  if (normalizedPath.endsWith('/')) {
    send(res, 404, 'Not Found', method === 'HEAD');
    return;
  }

  const relativePath = normalizedPath.replace(/^\/+/, '');
  const targetPath = path.resolve(repoRoot, relativePath);
  if (!allowedRoots.some(root => isInsideRoot(root, targetPath))) {
    send(res, 403, 'Forbidden', method === 'HEAD');
    return;
  }

  fs.realpath(targetPath, (realpathError, realPath) => {
    if (realpathError) {
      send(res, 404, 'Not Found', method === 'HEAD');
      return;
    }
    if (!allowedRoots.some(root => isInsideRoot(root, realPath))) {
      send(res, 403, 'Forbidden', method === 'HEAD');
      return;
    }
    fs.stat(realPath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        send(res, 404, 'Not Found', method === 'HEAD');
        return;
      }
      const contentType = mimeTypes.get(path.extname(realPath).toLowerCase()) || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache'
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      const stream = fs.createReadStream(realPath);
      stream.on('error', () => {
        if (!res.headersSent) send(res, 500, 'Internal Server Error');
        else res.destroy();
      });
      stream.pipe(res);
    });
  });
});

server.listen(port, host, () => {
  console.log(`角色卡牌预览: http://${host}:${port}/`);
});
