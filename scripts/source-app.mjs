#!/usr/bin/env node
// The audit of an existing app (/app-factory:app-dev-without-prd) — the gate its PRD.md and new theme must pass before
// /app-factory:build-app builds from them.
//   node source-app.mjs check <project> [--apk] [--no-walk] — fails with every problem listed; --apk: an APK was audited, so
//                                                    source-app/static.md and walk.md must exist and walk.md must have a
//                                                    screen; --no-walk: the user chose to go on without the walk
//   node source-app.mjs palette <png...>          — the 12 most used colours of screenshots (exact #RRGGBB, share of pixels):
//                                                    the source app's palette, measured instead of guessed
//   node source-app.mjs status <project>          — JSON of what an earlier run left: evidence ids per file (walk 0 = not
//                                                    walked), PRD.md and its problem count, CONTRACT.md, pubspec.yaml, lib/ .dart files
//   node source-app.mjs hashes <dir>              — "<sha1> <W>x<H>|- <path>" for every file of an unzipped APK's res/ and
//                                                    assets/ (not .xml, .arsc, .dex): written to source-app/res-hashes.txt
//   node source-app.mjs copied <project>          — fails when a file of the new app (assets/, android/app/src/main/res/,
//                                                    ios/Runner/) is a source-app file: the same bytes, or an image with the
//                                                    same name stem and the same pixel size (a converted copy)
//   node source-app.mjs selftest
// Evidence files (written by the audit agents): source-app/store.md (always), static.md and walk.md (with an APK).
// Each seen item gets an id on its own line — "## S07 · <screen>" or "- F03 · <claim>" (S screen, F store/web feature,
// D APK dependency or capability, L APK layout file, P store screenshot). PRD.md must cite every id, and every requirement
// line in it must carry a source tag: [walk: S07], [store: F03|P02|<url>], [static: D04|L02], [web: <url>] or [user] (an
// answer in source-app/answers.md). ASSUMED / NOT OBSERVED only next to [user]: a gap no source shows is asked, not guessed.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { decode, encode, blank } from './png.mjs'

export const SECTIONS = ['App', 'Platforms', 'Screens', 'Navigation', 'Fields', 'Features', 'Data and backend', 'Monetisation',
  'Permissions and notifications', 'Settings', 'Theme', 'Not copied', 'Coverage', 'Sources']
const NO_TAG = new Set(['Theme', 'Not copied', 'Sources']) // Theme is checked through theme.json; the other two list, not require
const TAG = /\[(walk|store|static|web): [^\]]+\]|\[user\]/
const GUESS = /\bASSUMED\b|\bNOT OBSERVED\b/
const EVIDENCE = ['store.md', 'static.md', 'walk.md', 'answers.md']
// what a quote is compared with: one space for any run of whitespace or a literal \n (static.md keeps resource strings escaped)
const norm = (t) => t.replace(/\\n/g, ' ').replace(/\s+/g, ' ')
const VAGUE = /\betc\b|\band (so on|more)\b|\bvarious\b|\bmisc(ellaneous)?\b|\bTBD\b|\bTODO\b|\bsomething like\b|\bsimilar to\b|\bas needed\b|\bappropriate(ly)?\b|\bmaybe\b|\bprobably\b|\bsomehow\b|\bstuff\b|…|\.\.\./i
const ID_LINE = /^(?:##|-)\s+([SFDLP]\d{2,})\s+·/
export const ROLES = ['primary', 'onPrimary', 'secondary', 'onSecondary', 'background', 'onBackground', 'surface', 'onSurface', 'error', 'onError']
const PAIRS = [['primary', 'onPrimary'], ['secondary', 'onSecondary'], ['background', 'onBackground'], ['surface', 'onSurface'], ['error', 'onError']]

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
export function contrast(a, b) { // WCAG 2.x contrast ratio
  const L = (h) => { const [r, g, b2] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b2 }
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
function hsl(h) {
  const [r, g, b] = rgb(h), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(hue * 60 + 360) % 360, s, l]
}
// A new colour counts as different from the source's when its hue is ≥ 60° away (both clearly coloured), else when it is
// ≥ 150 apart in 0–255 RGB (a grey, black or white on either side). ponytail: fixed thresholds — tune if a real reskin is judged too close.
export function distinct(a, b) {
  const [h1, s1, l1] = hsl(a), [h2, s2, l2] = hsl(b)
  const coloured = (s, l) => s >= 0.25 && l > 0.1 && l < 0.9
  if (coloured(s1, l1) && coloured(s2, l2)) return Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) >= 60
  return Math.hypot(...rgb(a).map((c, i) => (c - rgb(b)[i]) * 255)) >= 150
}

function themeProblems(t) {
  const bad = [], HEX = /^#[0-9A-Fa-f]{6}$/
  if (!t.source || !HEX.test(t.source.primary || '') || !t.source.evidence) bad.push('theme.json: source.primary (#RRGGBB) and source.evidence (where the source app\'s colour was read) are required')
  for (const mode of ['colors', 'dark']) {
    if (mode === 'dark' && !t.dark) continue
    const by = Object.fromEntries((t[mode] || []).map((c) => [c.role, c.hex]))
    for (const r of ROLES) if (!HEX.test(by[r] || '')) bad.push(`theme.json ${mode}: role "${r}" needs a #RRGGBB hex`)
    for (const [a, b] of PAIRS) if (HEX.test(by[a] || '') && HEX.test(by[b] || '') && contrast(by[a], by[b]) < 4.5) bad.push(`theme.json ${mode}: ${b} on ${a} is ${contrast(by[a], by[b]).toFixed(2)}:1 — text needs at least 4.5:1 (WCAG AA)`)
    for (const r of ['primary', 'secondary']) {
      const src = t.source && t.source[r]
      if (HEX.test(src || '') && HEX.test(by[r] || '') && !distinct(by[r], src)) bad.push(`theme.json ${mode}: ${r} ${by[r]} is too close to the source app's ${src} — pick a hue at least 60° away (or ≥ 150 apart in RGB for a grey)`)
    }
  }
  return bad
}

export function check(root, { apk = false, noWalk = false } = {}) {
  const bad = [], dir = path.join(root, 'source-app'), read = (f) => fs.readFileSync(f, 'utf8')
  const evidence = ['store.md', ...(apk ? ['static.md', 'walk.md'] : [])]
  for (const f of evidence) if (!fs.existsSync(path.join(dir, f))) bad.push(`source-app/${f} missing`)
  const ev = EVIDENCE.filter((f) => fs.existsSync(path.join(dir, f))).map((f) => read(path.join(dir, f))).join('\n'), evN = norm(ev).toLowerCase()
  if (apk && !noWalk && fs.existsSync(path.join(dir, 'walk.md')) && !read(path.join(dir, 'walk.md')).split('\n').some((l) => /^##\s+S\d{2,}\s+·/.test(l))) bad.push('source-app/walk.md has no walked screen — walk the app again, or the user answers to go on without the walk (then check --no-walk)')
  const ids = new Set(ev.split('\n').map((l) => (l.match(ID_LINE) || [])[1]).filter(Boolean))
  const prdF = path.join(root, 'PRD.md')
  if (!fs.existsSync(prdF)) return [...bad, 'PRD.md missing']
  const prd = read(prdF)
  // sections, in order of the file; a heading may be numbered ("## 3. Screens")
  const parts = prd.split(/^## +(?:\d+\.\s*)?/m).slice(1).map((p) => { const i = p.indexOf('\n'); return { name: (i < 0 ? p : p.slice(0, i)).trim(), body: i < 0 ? '' : p.slice(i + 1) } })
  for (const s of SECTIONS) { const p = parts.find((x) => x.name === s); if (!p) bad.push(`PRD.md: section "## ${s}" missing`); else if (!p.body.trim()) bad.push(`PRD.md: section "${s}" is empty`) }
  // the new name: texts that hold it are the source's texts with its brand replaced, so they are not in the evidence
  const name = ((parts.find((x) => x.name === 'App') || { body: '' }).body.match(/^- Name: \*\*(.+?)\*\*/m) || [])[1]
  if (!name) bad.push('PRD.md App: the first line must be "- Name: **<the new app\'s name>** …"')
  const heads = new Set([...prd.matchAll(/^#{2,4} +(?:\d+\.\s*)?(?:S\d+ · )?(.+)$/gm)].map((m) => m[1].trim().toLowerCase())) // a quote naming a PRD section is a reference
  for (const p of parts) {
    const lines = p.body.split('\n')
    lines.forEach((line, i) => {
      const at = `PRD.md ${p.name}: "${line.trim().slice(0, 80)}"`
      if (p.name !== 'Sources' && VAGUE.test(line)) bad.push(`${at} — vague (${line.match(VAGUE)[0]}): state exactly what is built`)
      if (NO_TAG.has(p.name)) return
      const row = /^\s*\|/.test(line) && !/^\s*\|[\s|:-]+\|\s*$/.test(line) && !/^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1] || '') // a table row, not its header or separator
      if (!(/^\s*([-*]|\d+\.)\s+\S/.test(line) || row)) return
      if (!TAG.test(line)) bad.push(`${at} — no source tag ([walk: S..], [store: ..], [static: D..|L..], [web: <url>] or [user])`)
      else if (GUESS.test(line) && !/\[user\]/.test(line)) bad.push(`${at} — ${line.match(GUESS)[0]} without [user]: no source shows it, so it is a question for the user (before PRD.md), not a guess`)
      // a text quoted or a name in backticks must be in the evidence as written (the brand-replaced texts hold the new name)
      // (pairs taken in order, then the short ones dropped — a length limit inside the pattern would pair a closing quote
      // with the next opening one; a quote with a <placeholder> describes a pattern, not a text)
      if (line.split('"').length % 2) for (const q of [...line.matchAll(/"([^"]*)"/g), ...line.matchAll(/`([^`]*)`/g)].map((m) => norm(m[1]).trim()).filter((t) => t.length >= 4 && !/<[^>]+>/.test(t) && !heads.has(t.toLowerCase()))) {
        if (!(name && q.includes(name)) && !evN.includes(q.toLowerCase())) bad.push(`${at} — "${q.slice(0, 60)}" is not in source-app/ (store.md, static.md, walk.md, answers.md): quote the evidence exactly, or record where it was seen`)
      }
    })
  }
  for (const m of prd.matchAll(/\[(?:walk|store|static|web): ([^\]]+)\]/g)) {
    for (const id of m[1].match(/\b[SFDLP]\d{2,}\b/g) || []) if (!ids.has(id)) bad.push(`PRD.md cites ${id}, which no source-app/*.md defines`)
    for (const u of m[1].match(/https?:\/\/[^\s,\]]+/g) || []) if (!ev.includes(u)) bad.push(`PRD.md cites ${u}, which source-app/store.md does not record as fetched`)
  }
  for (const id of ids) if (!new RegExp(`\\b${id}\\b`).test(prd)) bad.push(`${id} (seen in the source app) is not in PRD.md — build it, or list it in Coverage with why it is left out`)
  for (const f of new Set(prd.match(/source-app\/[\w./-]+\.\w+/g) || [])) if (!fs.existsSync(path.join(root, f))) bad.push(`PRD.md names ${f}, which does not exist`)
  const tf = path.join(dir, 'theme.json')
  if (!fs.existsSync(tf)) bad.push('source-app/theme.json missing')
  else {
    let t = null
    try { t = JSON.parse(read(tf)) } catch (e) { bad.push(`source-app/theme.json: not JSON (${e.message})`) }
    if (t) {
      bad.push(...themeProblems(t))
      const theme = (parts.find((x) => x.name === 'Theme') || { body: '' }).body.toUpperCase()
      for (const c of [...(t.colors || []), ...(t.dark || [])]) if (c.hex && !theme.includes(c.hex.toUpperCase())) bad.push(`theme.json ${c.role} ${c.hex} is not in PRD.md's Theme section`)
    }
  }
  return bad
}

// What an earlier run already left in the folder, so a new run continues from it instead of starting over: the ids
// each evidence file holds (0 = missing or failed — a walk.md with no screen), the PRD's state and the build's.
// An app project's own root file: Flutter, XcodeGen, Gradle (native Android), npm (React Native, Capacitor, Cordova).
const APP_FILES = ['pubspec.yaml', 'project.yml', 'settings.gradle', 'settings.gradle.kts', 'package.json']
export function status(root) {
  const f = (p) => path.join(root, p), has = (p) => fs.existsSync(f(p))
  const ids = (p, k) => (has(p) ? fs.readFileSync(f(p), 'utf8').split('\n').filter((l) => (l.match(ID_LINE) || [])[1]?.startsWith(k)).length : 0)
  const apk = has('source-app/static.md')
  // the user chose to go on without the walk (app-dev-without-prd writes the answers there)
  const noWalk = has('source-app/answers.md') && fs.readFileSync(f('source-app/answers.md'), 'utf8').includes('Answer: Go on without the walk')
  const dart = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dart(path.join(d, e.name)) : e.name.endsWith('.dart') ? 1 : 0), 0) : 0)
  return {
    sourceApp: has('source-app'), store: ids('source-app/store.md', 'F'), static: ids('source-app/static.md', 'D'), walk: ids('source-app/walk.md', 'S'),
    prd: has('PRD.md'), prdProblems: has('PRD.md') ? check(root, { apk, noWalk }).length : null, contract: has('CONTRACT.md'), app: APP_FILES.some(has) || fs.readdirSync(root).some((e) => e.endsWith('.xcodeproj')), dartFiles: dart(f('lib')),
  }
}

// Pixel size from the file header (PNG IHDR, WebP VP8/VP8L/VP8X, JPEG SOFn), or null for any other file.
export function imageSize(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const k = b.toString('ascii', 12, 16)
    if (k === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
    if (k === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1] }
    if (k === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1]
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) return null
      const m = b[i + 1]
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]
      i += 2 + b.readUInt16BE(i + 2)
    }
  }
  return null
}
const files = (d, base = d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))])) : [])
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex')
const stem = (f) => path.basename(f).replace(/\.[^.]+$/, '').toLowerCase()
// names every app has at the platform's fixed sizes (launcher and splash icons): for these only the same bytes count
const STANDARD = /^(ic_launcher(_round|_foreground|_background|_monochrome)?|launch_?image|launch_background|splash|icon-app-.+|appicon.*)$/
// The source app's own files, as lines "<sha1> <W>x<H>|- <path>": res/ and assets/ of the unzipped APK (layouts, the
// resource table and code are not files an app copies).
export function hashes(dir) {
  return ['res', 'assets'].flatMap((top) => files(path.join(dir, top), dir)).filter((f) => !/\.(xml|arsc|dex)$/i.test(f)).sort()
    .map((f) => { const b = fs.readFileSync(path.join(dir, f)), wh = imageSize(b); return `${sha1(b)} ${wh ? wh.join('x') : '-'} ${f}` })
}
// A file of the new app that is a source-app file: the same bytes, or an image with the same name stem and pixel size
// (converted, e.g. france.webp → france.png). The plugin's own template files (the team's ads fonts and layouts) never count.
// ponytail: name stem + size catches a converted copy that keeps its name; a renamed and resized copy is not caught.
export function copied(root) {
  const hf = path.join(root, 'source-app', 'res-hashes.txt')
  if (!fs.existsSync(hf)) return { skipped: 'source-app/res-hashes.txt missing — no APK files were audited', bad: [] }
  const src = fs.readFileSync(hf, 'utf8').trim().split('\n').filter(Boolean).map((l) => { const [h, wh, ...p] = l.split(' '); return { h, wh, p: p.join(' ') } })
  const byHash = new Map(src.map((x) => [x.h, x.p])), bySize = new Map(src.filter((x) => x.wh !== '-').map((x) => [`${stem(x.p)} ${x.wh}`, x.p]))
  const tpl = new Set(files(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates')).map((f) => sha1(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', f)))))
  const bad = []
  for (const top of ['assets', 'android/app/src/main/res', 'ios/Runner']) for (const f of files(path.join(root, top), root)) {
    const b = fs.readFileSync(path.join(root, f)), h = sha1(b)
    if (tpl.has(h)) continue
    const wh = imageSize(b)
    if (byHash.has(h)) bad.push(`${f} is the source app's ${byHash.get(h)} (same bytes)`)
    else if (wh && !STANDARD.test(stem(f)) && bySize.has(`${stem(f)} ${wh.join('x')}`)) bad.push(`${f} is the source app's ${bySize.get(`${stem(f)} ${wh.join('x')}`)} converted (same name, ${wh.join('x')} px)`)
  }
  return { bad }
}

export function palette(files) {
  const n = new Map()
  let total = 0
  for (const f of files) {
    const { data } = decode(fs.readFileSync(f))
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) { const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; n.set(k, (n.get(k) || 0) + 1); total++ }
  }
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, c]) => `#${k.toString(16).padStart(6, '0').toUpperCase()} ${(100 * c / total).toFixed(1)}%`)
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-app-'))
  fs.mkdirSync(path.join(tmp, 'source-app', 'screens'), { recursive: true })
  const w = (f, s) => fs.writeFileSync(path.join(tmp, f), s)
  w('source-app/store.md', '# Store\nFetched: https://play.google.com/store/apps/details?id=x\n- F01 · Export to PDF\n- P01 · source-app/store/1.png — home\n')
  w('source-app/static.md', '- D01 · com.revenuecat — in-app subscriptions\n')
  w('source-app/walk.md', '## S01 · Home\nscreenshot: source-app/screens/S01-home.png\n')
  w('source-app/screens/S01-home.png', '')
  const theme = { source: { primary: '#1976D2', evidence: 'S01 app bar' }, colors: [['primary', '#C2185B'], ['onPrimary', '#FFFFFF'], ['secondary', '#00695C'], ['onSecondary', '#FFFFFF'], ['background', '#FFFFFF'], ['onBackground', '#1C1B1F'], ['surface', '#F7F2F4'], ['onSurface', '#1C1B1F'], ['error', '#B3261E'], ['onError', '#FFFFFF']].map(([role, hex]) => ({ role, hex })) }
  w('source-app/theme.json', JSON.stringify(theme))
  const body = (extra = '') => SECTIONS.map((s) => `## ${s}\n${s === 'App' ? '- Name: **Nova** [user]\n' : ''}${s === 'Theme' ? theme.colors.map((c) => `| ${c.role} | ${c.hex} |`).join('\n') : s === 'Coverage' ? '- S01 F01 D01 P01 all built [walk: S01]' : `- ${s} line [walk: S01]${s === 'Features' ? extra : ''}`}\n`).join('\n')
  w('PRD.md', body())
  assert.deepEqual(check(tmp, { apk: true }), [], 'a complete audit passes')
  w('PRD.md', body('\n- Export works like the original, etc.'))
  const b1 = check(tmp, { apk: true })
  assert.ok(b1.some((x) => /vague \(etc\)/.test(x)), 'vague word caught')
  assert.ok(b1.some((x) => /no source tag/.test(x)), 'untagged requirement caught')
  w('PRD.md', body().replace('- S01 F01 D01 P01 all built', '- S01 F01 all built').replace(/\[walk: S01\]/, '[walk: S09] [web: https://nowhere.example]'))
  const b2 = check(tmp, { apk: true })
  assert.ok(b2.some((x) => /D01 \(seen/.test(x)) && b2.some((x) => /P01 \(seen/.test(x)), 'an id seen but not in the PRD is caught')
  assert.ok(b2.some((x) => /cites S09/.test(x)) && b2.some((x) => /nowhere\.example/.test(x)), 'an unknown id and an unfetched URL are caught')
  // G5: a guess must be asked; quoted texts and backticked names must be in the evidence (the new name and PRD headings excepted)
  w('source-app/answers.md', '- name: Nova\n')
  w('PRD.md', body('\n- Limit 500 characters, ASSUMED [walk: S01]\n- Limit 300 characters, NOT OBSERVED, asked [user] [walk: S01]'))
  const g = check(tmp, { apk: true })
  assert.ok(g.some((x) => /500 characters.*ASSUMED without \[user\]/.test(x)) && !g.some((x) => /300 characters/.test(x)), 'a guess without the user\'s answer is caught; with [user] it passes')
  w('PRD.md', body('\n- Button "Export to PDF" and `export_btn` [store: F01]\n- Title "Nova home", see "Features" [walk: S01]'))
  const q2 = check(tmp, { apk: true })
  assert.ok(q2.some((x) => /"export_btn" is not in source-app/.test(x)) && !q2.some((x) => /Export to PDF"? is not/.test(x)) && !q2.some((x) => /Nova home|"Features" is not/.test(x)), 'an invented name is caught; an evidence text, the new name and a PRD heading pass')
  w('PRD.md', body().replace('- Name: **Nova** [user]\n', ''))
  assert.ok(check(tmp, { apk: true }).some((x) => /first line must be "- Name:/.test(x)), 'the new name line is required')
  w('source-app/walk.md', '# Walk\nINSTALL_FAILED_MISSING_SPLIT\n'); w('PRD.md', body().replace(/\[walk: S01\]/g, '[store: F01]').replace('S01 F01', 'F01'))
  assert.ok(check(tmp, { apk: true }).some((x) => /walk\.md has no walked screen/.test(x)) && !check(tmp, { apk: true, noWalk: true }).some((x) => /no walked screen/.test(x)), 'with an APK a walk with no screen fails, unless the user chose to go on without it')
  w('source-app/walk.md', '## S01 · Home\nscreenshot: source-app/screens/S01-home.png\n')
  w('PRD.md', body() + '\n![](source-app/screens/S02-x.png)\n')
  assert.ok(check(tmp, { apk: true }).some((x) => /S02-x\.png, which does not exist/.test(x)), 'a missing evidence file is caught')
  w('PRD.md', body())
  w('source-app/theme.json', JSON.stringify({ ...theme, colors: theme.colors.map((c) => (c.role === 'primary' ? { ...c, hex: '#1E88E5' } : c.role === 'onSurface' ? { ...c, hex: '#EEEEEE' } : c)) }))
  const b3 = check(tmp, { apk: true })
  assert.ok(b3.some((x) => /too close/.test(x)), 'a primary of the same hue as the source is caught')
  assert.ok(b3.some((x) => /onSurface on surface/.test(x)), 'low contrast is caught')
  w('source-app/theme.json', JSON.stringify(theme))
  assert.deepEqual(status(tmp), { sourceApp: true, store: 1, static: 1, walk: 1, prd: true, prdProblems: 0, contract: false, app: false, dartFiles: 0 }, 'status: the evidence and a ready PRD are found')
  w('source-app/walk.md', '# Walk\nNOT OBSERVED: INSTALL_FAILED_MISSING_SPLIT\n')
  assert.equal(status(tmp).walk, 0, 'status: a walk with no screen counts as not done')
  for (const f of ['settings.gradle.kts', 'Demo.xcodeproj']) { fs.mkdirSync(path.join(tmp, 'x'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'x', f), ''); assert.equal(status(path.join(tmp, 'x')).app, true, `status: ${f} is an app project`); fs.rmSync(path.join(tmp, 'x'), { recursive: true }) }
  fs.rmSync(path.join(tmp, 'source-app', 'walk.md'))
  assert.ok(!check(tmp).some((x) => /walk\.md missing/.test(x)) && check(tmp, { apk: true }).some((x) => /walk\.md missing/.test(x)), 'walk.md is required only with an APK')
  assert.ok(distinct('#000000', '#C2185B') && !distinct('#FFFFFF', '#F5F5F5'), 'greys compare by RGB distance')
  assert.ok(Math.abs(contrast('#FFFFFF', '#000000') - 21) < 0.01)
  const img = blank(10, 10, [255, 255, 255, 255]); for (let i = 0; i < 30 * 4; i += 4) img.data.set([0x19, 0x76, 0xD2, 255], i)
  fs.writeFileSync(path.join(tmp, 'p.png'), encode(img))
  // G6: copied source files — same bytes, or a converted image (same stem and size); launcher names only by bytes
  const webp = Buffer.alloc(32); webp.write('RIFF', 0); webp.write('WEBP', 8); webp.write('VP8 ', 12); webp.writeUInt16LE(10, 26); webp.writeUInt16LE(10, 28)
  assert.deepEqual(imageSize(webp), [10, 10]); assert.deepEqual(imageSize(encode(img)), [10, 10])
  const apkDir = path.join(tmp, 'apk'); fs.mkdirSync(path.join(apkDir, 'res', 'drawable'), { recursive: true }); fs.mkdirSync(path.join(apkDir, 'res', 'mipmap-mdpi'), { recursive: true })
  fs.writeFileSync(path.join(apkDir, 'res', 'drawable', 'flag.webp'), webp); fs.writeFileSync(path.join(apkDir, 'res', 'drawable', 'logo.png'), encode(img)); fs.writeFileSync(path.join(apkDir, 'res', 'drawable', 'a.xml'), '<x/>')
  fs.writeFileSync(path.join(apkDir, 'res', 'mipmap-mdpi', 'ic_launcher.webp'), webp)
  w('source-app/res-hashes.txt', hashes(apkDir).join('\n'))
  assert.equal(hashes(apkDir).length, 3, 'hashes: layouts (.xml) are left out')
  fs.mkdirSync(path.join(tmp, 'assets', 'img'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'assets', 'img', 'flag.png'), encode(blank(10, 10, [5, 5, 5, 255]))); fs.writeFileSync(path.join(tmp, 'assets', 'img', 'new.png'), encode(blank(10, 10, [1, 2, 3, 255])))
  fs.writeFileSync(path.join(tmp, 'assets', 'img', 'brand.png'), encode(img)) // same bytes as the source's logo.png
  fs.writeFileSync(path.join(tmp, 'android', 'app', 'src', 'main', 'res', 'mipmap-mdpi', 'ic_launcher.png'), encode(blank(10, 10, [9, 9, 9, 255])))
  const cp = copied(tmp).bad
  assert.ok(cp.some((x) => /flag\.png .*flag\.webp converted/.test(x)) && cp.some((x) => /brand\.png .*logo\.png \(same bytes\)/.test(x)) && !cp.some((x) => /new\.png|ic_launcher/.test(x)) && cp.length === 2, `copied: a converted and a byte copy caught; a new image and a launcher icon of the platform size pass (${cp.join('; ')})`)
  assert.deepEqual(palette([path.join(tmp, 'p.png')]), ['#FFFFFF 70.0%', '#1976D2 30.0%'])
  fs.rmSync(tmp, { recursive: true })
  return 'selftest ok'
}

const direct = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) {
  const [cmd, root, ...a] = process.argv.slice(2)
  if (cmd === 'selftest') console.log(selftest())
  else if (cmd === 'palette' && root) console.log(palette([root, ...a]).join('\n'))
  else if (cmd === 'status' && root) console.log(JSON.stringify(status(path.resolve(root))))
  else if (cmd === 'hashes' && root) console.log(hashes(path.resolve(root)).join('\n'))
  else if (cmd === 'copied' && root) {
    const r = copied(path.resolve(root))
    if (r.bad.length) { console.error(`SOURCE FILES COPIED (${r.bad.length}) — the new app may not use the source app's files (PRD.md "Not copied"); replace each:\n${r.bad.join('\n')}`); process.exit(1) }
    console.log(r.skipped || 'no source-app file in the new app')
  }
  else if (cmd === 'check' && root) {
    const bad = check(path.resolve(root), { apk: a.includes('--apk'), noWalk: a.includes('--no-walk') })
    if (bad.length) { console.error(`AUDIT NOT READY (${bad.length} problem(s)) — fix each and run check again:\n${bad.join('\n')}`); process.exit(1) }
    console.log('audit ready: PRD.md cites a source for every requirement, every seen screen, feature, dependency and screenshot is in it, and the new theme is distinct and readable')
  } else { console.error('usage: source-app.mjs check <project> [--apk] [--no-walk] | status <project> | hashes <unzipped apk dir> | copied <project> | palette <png...> | selftest'); process.exit(2) }
}
