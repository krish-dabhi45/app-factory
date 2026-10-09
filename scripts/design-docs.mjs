#!/usr/bin/env node
// Writes the design import's mapping documents from the files the import saved — the same every run, instead of a
// generator each agent writes for itself (v4: 15,173 tokens and 9 script runs for this).
//   node design-docs.mjs slugs <design dir>   → {"<frame id>": "<slug>"}: the names for screens/<slug>.context.md,
//                                               reference/<slug>.png and assets/<slug>-<file> (one per inventory screen)
//   node design-docs.mjs build <design dir>   → SCREENS.md, FLOWS.md, colors.json, COLORS.md, ASSETS.md, FONTS.md,
//                                               MISSING.md, DESIGN.md, ROUTE.md, manifest.json; prints the counts
//   node design-docs.mjs selftest
// Reads: pages/*.metadata.xml (get_metadata, verbatim), pages/*.inventory.json (the use_figma inventories), tokens.json,
// screens/<slug>*.context.md (get_design_context, verbatim), assets/, reference/, and design/import.json — the only
// part an agent writes, because it needs judgement:
//   {"url","fileKey","importedAt","figmaCalls","figmaCallsByTool":{},
//    "prd":{"total":<screens PRD.md states>,"screens":[{"name":"Splash — 4.1","frames":["1:1548"]}, …]},
//    "states":{"<frame id>":"loading"}, "prdColors":[{"name":"ink","value":"#0A1A1F","alpha":1,"use":"Primary text"}],
//    "routeSkip":["<element id, or an id prefix like I1:1601;>"]} — reactions on an illustration or mockup (a phone drawn
//    inside a screen) that the app will not make tappable: ROUTE.md never routes through them
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { extract } from './design-components.mjs'

const rd = (f, d = null) => { try { return fs.readFileSync(f, 'utf8') } catch { return d } }
const ls = (d, rx) => { try { return fs.readdirSync(d).filter((f) => rx.test(f)).sort() } catch { return [] } }
const r1 = (v) => Math.round(v * 10) / 10
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen'

// Every inventory screen, in file order, with its page.
function screensOf(dir) {
  const out = []
  for (const f of ls(path.join(dir, 'pages'), /\.inventory\.json$/)) {
    const inv = JSON.parse(rd(path.join(dir, 'pages', f)))
    for (const s of inv.screens || []) out.push({ ...s, page: inv.page || f.replace(/\.inventory\.json$/, '') })
  }
  return out
}
// The first frame with a name gets its plain slug; a later frame with the same name adds its id (premium, premium-1-1077).
export function slugs(screens) {
  const seen = new Set(), out = {}
  for (const s of screens) { let g = slugify(s.name); if (seen.has(g)) g = `${g}-${s.id.replace(/[^A-Za-z0-9]+/g, '-')}`; seen.add(g); out[s.id] = g }
  return out
}

// get_metadata XML: every node with its position relative to its top-level frame. Child x/y are relative to the parent.
export function nodesOf(xml) {
  const nodes = {}, stack = []
  for (const m of xml.matchAll(/<(\/?)([a-z][\w-]*)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>/g)) {
    const [, close, type, attrs, self] = m
    if (close) { stack.pop(); continue }
    const a = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]))
    const parent = stack.at(-1), isCanvas = type === 'canvas' || type === 'page'
    const n = { id: a.id, type, name: a.name || '', x: +a.x || 0, y: +a.y || 0, w: +a.width || 0, h: +a.height || 0, hidden: a.hidden === 'true', parent: parent && !parent.isCanvas ? parent.id : null, isCanvas }
    if (!isCanvas) {
      n.top = parent && !parent.isCanvas ? parent.top : n.id
      n.ax = n.top === n.id ? 0 : (parent.top === parent.id ? 0 : parent.ax) + n.x
      n.ay = n.top === n.id ? 0 : (parent.top === parent.id ? 0 : parent.ay) + n.y
      if (a.id) nodes[a.id] = n
    }
    if (!self) stack.push(n)
  }
  return nodes
}

const TRIG = { ON_CLICK: 'tap', ON_DRAG: 'drag', AFTER_TIMEOUT: 'after delay', ON_HOVER: 'hover', ON_PRESS: 'press', MOUSE_ENTER: 'hover', MOUSE_LEAVE: 'hover end' }
const ACT = { NAVIGATE: 'navigate', OVERLAY: 'overlay', SWAP: 'swap overlay', CHANGE_TO: 'change to (variant swap)', SCROLL_TO: 'scroll' }
// ponytail: interactive-looking by layer name only — the list is a candidate list the agent confirms, not a verdict
const LOOKS_TAPPABLE = /\b(btn|button|cta|back|close|link|chevron|arrow|toggle|switch|radio|checkbox|tab)\b/i
const PLATFORM_FONT = /^(SF Pro|SF Compact|SF Mono|\.SF|San Francisco|New York|Roboto)\b/
const STYLE = /\s(Thin|Hairline|Extra ?Light|Ultra ?Light|Light|Regular|Book|Medium|Semi ?Bold|Demi ?Bold|Bold|Extra ?Bold|Ultra ?Bold|Black|Heavy)( Italic)?$|\sItalic$/i

// Every image the design code uses, anywhere in the file: <img src={imgX}> — also inside helper components Figma defines
// before the default export (a tab bar: function Tab() {…}) — and CSS masks (maskImage: url("${imgX}")). The owner is the
// element with the reference, or the nearest element above it with a data-node-id.
export function refs(code) {
  const files = {}; for (const m of code.matchAll(/const (\w+) = `\$\{assetPathPrefix\}\/([^`]+)`/g)) files[m[1]] = m[2]
  const out = [], stack = []
  // Tags split at each "<": a tag's attributes run to the last ">" before the next "<", however deep its {…} nest
  // (style={{ maskImage: `url("${imgX}")` }} has three levels).
  // ponytail: assumes no "<" inside an attribute — true of Figma's design code; a real JSX parser if that ever changes
  const tags = [...code.matchAll(/<(\/?)([A-Za-z][\w.]*)/g)]
  tags.forEach((m, k) => {
    if (m[1]) { stack.pop(); return }
    const seg = code.slice(m.index, k + 1 < tags.length ? tags[k + 1].index : code.length), attrs = seg.slice(0, seg.lastIndexOf('>') + 1)
    // a component with variants writes ids as id={isVariant3 ? "node-1_1738" : … : "node-1_1686"}: the last is the default
    const variantIds = [...(attrs.match(/\bid=\{([^}]*)\}/) || [, ''])[1].matchAll(/"node-(\d+)_(\d+)"/g)].map((v) => `${v[1]}:${v[2]}`)
    const id = (attrs.match(/data-node-id="([^"]+)"/) || [])[1] || variantIds.at(-1), name = (attrs.match(/data-name="([^"]+)"/) || [])[1] || ''
    const owner = id || [...stack].reverse().find((e) => e.id)?.id
    for (const u of attrs.matchAll(/url\(\s*['"]?\$\{(\w+)\}/g)) if (files[u[1]] && owner) out.push({ id: owner, kind: 'mask', name, file: files[u[1]] })
    // src={imgX}, or one per variant: src={isVariant2 ? imgGroup5 : imgGroup2} — every image constant in the expression
    const src = m[2] === 'img' && attrs.match(/src=\{([^}]*)\}/)
    if (src && owner) for (const v of src[1].match(/\b\w+\b/g) || []) if (files[v]) out.push({ id: owner, kind: /\.svg$/i.test(files[v]) ? 'icon' : 'image', name, file: files[v] })
    if (!/\/\s*>$/.test(attrs.trimEnd())) stack.push({ id })
  })
  return out
}

// The exploring route, from the design's own buttons: every screen in the order taps reach it from the start, the taps
// that get there, and every other button on it with the screen it should open — so exploring follows a plan and checks
// each navigation, instead of tapping around (v4: 171 turns, 59 screenshots, 75 taps, no map).
// A tap is described by the button's text in the design code (what mobile_list_elements_on_screen shows) and its
// centre in the frame, in points.
export function route(screens, flows, nodes, ctx, label, keep = null, skip = []) {
  const ids = screens.map((s) => s.id), inContract = (id) => !keep || keep.has(id)
  const under = (id, el) => id === el || id.startsWith(`I${el};`) || (el.startsWith('I') && id.startsWith(`${el};`)) || (() => { for (let n = nodes[id]; n; n = nodes[n.parent]) if (n.id === el) return true; return false })()
  const textOf = (sid, el) => [...new Set(ctx[sid].comps.filter((c) => c.kind === 'text' && under(c.id, el)).map((c) => c.text))].join(' / ')
  const where = (el) => { const n = nodes[el]; return n ? `centre ${Math.round(n.ax + n.w / 2)},${Math.round(n.ay + n.h / 2)} pt, ${Math.round(n.w)}×${Math.round(n.h)}` : 'not in the metadata' }
  const tap = (f) => { const t = textOf(f.from, f.elId); return `${f.trigger} ${t ? `"${t}"` : `"${f.el}" (no text)`} — ${f.el} ${f.elId}, ${where(f.elId)}` }
  const skipped = (f) => skip.some((x) => f.elId === x || f.elId.startsWith(x))
  const nav = flows.filter((f) => f.destId && ids.includes(f.destId) && f.destId !== f.from && !skipped(f))
  const into = new Set(nav.map((f) => f.destId))
  const starts = ids.filter((id) => !into.has(id)) // nothing leads to them: the launch screen, and screens only the app reaches
  const path = {}, order = []
  for (const st of starts.length ? starts : ids.slice(0, 1)) { // breadth first: the fewest taps to each screen
    if (path[st]) continue
    path[st] = []; order.push(st)
    for (let q = [st]; q.length;) { const c = q.shift(); for (const f of nav.filter((x) => x.from === c)) { if (path[f.destId]) continue; path[f.destId] = [...path[c], f]; order.push(f.destId); q.push(f.destId) } }
  }
  // the first screen nothing leads to is where the app starts; any other such screen no button reaches (its own
  // buttons are still planned — the app gets there some other way, or it is a finding)
  const unreached = starts.slice(1)
  const md = `# Route

The exploring plan, built from the design's buttons (FLOWS.md): every screen in the order taps reach it, the taps that get there, and every button on it with the screen it should open. On the device, find a button by its text with mobile_list_elements_on_screen (the centre is in the design frame's points — a guide on another screen size). The app may add screens Figma does not draw (system prompts, consent, a paywall): handle them and go on. A screen CONTRACT.md leaves out is marked and skipped.

${order.map((id, i) => `## ${i + 1}. ${label(id)}${inContract(id) ? '' : ' — not in CONTRACT.md: skip'}

- Get there: ${path[id].length ? `${path[id][0].from !== starts[0] ? `(from ${label(path[id][0].from)}, which no button reaches) ` : ''}${path[id].map((f) => `on ${label(f.from)} ${tap(f)}`).join(' → ')}` : id === starts[0] ? 'the start screen — the app opens here' : 'no button in the design leads here: reach it as the app or CONTRACT.md says, or file a finding'}
${(() => { const out = flows.filter((f) => f.from === id && !skipped(f)); return out.length ? `- Buttons here (tap each once; the result must match):
${out.map((f) => `  - ${tap(f)} → ${f.action}${f.dest !== '—' ? ` ${f.dest}` : ''}${f.tr !== 'none' ? ` (${f.tr})` : ''}`).join('\n')}` : '- No button here has a reaction in the design.' })()}
`).join('\n')}
## Not reached by any button in the design

${unreached.map((id) => `- ${label(id)}${inContract(id) ? ' — reach it as CONTRACT.md says, or file a finding' : ' — not in CONTRACT.md'}`).join('\n') || '- none'}
`
  return { md, reached: order.length, unreached }
}

export function build(dir) {
  const imp = JSON.parse(rd(path.join(dir, 'import.json'), '{}'))
  const screens = screensOf(dir)
  if (!screens.length) throw new Error(`no pages/*.inventory.json in ${dir}`)
  const SL = slugs(screens), byId = Object.fromEntries(screens.map((s) => [s.id, s]))
  const nodes = Object.assign({}, ...ls(path.join(dir, 'pages'), /\.metadata\.xml$/).map((f) => nodesOf(rd(path.join(dir, 'pages', f)))))
  // a screen by its name; any other node (a component variant a reaction swaps to) by its frame and layer name
  const label = (id) => (byId[id] ? `${byId[id].name} (${id})` : nodes[id] ? `${(nodes[nodes[id].top] || {}).name || '?'} — ${nodes[id].name} (${id})` : id)
  const tokens = JSON.parse(rd(path.join(dir, 'tokens.json'), '{}'))
  const ex = (f) => fs.existsSync(path.join(dir, f))

  // contexts, texts, components, assets
  const ctx = {}
  for (const s of screens) {
    const files = ls(path.join(dir, 'screens'), new RegExp(`^${SL[s.id].replace(/[-]/g, '\\-')}(\\..+)?\\.context\\.md$`)).map((f) => `screens/${f}`)
    const comps = files.flatMap((f) => { const code = rd(path.join(dir, f)), main = extract(code, ''), got = new Set(main.filter((c) => c.file).map((c) => c.file)); return [...main, ...refs(code).filter((c) => !got.has(c.file))] })
    ctx[s.id] = { files, comps }
  }
  const assets = []
  for (const s of screens) {
    const W = nodes[s.id] ? nodes[s.id].w : null, seen = new Set()
    for (const c of ctx[s.id].comps.filter((c) => c.kind === 'image' || c.kind === 'icon' || c.kind === 'mask')) {
      if (seen.has(`${c.id}|${c.file}`)) continue; seen.add(`${c.id}|${c.file}`)
      const n = nodes[c.id] && nodes[c.id].top === s.id ? nodes[c.id] : null
      // the file as downloaded, or its .webp after image compression (assets.mjs) when the documents are rebuilt later
      const want = `assets/${SL[s.id]}-${c.file}`, webp = want.replace(/\.(png|jpe?g|gif)$/i, '.webp'), rel = !ex(want) && ex(webp) ? webp : want
      const a = { screen: s.id, nodeId: c.id, name: (n && n.name) || c.name || '', file: ex(rel) && fs.statSync(path.join(dir, rel)).size ? rel : 'MISSING', source: rel, parent: n && n.parent ? `${(nodes[n.parent] || {}).name || ''} (${n.parent})` : '', x: n ? r1(n.ax) : null, y: n ? r1(n.ay) : null, w: n ? r1(n.w) : null, h: n ? r1(n.h) : null }
      a.kind = c.kind === 'mask' ? 'mask' : /\.svg$/i.test(c.file) ? (a.w != null && Math.max(a.w, a.h) <= 48 ? 'icon' : 'vector') : 'image'
      a.align = a.x == null || W == null ? 'none' : Math.abs(a.x) <= 2 ? 'left' : Math.abs(a.x + a.w - W) <= 2 ? 'right' : Math.abs(a.x + a.w / 2 - W / 2) <= 2 ? 'centre' : 'none'
      assets.push(a)
    }
    assets.filter((a) => a.screen === s.id).sort((p, q) => (p.y ?? 1e9) - (q.y ?? 1e9) || (p.x ?? 0) - (q.x ?? 0)).forEach((a, i) => (a.order = i + 1))
  }
  const missingAssets = assets.filter((a) => a.file === 'MISSING')
  const used = new Set(assets.map((a) => a.file)), unused = ls(path.join(dir, 'assets'), /./).map((f) => `assets/${f}`).filter((f) => !used.has(f))

  // flows
  const flows = []
  for (const s of screens) for (const r of s.reactions || []) for (const rx of r.reactions || []) for (const a of rx.actions && rx.actions.length ? rx.actions : [rx.action].filter(Boolean)) {
    const tr = a.transition ? `type ${a.transition.type}${a.transition.easing ? `, easing ${a.transition.easing.type}` : ''}${a.transition.duration != null ? `, duration ${a.transition.duration} s` : ''}` : 'none'
    const action = a.type === 'BACK' ? 'back' : a.type === 'URL' ? `URL ${a.url || ''}`.trim() : ACT[a.navigation] || String(a.navigation || a.type)
    const dest = a.type === 'BACK' || a.type === 'URL' ? '—' : a.destinationId == null ? 'NONE (destination not set)' : label(a.destinationId)
    flows.push({ from: s.id, el: r.name, elId: r.id, trigger: TRIG[rx.trigger && rx.trigger.type] || (rx.trigger && rx.trigger.type) || '?', action, dest, destId: a.destinationId ?? null, tr, noDest: a.type === 'NODE' && a.destinationId == null })
  }
  const reached = new Set(flows.map((f) => f.destId)), unreached = screens.map((s) => s.id).filter((id) => !reached.has(id))
  const reactIds = new Set(screens.flatMap((s) => (s.reactions || []).map((r) => r.id)))
  const tappable = {}
  for (const n of Object.values(nodes)) if (byId[n.top] && n.id !== n.top && !n.hidden && LOOKS_TAPPABLE.test(n.name) && !reactIds.has(n.id)) (tappable[n.top] ||= []).push(`${n.name} (${n.id})`)

  // colours
  const varName = Object.fromEntries((tokens.variables || []).map((v) => [v.id, v.name]))
  const hexOf = (v) => (typeof v === 'string' ? v.toUpperCase() : v && typeof v === 'object' && 'r' in v ? `#${[v.r, v.g, v.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}` : null)
  const col = new Map()
  for (const s of screens) for (const c of s.colors || []) {
    const k = `${c.color}|${c.opacity}`
    if (!col.has(k)) col.set(k, { hex: /^#/.test(c.color) ? c.color.toUpperCase() : c.color, alpha: c.opacity ?? 1, name: c.variable ? varName[c.variable] || c.variable : null, modes: {}, usedOn: [], layers: 0 })
    const e = col.get(k); e.usedOn.push(`${s.name}: ${c.as === 'text' ? 'text' : c.as === 'stroke' ? 'border' : 'fill'} ×${c.count ?? 1}`); e.layers += c.count ?? 1
  }
  for (const v of (tokens.variables || []).filter((v) => v.resolvedType === 'COLOR')) {
    const modes = Object.fromEntries(Object.entries(v.valuesByMode || {}).map(([m, x]) => [m, hexOf(x)]).filter(([, x]) => x))
    const first = Object.values(modes)[0]
    if (first && ![...col.values()].some((c) => c.hex === first && c.name === v.name)) col.set(`var|${v.name}`, { hex: first, alpha: 1, name: v.name, modes, usedOn: [], layers: 0 })
  }
  const colors = [...col.values()].sort((a, b) => b.layers - a.layers)
  const solid = [...new Set(colors.filter((c) => /^#[0-9A-F]{6}$/.test(c.hex)).map((c) => c.hex))]
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), dist = (a, b) => Math.max(...rgb(a).map((v, k) => Math.abs(v - rgb(b)[k])))
  const near = []; for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) if (dist(solid[i], solid[j]) < 3) near.push([solid[i], solid[j]])
  const raw = colors.filter((c) => !c.name)
  const prdColors = (imp.prdColors || []).map((p) => {
    const hex = String(p.value || '').toUpperCase(), a = p.alpha ?? 1
    const hit = colors.find((c) => c.hex === hex && Math.abs(c.alpha - a) < 0.011)
    const closest = /^#[0-9A-F]{6}$/.test(hex) && solid.length ? solid.reduce((b, c) => (dist(c, hex) < dist(b, hex) ? c : b)) : null
    return { ...p, match: hit ? `${hit.hex}${hit.alpha !== 1 ? ` at ${hit.alpha}` : ''}` : 'NO MATCH', closest: hit ? '' : closest ? `${closest} (max channel difference ${dist(closest, hex)})` : '—' }
  })

  // fonts
  const fonts = new Map()
  for (const s of screens) for (const f of s.fonts || []) {
    const fam = f.font.replace(STYLE, '').trim() || f.font, style = f.font.slice(fam.length).trim() || 'Regular'
    if (!fonts.has(f.font)) fonts.set(f.font, { fam, style, screens: new Set(), sizes: new Set() })
    const e = fonts.get(f.font); e.screens.add(s.name); for (const z of f.sizes || []) e.sizes.add(r1(z))
  }
  const custom = [...new Set([...fonts.values()].filter((f) => !PLATFORM_FONT.test(f.fam)).map((f) => f.fam))]

  // PRD mapping (the agent's judgement, in import.json)
  const prd = imp.prd || { total: null, screens: [] }
  const inPrd = new Set(prd.screens.flatMap((p) => p.frames || []))
  const notInPrd = screens.map((s) => s.id).filter((id) => !inPrd.has(id)), prdNoFrame = prd.screens.filter((p) => !(p.frames || []).length)
  const matched = prd.screens.filter((p) => (p.frames || []).length).length
  const states = imp.states || {}
  const cnt = (id) => assets.filter((a) => a.screen === id), fin = (id) => flows.filter((f) => f.destId === id).length, fout = (id) => flows.filter((f) => f.from === id).length
  const tops = Object.values(nodes).filter((n) => n.top === n.id)
  const skipped = imp.skipped || tops.filter((n) => !byId[n.id]).map((n) => `${n.name} (${n.id})`)
  const row = (p, id) => `| ${p} | ${byId[id] ? byId[id].name : '?'} | ${id} | ${ctx[id] && ctx[id].files.length ? '✓' : '✗'} | ${ex(`reference/${SL[id]}.png`) ? '✓' : '✗'} | ${byId[id] ? '✓' : '✗'} | ${cnt(id).length} (${cnt(id).filter((a) => a.file === 'MISSING').length}) | ${fin(id)} / ${fout(id)} | ${states[id] || 'default'} |`
  const W = (f, t) => fs.writeFileSync(path.join(dir, f), t)

  W('SCREENS.md', `# Screens\n\nPRD.md states **${prd.total ?? '?'} screens**:\n\n${prd.screens.map((p, i) => `${i + 1}. ${p.name}`).join('\n') || '- (import.json has no PRD screen list)'}\n\n| PRD screen | Figma frame | Node id | Context | Reference | Inventory | Assets (missing) | Flows in / out | States shown |\n|---|---|---|---|---|---|---|---|---|\n${[...prd.screens.flatMap((p) => ((p.frames || []).length ? p.frames.map((id) => row(p.name, id)) : [`| ${p.name} | — | — | ✗ | ✗ | ✗ | 0 (0) | 0 / 0 | — |`])), ...notInPrd.map((id) => row('— (not in PRD.md)', id))].join('\n')}\n\n**PRD: ${prd.total ?? '?'} screens · Figma: ${screens.length} screens · matched: ${matched}**\n\n## In PRD.md, no Figma frame\n\n${prdNoFrame.map((p) => `- ${p.name}`).join('\n') || '- none'}\n\n## In Figma, not in PRD.md\n\n${notInPrd.map((id) => `- ${label(id)}`).join('\n') || '- none'}\n\n## Figma frames that are states of one PRD screen\n\n${prd.screens.filter((p) => (p.frames || []).length > 1).map((p) => `- ${p.name}: ${p.frames.map(label).join(', ')}`).join('\n') || '- none'}\n\n## Skipped top-level frames (not app screens)\n\n${skipped.map((x) => `- ${x}`).join('\n') || '- none'}\n`)

  W('FLOWS.md', `# Flows\n\nOne row per reaction, from \`node.reactions\` in pages/*.inventory.json. Transition values as Figma gives them (duration in seconds).\n\n| # | From screen | Element (name, node id) | Trigger | Action | Destination | Transition |\n|---|---|---|---|---|---|---|\n${flows.map((f, i) => `| ${i + 1} | ${label(f.from)} | ${f.el} (${f.elId}) | ${f.trigger} | ${f.action} | ${f.dest} | ${f.tr} |`).join('\n')}\n\nTotal reactions: ${flows.length}. Reactions with no destination set: ${flows.filter((f) => f.noDest).map((f) => `${label(f.from)} → ${f.el} (${f.elId})`).join('; ') || 'none'}.\n\n## Elements that look interactive but have no reaction\n\nBy layer name (button, back, close, tab, link, chevron, arrow, toggle, …) — candidates; the contract step asks only about the ones that matter.\n\n${Object.entries(tappable).map(([id, xs]) => `- **${label(id)}**: ${xs.join(', ')}`).join('\n') || '- none'}\n\n## Screens no flow reaches\n\n${unreached.map((id) => `- ${label(id)}`).join('\n') || '- none'}\n`)

  W('colors.json', JSON.stringify({ colors: colors.map((c) => ({ hex: c.hex, alpha: c.alpha, name: c.name, modes: c.modes, usedOn: c.usedOn })) }, null, 2))
  W('COLORS.md', `# Colours\n\nFrom tokens.json (variables, styles) and the per-screen inventories.\n\n| Colour | Alpha | Name | Layers | Used on |\n|---|---|---|---|---|\n${colors.map((c) => `| ${c.hex} | ${c.alpha} | ${c.name ?? '—'} | ${c.layers} | ${c.usedOn.join('; ')} |`).join('\n')}\n\n## Colours used raw (not through a variable or style)\n\n${raw.length ? `${raw.length} of ${colors.length}: ${raw.map((c) => `${c.hex}${c.alpha !== 1 ? ` at ${c.alpha}` : ''}`).join(', ')}` : '- none'}\n\n## Near-duplicate colours (closer than 3 in every channel)\n\n${near.map(([a, b]) => `- ${a} ≈ ${b}`).join('\n') || '- none'}\n\n## PRD colour mentions\n\n| PRD name | PRD value | PRD use | Design colour | Closest in design |\n|---|---|---|---|---|\n${prdColors.map((p) => `| ${p.name} | ${p.value}${(p.alpha ?? 1) !== 1 ? ` at ${p.alpha}` : ''} | ${p.use || ''} | ${p.match} | ${p.closest} |`).join('\n') || '| (import.json lists no PRD colour) | | | | |'}\n`)

  W('ASSETS.md', `# Assets\n\nOne row per image and icon each screen's design code uses (screens/*.context.md), placed from pages/*.metadata.xml: x, y, w, h relative to the screen frame (blank when the layer is inside an instance the metadata does not list). Order: top to bottom, then left to right. Align: an edge or the centre within 2 px of the frame.\n\n| Screen | # | Node id | Name | Kind | Parent layer | x | y | w | h | Align | File |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n${screens.flatMap((s) => cnt(s.id).sort((p, q) => p.order - q.order).map((a) => `| ${label(s.id)} | ${a.order} | ${a.nodeId} | ${a.name} | ${a.kind} | ${a.parent} | ${a.x ?? ''} | ${a.y ?? ''} | ${a.w ?? ''} | ${a.h ?? ''} | ${a.align} | ${a.file} |`)).join('\n')}\n\nTotal rows: ${assets.length} · files used: ${new Set(assets.filter((a) => a.file !== 'MISSING').map((a) => a.file)).size} · MISSING: ${missingAssets.length}\n\n## Downloaded, not used by any screen's design code\n\n${unused.map((f) => `- ${f}`).join('\n') || '- none'}\n`)

  W('FONTS.md', `# Fonts\n\nFrom the per-screen inventories. The Figma MCP cannot download font files: a custom font is MISSING until its files are supplied.\n\n| Family | Style | Sizes | Platform / custom | Status | Screens |\n|---|---|---|---|---|---|\n${[...fonts.values()].sort((a, b) => a.fam.localeCompare(b.fam) || a.style.localeCompare(b.style)).map((f) => `| ${f.fam} | ${f.style} | ${[...f.sizes].sort((a, b) => a - b).join(', ')} | ${PLATFORM_FONT.test(f.fam) ? 'platform' : 'custom'} | ${PLATFORM_FONT.test(f.fam) ? 'nothing to supply' : 'MISSING'} | ${[...f.screens].join(', ')} |`).join('\n')}\n`)

  const M = [
    ...custom.map((fam) => `Custom font **${fam}** — no font files; used on ${[...new Set([...fonts.values()].filter((f) => f.fam === fam).flatMap((f) => [...f.screens]))].join(', ')}.`),
    ...missingAssets.map((a) => `Asset ${a.nodeId} ${a.name} on ${label(a.screen)} — no file (${a.source}).`),
    ...prdNoFrame.map((p) => `PRD screen with no Figma frame: ${p.name}.`),
    ...notInPrd.map((id) => `Figma frame not in PRD.md: ${label(id)}.`),
    ...flows.filter((f) => f.noDest).map((f) => `Reaction with no destination: ${label(f.from)} → ${f.el} (${f.elId}), ${f.trigger}.`),
    ...unreached.map((id) => `Screen no flow reaches: ${label(id)}.`),
    ...Object.entries(tappable).map(([id, xs]) => `Interactive-looking, no reaction — ${label(id)}: ${xs.join(', ')}.`),
    ...prdColors.filter((p) => p.match === 'NO MATCH').map((p) => `PRD colour NO MATCH: ${p.name} ${p.value} (${p.use || ''}) — closest in design: ${p.closest}.`),
    ...near.map(([a, b]) => `Near-duplicate colours: ${a} and ${b}.`),
    ...(raw.length ? [`Colours used raw: ${raw.length} of ${colors.length} (see COLORS.md).`] : []),
  ]
  W('MISSING.md', `# Missing\n\nEvery gap the design import found. Each line becomes a question in the contract step.\n\n${M.map((m, i) => `M${i + 1}. ${m}`).join('\n') || 'Nothing missing.'}\n`)

  const tokRows = (tokens.variables || []).map((v) => `| ${v.name} | ${v.resolvedType} | ${JSON.stringify(Object.values(v.valuesByMode || {})[0])} |`)
  W('DESIGN.md', `# Design\n\n${imp.url ? `Figma file ${imp.url} — ` : ''}${screens.length} screen(s) imported.\n\n## Tokens\n\n| Name | Type | Value |\n|---|---|---|\n${tokRows.join('\n') || '| (no local variables) | | |'}\n| Paint styles | — | ${(tokens.paintStyles || []).length} |\n| Text styles | — | ${(tokens.textStyles || []).length} |\n\nColours: COLORS.md. Fonts: FONTS.md.\n\n${screens.map((s) => { const c = ctx[s.id].comps; return `## ${label(s.id)}\n\n- Context: ${ctx[s.id].files.join(', ') || 'MISSING'} · Reference: ${ex(`reference/${SL[s.id]}.png`) ? `reference/${SL[s.id]}.png` : 'MISSING'}\n- Assets (${cnt(s.id).length}): ${[...new Set(cnt(s.id).map((a) => a.file))].join(', ') || '—'}\n- Texts: ${c.filter((x) => x.kind === 'text').map((x) => `"${x.text}"`).join(', ') || '—'}\n- Components: ${c.filter((x) => ['bar', 'button', 'input', 'control'].includes(x.kind)).map((x) => `${x.kind} ${x.name} (${x.id})`).join(', ') || '—'}\n- States shown: ${states[s.id] || 'default'}\n- Flows out: ${flows.filter((f) => f.from === s.id).map((f) => `${f.el} (${f.elId}) ${f.trigger} → ${f.dest}`).join('; ') || 'none'}\n` }).join('\n')}\n## In the design but not in PRD.md\n\n${notInPrd.map((id) => `- ${label(id)}`).join('\n') || '- none'}\n\n## In PRD.md but no screen in the design\n\n${prdNoFrame.map((p) => `- ${p.name}`).join('\n') || '- none'}\n`)

  const manifest = { url: imp.url ?? null, fileKey: imp.fileKey ?? null, importedAt: imp.importedAt ?? null,
    screens: screens.map((s) => ({ name: s.name, nodeId: s.id, slug: SL[s.id], page: s.page, context: ctx[s.id].files.map((f) => `design/${f}`), assets: [...new Set(cnt(s.id).filter((a) => a.file !== 'MISSING').map((a) => `design/${a.file}`))], reference: `design/reference/${SL[s.id]}.png` })),
    assets: [...new Map(assets.map((a) => [`${a.nodeId}|${a.source}`, { nodeId: a.nodeId, name: a.name, kind: a.kind, file: a.file === 'MISSING' ? 'MISSING' : `design/${a.file}` }])).values()],
    skipped, figmaCalls: imp.figmaCalls ?? null, figmaCallsByTool: imp.figmaCallsByTool ?? {} }
  W('manifest.json', JSON.stringify(manifest, null, 2))
  const rt = route(screens, flows, nodes, ctx, label, imp.prd && imp.prd.screens ? new Set(imp.prd.screens.flatMap((p) => p.frames || [])) : null, imp.routeSkip || [])
  W('ROUTE.md', rt.md)
  return { routed: rt.reached, unrouted: rt.unreached.length, unusedFiles: unused.length, screens: screens.length, prdScreens: prd.total ?? null, matchedScreens: matched, flows: flows.length, colors: colors.length, assets: assets.length, assetFiles: new Set(assets.filter((a) => a.file !== 'MISSING').map((a) => a.file)).size, missingAssets: missingAssets.length, missing: M.length, customFonts: custom, skipped: skipped.length }
}

function selftest() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ddocs-'))
  for (const s of ['pages', 'screens', 'assets', 'reference']) fs.mkdirSync(path.join(d, s))
  fs.writeFileSync(path.join(d, 'pages/page-1.metadata.xml'), `<canvas id="0:1" name="Page 1" x="0" y="0" width="0" height="0">
  <frame id="1:1" name="Home" x="0" y="0" width="375" height="812">
    <frame id="1:2" name="Back button" x="16" y="50" width="44" height="44">
      <vector id="1:3" name="chevron" x="10" y="10" width="24" height="24" />
    </frame>
    <rounded-rectangle id="1:4" name="hero" x="0" y="100" width="375" height="200" />
  </frame>
  <frame id="1:5" name="Home" x="400" y="0" width="375" height="812" />
  <frame id="1:9" name="notes" x="800" y="0" width="100" height="100" />
</canvas>`)
  const go = (dest, trans) => ({ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: dest, navigation: 'NAVIGATE', transition: trans }] })
  fs.writeFileSync(path.join(d, 'pages/page-1.inventory.json'), JSON.stringify({ page: 'Page 1 (0:1)', screens: [
    { id: '1:1', name: 'Home', reactions: [{ id: '1:4', name: 'hero', reactions: [go('1:5', { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.3 }), go(null, null)] }], colors: [{ color: '#FFFFFF', opacity: 1, variable: null, count: 3, as: 'fill' }, { color: '#FFFFFE', opacity: 1, variable: 'V:1', count: 1, as: 'text' }], fonts: [{ font: 'Manrope Bold', sizes: [22.0000001] }, { font: 'SF Pro Semibold', sizes: [17] }] },
    { id: '1:5', name: 'Home', reactions: [], colors: [], fonts: [] }] }))
  fs.writeFileSync(path.join(d, 'tokens.json'), JSON.stringify({ variables: [{ id: 'V:1', name: 'ink', resolvedType: 'COLOR', valuesByMode: { Light: '#FFFFFE' } }] }))
  const code = (img) => `const assetPathPrefix = "https://x";\nconst imgHero = \`\${assetPathPrefix}/aa11.png\`;\nconst imgChevron = \`\${assetPathPrefix}/bb22.svg\`;\nconst imgMask = \`\${assetPathPrefix}/cc33.svg\`;\nconst imgVarA = \`\${assetPathPrefix}/dd44.svg\`;\nconst imgVarB = \`\${assetPathPrefix}/ee55.svg\`;\nexport default function Home() {\n  return (\n    <div data-node-id="1:1" data-name="Home">\n      <div data-node-id="1:2" data-name="Back button"><img data-node-id="1:3" src={imgChevron} /></div>\n      ${img ? '<img data-node-id="1:4" data-name="hero" src={imgHero} />' : ''}\n      <div data-node-id="1:7" data-name="Clip"><div className="mask-alpha" style={{ maskImage: \`url("\${imgMask}")\` }} data-name="Group" /></div>
      <div id={isVariant2 ? "node-1_19" : "node-1_8"} data-name="Tab"><img alt="" src={isVariant2 ? imgVarA : imgVarB} /></div>
      <p data-node-id="1:6">Welcome</p>\n    </div>\n  );\n}\n`
  assert.deepEqual(slugs(screensOf(d)), { '1:1': 'home', '1:5': 'home-1-5' }, 'a repeated frame name gets its id')
  fs.writeFileSync(path.join(d, 'screens/home.context.md'), code(true)); fs.writeFileSync(path.join(d, 'screens/home-1-5.context.md'), code(false))
  fs.writeFileSync(path.join(d, 'assets/home-aa11.png'), 'x'); fs.writeFileSync(path.join(d, 'reference/home.png'), 'x')
  fs.writeFileSync(path.join(d, 'import.json'), JSON.stringify({ url: 'https://figma.com/design/k', fileKey: 'k', figmaCalls: 7, prd: { total: 2, screens: [{ name: 'Home — 4.1', frames: ['1:1', '1:5'] }, { name: 'Settings — 4.2', frames: [] }] }, states: { '1:5': 'empty' }, prdColors: [{ name: 'ink', value: '#fffffe', alpha: 1, use: 'text' }, { name: 'brand', value: '#336699', use: 'buttons' }] }))
  const res = build(d)
  assert.deepEqual([res.screens, res.matchedScreens, res.flows, res.assets, res.missingAssets, res.skipped, res.unusedFiles], [2, 1, 2, 9, 8, 1, 0])
  assert.match(fs.readFileSync(path.join(d, 'ASSETS.md'), 'utf8'), /\| 1:8 \| [^|]*\| vector \|[\s\S]*\| 1:8 \|/, 'variant images, owned by the default variant id')
  assert.match(fs.readFileSync(path.join(d, 'ASSETS.md'), 'utf8'), /\| 1:7 \| Group \| mask \|/, 'a CSS mask image is an asset, owned by the nearest element with an id')
  const t = (f) => fs.readFileSync(path.join(d, f), 'utf8')
  assert.match(t('FLOWS.md'), /\| 1 \| Home \(1:1\) \| hero \(1:4\) \| tap \| navigate \| Home \(1:5\) \| type DISSOLVE, easing EASE_OUT, duration 0\.3 s \|/)
  assert.match(t('FLOWS.md'), /no destination set: Home \(1:1\) → hero \(1:4\)/)
  assert.match(t('FLOWS.md'), /\*\*Home \(1:1\)\*\*: Back button \(1:2\), chevron \(1:3\)/, 'named like a button, no reaction')
  assert.match(t('ASSETS.md'), /\| Home \(1:1\) \| 1 \| 1:3 \| chevron \| icon \| Back button \(1:2\) \| 26 \| 60 \| 24 \| 24 \| none \| MISSING \|/, 'position = parent offset + own offset')
  assert.match(t('ASSETS.md'), /\| 1:4 \| hero \| image \| [^|]*\| 0 \| 100 \| 375 \| 200 \| left \| assets\/home-aa11\.png \|/)
  assert.match(t('COLORS.md'), /#FFFFFF ≈ #FFFFFE/)
  assert.match(t('COLORS.md'), /\| ink \| #fffffe \| text \| #FFFFFE \|  \|/)
  assert.match(t('COLORS.md'), /\| brand \| #336699 \| buttons \| NO MATCH \| #FFFFFF \(max channel difference 204\) \|/)
  assert.match(t('FONTS.md'), /\| Manrope \| Bold \| 22 \| custom \| MISSING \|/); assert.match(t('FONTS.md'), /\| SF Pro \| Semibold \| 17 \| platform \|/)
  assert.match(t('SCREENS.md'), /\*\*PRD: 2 screens · Figma: 2 screens · matched: 1\*\*/); assert.match(t('SCREENS.md'), /## In PRD.md, no Figma frame\n\n- Settings — 4\.2/)
  assert.match(t('SCREENS.md'), /- notes \(1:9\)/, 'a top-level frame no inventory lists is skipped')
  assert.match(t('MISSING.md'), /M1\. Custom font \*\*Manrope\*\*/); assert.match(t('MISSING.md'), /PRD colour NO MATCH: brand/)
  assert.match(t('DESIGN.md'), /- Texts: "Welcome"/)
  const m = JSON.parse(t('manifest.json')); assert.deepEqual([m.screens[1].slug, m.screens[0].context, m.figmaCalls], ['home-1-5', ['design/screens/home.context.md'], 7])
  JSON.parse(t('colors.json'))
  assert.match(t('ROUTE.md'), /## 1\. Home \(1:1\)\n\n- Get there: the start screen/)
  assert.match(t('ROUTE.md'), /## 2\. Home \(1:5\)\n\n- Get there: on Home \(1:1\) tap "hero" \(no text\) — hero 1:4, centre 188,200 pt, 375×200/)
  assert.match(t('ROUTE.md'), /- tap "hero" \(no text\) — hero 1:4, [^\n]*→ navigate Home \(1:5\) \(type DISSOLVE/)
  // a reaction drawn in an illustration (routeSkip) is never routed through or listed as a button
  fs.writeFileSync(path.join(d, 'import.json'), JSON.stringify({ ...JSON.parse(t('import.json')), routeSkip: ['1:4'] })); build(d)
  assert.match(t('ROUTE.md'), /## 2\. Home \(1:5\)\n\n- Get there: no button in the design leads here/)
  assert.doesNotMatch(t('ROUTE.md'), /tap "hero"/)
  return `selftest ok (${JSON.stringify(res)})`
}

const [cmd, dir] = process.argv.slice(2)
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (cmd === 'selftest') console.log(selftest())
  else if (cmd === 'slugs' && dir) console.log(JSON.stringify(slugs(screensOf(dir))))
  else if (cmd === 'build' && dir) { try { console.log(JSON.stringify(build(dir))) } catch (e) { console.error(`design-docs: ${e.message}`); process.exit(1) } }
  else { console.error('usage: design-docs.mjs slugs <design dir> | build <design dir> | selftest'); process.exit(2) }
}
