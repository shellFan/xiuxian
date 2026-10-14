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
    this.onMessage = null;
    socket.on('data', (chunk) => this.feed(chunk));
  }

  feed(chunk) {
    if (!chunk.length) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const opcode = this.buffer[0] & 0x0f;
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
      if (opcode === 8) { this.socket.end(); return; }
      if (opcode === 9) { this.sendFrame(10, payload); continue; }
      if (opcode === 1 && this.onMessage) this.onMessage(payload.toString('utf8'));
    }
  }

  send(text) { this.sendFrame(1, Buffer.from(text, 'utf8')); }

  sendFrame(opcode, payload) {
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
    try { this.sendFrame(8, Buffer.alloc(0)); } catch { /* socket may already be closed */ }
    this.socket.end();
  }
}

class CdpSession {
  constructor(webSocket) {
    this.webSocket = webSocket;
    this.nextId = 0;
    this.pending = new Map();
    this.messages = [];
    this.inflightRequests = new Map();
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

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.webSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'page evaluation failed');
    return result.result.value;
  }

  async screenshot(filePath) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    require('node:fs').writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  }

  close() { this.webSocket.close(); }
}

module.exports = { CdpSession, listenPort };
