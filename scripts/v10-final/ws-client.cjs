'use strict';

/**
 * Minimal RFC 6455 WebSocket client for the CDP harness.
 *
 * Node 18 (the only runtime available in this environment) has no global
 * WebSocket, and npm installs are impossible without a system Node.  This
 * module implements the small subset of the protocol DevTools needs:
 * text frames, fragmentation, ping/pong and close.  Only ws:// to a local
 * CDP endpoint is required, so TLS is intentionally out of scope.
 */

const http = require('node:http');
const crypto = require('node:crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

class MiniWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._socket = null;
    this._buffers = [];
    this._messageChunks = [];
    this._fragmentOpcode = 0;
    this._sendQueue = [];
    this._closedByUs = false;
    this._connect();
  }

  _connect() {
    const parsed = new URL(this.url);
    const key = crypto.randomBytes(16).toString('base64');
    const request = http.request({
      hostname: parsed.hostname,
      port: Number(parsed.port) || 80,
      path: parsed.pathname + parsed.search,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
        Host: `${parsed.hostname}:${parsed.port}`,
      },
      timeout: 15000,
    });
    request.on('upgrade', (response, socket, head) => {
      const expected = crypto.createHash('sha1').update(key + GUID).digest('base64');
      if ((response.headers['sec-websocket-accept'] || '') !== expected) {
        this._fail(new Error('websocket handshake accept mismatch'));
        return;
      }
      this._socket = socket;
      socket.setNoDelay(true);
      if (head && head.length) this._buffers.push(head);
      socket.on('data', (chunk) => this._onData(chunk));
      socket.on('error', (error) => this._fail(error));
      socket.on('close', () => this._onClosed());
      this.readyState = OPEN;
      for (const queued of this._sendQueue) this._sendFrame(queued.opcode, queued.payload);
      this._sendQueue = [];
      if (this.onopen) this.onopen();
    });
    request.on('response', (response) => {
      this._fail(new Error(`websocket upgrade rejected with status ${response.statusCode}`));
    });
    request.on('timeout', () => {
      request.destroy(new Error('websocket handshake timeout'));
    });
    request.on('error', (error) => this._fail(error));
    request.end();
  }

  _onData(chunk) {
    this._buffers.push(chunk);
    while (true) {
      const frame = this._readFrame();
      if (!frame) break;
      this._handleFrame(frame);
    }
  }

  _readFrame() {
    const buffer = Buffer.concat(this._buffers);
    if (buffer.length < 2) return null;
    const first = buffer[0];
    const second = buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < offset + 2) return null;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) return null;
      const big = buffer.readBigUInt64BE(offset);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
        this._fail(new Error('websocket frame too large'));
        return null;
      }
      length = Number(big);
      offset += 8;
    }
    let mask = null;
    if (masked) {
      if (buffer.length < offset + 4) return null;
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }
    if (buffer.length < offset + length) return null;
    let payload = buffer.subarray(offset, offset + length);
    if (mask) {
      payload = Buffer.from(payload);
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i & 3];
    }
    this._buffers = [buffer.subarray(offset + length)];
    return { fin, opcode, payload };
  }

  _handleFrame({ fin, opcode, payload }) {
    if (opcode === 0x8) {
      this.readyState = CLOSING;
      if (!this._closedByUs) {
        try { this._socket.write(this._encodeFrame(0x8, payload.subarray(0, 2))); } catch (_) { /* socket gone */ }
      }
      try { this._socket.end(); } catch (_) { /* socket gone */ }
      return;
    }
    if (opcode === 0x9) {
      try { this._socket.write(this._encodeFrame(0xA, payload)); } catch (_) { /* socket gone */ }
      return;
    }
    if (opcode === 0xA) return;
    if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
      if (opcode !== 0x0) this._fragmentOpcode = opcode;
      this._messageChunks.push(payload);
      if (fin) {
        const message = Buffer.concat(this._messageChunks);
        this._messageChunks = [];
        if (this.onmessage && this.readyState === OPEN) {
          this.onmessage({ data: this._fragmentOpcode === 0x1 ? message.toString('utf8') : message });
        }
        this._fragmentOpcode = 0;
      }
      return;
    }
    this._fail(new Error(`unsupported websocket opcode ${opcode}`));
  }

  _encodeFrame(opcode, payload) {
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x80 | opcode;
    const mask = crypto.randomBytes(4);
    header[1] |= 0x80;
    const body = Buffer.from(payload);
    for (let i = 0; i < body.length; i += 1) body[i] ^= mask[i & 3];
    return Buffer.concat([header, mask, body]);
  }

  _sendFrame(opcode, payload) {
    if (this.readyState !== OPEN) {
      if (this.readyState === CONNECTING) {
        this._sendQueue.push({ opcode, payload });
        return;
      }
      throw new Error(`websocket is not open (readyState ${this.readyState})`);
    }
    this._socket.write(this._encodeFrame(opcode, payload));
  }

  send(text) {
    this._sendFrame(0x1, Buffer.from(String(text), 'utf8'));
  }

  close() {
    if (this.readyState === OPEN || this.readyState === CONNECTING) {
      this._closedByUs = true;
      this.readyState = CLOSING;
      if (this.readyState === CLOSING && this._socket) {
        try { this._socket.write(this._encodeFrame(0x8, Buffer.alloc(0))); this._socket.end(); } catch (_) { /* socket gone */ }
      }
    }
  }

  _onClosed() {
    this.readyState = CLOSED;
    if (this.onclose) this.onclose();
  }

  _fail(error) {
    if (this.onerror) this.onerror(error);
    try { if (this._socket) this._socket.destroy(); } catch (_) { /* already down */ }
    this.readyState = CLOSED;
    if (this.onclose) this.onclose();
  }
}

module.exports = { MiniWebSocket, CONNECTING, OPEN, CLOSING, CLOSED };
