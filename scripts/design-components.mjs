#!/usr/bin/env node
// The component inventory of a designed screen, and its first match against the running app.
//   node design-components.mjs extract <screens/<slug>.context.md> [--flows design/FLOWS.md]   → JSON list on stdout
//   node design-components.mjs match <components.json> <elements.txt>                           → JSON list on stdout
//   node design-components.mjs selftest
// extract reads Figma's design code for the screen (every node carries data-node-id and data-name) and lists, by node id:
// every text (its exact string), every image and icon (its file), every node named like a bar, button, field or control,
// and every node a FLOWS.md row starts from (it is tappable). Groups, frames and plain shapes are not components; the
// pixel comparison covers them.
// match takes the app's element list on the same screen (mobile_list_elements_on_screen, saved as text: one element
// per line with text="…" label="…") and marks each text component present when an element's text or label equals it
// or contains it; every other component is left "check" for the auditor, who decides present / missing / excluded.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const NAMED = [
  [/status ?bar|nav(igation)? ?bar|tab ?bar|tool ?bar|app ?bar|top ?bar|bottom ?bar|header|home indicator|botam line|bottom line/i, 'bar'],
  [/\b(btn|button|cta)\b|button/i, 'button'],
  [/input|text ?field|search|field\b|textbox/i, 'input'],
  [/toggle|switch|checkbox|radio|slider|stepper|segment|chip|\btab\b/i, 'control'],
]
const clean = (t) => t.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\{\s*`([^`]*)`\s*\}/g, '$1').replace(/\{\s*"([^"]*)"\s*\}/g, '$1').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/\s+/g, ' ').trim()

export function extract(code, flows = '') {
  const files = {}
  for (const m of code.matchAll(/const (\w+) = `\$\{assetPathPrefix\}\/([^`]+)`/g)) files[m[1]] = m[2]
  const main = code.indexOf('export default function')
  // only the component's code: from "export default function" to its closing "}" line (Figma's notes follow it)
  const end = main >= 0 ? code.indexOf('\n}\n', main) : -1
  const body = main >= 0 ? code.slice(main, end > 0 ? end + 2 : undefined) : code
  const flowIds = new Set([...flows.matchAll(/\b(I?\d+:\d+(?:;\d+:\d+)*)\b/g)].map((m) => m[1]))
  const out = new Map(), stack = []
  let root = null, imgN = 0
  const add = (c) => { const k = `${c.id}|${c.kind}|${c.file || ''}`; if (!out.has(k)) out.set(k, c) }
  const tag = /<(\/?)([A-Za-z][\w.]*)((?:[^>"{]|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g
  let last = 0
  for (const m of body.matchAll(tag)) {
    // text between the previous tag and this one belongs to the innermost open node
    const text = clean(body.slice(last, m.index))
    // a fragment of a tag the tokenizer could not read (nested template code) is not text
    if (text && stack.length && !/[<>]|className=|=\{/.test(text)) {
      const owner = [...stack].reverse().find((e) => e.id)
      if (owner && owner.id !== root) { const k = `${owner.id}|text|`; const prev = out.get(k); if (prev) prev.text = clean(`${prev.text} ${text}`); else add({ id: owner.id, kind: 'text', name: owner.name, text }) }
    }
    last = m.index + m[0].length
    const [, close, name, attrs] = m
    if (close) { stack.pop(); continue }
    const id = (attrs.match(/data-node-id="([^"]+)"/) || [])[1]
    const dname = (attrs.match(/data-name="([^"]+)"/) || [])[1] || ''
    if (id && !root) root = id
    const src = attrs.match(/src=\{(\w+)\}/)
    if (name === 'img' && src && files[src[1]]) {
      const owner = id ? { id, name: dname } : [...stack].reverse().find((e) => e.id) || { id: root, name: '' }
      const file = files[src[1]]
      add({ id: owner.id, kind: /\.svg$/i.test(file) ? 'icon' : 'image', name: owner.name, file, n: ++imgN })
    }
    if (id && id !== root) {
      const kind = (NAMED.find(([rx]) => rx.test(dname)) || [])[1] || (flowIds.has(id) ? 'button' : null)
      if (kind) add({ id, kind, name: dname, ...(flowIds.has(id) ? { tappable: true } : {}) })
    }
    if (!attrs.trimEnd().endsWith('/')) stack.push({ id, name: dname })
  }
  return [...out.values()].map(({ n, ...c }) => c)
}

export function match(components, elements) {
  const els = elements.split('\n').map((l) => ({ line: l.trim(), texts: [...l.matchAll(/(?:text|label)="([^"]*)"/g)].map((x) => clean(x[1])).filter(Boolean) })).filter((e) => e.texts.length)
  return components.map((c) => {
    if (c.kind !== 'text') return { ...c, status: 'check' }
    const hit = els.find((e) => e.texts.some((t) => t === c.text || t.includes(c.text)))
    return hit ? { ...c, status: 'present', evidence: `element: ${hit.line.slice(0, 160)}` } : { ...c, status: 'check' }
  })
}

function selftest() {
  const code = `const assetPathPrefix = "x";
const imgBtn = \`\${assetPathPrefix}/5d737.webp\`;
const imgCrown = \`\${assetPathPrefix}/crown.svg\`;
export default function Premium() {
  return (
    <div className="relative size-full" data-node-id="1:1077" data-name="premium">
      <div className="absolute" data-node-id="1:1078" data-name="Status bar - iPhone"><p data-node-id="1:1079">9:41</p></div>
      <div data-node-id="1:1100" data-name="Frame"><img alt="" src={imgCrown} /></div>
      <p className="font-['Manrope:Bold']" data-node-id="1:1101">
        Looks Like you&apos;ve
        <span className="text-[#fc6620]">hit your limit!</span>
      </p>
      <div data-node-id="1:1129" data-name="btn"><img alt="" src={imgBtn} /><p data-node-id="1:1130">Upgrade to Pro</p></div>
      <div data-node-id="1:1140" data-name="Frame 6"><p data-node-id="1:1141">Continue with Ads</p></div>
      <div data-node-id="1:1120" data-name="botam line" />
      <div data-node-id="1:1160" data-name="Status bar">{/* iOS and iPadOS 26 component */}<p data-node-id="1:1161">{\`Don't slow down now\`}</p></div>
      <div data-node-id="1:1150" data-name="Group"><div data-node-id="1:1151" data-name="Rectangle 4" /></div>
    </div>
  );
}
Images and SVGs will be stored as constants, e.g. const image = \`\${assetPathPrefix}/<asset file name>\`
<img alt="" src={imgBtn} /> <p data-node-id="9:9">not part of the screen</p>`
  const flows = '| 2 | premium (1:1077) | Continue with Ads — "Frame 6" 1:1140 | tap | back | home | DISSOLVE 200ms |'
  const c = extract(code, flows)
  const by = (id, kind) => c.find((x) => x.id === id && x.kind === kind)
  assert.equal(by('1:1078', 'bar').name, 'Status bar - iPhone')
  assert.equal(by('1:1079', 'text').text, '9:41')
  assert.equal(by('1:1100', 'icon').file, 'crown.svg')
  assert.equal(by('1:1101', 'text').text, "Looks Like you've hit your limit!") // span joined, entity decoded
  assert.equal(by('1:1129', 'button').name, 'btn')
  assert.equal(by('1:1129', 'image').file, '5d737.webp')
  assert.equal(by('1:1130', 'text').text, 'Upgrade to Pro')
  assert.ok(by('1:1140', 'button').tappable, 'a node a flow starts from is a button')
  assert.equal(by('1:1120', 'bar').name, 'botam line')
  assert.ok(!c.some((x) => x.id === '1:1150' || x.id === '1:1151' || x.id === '1:1077'), 'groups, shapes and the frame itself are not components')
  assert.ok(!c.some((x) => x.id === '1:1160' && x.kind === 'text'), 'a JSX comment is not text')
  assert.ok(!c.some((x) => x.id === '9:9'), 'Figma\'s notes after the code are not components')
  assert.equal(by('1:1161', 'text').text, "Don't slow down now", 'a template-literal text is read without its braces')
  const els = `One element per line: @ref Type text= label= at=x,y size=WxH
@e3 Text text="Looks Like you've hit your limit!" at=40,300 size=300x60
@e8 Button label="Upgrade to Pro" at=16,600 size=343x54
@e9 Button label="Continue with ads" at=16,670 size=343x54`
  const m = match(c, els)
  const st = (id, kind) => m.find((x) => x.id === id && x.kind === kind).status
  assert.equal(st('1:1101', 'text'), 'present')
  assert.equal(st('1:1130', 'text'), 'present')
  assert.equal(st('1:1141', 'text'), 'check', 'case differs ("ads" vs "Ads"): not matched — the auditor looks')
  assert.equal(st('1:1129', 'button'), 'check')
  return `selftest ok (${c.length} components from the sample screen)`
}

const [cmd, a1, a2, ...rest] = process.argv.slice(2)
const direct = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (!direct) { /* imported (design-docs.mjs): no command line */ }
else if (cmd === 'selftest') console.log(selftest())
else if (cmd === 'extract' && a1) {
  const fi = [a2, ...rest].indexOf('--flows'), flowsFile = fi >= 0 ? [a2, ...rest][fi + 1] : null
  console.log(JSON.stringify(extract(fs.readFileSync(a1, 'utf8'), flowsFile && fs.existsSync(flowsFile) ? fs.readFileSync(flowsFile, 'utf8') : ''), null, 1))
} else if (cmd === 'match' && a1 && a2) console.log(JSON.stringify(match(JSON.parse(fs.readFileSync(a1, 'utf8')), fs.readFileSync(a2, 'utf8')), null, 1))
else { console.error('usage: design-components.mjs extract <context.md> [--flows FLOWS.md] | match <components.json> <elements.txt> | selftest'); process.exit(2) }
