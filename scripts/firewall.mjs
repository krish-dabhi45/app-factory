#!/usr/bin/env node
// PostToolUse hook (Bash, Read, Grep): in an app-factory project, replaces every stored API key value and known key
// pattern in a tool's output with ‹NAME› (scripts/secrets.mjs) — for every session, so no key reaches a model's context
// through a command, a file read or a search. Then caps a large Bash output before it enters an app-factory agent's context.
// In the v3 run, results over 8 KB carried 2.71 M of the 4.5 M characters agents printed, and every later turn
// re-sends them. Acts ONLY for a subagent (agent_id present) working in a project with an active app-factory run
// (.pipeline/RUN.lock, or a <project>.worktrees/<key> checkout of one) — never in the user's own chats.
// The full output is kept in .pipeline/tool-output/; the agent gets its size, first and last lines, and the path.
//   node firewall.mjs            (reads the hook JSON on stdin)
//   node firewall.mjs selftest
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { projectOf, needles, redact, secretsFile } from './secrets.mjs'

const CAP = 8192 // bytes
const HEAD = 20, TAIL = 10

export function project(cwd) {
  const m = cwd && cwd.match(/^(.*)\.worktrees\/[^/]+(\/.*)?$/)
  for (const root of [cwd, m && m[1]].filter(Boolean)) if (fs.existsSync(path.join(root, '.pipeline', 'RUN.lock'))) return root
  return null
}

const deep = (x, f) => (typeof x === 'string' ? f(x) : Array.isArray(x) ? x.map((y) => deep(y, f)) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, deep(v, f)])) : x)
const reply = (out) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: out } })

// Returns the hook's stdout (JSON) or '' when the output passes unchanged.
export function guard(input) {
  // 1. Keys: any session (the chat or an agent) in an app-factory project — one with .pipeline/ or a stored key.
  const main = input.cwd && projectOf(input.cwd)
  let r = input.tool_response, redacted = false
  if (main && (fs.existsSync(path.join(main, '.pipeline')) || fs.existsSync(secretsFile(main)))) {
    const vals = needles(main), clean = deep(r, (t) => redact(t, vals))
    if (JSON.stringify(clean) !== JSON.stringify(r)) { r = clean; redacted = true }
  }
  // 2. Size: only Bash, only a subagent, only during an active run.
  const root = input.tool_name === 'Bash' && input.agent_id ? project(input.cwd) : null
  if (!root) return redacted ? reply(r) : ''
  const text = typeof r === 'string' ? r : r && typeof r === 'object' ? `${r.stdout || ''}${r.stderr ? `\n${r.stderr}` : ''}` : ''
  if (Buffer.byteLength(text) <= CAP) return redacted ? reply(r) : ''
  const dir = path.join(root, '.pipeline', 'tool-output')
  fs.mkdirSync(dir, { recursive: true })
  const saved = path.join(dir, `${String(input.tool_use_id || Date.now()).replace(/[^\w-]/g, '')}.txt`)
  fs.writeFileSync(saved, text)
  fs.appendFileSync(path.join(dir, 'log.tsv'), `${new Date().toISOString()}\t${Buffer.byteLength(text)}\t${input.agent_id}\t${saved}\n`)
  const lines = text.split('\n')
  const short = [
    `[app-factory: output cut — ${lines.length} lines, ${Buffer.byteLength(text)} bytes. Full output: ${saved}. Read only the part you need: grep it, or a line range with sed -n 'A,Bp'.]`,
    ...lines.slice(0, HEAD),
    lines.length > HEAD + TAIL ? `[… ${lines.length - HEAD - TAIL} lines not shown …]` : null,
    ...lines.slice(Math.max(HEAD, lines.length - TAIL)),
  ].filter((x) => x !== null).join('\n')
  // The replacement keeps the tool's own shape: a string stays a string; an object keeps its fields.
  const out = typeof r === 'string' ? short : { ...r, stdout: short, stderr: '' }
  return reply(out)
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'fw-'))
  const proj = path.join(tmp, 'app'), wt = `${proj}.worktrees/ui`
  fs.mkdirSync(path.join(proj, '.pipeline'), { recursive: true }); fs.mkdirSync(wt, { recursive: true })
  const big = Array.from({ length: 400 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join('\n')
  const ev = (o) => ({ tool_name: 'Bash', agent_id: 'a1', cwd: proj, tool_use_id: 'toolu_1', tool_response: { stdout: big, stderr: '', interrupted: false }, ...o })
  assert.equal(guard(ev()), '', 'no RUN.lock: not an active run → untouched')
  fs.writeFileSync(path.join(proj, '.pipeline', 'RUN.lock'), 'x')
  assert.equal(guard(ev({ agent_id: undefined })), '', 'the main chat (no agent_id) → untouched')
  assert.equal(guard(ev({ tool_name: 'Read' })), '', 'only Bash')
  assert.equal(guard(ev({ tool_response: { stdout: 'small', stderr: '' } })), '', 'under the cap → untouched')
  const o = JSON.parse(guard(ev())).hookSpecificOutput
  assert.equal(o.hookEventName, 'PostToolUse')
  assert.equal(o.updatedToolOutput.interrupted, false, 'object shape kept')
  assert.match(o.updatedToolOutput.stdout, /^\[app-factory: output cut — 400 lines/)
  assert.match(o.updatedToolOutput.stdout, /line 0 x+\n[\s\S]*\[… 370 lines not shown …\][\s\S]*line 399 x+$/)
  assert.equal(fs.readFileSync(path.join(proj, '.pipeline/tool-output/toolu_1.txt'), 'utf8'), big, 'full output kept')
  assert.ok(Buffer.byteLength(o.updatedToolOutput.stdout) < 2000)
  const s = JSON.parse(guard(ev({ tool_response: `Error: Exit code 1\n${big}`, cwd: wt, tool_use_id: 'toolu_2' }))).hookSpecificOutput.updatedToolOutput
  assert.equal(typeof s, 'string', 'string shape kept, and a worktree of the project counts')
  assert.ok(fs.existsSync(path.join(proj, '.pipeline/tool-output/toolu_2.txt')))
  assert.equal(fs.readFileSync(path.join(proj, '.pipeline/tool-output/log.tsv'), 'utf8').trim().split('\n').length, 2)
  // keys: redacted for every session and tool shape, before the size cap; a stored value and a known pattern
  const env0 = process.env.APP_FACTORY_HOME; process.env.APP_FACTORY_HOME = path.join(tmp, 'home')
  const KEY = 'AIzaSyD-test0123456789abcdefghijklmnopq', VAL = 'zz9-stored-value-0123456789'
  fs.mkdirSync(path.dirname(secretsFile(proj)), { recursive: true }); fs.writeFileSync(secretsFile(proj), JSON.stringify({ WEATHER_KEY: VAL }))
  const rd = (o) => JSON.parse(guard(ev(o)) || 'null')?.hookSpecificOutput.updatedToolOutput
  assert.equal(rd({ agent_id: undefined, tool_response: { stdout: `curl ...?appid=${VAL}`, stderr: '' } }).stdout, 'curl ...?appid=‹WEATHER_KEY›', 'the chat too')
  assert.deepEqual(rd({ tool_name: 'Read', tool_response: { type: 'text', file: { filePath: 'x', content: `key=${KEY}` } } }), { type: 'text', file: { filePath: 'x', content: 'key=‹Google API key›' } }, 'Read keeps its shape')
  assert.equal(rd({ tool_name: 'Grep', cwd: wt, tool_response: `a.dart:1:${VAL}` }), 'a.dart:1:‹WEATHER_KEY›', 'a worktree maps to its project')
  assert.equal(guard(ev({ tool_response: { stdout: 'nothing secret', stderr: '' } })), '', 'no key → untouched')
  const capped = rd({ tool_use_id: 'toolu_3', tool_response: { stdout: `${VAL}\n${big}`, stderr: '' } }).stdout
  assert.ok(capped.includes('‹WEATHER_KEY›') && !capped.includes(VAL) && !fs.readFileSync(path.join(proj, '.pipeline/tool-output/toolu_3.txt'), 'utf8').includes(VAL), 'the cut output and its saved copy are redacted')
  if (env0 === undefined) delete process.env.APP_FACTORY_HOME; else process.env.APP_FACTORY_HOME = env0
  return 'selftest ok'
}

if (process.argv[2] === 'selftest') console.log(selftest())
else {
  let raw = ''
  process.stdin.on('data', (d) => (raw += d))
  process.stdin.on('end', () => {
    try { const out = guard(JSON.parse(raw)); if (out) process.stdout.write(out) } catch { /* never break a tool call */ }
  })
}
