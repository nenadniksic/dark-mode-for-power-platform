#!/usr/bin/env node
/*
 * Renders the extension icons (16/32/48/128 px PNG) with no dependencies:
 * a rounded purple tile with a crescent moon, supersampled for smooth edges.
 * Also writes icons/icon.svg as the vector source of truth.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

/* ---- geometry in a 100x100 design space ---- */
const TILE_RADIUS = 22;
const TILE_TOP = [0x93, 0x34, 0x93];      // Power Apps purple (brand 80)
const TILE_BOTTOM = [0x58, 0x0d, 0x58];   // brand 30
const MOON = [0xff, 0xff, 0xff];
const MOON_C = { x: 52, y: 50, r: 27 };   // the moon disc
const BITE = { x: 64, y: 42, r: 23 };     // the circle cut out of it

function insideRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r), cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
const inCircle = (x, y, c) => (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r;

function render(size) {
  const ss = 4; // supersampling factor
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const ux = ((x + (sx + 0.5) / ss) / size) * 100, uy = ((y + (sy + 0.5) / ss) / size) * 100;
      if (!insideRoundedRect(ux, uy, 100, 100, TILE_RADIUS)) continue;
      const t = uy / 100;
      let cr = TILE_TOP[0] + (TILE_BOTTOM[0] - TILE_TOP[0]) * t, cg = TILE_TOP[1] + (TILE_BOTTOM[1] - TILE_TOP[1]) * t, cb = TILE_TOP[2] + (TILE_BOTTOM[2] - TILE_TOP[2]) * t;
      if (inCircle(ux, uy, MOON_C) && !inCircle(ux, uy, BITE)) { cr = MOON[0]; cg = MOON[1]; cb = MOON[2]; }
      r += cr; g += cg; b += cb; a += 255;
    }
    const n = ss * ss, i = (y * size + x) * 4;
    const cov = a / n / 255;
    if (cov > 0) { px[i] = Math.round(r / (a / 255)); px[i + 1] = Math.round(g / (a / 255)); px[i + 2] = Math.round(b / (a / 255)); px[i + 3] = Math.round(cov * 255); }
  }
  return px;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png(size, render(size)));
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="128" height="128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#933493"/><stop offset="1" stop-color="#580d58"/></linearGradient>
  <mask id="m"><rect width="100" height="100" fill="#fff"/><circle cx="${BITE.x}" cy="${BITE.y}" r="${BITE.r}" fill="#000"/></mask></defs>
  <rect width="100" height="100" rx="${TILE_RADIUS}" fill="url(#g)"/>
  <circle cx="${MOON_C.x}" cy="${MOON_C.y}" r="${MOON_C.r}" fill="#fff" mask="url(#m)"/>
</svg>
`;
fs.writeFileSync(path.join(outDir, 'icon.svg'), svg);
console.log('icons written to', path.relative(process.cwd(), outDir));
