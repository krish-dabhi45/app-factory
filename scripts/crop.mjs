#!/usr/bin/env node
// Cuts one screen out of a whole-page Figma screenshot, exactly.
//   node crop.mjs <page.png> <scale> <out.png> <x> <y> <w> <h>
//   x, y, w, h: the screen's position and size in Figma points from the page image's top-left;
//   scale: PNG pixels per Figma point (width / original_width from get_screenshot). Fails rather than crop outside.
// macOS: crop.swift (Core Graphics, keeps the colour profile); Linux and Windows: png.mjs. APP_FACTORY_IMAGES=node forces Node.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as png from './png.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

export function cropPage(page, scale, out, x, y, w, h) {
  if (process.platform === 'darwin' && process.env.APP_FACTORY_IMAGES !== 'node') {
    execFileSync('swift', [path.join(here, 'crop.swift'), page, String(scale), out, String(x), String(y), String(w), String(h)], { stdio: ['ignore', 'ignore', 'pipe'] })
    return
  }
  const im = png.decode(fs.readFileSync(page)), r = (v) => Math.round(v * scale)
  fs.writeFileSync(out, png.encode(png.crop(im, r(x), r(y), r(w), r(h))))
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-'))
  const page = png.blank(60, 40, [255, 255, 255, 255]); png.over(page, png.blank(20, 10, [255, 0, 0, 255]), 30, 20)
  fs.writeFileSync(path.join(tmp, 'page.png'), png.encode(page))
  const forced = process.env.APP_FACTORY_IMAGES === 'node'
  for (const impl of process.platform === 'darwin' && !forced ? ['swift', 'node'] : ['node']) {
    if (impl === 'node') process.env.APP_FACTORY_IMAGES = 'node'
    const out = path.join(tmp, `${impl}.png`)
    cropPage(path.join(tmp, 'page.png'), 2, out, 15, 10, 10, 5) // points × 2 = the red block exactly
    const c = png.decode(fs.readFileSync(out))
    assert.deepEqual([c.w, c.h, ...c.data.subarray(0, 4)], [20, 10, 255, 0, 0, 255], impl)
    assert.throws(() => cropPage(path.join(tmp, 'page.png'), 2, out, 25, 10, 10, 5), impl === 'node' ? /outside/ : /Command failed/)
    if (!forced) delete process.env.APP_FACTORY_IMAGES
  }
  return 'selftest ok'
}

const a = process.argv.slice(2)
if (a[0] === 'selftest') console.log(selftest())
else if (a.length === 7) {
  try { cropPage(a[0], +a[1], a[2], +a[3], +a[4], +a[5], +a[6]) } catch (e) { console.error(`crop: ${String(e.stderr || e.message).trim()}`); process.exit(1) }
} else { console.error('usage: crop.mjs <page.png> <scale> <out.png> <x> <y> <w> <h> | selftest'); process.exit(2) }
