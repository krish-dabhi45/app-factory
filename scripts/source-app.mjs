#!/usr/bin/env node
// The audit of an existing app (/app-factory:app-dev-without-prd) — the gate its PRD.md and theme must pass before
// /app-factory:build-app builds from them. The source app is the user's OWN app (a rebuild / update of it): its theme and
// its files (icon, images, animations, sounds, fonts) are reused, never replaced by look-alikes.
//   node source-app.mjs check <project> [--apk] [--no-walk] — fails with every problem listed; --apk: an APK was audited, so
//                                                    source-app/static.md and walk.md must exist and walk.md must have a
//                                                    screen; --no-walk: the user chose to go on without the walk
//   node source-app.mjs palette <png...>          — the 12 most used colours of screenshots (exact #RRGGBB, share of pixels):
//                                                    the source app's palette, measured instead of guessed
//   node source-app.mjs status <project>          — JSON of what an earlier run left: evidence ids per file (walk 0 = not
//                                                    walked), PRD.md and its problem count, CONTRACT.md, pubspec.yaml, lib/ .dart files
//   node source-app.mjs reuse <unzipped apk> <project> — copies the source app's own files into source-app/assets/ (the
//                                                    launcher icon, raster images at their largest density, res/raw: Lottie
//                                                    and sounds, fonts, the APK's assets/) and lists each in
//                                                    source-app/assets.md as "- A<nn> · <kind> · <file> — <size> · from <apk path>"
//   node source-app.mjs image <project> <slot> <words…> [--next <n>] — an image the source app's files do not have (its photos are in
//                                                    split APKs that were not given): searched on Openverse (no key; public
//                                                    domain / CC0 first, else a commercial-use licence), saved as
//                                                    assets/images/<slot>.png, its source and licence in assets/images/CREDITS.md
//   node source-app.mjs selftest
// Evidence files (written by the audit agents): source-app/store.md (always), static.md and walk.md (with an APK).
// Each seen item gets an id on its own line — "## S07 · <screen>" or "- F03 · <claim>" (S screen, F store/web feature,
// D APK dependency or capability, L APK layout file, P store screenshot). PRD.md must cite every id, and every requirement
// line in it must carry a source tag: [walk: S07], [store: F03|P02|<url>], [static: D04|L02], [web: <url>], [user] (an
// answer in source-app/answers.md) or [decided: gap-3] (a gap decided after the one question stop at the start, recorded
// in answers.md as "### gap-3 · <question>"). ASSUMED / NOT OBSERVED only next to [user] or [decided: gap-<n>] — never a bare guess.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { decode, encode, blank } from './png.mjs'

export const SECTIONS = ['App', 'Platforms', 'Screens', 'Navigation', 'Fields', 'Features', 'Data and backend', 'Monetisation',
  'Permissions and notifications', 'Settings', 'Theme', 'Reused from the source app', 'Coverage', 'Sources']
const NO_TAG = new Set(['Theme', 'Reused from the source app', 'Sources']) // Theme is checked through theme.json; the other two list, not require
const TAG = /\[(walk|store|static|web): [^\]]+\]|\[user\]|\[decided: gap-\d+\]/
const GUESS = /\bASSUMED\b|\bNOT OBSERVED\b/
const EVIDENCE = ['store.md', 'static.md', 'walk.md', 'answers.md', 'assets.md']
// what a quote is compared with: one space for any run of whitespace or a literal \n (static.md keeps resource strings escaped)
const norm = (t) => t.replace(/\\n/g, ' ').replace(/\s+/g, ' ')
const VAGUE = /\betc\b|\band (so on|more)\b|\bvarious\b|\bmisc(ellaneous)?\b|\bTBD\b|\bTODO\b|\bsomething like\b|\bsimilar to\b|\bas needed\b|\bappropriate(ly)?\b|\bmaybe\b|\bprobably\b|\bsomehow\b|\bstuff\b|…|\.\.\./i
const ID_LINE = /^(?:##|-)\s+([SFDLPA]\d{2,})\s+·/
export const ROLES = ['primary', 'onPrimary', 'secondary', 'onSecondary', 'background', 'onBackground', 'surface', 'onSurface', 'error', 'onError']
const PAIRS = [['primary', 'onPrimary'], ['secondary', 'onSecondary'], ['background', 'onBackground'], ['surface', 'onSurface'], ['error', 'onError']]

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
export function contrast(a, b) { // WCAG 2.x contrast ratio
  const L = (h) => { const [r, g, b2] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b2 }
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
function themeProblems(t) {
  const bad = [], HEX = /^#[0-9A-Fa-f]{6}$/
  if (!t.source || !HEX.test(t.source.primary || '') || !t.source.evidence) bad.push('theme.json: source.primary (#RRGGBB) and source.evidence (where the source app\'s colour was read) are required')
  for (const mode of ['colors', 'dark']) {
    if (mode === 'dark' && !t.dark) continue
    const by = Object.fromEntries((t[mode] || []).map((c) => [c.role, c.hex]))
    for (const r of ROLES) if (!HEX.test(by[r] || '')) bad.push(`theme.json ${mode}: role "${r}" needs a #RRGGBB hex`)
    for (const [a, b] of PAIRS) if (HEX.test(by[a] || '') && HEX.test(by[b] || '') && contrast(by[a], by[b]) < 4.5) bad.push(`theme.json ${mode}: ${b} on ${a} is ${contrast(by[a], by[b]).toFixed(2)}:1 — text needs at least 4.5:1 (WCAG AA)`)
    // the user's own app keeps its own colours: light primary / secondary are the source's, as measured (dark mode its own)
    if (mode === 'colors') for (const r of ['primary', 'secondary']) {
      const src = t.source && t.source[r]
      if (HEX.test(src || '') && HEX.test(by[r] || '') && src.toUpperCase() !== by[r].toUpperCase()) bad.push(`theme.json colors: ${r} ${by[r]} is not the source app's ${src} — the source is the user's own app: its colours are kept`)
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
      if (!TAG.test(line)) bad.push(`${at} — no source tag ([walk: S..], [store: ..], [static: D..|L..], [web: <url>], [user] or [decided: gap-<n>])`)
      else if (GUESS.test(line) && !/\[user\]|\[decided: gap-\d+\]/.test(line)) bad.push(`${at} — ${line.match(GUESS)[0]} without [user] or [decided: gap-<n>]: decide it (the option closest to the evidence), record it in source-app/answers.md and DECISIONS.md, and cite it — never a bare guess`)
      for (const [, g] of line.matchAll(/\[decided: (gap-\d+)\]/g)) if (!new RegExp(`^### ${g} ·`, 'm').test(ev)) bad.push(`${at} — cites ${g}, which source-app/answers.md does not record ("### ${g} · <question>")`)
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
  // the user chose to go on without the walk, or it was decided after every walk failed (app-dev-without-prd records both there)
  const noWalk = has('source-app/answers.md') && /^(Answer|Decided): Go on without the walk/m.test(fs.readFileSync(f('source-app/answers.md'), 'utf8'))
  const dart = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dart(path.join(d, e.name)) : e.name.endsWith('.dart') ? 1 : 0), 0) : 0)
  // parts a static.md from an older version lacks (0.49.0 added layouts and code data; 0.54.0 the reusable files)
  const st = apk ? fs.readFileSync(f('source-app/static.md'), 'utf8') : ''
  const staticMissing = apk ? [[/^## Layouts/m, 'layouts'], [/^## Data in the code/m, 'data']].filter(([r]) => !r.test(st)).map(([, n]) => n).concat(has('source-app/assets.md') ? [] : ['assets']) : []
  return {
    sourceApp: has('source-app'), store: ids('source-app/store.md', 'F'), static: ids('source-app/static.md', 'D'), walk: ids('source-app/walk.md', 'S'),
    prd: has('PRD.md'), prdProblems: has('PRD.md') ? check(root, { apk, noWalk }).length : null, staticMissing, contract: has('CONTRACT.md'), app: APP_FILES.some(has) || fs.readdirSync(root).some((e) => e.endsWith('.xcodeproj')), dartFiles: dart(f('lib')),
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
const stem = (f) => path.basename(f).replace(/\.[^.]+$/, '').toLowerCase()
// files an APK carries for its libraries (Android UI kits, ad networks, SDK screens): not the app's own look
const LIB = /^(abc_|mtrl_|m3_|m3c_|material_|design_|exo_|notification_|common_google_|googleg_|admob_|applovin_|com_facebook_|fb_|tt_|pangle_|bm_|unity_|admost_|adapty_|crop_image_|ucrop_|ad_|icon_ad|mopub_|ironsource_|vungle_|inmobi_|mintegral_|quantum_|ic_mtrl_)/
const KIND = [[/\.(png|webp|jpe?g|gif)$/i, 'image'], [/\.json$/i, 'animation'], [/\.(wav|mp3|ogg|m4a|aac)$/i, 'sound'], [/\.(ttf|otf)$/i, 'font']]
// The source app is the user's own: its icon, images, animations, sounds and fonts are copied into source-app/assets/<kind>/
// for the build, one file per name (the largest density), each listed in source-app/assets.md with an A id the PRD maps to
// a place in the new app (or "not used" with why). Compiled XML (vectors, layouts) is not a file Flutter can load: left out.
export function reuse(dir, root) {
  const best = new Map()
  const take = (rel, kind) => {
    const b = fs.readFileSync(path.join(dir, rel)), wh = imageSize(b), area = wh ? wh[0] * wh[1] : b.length, key = `${kind}/${path.basename(rel).toLowerCase()}`
    if (!best.has(`${kind}/${stem(rel)}`) || area > best.get(`${kind}/${stem(rel)}`).area) best.set(`${kind}/${stem(rel)}`, { rel, kind, wh, area, size: b.length, key })
  }
  for (const rel of files(path.join(dir, 'res'), dir)) {
    const folder = rel.split('/')[1] || '', st = stem(rel), k = (KIND.find(([r]) => r.test(rel)) || [])[1]
    if (!k || LIB.test(st)) continue
    if (/^mipmap/.test(folder) && /^ic_launcher/.test(st) && k === 'image') take(rel, 'icon')
    else if (/^drawable/.test(folder) && k === 'image') take(rel, 'image')
    else if (folder === 'raw' && k !== 'image') take(rel, k)
    else if (folder === 'font' && k === 'font') take(rel, 'font')
  }
  for (const rel of files(path.join(dir, 'assets'), dir)) { const k = (KIND.find(([r]) => r.test(rel)) || [])[1]; if (k && !LIB.test(stem(rel))) take(rel, k) }
  const out = path.join(root, 'source-app', 'assets'); fs.rmSync(out, { recursive: true, force: true })
  const lines = [...best.values()].sort((x, y) => (x.kind + x.rel).localeCompare(y.kind + y.rel)).map((x, i) => {
    const to = path.join('source-app', 'assets', x.kind, path.basename(x.rel)); fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true }); fs.copyFileSync(path.join(dir, x.rel), path.join(root, to))
    return `- A${String(i + 1).padStart(2, '0')} · ${x.kind} · ${to} — ${x.wh ? `${x.wh.join('x')} px, ` : ''}${x.size} bytes · from ${x.rel}`
  })
  fs.writeFileSync(path.join(root, 'source-app', 'assets.md'), `# The source app's own files (reused: it is the user's own app)\n\n${lines.join('\n')}\n`)
  return lines
}

// The <skip>-th usable hit (0 = the first): not marked mature, at least minWidth px wide, an https image URL.
export const pick = (results, skip = 0, minWidth = 600) => (results || []).filter((r) => !r.mature && r.width >= minWidth && /^https:\/\//.test(r.url || ''))[skip] || null
// An image the source's files do not have: Openverse (api.openverse.org, no key), public domain / CC0 first (no attribution),
// else a commercial-use licence (attribution required: CREDITS.md says so and the build shows the credits).
// ponytail: macOS `sips` converts to PNG; on another OS convert with any tool and keep the same file name.
export async function image(root, slot, query, skip = 0) {
  if (!/^[a-z0-9_]+$/.test(slot)) throw new Error(`slot "${slot}": use the contract's slot name (a-z, 0-9, _)`)
  const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh) app-factory' } // some image hosts answer an HTML page to a request without one
  for (const [lic, attribution] of [['license=cc0,pdm', false], ['license_type=commercial', true]]) {
    const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&${lic}&page_size=20`, { headers: UA })
    if (!res.ok) throw new Error(`Openverse answered ${res.status}`)
    const results = (await res.json()).results
    // the <skip>-th usable hit; a host that does not give an image (HTML, an error) is passed over for the next hit
    for (let i = skip, hit; (hit = pick(results, i)); i++) {
      const img = await fetch(hit.url, { headers: UA }).catch(() => null)
      if (!img || !img.ok || !/^image\//.test(img.headers.get('content-type') || '')) continue
      const tmp = path.join(os.tmpdir(), `openverse-${slot}${path.extname(new URL(hit.url).pathname) || '.jpg'}`); fs.writeFileSync(tmp, Buffer.from(await img.arrayBuffer()))
      const dir = path.join(root, 'assets', 'images'), out = path.join(dir, `${slot}.png`); fs.mkdirSync(dir, { recursive: true })
      try { execFileSync('sips', ['-s', 'format', 'png', tmp, '--out', out], { stdio: 'ignore' }) } catch { continue } finally { fs.rmSync(tmp, { force: true }) }
      if (!fs.existsSync(out) || !imageSize(fs.readFileSync(out))) continue
      const line = `- ${slot}.png — "${hit.title || 'untitled'}" by ${hit.creator || 'unknown'}, ${String(hit.license).toUpperCase()} ${hit.license_version || ''}${attribution ? ' — attribution required' : ''}, ${hit.foreign_landing_url} (search: ${query}${i ? `, result ${i + 1}` : ''})`
      const cf = path.join(dir, 'CREDITS.md'), old = fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8').split('\n').filter((l) => l && !l.startsWith(`- ${slot}.png `) && !l.startsWith('#')) : []
      fs.writeFileSync(cf, `# Images from Openverse (source-app.mjs image)\n\n${[...old, line].sort().join('\n')}\n`)
      return line
    }
  }
  return null
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
  const theme = { source: { primary: '#1976D2', evidence: 'S01 app bar' }, colors: [['primary', '#1976D2'], ['onPrimary', '#FFFFFF'], ['secondary', '#00695C'], ['onSecondary', '#FFFFFF'], ['background', '#FFFFFF'], ['onBackground', '#1C1B1F'], ['surface', '#F7F2F4'], ['onSurface', '#1C1B1F'], ['error', '#B3261E'], ['onError', '#FFFFFF']].map(([role, hex]) => ({ role, hex })) }
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
  assert.ok(g.some((x) => /500 characters.*ASSUMED without \[user\] or \[decided/.test(x)) && !g.some((x) => /300 characters/.test(x)), 'a guess without the user\'s answer is caught; with [user] it passes')
  w('source-app/answers.md', '- name: Nova\n## Decided without asking\n### gap-1 · Max length of the note?\nDecided: 500 characters\n')
  w('PRD.md', body('\n- Note: up to 500 characters, NOT OBSERVED [decided: gap-1]\n- Title up to 40 characters [decided: gap-2]'))
  const d = check(tmp, { apk: true })
  assert.ok(!d.some((x) => /500 characters/.test(x)) && d.some((x) => /cites gap-2, which source-app\/answers\.md does not record/.test(x)), 'a recorded decision is a source; an unrecorded one is caught')
  w('source-app/answers.md', '- name: Nova\n')
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
  assert.ok(b3.some((x) => /#1E88E5 is not the source app's #1976D2/.test(x)), 'the user\'s own app keeps its colours: another primary is caught')
  assert.ok(b3.some((x) => /onSurface on surface/.test(x)), 'low contrast is caught')
  w('source-app/theme.json', JSON.stringify(theme))
  assert.deepEqual(status(tmp), { sourceApp: true, store: 1, static: 1, walk: 1, prd: true, prdProblems: 0, staticMissing: ['layouts', 'data', 'assets'], contract: false, app: false, dartFiles: 0 }, 'status: the evidence and a ready PRD are found; an older static.md lacks layouts, code data and the reusable files')
  w('source-app/walk.md', '# Walk\nNOT OBSERVED: INSTALL_FAILED_MISSING_SPLIT\n')
  assert.equal(status(tmp).walk, 0, 'status: a walk with no screen counts as not done')
  const noScreen = status(tmp).prdProblems
  w('source-app/answers.md', '## Decided without asking\n### gap-1 · The walk reached no screen on the devices tried: how is PRD.md written?\nDecided: Go on without the walk — screens from the layouts\n')
  assert.equal(status(tmp).prdProblems, noScreen - 1, 'status: a recorded "go on without the walk" decision removes the no-walked-screen problem, like the user\'s answer')
  fs.rmSync(path.join(tmp, 'source-app', 'answers.md'))
  for (const f of ['settings.gradle.kts', 'Demo.xcodeproj']) { fs.mkdirSync(path.join(tmp, 'x'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'x', f), ''); assert.equal(status(path.join(tmp, 'x')).app, true, `status: ${f} is an app project`); fs.rmSync(path.join(tmp, 'x'), { recursive: true }) }
  fs.rmSync(path.join(tmp, 'source-app', 'walk.md'))
  assert.ok(!check(tmp).some((x) => /walk\.md missing/.test(x)) && check(tmp, { apk: true }).some((x) => /walk\.md missing/.test(x)), 'walk.md is required only with an APK')
  assert.ok(Math.abs(contrast('#FFFFFF', '#000000') - 21) < 0.01)
  const img = blank(10, 10, [255, 255, 255, 255]); for (let i = 0; i < 30 * 4; i += 4) img.data.set([0x19, 0x76, 0xD2, 255], i)
  fs.writeFileSync(path.join(tmp, 'p.png'), encode(img))
  // the source app's own files are reused: one per name at its largest density; library files and compiled XML left out
  const webp = Buffer.alloc(32); webp.write('RIFF', 0); webp.write('WEBP', 8); webp.write('VP8 ', 12); webp.writeUInt16LE(10, 26); webp.writeUInt16LE(10, 28)
  assert.deepEqual(imageSize(webp), [10, 10]); assert.deepEqual(imageSize(encode(img)), [10, 10])
  const apkDir = path.join(tmp, 'apk'), wa = (f, b) => { fs.mkdirSync(path.dirname(path.join(apkDir, f)), { recursive: true }); fs.writeFileSync(path.join(apkDir, f), b) }
  wa('res/drawable-nodpi-v4/flag.webp', webp); wa('res/drawable/ad_close.png', encode(img)); wa('res/drawable/a.xml', '<x/>')
  wa('res/drawable-mdpi-v4/photo.png', encode(blank(5, 5, [1, 2, 3, 255]))); wa('res/drawable-xxhdpi-v4/photo.png', encode(blank(20, 20, [1, 2, 3, 255])))
  wa('res/mipmap-mdpi-v4/ic_launcher.webp', webp); wa('res/raw/processing.json', '{"v":"5"}'); wa('res/raw/correct_answer.wav', 'RIFF'); wa('res/raw/applovin_consent.json', '{}'); wa('res/font/karla.ttf', 'ttf')
  const ru = reuse(apkDir, tmp)
  assert.deepEqual(ru.map((l) => l.replace(/ — .*/, '')), ['- A01 · animation · source-app/assets/animation/processing.json', '- A02 · font · source-app/assets/font/karla.ttf', '- A03 · icon · source-app/assets/icon/ic_launcher.webp', '- A04 · image · source-app/assets/image/flag.webp', '- A05 · image · source-app/assets/image/photo.png', '- A06 · sound · source-app/assets/sound/correct_answer.wav'], `reuse: ${ru.join('; ')}`)
  assert.match(ru[4], /20x20 px, .* from res\/drawable-xxhdpi-v4\/photo\.png$/, 'the largest density is kept')
  assert.ok(check(tmp, { apk: true }).some((x) => /A01 \(seen/.test(x)), 'every reusable file must be placed in PRD.md (or listed as not used)')
  fs.rmSync(path.join(tmp, 'source-app', 'assets.md')); fs.rmSync(path.join(tmp, 'source-app', 'assets'), { recursive: true })
  const hits = [{ mature: true, width: 900, url: 'https://a' }, { width: 300, url: 'https://b' }, { width: 800, url: 'http://c' }, { width: 800, url: 'https://d' }, { width: 700, url: 'https://e' }]
  assert.equal(pick(hits).url, 'https://d', 'pick: not mature, wide enough, https'); assert.equal(pick(hits, 1).url, 'https://e', 'pick: --next 1 takes the next usable hit'); assert.equal(pick(hits, 2), null)
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
  else if (cmd === 'reuse' && root && a[0]) console.log(reuse(path.resolve(root), path.resolve(a[0])).join('\n'))
  else if (cmd === 'image' && root && a.length >= 2) {
    const n = a.indexOf('--next'), skip = n < 0 ? 0 : Number(a[n + 1]) || 0, words = (n < 0 ? a : a.filter((_, i) => i !== n && i !== n + 1)).slice(1)
    const line = await image(path.resolve(root), a[0], words.join(' '), skip)
    if (!line) { console.error(`no image found for "${words.join(' ')}"${skip ? ` (result ${skip + 1})` : ''}: search again with fewer, broader words (the subject only, e.g. "toaster")`); process.exit(1) }
    console.log(line)
  }
  else if (cmd === 'check' && root) {
    const bad = check(path.resolve(root), { apk: a.includes('--apk'), noWalk: a.includes('--no-walk') })
    if (bad.length) { console.error(`AUDIT NOT READY (${bad.length} problem(s)) — fix each and run check again:\n${bad.join('\n')}`); process.exit(1) }
    console.log('audit ready: PRD.md cites a source for every requirement, every seen screen, feature, dependency and screenshot is in it, and the theme is the source app\'s own and readable')
  } else { console.error('usage: source-app.mjs check <project> [--apk] [--no-walk] | status <project> | reuse <unzipped apk dir> <project> | image <project> <slot> <words…> [--next <n>] | palette <png...> | selftest'); process.exit(2) }
}
