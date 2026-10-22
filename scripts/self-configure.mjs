#!/usr/bin/env node
// SessionStart hook: makes a plugin install usable with zero manual steps beyond `claude plugin marketplace add
// <source>` + `claude plugin install app-factory@<marketplace>` (no git clone, no local copy of this repo needed).
// Runs on every session start in a project with app-factory enabled; both actions are idempotent (same result
// every time on an already-set-up machine), so there is no "already configured" check to get wrong.
//   1. configure.mjs's find()+write(), against *this* install's own workflows/build-app.js (wherever
//      ${CLAUDE_PLUGIN_ROOT} resolves to — a local directory source or a GitHub-source cache copy alike).
//   2. Copies setup/install-app-factory/SKILL.md to ~/.claude/skills/install-app-factory/SKILL.md if missing or
//      different, so /install-app-factory exists for the next update without the user ever placing that file.
// Never throws and never exits non-zero: a failed convenience step must not block the session from starting.
//   node self-configure.mjs            — run it (called by the hook with CWD anywhere; it locates its own files)
//   node self-configure.mjs selftest
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { find, write } from './configure.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// root: this plugin's own folder (for the real run) or a temp copy of it (for the selftest, so nothing here touches
// the plugin's real workflows/build-app.js or the real ~/.claude/skills/).
export function run(root = ROOT, home = os.homedir()) {
  const report = []
  try {
    const wf = path.join(root, 'workflows', 'build-app.js')
    const before = fs.readFileSync(wf, 'utf8'), after = write(before, find(process.env, process.platform, process.arch, home))
    if (after !== before) { fs.writeFileSync(wf, after); report.push('configured workflows/build-app.js for this machine') }
  } catch (e) { report.push(`could not configure workflows/build-app.js: ${e.message}`) }

  try {
    const src = path.join(root, 'setup', 'install-app-factory', 'SKILL.md')
    const dst = path.join(home, '.claude', 'skills', 'install-app-factory', 'SKILL.md')
    const srcText = fs.readFileSync(src, 'utf8')
    if (!fs.existsSync(dst) || fs.readFileSync(dst, 'utf8') !== srcText) {
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.writeFileSync(dst, srcText)
      report.push('installed /install-app-factory (for future updates — type it again any time a new version is out)')
    }
  } catch (e) { report.push(`could not install /install-app-factory: ${e.message}`) }

  return report
}

function selftest() {
  // find()'s ROOT comes from configure.mjs's own real location (a fixed, correct relative import — proven live: a
  // renamed copy of this whole plugin, installed from a local-directory marketplace under a cache path, had its
  // committed-wrong ROOT/FLUTTER corrected to that cache path and this machine's real Flutter on the first run,
  // 2026-10-22). This selftest covers the two things `run()` adds on top of configure.mjs: copying the personal
  // command, and being safe to call with an arbitrary plugin root and an arbitrary $HOME.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'self-cfg-'))
  fs.mkdirSync(path.join(tmp, 'workflows'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'setup', 'install-app-factory'), { recursive: true })
  const before = "const ROOT = ARGS.root || '/old'\nconst FLUTTER = ARGS.flutter || '/someone/elses/flutter'\nconst ANDROID_SDK = ARGS.androidSdk || '/old'\nconst JAVA_HOME = ARGS.javaHome || '/old'\nconst ANDROID_IMAGE = ARGS.androidImage || 'old'\n"
  fs.writeFileSync(path.join(tmp, 'workflows', 'build-app.js'), before)
  fs.writeFileSync(path.join(tmp, 'setup', 'install-app-factory', 'SKILL.md'), '---\nname: install-app-factory\n---\nbody\n')
  const home1 = fs.mkdtempSync(path.join(os.tmpdir(), 'self-cfg-home-'))

  const r1 = run(tmp, home1)
  assert.ok(r1.some((l) => l.includes('installed /install-app-factory')), 'first run: installs the personal command')
  assert.equal(fs.readFileSync(path.join(home1, '.claude', 'skills', 'install-app-factory', 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(tmp, 'setup', 'install-app-factory', 'SKILL.md'), 'utf8'), 'copied byte for byte')

  const r2 = run(tmp, home1)
  assert.deepEqual(r2, [], 'second run on an already-configured machine: no-op, nothing to report (idempotent)')

  // a second $HOME sharing the same plugin root still gets its own copy of the personal command
  const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'self-cfg-home2-'))
  const r3 = run(tmp, home2)
  assert.ok(r3.some((l) => l.includes('installed /install-app-factory')), 'a second machine using the same cache still gets its own personal command')
  assert.ok(fs.existsSync(path.join(home2, '.claude', 'skills', 'install-app-factory', 'SKILL.md')))

  // a root with no setup/ folder (a broken or very old cache copy) must not throw — the hook must never block startup
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'self-cfg-broken-'))
  const home3 = fs.mkdtempSync(path.join(os.tmpdir(), 'self-cfg-home3-'))
  const r4 = run(broken, home3)
  assert.ok(r4.every((l) => l.startsWith('could not')), 'missing files are reported, not thrown')

  for (const d of [tmp, home1, home2, broken, home3]) fs.rmSync(d, { recursive: true, force: true })
  return 'selftest ok'
}

const direct = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct && process.argv[2] === 'selftest') console.log(selftest())
else if (direct) {
  const report = run()
  if (report.length) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `app-factory: ${report.join('; ')}.` } }))
}
