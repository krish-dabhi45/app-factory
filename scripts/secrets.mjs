#!/usr/bin/env node
// API keys for an app-factory project — kept out of every prompt, file, commit, log and tool output.
// The values live in ONE file outside the project: ~/.app-factory/secrets/<project id>.json (mode 600), read by
// `flutter … --dart-define-from-file=<that file>` and by `secret native`. No command ever prints a value.
//   node secrets.mjs set <NAME>                 — the value from stdin (paste, then Ctrl-D; or a pipe)
//   node secrets.mjs names                      — the stored key names (no values)
//   node secrets.mjs define                     — prints --dart-define-from-file=<file> when keys are stored, else nothing
//   node secrets.mjs native [<NAME> [android:<property>] [ios:<VAR>]]
//                                               — records where a native SDK reads a key and writes it there in this
//                                                 checkout (android/local.properties, ios/Flutter/Secrets.xcconfig — both
//                                                 git-ignored); with no NAME, re-applies every recorded one (a worktree)
//   node secrets.mjs import <file>              — every key in the file (PRD.md) is stored under a name taken from its line
//                                                 (e.g. "Google Maps API key: AIza…" → GOOGLE_MAPS_API_KEY); the file is left as
//                                                 written, git-ignored when untracked, and from then on every Bash/Read/Grep
//                                                 output shows ‹NAME› instead of the value (firewall hook)
//   node secrets.mjs move [file ...]            — a key found in the project (or a ‹NAME› placeholder copied into a file) goes
//                                                 to its proper place: stored, and the file rewired to read it (see move())
//   node secrets.mjs run '<command>'            — runs one command with every stored key in its environment ($NAME); prints
//                                                 its output with every key replaced by ‹NAME›
//   node secrets.mjs scan [file ...]            — fails if a stored value or a known key pattern is in the project's
//                                                 files (or the given ones); prints file:line and the key name only
//   node secrets.mjs forget                     — end of the run: removes every stored key from the coding agents' context
//                                                 (masks it in this project's Claude Code transcripts, temp output and
//                                                 .pipeline/ records); the app's keys and files are not touched
//   node secrets.mjs selftest
// The project is the directory of PIPELINE_DIR when set, else the current directory (a <project>.worktrees/<key>
// checkout maps to <project>).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Key formats published by their providers; a match in a file means a key was written where it must not be.
// [label, regex, base name for import]; the value is the regex's group 1 when it has one, else the whole match.
export const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g, 'GOOGLE'],
  ['OpenAI/Anthropic key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, 'AI'],
  ['Stripe secret key', /\b[sr]k_live_[0-9A-Za-z]{16,}/g, 'STRIPE'],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/g, 'AWS'],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}/g, 'GITHUB'],
  ['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}/g, 'SLACK'],
  ['Mapbox token', /\b[ps]k\.eyJ[A-Za-z0-9._-]{20,}/g, 'MAPBOX'],
  // ponytail: generic "key: value" form — a value of 20+ letters/digits with at least one digit; an unusual key in prose without these words is not found
  ['key assignment', /\b(?:api[ _-]?key|secret(?:[ _-]?key)?|access[ _-]?token|token)\b\**["'`]?\s*(?:[:=]|is)\s*["'`]?((?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,})/gi, 'API'],
]
const valueOf = (m) => m[1] ?? m[0]
const SKIP = new Set(['.git', '.dart_tool', 'build', 'Pods', 'node_modules', '.gradle', 'DerivedData'])
const NATIVE_FILES = { android: 'android/local.properties', ios: 'ios/Flutter/Secrets.xcconfig' }
const sourcesFile = (project) => secretsFile(project).replace(/\.json$/, '.sources.json') // NAME → "PRD.md:12": the user's own file a key came from

export function projectOf(cwd = process.cwd()) {
  if (process.env.PIPELINE_DIR) return path.dirname(path.resolve(process.env.PIPELINE_DIR))
  const m = cwd.match(/^(.*)\.worktrees[\\/][^\\/]+([\\/].*)?$/) // either separator: Windows paths use \\
  return m ? m[1] : cwd
}
const home = () => process.env.APP_FACTORY_HOME || path.join(os.homedir(), '.app-factory')
export function secretsFile(project) {
  let real = project
  try { real = fs.realpathSync(project) } catch { /* not created yet */ }
  return path.join(home(), 'secrets', `${crypto.createHash('sha1').update(real).digest('hex').slice(0, 12)}.json`)
}
const nativeFile = (project) => secretsFile(project).replace(/\.json$/, '.native.json')
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d)
export const values = (project) => Object.entries(readJson(secretsFile(project), {})).filter(([, v]) => typeof v === 'string' && v.length >= 8)
// Every form a stored key takes in files and output: the value, and the base64 of "NAME=value" that Flutter writes for each
// --dart-define into DART_DEFINES (ios/Flutter/Generated.xcconfig, flutter_export_environment.sh, gradle -Pdart-defines) —
// flutter_tools build_info.dart: _defineEncoder = utf8.encoder.fuse(base64.encoder), toEnvironmentConfig() 'DART_DEFINES'.
export const needles = (project) => values(project).flatMap(([n, v]) => [[n, v], [n, Buffer.from(`${n}=${v}`).toString('base64')]])
// Build files Flutter regenerates with DART_DEFINES; git-ignored by Flutter's ios/.gitignore — not a leak, but masked at the end.
const GENERATED = ['ios/Flutter/Generated.xcconfig', 'ios/Flutter/flutter_export_environment.sh']
// Firebase's own config files are the proper place for their keys: "API keys for Firebase services are OK to include in
// code or checked-in config files" (firebase.google.com/docs/projects/api-keys) — never moved or reported.
const FIREBASE = new Set(['google-services.json', 'GoogleService-Info.plist']) // by file name: flavors keep them in other folders
const DOC = /\.(md|txt)$/i
const camel = (n) => n.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// The files scan and move look at: the project, without the places a key belongs.
const checked = (project) => { const srcs = sourceFiles(project); return walk(project).filter((f) => !Object.values(NATIVE_FILES).includes(f) && !GENERATED.includes(f) && !FIREBASE.has(path.basename(f)) && !srcs.has(f)) }

// Replaces every stored value and known key pattern in a string with ‹NAME›.
export function redact(text, vals) {
  let t = text
  for (const [n, v] of vals) t = t.split(v).join(`‹${n}›`)
  for (const [n, rx] of PATTERNS) t = t.replace(rx, (m, g) => (typeof g === 'string' ? m.replace(g, `‹${n}›`) : `‹${n}›`)) // no group: g is the offset
  return t
}

// The name a key gets from the words before it on its line: "Google Maps API key: AIza…" → GOOGLE_MAPS_API_KEY.
const STOP = new Set(['API', 'KEY', 'KEYS', 'TOKEN', 'SECRET', 'ACCESS', 'IS', 'THE', 'USE', 'YOUR', 'OUR', 'HERE', 'FOR', 'WITH', 'AND', 'A', 'AN', 'OF', 'TO', 'THIS', 'IT',
  // code words around a literal: const mapsApiKey = '…', android:name="com.google.android.geo.API_KEY" android:value="…"
  'CONST', 'FINAL', 'VAR', 'LET', 'VAL', 'STATIC', 'STRING', 'PRIVATE', 'PUBLIC', 'LATE', 'RETURN', 'DEFAULT', 'VALUE', 'ANDROID', 'NAME', 'META', 'DATA', 'COM', 'GEO', 'PROVIDE', 'GMSSERVICES', 'SERVICES', 'HTTPS', 'HTTP', 'WWW', 'Q', 'APIKEY', 'APPID'])
export function nameFor(before, base) {
  const words = (before.replace(/([a-z0-9])([A-Z])/g, '$1 $2').match(/[A-Za-z][A-Za-z0-9]*/g) || []).map((w) => w.toUpperCase()).filter((w) => !STOP.has(w)).slice(-3)
  return `${words.length ? words.join('_') : base}_API_KEY`.replace(/^(\d)/, 'K$1')
}
function importFile(project, file) {
  const f = path.resolve(file)
  if (!fs.existsSync(f)) throw new Error(`no ${file}`)
  const rel = path.relative(project, f), lines = fs.readFileSync(f, 'utf8').split('\n')
  const all = readJson(secretsFile(project), {}), src = readJson(sourcesFile(project), {}), got = []
  lines.forEach((l, i) => {
    for (const [, rx, base] of PATTERNS) {
      for (const m of l.matchAll(rx)) {
        const v = valueOf(m)
        const known = Object.entries(all).find(([, x]) => x === v)
        if (known) { src[known[0]] ||= `${rel}:${i + 1}`; continue }
        let n = nameFor(l.slice(0, m.index), base)
        for (let k = 2; all[n]; k++) n = `${nameFor(l.slice(0, m.index), base)}_${k}`
        all[n] = v; src[n] = `${rel}:${i + 1}`; got.push(`${n} (line ${i + 1})`)
      }
    }
  })
  if (got.length) { writeSecure(secretsFile(project), all); writeSecure(sourcesFile(project), src) }
  // the file stays as the user wrote it; it must not reach git
  let tracked = false
  try { execFileSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: project, stdio: 'ignore' }); tracked = true } catch { /* untracked or no repository */ }
  if (Object.values(src).some((s) => s.startsWith(`${rel}:`)) && !tracked) {
    const gi = path.join(project, '.gitignore'), t = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : ''
    if (!t.split('\n').includes(rel)) fs.writeFileSync(gi, `${t}${t && !t.endsWith('\n') ? '\n' : ''}${rel}\n`)
  }
  const inFile = Object.entries(src).filter(([, s]) => s.startsWith(`${rel}:`)).map(([n]) => n)
  if (!inFile.length) return `no key in ${rel}`
  return `${rel}: ${inFile.length} key(s) stored outside the project — ${inFile.join(', ')}${got.length ? ` (new: ${got.join(', ')})` : ''}; values not shown. ${rel} is left as written; every read of it shows ‹NAME› instead of a value.${tracked ? ` WARNING: ${rel} is tracked by git, so its keys are in the repository's history — that cannot be undone here; replace the keys with new ones.` : ` ${rel} is git-ignored.`}`
}
// The project's PRD: PRD.md, else the one Markdown file in the project folder whose name contains "PRD" (any case),
// e.g. "street view - PRD.md". None or several → an error naming the candidates; never a guess.
export function findPrd(project) {
  if (fs.existsSync(path.join(project, 'PRD.md'))) return 'PRD.md'
  const c = fs.readdirSync(project).filter((f) => /\.md$/i.test(f) && /prd/i.test(f) && fs.statSync(path.join(project, f)).isFile())
  if (c.length === 1) return c[0]
  throw new Error(c.length ? `several PRD files: ${c.join(', ')} — rename the one to use to PRD.md` : `no PRD in ${project}: name it PRD.md (or any *PRD*.md)`)
}
const sourceFiles = (project) => new Set(Object.values(readJson(sourcesFile(project), {})).map((s) => s.replace(/:\d+$/, '')))

function writeSecure(f, obj) {
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 })
  fs.writeFileSync(f, JSON.stringify(obj, null, 2), { mode: 0o600 })
  fs.chmodSync(f, 0o600)
}

function set(project, name, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name || '')) throw new Error('set <NAME> — upper-case letters, digits and _, e.g. MAPS_API_KEY')
  const v = (value || '').trim()
  if (v.length < 8 || /\s/.test(v)) throw new Error(`no key value for ${name} on stdin (got ${v.length} characters)`)
  const f = secretsFile(project), all = readJson(f, {})
  all[name] = v
  writeSecure(f, all)
  if (fs.existsSync(path.join(project, '.pipeline'))) applyNative(project, project) // a key that a native SDK reads goes there too
  return `stored ${name} (${v.length} characters) in ${f} — the value is not shown`
}

function setLine(file, re, line) {
  const t = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const lines = t.split('\n').filter((l) => !re.test(l) && l !== '')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, [...lines, line].join('\n') + '\n')
}
function ensureIgnored(project) {
  const gi = path.join(project, '.gitignore'), t = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : ''
  const missing = Object.values(NATIVE_FILES).filter((l) => !t.split('\n').includes(l))
  if (missing.length) fs.writeFileSync(gi, `${t}${t && !t.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`)
}
function applyNative(project, checkout) {
  const map = readJson(nativeFile(project), {}), vals = Object.fromEntries(values(project)), done = []
  for (const [name, where] of Object.entries(map)) {
    if (!vals[name]) continue
    if (where.android) { setLine(path.join(checkout, NATIVE_FILES.android), new RegExp(`^${where.android}=`), `${where.android}=${vals[name]}`); done.push(`${name} → ${NATIVE_FILES.android} ${where.android}`) }
    if (where.ios) { setLine(path.join(checkout, NATIVE_FILES.ios), new RegExp(`^${where.ios}\\s*=`), `${where.ios}=${vals[name]}`); done.push(`${name} → ${NATIVE_FILES.ios} ${where.ios}`) }
  }
  if (done.length) ensureIgnored(checkout)
  return done
}
function native(project, checkout, [name, ...targets]) {
  if (name) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('native <NAME> [android:<property>] [ios:<VAR>]')
    const map = readJson(nativeFile(project), {}), w = {}
    for (const t of targets) { const [k, v] = t.split(':'); if (!['android', 'ios'].includes(k) || !/^[A-Za-z_][\w.]*$/.test(v || '')) throw new Error(`bad target ${t}: android:<property> or ios:<VAR>`); w[k] = v }
    if (!Object.keys(w).length) throw new Error('native <NAME> needs android:<property> and/or ios:<VAR>')
    map[name] = w
    writeSecure(nativeFile(project), map)
  }
  const done = applyNative(project, checkout)
  const missing = Object.keys(readJson(nativeFile(project), {})).filter((n) => !values(project).some(([k]) => k === n))
  return `${done.length ? `written: ${done.join('; ')}` : 'nothing written'}${missing.length ? `; not stored yet: ${missing.join(', ')}` : ''}`
}

function walk(root, rel = '', out = []) {
  let entries = []
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name // forward slashes on every OS (compared with paths like android/local.properties)
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(root, r, out) } else if (e.isFile()) out.push(r)
  }
  return out
}
function scan(project, files) {
  const vals = needles(project), bad = []
  const srcs = sourceFiles(project), names = new Set(values(project).map(([n]) => n))
  const list = files.length ? files.map((f) => path.resolve(f)) : checked(project).map((f) => path.join(project, f))
  for (const f of list) {
    if (!fs.existsSync(f) || fs.statSync(f).size > 20e6) continue
    const t = fs.readFileSync(f, 'utf8')
    if (t.includes('\u0000')) continue // binary
    t.split('\n').forEach((l, i) => {
      for (const [n, v] of vals) if (l.includes(v)) bad.push(`${path.relative(project, f) || f}:${i + 1}: the value of ${n}`)
      for (const [n, rx] of PATTERNS) if (l.match(rx)) bad.push(`${path.relative(project, f) || f}:${i + 1}: a ${n}`)
      // a ‹NAME› placeholder left in code or config: the key is not wired (redacted text copied into a file)
      const rel = path.relative(project, f)
      if (!DOC.test(f) && !rel.startsWith('.pipeline')) for (const m of l.matchAll(/‹([A-Z][A-Z0-9_]*)›/g)) if (names.has(m[1])) bad.push(`${rel}:${i + 1}: the placeholder ‹${m[1]}› — run secret move`)
    })
  }
  if (bad.length) throw new Error(`SECRETS (${bad.length}) — a key is written where it must not be:\n${bad.join('\n')}\nRun \`secret move\`: it stores each key and rewires the file to read it from its proper place (build skill L12).`)
  return `no key in ${files.length ? files.join(', ') : `the project (${list.length} files)`}${names.size ? `; ${names.size} stored key(s): ${[...names].join(', ')}` : ''}${!files.length && srcs.size ? `; not scanned: ${[...srcs].join(', ')} — the user's own file the keys came from (git-ignored, shown to agents as ‹NAME›)` : ''}`
}

// A key found while coding goes to its proper place: stored in the secrets file, and every file that held it rewired —
//   Dart: a literal → ApiKeys.<name> (inside a string → ${ApiKeys.<name>}); lib/config/api_keys.dart gets the
//         String.fromEnvironment pair and the file its import
//   AndroidManifest.xml: → ${NAME}, the placeholder filled from git-ignored local.properties (android/app/build.gradle.kts)
//   Info.plist: → $(NAME); Swift: → Bundle.main.object(forInfoDictionaryKey: "NAME") — from git-ignored Secrets.xcconfig
//   .md/.txt: → ‹NAME›. Any other file: → ‹NAME› and listed — wiring it is code work, and scan fails until it is done.
function move(project, files) {
  const all = readJson(secretsFile(project), {}), map = readJson(nativeFile(project), {})
  // Dart first, docs last: a new key is named from the first line it is found on, and code names it best (mapsApiKey)
  const rank = (f) => (f.endsWith('.dart') ? 0 : DOC.test(f) ? 2 : 1)
  const list = (files.length ? files.map((f) => path.relative(project, path.resolve(f))) : checked(project)).sort((x, y) => rank(x) - rank(y))
  const pubspec = path.join(project, 'pubspec.yaml')
  const pkg = fs.existsSync(pubspec) ? (fs.readFileSync(pubspec, 'utf8').match(/^name:\s*(\S+)/m) || [])[1] : null
  const done = [], todo = [], needIos = new Set(), needAndroid = new Set(), dartNames = new Set()
  // the keys class and constant names already in lib/config/api_keys.dart win; otherwise ApiKeys and camelCase (L12)
  const kfile = path.join(project, 'lib/config/api_keys.dart'), ktext = () => (fs.existsSync(kfile) ? fs.readFileSync(kfile, 'utf8') : '')
  const cls = (ktext().match(/class\s+(\w+)/) || [])[1] || 'ApiKeys'
  const id = (n) => (ktext().match(new RegExp(`static\\s+const\\s+(?:String\\s+)?(\\w+)\\s*=\\s*String\\.fromEnvironment\\(\\s*['"]${n}['"]`)) || [])[1] || camel(n)
  for (const rel of list) {
    const f = path.join(project, rel)
    if (!fs.existsSync(f) || fs.statSync(f).size > 20e6 || rel.startsWith('.pipeline')) continue
    let t = fs.readFileSync(f, 'utf8')
    if (t.includes('\u0000')) continue
    // every key in the file: stored values, ‹NAME› placeholders, and keys not stored yet (named from their line)
    const hits = new Map() // needle → NAME
    for (const [n, v] of Object.entries(all)) if (t.includes(v)) hits.set(v, n)
    t.split('\n').forEach((l) => {
      for (const [, rx, base] of PATTERNS) for (const m of l.matchAll(rx)) {
        const v = valueOf(m)
        if (hits.has(v)) continue
        const known = Object.entries(all).find(([, x]) => x === v)
        let n = known ? known[0] : nameFor(l.slice(0, m.index + m[0].indexOf(v)), base)
        if (!known) { for (let k = 2; all[n]; k++) n = `${nameFor(l.slice(0, m.index), base)}_${k}`; all[n] = v }
        hits.set(v, n)
      }
    })
    for (const n of Object.keys(all)) if (t.includes(`‹${n}›`)) hits.set(`‹${n}›`, n) // after naming: a placeholder of a key found in this same file
    if (!hits.size) continue
    const before = t
    for (const [needle, n] of hits) {
      const q = esc(needle)
      if (rel.endsWith('.dart')) {
        if (rel === 'lib/config/api_keys.dart') t = t.replace(new RegExp(`,?\\s*defaultValue:\\s*(['"])${q}\\1`, 'g'), '')
        t = t.replace(new RegExp(`(['"])${q}\\1`, 'g'), `${cls}.${id(n)}`).split(needle).join(`\${${cls}.${id(n)}}`)
        dartNames.add(n)
        if (rel !== 'lib/config/api_keys.dart' && !/config\/api_keys\.dart['"]/.test(t) && pkg) {
          const imp = `import 'package:${pkg}/config/api_keys.dart';`
          const lastImport = [...t.matchAll(/^import .*;$/gm)].pop()
          t = lastImport ? `${t.slice(0, lastImport.index + lastImport[0].length)}\n${imp}${t.slice(lastImport.index + lastImport[0].length)}` : `${imp}\n${t}`
        }
      } else if (rel.endsWith('AndroidManifest.xml')) { t = t.split(needle).join(`\${${n}}`); needAndroid.add(n) }
      else if (rel.endsWith('Info.plist')) { t = t.split(needle).join(`$(${n})`); needIos.add(n) }
      else if (rel.endsWith('.swift')) { t = t.replace(new RegExp(`"${q}"`, 'g'), `(Bundle.main.object(forInfoDictionaryKey: "${n}") as? String ?? "")`); needIos.add(n); if (t.includes(needle)) { t = t.split(needle).join(`‹${n}›`); todo.push(`${rel}: ${n} — inside a longer Swift string: read it with Bundle.main.object(forInfoDictionaryKey: "${n}")`) } }
      else { t = t.split(needle).join(`‹${n}›`); if (!DOC.test(rel)) todo.push(`${rel}: ${n} — not rewired automatically (${path.extname(rel) || 'no extension'}): read the key through lib/config/api_keys.dart (Dart), the manifest placeholder \${${n}} (Android) or $(${n}) in Info.plist (iOS)`) }
    }
    if (t !== before) { fs.writeFileSync(f, t); done.push(`${rel} (${[...new Set(hits.values())].join(', ')})`) }
  }
  writeSecure(secretsFile(project), all)
  // lib/config/api_keys.dart: one String.fromEnvironment pair per key the Dart code reads
  if (dartNames.size) {
    const kf = kfile
    let k = fs.existsSync(kf) ? fs.readFileSync(kf, 'utf8') : `/// API keys, passed at build time with --dart-define-from-file (build skill L12). Empty = not configured.\nabstract final class ApiKeys {\n}\n`
    for (const n of dartNames) if (!new RegExp(`String\\.fromEnvironment\\(\\s*['"]${n}['"]`).test(k)) {
      const c = camel(n), at = k.lastIndexOf('}')
      k = `${k.slice(0, at)}  static const ${c} = String.fromEnvironment('${n}');\n  static bool get has${c[0].toUpperCase()}${c.slice(1)} => ${c}.isNotEmpty;\n${k.slice(at)}`
    }
    fs.mkdirSync(path.dirname(kf), { recursive: true }); fs.writeFileSync(kf, k)
  }
  // Android: the manifest placeholder is filled from local.properties by the app's Gradle file
  for (const n of needAndroid) {
    map[n] = { ...map[n], android: n }
    const kts = path.join(project, 'android/app/build.gradle.kts'), groovy = path.join(project, 'android/app/build.gradle')
    if (fs.existsSync(kts)) {
      let g = fs.readFileSync(kts, 'utf8')
      if (!g.includes(`manifestPlaceholders["${n}"]`)) {
        if (!/defaultConfig\s*\{/.test(g)) todo.push(`android/app/build.gradle.kts: no defaultConfig block — add manifestPlaceholders["${n}"] by hand`)
        else fs.writeFileSync(kts, g.replace(/defaultConfig\s*\{/, (m) => `${m}\n        manifestPlaceholders["${n}"] = rootProject.file("local.properties").takeIf { it.exists() }?.readLines()?.firstOrNull { it.startsWith("${n}=") }?.substringAfter("=") ?: ""`))
      }
    } else if (fs.existsSync(groovy)) todo.push(`android/app/build.gradle (Groovy): add in defaultConfig: manifestPlaceholders += [${n}: (rootProject.file("local.properties").exists() ? rootProject.file("local.properties").readLines().find { it.startsWith("${n}=") }?.substring(${n.length + 1}) : null) ?: ""]`)
  }
  // iOS: Info.plist reads $(NAME), a build setting from git-ignored Secrets.xcconfig, included by Debug and Release
  for (const n of needIos) {
    map[n] = { ...map[n], ios: n }
    const plist = path.join(project, 'ios/Runner/Info.plist')
    if (fs.existsSync(plist)) { const pl = fs.readFileSync(plist, 'utf8'); if (!pl.includes(`<key>${n}</key>`)) { const at = pl.lastIndexOf('</dict>'); fs.writeFileSync(plist, `${pl.slice(0, at)}\t<key>${n}</key>\n\t<string>$(${n})</string>\n${pl.slice(at)}`) } }
    for (const x of ['Debug', 'Release']) {
      const xf = path.join(project, `ios/Flutter/${x}.xcconfig`)
      if (fs.existsSync(xf) && !fs.readFileSync(xf, 'utf8').includes('#include? "Secrets.xcconfig"')) fs.appendFileSync(xf, '\n#include? "Secrets.xcconfig"\n')
    }
  }
  if (needAndroid.size || needIos.size) { writeSecure(nativeFile(project), map); applyNative(project, project) }
  const out = done.length ? `moved: ${done.join('; ')} — values stored outside the project, not shown` : 'no key found outside its proper place'
  if (todo.length) throw new Error(`${out}\nNOT WIRED (${todo.length}) — the file now holds ‹NAME›, and scan fails until it reads the key properly:\n${todo.join('\n')}`)
  return out
}

// Same-length, in-place masking: the file keeps its size and inode, so a transcript that is still being appended to
// (the chat that started the run) stays valid and nothing written after this is lost.
function maskFile(f, vals) {
  let fd, n = 0
  try {
    const buf = fs.readFileSync(f)
    for (const [, v] of vals) {
      const needle = Buffer.from(v)
      for (let i = buf.indexOf(needle); i >= 0; i = buf.indexOf(needle, i + needle.length)) {
        fd ??= fs.openSync(f, 'r+')
        fs.writeSync(fd, Buffer.alloc(needle.length, '*'), 0, needle.length, i)
        n++
      }
    }
  } catch { /* unreadable: skipped */ } finally { if (fd !== undefined) fs.closeSync(fd) }
  return n
}
export function transcriptDirs(project) {
  const slug = (p) => p.replace(/[^A-Za-z0-9]/g, '-')
  const real = (() => { try { return fs.realpathSync(project) } catch { return project } })()
  // Claude Code's records: ~/.claude/projects/<slug>; its temp output: a claude* folder in the system temp folder
  // (macOS /private/tmp/claude-<uid>, Linux /tmp/claude-<uid>) — searched, not assumed, so Windows' temp folder counts too
  const temps = [...new Set(['/private/tmp', '/tmp', os.tmpdir()])].flatMap((t) => { try { return fs.readdirSync(t).filter((n) => n.startsWith('claude')).map((n) => path.join(t, n)) } catch { return [] } })
  const roots = [path.join(os.homedir(), '.claude', 'projects'), ...temps]
  const out = new Set()
  for (const r of roots) {
    let names = []
    try { names = fs.readdirSync(r) } catch { continue }
    for (const n of names) if ([slug(project), slug(real)].some((s) => n === s || n.startsWith(`${s}-`))) out.add(path.join(r, n))
  }
  return [...out]
}
// End of the run: the key leaves the coding agents' context — never the app. Every stored value (and Flutter's base64
// DART_DEFINES form) is masked in place, same length, in what the agents saw and wrote: this project's Claude Code
// transcripts and temp output (chat, agents, worktrees) and the run's .pipeline/ records. The app keeps working: the
// secrets file, android/local.properties, ios/Flutter/Secrets.xcconfig, Generated.xcconfig and every project file
// are left exactly as they are.
function forget(project) {
  const vals = needles(project), names = values(project).map(([n]) => n)
  if (!vals.length) return 'no stored keys — nothing to forget'
  const hits = []
  const sweep = (root, label) => { if (!fs.existsSync(root)) return; let n = 0, files = 0; for (const f of walk(root).map((x) => path.join(root, x))) { const k = maskFile(f, vals); if (k) { n += k; files++ } } if (n) hits.push(`${label}: ${n} in ${files} file(s)`) }
  sweep(path.join(project, '.pipeline'), '.pipeline')
  for (const d of transcriptDirs(project)) sweep(d, d)
  return `forgotten by the coding agents: ${names.length} key(s) (${names.join(', ')}) masked in ${hits.length ? hits.join('; ') : 'nothing — no agent record held one'}. Kept for the app, unchanged: the secrets file (builds read it with secret define), android/local.properties, ios/Flutter/Secrets.xcconfig and the project's files.`
}

export function secret([sub, ...a], stdin = () => fs.readFileSync(0, 'utf8')) {
  const project = projectOf()
  if (sub === 'set') return set(project, a[0], stdin())
  if (sub === 'names') { const v = values(project); return v.length ? v.map(([n, x]) => `${n} (${x.length} characters)`).join('\n') : 'no keys stored' }
  if (sub === 'define') return values(project).length ? `--dart-define-from-file=${secretsFile(project)}` : ''
  if (sub === 'native') return native(project, process.cwd(), a)
  if (sub === 'scan') return scan(project, a)
  if (sub === 'import') return importFile(project, a[0] || findPrd(project))
  if (sub === 'move') return move(project, a)
  if (sub === 'run') {
    // one command with every stored key in its environment ($NAME), e.g. the single real call L13 allows; output redacted
    if (!a.length) throw new Error("run '<command using $NAME>'")
    let out
    // the command is written for a POSIX shell ($NAME): bash on Windows (Git Bash, which Claude Code uses there)
    try { out = execSync(a.join(' '), { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, ...Object.fromEntries(values(project)) }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6, shell: process.platform === 'win32' ? 'bash' : '/bin/sh' }) }
    catch (e) { throw new Error(redact(`${e.stdout || ''}${e.stderr || ''}` || e.message, needles(project))) }
    return redact(out, needles(project))
  }
  if (sub === 'forget') return forget(project)
  throw new Error("secret set <NAME> | names | define | native [<NAME> android:<prop> ios:<VAR>] | import <file> | move [file ...] | run '<command using $NAME>' | scan [file ...] | forget")
}

function selftest() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sec-')))
  const proj = path.join(tmp, 'app'), cwd0 = process.cwd(), env0 = { ...process.env }
  fs.mkdirSync(path.join(proj, '.pipeline'), { recursive: true }); fs.mkdirSync(path.join(proj, 'lib'))
  process.env.APP_FACTORY_HOME = path.join(tmp, 'home'); delete process.env.PIPELINE_DIR
  process.chdir(proj)
  const tdir = path.join(os.homedir(), '.claude', 'projects', proj.replace(/[^A-Za-z0-9]/g, '-'))
  try {
    const KEY = 'AIzaSyD-test0123456789abcdefghijklmnopq'
    assert.equal(KEY.length, 39)
    assert.throws(() => secret(['set', 'maps'], () => KEY), /upper-case/)
    assert.throws(() => secret(['set', 'MAPS_API_KEY'], () => ''), /no key value/)
    const out = secret(['set', 'MAPS_API_KEY'], () => `${KEY}\n`)
    assert.ok(!out.includes(KEY) && /stored MAPS_API_KEY \(39 characters\)/.test(out), 'the value is never printed')
    assert.equal(fs.statSync(secretsFile(proj)).mode & 0o777, 0o600)
    assert.ok(!secretsFile(proj).startsWith(proj), 'the secrets file is outside the project')
    assert.equal(secret(['define']), `--dart-define-from-file=${secretsFile(proj)}`)
    assert.ok(!secret(['names']).includes(KEY))
    // a worktree checkout resolves to the same project
    process.chdir(tmp); fs.mkdirSync(`${proj}.worktrees/r1`, { recursive: true }); process.chdir(`${proj}.worktrees/r1`)
    assert.equal(secret(['define']), `--dart-define-from-file=${secretsFile(proj)}`)
    assert.match(secret(['native', 'MAPS_API_KEY', 'android:MAPS_API_KEY', 'ios:MAPS_API_KEY']), /written: MAPS_API_KEY → android\/local.properties/)
    assert.equal(fs.readFileSync(`${proj}.worktrees/r1/android/local.properties`, 'utf8'), `MAPS_API_KEY=${KEY}\n`)
    process.chdir(proj)
    assert.match(secret(['native']), /ios\/Flutter\/Secrets\.xcconfig/)
    fs.writeFileSync(path.join(proj, 'android/local.properties'), `sdk.dir=/x\nMAPS_API_KEY=${KEY}\n`)
    assert.match(fs.readFileSync(path.join(proj, '.gitignore'), 'utf8'), /android\/local\.properties\nios\/Flutter\/Secrets\.xcconfig/)
    // scan: the native files are where keys belong; anywhere else fails, with no value in the message
    fs.writeFileSync(path.join(proj, 'lib/api_keys.dart'), "static const mapsKey = String.fromEnvironment('MAPS_API_KEY');")
    assert.match(secret(['scan']), /no key in the project/)
    fs.writeFileSync(path.join(proj, '.pipeline/PROGRESS.md'), `applied ${KEY}\n`)
    fs.writeFileSync(path.join(proj, 'PRD.md'), 'Weather: openweather api_key = 9f8e7d6c5b4a39281706f5e4d3c2b1a0\n')
    assert.throws(() => secret(['scan']), (e) => /\.pipeline\/PROGRESS\.md:1: the value of MAPS_API_KEY/.test(e.message) && /PRD\.md:1: a key assignment/.test(e.message) && !e.message.includes(KEY))
    assert.throws(() => secret(['scan', path.join(proj, 'PRD.md')]), /PRD\.md:1/)
    assert.equal(redact(`url?key=${KEY}&x sk-ant-abcdefghijklmnopqrstuvwxyz`, values(proj)), 'url?key=‹MAPS_API_KEY›&x ‹OpenAI/Anthropic key›')
    // forget: masked in place (same size) in the agents' records only; the app's keys stay where they work
    fs.mkdirSync(tdir, { recursive: true })
    const tf = path.join(tdir, 's.jsonl'); fs.writeFileSync(tf, `{"m":"${KEY}"}\n`)
    const size = fs.statSync(path.join(proj, '.pipeline/PROGRESS.md')).size
    const app0 = ['android/local.properties', 'ios/Flutter/Secrets.xcconfig', 'lib/api_keys.dart', 'PRD.md'].map((f) => fs.readFileSync(path.join(proj, f), 'utf8'))
    const store0 = fs.readFileSync(secretsFile(proj), 'utf8')
    assert.match(secret(['forget']), /^forgotten by the coding agents: 1 key\(s\) \(MAPS_API_KEY\) masked in \.pipeline: 1 in 1 file\(s\); .*: 1 in 1 file\(s\)\. Kept for the app/)
    assert.equal(fs.readFileSync(path.join(proj, '.pipeline/PROGRESS.md'), 'utf8'), `applied ${'*'.repeat(39)}\n`)
    assert.equal(fs.statSync(path.join(proj, '.pipeline/PROGRESS.md')).size, size)
    assert.equal(fs.readFileSync(tf, 'utf8'), `{"m":"${'*'.repeat(39)}"}\n`, 'transcripts of this project are masked')
    assert.deepEqual(['android/local.properties', 'ios/Flutter/Secrets.xcconfig', 'lib/api_keys.dart', 'PRD.md'].map((f) => fs.readFileSync(path.join(proj, f), 'utf8')), app0, 'the app keeps its keys')
    assert.equal(fs.readFileSync(secretsFile(proj), 'utf8'), store0)
    assert.equal(secret(['define']), `--dart-define-from-file=${secretsFile(proj)}`, 'the app still builds with its keys')
    const reset = () => { fs.rmSync(secretsFile(proj), { force: true }); fs.rmSync(path.join(proj, 'android/local.properties'), { force: true }); fs.writeFileSync(path.join(proj, 'android/local.properties'), 'sdk.dir=/x\n'); fs.rmSync(path.join(proj, 'ios/Flutter/Secrets.xcconfig'), { force: true }) }
    reset()
    // import: keys written in PRD.md are stored under names from their lines; PRD.md stays as written, git-ignored,
    // skipped by scan, never touched by forget, and every read of it shows ‹NAME›
    const OW = '9f8e7d6c5b4a39281706f5e4d3c2b1a0', ST = 'sk_live_abcdefghijklmnop1234'
    const prd = `# App\n## Keys\n- Google Maps API key: ${KEY}\n- OpenWeather API key is ${OW}\n- **Stripe secret key**: ${ST}\n- Maps again: ${KEY}\n`
    fs.writeFileSync(path.join(proj, 'PRD.md'), prd)
    const im = secret(['import', 'PRD.md'])
    assert.match(im, /PRD\.md: 3 key\(s\) stored outside the project — GOOGLE_MAPS_API_KEY, OPEN_WEATHER_API_KEY, STRIPE_API_KEY \(new: GOOGLE_MAPS_API_KEY \(line 3\), OPEN_WEATHER_API_KEY \(line 4\), STRIPE_API_KEY \(line 5\)\)/)
    assert.ok(![KEY, OW, ST].some((v) => im.includes(v)), 'no value printed')
    assert.equal(secret(['define']), `--dart-define-from-file=${secretsFile(proj)}`)
    assert.deepEqual(JSON.parse(fs.readFileSync(secretsFile(proj), 'utf8')), { GOOGLE_MAPS_API_KEY: KEY, OPEN_WEATHER_API_KEY: OW, STRIPE_API_KEY: ST })
    assert.match(secret(['import', 'PRD.md']), /3 key\(s\)[^(]*;/, 'importing again adds nothing')
    assert.match(fs.readFileSync(path.join(proj, '.gitignore'), 'utf8'), /^PRD\.md$/m)
    assert.equal(redact(prd, values(proj)).split('\n').slice(2, 5).join('|'), '- Google Maps API key: ‹GOOGLE_MAPS_API_KEY›|- OpenWeather API key is ‹OPEN_WEATHER_API_KEY›|- **Stripe secret key**: ‹STRIPE_API_KEY›')
    fs.writeFileSync(path.join(proj, '.pipeline/PROGRESS.md'), 'ok\n')
    assert.match(secret(['scan']), /not scanned: PRD\.md — the user's own file/)
    fs.writeFileSync(path.join(proj, 'lib/oops.dart'), `const k = '${OW}';`)
    assert.throws(() => secret(['scan']), /lib\/oops\.dart:1: the value of OPEN_WEATHER_API_KEY/)
    secret(['forget'])
    assert.equal(fs.readFileSync(path.join(proj, 'PRD.md'), 'utf8'), prd, 'the user\'s PRD is never masked')
    assert.equal(fs.readFileSync(path.join(proj, 'lib/oops.dart'), 'utf8'), `const k = '${OW}';`, 'forget never edits the app (the gate\'s move fixes a key in code)')
    reset()
    assert.equal(nameFor('', 'GOOGLE'), 'GOOGLE_API_KEY')
    // the PRD under another name is found, and imported with no argument
    fs.renameSync(path.join(proj, 'PRD.md'), path.join(proj, 'street view - PRD.md'))
    assert.equal(findPrd(proj), 'street view - PRD.md')
    assert.match(secret(['import']), /^street view - PRD\.md: 3 key\(s\)/)
    fs.writeFileSync(path.join(proj, 'old PRD.md'), 'x')
    assert.throws(() => findPrd(proj), /several PRD files: old PRD\.md, street view - PRD\.md/)
    fs.rmSync(path.join(proj, 'old PRD.md')); fs.renameSync(path.join(proj, 'street view - PRD.md'), path.join(proj, 'PRD.md'))
    reset()
    // the DART_DEFINES form: allowed in Flutter's generated build file, caught anywhere else, redacted, masked at the end
    secret(['set', 'MAPS_API_KEY'], () => KEY)
    const b64 = Buffer.from(`MAPS_API_KEY=${KEY}`).toString('base64')
    fs.mkdirSync(path.join(proj, 'ios/Flutter'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'ios/Flutter/Generated.xcconfig'), `FLUTTER_ROOT=/x\nDART_DEFINES=${b64}\n`)
    fs.rmSync(path.join(proj, 'lib/oops.dart')); fs.rmSync(path.join(proj, 'PRD.md'))
    assert.match(secret(['scan']), /no key in the project/)
    fs.writeFileSync(path.join(proj, '.pipeline/PROGRESS.md'), `DART_DEFINES=${b64}\n`)
    assert.throws(() => secret(['scan']), /\.pipeline\/PROGRESS\.md:1: the value of MAPS_API_KEY/)
    assert.equal(redact(`DART_DEFINES=${b64}`, needles(proj)), 'DART_DEFINES=‹MAPS_API_KEY›')
    const ran = secret(['run', 'printf "%s|%s" "$MAPS_API_KEY" "${#MAPS_API_KEY}"'])
    assert.equal(ran, '‹MAPS_API_KEY›|39', 'the command gets the key; its output never shows it')
    assert.match(secret(['forget']), /forgotten by the coding agents: 1 key\(s\) \(MAPS_API_KEY\) masked in \.pipeline: 1 in 1 file/)
    assert.equal(fs.readFileSync(path.join(proj, '.pipeline/PROGRESS.md'), 'utf8'), `DART_DEFINES=${'*'.repeat(b64.length)}\n`, 'the base64 form is masked in agent records')
    assert.equal(fs.readFileSync(path.join(proj, 'ios/Flutter/Generated.xcconfig'), 'utf8'), `FLUTTER_ROOT=/x\nDART_DEFINES=${b64}\n`, 'Flutter\'s build settings keep the key')
    // move: keys found while coding go to their proper place, file by file
    fs.writeFileSync(path.join(proj, 'pubspec.yaml'), 'name: invoice_maker\n')
    fs.writeFileSync(path.join(proj, 'lib/map_view.dart'), `import 'package:flutter/material.dart';\n\nconst mapsApiKey = '${KEY}';\nfinal url = 'https://maps.googleapis.com/x?key=${KEY}&q=1';\nconst copied = '‹MAPS_API_KEY›';\n`)
    fs.mkdirSync(path.join(proj, 'android/app/src/main'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'android/app/src/main/AndroidManifest.xml'), `<application>\n<meta-data android:name="com.google.android.geo.API_KEY" android:value="${KEY}"/>\n</application>\n`)
    fs.writeFileSync(path.join(proj, 'android/app/build.gradle.kts'), 'android {\n    defaultConfig {\n        minSdk = 24\n    }\n}\n')
    fs.mkdirSync(path.join(proj, 'ios/Runner'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'ios/Runner/AppDelegate.swift'), `GMSServices.provideAPIKey("${KEY}")\n`)
    fs.writeFileSync(path.join(proj, 'ios/Runner/Info.plist'), '<plist><dict>\n\t<key>CFBundleName</key>\n\t<string>x</string>\n</dict></plist>\n')
    for (const x of ['Debug', 'Release']) fs.writeFileSync(path.join(proj, `ios/Flutter/${x}.xcconfig`), '#include "Generated.xcconfig"\n')
    fs.writeFileSync(path.join(proj, 'README.md'), `Key: ${KEY}\n`)
    fs.writeFileSync(path.join(proj, 'android/app/google-services.json'), `{"api_key":[{"current_key":"AIzaFirebase0123456789abcdefghijklmnopq"}]}`)
    fs.writeFileSync(path.join(proj, '.pipeline/PROGRESS.md'), 'ok\n')
    // the key was never stored: move finds it, names it from its line, stores it
    reset()
    const mv = secret(['move'])
    assert.match(mv, /^moved: .*lib\/map_view\.dart \(MAPS_API_KEY\)/)
    assert.ok(!mv.includes(KEY))
    assert.deepEqual(values(proj).map(([n]) => n), ['MAPS_API_KEY'])
    assert.equal(fs.readFileSync(path.join(proj, 'lib/map_view.dart'), 'utf8'), "import 'package:flutter/material.dart';\nimport 'package:invoice_maker/config/api_keys.dart';\n\nconst mapsApiKey = ApiKeys.mapsApiKey;\nfinal url = 'https://maps.googleapis.com/x?key=${ApiKeys.mapsApiKey}&q=1';\nconst copied = ApiKeys.mapsApiKey;\n")
    assert.match(fs.readFileSync(path.join(proj, 'lib/config/api_keys.dart'), 'utf8'), /abstract final class ApiKeys \{\n  static const mapsApiKey = String\.fromEnvironment\('MAPS_API_KEY'\);\n  static bool get hasMapsApiKey => mapsApiKey\.isNotEmpty;\n\}/)
    assert.match(fs.readFileSync(path.join(proj, 'android/app/src/main/AndroidManifest.xml'), 'utf8'), /android:value="\$\{MAPS_API_KEY\}"/)
    assert.match(fs.readFileSync(path.join(proj, 'android/app/build.gradle.kts'), 'utf8'), /defaultConfig \{\n        manifestPlaceholders\["MAPS_API_KEY"\] = rootProject\.file\("local\.properties"\)/)
    assert.equal(fs.readFileSync(path.join(proj, 'android/local.properties'), 'utf8'), `sdk.dir=/x\nMAPS_API_KEY=${KEY}\n`)
    assert.equal(fs.readFileSync(path.join(proj, 'ios/Runner/AppDelegate.swift'), 'utf8'), 'GMSServices.provideAPIKey((Bundle.main.object(forInfoDictionaryKey: "MAPS_API_KEY") as? String ?? ""))\n')
    assert.match(fs.readFileSync(path.join(proj, 'ios/Runner/Info.plist'), 'utf8'), /<key>MAPS_API_KEY<\/key>\n\t<string>\$\(MAPS_API_KEY\)<\/string>\n<\/dict>/)
    assert.equal(fs.readFileSync(path.join(proj, 'ios/Flutter/Secrets.xcconfig'), 'utf8'), `MAPS_API_KEY=${KEY}\n`)
    assert.match(fs.readFileSync(path.join(proj, 'ios/Flutter/Release.xcconfig'), 'utf8'), /#include\? "Secrets\.xcconfig"/)
    assert.equal(fs.readFileSync(path.join(proj, 'README.md'), 'utf8'), 'Key: ‹MAPS_API_KEY›\n')
    assert.match(fs.readFileSync(path.join(proj, 'android/app/google-services.json'), 'utf8'), /AIzaFirebase/, 'Firebase config is its key\'s proper place')
    assert.match(secret(['scan']), /no key in the project/)
    assert.equal(secret(['move']), 'no key found outside its proper place', 'running it again changes nothing')
    // a file type it cannot rewire: the value is replaced by ‹NAME›, the command fails, and scan keeps failing until wired
    fs.writeFileSync(path.join(proj, 'assets/config.json'.replace('assets/', 'lib/')), `{"maps":"${KEY}"}`)
    assert.throws(() => secret(['move']), (e) => /NOT WIRED \(1\)[\s\S]*lib\/config\.json: MAPS_API_KEY/.test(e.message) && !e.message.includes(KEY))
    assert.throws(() => secret(['scan']), /lib\/config\.json:1: the placeholder ‹MAPS_API_KEY› — run secret move/)
    fs.rmSync(path.join(proj, 'lib/config.json'))
    // an api_keys.dart the builders wrote with their own class and constant names: move uses them, adds nothing
    fs.writeFileSync(path.join(proj, 'lib/config/api_keys.dart'), "abstract final class Keys {\n  static const String maps = String.fromEnvironment('MAPS_API_KEY');\n}\n")
    fs.writeFileSync(path.join(proj, 'lib/tiles.dart'), `import 'package:invoice_maker/config/api_keys.dart';\nconst k = "${KEY}";\n`)
    secret(['move'])
    assert.equal(fs.readFileSync(path.join(proj, 'lib/tiles.dart'), 'utf8'), "import 'package:invoice_maker/config/api_keys.dart';\nconst k = Keys.maps;\n")
    assert.equal(fs.readFileSync(path.join(proj, 'lib/config/api_keys.dart'), 'utf8'), "abstract final class Keys {\n  static const String maps = String.fromEnvironment('MAPS_API_KEY');\n}\n")
    // Firebase config in a flavor folder is left alone
    fs.mkdirSync(path.join(proj, 'android/app/src/prod'), { recursive: true })
    fs.writeFileSync(path.join(proj, 'android/app/src/prod/google-services.json'), '{"current_key":"AIzaFirebase0123456789abcdefghijklmnopq"}')
    assert.equal(secret(['move']), 'no key found outside its proper place')
    assert.match(secret(['scan']), /no key in the project/)
  } finally { process.chdir(cwd0); process.env = env0; fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(tdir, { recursive: true, force: true }) }
  return 'selftest ok'
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try { const a = process.argv.slice(2); console.log(a[0] === 'selftest' ? selftest() : secret(a)) } catch (e) { console.error(`secrets: ${e.message}`); process.exit(1) }
}
