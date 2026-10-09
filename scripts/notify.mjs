#!/usr/bin/env node
// Notification hook (hooks/hooks.json, async): a desktop notification when Claude needs you or has finished.
//   Notification (permission prompt, question dialog, agent needs input) → its message
//   PreToolUse AskUserQuestion → the question
//   Stop → app-factory's questions waiting (the 5-minute fallback is running), or "Finished — ready for your review"
// macOS: alerter if installed (click → VS Code), else osascript; skipped while VS Code or a terminal is in front.
// Linux: notify-send. Windows: a PowerShell balloon. A system without the tool: nothing happens, never an error.
// Not sent when the user's own settings already run a notification hook (attention.sh): Claude Code runs plugin and
// settings hooks side by side (code.claude.com/docs/en/hooks), so both would fire.
//   node notify.mjs            (reads the hook JSON on stdin)
//   node notify.mjs selftest
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// The message for one hook event, or null for none. (`last_assistant_message`: documented Stop input.)
export function message(e) {
  if (e.hook_event_name === 'Notification') return { text: e.message || 'Claude needs your input', sound: 'Glass' }
  if (e.hook_event_name === 'PreToolUse') return { text: (e.tool_input && e.tool_input.questions && e.tool_input.questions[0] && e.tool_input.questions[0].question) || 'Claude has a question', sound: 'Glass' }
  if (e.hook_event_name === 'Stop') {
    if (e.stop_hook_active) return null
    const last = String(e.last_assistant_message || '')
    if (/no reply in 5 minutes I continue with the recommended options/i.test(last)) return { text: 'app-factory: questions are waiting — no reply in 5 minutes uses the recommended options', sound: 'Glass' }
    return { text: 'Finished — ready for your review', sound: 'Hero' }
  }
  return null
}

// A notification hook the user already runs from their own settings (their attention.sh), so this one stays quiet.
export function ownHook(home = os.homedir()) {
  for (const f of ['settings.json', 'settings.local.json']) {
    let s; try { s = JSON.parse(fs.readFileSync(path.join(home, '.claude', f), 'utf8')) } catch { continue }
    const cmds = Object.values(s.hooks || {}).flat().flatMap((m) => (m.hooks || []).map((h) => h.command || ''))
    if (cmds.some((c) => /attention\.sh|notify\.mjs/.test(c))) return true
  }
  return false
}

// The command that shows it on this system, or null when there is no way to.
export function command(n, platform = process.platform, has = (t) => !spawnSync(t, ['-h'], { stdio: 'ignore' }).error) {
  if (platform === 'darwin') return has('alerter')
    ? ['alerter', ['--title', 'Claude Code', '--message', n.text, '--sender', 'com.microsoft.VSCode', '--sound', n.sound, '--timeout', '30', '--json']]
    : ['osascript', ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title "Claude Code" sound name (item 2 of argv)', '-e', 'end run', n.text, n.sound]]
  if (platform === 'linux') return has('notify-send') ? ['notify-send', ['Claude Code', n.text]] : null
  if (platform === 'win32') {
    const t = n.text.replace(/'/g, "''")
    return ['powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(10000, 'Claude Code', '${t}', 'Info'); Start-Sleep -Seconds 11; $n.Dispose()`]]
  }
  return null
}

// macOS: the front app; VS Code, Cursor or a terminal in front means the user is already looking.
function frontIsEditor() {
  if (process.platform !== 'darwin') return false
  const front = spawnSync('lsappinfo', ['front'], { encoding: 'utf8' }).stdout.trim()
  const name = (spawnSync('lsappinfo', ['info', '-only', 'name', front], { encoding: 'utf8' }).stdout.match(/"name"="([^"]+)"/) || [])[1] || ''
  return /^(Code|Cursor|Terminal|iTerm2|Ghostty)$/.test(name)
}

function selftest() {
  assert.equal(message({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' }).text, 'Claude needs your permission to use Bash')
  assert.equal(message({ hook_event_name: 'PreToolUse', tool_input: { questions: [{ question: 'Which Figma file?' }] } }).text, 'Which Figma file?')
  assert.match(message({ hook_event_name: 'Stop', last_assistant_message: 'Reply like Q1: 2, or type your own answer. With no reply in 5 minutes I continue with the recommended options.' }).text, /questions are waiting/)
  assert.equal(message({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }).sound, 'Hero')
  assert.equal(message({ hook_event_name: 'Stop', stop_hook_active: true }), null)
  const n = { text: "it's done", sound: 'Hero' }
  assert.equal(command(n, 'darwin', (t) => t === 'alerter')[0], 'alerter')
  assert.deepEqual(command(n, 'darwin', () => false).slice(0, 1), ['osascript'])
  assert.deepEqual(command(n, 'linux', (t) => t === 'notify-send'), ['notify-send', ['Claude Code', "it's done"]])
  assert.equal(command(n, 'linux', () => false), null, 'no notifier: nothing, no error')
  assert.match(command(n, 'win32')[1][2], /ShowBalloonTip\(10000, 'Claude Code', 'it''s done'/, 'quotes escaped for PowerShell')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-'))
  assert.equal(ownHook(home), false)
  fs.mkdirSync(path.join(home, '.claude')); fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: '/x/attention.sh' }] }] } }))
  assert.equal(ownHook(home), true)
  return 'selftest ok'
}

const direct = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct && process.argv[2] === 'selftest') console.log(selftest())
else if (direct) {
  let raw = ''
  process.stdin.on('data', (d) => (raw += d))
  process.stdin.on('end', () => {
    try {
      const n = message(JSON.parse(raw))
      if (!n || ownHook() || (!process.env.APP_FACTORY_NOTIFY_DRY && frontIsEditor())) return
      const c = command(n)
      if (!c) return
      if (process.env.APP_FACTORY_NOTIFY_DRY) { console.log(JSON.stringify(c)); return }
      const [cmd, args] = c
      if (cmd === 'alerter') { // waits until clicked or 30 s; a click brings VS Code forward
        const r = spawnSync(cmd, args, { encoding: 'utf8' })
        if (/"activationType"\s*:\s*"contentsClicked"/.test(r.stdout || '')) spawnSync('open', ['-a', 'Visual Studio Code'])
      } else spawn(cmd, args, { stdio: 'ignore', detached: false }).on('error', () => {})
    } catch { /* never break a session over a notification */ }
  })
}
