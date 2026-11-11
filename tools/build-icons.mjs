#!/usr/bin/env node
/*
 * Renders the extension icons (icons/icon16/32/48/128.png) from the logo,
 * sample/icon.png: the 128 px neon "P" that is also the Chrome Web Store icon.
 * No dependencies: a small PNG decoder, an area-averaging resampler and a
 * PNG encoder.
 *
 * - 128 px is the logo, pixel for pixel.
 * - 48 and 32 px are the whole logo, averaged in linear light. Averaging the
 *   sRGB values instead dims the thin neon strokes into the dark background.
 * - 16 px is cropped to the artwork, so the "P" fills the toolbar slot, and
 *   brightened. Scaled whole, it comes out as a dim pink smudge.
 *
 * Change the logo in sample/icon.png, then run `npm run icons`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(here, '..');
const source = path.join(rootDir, 'sample', 'icon.png');
const outDir = path.join(rootDir, 'icons');
fs.mkdirSync(outDir, { recursive: true });

/* Each size: the region of the logo it shows ([x0, y0, x1, y1] in source
 * pixels) and a brightness gain applied in linear light. The 16 px crop is the
 * artwork's bounds (about 17..110 by 16..108 in the 128 px logo) plus a margin. */
const SIZES = [
  { size: 128, region: 'all', gain: 1 },
  { size: 48, region: 'all', gain: 1 },
  { size: 32, region: 'all', gain: 1 },
  { size: 16, region: [10, 9, 118, 117], gain: 1.8 },
];

/* ---- PNG decoding: 8-bit RGB or RGBA, not interlaced ---- */
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error('not a PNG');
  let p = 8, w, h, depth, type, interlace;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 2 && type !== 6)) throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${type}, interlace ${interlace}); save the logo as 8-bit RGB or RGBA`);
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = cur[x * bpp]; px[o + 1] = cur[x * bpp + 1]; px[o + 2] = cur[x * bpp + 2]; px[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev.set(cur);
  }
  return { w, h, px };
}

/* ---- resampling: area average in linear light, alpha-weighted ---- */
const toLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => { v = Math.min(1, Math.max(0, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); };

function resample(img, [x0, y0, x1, y1], n, gain) {
  const out = new Uint8Array(n * n * 4), sx = (x1 - x0) / n, sy = (y1 - y0) / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const ax = x0 + i * sx, bx = ax + sx, ay = y0 + j * sy, by = ay + sy;
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let y = Math.floor(ay); y < Math.ceil(by); y++) {
      const wy = Math.min(by, y + 1) - Math.max(ay, y);
      if (wy <= 0 || y < 0 || y >= img.h) continue;
      for (let x = Math.floor(ax); x < Math.ceil(bx); x++) {
        const wx = Math.min(bx, x + 1) - Math.max(ax, x);
        if (wx <= 0 || x < 0 || x >= img.w) continue;
        const o = (y * img.w + x) * 4, k = wx * wy, al = img.px[o + 3] / 255;
        r += toLinear(img.px[o]) * al * k; g += toLinear(img.px[o + 1]) * al * k; b += toLinear(img.px[o + 2]) * al * k;
        a += al * k; area += k;
      }
    }
    const o = (j * n + i) * 4;
    if (a > 0) { out[o] = toSrgb((r / a) * gain); out[o + 1] = toSrgb((g / a) * gain); out[o + 2] = toSrgb((b / a) * gain); }
    out[o + 3] = Math.round((a / area) * 255);
  }
  return out;
}

/* ---- PNG encoding ---- */
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

const logo = decodePng(fs.readFileSync(source));
if (logo.w !== logo.h) throw new Error(`the logo must be square, got ${logo.w}x${logo.h}`);
for (const { size, region, gain } of SIZES) {
  const box = region === 'all' ? [0, 0, logo.w, logo.h] : region.map((v) => (v * logo.w) / 128);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png(size, resample(logo, box, size, gain)));
}
console.log('icons written to', path.relative(process.cwd(), outDir), 'from', path.relative(process.cwd(), source));
