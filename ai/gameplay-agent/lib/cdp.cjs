'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');

function getJson(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out')));
    req.on('error', reject);
  });
}

function listenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const address = new URL(url);
    if (address.protocol !== 'ws:' || address.hostname !== '127.0.0.1') return reject(new Error('CDP WebSocket must use localhost'));
    const socket = net.connect(Number(address.port), address.hostname);
    const key = crypto.randomBytes(16).toString('base64');
    const expected = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    let handshake = Buffer.alloc(0);
    socket.setTimeout(8000, () => socket.destroy(new Error('CDP WebSocket connection timed out')));
    socket.on('connect', () => socket.write(`GET ${address.pathname}${address.search} HTTP/1.1\r\nHost: ${address.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    const onHandshake = (chunk) => {
      handshake = Buffer.concat([handshake, chunk]);
      const boundary = handshake.indexOf('\r\n\r\n');
      if (boundary < 0) return;
      const header = handshake.subarray(0, boundary).toString('utf8');
      if (!/^HTTP\/1\.1 101\b/.test(header) || !header.includes(expected)) {
        socket.destroy();
        reject(new Error(`CDP WebSocket handshake failed: ${header.split('\r\n')[0]}`));
        return;
      }
      socket.setTimeout(0);
      socket.removeListener('data', onHandshake);
      const client = new WebSocketClient(socket);
      client.feed(handshake.subarray(boundary + 4));
      resolve(client);
    };
    socket.on('data', onHandshake);
    socket.on('error', reject);
  });
}

class WebSocketClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragmentedMessage = null;
    this.closed = false;
    this.onMessage = null;
    this.onClose = null;
    this.onError = null;
    socket.on('data', (chunk) => this.feed(chunk));
    socket.on('close', () => {
      this.closed = true;
      this.onClose?.(new Error('CDP websocket closed'));
    });
    socket.on('error', (error) => this.onError?.(error));
  }

  feed(chunk) {
    if (!chunk.length) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 0x0f;
      const finalFrame = (this.buffer[0] & 0x80) !== 0;
      const masked = (this.buffer[1] & 0x80) !== 0;
      let length = this.buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) { if (this.buffer.length < 4) return; length = this.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (this.buffer.length < 10) return; length = Number(this.buffer.readBigUInt64BE(2)); offset = 10; }
      const maskLength = masked ? 4 : 0;
      if (length > 64 * 1024 * 1024) { this.close(); throw new Error('CDP frame exceeds 64 MiB'); }
      if (this.buffer.length < offset + maskLength + length) return;
      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      let payload = this.buffer.subarray(offset + maskLength, offset + maskLength + length);
      this.buffer = this.buffer.subarray(offset + maskLength + length);
      if (masked) payload = Buffer.from(payload.map((value, index) => value ^ mask[index % 4]));
      if (opcode === 8) { this.closed = true; this.socket.end(); this.onClose?.(new Error('CDP websocket closed by peer')); return; }
      if (opcode === 9) { this.sendFrame(10, payload); continue; }
      if (opcode === 10) continue;
      if (opcode === 0) {
        if (!this.fragmentedMessage) continue;
        this.fragmentedMessage.chunks.push(payload);
        this.fragmentedMessage.length += payload.length;
        if (this.fragmentedMessage.length > 64 * 1024 * 1024) { this.close(); throw new Error('CDP message exceeds 64 MiB'); }
        if (finalFrame) {
          const message = this.fragmentedMessage;
          this.fragmentedMessage = null;
          if (message.opcode === 1) this.onMessage?.(Buffer.concat(message.chunks, message.length).toString('utf8'));
        }
        continue;
      }
      if (opcode === 1 || opcode === 2) {
        if (this.fragmentedMessage) { this.close(); throw new Error('CDP websocket started a new message before finishing the previous one'); }
        if (finalFrame) {
          if (opcode === 1) this.onMessage?.(payload.toString('utf8'));
        } else {
          this.fragmentedMessage = { opcode, chunks: [payload], length: payload.length };
        }
      }
    }
  }

  send(text) { this.sendFrame(1, Buffer.from(text, 'utf8')); }

  sendFrame(opcode, payload) {
    if (this.closed) throw new Error('CDP websocket is closed');
    const mask = crypto.randomBytes(4);
    const length = payload.length;
    let header;
    if (length < 126) { header = Buffer.alloc(2); header[1] = 0x80 | length; }
    else if (length < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(length, 2); }
    else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(length), 2); }
    header[0] = 0x80 | opcode;
    const masked = Buffer.from(payload);
    for (let index = 0; index < length; index++) masked[index] ^= mask[index % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  close() {
    if (this.closed) return;
    try { this.sendFrame(8, Buffer.alloc(0)); } catch { /* socket may already be closed */ }
    this.closed = true;
    this.socket.end();
    this.onClose?.(new Error('CDP websocket closed by client'));
  }
}

async function dispatchWheelAt(session, { x, y, deltaX = 0, deltaY }) {
  if (![x, y, deltaX, deltaY].every(Number.isFinite)) throw new TypeError('wheel coordinates and deltas must be finite numbers');
  // Chromium may dispatch a wheel packet to the last pointer target. Explicitly
  // move into the requested scroll surface first so a stale cursor cannot send
  // the wheel to another panel or the canvas behind the overlay.
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY });
}

class CdpSession {
  constructor(webSocket, options = {}) {
    this.webSocket = webSocket;
    this.nextId = 0;
    this.pending = new Map();
    this.messages = [];
    this.inflightRequests = new Map();
    this.commandTimeoutMs = options.commandTimeoutMs ?? 15000;
    this.screenshotTimeoutMs = options.screenshotTimeoutMs ?? 10000;
    this.screenshotRetries = options.screenshotRetries ?? 1;
    this.screenshotQueue = Promise.resolve();
    this.closed = false;
    this.metrics = { screenshotRequests: 0, screenshotSuccesses: 0, screenshotFailures: 0, screenshotRetries: 0, screenshotFallbacks: 0, screenshotBridgeCaptures: 0, screenshotTimeouts: 0, screenshotDurationsMs: [], commandTimeouts: 0, commandSamples: [], connectionCloses: 0 };
    webSocket.onClose = (error) => this.failPending(error ?? new Error('CDP target closed'));
    webSocket.onError = (error) => this.failPending(error ?? new Error('CDP websocket error'));
    webSocket.onMessage = (text) => {
      let message;
      try { message = JSON.parse(text); } catch { return; }
      if (message.method === 'Network.requestWillBeSent') this.inflightRequests.set(message.params.requestId, { url: message.params.request.url, method: message.params.request.method });
      if (message.method === 'Network.loadingFinished') this.inflightRequests.delete(message.params.requestId);
      if (message.method === 'Network.loadingFailed') {
        const request = this.inflightRequests.get(message.params.requestId);
        this.inflightRequests.delete(message.params.requestId);
        this.messages.push({ type: 'network-failure', requestId: message.params.requestId, url: request?.url ?? message.params.corsErrorStatus?.failedParameter ?? null, error: message.params.errorText });
      }
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) this.messages.push({ type: 'http-error', status: message.params.response.status, url: message.params.response.url });
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.messages.push({ type: 'console-error', text: message.params.args.map((item) => item.value ?? item.description ?? item.type).join(' ').slice(0, 1000) });
      }
      if (message.method === 'Runtime.exceptionThrown') this.messages.push({ type: 'exception', text: message.params.exceptionDetails?.text ?? 'renderer exception' });
      if (message.id && this.pending.has(message.id)) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        this.recordCommandSample(entry.method, message.error ? 'error' : 'success', entry.startedAt, entry.timeoutMs, entry.input);
        if (message.error) entry.reject(new Error(message.error.message));
        else entry.resolve(message.result);
      }
    };
  }

  static async connect(port, deadline) {
    const until = deadline ?? Date.now() + 45000;
    while (Date.now() < until) {
      try {
        const targets = await getJson(`http://127.0.0.1:${port}/json`);
        const page = targets.find((target) => target.type === 'page' && /index\.html/.test(target.url));
        if (page) {
          const session = new CdpSession(await connectWebSocket(page.webSocketDebuggerUrl));
          await session.send('Runtime.enable');
          await session.send('Page.enable');
          await session.send('Network.enable');
          return session;
        }
      } catch { /* the app may still be starting */ }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    throw new Error('Timed out waiting for the game EXE CDP page');
  }

  send(method, params = {}, timeoutMs = this.commandTimeoutMs) {
    if (this.closed) return Promise.reject(new Error('CDP target connection is closed'));
    const id = ++this.nextId;
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (method === 'Page.captureScreenshot') this.metrics.screenshotTimeouts++;
        this.metrics.commandTimeouts++;
        this.recordCommandSample(method, 'timeout', startedAt, timeoutMs, input);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      const input = method === 'Input.dispatchMouseEvent'
        ? Object.fromEntries(['type', 'x', 'y', 'deltaX', 'deltaY'].filter((key) => params[key] !== undefined).map((key) => [key, params[key]]))
        : undefined;
      this.pending.set(id, { resolve, reject, timer, method, startedAt, timeoutMs, input });
      try { this.webSocket.send(JSON.stringify({ id, method, params })); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        this.recordCommandSample(method, 'send_error', startedAt, timeoutMs, input);
        reject(error);
      }
    });
  }

  recordCommandSample(method, status, startedAt, timeoutMs, input) {
    const samples = this.metrics.commandSamples;
    const sample = {
      method,
      status,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      timeoutMs,
      pendingRequests: this.pending.size,
      inflightNetworkRequests: this.inflightRequests.size,
    };
    if (input) sample.input = { ...input };
    samples.push(sample);
    if (samples.length > 100) samples.splice(0, samples.length - 100);
  }

  async evaluate(expression, timeoutMs = this.commandTimeoutMs) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'page evaluation failed');
    return result.result.value;
  }

  screenshot(filePath) {
    const capture = async () => {
      const startedAt = Date.now();
      this.metrics.screenshotRequests++;
      try {
        let result;
        let viewport = null;
        try {
          viewport = await this.evaluate('({ width: window.innerWidth, height: window.innerHeight })', Math.min(1000, this.screenshotTimeoutMs));
        } catch { /* use the 1280×720 desktop baseline if renderer evaluation is unavailable */ }
        const width = Number.isFinite(viewport?.width) && viewport.width > 0 ? viewport.width : 1280;
        const height = Number.isFinite(viewport?.height) && viewport.height > 0 ? viewport.height : 720;
        const clip = { x: 0, y: 0, width, height, scale: 0.5 };
        // The Electron bridge exists only for an isolated, seeded GamePlay Agent launch.
        // Prefer it when present: Cocos/WebGL's compositor capture can stall for 10 seconds
        // per CDP attempt on Windows, while Electron's main-process capture remains responsive.
        let bridgeBase64 = null;
        try {
          bridgeBase64 = await this.evaluate(
            'window.__XIUXIAN_GAMEPLAY_CAPTURE__ ? window.__XIUXIAN_GAMEPLAY_CAPTURE__() : null',
            Math.max(this.screenshotTimeoutMs, 5000),
          );
        } catch { /* the regular CDP paths remain available when the test-only bridge is absent */ }
        if (typeof bridgeBase64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(bridgeBase64)) {
          this.metrics.screenshotBridgeCaptures++;
          result = { data: bridgeBase64 };
        }
        let screenshotError = null;
        for (let attempt = 0; !result && attempt <= this.screenshotRetries; attempt++) {
          try {
            result = await this.send('Page.captureScreenshot', {
              format: 'png', captureBeyondViewport: false, optimizeForSpeed: true, clip,
              fromSurface: attempt === 0,
            }, this.screenshotTimeoutMs);
            break;
          } catch (error) {
            screenshotError = error;
            if (attempt >= this.screenshotRetries || this.closed || !/timed out/i.test(error.message)) break;
            this.metrics.screenshotRetries++;
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }
        if (!result) {
          if (this.closed || !/timed out/i.test(screenshotError?.message ?? '')) throw screenshotError ?? new Error('CDP screenshot failed');
          const fallbackBase64 = await this.evaluate(
            'window.__XIUXIAN_GAMEPLAY_CAPTURE__ ? window.__XIUXIAN_GAMEPLAY_CAPTURE__() : null',
            Math.max(this.screenshotTimeoutMs, 5000),
          );
          if (typeof fallbackBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(fallbackBase64)) {
            throw screenshotError;
          }
          this.metrics.screenshotFallbacks++;
          result = { data: fallbackBase64 };
        }
        await require('node:fs/promises').writeFile(filePath, Buffer.from(result.data, 'base64'));
        this.metrics.screenshotSuccesses++;
      } catch (error) {
        this.metrics.screenshotFailures++;
        throw error;
      } finally {
        const durations = this.metrics.screenshotDurationsMs;
        durations.push(Date.now() - startedAt);
        if (durations.length > 256) durations.splice(0, durations.length - 256);
      }
    };
    const queued = this.screenshotQueue.then(capture, capture);
    this.screenshotQueue = queued.catch(() => {});
    return queued;
  }

  snapshotMetrics() {
    const sorted = [...this.metrics.screenshotDurationsMs].sort((a, b) => a - b);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
      ...this.metrics,
      screenshotDurationsMs: undefined,
      commandSamples: this.metrics.commandSamples.map((sample) => ({ ...sample })),
      screenshotAverageMs: sorted.length ? Math.round(sum / sorted.length) : 0,
      screenshotP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : 0,
      screenshotSamples: sorted.length,
      pendingRequests: this.pending.size,
      inflightNetworkRequests: this.inflightRequests.size,
      connectionClosed: this.closed,
    };
  }

  failPending(error) {
    if (this.closed && this.pending.size === 0) return;
    this.closed = true;
    this.metrics.connectionCloses++;
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  close() {
    this.failPending(new Error('CDP target connection closed'));
    this.webSocket.close();
  }
}

module.exports = { CdpSession, dispatchWheelAt, listenPort };
