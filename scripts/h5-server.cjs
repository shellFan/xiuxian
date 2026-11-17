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

function parseOptions(args, env = process.env) {
  const options = { port: env.H5_PORT === undefined ? '8630' : env.H5_PORT,
    root: path.join(__dirname, '..', 'desktop', 'build', 'web-desktop'), host: '127.0.0.1' };
  for (let i = 0; i < args.length; i += 1) {
    const match = /^(--port|--root|--host)(?:=(.*))?$/.exec(args[i]);
    if (!match) throw new Error('Unknown H5 argument: ' + args[i]);
    const key = match[1].slice(2);
    const value = match[2] === undefined ? args[++i] : match[2];
    if (!value || value.startsWith('--')) throw new Error('Missing ' + key + ' value');
    options[key] = value;
  }
  if (!/^\d+$/.test(String(options.port)) || Number(options.port) > 65535) throw new Error('Invalid H5 port');
  return { port: Number(options.port), root: path.resolve(options.root), host: options.host };
}

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

// ── Optional same-origin AI proxy (V10) ─────────────────────────────────────
// 浏览器永远不直接访问本地模型端口 (7860)：H5 通过本服务器的同源 /ai/* 路由
// 使用 ai-bridge（内部再转发到 MNN 服务或回退规则引擎）。无密钥、无跨域暴露。
// 限流：每 IP 每 10 秒最多 24 次，防止脚本滥用拖垮本地推理。
function createAiBridgeProxy() {
  let bridge = null;
  try { bridge = require(path.join(__dirname, '..', 'desktop', 'ai-bridge.cjs')); } catch { bridge = null; }
  if (!bridge) return null;
  const hits = new Map();
  const rateLimited = (ip) => {
    const now = Date.now();
    const windowStart = now - 10000;
    const recent = (hits.get(ip) || []).filter((at) => at > windowStart);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > 24;
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 16384) { reject(new Error('payload too large')); req.destroy(); } });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
  return async (req, res, urlPath, query) => {
    const ip = (req.socket && req.socket.remoteAddress) || 'local';
    const send = (code, payload) => {
      const body = JSON.stringify(payload);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
    };
    try {
      if (urlPath === '/ai/status') {
        send(200, await bridge.getStatus());
        return;
      }
      if (urlPath === '/ai/npc-list') { send(200, { success: true, npcs: bridge.getNpcList() }); return; }
      if (urlPath === '/ai/greeting') { send(200, { success: true, greeting: bridge.getGreeting(query.get('persona')) }); return; }
      if (urlPath === '/ai/clear-history') {
        if (req.method !== 'POST') { send(405, { error: 'POST required' }); return; }
        const body = JSON.parse((await readBody(req)) || '{}');
        send(200, bridge.clearHistory(body.personaId));
        return;
      }
      if (urlPath === '/ai/chat') {
        if (req.method !== 'POST') { send(405, { error: 'POST required' }); return; }
        if (rateLimited(ip)) { send(429, { error: 'too many AI requests; slow down' }); return; }
        const body = JSON.parse((await readBody(req)) || '{}');
        const result = await bridge.chat(body.personaId, body.message, body.context);
        send(200, { success: true, reply: result.reply, mode: result.mode, persona: result.persona, avatar: result.avatar });
        return;
      }
      send(404, { error: 'unknown ai route' });
    } catch (error) {
      send(502, { error: String(error && error.message || error) });
    }
  };
}

function createH5Server(root, options = {}) {
 const realRoot = fs.realpathSync(root);
 const aiProxy = options.ai === false ? null : createAiBridgeProxy();
 return http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); }
  catch { res.writeHead(400); res.end('invalid URL'); return; }
  if (urlPath.startsWith('/ai/') && aiProxy) {
    aiProxy(req, res, urlPath.replace(/\/+$/, ''), new URL(req.url, 'http://local').searchParams);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('method not allowed'); return; }
  if (urlPath.includes('\0')) { res.writeHead(400); res.end('invalid URL'); return; }
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.resolve(realRoot, '.' + urlPath.replace(/\\/g, '/'));
  const contained = (candidate) => { const relative = path.relative(realRoot, candidate); return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
  if (!contained(file)) { res.writeHead(403); res.end('forbidden'); return; }
  try {
    if (!contained(fs.realpathSync(file))) { res.writeHead(403); res.end('forbidden'); return; }
  } catch { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ['.html', '.js', '.mjs', '.css', '.json'].includes(ext) ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
 });
}

if (require.main === module) {
 try {
  const { root, port, host } = parseOptions(process.argv.slice(2));
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('index.html not found under ' + root + '; build and copy the game first');
  const server = createH5Server(root);
  server.on('error', (error) => { console.error('[h5] ' + error.message); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log('[h5] serving ' + root);
    console.log('[h5] http://' + host + ':' + server.address().port + '/');
  });
 } catch (error) { console.error('[h5] ' + error.message); process.exitCode = 1; }
}
module.exports = { parseOptions, createH5Server };
