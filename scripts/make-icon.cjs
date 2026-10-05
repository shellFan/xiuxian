#!/usr/bin/env node
/**
 * make-icon.cjs — generates desktop/assets/icon.ico deterministically.
 *
 * No external deps: renders a 256×256 RGBA buffer in code (修仙-style square-hole
 * copper coin on navy), encodes PNG manually, wraps PNG-in-ICO (Vista+ format).
 * Re-run after any design tweak: node scripts/make-icon.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

// ── CRC32 (PNG) ─────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// ── Render 256×256 coin ─────────────────────────────────────────────────────
const px = Buffer.alloc(SIZE * SIZE * 4);
const C = SIZE / 2;
const R_OUT = 108;   // coin outer radius
const R_RIM = 98;    // darker ring radius
const HOLE = 22;     // square hole half-size
function put(x, y, r, g, b, a) {
  const i = (y * SIZE + x) * 4;
  const na = a / 255;
  px[i] = Math.round(px[i] * (1 - na) + r * na);
  px[i + 1] = Math.round(px[i + 1] * (1 - na) + g * na);
  px[i + 2] = Math.round(px[i + 2] * (1 - na) + b * na);
  px[i + 3] = Math.min(255, px[i + 3] + a);
}
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x + 0.5 - C, dy = y + 0.5 - C;
    const d = Math.sqrt(dx * dx + dy * dy);
    // soft anti-aliased circle edge
    const alpha = Math.max(0, Math.min(1, R_OUT + 0.5 - d)) * 255;
    if (alpha <= 0) continue;
    // vertical navy gradient background coin
    const t = y / SIZE;
    let r = Math.round(26 + 10 * t), g = Math.round(26 + 8 * t), b = Math.round(46 + 16 * t);
    put(x, y, r, g, b, alpha);
    // gold annulus
    if (d <= R_RIM) {
      const sheen = 1 - 0.25 * Math.abs(dx / R_OUT) - 0.15 * Math.abs(dy / R_OUT);
      const gr = Math.round(212 * sheen), gg = Math.round(175 * sheen), gb = Math.round(55 * sheen);
      put(x, y, gr, gg, gb, 255);
    }
    // dark inner ring near coin edge
    if (d > R_RIM - 6 && d <= R_RIM) put(x, y, 140, 110, 30, 255);
    // square hole (punched back to navy)
    if (Math.abs(dx) < HOLE && Math.abs(dy) < HOLE) {
      put(x, y, 24, 22, 40, 255);
      // hole rim highlight
      const h = Math.max(Math.abs(dx), Math.abs(dy));
      if (h > HOLE - 2.5) put(x, y, 240, 205, 90, 255);
    }
  }
}
// sparkle on upper-left of the coin
for (let s = 0; s < 4; s++) {
  const cx = 70 + s * 3, cy = 62 + s * 3, len = 9 - s;
  for (let i = -len; i <= len; i++) {
    if (cx + i > 0 && cx + i < SIZE) put(cx + i, cy, 255, 240, 170, s === 0 ? 230 : 140);
    if (cy + i > 0 && cy + i < SIZE) put(cx, cy + i, 255, 240, 170, s === 0 ? 230 : 140);
  }
}

// ── Encode PNG (RGBA, filter 0) ─────────────────────────────────────────────
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
]);

// ── Wrap into ICO (single 256px PNG entry) ──────────────────────────────────
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const entry = Buffer.alloc(16);
entry[0] = 0;  // width 0 = 256
entry[1] = 0;  // height 0 = 256
entry[2] = 0;  // palette
entry[3] = 0;  // reserved
entry.writeUInt16LE(1, 4);  // planes
entry.writeUInt16LE(32, 6); // bpp
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12); // data offset = 6 + 16
const ico = Buffer.concat([header, entry, png]);

const out = path.join(__dirname, '..', 'desktop', 'assets', 'icon.ico');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, ico);
console.log(`[make-icon] wrote ${out} (${ico.length} bytes, 256x256 PNG-in-ICO)`);
