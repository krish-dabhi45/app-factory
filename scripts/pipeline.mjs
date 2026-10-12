#!/usr/bin/env node
// The .pipeline/ state layer: the only writer of .pipeline/state.json.
// Agents call it; nothing else edits the file. Run from the project directory.
//   prd                    — the project's PRD file: PRD.md, else the one *PRD*.md in the folder (an error if none or several)
//   init [prdPath] | feature <id> <failing|passing|blocked> [title or, for blocked, the reason...]
//   finding pending <Xn> <test name...> — fixed, but only a device test can prove it: still blocking, out of the fixers' inbox
//   finding block <Xn> <reason...> — the cause is outside the code (a key/API/account not provided, or the platform has no API): not blocking
//   finding add <featureId> <critical|major|minor> [@logic|@ui|@shared] <text...>
//   finding resolve <Xn> [note...] | finding route <Xn> <logic|ui|shared>
//   handoff <phase> <text...> | brief [phase] [logic|ui|shared ...] | status | selftest
//   group <name> <ACn...>  — a feature group (built and audited together)
//   coverage [group] [--root <dir>] — fails unless every criterion that is not blocked has a test named after it
//   affected <baseRef> [--root <dir>] — criteria whose code changed since baseRef (from the groups' commits) → the tests to re-run
//   affected --platform ios|android [--root <dir>] — the same, per platform, since that platform's last run (its newest
//                           "qa rN <platform> …" commit): fixes by their finding ids, test files the other platform changed,
//                           this platform's native code / pubspec / main.dart (everything), and its open or pending findings
//   shard <n> [--root <dir>]  — splits integration_test/*_test.dart across n runners by size (one JSON list per runner)
//   assets [--root <dir>]     — app icon on every platform (exact sizes, opaque on iOS, not Flutter's default, Android adaptive icon)
//                               and no @2x/@3x file loaded directly in lib/ (it would draw 2–3× too big)
//   reference <slug> <image> <W>x<H> [--mask x,y,w,h ...] [state...] — a screen's design reference (Figma frame or PRD mockup)
//   design-device <W> <H>     — the simulator type whose screen is exactly W×H points (iOS runtime installed here)
//   design-result <slug> <regions> <defects> [note...] — one comparison of the app's screen with its reference
//   components <slug> <components.json>        — a screen's component inventory (design-components.mjs extract, or listed from a PRD mockup)
//   component-results <slug> <results.json>    — per component: present (evidence) | missing (its DESIGN finding id) | excluded (the CONTRACT line)
//   stale <log> [--minutes 10] [--device <udid|serial> --platform ios|android --app <bundle id|applicationId> --sdk <dir>]
//                         — a device test run's log (flutter test -r expanded): finished, running, or stalled (no new
//                           line for --minutes, the app process gone, or the device down), with the test and file it was on
//   app-restart <udid|serial> --platform ios|android --app <id> [--sdk <dir>]
//                         — the stuck run's first fix: stops the flutter test processes for that device and the app
//   device-reset <udid|serial> --platform ios|android [--app <id>] [--sdk <dir>]
//                         — the second fix, only for the plugin's own devices (app-factory-*, af-*): shut down (frees its
//                           memory), wipe its data (simctl erase / emulator -wipe-data), boot again; prints the device
//   layout-lint [--root <dir>] — lib/ui/ sizes that cannot fit every phone (build skill U15), unless marked // layout-ok: <why>
//   design-check              — fails unless every referenced screen was compared, every one of its components checked and
//                               present (or excluded by the contract), and no DESIGN finding is open
//   decisions [--questions <json file>] [--answers <json file>] [--root <dir>]
//                         — records the contract's questions (asked or not) and the chat's answers in .pipeline/, then writes
//                           DECISIONS.md: per question its options, the one selected and by whom
//   stray [--root <dir>]      — fails if a file was added since the baseline commit outside the app-factory allowlist
//   report <lessons|size|cleanup|run> <text...> — a section of PROGRESS.md (no separate files)
//   timing start <stage> | timing pause <reason> | timing end [note] | timing
//                         — the run's timeline: started, paused for the user's questions, resumed, interrupted, ended; per-phase spans
//   devices claim <project> | devices release <project> | devices status
//                         — one machine-wide lock on the shared test devices (simulators and emulators), so only one project's run uses them at a time
//   colors [--root <dir>] — fails if lib/ uses a colour that is not in design/colors.json (the imported Figma palette)
//   deps [--root <dir>]   — Flutter: every package in pubspec.yaml and the files that use it; fails if one is unused
//   scope <baseRef>[..<branch>] <glob...> — fails if any file changed since baseRef (in the checkout, or on branch) is outside the globs
//   stop <project> [--run <workflow run id>] [--sdk <android sdk>] — the user stopped the run in the middle: records it in the
//                           timing, stops the plugin's devices (not deleted), releases the device and run locks; keeps all work
//   resume <project>       — before relaunching a stopped run: takes the run lock (and the devices, if it had them) again
//   cleanup <project> [--done] [--devices --sdk <android sdk> --java <java home>]
//                         — at the end of a run: deletes the run's leftovers (test worktrees, build output and caches, probe
//                           copies, backup files; with --done also the screenshots and qa-r* branches) and, with --devices,
//                           this Mac's app-factory-* simulators and af-* emulators — only while this project holds the device
//                           lock. Keeps the app's source, tests, contract, design and .pipeline state. Its report is the Cleanup section of PROGRESS.md
//   secret set|names|define|native|import|move|run|scan|forget — API keys outside the project, never printed (scripts/secrets.mjs;
//                         cleanup runs forget: the keys leave the agents' context, the app keeps them)
//   log <phase> <text...>  — a live activity line (what an agent is doing / a result)
//   Every write also rewrites .pipeline/PROGRESS.md, a human-readable view to keep open in the editor.
//   claim | release        — one pipeline run per project at a time
//   sim <udid>             — the simulator this run uses (shown in every brief)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execSync, execFileSync, spawnSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { secret, findPrd } from './secrets.mjs'
import { find as findTools } from './configure.mjs'

const dir = () => path.resolve(process.env.PIPELINE_DIR || '.pipeline')
const file = () => path.join(dir(), 'state.json')
const load = () => {
  if (!fs.existsSync(file())) throw new Error(`no ${file()} — run: init <prdPath>`)
  return JSON.parse(fs.readFileSync(file(), 'utf8'))
}
const save = (s) => {
  const tmp = `${file()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2))
  fs.renameSync(tmp, file())
  fs.writeFileSync(path.join(dir(), 'PROGRESS.md'), progress(s))
}
const now = () => process.env.PIPELINE_NOW || new Date().toISOString() // PIPELINE_NOW: fixed clock for the self-test
const mins = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / 60000)
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`)

// The run's timeline. A call that starts while a run is open is the same run continuing (the design import then the
// contract step, or the build call after the questions); after a pause it is a resume. If nothing was logged for
// INTERRUPT_MIN minutes, the earlier call died — that gap is recorded as an interruption, not as working time.
// ponytail: a gap threshold, not a run id — workflow scripts cannot read the clock or make ids; raise it if one step can be silent longer.
const INTERRUPT_MIN = 30
function lastActivity(s) {
  return [...(s.timing || []).map((t) => t.at), ...Object.values(s.spans || {}).map((x) => x.last)].sort().pop()
}
function timingSummary(s) {
  let start = null, end = null, paused = 0, stopped = 0, byUser = 0, pauseAt = null, stopAt = null
  const lines = []
  for (const t of s.timing || []) {
    if (t.event === 'start') { start ||= t.at; lines.push(`- ${t.at.slice(0, 16).replace('T', ' ')} started (${t.note})`) }
    if (t.event === 'pause') { pauseAt = t.at; lines.push(`- ${t.at.slice(0, 16).replace('T', ' ')} paused: ${t.note}`) }
    if (t.event === 'stop') { stopAt = t.at; lines.push(`- ${t.at.slice(0, 16).replace('T', ' ')} stopped ${t.note}`) }
    if (t.event === 'resume' && stopAt) { const m = mins(stopAt, t.at); byUser += m; stopAt = null; lines.push(`- ${t.at.slice(0, 16).replace('T', ' ')} resumed (${t.note}) after being stopped for ${dur(m)}`) }
    else if (t.event === 'resume') { const m = pauseAt ? mins(pauseAt, t.at) : 0; paused += m; pauseAt = null; lines.push(`- ${t.at.slice(0, 16).replace('T', ' ')} resumed (${t.note}) after ${dur(m)}`) }
    if (t.event === 'interrupted') { stopped += t.minutes; lines.push(`- ${t.at.slice(0, 16).replace('T', ' ')} restarted after an interruption of ${dur(t.minutes)} (no activity since ${t.since.slice(11, 16)})`) }
    if (t.event === 'end') { end = t.at; lines.push(`- ${t.at.slice(0, 16).replace('T', ' ')} ended${t.note ? ` (${t.note})` : ''}`) }
  }
  if (!start) return { text: 'not started', lines: [] }
  const until = end || pauseAt || stopAt || now()
  const elapsed = mins(start, until)
  const active = elapsed - paused - stopped - byUser
  const state = end ? 'ended' : stopAt ? 'stopped by the user' : pauseAt ? 'paused' : 'running'
  return { text: `${state} · elapsed ${dur(elapsed)} · working ${dur(active)} · paused for questions ${dur(paused)}${byUser ? ` · stopped by the user ${dur(byUser)}` : ''}${stopped ? ` · interrupted ${dur(stopped)}` : ''}`, lines }
}
const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// The human view: rewritten on every write, so an open editor tab shows the run as it happens.
function progress(s) {
  const passing = s.features.filter((f) => f.status === 'passing').length
  const open = s.findings.filter((f) => f.status === 'open')
  const shotDir = path.join(dir(), 'screenshots')
  const shots = fs.existsSync(shotDir) ? fs.readdirSync(shotDir).filter((f) => f.endsWith('.png')).sort().slice(-6) : []
  return [
    '# Pipeline progress',
    `Updated ${hhmm(now())} — this file is rewritten on every pipeline step. Simulator: ${s.sim || 'not set'}. Lock: ${fs.existsSync(lock()) ? 'run active' : 'free'}.`,
    '',
    `## Timing — ${timingSummary(s).text}`,
    ...timingSummary(s).lines,
    ...(s.spans && Object.keys(s.spans).length
      ? ['', '| Phase | First activity | Last activity | Time spent |', '|---|---|---|---|', ...Object.entries(s.spans).sort((x, y) => x[1].first.localeCompare(y[1].first)).map(([k, v]) => `| ${k} | ${hhmm(v.first)} | ${hhmm(v.last)} | ${dur(v.busy || 0)} |`),
        '', 'Time spent = from each activity line of that phase to the next line of any phase (gaps over 30 min are interruptions, not counted). Test rounds reuse the same phase names, so first and last activity span several rounds; the time-spent column does not, and it adds up to the working time.']
      : []),
    '',
    `## Activity (newest first)`,
    ...(s.log || []).slice(-20).reverse().map((l) => `- ${hhmm(l.at)} **${l.phase}** — ${cap(l.text, 300)}`),
    '',
    `## Acceptance criteria: ${passing}/${s.features.length} passing${s.features.some((f) => f.status === 'blocked') ? `, ${s.features.filter((f) => f.status === 'blocked').length} blocked` : ''}`,
    ...s.features.map((f) => `- ${f.status === 'passing' ? '✅' : f.status === 'blocked' ? '🚫' : '❌'} ${f.id} ${f.title}${f.blocked ? ` — BLOCKED: ${f.blocked}` : ''}`),
    '',
    `## Open findings (${open.length})`,
    ...open.map((f) => `- ${f.id} [${f.severity}]${f.owner ? ` @${f.owner}` : ''} (${f.feature}) ${cap(f.text, 400)}`),
    '',
    ...(s.references && Object.keys(s.references).length ? [`## Design comparison (${Object.keys(s.design || {}).length}/${Object.keys(s.references).length} screens)`, '| Screen | Reference | Compared | Regions | Defects | Components present |', '|---|---|---|---|---|---|',
      ...Object.entries(s.references).map(([k, r]) => { const d = s.design?.[k], l = s.components?.[k]; return `| ${k} | ${r.image} (${r.w}×${r.h}) | ${d ? hhmm(d.at) : '—'} | ${d ? d.regions : ''} | ${d ? d.defects : ''} | ${l ? `${l.filter((c) => ['present', 'excluded'].includes(c.status)).length}/${l.length}${l.some((c) => c.status === 'missing') ? ' (missing!)' : ''}` : '—'} |` }), ''] : []),
    ...(s.findings.some((f) => f.status === 'blocked') ? ['## Blocked findings (cause outside the code — for you)', ...s.findings.filter((f) => f.status === 'blocked').map((f) => `- ${f.id} (${f.feature}) ${cap(f.text, 300)} — ${cap(f.note || '', 300)}`), ''] : []),
    ...Object.entries(s.reports || {}).flatMap(([k, r]) => [`## ${{ lessons: 'Lessons (proposed rules — you decide)', size: 'App size', cleanup: 'Cleanup', run: 'Run report (measured from the agents\' transcripts)' }[k]} — ${hhmm(r.at)}`, r.text, '']),
    '## Handoffs (newest first)',
    ...s.handoffs.slice(-8).reverse().map((h) => `- ${hhmm(h.at)} **${h.phase}** — ${cap(h.text, 400)}`),
    '',
    '## Latest screenshots',
    ...shots.map((f) => `![${f}](screenshots/${f})`),
    '',
  ].join('\n')
}
const cap = (t, n = 2000) => (t.length > n ? `${t.slice(0, n)}… [truncated]` : t)

const lock = () => path.join(dir(), 'RUN.lock')
const OWNERS = ['logic', 'ui', 'shared']

// The test devices (simulators, emulators) are shared by every project on this Mac, so they are locked machine-wide.
// ponytail: no expiry — a run that dies keeps the lock; `devices status` names the holder, and deleting the file frees it.
const deviceLock = () => path.join(process.env.APP_FACTORY_HOME || path.join(os.homedir(), '.app-factory'), 'devices.lock')
function devices([sub, project]) {
  const f = deviceLock()
  const holder = () => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null)
  if (sub === 'status') { const h = holder(); return h ? `in use by ${h.project} since ${h.since}` : 'free' }
  if (!['claim', 'release'].includes(sub) || !project) throw new Error('devices claim <project> | devices release <project> | devices status')
  const me = path.resolve(project)
  if (sub === 'claim') {
    fs.mkdirSync(path.dirname(f), { recursive: true })
    try {
      fs.writeFileSync(f, JSON.stringify({ project: me, since: now() }), { flag: 'wx' })
      return `devices claimed for ${me}`
    } catch {
      const h = holder()
      if (h && h.project === me) return `devices already held by ${me}`
      throw new Error(`the shared test devices are in use by ${h ? h.project : '?'} since ${h ? h.since : '?'} — wait for that run to finish, or delete ${f} if it is dead`)
    }
  }
  const h = holder()
  if (h && h.project !== me) throw new Error(`devices are held by ${h.project}, not ${me} — not released`)
  fs.rmSync(f, { force: true })
  return `devices released by ${me}`
}

const shell = (c, env = {}) => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } }) } catch { return '' } }
// git without a shell — the same on macOS, Linux and Windows (cmd.exe would keep quotes literally)
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256e6 }).split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean)
const gitQuiet = (root, ...args) => { try { return git(root, ...args) } catch { return [] } }
const MAC = process.platform === 'darwin'
const run1 = (cmd, args, opts = {}) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }) } catch { return '' } }
// Android SDK tools: emulator and adb are .exe on Windows (found without the extension), avdmanager is a .bat
const sdkTool = (sdk, t) => path.join(sdk, ...{ adb: ['platform-tools', 'adb'], emulator: ['emulator', 'emulator'], avdmanager: ['cmdline-tools', 'latest', 'bin', process.platform === 'win32' ? 'avdmanager.bat' : 'avdmanager'] }[t])
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
// Disk usage in KB, without du (Windows has none)
const sizeKb = (p) => { let t = 0; const go = (q) => { let st; try { st = fs.lstatSync(q) } catch { return } if (st.isDirectory()) { for (const e of fs.readdirSync(q)) go(path.join(q, e)) } else t += st.size }; go(p); return Math.round(t / 1024) }
// Glob → match, for the patterns the pipeline uses (**, *, ?, literal paths); path.matchesGlob needs a newer Node
export const globMatch = (f, g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?' ).replace(/\(\?:\.\*\/\)\?$/, '.*')}$`).test(f)

// Stops the plugin's own devices — booted app-factory-* simulators and running af-* emulators — to free memory.
// Deletes nothing; never touches another simulator or emulator. Returns what it stopped.
function stopDevices(sdk) {
  const out = []
  if (process.env.APP_FACTORY_NO_DEVICES === '1') return out // self-test: never touch this Mac's devices
  if (MAC) { // iOS simulators exist only on macOS
    const booted = JSON.parse(run1('xcrun', ['simctl', 'list', '--json', 'devices', 'booted']) || '{"devices":{}}').devices
    for (const d of Object.values(booted).flat().filter((d) => d.name.startsWith('app-factory-'))) { run1('xcrun', ['simctl', 'shutdown', d.udid]); out.push(`simulator ${d.name} shut down`) }
  }
  if (sdk && fs.existsSync(sdk)) {
    const adb = sdkTool(sdk, 'adb')
    const mine = run1(adb, ['devices']).split('\n').map((l) => l.split('\t')[0].trim()).filter((x) => /^emulator-\d+$/.test(x))
      .map((x) => [x, run1(adb, ['-s', x, 'emu', 'avd', 'name']).split(/\r?\n/)[0].trim()]).filter(([, n]) => n.startsWith('af-'))
    for (const [x, n] of mine) { run1(adb, ['-s', x, 'emu', 'kill']); out.push(`emulator ${n} stopped`) }
    for (let i = 0; i < 30 && mine.some(([x]) => run1(adb, ['devices']).includes(x)); i++) sleepMs(1000) // wait until they have exited
  }
  return out
}

// The user stopped the run in the middle. Claude Code stops the workflow itself (TaskStop, or /workflows → x) and
// signals its agents' processes; this frees what the run held so nothing waits on a dead run — the device lock, the
// run lock, the plugin's devices (shut down, not deleted) — and keeps everything a relaunch needs.
function stopRun(a) {
  const project = path.resolve(a[0] || '.')
  const opt = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null }
  const s = load()
  const f = deviceLock(), h = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
  const heldDevices = Boolean(h && path.resolve(h.project) === project)
  const lines = []
  if (heldDevices) { lines.push(...stopDevices(opt('--sdk') || findTools().androidSdk)); fs.rmSync(f, { force: true }); lines.push('device lock released') }
  else lines.push(h ? `devices left alone — they are held by ${h.project}` : 'devices were not held by this run')
  const last = (s.timing || []).at(-1)
  if (last && !['end', 'stop'].includes(last.event)) { s.timing.push({ event: 'stop', at: now(), note: 'by the user' }); lines.push('timing: stopped') }
  s.stopped = { at: now(), run: opt('--run') || null, heldDevices }
  save(s)
  fs.rmSync(lock(), { force: true }); lines.push('run lock released')
  return `stopped ${project}\n${lines.map((l) => `- ${l}`).join('\n')}\nKept for a relaunch: the code and its git history, .pipeline state, test worktrees and branches, screenshots, the devices themselves.`
}

// Undoes stopRun before the workflow is relaunched: takes the run lock and (if the run had them) the devices again.
function resumeRun(a) {
  const project = path.resolve(a[0] || '.')
  const s = load()
  if (!s.stopped) throw new Error('this run was not stopped with `stop` — nothing to resume')
  if (fs.existsSync(lock())) throw new Error(`another run holds ${lock()} — it is not stopped`)
  fs.writeFileSync(lock(), now(), { flag: 'wx' })
  if (s.stopped.heldDevices) { try { devices(['claim', project]) } catch (e) { fs.rmSync(lock(), { force: true }); throw e } }
  const run0 = s.stopped.run, held = s.stopped.heldDevices
  delete s.stopped
  ;(s.timing ||= []).push({ event: 'resume', at: now(), note: 'after a stop' })
  save(s)
  return `resumed: run lock taken${held ? ', devices claimed' : ''}${run0 ? `; relaunch workflow run ${run0}` : ''}`
}

// End-of-run cleanup. Deletes only what this list names; everything else stays.
function cleanup(a) {
  const project = path.resolve(a[0] || '.')
  const real = fs.realpathSync(project)
  const opt = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null }
  const g = (...args) => gitQuiet(project, ...args)
  const kb = (p) => (p && fs.existsSync(p) ? sizeKb(p) : 0)
  const gone = [], kept = []
  // 0. API keys: the run is over — the keys leave the coding agents' context (transcripts, temp output, .pipeline/); the app keeps them.
  const keys = (() => { const env = process.env.PIPELINE_DIR; process.env.PIPELINE_DIR = path.join(project, '.pipeline'); try { return secret(['forget']) } catch (e) { return `keys: ${e.message}` } finally { if (env === undefined) delete process.env.PIPELINE_DIR; else process.env.PIPELINE_DIR = env } })()
  const rm = (p, why) => { if (!fs.existsSync(p)) return; const k = kb(p); fs.rmSync(p, { recursive: true, force: true }); gone.push([path.relative(project, p) || p, k, why]) }

  // 1. Test worktrees (<project>.worktrees/<key>) and, when the run is done, their qa-r* branches.
  const fwd = (x) => x.replace(/\\/g, '/') // git prints forward slashes on every OS
  for (const w of g('worktree', 'list', '--porcelain').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9)))
    if (fwd(w).startsWith(`${fwd(real)}.worktrees/`) || fwd(w).startsWith(`${fwd(project)}.worktrees/`)) { const k = kb(w); g('worktree', 'remove', '--force', w); fs.rmSync(w, { recursive: true, force: true }); gone.push([w, k, 'test worktree']) }
  g('worktree', 'prune')
  rm(`${project}.worktrees`, 'test worktree folder')
  if (a.includes('--done'))
    for (const b of g('branch', '--list', 'qa-r*').map((l) => l.replace(/^[*+ ]+/, '').trim()).filter(Boolean)) { g('branch', '-D', b); gone.push([`branch ${b}`, 0, 'test branch (merged, or its change filed as a finding)']) }
  else kept.push('qa-r* branches and .pipeline/screenshots — the run is not done; open findings point at them')

  // 2. Build output and caches: the next flutter / xcodebuild / gradle command makes them again.
  for (const d of ['build', '.dart_tool', 'coverage', 'ios/build', 'ios/Pods', 'android/.gradle', 'android/app/build', 'android/build']) rm(path.join(project, d), 'build output or cache — recreated by the next build')

  // 3. Pipeline leftovers.
  rm(path.join(project, '.pipeline/probe-backup'), 'break-it probe copies')
  rm(path.join(project, '.pipeline/tool-output'), 'command outputs the firewall cut (already counted in the run report)')
  if (a.includes('--done')) rm(path.join(project, '.pipeline/screenshots'), 'tester screenshots (run done, no open finding)')

  // 4. Untracked files: backup and temp files go; anything else is listed, not deleted.
  for (const f of g('ls-files', '--others', '--exclude-standard'))
    if (/(\.(bak|orig|rej|tmp|swp)|~)$/.test(f)) rm(path.join(project, f), 'backup or temp file')
    else kept.push(`${f} — untracked and not a known leftover: check it`)

  // 5. Devices: only the plugin's own (app-factory-*, af-*), only while this project holds the device lock.
  if (a.includes('--devices')) {
    const f = deviceLock(), h = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null
    if (!h || path.resolve(h.project) !== project) kept.push(`devices — the device lock is ${h ? `held by ${h.project}` : 'free'}, not by this project; none deleted`)
    else {
      const sdk = opt('--sdk') || findTools().androidSdk, java = opt('--java') || findTools().javaHome
      stopDevices(sdk)
      const sims = MAC ? JSON.parse(run1('xcrun', ['simctl', 'list', 'devices', '--json']) || '{"devices":{}}').devices : {}
      for (const d of Object.values(sims).flat().filter((d) => d.name.startsWith('app-factory-'))) {
        const k = kb(d.dataPath && path.dirname(d.dataPath))
        run1('xcrun', ['simctl', 'delete', d.udid])
        const still = run1('xcrun', ['simctl', 'list', 'devices']).includes(d.udid)
        ;(still ? kept : gone).push(still ? `simulator ${d.name} — delete failed` : [`simulator ${d.name}`, k, 'plugin test device'])
      }
      if (sdk && fs.existsSync(sdk)) {
        const home = path.join(os.homedir(), '.android', 'avd')
        for (const n of run1(sdkTool(sdk, 'emulator'), ['-list-avds']).split('\n').map((l) => l.trim()).filter((l) => l.startsWith('af-'))) {
          const k = kb(path.join(home, `${n}.avd`))
          // a .bat needs a shell on Windows (Node refuses to start one without it)
          run1(sdkTool(sdk, 'avdmanager'), ['delete', 'avd', '-n', n], { input: '\n', stdio: ['pipe', 'pipe', 'ignore'], shell: process.platform === 'win32', env: { ...process.env, ...(java ? { JAVA_HOME: java } : {}) } })
          const still = fs.existsSync(path.join(home, `${n}.avd`))
          ;(still ? kept : gone).push(still ? `emulator ${n} — delete failed` : [`emulator ${n}`, k, 'plugin test device'])
        }
      } else kept.push('Android emulators — no --sdk given or the SDK is missing; none deleted')
    }
  }

  const total = gone.reduce((t, g) => t + g[1], 0)
  const mb = (k) => `${(k / 1024).toFixed(k >= 1024 ? 0 : 1)} MB`
  fs.mkdirSync(path.join(project, '.pipeline'), { recursive: true })
  const text = `Freed ${mb(total)}.\n\n**API keys:** ${keys}\n\n| Deleted | Size | Why |\n|---|---|---|\n${gone.map(([w, k, y]) => `| ${w} | ${mb(k)} | ${y} |`).join('\n') || '| nothing | | |'}\n\n**Kept**\n${kept.map((k) => `- ${k}`).join('\n') || '- nothing to report'}\n`
  if (fs.existsSync(file())) { const st = load(); (st.reports ||= {}).cleanup = { text, at: now() }; save(st) } // → the Cleanup section of PROGRESS.md
  return `cleanup: freed ${mb(total)} — deleted ${gone.length} item(s), ${kept.length} note(s) in the Cleanup section of PROGRESS.md; ${keys}`
}

// Files that hold tests: any .dart/.swift file under a folder whose name contains "test".
const SKIP = new Set(['.git', '.pipeline', '.dart_tool', 'build', 'Pods', 'node_modules', '.gradle', 'DerivedData'])
function walk(root, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name // forward slashes on every OS, like git
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(root, r, out) } else out.push(r)
  }
  return out
}
// "AC12 …" (Dart test names) or "testAC12_…" (XCTest); never matches AC120 for AC12.
const acIds = (text) => new Set([...text.matchAll(/(?:^|[^A-Za-z0-9])AC(\d+)(?!\d)|testAC(\d+)(?!\d)/g)].map((m) => `AC${m[1] || m[2]}`))

function coverage(s, groupName, root) {
  const all = groupName ? s.groups?.[groupName] : s.features.map((f) => f.id)
  if (!all) throw new Error(`no group "${groupName}" — known: ${Object.keys(s.groups || {}).join(', ') || 'none'}`)
  const blocked = new Set(s.features.filter((f) => f.status === 'blocked').map((f) => f.id))
  const ids = all.filter((id) => !blocked.has(id))
  const tests = {}
  for (const f of walk(root).filter((f) => /test/i.test(path.dirname(f)) && /\.(dart|swift)$/.test(f)))
    for (const id of acIds(fs.readFileSync(path.join(root, f), 'utf8'))) (tests[id] ||= []).push(f)
  const rows = ids.map((id) => ({ id, t: tests[id] || [] }))
  const bad = rows.filter((r) => !r.t.length)
  const report = [
    `coverage${groupName ? ` of group ${groupName}` : ''}: ${rows.length - bad.length}/${rows.length} criteria covered${blocked.size ? ` (${[...blocked].filter((id) => all.includes(id)).length} blocked, not tested)` : ''} (root ${root})`,
    ...rows.map((r) => `- ${r.id}: tests ${r.t.length}${r.t.length ? '' : ' — MISSING test'}`),
    'Presence by name only: the final audit still checks that each test really verifies its criterion.',
  ].join('\n')
  if (bad.length) throw new Error(`${report}\nNOT COVERED: ${bad.map((r) => r.id).join(', ')}`)
  return report
}

// The criteria a change since baseRef can affect, from git history: a file belongs to the groups whose commits
// ("app-factory: <logic|ui|tests|group> <name>") touched it. A changed file no group commit touched (main.dart,
// pubspec.yaml, a shared helper) affects every criterion. Prints the criteria and the --name regex for flutter test.
function affected(s, a) {
  const i = a.indexOf('--root'), root = i >= 0 ? path.resolve(a[i + 1]) : process.cwd()
  const pi = a.indexOf('--platform')
  if (pi >= 0) return affectedOn(s, root, a[pi + 1])
  const base = a.filter((x, j) => j !== i && j !== i + 1)[0]
  if (!base) throw new Error('affected <baseRef> [--root <dir>]')
  const changed = [...new Set([...git(root, 'diff', '--name-only', base), ...git(root, 'ls-files', '--others', '--exclude-standard')])]
    .filter((f) => /^(lib|integration_test|test|assets|pubspec\.yaml|ios|android)/.test(f))
  const groups = s.groups || {}, ids = new Set(), shared = []
  for (const f of changed) {
    const names = new Set(git(root, 'log', '--format=%s', '--', f).map((m) => (m.match(/^app-factory: (?:logic|ui|tests|group) ([a-z0-9-]+)$/) || [])[1]).filter((g) => g && groups[g]))
    if (!names.size) shared.push(f)
    for (const g of names) for (const id of groups[g]) ids.add(id)
  }
  if (shared.some((f) => !f.startsWith('test/'))) for (const f of s.features) ids.add(f.id) // a shared app file can affect anything
  const live = [...ids].filter((id) => s.features.find((f) => f.id === id)?.status !== 'blocked').sort((x, y) => Number(x.slice(2)) - Number(y.slice(2)))
  return JSON.stringify({ changed: changed.length, shared, criteria: live, name: live.length ? `\\b(${live.join('|')})\\b` : null })
}

// Per platform, since its last run. Replayed on v4's rounds 2 and 3: iOS would have run 10 and 14 of 20 flow tests
// instead of all of them, Android all 20 both times (its native code changed) — and every bug those rounds found
// (X74–X84) is in the tests it selects.
const IGNORE = /^(test\/|design\/|\.pipeline\/|\.claude\/)|Podfile\.lock$|project\.pbxproj$|xcworkspace|^ios\/Flutter\/|local\.properties$/
const fixIds = (subj) => { const m = subj.match(/^(?:app-factory: )?fix(?: (?:logic|ui|shared))?\s+((?:X\d+[\s,]*)+)/); return m ? m[1].match(/X\d+/g) : null }
function affectedOn(s, root, platform) {
  if (!['ios', 'android'].includes(platform)) throw new Error('affected --platform ios|android')
  const other = platform === 'ios' ? 'android' : 'ios', mine = new RegExp(`^qa r\\d+ ${platform}\\b`), theirs = new RegExp(`^(qa r\\d+ ${other}\\b|merge qa-r\\d+-${other === 'android' ? 'android' : '\\d'})`)
  const blocked = new Set(s.features.filter((f) => f.status === 'blocked').map((f) => f.id)), known = new Set(s.features.map((f) => f.id))
  const live = (xs) => [...new Set(xs)].filter((id) => known.has(id) && !blocked.has(id)).sort((x, y) => Number(x.slice(2)) - Number(y.slice(2)))
  const out = (all, ids, why) => JSON.stringify({ platform, since: last ? last.slice(0, 7) : null, all, why, criteria: all ? live(s.features.map((f) => f.id)) : live(ids), name: all ? '' : live(ids).length ? `\\b(${live(ids).join('|')})\\b` : null })
  const lastLine = git(root, 'log', '--format=%H %s').find((l) => mine.test(l.slice(41)))
  var last = lastLine ? lastLine.slice(0, 40) : null
  if (!last) return out('the first run on this platform', [], [])
  const findingAcs = (x) => { const f = s.findings.find((y) => y.id === x); return f ? [f.feature, ...[...String(f.text).matchAll(/\bAC\d+\b/g)].map((m) => m[0])].filter((v) => /^AC\d+$/.test(v || '')) : [] }
  const ids = [], why = []
  for (const f of git(root, 'diff', '--name-only', last, 'HEAD')) {
    if (IGNORE.test(f) || !/^(lib|integration_test|assets|pubspec|ios|android)/.test(f)) continue
    if (f.startsWith(`${other}/`)) continue // the other platform's native code cannot change this app
    if (f.startsWith(`${platform}/`) || /^(pubspec\.(yaml|lock)|lib\/main\.dart)$/.test(f)) return out(`${f} changed`, [], [])
    const subjects = git(root, 'log', '--format=%s', `${last}..HEAD`, '--', f)
    if (f.startsWith('integration_test/')) {
      if (subjects.every((x) => mine.test(x))) continue // only this platform's runner changed it: it passed here already
      const t = fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : ''
      ids.push(...[...acIds(t)]); why.push(`${f}: changed by ${subjects.filter((x) => !mine.test(x))[0]}`); continue
    }
    for (const subj of subjects) {
      const g = (subj.match(/^app-factory: (?:logic|ui|tests|group) ([a-z0-9-]+)$/) || [])[1], xs = fixIds(subj)
      if (g && (s.groups || {})[g]) { ids.push(...s.groups[g]); why.push(`${f}: group ${g}`) }
      else if (xs) { for (const x of xs) ids.push(...findingAcs(x)); why.push(`${f}: fix ${xs.join(' ')}`) }
      else return out(`${f} changed by "${subj}", which names no group or finding`, [], [])
    }
  }
  // what failed here, or waits for its device proof here, runs again (a finding names its device)
  const here = platform === 'ios' ? /\b(iOS|iPhone|simulator)\b/i : /\b(Android|emulator)\b/i, there = platform === 'ios' ? /\b(Android|emulator)\b/i : /\b(iOS|iPhone|simulator)\b/i
  for (const f of s.findings.filter((f) => (f.status === 'open' || f.pending && f.status !== 'resolved') && f.severity !== 'minor' && (here.test(f.text) || !there.test(f.text)))) { ids.push(...findingAcs(f.id)); why.push(`${f.id}: open or pending`) }
  return out(null, ids, why)
}

// pubspec.yaml packages and where they are used. A package nothing imports still ships in the app
// (e.g. cupertino_icons adds a 258 KB font to a release APK even when no CupertinoIcons is referenced).
function deps(root) {
  const pub = path.join(root, 'pubspec.yaml')
  if (!fs.existsSync(pub)) throw new Error(`no ${pub}`)
  const lines = fs.readFileSync(pub, 'utf8').split('\n')
  const found = []
  let section = null
  lines.forEach((l, i) => {
    if (/^\S/.test(l)) section = /^(dependencies|dev_dependencies):/.test(l) ? l.split(':')[0] : null
    const m = section && l.match(/^  ([a-z0-9_]+):/)
    if (!m) return
    let j = i + 1, sdk = /sdk:/.test(l)
    while (j < lines.length && /^    /.test(lines[j])) sdk ||= /^\s+sdk:/.test(lines[j++])
    if (!sdk) found.push({ name: m[1], dev: section === 'dev_dependencies' })
  })
  const files = walk(root).filter((f) => f.endsWith('.dart'))
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
  const inLib = files.filter((f) => f.startsWith('lib/')), anyDart = files
  const analysis = fs.existsSync(path.join(root, 'analysis_options.yaml')) ? fs.readFileSync(path.join(root, 'analysis_options.yaml'), 'utf8') : ''
  const rows = found.map(({ name, dev }) => {
    const pool = dev ? anyDart : inLib
    let users = pool.filter((f) => read(f).includes(`package:${name}/`))
    if (name === 'cupertino_icons') users = inLib.filter((f) => /CupertinoIcons\./.test(read(f))) // a font, used through the SDK's CupertinoIcons
    const viaAnalysis = dev && analysis.includes(`package:${name}/`)
    return { name, dev, users, used: users.length > 0 || viaAnalysis, viaAnalysis }
  })
  const unused = rows.filter((r) => !r.used)
  const report = [
    `${rows.length} package(s) in pubspec.yaml (SDK packages not counted):`,
    ...rows.map((r) => `- ${r.name}${r.dev ? ' (dev)' : ''}: ${r.viaAnalysis ? 'analysis_options.yaml' : `${r.users.length} file(s)${r.users.length ? ` — ${r.users.slice(0, 5).join(', ')}${r.users.length > 5 ? ', …' : ''}` : ''}`}${r.used ? '' : ' — UNUSED'}`),
  ].join('\n')
  if (unused.length) throw new Error(`${report}\nUNUSED: ${unused.map((r) => r.name).join(', ')} — remove with: flutter pub remove ${unused.map((r) => r.name).join(' ')}`)
  return report
}

// Every colour written in lib/ must come from the imported design (design/colors.json, written by the design import).
// Catches Color(0xAARRGGBB), Color.fromARGB, Color.fromRGBO and Material's named Colors.* (except transparent).
function colors(root) {
  const pal = path.join(root, 'design', 'colors.json')
  if (!fs.existsSync(pal)) return 'no design/colors.json (no imported design) — nothing to check'
  const allowed = new Set(JSON.parse(fs.readFileSync(pal, 'utf8')).colors.map((c) => c.hex.toUpperCase().replace(/^#/, '').slice(-6)))
  const hex2 = (n) => Math.round(Number(n)).toString(16).padStart(2, '0').toUpperCase()
  const bad = []
  for (const f of walk(root).filter((f) => f.startsWith('lib/') && f.endsWith('.dart'))) {
    fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => {
      const at = `${f}:${i + 1}`
      for (const m of line.matchAll(/Color\(\s*0x([0-9A-Fa-f]{8})\s*\)/g)) if (!allowed.has(m[1].slice(2).toUpperCase())) bad.push(`${at} #${m[1].slice(2).toUpperCase()}`)
      for (const m of line.matchAll(/Color\.fromARGB\(\s*\d+\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)) { const h = m.slice(1, 4).map(hex2).join(''); if (!allowed.has(h)) bad.push(`${at} #${h}`) }
      for (const m of line.matchAll(/Color\.fromRGBO\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)) { const h = m.slice(1, 4).map(hex2).join(''); if (!allowed.has(h)) bad.push(`${at} #${h}`) }
      for (const m of line.matchAll(/\bColors\.(\w+)/g)) if (m[1] !== 'transparent') bad.push(`${at} Colors.${m[1]}`)
    })
  }
  if (bad.length) throw new Error(`${bad.length} colour(s) in lib/ that are not in design/colors.json:\n${bad.join('\n')}\nUse the theme's colours (built from design/colors.json) instead.`)
  return `all colours in lib/ come from design/colors.json (${allowed.size} design colours)`
}

// The project folder holds only the app, its tests, CONTRACT.md and design/. Files that existed before the run's
// baseline commit are the user's and never count; untracked files ignored by .gitignore (build/, .pipeline/) neither.
const ALLOWED = ['lib/**', 'test/**', 'integration_test/**', 'assets/**', 'android/**', 'ios/**', 'design/**', 'pubspec.yaml', 'pubspec.lock',
  'analysis_options.yaml', 'l10n.yaml', 'devtools_options.yaml', 'CONTRACT.md', 'DECISIONS.md', 'README.md', '.gitignore', '.metadata']
// DECISIONS.md: every question the contract step found, the options it had, which one the app is built with, and how that
// choice was made — the user picked it, the user did not reply within 5 minutes, or it was never asked (not one of the most
// important). Kept in the project for reviewing the plugin's questions and defaults.
function decisions(root, a = []) {
  const qf = path.join(dir(), 'questions.json'), af = path.join(dir(), 'answers.json')
  const opt = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null }
  for (const [flag, to] of [['--questions', qf], ['--answers', af]]) {
    const from = opt(flag)
    if (!from) continue
    const data = JSON.parse(fs.readFileSync(from, 'utf8')) // must be valid JSON: a list
    if (!Array.isArray(data)) throw new Error(`${flag} ${from}: not a JSON list`)
    if (flag === '--questions') {
      // the chat shows these as they are: check the format here, so no agent writes its own checker
      const bad = [], ids = new Set()
      for (const q of data) {
        const at = q.id || '(no id)'
        if (!q.id || ids.has(q.id)) bad.push(`${at}: missing or repeated id`); ids.add(q.id)
        if (!q.header || q.header.length > 12) bad.push(`${at}: header "${q.header || ''}" must be 1–12 characters`)
        if (!/\?$/.test(String(q.question || '').trim())) bad.push(`${at}: the question must end with "?"`)
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) bad.push(`${at}: 2–4 options`)
        else {
          if (!/ \(Recommended\)$/.test(q.options[0].label || '')) bad.push(`${at}: the first option's label must end with " (Recommended)"`)
          for (const o of q.options) if (!o.label || !o.description) bad.push(`${at}: every option needs a label and a description`)
        }
        if (typeof q.ask !== 'boolean' || !q.why) bad.push(`${at}: ask (true/false) and why are required`)
      }
      if (bad.length) throw new Error(`QUESTIONS (${bad.length} problem(s)) — fix these and run it again:\n${bad.join('\n')}`)
    }
    fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(to, JSON.stringify(data, null, 2))
  }
  if (!fs.existsSync(qf)) throw new Error('no questions recorded — run: decisions --questions <file with the contract\'s questions JSON>')
  const all = JSON.parse(fs.readFileSync(qf, 'utf8')), answered = fs.existsSync(af)
  // the chat asks at most the first 4 marked "ask" (build-app.js); any further one is settled like an unasked question
  const askIds = new Set(all.filter((q) => q.ask).slice(0, 4).map((q) => q.id))
  const qs = all.map((q) => ({ ...q, ask: askIds.has(q.id) }))
  const ans = new Map((answered ? JSON.parse(fs.readFileSync(af, 'utf8')) : []).map((x) => [x.id, x]))
  const BY = { user: 'the user chose it', timeout: 'no reply within 5 minutes → recommended option', unattended: 'unattended run → recommended option' }
  const count = { user: 0, timeout: 0, unattended: 0, notAsked: 0, waiting: 0, skipped: 0 }
  const body = qs.map((q) => {
    const rec = q.options[0].label.replace(/ \(Recommended\)$/, ''), a = ans.get(q.id)
    let sel = rec, by
    if (a) { sel = a.isDefault ? rec : a.answer; by = BY[a.by] || BY.user; count[a.by in BY ? a.by : 'user']++ }
    else if (!q.ask) { by = 'not asked (not one of the most important) → recommended option'; count.notAsked++ }
    else if (answered) { by = 'asked, not answered → recommended option'; count.skipped++ }
    else { by = 'asked — waiting for the answer; the recommended option until then'; count.waiting++ }
    const opts = q.options.map((o, i) => `${i + 1}. ${o.label} — ${o.description}`).join('\n')
    return `## ${q.id} · ${q.header} (${q.area})${q.ask ? ' · asked' : ''}\n${q.question}\nAffects: ${q.affects}\n${q.why ? `Why ${q.ask ? 'asked' : 'not asked'}: ${q.why}\n` : ''}\nOptions:\n${opts}\n\n**Selected: ${sel}** — ${by}\n`
  })
  const asked = qs.filter((q) => q.ask).length
  const head = `# Decisions\n\n${qs.length} question(s): ${asked} asked, ${qs.length - asked} not asked (recommended option used). Chosen by the user: ${count.user}; skipped in the user's reply: ${count.skipped}; no reply in 5 minutes: ${count.timeout}; unattended: ${count.unattended}; waiting: ${count.waiting}.\nCONTRACT.md lines tagged with a question's id (e.g. "(Q3)") follow the selected option.\n`
  fs.writeFileSync(path.join(root, 'DECISIONS.md'), [head, ...body].join('\n'))
  return `DECISIONS.md: ${qs.length} question(s), ${asked} asked — user ${count.user}, skipped ${count.skipped}, no reply ${count.timeout}, unattended ${count.unattended}, waiting ${count.waiting}, not asked ${count.notAsked}`
}

function stray(root) {
  const base = git(root, 'log', '--format=%H', '--grep=^app-factory: baseline$').pop()
  if (!base) return 'no "app-factory: baseline" commit — nothing to check'
  const added = [...new Set([...git(root, 'diff', '--name-only', '--diff-filter=A', base), ...git(root, 'ls-files', '--others', '--exclude-standard')])]
  const bad = added.filter((f) => !ALLOWED.some((g) => globMatch(f, g)))
  if (bad.length) throw new Error(`STRAY FILES (${bad.length}) — not part of the app, its tests, CONTRACT.md or design/: ${bad.join(', ')}. Delete them (git rm -q <file>, or rm for an untracked one); keep notes in your reply or in a finding, scratch work outside the project.`)
  return `no stray files (${added.length} added since the baseline, all allowed)`
}

// The app icon and image variants, checked from the files themselves (PNG header: size, colour type, tRNS).
// Rules: Apple HIG "App icons" (square, 1024×1024, the system masks the corners, background full-bleed and opaque);
// developer.android.com "Adaptive icons" (108 dp layers, 66 dp safe zone). Default icons = a fresh `flutter create` (3.38.5).
const FLUTTER_DEFAULT_ICON = { ios: 'c785f8932297af4acd5f5ccb7630f01c', android: '57838d52c318faff743130c3fcfae0c6' }
function png(f) {
  const b = fs.readFileSync(f)
  if (b.readUInt32BE(0) !== 0x89504e47) return null
  let alpha = [4, 6].includes(b[25])
  for (let i = 8; i < b.length - 8;) { const n = b.readUInt32BE(i), t = b.toString('latin1', i + 4, i + 8); if (t === 'tRNS') alpha = true; if (t === 'IDAT') break; i += 12 + n }
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha, md5: crypto.createHash('md5').update(b).digest('hex') }
}
function assetsCheck(root) {
  const bad = [], ok = []
  const recF = path.join(root, '.pipeline', 'app-icon.json')
  const rec = fs.existsSync(recF) ? JSON.parse(fs.readFileSync(recF, 'utf8')) : null
  // no icon was given and the contract recorded keeping Flutter's default (app-icon.mjs --none): the icon files are not checked
  const noIcon = rec && rec.none
  const set = path.join(root, 'ios/Runner/Assets.xcassets/AppIcon.appiconset')
  if (noIcon) ok.push(`no app icon given — Flutter's default icon kept (${rec.decision}); it is listed in the final report`)
  else if (fs.existsSync(path.join(set, 'Contents.json'))) {
    const imgs = JSON.parse(fs.readFileSync(path.join(set, 'Contents.json'), 'utf8')).images.filter((i) => i.size && i.scale)
    for (const im of imgs) {
      const want = Math.round(parseFloat(im.size) * parseFloat(im.scale)), f = im.filename && path.join(set, im.filename)
      const p = f && fs.existsSync(f) ? png(f) : null
      if (!p) { bad.push(`iOS icon ${im.size}@${im.scale}: ${im.filename || 'no filename'} missing or not a PNG`); continue }
      if (p.w !== want || p.h !== want) bad.push(`iOS icon ${im.filename}: ${p.w}×${p.h}, must be ${want}×${want}`)
      if (p.alpha) bad.push(`iOS icon ${im.filename}: has transparency — iOS icons are square and opaque; the system rounds the corners`)
      if (p.md5 === FLUTTER_DEFAULT_ICON.ios) bad.push(`iOS icon ${im.filename}: still Flutter's default icon`)
    }
    ok.push(`iOS: ${imgs.length} icon sizes`)
  }
  const res = path.join(root, 'android/app/src/main/res')
  if (!noIcon && fs.existsSync(res)) {
    for (const [d, k] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
      const f = path.join(res, `mipmap-${d}`, 'ic_launcher.png'), p = fs.existsSync(f) ? png(f) : null, want = 48 * k
      if (!p) bad.push(`Android mipmap-${d}/ic_launcher.png missing`)
      else { if (p.w !== want || p.h !== want) bad.push(`Android mipmap-${d}/ic_launcher.png: ${p.w}×${p.h}, must be ${want}×${want}`); if (p.md5 === FLUTTER_DEFAULT_ICON.android) bad.push(`Android mipmap-${d}/ic_launcher.png: still Flutter's default icon`) }
      if (!fs.existsSync(path.join(res, `drawable-${d}`, 'ic_launcher_foreground.png'))) bad.push(`Android drawable-${d}/ic_launcher_foreground.png missing (adaptive icon foreground, 108 dp × ${k})`)
    }
    const ad = path.join(res, 'mipmap-anydpi-v26/ic_launcher.xml')
    if (!fs.existsSync(ad) || !/<adaptive-icon[\s\S]*<background[\s\S]*<foreground/.test(fs.readFileSync(ad, 'utf8'))) bad.push('Android: no adaptive icon (mipmap-anydpi-v26/ic_launcher.xml with background and foreground) — without it the icon "neither looks consistent with other icons displayed by the system nor supports visual effects"')
    const man = path.join(root, 'android/app/src/main/AndroidManifest.xml')
    if (fs.existsSync(man) && !/android:icon="@mipmap\/ic_launcher"/.test(fs.readFileSync(man, 'utf8'))) bad.push('AndroidManifest.xml: android:icon is not @mipmap/ic_launcher')
    ok.push('Android: launcher + adaptive icon')
  }
  // a provided @2x/@3x file goes in a 2.0x/ or 3.0x/ folder beside the declared 1x path; loading it by name draws it 2–3× too big
  for (const f of walk(root).filter((f) => f.startsWith('lib/') && f.endsWith('.dart')))
    fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((l, i) => { if (/['"][^'"]*@[23]x\.(png|jpe?g|webp)['"]/.test(l)) bad.push(`${f}:${i + 1} loads an @2x/@3x file directly — put it in a 2.0x/ or 3.0x/ folder and load the 1x path`) })
  // provenance: the icons must be exactly what app-icon.mjs made (never drawn, resized or replaced by hand)
  if (ok.length && !noIcon) {
    if (!rec) bad.push('the app icon was not made by app-icon.mjs (no .pipeline/app-icon.json) — make it only with the script, from the provided icon')
    else {
      for (const [f, h] of Object.entries(rec.made)) {
        const cur = fs.existsSync(path.join(root, f)) ? crypto.createHash('md5').update(fs.readFileSync(path.join(root, f))).digest('hex') : null
        if (cur !== h) bad.push(`${f}: changed after app-icon.mjs made it — re-run the script instead of editing icons`)
      }
      ok.push(`icon from ${rec.source} (${rec.sourcePx} px${rec.upscaled ? ', upscaled — the user\'s choice' : ''}${rec.preRounded ? `, transparent corners on ${rec.fill} — the user's choice` : ''})`)
    }
  }
  if (!ok.length && !bad.length) return 'no ios/ or android/ project — nothing to check'
  if (bad.length) throw new Error(`ASSETS (${bad.length} problem(s)):\n${bad.join('\n')}\nMake the app icon only with: node "<plugin>/scripts/app-icon.mjs" <project> --source <icon>, or --none <Q id> when the contract records that no icon was given (build skill U13).`)
  return `assets ok — ${ok.join('; ')}; no @2x/@3x file loaded directly`
}

// The simulator type whose screen is exactly W×H points, among those the installed iOS runtime supports
// (sizes from each device type's profile: mainScreenWidth/Height ÷ mainScreenScale). @3x preferred.
function designDevice(w, h, list = null, android = !MAC) {
  if (!(w > 0) || !(h > 0)) throw new Error('design-device <W> <H> (points)')
  // No iOS simulator outside macOS: an Android emulator whose screen is exactly W×H dp — density 480 (3 px per dp),
  // set in the AVD's config.ini (hw.lcd.width/height/density, the emulator's hardware-properties.ini).
  if (android) return JSON.stringify({ name: `af-design-${Math.round(w)}x${Math.round(h)}`, android: true, density: 480, widthPx: Math.round(w) * 3, heightPx: Math.round(h) * 3,
    configIni: { 'hw.lcd.width': Math.round(w) * 3, 'hw.lcd.height': Math.round(h) * 3, 'hw.lcd.density': 480 } })
  const types = list || (() => {
    const rt = JSON.parse(execSync('xcrun simctl list runtimes -j', { encoding: 'utf8' })).runtimes.filter((r) => r.platform === 'iOS' && r.isAvailable).pop()
    if (!rt) throw new Error('no iOS simulator runtime installed')
    return rt.supportedDeviceTypes.filter((t) => /iPhone|iPad/.test(t.name)).map((t) => {
      const pl = JSON.parse(execSync(`plutil -convert json -o - "${t.bundlePath}/Contents/Resources/profile.plist"`, { encoding: 'utf8' }))
      return { name: t.name, id: t.identifier, runtime: rt.identifier, w: pl.mainScreenWidth / pl.mainScreenScale, h: pl.mainScreenHeight / pl.mainScreenScale, scale: pl.mainScreenScale }
    })
  })()
  const hit = types.filter((t) => Math.round(t.w) === Math.round(w) && Math.round(t.h) === Math.round(h)).sort((x, y) => y.scale - x.scale)[0]
  if (!hit) throw new Error(`no simulator with a ${w}×${h} pt screen — available: ${[...new Set(types.map((t) => `${Math.round(t.w)}×${Math.round(t.h)}`))].join(', ')}. Compare on the closest size only after asking (a different size moves everything).`)
  return JSON.stringify({ name: `app-factory-design-${Math.round(w)}x${Math.round(h)}`, type: hit.name, typeId: hit.id, runtime: hit.runtime, scale: hit.scale })
}

// Splits the integration test files across n runners, largest first onto the lightest runner (size ≈ run time).
function shard(n, root) {
  if (!(n >= 1)) throw new Error('shard <n> [--root <dir>]')
  const dirp = path.join(root, 'integration_test')
  const files = fs.existsSync(dirp) ? fs.readdirSync(dirp).filter((f) => f.endsWith('_test.dart')).map((f) => ({ f: `integration_test/${f}`, b: fs.statSync(path.join(dirp, f)).size })) : []
  const runners = Array.from({ length: n }, () => ({ files: [], bytes: 0 }))
  for (const x of files.sort((p, q) => q.b - p.b)) { const r = runners.reduce((m, r) => (r.bytes < m.bytes ? r : m)); r.files.push(x.f); r.bytes += x.b }
  return JSON.stringify(runners.map((r) => r.files))
}

// Changed files since baseRef (committed, staged, unstaged, untracked) that match none of the allowed globs.
function scope([base, ...globs]) {
  if (!base || !globs.length) throw new Error('scope <baseRef> <glob...>')
  const cwd = process.cwd()
  const changed = base.includes('..') // a branch, before merging it: its committed changes only
    ? git(cwd, 'diff', '--name-only', ...base.split('..'))
    : [...new Set([...git(cwd, 'diff', '--name-only', base), ...git(cwd, 'ls-files', '--others', '--exclude-standard')])]
  const outside = changed.filter((f) => !globs.some((g) => globMatch(f, g)))
  if (outside.length) throw new Error(`OUT OF SCOPE (${outside.length}): ${outside.join(', ')} — allowed: ${globs.join(' ')}. Revert these: git checkout ${base} -- <file> (or delete a new file).`)
  return `in scope: ${changed.length} changed file(s), all within ${globs.join(' ')}`
}

// Parallel builders and testers write at the same moment: every command runs under this lock so no entry is lost
// and finding ids stay unique. A lock older than 30 s belongs to a dead process and is taken over.
function locked(fn) {
  if (!fs.existsSync(dir())) return fn()
  const wl = path.join(dir(), 'WRITE.lock')
  for (let i = 0; ; i++) {
    try {
      fs.mkdirSync(wl)
      break
    } catch {
      try {
        if (Date.now() - fs.statSync(wl).mtimeMs > 30000) fs.rmSync(wl, { recursive: true, force: true })
      } catch {}
      if (i > 1200) throw new Error(`could not get ${wl} in 60 s`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  try {
    return fn()
  } finally {
    fs.rmSync(wl, { recursive: true, force: true })
  }
}

// ── A stuck device test: detect it, then restart the app, then the device ──────────────────────────────────
// v4: 12 device test commands ran into the 10-minute Bash limit; some were long and some were hung, and with
// -r failures-only nothing in the log showed which. With -r expanded every test start and result is a line.
const STALL_MIN = 10 // ponytail: longer than any single flow test seen in v4 (Android files of 1–3 tests: ~6 min each); raise per app if needed
const DONE = /All tests passed!|Some tests failed\.|No tests ran|No tests were found|^exit=\d+/m
const optOf = (a) => (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null }
function appAlive(platform, dev, app, sdk) {
  if (!app || !dev) return null
  if (platform === 'ios') return MAC ? run1('xcrun', ['simctl', 'spawn', dev, 'launchctl', 'list']).includes(`UIKitApplication:${app}`) : null
  return sdk ? run1(sdkTool(sdk, 'adb'), ['-s', dev, 'shell', 'pidof', app]).trim().length > 0 : null
}
function deviceUp(platform, dev, sdk) {
  if (!dev) return null
  if (platform === 'ios') return MAC ? run1('xcrun', ['simctl', 'list', 'devices', 'booted']).includes(dev) : null
  return sdk ? run1(sdkTool(sdk, 'adb'), ['-s', dev, 'get-state']).trim() === 'device' : null
}
export function staleOf(logText, idleMin, alive, up, minutes = STALL_MIN) {
  const lines = logText.split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean)
  const tests = lines.filter((l) => /^\d\d:\d\d \+\d+/.test(l)), loading = lines.filter((l) => /loading .*_test\.dart/.test(l))
  const at = { test: (tests.at(-1) || '').replace(/^\d\d:\d\d \+\d+(?: ~\d+)?(?: -\d+)?: /, ''), file: ((loading.at(-1) || '').match(/(\S+_test\.dart)/) || [])[1] || null }
  if (DONE.test(logText)) return { state: 'finished', ...at, last: lines.at(-1) || '' }
  const started = tests.length > 0 // the build is over and a test is running
  let why = null
  if (up === false) why = 'the device is not running'
  else if (started && alive === false && idleMin >= 2) why = 'the app is not running while a test is'
  else if (idleMin >= minutes) why = `no new line for ${Math.round(idleMin)} min`
  return { state: why ? 'stalled' : 'running', why, idleMinutes: Math.round(idleMin * 10) / 10, ...at, last: lines.at(-1) || '' }
}
// Memory the test devices can use, in MB: macOS free + inactive pages (vm_stat), Linux MemAvailable, Windows free physical memory.
function memFree() {
  if (MAC) { const v = run1('vm_stat', []), pg = +(v.match(/page size of (\d+)/) || [, 4096])[1], n = (k) => +((v.match(new RegExp(`${k}:\\s+(\\d+)`)) || [, 0])[1]); return Math.round(((n('Pages free') + n('Pages inactive')) * pg) / 1048576) }
  if (process.platform === 'linux') { const m = fs.readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+) kB/); if (m) return Math.round(+m[1] / 1024) }
  return Math.round(os.freemem() / 1048576)
}
// Before an emulator starts: on Linux and Windows, refuse when less memory is available than it needs — a 2 GB
// emulator (af-standard's config.ini: hw.ramSize=2G) started into a full machine drives it into swap until the desktop
// freezes. macOS compresses memory instead: v4 ran the emulator at 1,839 MB free, so there it only reports.
// ponytail: EMU_MB = the emulator's 2 GB + ~450 MB for adb and the build around it, unmeasured on Linux; raise it if a run freezes
const EMU_MB = 2500
function needMem(need, free = memFree(), mac = MAC) {
  if (!(need > 0)) throw new Error('freemem --need <MB>')
  if (!mac && free < need) throw new Error(`only ${free} MB of memory available, the emulator needs ${need} MB — start nothing. Stop only the plugin's own devices (app-factory-… simulators, af-… emulators) and check again; still short → file a critical finding with this line. Never free memory any other way (no sudo, drop_caches, swapoff, pkill or killall).`)
  return String(free)
}
function stale(a) {
  const o = optOf(a), log = a[0]
  if (!log) throw new Error('stale <log> [--minutes N] [--device <id> --platform ios|android --app <id> --sdk <dir>]')
  const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '', idle = fs.existsSync(log) ? (Date.now() - fs.statSync(log).mtimeMs) / 60000 : 0
  const platform = o('--platform') || 'ios', sdk = o('--sdk') || findTools().androidSdk
  const res = staleOf(text, idle, appAlive(platform, o('--device'), o('--app'), sdk), deviceUp(platform, o('--device'), sdk), +(o('--minutes') || STALL_MIN))
  if (res.state === 'stalled') res.next = 'stop this run: `app-restart`, then re-run only the file it was on, once; stalled again → `device-reset`, re-run once; stalled a third time → a major finding "hang" with this log, and go on with the next files'
  return JSON.stringify(res)
}
// A `flutter test … -d <device>` process (the flutter command, its dart flutter_tools, or flutter_tester): a word is exactly
// the device id, and a word is the flutter tool itself — never a process that only mentions either (com.x.flutter_app).
export const flutterFor = (args, dev) => {
  const w = args.split(/\s+/).map((x) => x.replace(/^['"]+|['"]+$/g, ''))
  return w.some((x) => x === dev || x === `--device-id=${dev}`) && w.some((x) => /(?:^|[\\/])(?:flutter(?:\.bat)?|flutter_tools\.snapshot|flutter_tester(?:\.exe)?)$/i.test(x))
}
// Stops those processes for this device — never this command itself or the shells and agent that started it.
function killFlutterFor(dev) {
  const list = process.platform === 'win32'
    ? run1('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CommandLine)" }'])
    : run1('ps', ['-A', '-o', 'pid=,ppid=,args=']) // -A: every process on macOS and Linux (macOS -e means environment)
  const procs = list.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], args: m[3] }))
  const mine = new Set()
  for (let p = process.pid; p > 1 && !mine.has(p);) { mine.add(p); p = (procs.find((x) => x.pid === p) || {}).ppid }
  const pids = procs.filter((x) => x.pid > 1 && !mine.has(x.pid) && flutterFor(x.args, dev)).map((x) => x.pid)
  for (const p of pids) { try { process.kill(p) } catch { /* already gone */ } }
  return pids
}
const ownIos = (udid) => { const d = Object.values(JSON.parse(run1('xcrun', ['simctl', 'list', 'devices', '--json']) || '{"devices":{}}').devices).flat().find((x) => x.udid === udid); return d && d.name.startsWith('app-factory-') ? d : null }
const avdOf = (sdk, serial) => run1(sdkTool(sdk, 'adb'), ['-s', serial, 'emu', 'avd', 'name']).split(/\r?\n/)[0].trim()
function appRestart(a) {
  const o = optOf(a), dev = a[0], platform = o('--platform'), app = o('--app'), sdk = o('--sdk') || findTools().androidSdk
  if (!dev || !platform || !app) throw new Error('app-restart <udid|serial> --platform ios|android --app <id> [--sdk <dir>]')
  const killed = killFlutterFor(dev)
  if (platform === 'ios') { if (!MAC) throw new Error('iOS simulators exist only on macOS'); run1('xcrun', ['simctl', 'terminate', dev, app]) }
  else run1(sdkTool(sdk, 'adb'), ['-s', dev, 'shell', 'am', 'force-stop', app])
  return `stopped ${killed.length} flutter process(es) for ${dev}${killed.length ? ` (${killed.join(', ')})` : ''} and the app ${app} — re-run only the file the stalled run was on`
}
function deviceReset(a) {
  const o = optOf(a), dev = a[0], platform = o('--platform'), app = o('--app'), sdk = o('--sdk') || findTools().androidSdk
  if (!dev || !platform) throw new Error('device-reset <udid|serial> --platform ios|android [--app <id>] [--sdk <dir>]')
  const killed = killFlutterFor(dev)
  if (platform === 'ios') {
    if (!MAC) throw new Error('iOS simulators exist only on macOS')
    const d = ownIos(dev); if (!d) throw new Error(`${dev} is not one of the plugin's simulators (app-factory-*) — never reset a user's device`)
    run1('xcrun', ['simctl', 'shutdown', dev]); run1('xcrun', ['simctl', 'erase', dev]); run1('xcrun', ['simctl', 'boot', dev])
    const up = run1('xcrun', ['simctl', 'list', 'devices', 'booted']).includes(dev)
    if (!up) throw new Error(`${d.name} did not boot again after the reset`)
    return `reset ${d.name} (${dev}): ${killed.length} flutter process(es) stopped, shut down (its memory freed), erased (its apps and data removed), booted — reinstall happens on the next flutter test; for mobile-mcp run npx -y mobilecli agent install --device ${dev}`
  }
  if (!sdk) throw new Error('no Android SDK found — pass --sdk')
  const avd = avdOf(sdk, dev); if (!avd.startsWith('af-')) throw new Error(`${dev} (${avd || 'unknown'}) is not one of the plugin's emulators (af-*) — never reset a user's device`)
  if (app) run1(sdkTool(sdk, 'adb'), ['-s', dev, 'shell', 'am', 'force-stop', app])
  run1(sdkTool(sdk, 'adb'), ['-s', dev, 'emu', 'kill'])
  for (let i = 0; i < 30 && run1(sdkTool(sdk, 'adb'), ['devices']).includes(dev); i++) sleepMs(1000)
  needMem(EMU_MB) // left stopped when the machine is short of memory: the error says what to do
  // the emulator is the one process allowed to keep running (a window, like the Simulator app)
  spawn(sdkTool(sdk, 'emulator'), ['-avd', avd, '-wipe-data', '-no-snapshot-load', '-no-audio'], { detached: true, stdio: 'ignore' }).unref()
  run1(sdkTool(sdk, 'adb'), ['wait-for-device'], { timeout: 180000 })
  let serial = ''
  for (let i = 0; i < 150 && !serial; i++) { sleepMs(2000); serial = run1(sdkTool(sdk, 'adb'), ['devices']).split('\n').map((l) => l.split('\t')[0].trim()).find((x) => /^emulator-\d+$/.test(x) && avdOf(sdk, x) === avd && run1(sdkTool(sdk, 'adb'), ['-s', x, 'shell', 'getprop', 'sys.boot_completed']).trim() === '1') || '' }
  if (!serial) throw new Error(`${avd} did not boot again within 5 minutes after the reset`)
  return `reset ${avd}: ${killed.length} flutter process(es) stopped, emulator stopped (its memory freed), started with its data wiped, booted as ${serial} — use that serial from now on`
}

// ── Sizes that cannot fit every phone (build skill U15) ────────────────────────────────────────────────────
// A literal wider than the smallest phone (320 pt) or taller than its screen (568 pt); a size computed from the screen
// (U15.3: never scaled by the screen); a Positioned offset copied from the frame (U15.6). Marked lines are skipped:
// `// layout-ok: <why>` on the line, or on the line before it.
// ponytail: a text scan, not a Dart parser — it finds the patterns v4-style frame copies produce; T3 tests catch the rest
export function layoutLint(files) {
  const bad = []
  for (const [f, text] of files) {
    const lines = text.split('\n')
    lines.forEach((l, i) => {
      if (/layout-ok:/.test(l) || /layout-ok:/.test(lines[i - 1] || '')) return
      const code = l.replace(/\/\/.*$/, '')
      for (const m of code.matchAll(/\b(width|minWidth)\s*:\s*(\d+(?:\.\d+)?)/g)) if (+m[2] > 320) bad.push(`${f}:${i + 1}: ${m[1]}: ${m[2]} — wider than the smallest phone (320 pt): let it fill its parent (Expanded, double.infinity, constraints) or cap it with ConstrainedBox(maxWidth)`)
      for (const m of code.matchAll(/\b(height|minHeight)\s*:\s*(\d+(?:\.\d+)?)/g)) if (+m[2] > 568) bad.push(`${f}:${i + 1}: ${m[1]}: ${m[2]} — taller than the smallest phone (568 pt): scroll, or size from the content`)
      if (/MediaQuery\.(?:of\(context\)\.size|sizeOf\(context\))\.(?:width|height)\s*\*/.test(code) || /constraints\.max(?:Width|Height)\s*\*\s*0?\.\d/.test(code)) bad.push(`${f}:${i + 1}: a size scaled by the screen — U15.3: sizes are the design's points; a bigger screen shows more content`)
      for (const m of code.matchAll(/Positioned\([^)]*\btop\s*:\s*(\d+(?:\.\d+)?)/g)) if (+m[1] > 200) bad.push(`${f}:${i + 1}: Positioned(top: ${m[1]}) — an offset copied from the frame (U15.6): lay it out in a Column, or place it from its nearest edge`)
    })
  }
  return bad
}
function layoutLintCmd(root) {
  const files = walk(root).filter((f) => f.startsWith('lib/ui/') && f.endsWith('.dart')).map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')])
  const bad = layoutLint(files)
  if (bad.length) throw new Error(`LAYOUT (${bad.length}) — sizes that cannot fit every phone (build skill U15):\n${bad.join('\n')}\nFix each, or mark a deliberate one with // layout-ok: <why>.`)
  return `layout ok — ${files.length} file(s) in lib/ui/, no size that cannot fit a 320×568 phone`
}

function run([cmd, ...a]) {
  if (cmd === 'stale') return stale(a)
  if (cmd === 'app-restart') return appRestart(a)
  if (cmd === 'device-reset') return deviceReset(a)
  if (cmd === 'layout-lint') return layoutLintCmd(a[0] === '--root' ? path.resolve(a[1]) : process.cwd())
  if (cmd === 'secret') return secret(a)
  if (cmd === 'scope') return scope(a)
  if (cmd === 'devices') return devices(a)
  if (cmd === 'cleanup') return cleanup(a)
  if (cmd === 'stop') return stopRun(a)
  if (cmd === 'resume') return resumeRun(a)
  if (cmd === 'deps') return deps(a[0] === '--root' ? path.resolve(a[1]) : process.cwd())
  if (cmd === 'colors') return colors(a[0] === '--root' ? path.resolve(a[1]) : process.cwd())
  if (cmd === 'decisions') { const i = a.indexOf('--root'); return decisions(i >= 0 ? path.resolve(a[i + 1]) : process.cwd(), a) }
  if (cmd === 'stray') return stray(a[0] === '--root' ? path.resolve(a[1]) : process.cwd())
  if (cmd === 'assets') return assetsCheck(a[0] === '--root' ? path.resolve(a[1]) : process.cwd())
  if (cmd === 'shard') return shard(Number(a[0]), a[1] === '--root' ? path.resolve(a[2]) : process.cwd())
  if (cmd === 'design-device') return designDevice(Number(a[0]), Number(a[1]))
  if (cmd === 'claim') {
    fs.mkdirSync(dir(), { recursive: true })
    try {
      fs.writeFileSync(lock(), now(), { flag: 'wx' }) // fails if another run holds it
    } catch {
      throw new Error(`another run holds ${lock()} since ${fs.readFileSync(lock(), 'utf8')} — wait for it, or delete the file if that run is dead`)
    }
    return 'claimed'
  }
  if (cmd === 'release') {
    fs.rmSync(lock(), { force: true })
    return 'released'
  }
  if (cmd === 'prd') return findPrd(path.dirname(dir()))
  // the machine: iOS (simulators, Xcode builds) only on macOS with Xcode's command-line tools
  if (cmd === 'host') return JSON.stringify({ os: process.platform, ios: MAC && !spawnSync('xcrun', ['--version'], { stdio: 'ignore' }).error })
  if (cmd === 'freemem') { const i = a.indexOf('--need'); return i >= 0 ? needMem(+a[i + 1]) : String(memFree()) }
  // free disk space in GB where the project is (df's flags differ between systems; Windows has none)
  if (cmd === 'freedisk') { const st = fs.statfsSync(path.resolve(a[0] || '.')); return String(Math.floor((st.bavail * st.bsize) / 1073741824)) }
  if (cmd === 'init') {
    a[0] ||= findPrd(path.dirname(dir()))
    fs.mkdirSync(dir(), { recursive: true })
    if (fs.existsSync(file())) return 'already initialised'
    save({ prd: a[0], createdAt: now(), features: [], findings: [], handoffs: [] })
    return 'ok'
  }
  const s = load()
  if (cmd === 'feature') {
    const [id, status, ...title] = a
    if (!id || !['failing', 'passing', 'blocked'].includes(status)) throw new Error('feature <id> <failing|passing|blocked> [title...]')
    let f = s.features.find((x) => x.id === id)
    if (!f) s.features.push((f = { id, title: status === 'blocked' ? '' : title.join(' '), status }))
    if (status === 'blocked') {
      if (!title.length) throw new Error('feature <id> blocked <reason — what is missing>')
      f.blocked = title.join(' ') // a blocked criterion is built up to the missing piece and never tested
    } else delete f.blocked
    f.status = status
    save(s)
    return `${id}=${status}`
  }
  if (cmd === 'finding' && a[0] === 'add') {
    let [, feature, severity, ...text] = a
    const owner = /^@(logic|ui|shared)$/.test(text[0] || '') ? text.shift().slice(1) : undefined
    if (!feature || !['critical', 'major', 'minor'].includes(severity) || !text.length)
      throw new Error('finding add <featureId> <critical|major|minor> [@logic|@ui|@shared] <text...>')
    const id = `X${s.findings.length + 1}`
    s.findings.push({ id, feature, severity, owner, text: text.join(' '), status: 'open', at: now() })
    save(s)
    return id
  }
  if (cmd === 'finding' && a[0] === 'pending') {
    const f = s.findings.find((x) => x.id === a[1])
    if (!f || f.status !== 'open' || a.length < 3) throw new Error('finding pending <Xn> <the device test that will prove the fix> (open findings only)')
    f.pending = a.slice(2).join(' ')
    save(s)
    return `${f.id} pending: the next test round runs "${f.pending}"`
  }
  if (cmd === 'finding' && a[0] === 'block') {
    const f = s.findings.find((x) => x.id === a[1])
    if (!f || a.length < 3) throw new Error('finding block <Xn> <reason: the missing key/API/account, or the platform API that does not exist>')
    Object.assign(f, { status: 'blocked', note: a.slice(2).join(' '), resolvedAt: now() })
    save(s)
    return `${f.id} blocked — not blocking; listed in PROGRESS.md`
  }
  if (cmd === 'finding' && a[0] === 'route') {
    const f = s.findings.find((x) => x.id === a[1])
    if (!f || !OWNERS.includes(a[2])) throw new Error(`finding route <Xn> <${OWNERS.join('|')}>`)
    f.owner = a[2]
    save(s)
    return `${f.id} → ${f.owner}`
  }
  if (cmd === 'group') {
    const [name, ...rest] = a
    const ids = rest.flatMap((x) => x.split(',')).filter(Boolean)
    if (!name || !ids.length) throw new Error('group <name> <ACn...>')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) throw new Error(`group name "${name}": use lowercase words joined by hyphens (invoice-settings)`)
    const unknown = ids.filter((id) => !s.features.some((f) => f.id === id))
    if (unknown.length) throw new Error(`unknown criteria: ${unknown.join(', ')} — register them with feature first`)
    s.groups = { ...(s.groups || {}), [name]: ids }
    save(s)
    return `group ${name}: ${ids.length} criteria`
  }
  if (cmd === 'coverage') {
    const i = a.indexOf('--root')
    const root = i >= 0 ? path.resolve(a[i + 1]) : path.dirname(dir())
    return coverage(s, a.filter((x, j) => j !== i && j !== i + 1)[0], root)
  }
  if (cmd === 'finding' && a[0] === 'resolve') {
    const f = s.findings.find((x) => x.id === a[1])
    if (!f) throw new Error(`no finding ${a[1]}`)
    Object.assign(f, { status: 'resolved', note: a.slice(2).join(' '), resolvedAt: now() })
    save(s)
    return `${f.id} resolved`
  }
  if (cmd === 'timing') {
    const [ev, ...rest] = a
    const note = rest.join(' ')
    const tl = (s.timing ||= [])
    const last = tl[tl.length - 1]
    if (!ev) return timingSummary(s).text
    if (ev === 'start') {
      if (!note) throw new Error('timing start <stage>')
      const open = last && last.event !== 'end'
      if (open && (last.event === 'pause' || last.event === 'stop')) tl.push({ event: 'resume', at: now(), note })
      else if (open) {
        const since = lastActivity(s)
        if (since && mins(since, now()) > INTERRUPT_MIN) tl.push({ event: 'interrupted', at: now(), since, minutes: mins(since, now()), note })
        else return `already running (${note} continues the same run)` // e.g. the contract step right after the design import
      } else tl.push({ event: 'start', at: now(), note })
    } else if (ev === 'pause') {
      if (!note) throw new Error('timing pause <reason>')
      tl.push({ event: 'pause', at: now(), note })
    } else if (ev === 'end') {
      tl.push({ event: 'end', at: now(), note })
    } else if (ev === 'stop') {
      tl.push({ event: 'stop', at: now(), note: note || 'by the user' })
    } else throw new Error('timing start <stage> | timing pause <reason> | timing stop [note] | timing end [note] | timing')
    save(s)
    return timingSummary(s).text
  }
  if (cmd === 'log') {
    const [ph, ...text] = a
    if (!ph || !text.length) throw new Error('log <phase> <text...>')
    s.log = [...(s.log || []), { phase: ph, text: text.join(' '), at: now() }].slice(-200)
    // per-phase first/last activity, kept in full (the log above keeps only the last 200 lines)
    const sp = ((s.spans ||= {})[ph] ||= { first: now() })
    sp.last = now()
    // time spent: the gap since the previous activity line belongs to that line's phase
    if (s.lastLog && s.spans[s.lastLog.phase]) { const gap = mins(s.lastLog.at, now()); if (gap <= INTERRUPT_MIN) s.spans[s.lastLog.phase].busy = (s.spans[s.lastLog.phase].busy || 0) + gap }
    s.lastLog = { phase: ph, at: now() }
    save(s)
    return 'ok'
  }
  if (cmd === 'report') {
    const [k, ...text] = a
    if (!['lessons', 'size', 'cleanup', 'run'].includes(k) || !text.length) throw new Error('report <lessons|size|cleanup|run> <text...>')
    ;(s.reports ||= {})[k] = { text: text.join(' '), at: now() }
    save(s)
    return `report ${k} saved`
  }
  if (cmd === 'affected') return affected(s, a)
  if (cmd === 'reference') {
    const [slug, image, size] = a
    const m = size && size.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/)
    if (!slug || !image || !m) throw new Error('reference <slug> <image> <W>x<H> [--mask x,y,w,h ...] [state...]')
    const rest = a.slice(3), mi = rest.indexOf('--mask')
    const masks = mi >= 0 ? rest.slice(mi + 1).filter((x) => /^[\d.]+,[\d.]+,[\d.]+,[\d.]+$/.test(x)) : []
    const state = (mi >= 0 ? [...rest.slice(0, mi), ...rest.slice(mi + 1 + masks.length)] : rest).join(' ')
    if (!fs.existsSync(path.resolve(path.dirname(dir()), image))) throw new Error(`no file ${image} (relative to the project)`)
    ;(s.references ||= {})[slug] = { image, w: Number(m[1]), h: Number(m[2]), masks, state }
    save(s)
    return `reference ${slug}: ${image}, ${m[1]}×${m[2]} pt${masks.length ? `, ${masks.length} masked area(s)` : ''}`
  }
  if (cmd === 'references') return JSON.stringify(s.references || {})
  if (cmd === 'design-result') {
    const [slug, regions, defects, ...note] = a
    if (!s.references?.[slug] || !/^\d+$/.test(regions || '') || !/^\d+$/.test(defects || '')) throw new Error(`design-result <slug> <regions> <defects> [note] — slug must be a registered reference (${Object.keys(s.references || {}).join(', ') || 'none'})`)
    ;(s.design ||= {})[slug] = { regions: Number(regions), defects: Number(defects), note: note.join(' '), at: now() }
    save(s)
    return `${slug}: ${regions} region(s), ${defects} defect(s)`
  }
  if (cmd === 'components') {
    const [slug, f] = a
    if (!s.references?.[slug] || !f || !fs.existsSync(f)) throw new Error('components <slug> <components.json> — slug must be a registered reference')
    const list = JSON.parse(fs.readFileSync(f, 'utf8'))
    if (!Array.isArray(list) || !list.length || list.some((c) => !c.id || !c.kind)) throw new Error('components: a non-empty JSON list of {id, kind, name?, text?, file?}')
    ;(s.components ||= {})[slug] = list.map(({ status, evidence, ...c }) => ({ ...c, status: 'unchecked' }))
    save(s)
    return `${slug}: ${list.length} component(s) registered — every one must be checked`
  }
  if (cmd === 'component-results') {
    const [slug, f] = a
    const list = s.components?.[slug]
    if (!list || !f || !fs.existsSync(f)) throw new Error('component-results <slug> <results.json> — register the components first')
    const res = JSON.parse(fs.readFileSync(f, 'utf8')), errs = []
    for (const r of res) {
      const c = list.find((x) => x.id === r.id && x.kind === r.kind && (x.file || '') === (r.file || ''))
      if (!c) { errs.push(`${r.id} ${r.kind}: not in the inventory`); continue }
      if (!['present', 'missing', 'excluded'].includes(r.status)) { errs.push(`${r.id}: status must be present, missing or excluded`); continue }
      if (!r.evidence || String(r.evidence).trim().length < 4) { errs.push(`${r.id}: evidence required`); continue }
      if (r.status === 'missing' && !s.findings.some((x) => x.id === r.evidence.match(/X\d+/)?.[0] && x.text.startsWith(`DESIGN ${slug}:`))) { errs.push(`${r.id}: missing needs the id of its "DESIGN ${slug}:" finding in evidence`); continue }
      if (r.status === 'excluded' && !/\(Q\d+\)|CONTRACT|blocked/i.test(r.evidence)) { errs.push(`${r.id}: excluded needs the CONTRACT.md line or Q id that leaves it out`); continue }
      Object.assign(c, { status: r.status, evidence: r.evidence })
    }
    save(s)
    const n = (st) => list.filter((c) => c.status === st).length
    const msg = `${slug}: ${n('present')} present, ${n('missing')} missing, ${n('excluded')} excluded, ${n('unchecked')} unchecked of ${list.length}`
    if (errs.length) throw new Error(`${msg}\n${errs.join('\n')}`)
    return msg
  }
  if (cmd === 'design-check') {
    const refs = Object.keys(s.references || {})
    if (!refs.length) return 'no screen references — nothing to compare'
    const open = (slug) => s.findings.filter((f) => f.status === 'open' && f.text.startsWith(`DESIGN ${slug}:`)).length
    const comp = (slug) => { const l = s.components?.[slug]; return l ? { total: l.length, ok: l.filter((c) => ['present', 'excluded'].includes(c.status)).length, missing: l.filter((c) => c.status === 'missing').length, unchecked: l.filter((c) => c.status === 'unchecked').length } : null }
    const rows = refs.map((slug) => ({ slug, r: s.design?.[slug], open: open(slug), c: comp(slug) }))
    const bad = rows.filter((x) => !x.r || x.open || !x.c || x.c.missing || x.c.unchecked)
    const report = rows.map((x) => `- ${x.slug}: ${x.r ? `compared ${hhmm(x.r.at)}, ${x.r.regions} region(s), ${x.r.defects} defect(s)` : 'NOT COMPARED'}; components ${x.c ? `${x.c.ok}/${x.c.total} present or excluded${x.c.missing ? `, ${x.c.missing} MISSING` : ''}${x.c.unchecked ? `, ${x.c.unchecked} UNCHECKED` : ''}` : 'NOT INVENTORIED'}${x.open ? `, ${x.open} open DESIGN finding(s)` : ''}`).join('\n')
    if (bad.length) throw new Error(`design check: ${bad.length} of ${refs.length} screen(s) not done\n${report}`)
    return `design check: all ${refs.length} screen(s) compared, every component present or excluded, no open DESIGN finding\n${report}`
  }
  if (cmd === 'sim') {
    if (!a[0]) throw new Error('sim <udid>')
    s.sim = a[0]
    save(s)
    return `sim=${a[0]}`
  }
  if (cmd === 'handoff') {
    const [ph, ...text] = a
    if (!ph || !text.length) throw new Error('handoff <phase> <text...>')
    s.handoffs.push({ phase: ph, text: text.join(' '), at: now() })
    save(s)
    return 'ok'
  }
  if (cmd === 'brief') {
    // The briefing builder: what the next agent needs, generated from state, not from chat history.
    const open = s.findings.filter((f) => f.status === 'open')
    const who = a.filter((x) => OWNERS.includes(x))
    const line = (f) => `- ${f.id} [${f.severity}]${f.owner ? ` @${f.owner}` : ''} (${f.feature}) ${cap(f.text, 800)}`
    // With owners, the brief is that agent's inbox: its own findings to fix, everyone else's to leave alone.
    // Unrouted findings go to whoever holds "shared", so two parallel agents never both take one.
    const isMine = (f) => who.includes(f.owner) || (!f.owner && who.includes('shared'))
    const pend = open.filter((f) => f.pending)
    const live = open.filter((f) => !f.pending)
    const mine = who.length ? live.filter(isMine) : live
    const others = who.length ? live.filter((f) => !isMine(f)) : []
    return [
      `# Briefing${a[0] ? ` for ${a.join(' ')}` : ''}`,
      `PRD: ${s.prd} — contract: CONTRACT.md`,
      s.sim ? `Simulator: use ONLY -destination 'id=${s.sim}' (xcrun simctl … ${s.sim})` : 'Simulator: not set',
      '## Features',
      ...s.features.map((f) => `- ${f.id} [${f.status}] ${f.title}`),
      ...(s.groups ? ['## Feature groups', ...Object.entries(s.groups).map(([g, ids]) => `- ${g}: ${ids.join(', ')}`)] : []),
      `## ${who.length ? `Your inbox (${who.map((w) => `@${w}`).join(' ')}${who.includes('shared') ? ' and unrouted' : ''})` : 'Open findings'} (${mine.length}) — fix every one`,
      ...mine.map(line),
      ...(others.length ? [`## Open findings routed to other agents (${others.length}) — do NOT fix these`, ...others.map(line)] : []),
      ...(pend.length ? [`## Fixed, awaiting a device test (${pend.length}) — do NOT fix again; a test runner resolves each when its test passes`, ...pend.map((f) => `${line(f)} — test: ${f.pending}`)] : []),
      '## Last handoffs',
      ...s.handoffs.slice(-3).map((h) => `- [${h.phase}] ${cap(h.text)}`),
    ].join('\n')
  }
  if (cmd === 'status') {
    const count = (xs, k, v) => xs.filter((x) => x[k] === v).length
    return JSON.stringify({
      features: s.features.length,
      passing: count(s.features, 'status', 'passing'),
      blocked: count(s.features, 'status', 'blocked'),
      openFindings: count(s.findings, 'status', 'open'),
      blocking: s.findings.filter((f) => f.status === 'open' && f.severity !== 'minor').length,
      // a finding fixed but awaiting its device test still blocks, but is nobody's to fix: not in any owner's count
      blockingByOwner: Object.fromEntries([...OWNERS, 'unrouted'].map((o) => [o, s.findings.filter((f) => f.status === 'open' && !f.pending && f.severity !== 'minor' && (f.owner || 'unrouted') === o).length])),
      pendingDevice: s.findings.filter((f) => f.status === 'open' && f.pending).length,
      handoffs: s.handoffs.length,
    })
  }
  throw new Error(`unknown command: ${[cmd, ...a].join(' ')}`)
}

function selftest() {
  process.env.PIPELINE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-'))
  assert.equal(run(['init', 'PRD.md']), 'ok')
  assert.equal(run(['init', 'PRD.md']), 'already initialised')
  run(['feature', 'AC1', 'failing', 'bill', '100', 'totals'])
  const id = run(['finding', 'add', 'AC1', 'major', 'rounding', 'wrong'])
  assert.equal(id, 'X1')
  assert.match(run(['brief', 'build']), /X1 \[major\] \(AC1\) rounding wrong/) // findings reach the next agent
  run(['finding', 'resolve', 'X1', 'fixed'])
  assert.match(run(['brief']), /Open findings \(0\)/)
  run(['feature', 'AC1', 'passing'])
  run(['handoff', 'audit', 'all good'])
  assert.deepEqual(JSON.parse(run(['status'])), { features: 1, passing: 1, blocked: 0, openFindings: 0, blocking: 0, blockingByOwner: { logic: 0, ui: 0, shared: 0, unrouted: 0 }, pendingDevice: 0, handoffs: 1 })
  run(['log', 'build', 'running', 'xcodebuild', 'test'])
  const md = fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8')
  assert.match(md, /\*\*build\*\* — running xcodebuild test/) // live activity reaches the human view
  assert.match(md, /1\/1 passing/)
  run(['sim', 'ABC-123'])
  assert.match(run(['brief']), /id=ABC-123/)
  assert.equal(run(['claim']), 'claimed')
  assert.throws(() => run(['claim']), /another run holds/) // a second concurrent run is refused
  run(['release'])
  assert.equal(run(['claim']), 'claimed')
  assert.throws(() => run(['feature', 'AC1', 'done']), /failing\|passing/)
  assert.throws(() => run(['finding', 'add', 'AC1', 'huge', 'x']), /critical\|major\|minor/)
  // 20 processes writing at once: none may be lost, finding ids must be unique
  const me = process.argv[1]
  execSync(`for i in $(seq 1 20); do node "${me}" finding add AC1 major "parallel $i" & done; wait`, { env: process.env })
  const ids = JSON.parse(fs.readFileSync(file(), 'utf8')).findings.map((f) => f.id)
  assert.equal(ids.length, 21)
  assert.equal(new Set(ids).size, 21)
  assert.equal(JSON.parse(run(['status'])).blocking, 20)

  // owners and inboxes: each agent sees its own findings to fix and the others' marked "do NOT fix"
  const xu = run(['finding', 'add', 'AC1', 'major', '@ui', 'button', 'clipped'])
  const xl = run(['finding', 'add', 'AC1', 'critical', '@logic', 'total', 'wrong'])
  const bu = run(['brief', 'test', 'ui'])
  assert.match(bu.split('do NOT fix')[0], new RegExp(`${xu} \\[major\\] @ui`))
  assert.match(bu.split('do NOT fix')[1], new RegExp(`${xl} \\[critical\\] @logic`))
  assert.doesNotMatch(bu.split('do NOT fix')[0], /parallel 1\b/) // unrouted: not the ui agent's…
  assert.match(run(['brief', 'test', 'ui', 'shared']).split('do NOT fix')[0], /parallel 1\b/) // …but the shared holder's
  assert.deepEqual(JSON.parse(run(['status'])).blockingByOwner, { logic: 1, ui: 1, shared: 0, unrouted: 20 })
  // pending: fixed but only a device test can prove it — still blocking, out of every fixer's inbox
  const xp = run(['finding', 'add', 'AC1', 'major', '@logic', 'only', 'on', 'device'])
  const s0 = JSON.parse(run(['status']))
  assert.match(run(['finding', 'pending', xp, 'checkout AC1 AC2']), /next test round runs "checkout AC1 AC2"/)
  const s1 = JSON.parse(run(['status']))
  assert.equal(s1.blocking, s0.blocking); assert.equal(s1.blockingByOwner.logic, s0.blockingByOwner.logic - 1); assert.equal(s1.pendingDevice, 1)
  const bl = run(['brief', 'test', 'logic'])
  assert.doesNotMatch(bl.split('awaiting a device test')[0], new RegExp(`${xp} `)) // not in the inbox…
  assert.match(bl.split('awaiting a device test')[1], new RegExp(`${xp} .* — test: checkout AC1 AC2`)) // …listed apart
  run(['finding', 'resolve', xp, 'checkout AC1 AC2 passes on ios'])
  assert.equal(JSON.parse(run(['status'])).pendingDevice, 0)
  run(['finding', 'route', xl, 'ui'])
  assert.match(run(['brief', 'test', 'ui']).split('do NOT fix')[0], new RegExp(`${xl} \\[critical\\] @ui`))
  assert.throws(() => run(['finding', 'route', xl, 'backend']), /logic\|ui\|shared/)

  // groups and coverage
  run(['feature', 'AC2', 'failing', 'second'])
  run(['feature', 'AC12', 'failing', 'twelfth'])
  run(['group', 'items', 'AC1,AC2'])
  assert.throws(() => run(['group', 'x', 'AC99']), /unknown criteria: AC99/)
  assert.throws(() => run(['group', 'Items & Clients', 'AC1']), /lowercase words joined by hyphens/)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'))
  fs.mkdirSync(path.join(root, 'test/domain'), { recursive: true })
  fs.writeFileSync(path.join(root, 'test/domain/calc_test.dart'), "test('AC1 total', () {}); test('AC120 other', () {});")
  fs.mkdirSync(path.join(root, 'lib'))
  fs.writeFileSync(path.join(root, 'lib/x.dart'), '// AC2 mentioned outside a test folder does not count')
  assert.throws(() => run(['coverage', 'items', '--root', root]), /NOT COVERED: AC2$/m) // AC120 is not AC12, lib/ is not a test
  fs.writeFileSync(path.join(root, 'test/domain/b_test.dart'), "testWidgets('AC2 shows it', (t) async {}); // testAC12_x")
  assert.match(run(['coverage', '--root', root]), /3\/3 criteria covered/)
  // a blocked criterion (key not provided) needs no test, never counts as blocking, and shows in PROGRESS.md
  assert.throws(() => run(['feature', 'AC2', 'blocked']), /blocked <reason/)
  fs.rmSync(path.join(root, 'test/domain/b_test.dart'))
  assert.throws(() => run(['coverage', '--root', root]), /NOT COVERED: AC2, AC12/)
  run(['feature', 'AC2', 'blocked', 'needs', 'MAPS_API_KEY'])
  run(['feature', 'AC12', 'blocked', 'needs', 'store', 'product', 'ids'])
  assert.match(run(['coverage', '--root', root]), /1\/1 criteria covered \(2 blocked, not tested\)/)
  assert.match(fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8'), /🚫 AC2 second — BLOCKED: needs MAPS_API_KEY/)
  run(['feature', 'AC12', 'failing']) // the key arrived: back to normal
  assert.equal(JSON.parse(run(['status'])).blocked, 1)
  fs.writeFileSync(path.join(root, 'test/domain/b_test.dart'), "testWidgets('AC2 shows it', (t) async {}); // testAC12_x")
  const xb = run(['finding', 'add', 'AC1', 'major', '@ui', 'tap', 'opens', 'Apple', 'viewer'])
  const before = JSON.parse(run(['status'])).blocking
  assert.match(run(['finding', 'block', xb, 'MKLookAroundViewController has no public API to stop it']), /not blocking/)
  assert.equal(JSON.parse(run(['status'])).blocking, before - 1)
  assert.throws(() => run(['finding', 'block', xb]), /finding block <Xn> <reason/)
  run(['report', 'lessons', 'No new rules: nothing repeated'])
  const rmd = fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8')
  assert.match(rmd, /## Blocked findings[\s\S]*MKLookAroundViewController/)
  assert.match(rmd, /## Lessons \(proposed rules — you decide\)[^\n]*\nNo new rules: nothing repeated/)
  assert.throws(() => run(['report', 'notes', 'x']), /report <lessons\|size\|cleanup\|run>/)

  // scope: a change outside the allowed globs is reported, one inside is not
  execSync('git init -q && git -c user.email=a@b -c user.name=t commit -q --allow-empty -m base && mkdir -p lib/ui lib/domain && echo a > lib/ui/v.dart', { cwd: root })
  const cwd = process.cwd()
  process.chdir(root)
  try {
    assert.match(run(['scope', 'HEAD', 'lib/ui/**', 'test/**', 'lib/x.dart']), /in scope: 4 changed/)
    fs.writeFileSync('lib/domain/rule.dart', 'x')
    assert.throws(() => run(['scope', 'HEAD', 'lib/ui/**']), /OUT OF SCOPE \(\d\): .*lib\/domain\/rule\.dart/)
    // a branch is checked before merging: only its committed files count
    const g = 'git -c user.email=a@b -c user.name=t'
    execSync(`git add -A && ${g} commit -qm base2 && git checkout -qb qa && echo b > lib/ui/v.dart && ${g} commit -qam ui && git checkout -q -`)
    const base2 = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    assert.match(run(['scope', `${base2}..qa`, 'lib/ui/**']), /in scope: 1 changed/)
    assert.throws(() => run(['scope', `${base2}..qa`, 'lib/domain/**']), /OUT OF SCOPE \(1\): lib\/ui\/v\.dart/)
  } finally {
    process.chdir(cwd)
  }

  // decisions: every question listed with its options; selected = the user's answer, else the recommended one, and how
  const dq = fs.mkdtempSync(path.join(os.tmpdir(), 'dec-')), oldDir = process.env.PIPELINE_DIR
  process.env.PIPELINE_DIR = path.join(dq, '.pipeline'); fs.mkdirSync(process.env.PIPELINE_DIR)
  const q = (id, ask) => ({ id, area: 'logic', header: id, question: `${id}?`, affects: 'AC1', ask, why: ask ? 'only the user knows' : 'a safe default', options: [{ label: 'Yes (Recommended)', description: 'a' }, { label: 'No', description: 'b' }] })
  fs.writeFileSync(path.join(dq, 'q.json'), JSON.stringify([q('Q1', true), q('Q2', true), q('Q3', false), q('Q4', true), q('Q5', true), q('Q6', true)]))
  assert.throws(() => decisions(dq), /no questions recorded/)
  fs.writeFileSync(path.join(dq, 'bad.json'), JSON.stringify([{ ...q('Q1', true), header: 'Thirteen char' }, { ...q('Q1', false), options: [{ label: 'Yes', description: 'a' }, { label: 'No', description: 'b' }] }]))
  assert.throws(() => decisions(dq, ['--questions', path.join(dq, 'bad.json')]), (e) => /Q1: header "Thirteen char" must be 1–12/.test(e.message) && /Q1: missing or repeated id/.test(e.message) && /first option's label must end with " \(Recommended\)"/.test(e.message))
  assert.match(decisions(dq, ['--questions', path.join(dq, 'q.json')]), /6 question\(s\), 4 asked — user 0, skipped 0, no reply 0, unattended 0, waiting 4, not asked 2/) // Q6: a fifth "ask" is not asked
  fs.writeFileSync(path.join(dq, 'a.json'), JSON.stringify([{ id: 'Q1', answer: 'No', isDefault: false, by: 'user' }, { id: 'Q2', answer: 'Yes (Recommended)', isDefault: true, by: 'timeout' }]))
  assert.match(decisions(dq, ['--answers', path.join(dq, 'a.json')]), /user 1, skipped 2, no reply 1, unattended 0, waiting 0, not asked 2/) // Q2 timed out; Q4, Q5 skipped → recommended
  const dmd = fs.readFileSync(path.join(dq, 'DECISIONS.md'), 'utf8')
  assert.match(dmd, /## Q1 · Q1 \(logic\) · asked[\s\S]*\*\*Selected: No\*\* — the user chose it/)
  assert.match(dmd, /## Q2[\s\S]*\*\*Selected: Yes\*\* — no reply within 5 minutes/)
  assert.match(dmd, /## Q3 · Q3 \(logic\)\n[\s\S]*Why not asked: a safe default[\s\S]*\*\*Selected: Yes\*\* — not asked/)
  assert.match(dmd, /## Q4[\s\S]*asked, not answered → recommended option/)
  if (oldDir === undefined) delete process.env.PIPELINE_DIR; else process.env.PIPELINE_DIR = oldDir

  // stray: only the allowlist may be added after the baseline; the user's earlier files never count
  const pj = fs.mkdtempSync(path.join(os.tmpdir(), 'stray-'))
  const gg = (c) => execSync(c, { cwd: pj, stdio: 'ignore' })
  const put0 = (f, t = 'x') => { fs.mkdirSync(path.dirname(path.join(pj, f)), { recursive: true }); fs.writeFileSync(path.join(pj, f), t) }
  put0('notes-from-user.md'); put0('.gitignore', '.pipeline/\nbuild/\n')
  gg('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm "app-factory: baseline"')
  for (const f of ['lib/main.dart', 'integration_test/shell_test.dart', 'CONTRACT.md', 'design/assets/a.webp', 'build/x', '.pipeline/state.json']) put0(f)
  assert.match(run(['stray', '--root', pj]), /no stray files \(4 added since the baseline, all allowed\)/)
  put0('LOGIC.md'); put0('scratch/t.txt')
  assert.throws(() => run(['stray', '--root', pj]), /STRAY FILES \(2\).*LOGIC\.md.*scratch\/t\.txt/)

  // design references: registered with frame size and masks; design-check fails until every screen is compared with no open DESIGN finding
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-'))
  const prevDir = process.env.PIPELINE_DIR
  process.env.PIPELINE_DIR = path.join(dp, '.pipeline'); run(['init', 'PRD.md'])
  fs.mkdirSync(path.join(dp, 'mock')); fs.writeFileSync(path.join(dp, 'mock/premium.png'), 'x'); fs.writeFileSync(path.join(dp, 'mock/rate.png'), 'x')
  assert.equal(run(['design-check']), 'no screen references — nothing to compare')
  assert.throws(() => run(['reference', 'premium', 'mock/none.png', '375x812']), /no file mock\/none\.png/)
  assert.match(run(['reference', 'premium', 'mock/premium.png', '375x812', '--mask', '0,0,375,44', '0,778,375,34', 'Free', 'user,', 'monthly', 'selected']), /premium: mock\/premium\.png, 375×812 pt, 2 masked area\(s\)/)
  run(['reference', 'rate', 'mock/rate.png', '375x812'])
  assert.deepEqual(JSON.parse(run(['references'])).premium, { image: 'mock/premium.png', w: 375, h: 812, masks: ['0,0,375,44', '0,778,375,34'], state: 'Free user, monthly selected' })
  assert.throws(() => run(['design-check']), /2 of 2 screen\(s\) not done[\s\S]*premium: NOT COMPARED/)
  run(['design-result', 'premium', '4', '1', 'title 6 pt lower'])
  run(['finding', 'add', '-', 'major', '@ui', 'DESIGN premium: title — design: y 120; app: y 126'])
  run(['design-result', 'rate', '0', '0'])
  assert.throws(() => run(['design-check']), /2 of 2 screen\(s\) not done[\s\S]*premium: compared .*, 4 region\(s\), 1 defect\(s\); components NOT INVENTORIED, 1 open DESIGN finding/)
  // component inventory: every component must be checked; missing only with its DESIGN finding; excluded only with the contract line
  const cj = (name, v) => { const f = path.join(dp, name); fs.writeFileSync(f, JSON.stringify(v)); return f }
  const inv = [{ id: '1:1', kind: 'text', text: 'Upgrade to Pro' }, { id: '1:2', kind: 'button', name: 'btn' }, { id: '1:3', kind: 'icon', file: 'crown.svg' }]
  assert.match(run(['components', 'premium', cj('p.json', inv)]), /3 component\(s\) registered/)
  run(['components', 'rate', cj('r.json', [{ id: '2:1', kind: 'text', text: 'Rate us' }])])
  assert.throws(() => run(['component-results', 'premium', cj('pr1.json', [{ id: '1:1', kind: 'text', status: 'present', evidence: 'x' }])]), /evidence required/)
  assert.throws(() => run(['component-results', 'premium', cj('pr2.json', [{ id: '1:2', kind: 'button', status: 'missing', evidence: 'not there' }])]), /missing needs the id of its "DESIGN premium:" finding/)
  assert.throws(() => run(['component-results', 'premium', cj('pr3.json', [{ id: '1:3', kind: 'icon', file: 'crown.svg', status: 'excluded', evidence: 'looked unneeded' }])]), /excluded needs the CONTRACT\.md line/)
  const xd = JSON.parse(fs.readFileSync(file(), 'utf8')).findings.at(-1).id
  assert.match(run(['component-results', 'premium', cj('pr4.json', [{ id: '1:1', kind: 'text', status: 'present', evidence: 'element: @e8 Button label="Upgrade to Pro"' }, { id: '1:2', kind: 'button', status: 'missing', evidence: `${xd} — no button` }])]), /premium: 1 present, 1 missing, 0 excluded, 1 unchecked of 3/)
  run(['component-results', 'rate', cj('rr.json', [{ id: '2:1', kind: 'text', status: 'present', evidence: 'element: @e3 Text text="Rate us"' }])])
  assert.throws(() => run(['design-check']), /premium: .*components 1\/3 present or excluded, 1 MISSING, 1 UNCHECKED/)
  run(['component-results', 'premium', cj('pr5.json', [{ id: '1:2', kind: 'button', status: 'present', evidence: 'fixed: @e9 Button label="Upgrade"' }, { id: '1:3', kind: 'icon', file: 'crown.svg', status: 'excluded', evidence: 'CONTRACT.md AC41: crown removed (Q12)' }])])
  assert.throws(() => run(['design-result', 'home', '0', '0']), /must be a registered reference/)
  run(['finding', 'resolve', JSON.parse(fs.readFileSync(file(), 'utf8')).findings.at(-1).id, 'region gone'])
  assert.match(run(['design-check']), /all 2 screen\(s\) compared, every component present or excluded, no open DESIGN finding/)
  assert.match(fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8'), /## Design comparison \(2\/2 screens\)[\s\S]*\| premium \| mock\/premium\.png \(375×812\) \| .* \| 4 \| 1 \| 3\/3 \|/)
  const types = [{ name: 'iPhone 17', id: 'a', runtime: 'r', w: 402, h: 874, scale: 3 }, { name: 'iPhone 11 Pro', id: 'b', runtime: 'r', w: 375, h: 812, scale: 3 }, { name: 'iPhone SE (3rd generation)', id: 'c', runtime: 'r', w: 375, h: 667, scale: 2 }]
  assert.equal(JSON.parse(designDevice(375, 812, types)).type, 'iPhone 11 Pro')
  assert.equal(JSON.parse(designDevice(375, 812, types)).name, 'app-factory-design-375x812')
  assert.throws(() => designDevice(390, 844, types), /no simulator with a 390×844 pt screen — available: 402×874, 375×812, 375×667/)
  process.env.PIPELINE_DIR = prevDir

  // assets: an icon set with a wrong size, transparency, Flutter's default, no adaptive icon, and an @3x load — all reported
  const ap = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-'))
  const pngOf = (w, colorType, extra = Buffer.alloc(0)) => { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(w, 20); b[24] = 8; b[25] = colorType; return Buffer.concat([b, extra]) }
  const putA = (f, data) => { fs.mkdirSync(path.dirname(path.join(ap, f)), { recursive: true }); fs.writeFileSync(path.join(ap, f), data) }
  putA('ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json', JSON.stringify({ images: [{ size: '20x20', scale: '3x', filename: 'a.png' }, { size: '1024x1024', scale: '1x', filename: 'b.png' }] }))
  putA('ios/Runner/Assets.xcassets/AppIcon.appiconset/a.png', pngOf(60, 2))
  putA('ios/Runner/Assets.xcassets/AppIcon.appiconset/b.png', pngOf(1024, 6)) // RGBA: transparent
  for (const [d, k] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) { putA(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, pngOf(48 * k, 6)); putA(`android/app/src/main/res/drawable-${d}/ic_launcher_foreground.png`, pngOf(108 * k, 6)) }
  putA('android/app/src/main/AndroidManifest.xml', '<application android:icon="@mipmap/ic_launcher">')
  putA('lib/ui/a.dart', "Image.asset('assets/v2/map@3x.png')")
  assert.throws(() => run(['assets', '--root', ap]), (e) => /b\.png: has transparency/.test(e.message) && /no adaptive icon/.test(e.message) && /lib\/ui\/a\.dart:1 loads an @2x\/@3x file/.test(e.message) && !/a\.png/.test(e.message))
  putA('ios/Runner/Assets.xcassets/AppIcon.appiconset/b.png', pngOf(1024, 2)); putA('lib/ui/a.dart', "Image.asset('assets/v2/map.png')")
  putA('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', '<adaptive-icon><background android:drawable="@color/x"/><foreground android:drawable="@drawable/ic_launcher_foreground"/></adaptive-icon>')
  assert.throws(() => run(['assets', '--root', ap]), /not made by app-icon\.mjs/)
  const h = (f) => crypto.createHash('md5').update(fs.readFileSync(path.join(ap, f))).digest('hex')
  const madeF = ['ios/Runner/Assets.xcassets/AppIcon.appiconset/a.png', 'ios/Runner/Assets.xcassets/AppIcon.appiconset/b.png']
  putA('.pipeline/app-icon.json', JSON.stringify({ source: 'icon.png', sourcePx: 1024, upscaled: false, preRounded: false, fill: null, made: Object.fromEntries(madeF.map((f) => [f, h(f)])) }))
  assert.match(run(['assets', '--root', ap]), /assets ok — iOS: 2 icon sizes; Android: launcher \+ adaptive icon; icon from icon\.png \(1024 px\)/)
  putA('ios/Runner/Assets.xcassets/AppIcon.appiconset/b.png', pngOf(1024, 2, Buffer.from('edited')))
  assert.throws(() => run(['assets', '--root', ap]), /b\.png: changed after app-icon\.mjs made it/)
  putA('.pipeline/app-icon.json', JSON.stringify({ none: true, decision: 'Q4' })) // no icon given: the recorded choice passes, an @3x load still fails
  assert.match(run(['assets', '--root', ap]), /assets ok — no app icon given — Flutter's default icon kept \(Q4\)/)
  putA('lib/ui/a.dart', "Image.asset('assets/v2/map@3x.png')")
  assert.throws(() => run(['assets', '--root', ap]), /loads an @2x\/@3x file/)

  // shard: largest file first, onto the lightest runner
  put0('integration_test/a_test.dart', 'x'.repeat(900)); put0('integration_test/b_test.dart', 'x'.repeat(500)); put0('integration_test/c_test.dart', 'x'.repeat(400)); put0('integration_test/helpers.dart', 'x'.repeat(9999))
  assert.deepEqual(JSON.parse(run(['shard', '2', '--root', pj])), [['integration_test/a_test.dart', 'integration_test/shell_test.dart'], ['integration_test/b_test.dart', 'integration_test/c_test.dart']])

  // affected: a file belongs to the groups whose commits touched it; a file no group touched affects everything
  const pa = fs.mkdtempSync(path.join(os.tmpdir(), 'aff-'))
  const ga = (c) => execSync(c, { cwd: pa, stdio: 'ignore' })
  const put1 = (f, t) => { fs.mkdirSync(path.dirname(path.join(pa, f)), { recursive: true }); fs.writeFileSync(path.join(pa, f), t) }
  const ci = (m) => ga(`git add -A && git -c user.email=t@t -c user.name=t commit -qm "${m}"`)
  ga('git init -q'); put1('lib/main.dart', 'm'); ci('app-factory: baseline')
  put1('lib/domain/items.dart', 'a'); ci('app-factory: logic items')
  put1('lib/ui/settings.dart', 'b'); ci('app-factory: ui settings')
  run(['group', 'items', 'AC1,AC2']); run(['feature', 'AC5', 'failing', 'settings']); run(['group', 'settings', 'AC5'])
  const head = execSync('git rev-parse HEAD', { cwd: pa, encoding: 'utf8' }).trim()
  put1('lib/domain/items.dart', 'a2')
  const af = JSON.parse(run(['affected', head, '--root', pa]))
  assert.deepEqual(af.criteria, ['AC1']) // AC2 is blocked: never re-run
  assert.equal(af.name, '\\b(AC1)\\b')
  put1('lib/main.dart', 'm2')
  assert.deepEqual(JSON.parse(run(['affected', head, '--root', pa])).criteria, ['AC1', 'AC5', 'AC12'])
  execSync('git checkout -q -- .', { cwd: pa })
  assert.equal(JSON.parse(run(['affected', head, '--root', pa])).name, null)
  // per platform, since its last run (earlier steps left open findings on AC1: they always re-run, so check the reasons)
  const aff = (p) => JSON.parse(run(['affected', '--platform', p, '--root', pa]))
  const because = (x, rx) => x.why.some((w) => rx.test(w))
  put1('integration_test/items_test.dart', "testWidgets('F1 Items AC1', (t) async {});"); ci('qa r1 ios 1')
  put1('integration_test/settings_test.dart', "testWidgets('F2 Settings AC5', (t) async {});"); ci('qa r1 android android')
  let ia = aff('ios'), an = aff('android')
  assert.ok(ia.criteria.includes('AC5') && because(ia, /settings_test\.dart: changed by qa r1 android/), 'iOS re-runs the test file Android changed')
  assert.ok(!an.criteria.includes('AC5') && !because(an, /items_test|settings_test/), 'Android: its own test change already passed there; iOS\'s ran on Android in the same round')
  run(['finding', 'add', 'AC7', 'major', '@ui', 'F3 Totals AC7: Device: iOS simulator, wrong total'])
  const fid = JSON.parse(fs.readFileSync(path.join(dir(), 'state.json'), 'utf8')).findings.at(-1).id
  run(['feature', 'AC7', 'failing', 'totals'])
  ia = aff('ios'); an = aff('android')
  assert.ok(ia.criteria.includes('AC7') && !an.criteria.includes('AC7'), 'an open finding seen on iOS re-runs on iOS only')
  put1('lib/ui/items.dart', 'fixed'); ci(`app-factory: fix ui ${fid}`); run(['finding', 'resolve', fid, 'ok'])
  ia = aff('ios'); an = aff('android')
  assert.ok(ia.criteria.includes('AC7') && an.criteria.includes('AC7') && because(an, new RegExp(`fix ${fid}`)), 'a fix re-runs its finding\'s criteria on both platforms')
  put1('android/app/src/main/kotlin/A.kt', 'k'); ci('app-factory: fix shared X999')
  assert.deepEqual([aff('android').all, aff('ios').all], ['android/app/src/main/kotlin/A.kt changed', null], 'native Android code: everything on Android, nothing more on iOS')
  put1('lib/ui/other.dart', 'x'); ci('tidy up')
  assert.match(aff('ios').all, /names no group or finding/, 'an untraceable app change: everything')

  // deps: a package nothing imports is reported; SDK packages, dev tools used by analysis_options and the icon font rule are handled
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'deps-'))
  fs.mkdirSync(path.join(app, 'lib/domain'), { recursive: true })
  fs.mkdirSync(path.join(app, 'test'))
  fs.writeFileSync(path.join(app, 'pubspec.yaml'), `name: x
dependencies:
  flutter:
    sdk: flutter
  decimal: ^3.0.0
  http: ^1.2.0
  cupertino_icons: ^1.0.8
  share_plus:
    version: ^10.0.0
dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  mocktail: ^1.0.0
flutter:
  uses-material-design: true
`)
  fs.writeFileSync(path.join(app, 'analysis_options.yaml'), 'include: package:flutter_lints/flutter.yaml\n')
  fs.writeFileSync(path.join(app, 'lib/domain/money.dart'), "import 'package:decimal/decimal.dart';\nimport 'package:share_plus/share_plus.dart';\n")
  fs.writeFileSync(path.join(app, 'test/a_test.dart'), "import 'package:http/http.dart'; // a test import does not make a runtime package used\n")
  assert.throws(() => run(['deps', '--root', app]), (e) => /UNUSED: http, cupertino_icons, mocktail —/.test(e.message) && /decimal: 1 file/.test(e.message) && /flutter_lints \(dev\): analysis_options/.test(e.message) && !/flutter_test/.test(e.message))
  fs.writeFileSync(path.join(app, 'lib/x.dart'), "import 'package:http/http.dart';\nfinal i = CupertinoIcons.add;\n")
  fs.writeFileSync(path.join(app, 'test/b_test.dart'), "import 'package:mocktail/mocktail.dart';\n")
  assert.match(run(['deps', '--root', app]), /6 package\(s\)/)

  // timing: start → pause for questions → resume → end; an interruption is not counted as working time
  const T = (iso, args) => { process.env.PIPELINE_NOW = iso; try { return run(args) } finally { delete process.env.PIPELINE_NOW } }
  T('2026-10-05T09:00:00Z', ['timing', 'start', 'design-import'])
  T('2026-10-05T09:01:00Z', ['log', 'design-import', 'importing'])
  assert.match(T('2026-10-05T09:12:00Z', ['timing', 'start', 'contract']), /already running/) // same call, 11 min of import
  T('2026-10-05T09:20:00Z', ['log', 'contract', 'writing the contract'])
  T('2026-10-05T09:30:00Z', ['timing', 'pause', 'questions in the chat'])
  assert.match(T('2026-10-05T09:40:00Z', ['timing']), /paused · elapsed 30 min · working 30 min/)
  T('2026-10-05T09:45:00Z', ['timing', 'start', 'build']) // resumes after 15 min of questions
  T('2026-10-05T10:00:00Z', ['log', 'build', 'building'])
  T('2026-10-05T12:00:00Z', ['timing', 'start', 'build']) // that call died at 10:00 — 2 h with no activity
  T('2026-10-05T12:30:00Z', ['log', 'audit', 'auditing'])
  assert.match(T('2026-10-05T13:00:00Z', ['timing', 'end']), /ended · elapsed 4 h 0 min · working 1 h 45 min · paused for questions 15 min · interrupted 2 h 0 min/)
  const tmd = fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8')
  assert.match(tmd, /## Timing — ended/)
  assert.match(tmd, /paused: questions in the chat/)
  assert.match(tmd, /\| contract \| .* \| .* \| 0 min \|/)
  // time spent per phase: gaps go to the phase of the earlier line; a gap over 30 min is an interruption
  T('2026-10-05T14:00:00Z', ['log', 'test-a', 'start']); T('2026-10-05T14:20:00Z', ['log', 'test-b', 'start']); T('2026-10-05T14:30:00Z', ['log', 'test-a', 'again']); T('2026-10-05T15:30:00Z', ['log', 'test-b', 'after a long gap'])
  const busy = fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8')
  assert.match(busy, /\| test-a \| .* \| .* \| 20 min \|/) // 14:00→14:20 counted; 14:30→15:30 (60 min) is an interruption
  assert.match(busy, /\| test-b \| .* \| .* \| 10 min \|/)
  assert.throws(() => run(['timing', 'start']), /timing start <stage>/)

  // devices: one machine-wide lock; the same project may claim again; another project is refused; only the holder releases
  process.env.APP_FACTORY_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'afhome-'))
  assert.equal(run(['devices', 'status']), 'free')
  assert.match(run(['devices', 'claim', '/p/a']), /devices claimed for \/p\/a/)
  assert.match(run(['devices', 'claim', '/p/a']), /already held by \/p\/a/)
  assert.throws(() => run(['devices', 'claim', '/p/b']), /in use by \/p\/a since/)
  assert.throws(() => run(['devices', 'release', '/p/b']), /held by \/p\/a, not \/p\/b/)
  assert.match(run(['devices', 'release', '/p/a']), /released by \/p\/a/)
  assert.match(run(['devices', 'claim', '/p/b']), /claimed for \/p\/b/)

  // colors: only the imported palette may appear in lib/
  assert.match(run(['colors', '--root', app]), /nothing to check/) // no design imported
  fs.mkdirSync(path.join(app, 'design'))
  fs.writeFileSync(path.join(app, 'design/colors.json'), JSON.stringify({ colors: [{ hex: '#1A73E8', name: 'primary' }, { hex: '#FFFFFF', name: 'surface' }] }))
  fs.writeFileSync(path.join(app, 'lib/theme.dart'), 'const a = Color(0xFF1A73E8); const b = Color.fromARGB(255, 255, 255, 255); const t = Colors.transparent;\n')
  assert.match(run(['colors', '--root', app]), /all colours in lib\/ come from design\/colors.json \(2 design colours\)/)
  fs.writeFileSync(path.join(app, 'lib/bad.dart'), 'final x = Color(0xFF1A74E8);\nfinal y = Colors.red;\nfinal z = Color.fromRGBO(0, 0, 0, 1);\n')
  assert.throws(() => run(['colors', '--root', app]), (e) => /3 colour\(s\)/.test(e.message) && /lib\/bad.dart:1 #1A74E8/.test(e.message) && /lib\/bad.dart:2 Colors.red/.test(e.message) && /lib\/bad.dart:3 #000000/.test(e.message))

  // cleanup: deletes the run's leftovers only; keeps source, state and unknown files; devices only with the lock
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-'))
  const g = (c) => execSync(c, { cwd: proj, stdio: 'ignore' })
  const put = (f) => { fs.mkdirSync(path.dirname(path.join(proj, f)), { recursive: true }); fs.writeFileSync(path.join(proj, f), 'x') }
  fs.writeFileSync(path.join(proj, '.gitignore'), '.pipeline/\nbuild/\n.dart_tool/\ncoverage/\n')
  put('lib/main.dart')
  g('git init -q && git -c user.email=t@t -c user.name=t add -A && git -c user.email=t@t -c user.name=t commit -qm base')
  g(`git worktree add -q "${proj}.worktrees/ui" -b qa-r1-ui`)
  for (const f of ['build/ios/x', '.dart_tool/flutter_build/y', 'coverage/lcov.info', 'ios/Pods/Manifest.lock', 'android/build/x', 'android/app/build/y', '.pipeline/probe-backup/a.dart', '.pipeline/screenshots/s.png', '.pipeline/state.json', 'lib/view.dart.bak', 'notes.txt']) put(f)
  assert.match(run(['cleanup', proj]), /cleanup: freed/) // not done: evidence stays
  assert.ok(fs.existsSync(path.join(proj, '.pipeline/screenshots/s.png')) && /qa-r1-ui/.test(execSync("git branch --list 'qa-r*'", { cwd: proj, encoding: 'utf8' })))
  assert.match(run(['cleanup', proj, '--done']), /cleanup: freed .* — deleted \d+ item/)
  for (const f of ['build', '.dart_tool', 'coverage', 'ios/Pods', 'android/build', 'android/app/build', '.pipeline/probe-backup', '.pipeline/screenshots', 'lib/view.dart.bak']) assert.ok(!fs.existsSync(path.join(proj, f)), `${f} should be gone`)
  assert.ok(!fs.existsSync(`${proj}.worktrees`), 'worktree folder should be gone')
  for (const f of ['lib/main.dart', '.pipeline/state.json', 'notes.txt']) assert.ok(fs.existsSync(path.join(proj, f)), `${f} should stay`)
  assert.equal(execSync("git branch --list 'qa-r*'", { cwd: proj, encoding: 'utf8' }).trim(), '')
  assert.match(fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8'), /## Cleanup[\s\S]*notes.txt — untracked and not a known leftover/)
  run(['cleanup', proj, '--devices']) // the device lock is held by /p/b (above): no device may be touched
  assert.match(fs.readFileSync(path.join(dir(), 'PROGRESS.md'), 'utf8'), /device lock is held by \/p\/b, not by this project; none deleted/)

  // stop / resume: frees the locks and records the stop; resume takes them back; the stop time is not "questions"
  process.env.APP_FACTORY_NO_DEVICES = '1'
  process.env.PIPELINE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-stop-'))
  process.env.APP_FACTORY_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'afhome-stop-'))
  run(['init', 'PRD.md'])
  T('2026-10-05T10:00:00Z', ['timing', 'start', 'build'])
  run(['claim'])
  run(['devices', 'claim', '/p/s'])
  const st = T('2026-10-05T10:30:00Z', ['stop', '/p/s', '--run', 'wf_abc123'])
  assert.match(st, /device lock released/)
  assert.match(st, /run lock released/)
  assert.ok(!fs.existsSync(lock()))
  assert.equal(run(['devices', 'status']), 'free')
  assert.match(run(['timing']), /^stopped by the user · elapsed 30 min · working 30 min/)
  assert.throws(() => run(['devices', 'claim', '/p/other']) && run(['resume', '/p/s']), /in use by \/p\/other/) // another project took the devices: resume refused…
  assert.ok(!fs.existsSync(lock())) // …and the run lock is not left behind
  run(['devices', 'release', '/p/other'])
  assert.equal(T('2026-10-05T11:30:00Z', ['resume', '/p/s']), 'resumed: run lock taken, devices claimed; relaunch workflow run wf_abc123')
  assert.ok(fs.existsSync(lock()))
  assert.match(run(['devices', 'status']), /in use by \/p\/s/)
  assert.match(T('2026-10-05T12:00:00Z', ['timing']), /^running · elapsed 2 h 0 min · working 1 h 0 min · paused for questions 0 min · stopped by the user 1 h 0 min/)
  assert.throws(() => run(['resume', '/p/s']), /not stopped with `stop`/)
  run(['devices', 'release', '/p/s']); run(['devices', 'claim', '/p/x'])
  assert.match(run(['stop', '/p/s']), /devices left alone — they are held by \/p\/x/)
  // stale: a run that prints, finishes, hangs, or loses its app or device
  const log = '00:00 +0: loading /p/integration_test/a_test.dart\nRunning Xcode build...\nXcode build done. 24.0s\n00:41 +0: F1 First launch AC1\n'
  assert.equal(staleOf(log, 3, true, true).state, 'running')
  assert.deepEqual([staleOf(log, 11, true, true).state, staleOf(log, 11, true, true).file, staleOf(log, 11, true, true).test], ['stalled', '/p/integration_test/a_test.dart', 'F1 First launch AC1'])
  assert.match(staleOf(log, 2.5, false, true).why, /app is not running/)
  assert.equal(staleOf('Running Xcode build...\n', 2.5, false, true).state, 'running', 'still building: no app yet is normal')
  assert.match(staleOf(log, 0.5, true, false).why, /device is not running/)
  assert.equal(staleOf(`${log}00:59 +1: All tests passed!\n`, 30, false, false).state, 'finished')
  const sl = path.join(os.tmpdir(), `stale-${process.pid}.log`); fs.writeFileSync(sl, log); assert.equal(JSON.parse(run(['stale', sl])).state, 'running'); fs.rmSync(sl)
  // layout-lint: frame copies flagged, normal sizes and marked lines not
  const ll = layoutLint([['lib/ui/a.dart', ['SizedBox(width: 375, height: 44)', 'Container(height: 812)', 'width: MediaQuery.sizeOf(context).width * 0.12,', 'Positioned(top: 780, left: 16, child: b)', 'Positioned(top: 8, right: 8, child: badge)', 'SizedBox(width: 48, height: 48)', 'ConstrainedBox(constraints: BoxConstraints(maxWidth: 600)) // layout-ok: tablet cap', '// layout-ok: the map is full-bleed', 'SizedBox(height: 900)', 'ConstrainedBox(constraints: BoxConstraints(maxWidth: 342))'].join('\n')]])
  assert.deepEqual(ll.map((x) => x.split(':')[1]), ['1', '2', '3', '4'])
  // portability: our glob matcher agrees with Node's path.matchesGlob on every pattern the plugin uses
  const pats = [...ALLOWED, 'integration_test/**', 'dart_test.yaml', 'ios/Podfile.lock', 'ios/Runner.xcworkspace/**', 'ios/Flutter/**', 'lib/domain/**', 'test/ui/**', 'lib/main.dart']
  const files = ['lib/a.dart', 'lib/ui/x/y.dart', 'libx/a.dart', 'test/ui/fits_screen.dart', 'integration_test/a_test.dart', 'dart_test.yaml', 'ios/Runner.xcworkspace/contents.xcworkspacedata', 'ios/Flutter/Generated.xcconfig', 'ios/Podfile.lock', 'design/screens/a.context.md', 'CONTRACT.md', 'notes.txt', 'scratch/t.txt', 'pubspec.yaml', '.gitignore', 'README.md', 'lib/main.dart', 'lib/domain/m.dart']
  if (typeof path.matchesGlob === 'function') for (const g of pats) for (const f of files) assert.equal(globMatch(f, g), path.matchesGlob(f, g), `${f} ~ ${g}`)
  const host = JSON.parse(run(['host'])); assert.equal(host.os, process.platform); assert.equal(typeof host.ios, 'boolean')
  assert.ok(+run(['freemem']) > 0 && +run(['freedisk', os.tmpdir()]) >= 0)
  assert.equal(needMem(2500, 1839, true), '1839', 'macOS only reports (v4: emulator ran at 1,839 MB free)')
  assert.throws(() => needMem(2500, 1800, false), /only 1800 MB .* start nothing/)
  assert.equal(needMem(2500, 6000, false), '6000')
  assert.ok(+run(['freemem', '--need', '1']) > 0)
  assert.ok(flutterFor('/Users/mach/Flutter Workspace/flutter/bin/cache/dart-sdk/bin/dart /Users/mach/Flutter Workspace/flutter/bin/cache/flutter_tools.snapshot test integration_test/a_test.dart -d emulator-5554 -r expanded', 'emulator-5554'))
  assert.ok(flutterFor(`/bin/zsh -c eval 'set -o pipefail; "/home/u/flutter/bin/flutter" test integration_test/ -d emulator-5554 | tee /tmp/flow-emulator-5554.log'`, 'emulator-5554'))
  assert.ok(!flutterFor('node /p/scripts/pipeline.mjs app-restart emulator-5554 --platform android --app com.example.flutter_app', 'emulator-5554'), 'mentions flutter only in the app id')
  assert.ok(!flutterFor('/home/u/flutter/bin/flutter test -d emulator-55541', 'emulator-5554'), 'another emulator')
  assert.ok(!flutterFor('tail -f /tmp/flow-emulator-5554.log', 'emulator-5554'))
  assert.deepEqual(JSON.parse(designDevice(375, 812, null, true)).configIni, { 'hw.lcd.width': 1125, 'hw.lcd.height': 2436, 'hw.lcd.density': 480 })
  return 'selftest ok'
}

try {
  const argv = process.argv.slice(2)
  console.log(argv[0] === 'selftest' ? selftest() : locked(() => run(argv)))
} catch (e) {
  console.error(`pipeline: ${e.message}`)
  process.exit(1)
}
