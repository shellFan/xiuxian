/**
 * 牛马修仙传 PC V1 — Local Game Server
 *
 * Lightweight HTTP server for serving Cocos Web Desktop build to Electron.
 * Uses Node http module — no external dependencies.
 *
 * Why: Cocos Creator's web build uses SystemJS + fetch() for module loading.
 *      fetch() does NOT work with file:// protocol in Electron.
 *      A local HTTP server on 127.0.0.1 solves this completely.
 *
 * Security:
 *  - Binds to 127.0.0.1 only (no remote access)
 *  - Dynamic port allocation (finds available port)
 *  - Path traversal prevention (normalize + ../ check)
 *  - URL decode handling
 *  - No directory listing
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// ── MIME Types ──────────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.bin':  'application/octet-stream',
  '.wasm': 'application/wasm',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.ttf':  'font/ttf',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.map':  'application/json',       // source maps
  '.txt':  'text/plain; charset=utf-8',
};

const DEFAULT_MIME = 'application/octet-stream';

// ── GameServer Class ────────────────────────────────────────────────────────
class GameServer {
  constructor(rootDir) {
    this._rootDir = path.resolve(rootDir);
    this._server = null;
    this._port = 0;
  }

  /** Start the server on a random available port. Returns the base URL. */
  start() {
    return new Promise((resolve, reject) => {
      this._server = http.createServer((req, res) => this._handleRequest(req, res));

      // Listen on 127.0.0.1 with port 0 = OS picks available port
      this._server.listen(0, '127.0.0.1', () => {
        const addr = this._server.address();
        this._port = addr.port;
        const url = `http://127.0.0.1:${this._port}`;
        console.log(`[GameServer] Serving ${this._rootDir} at ${url}`);
        resolve(url);
      });

      this._server.on('error', (err) => {
        console.error('[GameServer] Server error:', err);
        reject(err);
      });
    });
  }

  /** Stop the server. */
  stop() {
    if (this._server) {
      this._server.close();
      this._server = null;
      console.log('[GameServer] Stopped');
    }
  }

  /** Get the base URL (only valid after start()). */
  get url() {
    return `http://127.0.0.1:${this._port}`;
  }

  /** Get the port (only valid after start()). */
  get port() {
    return this._port;
  }

  // ── Request Handler ────────────────────────────────────────────────────
  _handleRequest(req, res) {
    // Decode and normalize the URL path
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // Default to index.html for root
    if (urlPath === '/' || urlPath === '') {
      urlPath = '/index.html';
    }

    // Resolve to file system path
    const filePath = path.normalize(path.join(this._rootDir, urlPath));

    // Security: prevent path traversal
    if (!filePath.startsWith(this._rootDir + path.sep) && filePath !== this._rootDir) {
      console.warn(`[GameServer] Path traversal blocked: ${urlPath}`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Check file exists
    if (!fs.existsSync(filePath)) {
      console.warn(`[GameServer] 404: ${urlPath}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || DEFAULT_MIME;

    // Stream the file
    try {
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',  // Dev: always fresh
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      console.error(`[GameServer] Error serving ${urlPath}:`, err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = { GameServer };