#!/usr/bin/env node
// Measures an app-factory run from Claude Code's own records of it (the workflow journal and every agent's
// transcript under ~/.claude/projects/<project slug>/<session>/subagents/workflows/<run>/) — the same numbers
// the v3 audit was built on: per-agent time, how much ran in parallel, where tool time went, tokens, screenshots.
//   node run-report.mjs <project dir> [--run wf_…] [--save]   (--save also writes it into PROGRESS.md)
//   node run-report.mjs selftest
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const slug = (p) => p.replace(/[/.]/g, '-')
const min = (ms) => Math.round(ms / 60000)

export function findRun(project, runId, home = path.join(os.homedir(), '.claude', 'projects')) {
  const base = path.join(home, slug(path.resolve(project)))
  const runs = []
  for (const s of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const w = path.join(base, s, 'subagents', 'workflows')
    if (fs.existsSync(w)) for (const r of fs.readdirSync(w)) if (fs.existsSync(path.join(w, r, 'journal.jsonl'))) runs.push(path.join(w, r))
  }
  const pick = runId ? runs.filter((r) => path.basename(r) === runId) : runs
  return pick.sort((a, b) => fs.statSync(path.join(a, 'journal.jsonl')).mtimeMs - fs.statSync(path.join(b, 'journal.jsonl')).mtimeMs).pop() || null
}

// Image size from base64 (PNG or JPEG header) → Claude's image token estimate (long side ≤ 1568 px, ≤ 1.15 MP, w×h/750).
function imageTokens(b64) {
  const b = Buffer.from(b64.slice(0, 200000), 'base64')
  let w = 0, h = 0
  if (b[0] === 0x89 && b[1] === 0x50) { w = b.readUInt32BE(16); h = b.readUInt32BE(20) }
  else if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1]
      if (m >= 0xc0 && m <= 0xc3) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break }
      i += 2 + b.readUInt16BE(i + 2)
    }
  }
  if (!w || !h) return 0
  const s = Math.min(1, 1568 / Math.max(w, h), Math.sqrt(1150000 / (w * h)))
  return (w * s) * (h * s) / 750
}

const KINDS = [
  [/flutter"?\s+test\s+integration_test/, 'device flow tests'],
  [/flutter"?\s+test\b/, 'unit/widget tests'],
  [/flutter"?\s+build|xcodebuild|gradlew/, 'builds'],
  [/flutter"?\s+analyze/, 'analyze'],
  [/\b(until|while|sleep|pgrep)\b/, 'waiting on a background run'],
  [/simctl|emulator\s+-avd|boot_completed|\badb\s/, 'device ops'],
]
const kind = (name, input) => {
  if (name.startsWith('mcp__') && name.includes('mobile')) return 'mobile-mcp (manual driving)'
  if (name !== 'Bash') return `tool: ${name}`
  for (const [rx, k] of KINDS) if (rx.test(input.command || '')) return k
  return 'other shell'
}

export function measure(runDir) {
  const labels = {}
  for (const l of fs.readFileSync(path.join(runDir, 'journal.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const j = JSON.parse(l)
    if (j.type === 'started') labels[j.agentId] = j.label
  }
  const agents = [], toolMs = {}, tokens = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
  let images = 0, imageTok = 0, turns = 0, modelMs = 0
  for (const [id, label] of Object.entries(labels)) {
    const f = path.join(runDir, `agent-${id}.jsonl`)
    if (!fs.existsSync(f)) continue
    const pend = {}
    let first = null, last = null, lastResult = null
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line) continue
      let j
      try { j = JSON.parse(line) } catch { continue }
      const t = j.timestamp ? Date.parse(j.timestamp) : null
      if (t) { first ??= t; last = t }
      const m = j.message
      if (!m || typeof m !== 'object') continue
      if (j.type === 'assistant' && m.usage) {
        turns++
        tokens.input += m.usage.input_tokens || 0; tokens.cacheWrite += m.usage.cache_creation_input_tokens || 0
        tokens.cacheRead += m.usage.cache_read_input_tokens || 0; tokens.output += m.usage.output_tokens || 0
      }
      if (!Array.isArray(m.content)) continue
      for (const c of m.content) {
        if (c?.type === 'tool_use') { pend[c.id] = { t, k: kind(c.name || '', c.input || {}) }; if (lastResult && t) modelMs += t - lastResult }
        else if (c?.type === 'tool_result' && pend[c.tool_use_id]) {
          const p = pend[c.tool_use_id]; delete pend[c.tool_use_id]
          if (t && p.t) toolMs[p.k] = (toolMs[p.k] || 0) + (t - p.t)
          lastResult = t
          for (const it of Array.isArray(c.content) ? c.content : []) if (it?.type === 'image') { images++; imageTok += imageTokens(it.source?.data || '') }
        }
      }
    }
    if (first) agents.push({ label, start: first, end: last })
  }
  agents.sort((a, b) => a.start - b.start)
  // parallelism: wall time with at least one agent running vs. the sum of agent time
  const ev = agents.flatMap((a) => [[a.start, 1], [a.end, -1]]).sort((x, y) => x[0] - y[0] || x[1] - y[1])
  let live = 0, wall = 0, prev = null, peak = 0
  for (const [t, d] of ev) { if (live > 0 && prev !== null) wall += t - prev; live += d; peak = Math.max(peak, live); prev = t }
  const agentMs = agents.reduce((s, a) => s + (a.end - a.start), 0)
  return { agents, toolMs, modelMs, tokens, turns, images, imageTok, wall, agentMs, peak }
}

export function render(r, firewallLog) {
  const hh = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const cuts = firewallLog && fs.existsSync(firewallLog) ? fs.readFileSync(firewallLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => Number(l.split('\t')[1])) : []
  return [
    `Wall-clock with agents running: ${min(r.wall)} min · agent time: ${min(r.agentMs)} min · parallel factor ${(r.agentMs / Math.max(1, r.wall)).toFixed(2)} · most agents at once: ${r.peak}`,
    `Model turns ${r.turns.toLocaleString('en')} · tokens: output ${r.tokens.output.toLocaleString('en')}, cache reads ${r.tokens.cacheRead.toLocaleString('en')} (${r.turns ? Math.round(r.tokens.cacheRead / r.turns).toLocaleString('en') : 0} per turn), cache writes ${r.tokens.cacheWrite.toLocaleString('en')}`,
    `Screenshots in context: ${r.images} (~${Math.round(r.imageTok).toLocaleString('en')} tokens when first read) · firewall cuts: ${cuts.length}${cuts.length ? ` (${Math.round(cuts.reduce((a, b) => a + b, 0) / 1024)} KB kept out of context)` : ''}`,
    '',
    '| Agent | From | To | Min |', '|---|---|---|---|',
    ...r.agents.map((a) => `| ${a.label} | ${hh(a.start)} | ${hh(a.end)} | ${min(a.end - a.start)} |`),
    '',
    '| Where tool time went | Min |', '|---|---|',
    ...Object.entries(r.toolMs).sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 60000).map(([k, v]) => `| ${k} | ${min(v)} |`),
    `| model thinking and writing between tool calls | ${min(r.modelMs)} |`,
  ].join('\n')
}

function selftest() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-'))
  const proj = '/Users/x/my.app'
  const run = path.join(home, slug(proj), 's1', 'subagents', 'workflows', 'wf_t')
  fs.mkdirSync(run, { recursive: true })
  fs.writeFileSync(path.join(run, 'journal.jsonl'), ['a', 'b'].map((id) => JSON.stringify({ type: 'started', agentId: id, label: `agent ${id}` })).join('\n'))
  const png = Buffer.alloc(33); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1206, 16); png.writeUInt32BE(2622, 20)
  const T = (m) => new Date(Date.UTC(2026, 9, 6, 10, m)).toISOString()
  const msg = (t, type, content, usage) => JSON.stringify({ timestamp: t, type, message: { content, usage } })
  fs.writeFileSync(path.join(run, 'agent-a.jsonl'), [
    msg(T(0), 'assistant', [{ type: 'tool_use', id: 'u1', name: 'Bash', input: { command: '"/f/flutter" test integration_test/x_test.dart -d 1' } }], { cache_read_input_tokens: 1000, output_tokens: 10 }),
    msg(T(10), 'user', [{ type: 'tool_result', tool_use_id: 'u1', content: [{ type: 'image', source: { data: png.toString('base64') } }] }]),
    msg(T(12), 'assistant', [{ type: 'tool_use', id: 'u2', name: 'mcp__plugin_app-factory_mobile-mcp__mobile_take_screenshot', input: {} }], { cache_read_input_tokens: 3000, output_tokens: 5 }),
    msg(T(20), 'user', [{ type: 'tool_result', tool_use_id: 'u2', content: 'ok' }]),
  ].join('\n'))
  fs.writeFileSync(path.join(run, 'agent-b.jsonl'), [msg(T(5), 'assistant', [], { output_tokens: 1 }), msg(T(25), 'assistant', [], { output_tokens: 1 })].join('\n'))
  assert.equal(findRun(proj, null, home), run)
  const r = measure(run)
  assert.equal(min(r.wall), 25); assert.equal(min(r.agentMs), 40); assert.equal(r.peak, 2) // a 10:00–10:20, b 10:05–10:25
  assert.equal(min(r.toolMs['device flow tests']), 10); assert.equal(min(r.toolMs['mobile-mcp (manual driving)']), 8)
  assert.equal(min(r.modelMs), 2); assert.equal(r.turns, 4); assert.equal(r.tokens.cacheRead, 4000); assert.equal(r.images, 1)
  assert.ok(Math.abs(r.imageTok - (1206 * (1568 / 2622)) * 1568 / 750) < 1) // 1206×2622 scaled to a 1568 px long side
  assert.match(render(r), /parallel factor 1\.60 · most agents at once: 2/)
  return 'selftest ok'
}

const [a0, ...rest] = process.argv.slice(2)
if (a0 === 'selftest') console.log(selftest())
else if (a0) {
  const i = rest.indexOf('--run'), runId = i >= 0 ? rest[i + 1] : null
  const dir = findRun(a0, runId)
  if (!dir) { console.error(`no workflow run found for ${path.resolve(a0)}`); process.exit(1) }
  const text = `Run ${path.basename(dir)}\n${render(measure(dir), path.join(path.resolve(a0), '.pipeline', 'tool-output', 'log.tsv'))}`
  console.log(text)
  if (rest.includes('--save')) execFileSync('node', [path.join(path.dirname(fileURLToPath(import.meta.url)), 'pipeline.mjs'), 'report', 'run', text], { cwd: path.resolve(a0), stdio: 'inherit' })
} else { console.error('usage: run-report.mjs <project dir> [--run wf_…] [--save] | selftest'); process.exit(2) }
