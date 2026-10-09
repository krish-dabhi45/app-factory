#!/usr/bin/env node
// PNG in pure Node (zlib only) for the image tools on Linux and Windows, where the Swift / Core Graphics versions
// cannot run. Pixels are RGBA, 8 bits per channel; colour profiles are ignored (sRGB is assumed).
//   decode(buffer) → {w, h, data}        any PNG colour type and bit depth, non-interlaced
//   encode(img, {opaque})  → buffer      RGBA, or RGB when opaque
//   resize(img, w, h)  crop(img, x, y, w, h)  blank(w, h, rgba)  over(dst, src, x, y)
//   dims(buffer) → {w, h}                PNG, JPEG, GIF or WebP header
//   node png.mjs selftest
import fs from 'node:fs'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }

export function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG file')
  let w, h, depth, type, interlace, plte = null, trns = null; const idat = []
  for (let i = 8; i < buf.length;) {
    const n = buf.readUInt32BE(i), t = buf.toString('latin1', i + 4, i + 8), d = buf.subarray(i + 8, i + 8 + n)
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12] }
    else if (t === 'PLTE') plte = d
    else if (t === 'tRNS') trns = d
    else if (t === 'IDAT') idat.push(d)
    else if (t === 'IEND') break
    i += 12 + n
  }
  if (interlace) throw new Error('interlaced PNG is not supported — save it without interlacing')
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!ch) throw new Error(`PNG colour type ${type} is not supported`)
  const bpp = Math.max(1, (ch * depth) >> 3), stride = Math.ceil((w * ch * depth) / 8)
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      px[o + x] = (raw[src + x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255
    }
  }
  const data = new Uint8Array(w * h * 4), max = (1 << depth) - 1
  const sample = (y, i) => { // the i-th sample of row y, scaled to 0–255 (16-bit: the high byte)
    if (depth === 16) return px[y * stride + i * 2]
    if (depth === 8) return px[y * stride + i]
    const bit = i * depth, v = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & max
    return type === 3 ? v : Math.round((v * 255) / max)
  }
  const key = trns && type !== 3 ? [...Array(type === 2 ? 3 : 1)].map((_, k) => trns.readUInt16BE(k * 2)) : null
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4
    if (type === 3) { const k = sample(y, x); data[o] = plte[k * 3]; data[o + 1] = plte[k * 3 + 1]; data[o + 2] = plte[k * 3 + 2]; data[o + 3] = trns && k < trns.length ? trns[k] : 255; continue }
    const s = [...Array(ch)].map((_, k) => sample(y, x * ch + k))
    const [r, g, b] = ch >= 3 ? s : [s[0], s[0], s[0]]
    data[o] = r; data[o + 1] = g; data[o + 2] = b
    data[o + 3] = ch === 4 ? s[3] : ch === 2 ? s[1] : 255
    if (key) { const raw16 = (k) => (depth === 16 ? px.readUInt16BE(y * stride + (x * ch + k) * 2) : Math.round((s[k] * max) / 255)); if (key.every((v, k) => raw16(k) === v)) data[o + 3] = 0 }
  }
  return { w, h, data, alpha: ch === 2 || ch === 4 || Boolean(trns) }
}

export function encode(img, { opaque = false } = {}) {
  const ch = opaque ? 3 : 4, stride = img.w * ch, raw = Buffer.alloc((stride + 1) * img.h)
  for (let y = 0; y < img.h; y++) {
    raw[y * (stride + 1)] = 1 // Sub filter: smaller than none for photos and flat colours alike
    for (let x = 0; x < img.w; x++) for (let k = 0; k < ch; k++) {
      const v = img.data[(y * img.w + x) * 4 + k], left = x ? img.data[(y * img.w + x - 1) * 4 + k] : 0
      raw[y * (stride + 1) + 1 + x * ch + k] = (v - left) & 255
    }
  }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

export const blank = (w, h, rgba = [0, 0, 0, 0]) => { const data = new Uint8Array(w * h * 4); for (let i = 0; i < data.length; i += 4) data.set(rgba, i); return { w, h, data } }

export function crop(img, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > img.w || y + h > img.h) throw new Error('crop outside the image')
  const out = blank(w, h)
  for (let r = 0; r < h; r++) out.data.set(img.data.subarray(((y + r) * img.w + x) * 4, ((y + r) * img.w + x + w) * 4), r * w * 4)
  return out
}

// Separable resampling on premultiplied colour (no dark fringes at transparent edges): averaging the covered source
// pixels when shrinking, linear interpolation when enlarging.
function weights(src, dst) {
  const s = src / dst, out = []
  for (let i = 0; i < dst; i++) {
    const ws = []
    if (s >= 1) { const a = i * s, b = a + s; for (let j = Math.floor(a); j < Math.ceil(b); j++) ws.push([Math.min(j, src - 1), Math.min(j + 1, b) - Math.max(j, a)]) }
    else { const c = Math.min(Math.max((i + 0.5) * s - 0.5, 0), src - 1), j = Math.floor(c), f = c - j; ws.push([j, 1 - f]); if (f > 0) ws.push([Math.min(j + 1, src - 1), f]) }
    const t = ws.reduce((a, [, v]) => a + v, 0); out.push(ws.map(([j, v]) => [j, v / t]))
  }
  return out
}
export function resize(img, w, h) {
  if (w === img.w && h === img.h) return { w, h, data: img.data.slice() }
  const pm = new Float32Array(img.w * img.h * 4)
  for (let i = 0; i < pm.length; i += 4) { const a = img.data[i + 3] / 255; pm[i] = img.data[i] * a; pm[i + 1] = img.data[i + 1] * a; pm[i + 2] = img.data[i + 2] * a; pm[i + 3] = img.data[i + 3] }
  const wx = weights(img.w, w), wy = weights(img.h, h), mid = new Float32Array(w * img.h * 4)
  for (let y = 0; y < img.h; y++) for (let x = 0; x < w; x++) for (const [j, v] of wx[x]) for (let k = 0; k < 4; k++) mid[(y * w + x) * 4 + k] += pm[(y * img.w + j) * 4 + k] * v
  const out = blank(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = [0, 0, 0, 0]
    for (const [j, v] of wy[y]) for (let k = 0; k < 4; k++) p[k] += mid[(j * w + x) * 4 + k] * v
    const o = (y * w + x) * 4, a = p[3]
    out.data[o + 3] = Math.round(a)
    for (let k = 0; k < 3; k++) out.data[o + k] = a > 0 ? Math.min(255, Math.round((p[k] * 255) / a)) : 0
  }
  return out
}

// src drawn over dst with its top-left at (x, y); parts outside dst are dropped.
export function over(dst, src, x, y) {
  for (let r = 0; r < src.h; r++) {
    const dy = y + r; if (dy < 0 || dy >= dst.h) continue
    for (let c = 0; c < src.w; c++) {
      const dx = x + c; if (dx < 0 || dx >= dst.w) continue
      const s = (r * src.w + c) * 4, d = (dy * dst.w + dx) * 4, sa = src.data[s + 3] / 255, da = dst.data[d + 3] / 255, oa = sa + da * (1 - sa)
      for (let k = 0; k < 3; k++) dst.data[d + k] = oa > 0 ? Math.round((src.data[s + k] * sa + dst.data[d + k] * da * (1 - sa)) / oa) : 0
      dst.data[d + 3] = Math.round(oa * 255)
    }
  }
  return dst
}

// Width and height from the file header: PNG, JPEG, GIF, WebP (VP8, VP8L, VP8X).
export function dims(b) {
  if (b.subarray(0, 8).equals(SIG)) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  if (b.toString('latin1', 0, 4) === 'GIF8') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const t = b.toString('latin1', 12, 16)
    if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 } }
    if (t === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1]
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
      i += 2 + b.readUInt16BE(i + 2)
    }
  }
  throw new Error('unknown image format (PNG, JPEG, GIF or WebP)')
}

function selftest() {
  // round trip, both channel layouts
  const img = blank(5, 3, [10, 20, 30, 255]); img.data.set([200, 100, 50, 128], 4 * 4)
  assert.deepEqual(decode(encode(img)).data, img.data)
  const op = decode(encode(img, { opaque: true })); assert.equal(op.alpha, false); assert.deepEqual([...op.data.subarray(0, 4)], [10, 20, 30, 255])
  // a palette PNG with tRNS, 4-bit: built by hand
  const plte = Buffer.from([255, 0, 0, 0, 0, 255]), trns = Buffer.from([0])
  const row = Buffer.from([0, 0x01]) // filter 0, pixels: index 0, index 1
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 4; ihdr[9] = 3
  const pal = decode(Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', zlib.deflateSync(row)), chunk('IEND', Buffer.alloc(0))]))
  assert.deepEqual([...pal.data], [255, 0, 0, 0, 0, 0, 255, 255])
  // resize: a 4×4 checker of black and white shrinks to grey; a flat colour stays exact; enlarging keeps the corners
  const ck = blank(4, 4, [0, 0, 0, 255]); for (let i = 0; i < 16; i++) if ((i + (i >> 2)) % 2) ck.data.set([255, 255, 255, 255], i * 4)
  assert.ok(Math.abs(resize(ck, 1, 1).data[0] - 128) <= 1)
  assert.deepEqual([...resize(blank(10, 10, [12, 34, 56, 255]), 3, 7).data.subarray(0, 4)], [12, 34, 56, 255])
  const up = resize(ck, 8, 8); assert.equal(up.data[0], 0); assert.equal(up.w * up.h, 64)
  // a transparent half does not darken the opaque half's colour
  const half = blank(2, 1, [0, 0, 0, 0]); half.data.set([255, 0, 0, 255], 4)
  assert.deepEqual([...resize(half, 1, 1).data], [255, 0, 0, 128])
  // crop, over, dims
  assert.deepEqual([...crop(img, 4, 0, 1, 1).data], [200, 100, 50, 128])
  assert.throws(() => crop(img, 4, 0, 2, 1), /outside/)
  const bg = over(blank(2, 1, [0, 0, 255, 255]), blank(1, 1, [255, 0, 0, 128]), 1, 0)
  assert.deepEqual([...bg.data.subarray(4)], [128, 0, 127, 255])
  assert.deepEqual(dims(encode(blank(7, 9))), { w: 7, h: 9 })
  assert.deepEqual(dims(Buffer.from('47494638396107000900', 'hex')), { w: 7, h: 9 })
  const jpg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0001108000900070300', 'hex')
  assert.deepEqual(dims(Buffer.concat([jpg, Buffer.alloc(16)])), { w: 7, h: 9 })
  const vp8x = Buffer.alloc(30); vp8x.write('RIFF', 0, 'latin1'); vp8x.write('WEBPVP8X', 8, 'latin1'); vp8x.writeUIntLE(6, 24, 3); vp8x.writeUIntLE(8, 27, 3)
  assert.deepEqual(dims(vp8x), { w: 7, h: 9 })
  return 'selftest ok'
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'selftest') console.log(selftest())
