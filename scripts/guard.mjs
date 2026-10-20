#!/usr/bin/env node
// PreToolUse hook (Bash): in an app-factory project (one with .pipeline/, or a .worktrees/ checkout of one), refuses the
// system commands that can freeze or crash the computer, or kill and delete what is the user's — for the chat and
// every agent. An agent told to "make room" or "restart the device" must never improvise these: memory is freed only by
// stopping the plugin's own devices, and a stuck app or device is handled by pipeline.mjs app-restart / device-reset.
//   root:       sudo, doas, pkexec, su
//   power:      reboot, shutdown, poweroff, halt, telinit, init 0/6, systemctl (except status/show/is-active/list-units),
//               loginctl terminate/kill/poweroff/reboot, launchctl reboot/bootout, System Events restart/shut down
//   kernel:     drop_caches, sysrq, writes into /proc or /sys, sysctl -w/-p/x=y, swapoff, swapon, mkswap, purge
//   processes:  pkill, killall, killall5, xkill, xargs kill, kill of -1/0/1/a process group/a computed list ($(…));
//               kill of a literal pid, one variable ($!, $PID) or a job (%1) — the agent's own process — is allowed
//   disks:      rm -r of /, /*, ~ or $HOME, --no-preserve-root, mkfs, fdisk, parted, wipefs, dd of=/dev/, > /dev/<disk>,
//               chmod/chown -R on /, a fork bomb
//   devices:    simctl delete/erase, simctl shutdown all, avdmanager delete (only pipeline.mjs cleanup/device-reset may),
//               rm of ~/Library/Developer/CoreSimulator or ~/.android (every simulator's and emulator's files)
//   node guard.mjs            (reads the hook JSON on stdin)
//   node guard.mjs selftest
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { projectOf } from './secrets.mjs'

const WHAT = {
  root: 'a root command',
  power: 'restarting, shutting down or reconfiguring the computer',
  kernel: 'changing the kernel\'s memory or swap',
  processes: 'killing processes by name or in bulk',
  disks: 'erasing a disk or the whole home folder',
  devices: 'deleting or erasing a simulator or emulator',
}

const bodies = (cmd) => [...cmd.matchAll(/\b(?:ba|z|da)?sh\s+(?:-\w+\s+)*-c\s+(['"])([\s\S]*?)\1/g), ...cmd.matchAll(/\beval\s+(['"])([\s\S]*?)\1/g)].map((m) => m[2])
// the command with heredoc bodies and quoted strings removed: what a shell would actually run as commands
const bare = (cmd) => cmd.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1(?=\s|$)/g, '').replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""')
const WRAP = /^(?:\w+=\S*\s+|exec\s+|nohup\s+|env\s+(?:-\S+\s+)*|time\s+|command\s+|builtin\s+|nice\s+(?:-n\s*-?\d+\s+|-\d+\s+)?|ionice\s+(?:-\S+\s+)*|timeout\s+(?:-\S+\s+)*\S+\s+|stdbuf\s+(?:-\S+\s+)*)+/

// The reason a command is refused, or null.
export function refuse(cmd) {
  for (const b of bodies(cmd)) { const r = refuse(b); if (r) return r }
  const raw = cmd, b = bare(cmd)
  if (/drop_caches|sysrq/.test(raw)) return 'kernel'
  if (/(?:>|\btee\s+(?:-a\s+)?)\s*\/(?:proc|sys)\//.test(b)) return 'kernel'
  if (/--no-preserve-root/.test(raw)) return 'disks'
  if (/\brm\s+(?:-{1,2}[\w-]+\s+)*(?:-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\s+(?:-{1,2}[\w-]+\s+)*["']?(?:\/\*?|~\/?\*?|\$\{?HOME\}?\/?\*?)["']?(?=\s|$|[;&|)])/.test(raw)) return 'disks'
  if (/\b(?:chmod|chown)\s+(?:-\S+\s+)*-R\s+(?:\S+\s+)?\/(?=\s|$)/.test(raw)) return 'disks'
  if (/\bdd\b[^;&|\n]*\bof=\/dev\//.test(b) || />\s*\/dev\/(?:sd|nvme|hd|vd|disk|mmcblk)/.test(b)) return 'disks'
  if (/:\(\)\s*\{[^}]*:\s*\|\s*:/.test(raw)) return 'processes'
  if (/\bSystem Events\b[^\n]*\b(?:restart|shut down|log out)\b/i.test(raw)) return 'power'
  if (/\brm\b[^;&|\n]*(?:Library\/Developer\/CoreSimulator|(?:^|[\s"'\/~}])\.android(?:\/|[\s"']|$))/.test(raw)) return 'devices' // every simulator's or emulator's files
  if (/\bsimctl\s+(?:delete|erase)\b|\bsimctl\s+shutdown\s+all\b|\bavdmanager(?:\.bat)?\s+(?:-\S+\s+)*delete\b/.test(b)) return 'devices'
  if (/\bxargs\b[^;&|\n]*\bkill\b/.test(b)) return 'processes'
  for (let seg of b.split(/\|\||&&|[;|&\n(`]|\$\(/)) {
    seg = seg.trim().replace(WRAP, '')
    const w = seg.split(/\s+/), cmd0 = path.basename(w[0] || ''), args = w.slice(1)
    if (/^(?:sudo|doas|pkexec|su)$/.test(cmd0)) return 'root'
    if (/^(?:reboot|shutdown|poweroff|halt|telinit)$/.test(cmd0) || (cmd0 === 'init' && /^[06]$/.test(args[0]))) return 'power'
    if (cmd0 === 'systemctl' && !/^(?:status|show|is-active|is-enabled|list-units|list-unit-files|--version)$/.test(args.find((x) => !x.startsWith('-')) || '')) return 'power'
    if (cmd0 === 'loginctl' && /^(?:terminate|kill|poweroff|reboot|suspend|hibernate)/.test(args.find((x) => !x.startsWith('-')) || '')) return 'power'
    if (cmd0 === 'launchctl' && /^(?:reboot|bootout)$/.test(args[0] || '')) return 'power'
    if (/^(?:swapoff|swapon|mkswap|purge|wipefs|fdisk|sfdisk|parted)$/.test(cmd0) || /^mkfs(?:\.\w+)?$/.test(cmd0)) return /^(?:wipefs|fdisk|sfdisk|parted|mkfs)/.test(cmd0) ? 'disks' : 'kernel'
    if (cmd0 === 'sysctl' && args.some((x) => /^-\w*[wp]/.test(x) || x.includes('='))) return 'kernel'
    if (/^(?:pkill|killall|killall5|xkill)$/.test(cmd0)) return 'processes'
    if (cmd0 === 'kill') {
      const ids = args.filter((x, i) => !(i === 0 && /^-(?:\w+|\d+)$/.test(x)) && x !== '--' && !/^-[sn]$/.test(x) && !(i > 0 && /^-[sn]$/.test(args[i - 1])))
      // its own process: a literal pid above 1, one shell variable ($!, $PID) or a job (%1) — never -1, 0, 1, -<group> or $(…)
      if (!ids.length || ids.some((x) => !(/^\d+$/.test(x) ? +x > 1 : /^(?:\$!|\$\{?[A-Za-z_]\w*\}?|%\d+)$/.test(x)))) return 'processes'
    }
  }
  return null
}

const active = (cwd) => {
  if (!cwd) return false
  const root = projectOf(cwd), m = cwd.match(/^(.*)\.worktrees[\\/][^\\/]+([\\/].*)?$/)
  return [root, cwd, m && m[1]].filter(Boolean).some((d) => fs.existsSync(path.join(d, '.pipeline')))
}

// A fixed pause in a test agent: it waits the full time on a fast device and not long enough on a slow one (an
// app-auditor-and-tester audit spent 27 min in 368 of them; `timeout 22 tail -f /dev/null` stood in for sleep). Only
// for sub-agents (agent_id present): the chat's own `sleep 300` is the timer for the user's answers to the questions.
const PAUSE = /(?:^|[;&|(){}\n]|\b(?:do|then|else)\s)\s*(?:\S*\/)?sleep\s+(?:(?:[5-9]|\d{2,})(?:\.\d+)?s?|\d+(?:\.\d+)?[mhd])(?=\s|$|[;&|)])|\btail\s+-f\s+\/dev\/null\b/
export const pause = (cmd) => PAUSE.test(bare(cmd)) || bodies(cmd).some((b) => PAUSE.test(bare(b)))

// Returns the hook's stdout (JSON) or '' when the command may run.
export function guard(input) {
  if (input.tool_name !== 'Bash' || !active(input.cwd)) return ''
  const command = String((input.tool_input && input.tool_input.command) || '')
  if (input.agent_id && pause(command)) return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: 'app-factory guard: refused — a fixed pause of 5 s or more (sleep, tail -f /dev/null). Wait for what you need instead: after launching or reopening the app `node "<plugin>/scripts/pipeline.mjs" wait-app <udid|serial> --platform ios|android --app <id>` (returns as soon as it is up); after a tap that should change the screen `pipeline.mjs probe`; a device test run with `pipeline.mjs stale <log>`. A pause under 5 s (sleep 2) is allowed.' } })
  const why = refuse(command)
  if (!why) return ''
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: `app-factory safety guard: refused — ${WHAT[why]} can freeze or crash this computer, or kill or delete what is the user's. Do not try it another way. Memory is freed only by stopping the plugin's own devices (app-factory-… simulators, af-… emulators) as your task says; a stuck app or device: pipeline.mjs app-restart, then device-reset. If that is not enough, file a critical finding with what you saw and go on.` } })
}

function selftest() {
  const no = ['sudo sh -c "sync; echo 3 > /proc/sys/vm/drop_caches"', 'sync && echo 3 | tee /proc/sys/vm/drop_caches', 'echo 1 > /proc/sys/vm/compact_memory',
    'sudo swapoff -a && sudo swapon -a', 'swapoff -a', 'sysctl -w vm.swappiness=10', 'sysctl vm.overcommit_memory=2', 'purge', 'echo b > /proc/sysrq-trigger',
    'pkill -f qemu', 'pkill -9 java', 'killall Simulator', 'kill -9 -1', 'kill -- -1', 'kill 1', 'kill -9 $(pgrep -f flutter)', 'pgrep java | xargs kill -9', 
    'reboot', 'shutdown -h now', 'systemctl restart gdm', 'systemctl suspend', 'init 6', 'loginctl terminate-user mach', "osascript -e 'tell app \"System Events\" to restart'",
    'rm -rf /', 'rm -rf ~', 'rm -rf "$HOME"', 'rm -rf /*', 'rm -r --no-preserve-root /x', 'chmod -R 777 /', 'dd if=/dev/zero of=/dev/sda', 'mkfs.ext4 /dev/sdb1',
    ':(){ :|:& };:', 'xcrun simctl delete all', 'xcrun simctl erase 1234', 'xcrun simctl shutdown all', 'avdmanager delete avd -n af-standard',
    'bash -c "sudo reboot"', 'rm -rf ~/Library/Developer/CoreSimulator', 'rm -rf "$HOME/Library/Developer/CoreSimulator/Devices"', 'rm -rf ~/.android', 'rm -r /Users/u/.android/avd/x.avd', 'kill $(pgrep qemu)', 'kill `pgrep java`', 'FOO=1 nohup sudo -n true', 'cd /x && timeout 5 killall adb', 'nice -n 10 pkill dart', 'env X=1 swapoff -a']
  const yes = ['node /p/scripts/pipeline.mjs device-reset emulator-5554 --platform android', 'node /p/scripts/pipeline.mjs freemem --need 2500', 'cat /proc/meminfo', 'grep MemAvailable /proc/meminfo',
    'xcrun simctl shutdown 1234-ABCD', 'xcrun simctl boot 1234', '/sdk/platform-tools/adb -s emulator-5554 emu kill', 'adb -s emulator-5554 shell am force-stop com.x.app', 'kill 48213', 'kill $!', 'kill -9 $FLOW_PID', 'kill ${PID}', 'kill %1', 'rm -rf android/.gradle', 'ls ~/.android/avd', 'kill -TERM 48213 48214',
    'git commit -m "fix: reboot loop; shutdown sheet; sudo text"', 'echo "never run sudo"', 'rm -rf build/ .dart_tool', 'rm -rf "$TMPDIR/x"', 'rm -rf ~/x/y', 'flutter test -j 4 -r failures-only --no-pub',
    'systemctl status docker', "cat <<'EOF' > notes.txt\nreboot\nsudo x\nEOF", 'ls /sys/class', 'sysctl -n hw.memsize', 'vm_stat', 'grep -rn "pkill" lib/']
  for (const c of no) assert.ok(refuse(c), `should refuse: ${c}`)
  for (const c of yes) assert.equal(refuse(c), null, `should allow: ${c}`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-')), proj = path.join(tmp, 'app')
  fs.mkdirSync(path.join(proj, '.pipeline'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'app.worktrees', 'r1'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'other'))
  const d = (cwd, command) => guard({ tool_name: 'Bash', cwd, tool_input: { command } })
  assert.match(d(proj, 'sudo reboot'), /"permissionDecision":"deny"/)
  assert.match(d(path.join(tmp, 'app.worktrees', 'r1'), 'pkill -f qemu'), /killing processes/, 'a runner in its worktree')
  assert.equal(d(proj, 'flutter test'), '')
  assert.equal(d(path.join(tmp, 'other'), 'sudo apt install x'), '', 'never the user\'s other projects')
  assert.equal(guard({ tool_name: 'Read', cwd: proj, tool_input: {} }), '')
  // fixed pauses: refused for a test agent, never for the chat (its sleep 300 is the questions' timer)
  const ag = (command) => guard({ tool_name: 'Bash', cwd: proj, agent_id: 'a1', tool_input: { command } })
  for (const c of ['sleep 20', 'sleep 5', 'timeout 22 tail -f /dev/null', 'adb shell input tap 1 2; sleep 5', 'sleep 1m', 'for i in 1 2; do adb devices; sleep 10; done', "bash -c 'sleep 30'", 'tail -f /dev/null'])
    assert.match(ag(c), /fixed pause of 5 s or more/, `agent: should refuse ${c}`)
  for (const c of ['sleep 2', 'sleep 0.5', 'sleep 4.9', 'git commit -m "wait: sleep 30 no more"', 'tail -f app.log | grep -m1 ready', 'node pipeline.mjs wait-app emulator-5554 --platform android --app com.x'])
    assert.equal(ag(c), '', `agent: should allow ${c}`)
  assert.equal(d(proj, 'sleep 300'), '', 'the chat: the questions\' 5-minute timer')
  fs.rmSync(tmp, { recursive: true, force: true })
  return 'selftest ok'
}

const direct = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct && process.argv[2] === 'selftest') console.log(selftest())
else if (direct) {
  let raw = ''
  process.stdin.on('data', (d) => (raw += d))
  process.stdin.on('end', () => {
    try { const out = guard(JSON.parse(raw)); if (out) process.stdout.write(out) } catch { /* never break a tool call */ }
  })
}
