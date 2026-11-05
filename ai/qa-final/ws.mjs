// ai/qa-final/ws.mjs — minimal RFC6455 WebSocket client (no deps, Node 20).
// Client frames are masked; server frames handled (text/close/ping/pong/fragments).
import net from 'node:net';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WsClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.handlers = [];
    this.onmessage = null;
    this.onclose = null;
    this.open = true;
    socket.on('data', (chunk) => this._feed(chunk));
    socket.on('error', (e) => { this.open = false; });
    socket.on('close', () => { this.open = false; if (this.onclose) this.onclose(); });
  }

  static connect(url, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const key = crypto.randomBytes(16).toString('base64');
      const socket = net.connect(parseInt(u.port, 10), u.hostname, () => {
        const req =
          `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
          `Host: ${u.host}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n\r\n`;
        socket.write(req);
      });
      socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new Error('ws connect timeout')); });
      let head = Buffer.alloc(0);
      const expectedAccept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      const onHandshake = (chunk) => {
        head = Buffer.concat([head, chunk]);
        const idx = head.indexOf('\r\n\r\n');
        if (idx < 0) return;
        const header = head.slice(0, idx).toString('utf8');
        socket.removeListener('data', onHandshake);
        if (!/HTTP\/1\.1 101/i.test(header)) { socket.destroy(); reject(new Error('ws handshake rejected: ' + header.split('\r\n')[0])); return; }
        if (!header.includes(expectedAccept)) { socket.destroy(); reject(new Error('ws accept key mismatch')); return; }
        socket.setTimeout(0);
        const client = new WsClient(socket);
        const rest = head.slice(idx + 4);
        if (rest.length) client._feed(rest);
        resolve(client);
      };
      socket.on('data', onHandshake);
      socket.on('error', (e) => { if (!socket.writableFinished && head.length === 0) reject(e); });
    });
  }

  _feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const frame = this._readFrame();
      if (!frame) break;
      const { opcode, payload, fin } = frame;
      if (opcode === 0x8) { this.open = false; try { this.socket.end(); } catch {} if (this.onclose) this.onclose(); return; }
      if (opcode === 0x9) { this._sendFrame(0xA, payload); continue; }
      if (opcode === 0xA) continue;
      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        if (fin && !this._fragments && opcode !== 0x0) { this._emit(payload.toString('utf8')); continue; }
        this._fragments = this._fragments || [];
        if (opcode !== 0x0) this._fragOpcode = opcode;
        this._fragments.push(payload);
        if (fin) { const full = Buffer.concat(this._fragments).toString('utf8'); this._fragments = null; this._emit(full); }
      }
    }
  }

  _emit(text) {
    for (const h of this.handlers) h(text);
    if (this.onmessage) this.onmessage(text);
  }

  _readFrame() {
    const b = this.buffer;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 64 * 1024 * 1024) { this.open = false; throw new Error('frame too large: ' + len); }
    const maskLen = masked ? 4 : 0;
    if (b.length < off + maskLen + len) return null;
    let payload = b.slice(off + maskLen, off + maskLen + len);
    if (masked) {
      const mask = b.slice(off, off + 4);
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
      payload = out;
    }
    this.buffer = b.slice(off + maskLen + len);
    return { fin, opcode, payload };
  }

  send(text) {
    if (!this.open) throw new Error('socket closed');
    this._sendFrame(0x1, Buffer.from(text, 'utf8'));
  }

  _sendFrame(opcode, payload) {
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
    else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    header[0] = 0x80 | opcode;
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  close() { this.open = false; try { this._sendFrame(0x8, Buffer.alloc(0)); } catch {} try { this.socket.end(); } catch {} }
}
