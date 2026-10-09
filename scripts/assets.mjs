#!/usr/bin/env node
// Compresses the imported design's images once, at the end of the design import — before any code uses them.
// Every raster becomes lossless WebP (identical pixels). It is also scaled down, but only to what the sharpest
// screen can show at the largest size the design draws it (sizes read from screens/*.context.md and the page
// metadata). Any image whose drawn size cannot be worked out is not scaled. Originals are kept in design/originals/.
//
//   node assets.mjs <design dir> [--dpr 3|4] [--max-width 440] [--no-resize]
//   node assets.mjs selftest
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { dims as headerDims } from './png.mjs'

const run = promisify(execFile)
const RASTER = /\.(png|jpe?g|gif)$/i

// ── Sizes from the design code ──────────────────────────────────────────

// Node id → {w, h} from every page metadata XML.
export function nodeSizes(xml) {
  const out = {}
  for (const m of xml.matchAll(/<[\w-]+\s[^>]*?\bid="([^"]+)"[^>]*>/g)) {
    const w = m[0].match(/\bwidth="([\d.]+)"/), h = m[0].match(/\bheight="([\d.]+)"/)
    if (w && h) out[m[1]] = { w: +w[1], h: +h[1] }
  }
  return out
}

// One side of a box from its Tailwind classes ('w' or 'h'), relative to the parent side. null = unknown.
function side(cls, k, parent) {
  const c = ` ${cls} `
  const m = c.match(new RegExp(`\\s${k}-\\[(-?[\\d.]+)(px|%)\\]\\s`)) || c.match(/\ssize-\[([\d.]+)(px)\]\s/)
  if (m) return m[2] === 'px' ? +m[1] : parent == null ? null : (parent * +m[1]) / 100
  const n = c.match(new RegExp(`\\s(?:${k}|size)-(\\d+(?:\\.\\d+)?)\\s`)) // Tailwind scale: 4 px a step
  if (n) return +n[1] * 4
  const full = k === 'w' ? /\s(size-full|w-full|inset-0|inset-x-0)\s/ : /\s(size-full|h-full|inset-0|inset-y-0)\s/
  return full.test(c) ? parent : null
}

// Every <img> placement in one screen's design code: {file, w, h, fit, screenW}.
export function placements(code, sizes) {
  const files = {}
  for (const m of code.matchAll(/const (\w+) = `\$\{assetPathPrefix\}\/([^`]+)`/g)) files[m[1]] = m[2]
  const main = code.indexOf('export default function')
  const out = []
  let stack = [], screenW = null, inMain = false
  const tag = /<(\/?)([A-Za-z][\w.]*)((?:[^>"{]|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g
  for (const m of code.matchAll(tag)) {
    if (!inMain && main >= 0 && m.index > main) { inMain = true; stack = [] }
    const [, close, , attrs] = m
    if (close) { stack.pop(); continue }
    const parent = stack.at(-1) || { w: null, h: null }
    const cls = (attrs.match(/className="([^"]*)"/) || [, ''])[1]
    const id = (attrs.match(/data-node-id="([^"]+)"/) || [])[1]
    const box = id && sizes[id] ? sizes[id] : { w: side(cls, 'w', parent.w), h: side(cls, 'h', parent.h) }
    if (inMain && screenW == null && id && sizes[id]) screenW = sizes[id].w
    const src = attrs.match(/src=\{(\w+)\}/)
    if (src && files[src[1]]) {
      const fit = /\sobject-contain\s/.test(` ${cls} `) ? 'contain' : 'cover' // object-cover and a stretched fill need the same
      out.push({ file: files[src[1]], w: box.w, h: box.h, fit, screenW })
    }
    if (!attrs.trimEnd().endsWith('/')) stack.push(box)
  }
  return out
}

// The fraction of the image's pixels that the sharpest screen can show (1 = keep all). Any unknown use → 1.
export function keepScale(uses, iw, ih, dpr, maxWidth) {
  if (!uses.length) return 1
  let s = 0
  for (const u of uses) {
    if (u.w == null || u.h == null || !(u.w > 0) || !(u.h > 0)) return 1
    const grow = Math.max(1, maxWidth / (u.screenW || 320)) // drawn wider on a wider phone
    const f = u.fit === 'contain' ? Math.min(u.w / iw, u.h / ih) : Math.max(u.w / iw, u.h / ih)
    s = Math.max(s, f * dpr * grow)
  }
  return Math.min(1, s)
}

// ── Encoding ────────────────────────────────────────────────────────────

// From the file header (PNG, JPEG, GIF, WebP) — no system tool, so it works on every OS.
async function dims(f) { const d = headerDims(fs.readFileSync(f)); return [d.w, d.h] }

// Total frame time of a GIF (ms), from its graphic control extensions.
function gifMs(buf) {
  let t = 0
  for (let i = buf.indexOf(Buffer.from([0x21, 0xf9, 0x04])); i >= 0; i = buf.indexOf(Buffer.from([0x21, 0xf9, 0x04]), i + 1))
    t += buf.readUInt16LE(i + 4) * 10
  return t
}

async function webpMs(f) {
  const { stdout } = await run('webpmux', ['-info', f])
  return stdout.split('\n').filter((l) => /^\s*\d+:/.test(l)).reduce((t, l) => t + +l.trim().split(/\s+/)[6], 0)
}

// Figma names some GIFs .png — go by the file's header, not its name.
const isGif = (f) => fs.readFileSync(f).subarray(0, 4).toString('latin1') === 'GIF8'

async function convert(src, out, width) {
  if (isGif(src)) {
    await run('gif2webp', ['-mt', '-min_size', src, '-o', out]) // lossless by default
    const [a, b] = [gifMs(fs.readFileSync(src)), await webpMs(out)]
    return a === b ? `lossless animation, ${b} ms kept` : null
  }
  const args = ['-lossless', '-exact', '-z', '9', '-mt', '-print_psnr', ...(width ? ['-resize', String(width), '0'] : []), src, '-o', out]
  const { stderr, stdout } = await run('cwebp', args, { maxBuffer: 1 << 24 })
  const psnr = `${stdout}${stderr}`.match(/Total:\s*([\d.]+)/)
  return psnr && +psnr[1] >= 99 ? 'lossless, PSNR 99 (identical)' : null
}

async function pool(items, n, fn) {
  const res = []
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k]) } }))
  return res
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(dir, opts) {
  // libwebp's tools: macOS `brew install webp`; Debian/Ubuntu `apt install webp`; Windows: Google's libwebp binaries on PATH
  for (const t of ['cwebp', 'gif2webp', 'webpmux'])
    if (spawnSync(t, ['-version'], { stdio: 'ignore' }).error) { console.error(`missing ${t} — install libwebp: brew install webp (macOS), apt install webp (Debian/Ubuntu), or Google's libwebp binaries on PATH (Windows)`); process.exit(2) }
  const assets = path.join(dir, 'assets'), originals = path.join(dir, 'originals')
  const sizes = {}
  for (const f of fs.readdirSync(path.join(dir, 'pages')).filter((f) => f.endsWith('.xml')))
    Object.assign(sizes, nodeSizes(fs.readFileSync(path.join(dir, 'pages', f), 'utf8')))
  const uses = {}
  for (const f of fs.readdirSync(path.join(dir, 'screens')).filter((f) => f.endsWith('.context.md')))
    for (const p of placements(fs.readFileSync(path.join(dir, 'screens', f), 'utf8'), sizes)) (uses[p.file] ||= []).push(p)

  const todo = fs.readdirSync(assets).filter((f) => RASTER.test(f) && !fs.existsSync(path.join(originals, f)))
  fs.mkdirSync(originals, { recursive: true })
  const rows = await pool(todo, os.cpus().length, async (f) => {
    const src = path.join(assets, f), name = f.replace(RASTER, '.webp'), out = path.join(assets, name)
    if (fs.existsSync(out)) return { f, note: `kept: ${name} already exists` }
    const before = fs.statSync(src).size
    const [iw, ih] = await dims(src)
    const s = opts.resize && !isGif(src) ? keepScale(uses[f] || [], iw, ih, opts.dpr, opts.maxWidth) : 1
    const width = s < 0.9 ? Math.ceil(iw * s) : 0
    const check = await convert(src, out, width).catch((e) => null)
    const after = fs.existsSync(out) ? fs.statSync(out).size : Infinity
    if (!check || after >= before) {
      fs.rmSync(out, { force: true })
      return { f, before, after: before, px: `${iw}×${ih}`, note: check ? 'kept: WebP not smaller' : 'kept: check failed' }
    }
    fs.renameSync(src, path.join(originals, f))
    return { f, name, before, after, px: `${iw}×${ih}${width ? ` → ${width}×${Math.round((ih * width) / iw)}` : ''}`, note: check, uses: (uses[f] || []).length }
  })

  // Point every design file at the new names.
  const renamed = rows.filter((r) => r.name)
  const texts = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (!['assets', 'originals', 'reference'].includes(e.name)) walk(p) }
    else if (/\.(md|json|xml|txt)$/.test(e.name)) texts.push(p)
  } }
  walk(dir)
  for (const p of texts) {
    let t = fs.readFileSync(p, 'utf8'), t0 = t
    for (const r of renamed) t = t.replace(new RegExp(`(?<![\\w-])${r.f.replace(/\./g, '\\.')}(?![\\w])`, 'g'), r.name)
    if (t !== t0) fs.writeFileSync(p, t)
  }

  const kb = (b) => (b / 1024).toFixed(0)
  const tb = rows.reduce((t, r) => t + (r.before || 0), 0), ta = rows.reduce((t, r) => t + (r.after || 0), 0)
  const prev = fs.existsSync(path.join(dir, 'COMPRESSION.md')) ? fs.readFileSync(path.join(dir, 'COMPRESSION.md'), 'utf8') + '\n' : ''
  fs.writeFileSync(path.join(dir, 'COMPRESSION.md'), `${prev}# Image compression — ${new Date().toISOString()}

Settings: ${opts.resize ? `scaled to the design's largest drawn size × ${opts.dpr}× density, × (${opts.maxWidth} pt ÷ frame width)` : 'no scaling (tablets in scope)'}; lossless WebP; originals in design/originals/.
Total: ${kb(tb)} KB → ${kb(ta)} KB.

| File | Pixels | Placements read | KB before → after | Check |
|---|---|---|---|---|
${rows.map((r) => `| ${r.f}${r.name ? ` → ${r.name}` : ''} | ${r.px || ''} | ${r.uses ?? ''} | ${kb(r.before || 0)} → ${kb(r.after || 0)} | ${r.note} |`).join('\n')}
`)
  console.log(`compressed ${renamed.length}/${rows.length} image(s): ${kb(tb)} KB → ${kb(ta)} KB (design/COMPRESSION.md)`)
  if (rows.some((r) => r.note === 'kept: check failed')) console.log('some images failed their check and were kept as they were — listed in COMPRESSION.md')
}

function selftest() {
  const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error(`FAIL ${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); process.exit(1) } }
  const sizes = nodeSizes('<frame id="1:769" name="Turkey" x="0" y="0" width="375" height="812">')
  eq(sizes, { '1:769': { w: 375, h: 812 } }, 'xml')
  const code = 'const assetPathPrefix = "x";\nconst imgA = `${assetPathPrefix}/a.png`;\nconst imgG = `${assetPathPrefix}/g.gif`;\nexport default function T() {\n  return (\n'
    + '<div className="relative size-full" data-node-id="1:769">'
    + '<div className="absolute h-[77px] left-1/2 w-[335px]" data-node-id="1:775">'
    + '<div aria-hidden className="absolute inset-0"><div className="absolute inset-0 overflow-hidden">'
    + '<img alt="" className="absolute h-[343.89%] left-0 max-w-none top-[-178.59%] w-full" src={imgA} />'
    + '</div></div>'
    + '<div className="absolute h-[77px] w-[99.284px]" data-node-id="1:776"><img alt="" className="absolute inset-0 object-cover size-full" src={imgA} /></div>'
    + '<div className="flex-[1_0_0]"><img alt="" className="absolute inset-0 size-full" src={imgG} /></div>'
    + '</div></div>);\n}'
  const p = placements(code, sizes)
  const r = (v) => (v == null ? null : Math.round(v))
  eq(p.map((x) => [x.file, r(x.w), r(x.h), x.screenW]), [['a.png', 335, 265, 375], ['a.png', 99, 77, 375], ['g.gif', null, null, 375]], 'placements')
  // 3450×2727 photo: card background 335×264.8 stretched, thumbnail 99×77 cover; iOS 3×, 440 pt phones
  const s = keepScale(p.filter((x) => x.file === 'a.png'), 3450, 2727, 3, 440)
  eq(Math.ceil(3450 * s), Math.ceil(3450 * Math.max(335 / 3450, (77 * 3.4389) / 2727) * 3 * (440 / 375)), 'scale')
  eq(keepScale(p.filter((x) => x.file === 'g.gif'), 720, 1080, 3, 440), 1, 'unknown size is never scaled')
  eq(keepScale([], 100, 100, 3, 440), 1, 'unused image is never scaled')
  eq(keepScale([{ w: 11572, h: 53637, fit: 'cover', screenW: 375 }], 720, 1080, 3, 440), 1, 'a crop drawn larger than the file is never scaled')
  console.log('selftest ok')
}

const [a0, ...rest] = process.argv.slice(2)
if (a0 === 'selftest') selftest()
else if (a0) {
  const opt = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? +rest[i + 1] : d }
  await main(a0, { dpr: opt('--dpr', 3), maxWidth: opt('--max-width', 440), resize: !rest.includes('--no-resize') })
} else { console.error('usage: assets.mjs <design dir> [--dpr 3|4] [--max-width 440] [--no-resize] | selftest'); process.exit(2) }
