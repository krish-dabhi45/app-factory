#!/usr/bin/env node
// MCP server (stdio) with one tool, read_screen <serial>: the elements on an Android device's screen, read through
// Maestro's on-device driver, as one line each with the centre to tap at with `adb shell input tap`.
//   node android-screen.mjs            — the server (.mcp.json starts it)
//   node android-screen.mjs selftest
// Why not mobile-mcp or `maestro mcp` itself (measured 2026-10-19 on a Moto e22s, Android 12, a Flutter debug build):
// mobile-mcp's element list took 8.5–9.0 s per screen, Maestro's 0.29–0.32 s; but `maestro mcp` keeps a dead
// driver's session for good (McpMaestroSessionManager: computeIfAbsent, cleared only at exit — every later call fails
// "Device server died … UNAVAILABLE"), and its driver dies whenever anything else takes Android's single UiAutomation
// connection (probe's `uiautomator dump`, mobilecli's DeviceServer: "UiAutomationService … already registered").
// So this server runs `maestro mcp` as a child, and on a dead driver stops whatever holds UiAutomation on that
// device, starts a new child and asks once more. Only inspect_screen is used: Maestro's launchApp would also grant
// every permission and its cheat_sheet calls Maestro's server; launching and taps stay adb's.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { find, onPath } from './configure.mjs'

export const MAESTRO_VERSION = '2.11.0'
// the plugin's own copy (pipeline.mjs maestro-install), so a user's own Maestro of another version is never touched
export const maestroDir = (home = os.homedir()) => path.join(process.env.APP_FACTORY_HOME || path.join(home, '.app-factory'), `maestro-${MAESTRO_VERSION}`)
export function maestroBin(platform = process.platform) {
  const own = path.join(maestroDir(), 'bin', platform === 'win32' ? 'maestro.bat' : 'maestro')
  return fs.existsSync(own) ? own : onPath('maestro')
}

// Maestro's compact JSON (ui_schema + elements, children under "c") → one line per element that has something to
// read or tap; plain containers are left out. Bounds are device pixels, the same as `adb shell input tap` takes.
export function flatten(text, serial) {
  let j
  try { j = JSON.parse(text) } catch { return text }
  const lines = []
  const walk = (n) => {
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(n.b || '')
    const said = [['text', n.txt], ['label', n.a11y], ['hint', n.hint], ['value', n.val], ['id', n.rid]].filter(([, v]) => v).map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    const flags = ['clickable', 'checked', 'selected', 'focused', 'scroll'].filter((k) => n[k]).concat(n.enabled === false ? ['disabled'] : [])
    // an element partly off the left/top edge has negative bounds: its centre is that of the part on screen
    const [x1, y1, x2, y2] = b ? b.slice(1).map(Number).map((v, k) => (k < 2 ? Math.max(0, v) : v)) : []
    // System UI's own containers (status bar, navigation bar) carry nothing to read: left out unless they say something
    const chrome = /^com\.android\.systemui:id\//.test(n.rid || '') && !n.txt && !n.a11y
    if (b && x2 > x1 && y2 > y1 && !chrome && (said.length || flags.length)) {
      lines.push(`${(n.cls || '').split('.').pop() || 'View'} ${said.join(' ')} at=${Math.round((x1 + x2) / 2)},${Math.round((y1 + y2) / 2)} size=${x2 - x1}x${y2 - y1}${flags.map((f) => ` [${f}]`).join('')}`.replace(/ {2,}/g, ' '))
    }
    for (const c of n.c || []) walk(c)
  }
  for (const e of j.elements || []) walk(e)
  return [`${lines.length} elements on ${serial}. Tap one at its "at": adb -s ${serial} shell input tap <x> <y>`, ...lines].join('\n')
}
// Maestro's driver is gone or another process holds UiAutomation: worth one restart and one more try
export const deadDriver = (t) => /Device server died|did not start up in time|UNAVAILABLE|instrumentation could not be initialized|already registered|Connection refused/i.test(String(t))

// ───────────────────────────── the child `maestro mcp` ─────────────────────────────
function startChild() {
  const bin = maestroBin()
  if (!bin) throw new Error(`Maestro ${MAESTRO_VERSION} is not installed: run \`node "${path.join(path.dirname(fileURLToPath(import.meta.url)), 'pipeline.mjs')}" maestro-install\` (once per computer), then call read_screen again`)
  const t = find(), sep = path.delimiter
  const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' }
  if (t.javaHome) { env.JAVA_HOME = t.javaHome; env.PATH = path.join(t.javaHome, 'bin') + sep + env.PATH }
  if (t.androidSdk) env.PATH = path.join(t.androidSdk, 'platform-tools') + sep + env.PATH
  const p = spawn(bin, ['mcp', '--no-viewer'], { env, stdio: ['pipe', 'pipe', 'ignore'], shell: process.platform === 'win32' })
  const c = { p, buf: '', id: 0, waiting: new Map(), dead: false, kill: () => { try { p.kill() } catch { /* gone */ } } }
  p.stdout.on('data', (d) => {
    c.buf += d
    let i
    while ((i = c.buf.indexOf('\n')) >= 0) {
      const line = c.buf.slice(0, i); c.buf = c.buf.slice(i + 1)
      let m; try { m = JSON.parse(line) } catch { continue }
      if (m.id != null && c.waiting.has(m.id)) { c.waiting.get(m.id)(m); c.waiting.delete(m.id) }
    }
  })
  const gone = () => { c.dead = true; for (const r of c.waiting.values()) r({ error: { message: 'Device server died: the Maestro process exited' } }); c.waiting.clear() }
  p.on('exit', gone); p.on('error', gone)
  c.rpc = (method, params) => new Promise((res) => { const k = ++c.id; c.waiting.set(k, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: k, method, params }) + '\n') })
  c.ready = c.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'app-factory', version: MAESTRO_VERSION } })
    .then(() => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'))
  return c
}
// whatever holds UiAutomation on that device: Maestro's own driver and mobile-mcp's mobilecli DeviceServer
function freeUiAutomation(serial) {
  const sdk = find().androidSdk, adb = sdk ? path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb'
  for (const cmd of [['am', 'force-stop', 'dev.mobile.maestro'], ['pkill', '-f', 'com.mobilenext.mobilecli.DeviceServer']]) {
    try { execFileSync(adb, ['-s', serial, 'shell', ...cmd], { stdio: 'ignore', timeout: 15000 }) } catch { /* not running */ }
  }
}
// Reads through one `maestro mcp` child shared by every caller (several testers can share this server). A dead
// driver is restarted once, however many reads find it dead at the same time: only the read that finds the dead
// child still current replaces it, and a device is freed once per dead child — a second read never kills the child
// the first just started (seen on the Moto with two reads at once: child #2 killed 0.3 s after its start), and never
// stops the driver that child is starting on the same device.
// Idle: no read for IDLE_MS → the Maestro process (175 MB on this Mac, measured) and its driver on the device are
// stopped; the next read starts them again (13–17 s on the Moto). The plugin's memory checks never count Maestro, so it
// must not stay up through the builds and test runs that follow a by-hand phase.
export const IDLE_MS = 120000
export function makeReader(start, free, idleMs = IDLE_MS) {
  let child = null, active = 0, idle = null
  const used = new Set(), freedFor = new Map()
  const once = async (serial) => {
    if (!child || child.dead) child = start()
    const c = child
    await c.ready
    const r = await c.rpc('tools/call', { name: 'inspect_screen', arguments: { device_id: serial } })
    const text = r.error ? r.error.message : (r.result?.content || []).map((x) => x.text || '').join('\n')
    return { c, ok: !r.error && !r.result?.isError, text }
  }
  async function read(serial) {
    clearTimeout(idle); active++
    try { return await read1(serial) } finally { if (--active === 0) { idle = setTimeout(close, idleMs); idle.unref?.() } }
  }
  async function read1(serial) {
    // first read on a device: clear whatever holds UiAutomation first — with mobilecli's DeviceServer up, Maestro spent
    // ~30 s failing to start before the restart below (a 44.8 s first read on the Moto)
    if (!used.has(serial)) { used.add(serial); free(serial) }
    let r = await once(serial)
    if (r.ok) return { ok: true, text: flatten(r.text, serial) }
    if (!deadDriver(r.text)) return r
    const s = Date.now()
    if (child === r.c) { r.c.kill(); child = null }
    if (freedFor.get(serial) !== r.c) { freedFor.set(serial, r.c); free(serial) }
    r = await once(serial)
    return r.ok ? { ok: true, text: `(Maestro's driver had stopped — restarted in ${Math.round((Date.now() - s) / 1000)} s)\n` + flatten(r.text, serial) } : r
  }
  // the driver outlives `maestro mcp` on the device (seen on the Moto): stopped, so the device is left as it was found
  const close = () => { clearTimeout(idle); child?.kill(); child = null; for (const x of used) free(x) }
  return { read, close }
}

// ───────────────────────────── this MCP server ─────────────────────────────
const TOOL = {
  name: 'read_screen',
  description: 'Android only (phone or emulator): every element on the screen now — its text, label, hint, value, id, flags — one per line, with the centre to tap at ("at=x,y", device pixels). Act with adb: `adb -s <serial> shell input tap <x> <y>`, `input keyevent KEYCODE_BACK`, `input swipe <x1> <y1> <x2> <y2> 300`, `input text <text, spaces as %s>`. About 0.3 s a read once its driver runs (the first read on a device starts it: 10–20 s). For iOS use mobile-mcp.',
  inputSchema: { type: 'object', properties: { serial: { type: 'string', description: 'the adb serial (adb devices)' } }, required: ['serial'] },
}
function serve() {
  const reader = makeReader(startChild, freeUiAutomation)
  let buf = ''
  const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n')
  process.stdin.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      let m; try { m = JSON.parse(line) } catch { continue }
      if (m.id == null) continue // a notification
      if (m.method === 'initialize') send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'android-screen', version: MAESTRO_VERSION } } })
      else if (m.method === 'tools/list') send({ id: m.id, result: { tools: [TOOL] } })
      else if (m.method === 'tools/call' && m.params?.name === TOOL.name) {
        const serial = m.params.arguments?.serial
        if (!serial) { send({ id: m.id, result: { isError: true, content: [{ type: 'text', text: 'serial is required (adb devices)' }] } }); continue }
        reader.read(serial).then((r) => send({ id: m.id, result: { isError: !r.ok, content: [{ type: 'text', text: r.text }] } }),
          (e) => send({ id: m.id, result: { isError: true, content: [{ type: 'text', text: e.message }] } }))
      } else if (m.method === 'ping') send({ id: m.id, result: {} })
      else send({ id: m.id, error: { code: -32601, message: `no such method: ${m.method}` } })
    }
  })
  process.stdin.on('end', () => { reader.close(); process.exit(0) })
}

async function selftest() {
  // taken from inspect_screen on the Moto e22s (demo_app's home and its Login form, profile build)
  const home = JSON.stringify({ ui_schema: {}, elements: [{ b: '[0,0][720,1600]', c: [{ b: '[11,379][237,466]', cls: 'android.view.View', c: [{ b: '[11,379][237,466]', a11y: 'Form Test', cls: 'android.widget.Button', clickable: true }] }, { b: '[28,202][692,300]', hint: 'Email', cls: 'android.widget.EditText', clickable: true, focused: true }, { b: '[0,0][0,0]', txt: 'hidden' }, { b: '[5,5][9,9]', txt: 'Off', enabled: false }, { b: '[0,0][720,76]', rid: 'com.android.systemui:id/status_bar' }, { b: '[88,1516][223,1600]', rid: 'com.android.systemui:id/back', a11y: 'Back', clickable: true }] }] })
  const out = flatten(home, 'ZD2228DZJ5').split('\n')
  assert.match(out[0], /^4 elements on ZD2228DZJ5/)
  assert.equal(out[1], 'Button label="Form Test" at=124,423 size=226x87 [clickable]')
  assert.equal(out[2], 'EditText hint="Email" at=360,251 size=664x98 [clickable] [focused]', 'a field\'s hint is kept (mobile-mcp\'s list lost it on a profile build)')
  assert.equal(out[3], 'View text="Off" at=7,7 size=4x4 [disabled]')
  assert.ok(!out.join('\n').includes('hidden'), 'a zero-size element has no centre to tap')
  assert.ok(!out.join('\n').includes('status_bar'), 'System UI containers with nothing to say are left out')
  assert.equal(out[4], 'View label="Back" id="com.android.systemui:id/back" at=156,1558 size=135x84 [clickable]', 'the navigation bar\'s Back stays')
  assert.equal(flatten('Failed to inspect screen: boom', 's'), 'Failed to inspect screen: boom')
  for (const t of ["Failed to inspect screen: Device server died during 'deviceInfo' on ZD2228DZJ5 (248ms since last byte): StatusRuntimeException: UNAVAILABLE",
    'Failed to run flow: Maestro Android driver did not start up in time on emulator [ ZD2228DZJ5 ] (driver port 7001)',
    'java.lang.IllegalStateException: UiAutomationService android.accessibilityservice.IAccessibilityServiceClient$Stub$Proxy@e4b605ealready registered!']) assert.ok(deadDriver(t), t)
  // Maestro's own words for an unplugged phone (fault test T1, 2026-10-19): an error to report, never a restart
  assert.ok(!deadDriver('Failed to inspect screen: Device with id ZD2228DZJ5 is not connected'))
  // partly off the left edge: the centre of the part on screen; wholly off: nothing to tap
  const off = flatten(JSON.stringify({ elements: [{ b: '[-40,200][100,260]', txt: 'Partly off' }, { b: '[-200,0][-10,50]', txt: 'Gone left' }] }), 's').split('\n')
  assert.equal(off[1], 'View text="Partly off" at=50,230 size=100x60')
  assert.equal(off.length, 2, 'an element wholly off screen is left out')

  // the restart, with fake children: a reply after 5 ms; a killed child answers what a dead process does
  const DEAD = { result: { isError: true, content: [{ text: "Failed to inspect screen: Device server died during 'deviceInfo' on X: StatusRuntimeException: UNAVAILABLE" }] } }
  const OK = { result: { content: [{ text: JSON.stringify({ elements: [{ b: '[0,0][10,10]', txt: 'ok' }] }) }] } }
  const fake = (reply) => {
    const log = { started: 0, killed: [], freed: [] }
    const start = () => {
      const c = { n: ++log.started, dead: false, ready: Promise.resolve() }
      c.kill = () => { log.killed.push(c.n); c.dead = true }
      c.rpc = (m, prm) => new Promise((res) => setTimeout(() => res(c.dead ? { error: { message: 'Device server died: the Maestro process exited' } } : reply(c.n, prm.arguments.device_id)), 5))
      return c
    }
    return { log, reader: makeReader(start, (x) => log.freed.push(x)) }
  }
  const firstDead = (n) => (n === 1 ? DEAD : OK)
  // two reads on one device at once, its driver dead: one restart (the old code started a third child, killing the second)
  let f = fake(firstDead), rs = await Promise.all([f.reader.read('X'), f.reader.read('X')])
  assert.deepEqual(rs.map((x) => x.ok), [true, true])
  assert.deepEqual([f.log.started, f.log.killed, f.log.freed], [2, [1], ['X', 'X']], 'one child replaced, the device freed once for it')
  // two devices sharing the dead child: still one new child; each device freed once for the dead one
  f = fake(firstDead); rs = await Promise.all([f.reader.read('X'), f.reader.read('Y')])
  assert.deepEqual(rs.map((x) => x.ok), [true, true])
  assert.deepEqual([f.log.started, f.log.killed, [...f.log.freed].sort()], [2, [1], ['X', 'X', 'Y', 'Y']])
  // the retry dead too: an error back, no third try
  f = fake(() => DEAD); rs = await f.reader.read('X')
  assert.deepEqual([rs.ok, f.log.started], [false, 2])
  // an unplugged phone: one try, no restart
  f = fake(() => ({ result: { isError: true, content: [{ text: 'Failed to inspect screen: Device with id X is not connected' }] } })); rs = await f.reader.read('X')
  assert.deepEqual([rs.ok, f.log.started, f.log.killed], [false, 1, []])
  // idle: no read for idleMs → the child stopped and the device freed; the next read starts a new one
  { const lg = { started: 0, killed: [], freed: [] }
    const st = () => { const c = { n: ++lg.started, dead: false, ready: Promise.resolve() }; c.kill = () => { lg.killed.push(c.n); c.dead = true }; c.rpc = () => new Promise((res) => setTimeout(() => res(OK), 5)); return c }
    const rd = makeReader(st, (x) => lg.freed.push(x), 30)
    await rd.read('X'); await new Promise((r) => setTimeout(r, 10)); await rd.read('X')
    assert.deepEqual([lg.started, lg.killed], [1, []], 'reads closer together than idle keep one child')
    await new Promise((r) => setTimeout(r, 60))
    assert.deepEqual([lg.killed, lg.freed], [[1], ['X', 'X']], 'idle: the child stopped, the device freed')
    await rd.read('X'); assert.equal(lg.started, 2, 'the next read starts a new child'); rd.close() }
  // close: the child stopped and every device used freed
  f = fake(() => OK); await f.reader.read('X'); f.reader.close()
  assert.deepEqual([f.log.killed, f.log.freed], [[1], ['X', 'X']])
  assert.equal(maestroDir('/h').endsWith(`maestro-${MAESTRO_VERSION}`), true)
  return 'android-screen selftest ok'
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'selftest') selftest().then((x) => console.log(x), (e) => { console.error(e); process.exit(1) })
  else serve()
}
