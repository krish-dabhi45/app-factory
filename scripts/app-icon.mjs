#!/usr/bin/env node
// Makes a Flutter app's launcher icons from the one provided icon image — the only way app-factory sets an app icon.
//   node app-icon.mjs <project> --source <png> [--fill #RRGGBB] [--foreground <png>] [--allow-upscale]
// Platform rules it follows (sources: Apple HIG "App icons"; developer.android.com "Adaptive icons"):
//  - iOS: icons are square; "the system applies masking to produce rounded corners"; layout size 1024×1024 px;
//    a background must be "full-bleed and opaque". → every size in the project's AppIcon Contents.json, opaque.
//  - Android adaptive icon: 108×108 dp layers; the logo stays inside the centred 66×66 dp safe zone (18 dp margins
//    the mask may cut). → mipmap-anydpi-v26/ic_launcher.xml, foreground + background; legacy mipmaps for older Android.
// The source must be square and at least 1024 px; with transparent corners (a pre-rounded logo) it needs --fill,
// and below 1024 px --allow-upscale — both are the user's choices, asked upfront; never decided by an agent.
//   node app-icon.mjs <project> --none "<Q id>"   — no icon file was given and the user (or the recommended option) chose to
//     keep Flutter's default icon for now: touches no icon, records the choice for `pipeline.mjs assets`.
//   node app-icon.mjs selftest
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'

const SWIFT = path.join(path.dirname(new URL(import.meta.url).pathname), 'app-icon.swift')
const swift = (...a) => execFileSync('swift', [SWIFT, ...a], { encoding: 'utf8' }).trim()
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const SAFE = 66 / 108

export function plan(project, o, info) {
  if (info.w !== info.h) throw new Error(`the icon must be square: ${o.source} is ${info.w}×${info.h}`)
  if (info.w < 1024 && !o.allowUpscale) throw new Error(`the icon is ${info.w} px; iOS needs 1024×1024 — provide a 1024 px icon, or pass --allow-upscale if the user chose to use this one (it will look soft)`)
  if (info.transparentCorners && !o.fill) throw new Error(`the icon has transparent corners (a pre-rounded or cut-out logo): iOS needs a square, full-bleed, opaque image and rounds the corners itself — provide one, or pass --fill #RRGGBB (the colour behind it) if the user chose to use this one`)
  const fill = o.fill || info.corner // a full-bleed source: its own corner colour is the Android background
  const jobs = []
  const set = path.join(project, 'ios', 'Runner', 'Assets.xcassets', 'AppIcon.appiconset')
  if (fs.existsSync(path.join(set, 'Contents.json'))) {
    const c = JSON.parse(fs.readFileSync(path.join(set, 'Contents.json'), 'utf8'))
    for (const im of c.images) {
      if (!im.size || !im.scale) continue
      const px = Math.round(parseFloat(im.size) * parseFloat(im.scale))
      im.filename ||= `Icon-App-${im.size}@${im.scale}.png`
      jobs.push({ src: o.source, out: path.join(set, im.filename), size: px, fraction: 1, fill: o.fill || null, opaque: true })
    }
    fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify(c, null, 2) + '\n')
  }
  const res = path.join(project, 'android', 'app', 'src', 'main', 'res')
  if (fs.existsSync(res)) {
    for (const [d, k] of Object.entries(DENSITY)) {
      jobs.push({ src: o.source, out: path.join(res, `mipmap-${d}`, 'ic_launcher.png'), size: Math.round(48 * k), fraction: 1, fill: o.fill || null, opaque: false })
      // adaptive foreground: the logo (or the whole icon) inside the 66 dp safe zone of the 108 dp layer
      jobs.push({ src: o.foreground || o.source, out: path.join(res, `drawable-${d}`, 'ic_launcher_foreground.png'), size: Math.round(108 * k), fraction: SAFE, fill: null, opaque: false })
    }
    fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true })
    fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`)
    fs.mkdirSync(path.join(res, 'values'), { recursive: true })
    fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${fill}</color>
</resources>
`)
  }
  return { jobs, fill }
}

function run(project, o) {
  const info = JSON.parse(swift('inspect', o.source))
  const { jobs, fill } = plan(project, o, info)
  if (!jobs.length) throw new Error(`no ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json and no android/app/src/main/res in ${project}`)
  const jf = path.join(os.tmpdir(), `app-icon-${process.pid}.json`)
  fs.writeFileSync(jf, JSON.stringify(jobs))
  swift('render', jf)
  fs.rmSync(jf)
  // the record `pipeline.mjs assets` checks: the icons must be exactly what this script made, from this source
  const md5 = (f) => (fs.existsSync(f) ? crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex') : null)
  const made = Object.fromEntries(jobs.map((j) => [path.relative(project, j.out), md5(j.out)]))
  fs.mkdirSync(path.join(project, '.pipeline'), { recursive: true })
  fs.writeFileSync(path.join(project, '.pipeline', 'app-icon.json'), JSON.stringify({ source: path.relative(project, o.source), sourcePx: info.w, upscaled: info.w < 1024, preRounded: info.transparentCorners, fill: o.fill || null, foreground: o.foreground ? path.relative(project, o.foreground) : null, made }, null, 2))
  return `app icon: ${jobs.length} images from ${path.basename(o.source)} (${info.w} px${info.w < 1024 ? `, upscaled ×${(1024 / info.w).toFixed(1)} — the user's choice` : ''}${o.fill ? `, transparent parts on ${o.fill}` : ''}); Android adaptive background ${fill}${o.foreground ? `, foreground ${path.basename(o.foreground)}` : ''}`
}

function none(project, q) {
  if (!q) throw new Error('--none needs the question id that recorded the choice, e.g. --none Q4')
  fs.mkdirSync(path.join(project, '.pipeline'), { recursive: true })
  fs.writeFileSync(path.join(project, '.pipeline', 'app-icon.json'), JSON.stringify({ none: true, decision: q }, null, 2))
  return `app icon: none given — Flutter's default icon kept (${q}); add one later with --source <1024 px png>`
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-'))
  const proj = path.join(tmp, 'app')
  const set = path.join(proj, 'ios/Runner/Assets.xcassets/AppIcon.appiconset')
  fs.mkdirSync(set, { recursive: true }); fs.mkdirSync(path.join(proj, 'android/app/src/main/res'), { recursive: true })
  fs.writeFileSync(path.join(set, 'Contents.json'), JSON.stringify({ images: [
    { size: '20x20', idiom: 'iphone', filename: 'Icon-App-20x20@3x.png', scale: '3x' },
    { size: '83.5x83.5', idiom: 'ipad', filename: 'Icon-App-83.5x83.5@2x.png', scale: '2x' },
    { size: '1024x1024', idiom: 'ios-marketing', filename: 'Icon-App-1024x1024@1x.png', scale: '1x' }], info: { version: 1 } }))
  // sources: a 1024 opaque square, and a 360 logo with transparent corners (like v3's appLogo)
  const jobs = [{ src: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns', out: path.join(tmp, 'full.png'), size: 1024, fraction: 1, fill: '#336699', opaque: true },
    { src: '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns', out: path.join(tmp, 'logo.png'), size: 360, fraction: 0.8, fill: null, opaque: false }]
  fs.writeFileSync(path.join(tmp, 'j.json'), JSON.stringify(jobs)); swift('render', path.join(tmp, 'j.json'))
  const logo = JSON.parse(swift('inspect', path.join(tmp, 'logo.png')))
  assert.deepEqual([logo.w, logo.transparentCorners], [360, true])
  assert.throws(() => run(proj, { source: path.join(tmp, 'logo.png') }), /iOS needs 1024×1024/)
  assert.throws(() => run(proj, { source: path.join(tmp, 'logo.png'), allowUpscale: true }), /transparent corners/)
  assert.match(run(proj, { source: path.join(tmp, 'full.png') }), /app icon: 13 images from full.png \(1024 px\); Android adaptive background #336699/)
  const ins = (f) => JSON.parse(swift('inspect', f))
  assert.deepEqual([ins(path.join(set, 'Icon-App-83.5x83.5@2x.png')).w, ins(path.join(set, 'Icon-App-83.5x83.5@2x.png')).alpha], [167, false]) // 83.5 × 2, opaque
  assert.equal(ins(path.join(set, 'Icon-App-1024x1024@1x.png')).alpha, false)
  const fg = ins(path.join(proj, 'android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png'))
  assert.deepEqual([fg.w, fg.transparentCorners], [432, true]) // 108 dp × 4, the icon inside the safe zone
  assert.equal(ins(path.join(proj, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png')).w, 48)
  assert.match(fs.readFileSync(path.join(proj, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8'), /@drawable\/ic_launcher_foreground/)
  assert.match(run(proj, { source: path.join(tmp, 'logo.png'), allowUpscale: true, fill: '#FFFFFF' }), /upscaled ×2\.8 — the user's choice, transparent parts on #FFFFFF/)
  assert.equal(ins(path.join(set, 'Icon-App-1024x1024@1x.png')).alpha, false) // still opaque
  const rec = JSON.parse(fs.readFileSync(path.join(proj, '.pipeline/app-icon.json'), 'utf8'))
  assert.deepEqual([rec.sourcePx, rec.upscaled, rec.preRounded, rec.fill, Object.keys(rec.made).length], [360, true, true, '#FFFFFF', 13])
  assert.throws(() => none(proj), /needs the question id/)
  assert.match(none(proj, 'Q4'), /Flutter's default icon kept \(Q4\)/)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(proj, '.pipeline/app-icon.json'), 'utf8')), { none: true, decision: 'Q4' })
  return 'selftest ok'
}

const argv = process.argv.slice(2)
if (argv[0] === 'selftest') console.log(selftest())
else if (argv[0] && argv.includes('--none')) {
  try { console.log(none(path.resolve(argv[0]), argv[argv.indexOf('--none') + 1])) } catch (e) { console.error(`app-icon: ${e.message}`); process.exit(1) }
} else if (argv[0] && argv.includes('--source')) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  try { console.log(run(path.resolve(argv[0]), { source: path.resolve(opt('--source')), fill: opt('--fill'), foreground: opt('--foreground') && path.resolve(opt('--foreground')), allowUpscale: argv.includes('--allow-upscale') })) }
  catch (e) { console.error(`app-icon: ${e.message}`); process.exit(1) }
} else { console.error('usage: app-icon.mjs <project> --source <png> [--fill #RRGGBB] [--foreground <png>] [--allow-upscale] | <project> --none <Q id> | selftest'); process.exit(2) }
