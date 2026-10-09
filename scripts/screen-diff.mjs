#!/usr/bin/env node
// Compares an app screenshot with its design reference (algorithm and outputs: see screen-diff.swift's header).
//   node screen-diff.mjs <reference.png> <app.png> <out dir> [--mask x,y,w,h ...]
//   node screen-diff.mjs selftest
// macOS: screen-diff.swift compiled once with optimisation into ~/.app-factory/bin (Core Graphics, colour-managed).
// Linux and Windows: the same algorithm in Node on png.mjs (PNG files, sRGB assumed). APP_FACTORY_IMAGES=node forces it.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, 'screen-diff.swift')
const useSwift = () => process.platform === 'darwin' && process.env.APP_FACTORY_IMAGES !== 'node'
export function binary() {
  const h = crypto.createHash('md5').update(fs.readFileSync(SRC)).digest('hex').slice(0, 12)
  const bin = path.join(process.env.APP_FACTORY_HOME || path.join(os.homedir(), '.app-factory'), 'bin', `screen-diff-${h}`)
  if (!fs.existsSync(bin)) { fs.mkdirSync(path.dirname(bin), { recursive: true }); execFileSync('swiftc', ['-O', SRC, '-o', bin], { stdio: ['ignore', 'ignore', 'inherit'] }) }
  return bin
}
export function diff(ref, app, out, masks = []) {
  if (!useSwift()) return diffNode(ref, app, out, masks)
  const r = spawnSync(binary(), [ref, app, out, ...(masks.length ? ['--mask', ...masks] : [])], { encoding: 'utf8' })
  if (r.status === 1) throw new Error(r.stderr.trim())
  return JSON.parse(r.stdout)
}

// screen-diff.swift, line for line: compare at the lower resolution on white, 3-point cells, a cell differs when more
// than 15 % of its pixels differ by more than 40 in any channel, 8-connected cells form a region.
export function diffNode(refPath, appPath, out, maskArgs = []) {
  const app = png.decode(fs.readFileSync(appPath)), ref = png.decode(fs.readFileSync(refPath))
  const W = app.w, H = app.h, scale = W / ref.w, ptScale = W >= 1000 ? 3 : 2
  const refAspect = ref.h / ref.w, appAspect = H / W
  if (Math.abs(refAspect - appAspect) / appAspect > 0.01) return { error: `sizes differ: reference ${ref.w}×${ref.h} px, app ${W}×${H} px — run the app on a device with the design frame's size (pipeline.mjs design-device)` }
  fs.mkdirSync(out, { recursive: true })
  const masks = maskArgs.map((m) => m.split(',').map(Number)).filter((v) => v.length === 4 && v.every((x) => !Number.isNaN(x)))
  const pointsW = W / ptScale, CW = Math.min(W, ref.w), CH = Math.round(CW * appAspect), cs = CW / pointsW
  const onWhite = (im) => { const r = png.resize(im, CW, CH), d = r.data; for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; for (let k = 0; k < 3; k++) d[i + k] = Math.round((d[i + k] * a + 255 * (255 - a)) / 255) } return d }
  const A = onWhite(app), R = onWhite(ref)
  const cell = Math.max(2, Math.round(3 * cs)), cols = Math.ceil(CW / cell), rows = Math.ceil(CH / cell)
  const differs = new Uint8Array(cols * rows)
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const x0 = cx * cell, y0 = cy * cell, x1 = Math.min(CW, x0 + cell), y1 = Math.min(CH, y0 + cell)
    const rx = x0 / cs, ry = y0 / cs, rw = (x1 - x0) / cs, rh = (y1 - y0) / cs
    if (masks.some(([mx, my, mw, mh]) => mx < rx + rw && rx < mx + mw && my < ry + rh && ry < my + mh)) continue
    let n = 0, bad = 0
    for (let y = y0; y < y1; y++) for (let x = x0, i = (y * CW + x0) * 4; x < x1; x++, i += 4) {
      if (Math.max(Math.abs(A[i] - R[i]), Math.abs(A[i + 1] - R[i + 1]), Math.abs(A[i + 2] - R[i + 2])) > 40) bad++
      n++
    }
    if (bad * 100 > n * 15) differs[cy * cols + cx] = 1
  }
  const seen = new Uint8Array(cols * rows), regions = [], k = W / CW
  for (let s0 = 0; s0 < cols * rows; s0++) {
    if (!differs[s0] || seen[s0]) continue
    const stack = [s0]; seen[s0] = 1; let minx = cols, miny = rows, maxx = 0, maxy = 0, count = 0
    while (stack.length) {
      const c = stack.pop(), cx = c % cols, cy = (c / cols) | 0; count++
      minx = Math.min(minx, cx); maxx = Math.max(maxx, cx); miny = Math.min(miny, cy); maxy = Math.max(maxy, cy)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const q = ny * cols + nx; if (differs[q] && !seen[q]) { seen[q] = 1; stack.push(q) }
      }
    }
    regions.push({ x: minx * cell * k, y: miny * cell * k, w: (maxx - minx + 1) * cell * k, h: (maxy - miny + 1) * cell * k, count })
  }
  regions.sort((p, q) => (p.y === q.y ? p.x - q.x : p.y - q.y))
  // diff.png: the app with every region boxed in red
  const d = { w: W, h: H, data: app.data.slice() }, lw = Math.max(1, Math.round(ptScale * 1.5))
  const fill = (x0, y0, w, h) => png.over(d, png.blank(Math.max(0, Math.round(w)), Math.max(0, Math.round(h)), [255, 0, 0, 255]), Math.round(x0), Math.round(y0))
  for (const r of regions) { fill(r.x - lw / 2, r.y - lw / 2, r.w + lw, lw); fill(r.x - lw / 2, r.y + r.h - lw / 2, r.w + lw, lw); fill(r.x - lw / 2, r.y - lw / 2, lw, r.h + lw); fill(r.x + r.w - lw / 2, r.y - lw / 2, lw, r.h + lw) }
  fs.writeFileSync(path.join(out, 'diff.png'), png.encode(d))
  // per region: reference crop | app crop, 6 points of context
  const refScaled = png.resize(ref, W, H), json = []
  regions.forEach((r, n) => {
    const pad = 6 * ptScale, gap = Math.round(4 * ptScale)
    const x0 = Math.max(0, Math.floor(r.x - pad)), y0 = Math.max(0, Math.floor(r.y - pad)), x1 = Math.min(W, Math.ceil(r.x + r.w + pad)), y1 = Math.min(H, Math.ceil(r.y + r.h + pad))
    const cw = x1 - x0, ch = y1 - y0, side = png.blank(cw * 2 + gap, ch, [255, 0, 255, 255])
    png.over(side, png.crop(refScaled, x0, y0, cw, ch), 0, 0); png.over(side, png.crop(app, x0, y0, cw, ch), cw + gap, 0)
    const image = path.join(out, `region-${n + 1}.png`); fs.writeFileSync(image, png.encode(side))
    json.push({ n: n + 1, x: r.x / ptScale, y: r.y / ptScale, w: r.w / ptScale, h: r.h / ptScale, cells: r.count, image })
  })
  const total = cols * rows, nd = differs.reduce((a, v) => a + v, 0)
  const res = { reference: refPath, app: appPath, appPx: `${W}x${H}`, points: `${Math.trunc(W / ptScale)}x${Math.trunc(H / ptScale)}`, referenceScale: scale,
    differentPercent: Math.floor((nd * 1000) / Math.max(1, total)) / 10, regions: json, diff: path.join(out, 'diff.png'), masks: masks.map((m) => m.join(',')) }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(res, null, 2))
  return res
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdiff-'))
  // phone screens of 375×812 pt at @3x (1125×2436 px), white, one element (a dark square with a light inner square)
  const screen = (side, dx = 0, w = 1125, h = 2436) => {
    const im = png.blank(w, h, [255, 255, 255, 255]), s = Math.round(side * w), x = Math.round((w - s) / 2) + dx, y = Math.round((h - s) / 2)
    png.over(im, png.blank(s, s, [20, 40, 120, 255]), x, y); const t = Math.round(s / 3); png.over(im, png.blank(t, t, [240, 220, 120, 255]), x + t, y + t)
    return im
  }
  const put = (name, im) => { fs.writeFileSync(path.join(tmp, name), png.encode(im)); return path.join(tmp, name) }
  const ref = put('ref.png', screen(0.30)), same = put('same.png', screen(0.30)), bigger = put('bigger.png', screen(0.31))
  const small = put('small.png', screen(0.08)), moved = [1, 2, 3].map((p) => put(`moved${p}.png`, screen(0.08, p * 3)))
  const ref1x = put('ref1x.png', png.resize(png.decode(fs.readFileSync(ref)), 375, 812)), sq = put('square.png', screen(0.3, 0, 1125, 1125))
  const results = {}
  for (const impl of useSwift() ? ['swift', 'node'] : ['node']) {
    if (impl === 'node') process.env.APP_FACTORY_IMAGES = 'node'
    const o = (n) => path.join(tmp, `${impl}-${n}`)
    const t0 = Date.now()
    assert.equal(diff(ref, same, o(1)).regions.length, 0, `${impl}: identical → no region`)
    const ms = Date.now() - t0
    const d = diff(ref, bigger, o(2))
    assert.ok(d.regions.length >= 1, `${impl}: a 3 % larger element is found`)
    const r = d.regions[0]
    assert.ok(r.y > 340 && r.y < 470 && r.x > 120 && r.x < 250, `${impl}: region at the element (${r.x},${r.y} pt)`)
    assert.ok(fs.existsSync(r.image) && fs.existsSync(d.diff))
    assert.equal(d.points, '375x812')
    assert.equal(diff(ref, bigger, o(3), ['0,300,375,250']).regions.length, 0, `${impl}: a masked area is never compared`)
    assert.equal(diff(ref1x, same, o(4)).regions.length, 0, `${impl}: a 1x mockup of the same screen: compared at 1x, no region`)
    const found = moved.map((m, p) => diff(small, m, o(`m${p}`)).regions.length)
    assert.ok(found[1] >= 1 && found[2] >= 1, `${impl}: an element moved 2 or 3 points is found (regions per 1/2/3-point move: ${found.join('/')})`)
    assert.match(diff(sq, same, o(5)).error, /sizes differ/)
    results[impl] = { ms, found: found.join('/'), bigger: d.regions.map((x) => `${Math.round(x.x)},${Math.round(x.y)}`).join(' ') }
    delete process.env.APP_FACTORY_IMAGES
  }
  if (results.swift) assert.equal(results.node.found, results.swift.found, `Node and Swift find the same moves (${results.node.found} vs ${results.swift.found})`)
  return `selftest ok (${Object.entries(results).map(([k, v]) => `${k}: one comparison of 1125×2436 px ${v.ms} ms, regions for a 1/2/3-point move ${v.found}`).join('; ')})`
}

const a = process.argv.slice(2)
if (a[0] === 'selftest') console.log(selftest())
else if (a.length >= 3) {
  const i = a.indexOf('--mask')
  try { console.log(JSON.stringify(diff(a[0], a[1], a[2], i >= 0 ? a.slice(i + 1) : []), null, 2)) } catch (e) { console.error(`screen-diff: ${e.message}`); process.exit(1) }
} else { console.error('usage: screen-diff.mjs <reference.png> <app.png> <out dir> [--mask x,y,w,h ...] | selftest'); process.exit(2) }
