#!/usr/bin/env node
// The audit of an existing app (/app-factory:app-dev-without-prd) — the gate its PRD.md and new theme must pass before
// /app-factory:build-app builds from them.
//   node source-app.mjs check <project> [--apk]   — fails with every problem listed; --apk: an APK was audited, so
//                                                    source-app/static.md and walk.md must exist
//   node source-app.mjs palette <png...>          — the 12 most used colours of screenshots (exact #RRGGBB, share of pixels):
//                                                    the source app's palette, measured instead of guessed
//   node source-app.mjs selftest
// Evidence files (written by the audit agents): source-app/store.md (always), static.md and walk.md (with an APK).
// Each seen item gets an id on its own line — "## S07 · <screen>" or "- F03 · <claim>" (S screen, F store/web feature,
// D APK dependency or capability, P store screenshot). PRD.md must cite every id, and every requirement line in it must
// carry a source tag: [walk: S07], [store: F03|P02|<url>], [static: D04], [web: <url>], [user], or ASSUMED / NOT OBSERVED.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { decode, encode, blank } from './png.mjs'

export const SECTIONS = ['App', 'Platforms', 'Screens', 'Navigation', 'Fields', 'Features', 'Data and backend', 'Monetisation',
  'Permissions and notifications', 'Settings', 'Theme', 'Not copied', 'Coverage', 'Sources']
const NO_TAG = new Set(['Theme', 'Not copied', 'Sources']) // Theme is checked through theme.json; the other two list, not require
const TAG = /\[(walk|store|static|web): [^\]]+\]|\[user\]|\bASSUMED\b|\bNOT OBSERVED\b/
const VAGUE = /\betc\b|\band (so on|more)\b|\bvarious\b|\bmisc(ellaneous)?\b|\bTBD\b|\bTODO\b|\bsomething like\b|\bsimilar to\b|\bas needed\b|\bappropriate(ly)?\b|\bmaybe\b|\bprobably\b|\bsomehow\b|\bstuff\b|…|\.\.\./i
const ID_LINE = /^(?:##|-)\s+([SFDP]\d{2,})\s+·/
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

export function check(root, { apk = false } = {}) {
  const bad = [], dir = path.join(root, 'source-app'), read = (f) => fs.readFileSync(f, 'utf8')
  const evidence = ['store.md', ...(apk ? ['static.md', 'walk.md'] : [])]
  for (const f of evidence) if (!fs.existsSync(path.join(dir, f))) bad.push(`source-app/${f} missing`)
  const ev = ['store.md', 'static.md', 'walk.md'].filter((f) => fs.existsSync(path.join(dir, f))).map((f) => read(path.join(dir, f))).join('\n')
  const ids = new Set(ev.split('\n').map((l) => (l.match(ID_LINE) || [])[1]).filter(Boolean))
  const prdF = path.join(root, 'PRD.md')
  if (!fs.existsSync(prdF)) return [...bad, 'PRD.md missing']
  const prd = read(prdF)
  // sections, in order of the file; a heading may be numbered ("## 3. Screens")
  const parts = prd.split(/^## +(?:\d+\.\s*)?/m).slice(1).map((p) => { const i = p.indexOf('\n'); return { name: (i < 0 ? p : p.slice(0, i)).trim(), body: i < 0 ? '' : p.slice(i + 1) } })
  for (const s of SECTIONS) { const p = parts.find((x) => x.name === s); if (!p) bad.push(`PRD.md: section "## ${s}" missing`); else if (!p.body.trim()) bad.push(`PRD.md: section "${s}" is empty`) }
  for (const p of parts) {
    const lines = p.body.split('\n')
    lines.forEach((line, i) => {
      const at = `PRD.md ${p.name}: "${line.trim().slice(0, 80)}"`
      if (p.name !== 'Sources' && VAGUE.test(line)) bad.push(`${at} — vague (${line.match(VAGUE)[0]}): state exactly what is built`)
      if (NO_TAG.has(p.name)) return
      const row = /^\s*\|/.test(line) && !/^\s*\|[\s|:-]+\|\s*$/.test(line) && !/^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1] || '') // a table row, not its header or separator
      if ((/^\s*([-*]|\d+\.)\s+\S/.test(line) || row) && !TAG.test(line)) bad.push(`${at} — no source tag ([walk: S..], [store: ..], [static: D..], [web: <url>], [user], ASSUMED or NOT OBSERVED)`)
    })
  }
  for (const m of prd.matchAll(/\[(?:walk|store|static|web): ([^\]]+)\]/g)) {
    for (const id of m[1].match(/\b[SFDP]\d{2,}\b/g) || []) if (!ids.has(id)) bad.push(`PRD.md cites ${id}, which no source-app/*.md defines`)
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
  const body = (extra = '') => SECTIONS.map((s) => `## ${s}\n${s === 'Theme' ? theme.colors.map((c) => `| ${c.role} | ${c.hex} |`).join('\n') : s === 'Coverage' ? '- S01 F01 D01 P01 all built [walk: S01]' : `- ${s} line [walk: S01]${s === 'Features' ? extra : ''}`}\n`).join('\n')
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
  w('PRD.md', body() + '\n![](source-app/screens/S02-x.png)\n')
  assert.ok(check(tmp, { apk: true }).some((x) => /S02-x\.png, which does not exist/.test(x)), 'a missing evidence file is caught')
  w('PRD.md', body())
  w('source-app/theme.json', JSON.stringify({ ...theme, colors: theme.colors.map((c) => (c.role === 'primary' ? { ...c, hex: '#1E88E5' } : c.role === 'onSurface' ? { ...c, hex: '#EEEEEE' } : c)) }))
  const b3 = check(tmp, { apk: true })
  assert.ok(b3.some((x) => /too close/.test(x)), 'a primary of the same hue as the source is caught')
  assert.ok(b3.some((x) => /onSurface on surface/.test(x)), 'low contrast is caught')
  fs.rmSync(path.join(tmp, 'source-app', 'walk.md'))
  assert.ok(!check(tmp).some((x) => /walk\.md missing/.test(x)) && check(tmp, { apk: true }).some((x) => /walk\.md missing/.test(x)), 'walk.md is required only with an APK')
  assert.ok(distinct('#000000', '#C2185B') && !distinct('#FFFFFF', '#F5F5F5'), 'greys compare by RGB distance')
  assert.ok(Math.abs(contrast('#FFFFFF', '#000000') - 21) < 0.01)
  const img = blank(10, 10, [255, 255, 255, 255]); for (let i = 0; i < 30 * 4; i += 4) img.data.set([0x19, 0x76, 0xD2, 255], i)
  fs.writeFileSync(path.join(tmp, 'p.png'), encode(img))
  assert.deepEqual(palette([path.join(tmp, 'p.png')]), ['#FFFFFF 70.0%', '#1976D2 30.0%'])
  fs.rmSync(tmp, { recursive: true })
  return 'selftest ok'
}

const direct = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct) {
  const [cmd, root, ...a] = process.argv.slice(2)
  if (cmd === 'selftest') console.log(selftest())
  else if (cmd === 'palette' && root) console.log(palette([root, ...a]).join('\n'))
  else if (cmd === 'check' && root) {
    const bad = check(path.resolve(root), { apk: a.includes('--apk') })
    if (bad.length) { console.error(`AUDIT NOT READY (${bad.length} problem(s)) — fix each and run check again:\n${bad.join('\n')}`); process.exit(1) }
    console.log('audit ready: PRD.md cites a source for every requirement, every seen screen, feature, dependency and screenshot is in it, and the new theme is distinct and readable')
  } else { console.error('usage: source-app.mjs check <project> [--apk] | palette <png...> | selftest'); process.exit(2) }
}
