#!/usr/bin/env node
// Runs screen-diff.swift, compiled once with optimisation (an interpreted run is slower) into ~/.app-factory/bin.
//   node screen-diff.mjs <reference.png> <app.png> <out dir> [--mask x,y,w,h ...]
//   node screen-diff.mjs selftest
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'

const here = path.dirname(new URL(import.meta.url).pathname)
const SRC = path.join(here, 'screen-diff.swift')
export function binary() {
  const h = crypto.createHash('md5').update(fs.readFileSync(SRC)).digest('hex').slice(0, 12)
  const bin = path.join(process.env.APP_FACTORY_HOME || path.join(os.homedir(), '.app-factory'), 'bin', `screen-diff-${h}`)
  if (!fs.existsSync(bin)) { fs.mkdirSync(path.dirname(bin), { recursive: true }); execFileSync('swiftc', ['-O', SRC, '-o', bin], { stdio: ['ignore', 'ignore', 'inherit'] }) }
  return bin
}
export function diff(ref, app, out, masks = []) {
  const r = spawnSync(binary(), [ref, app, out, ...(masks.length ? ['--mask', ...masks] : [])], { encoding: 'utf8' })
  if (r.status === 1) throw new Error(r.stderr.trim())
  return JSON.parse(r.stdout)
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdiff-'))
  const icon = '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns'
  // two 375×812 pt screens at @3x (1125×2436 px): white, an icon in the middle — the second icon 3 % larger
  const mk = (name, fraction, size = 1125, h = 2436) => ({ src: icon, out: path.join(tmp, name), size, fraction, fill: '#FFFFFF', opaque: true })
  const jobs = [mk('ref.png', 0.30), mk('same.png', 0.30), mk('bigger.png', 0.31), mk('small.png', 0.08), ...[1, 2, 3].map((p) => ({ ...mk(`moved${p}.png`, 0.08), dx: p * 3 }))]
  fs.writeFileSync(path.join(tmp, 'j.json'), JSON.stringify(jobs))
  execFileSync('swift', [path.join(here, 'app-icon.swift'), 'render', path.join(tmp, 'j.json')])
  // app-icon renders squares: stretch them to phone screens with sips (1125×2436 and the 1x reference 375×812)
  for (const f of ['ref.png', 'same.png', 'bigger.png', 'small.png', 'moved1.png', 'moved2.png', 'moved3.png']) execFileSync('sips', ['-z', '2436', '1125', path.join(tmp, f)], { stdio: 'ignore' })
  // the 1x mockup case: the same screen exported at 375×812 px
  fs.copyFileSync(path.join(tmp, 'ref.png'), path.join(tmp, 'ref1x.png')); execFileSync('sips', ['-z', '812', '375', path.join(tmp, 'ref1x.png')], { stdio: 'ignore' })
  // a 30-point element moved right by 1, 2 and 3 points (dx in px at @3x) — small defects
  const t0 = Date.now()
  assert.equal(diff(path.join(tmp, 'ref.png'), path.join(tmp, 'same.png'), path.join(tmp, 'o1')).regions.length, 0, 'identical → no region')
  const ms = Date.now() - t0
  const d = diff(path.join(tmp, 'ref.png'), path.join(tmp, 'bigger.png'), path.join(tmp, 'o2'))
  assert.ok(d.regions.length >= 1, 'a 3 % larger element is found')
  const r = d.regions[0]
  assert.ok(r.y > 250 && r.y < 406 && r.x > 100 && r.x < 190, `region at the icon (${r.x},${r.y} pt)`)
  assert.ok(fs.existsSync(r.image) && fs.existsSync(d.diff))
  assert.equal(d.points, '375x812')
  assert.equal(diff(path.join(tmp, 'ref.png'), path.join(tmp, 'bigger.png'), path.join(tmp, 'o3'), ['0,200,375,420']).regions.length, 0, 'a masked area is never compared')
  assert.equal(diff(path.join(tmp, 'ref1x.png'), path.join(tmp, 'same.png'), path.join(tmp, 'o4')).regions.length, 0, 'a 1x mockup of the same screen: compared at 1x, no region')
  const found = [1, 2, 3].map((p) => diff(path.join(tmp, 'small.png'), path.join(tmp, `moved${p}.png`), path.join(tmp, `m${p}`)).regions.length)
  assert.ok(found[1] >= 1 && found[2] >= 1, `an element moved 2 or 3 points is found (regions per 1/2/3-point move: ${found.join('/')})`)
  const sq = path.join(tmp, 'square.png'); fs.copyFileSync(path.join(tmp, 'ref.png'), sq); execFileSync('sips', ['-z', '1125', '1125', sq], { stdio: 'ignore' })
  assert.throws(() => { const x = spawnSync(binary(), [sq, path.join(tmp, 'same.png'), path.join(tmp, 'o5')], { encoding: 'utf8' }); if (x.status === 2) throw new Error(JSON.parse(x.stdout).error) }, /sizes differ/)
  return `selftest ok (one comparison of 1125×2436 px: ${ms} ms; regions for a 1/2/3-point move: ${found.join('/')})`
}

const a = process.argv.slice(2)
if (a[0] === 'selftest') console.log(selftest())
else if (a.length >= 3) {
  const i = a.indexOf('--mask')
  try { console.log(JSON.stringify(diff(a[0], a[1], a[2], i >= 0 ? a.slice(i + 1) : []), null, 2)) } catch (e) { console.error(`screen-diff: ${e.message}`); process.exit(1) }
} else { console.error('usage: screen-diff.mjs <reference.png> <app.png> <out dir> [--mask x,y,w,h ...] | selftest'); process.exit(2) }
