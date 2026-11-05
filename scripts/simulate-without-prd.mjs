// Runs workflows/app-dev-without-prd.js with fake agents (no Claude, no devices): which steps run, where the one question stop
// is, and what each prompt and nextStep says, for each folder state below. Run after every change to the workflow:
// node scripts/simulate-without-prd.mjs
import fs from 'node:fs'
const src = fs.readFileSync(new URL('../workflows/app-dev-without-prd.js', import.meta.url), 'utf8').replace(/^export const meta = /m, 'const meta = ')
const AF = Object.getPrototypeOf(async () => {}).constructor
const have = (o) => ({ store: 0, static: 0, walk: 0, prd: false, prdProblems: null, staticMissing: [], contract: false, app: false, dartFiles: 0, ...o })
const q = (id, labels) => ({ id, header: id, question: `${id}?`, options: labels.map((l, i) => ({ label: i ? l : `${l} (Recommended)`, description: 'd' })), why: 'w' })
let fails = 0
const ok = (c, m) => { console.log(`   ${c ? 'ok' : 'FAIL'}: ${m}`); if (!c) fails++ }
async function sim(name, args, over = {}) {
  const calls = [], prompts = {}, logs = []
  const agent = async (p, o) => { calls.push(o.label); prompts[o.label] = p; const v = over[o.label]; return typeof v === 'function' ? v(p) : v }
  const res = await new AF('args', 'agent', 'parallel', 'phase', 'log', src)(args, agent, (f) => Promise.all(f.map((g) => g())), () => {}, (l) => logs.push(l))
  const bad = Object.entries(prompts).filter(([, p]) => /undefined|\[object Object\]|NaN/.test(p)).map(([l]) => l)
  if (res.nextStep && /undefined|\[object Object\]/.test(res.nextStep)) bad.push('nextStep')
  console.log(`\n## ${name}\n${calls.join(' | ')}\n→ ${res.stage || res.resumed || (res.done ? 'done' : 'aborted')}${res.questions ? ` · questions ${res.questions.map((x) => x.id).join(',')}` : ''}${bad.length ? `\nBAD: ${bad}` : ''}`)
  ok(!bad.length, 'no undefined / [object Object] in prompts or nextStep')
  return { calls, prompts, res, logs }
}
const L = 'https://play.google.com/store/apps/details?id=com.x'
const baseSrc = { ok: true, have: have({}), projectDir: '/p', scratch: '/p.source', link: L, androidPackage: 'com.x', apks: ['/p.source/apk/unzipped-base.apk'], apkFrom: 'folder', unzipped: true, splitsMissing: true, pairip: true, installable: false, phone: 'ZD22', phoneModel: 'moto e22s', questions: [q('apk', ['Pull from my phone', "I'll add the APK set", 'Go on without the walk']), q('walk', ['My phone', 'Play on emulator']), q('name', ['Mendo', 'Fixa', 'Rivo'])] }
const fine = { 'audit: store + web': { title: 't', features: 3, screenshots: 2, pages: 1 }, 'audit: APK files': { framework: 'native', dependencies: 9, ownScreens: 4, layouts: 40, dataTables: 2 }, 'audit: walk': { walked: 12, fields: 3, outputs: 2, navigation: 20, notReached: [] }, 'gaps → decisions': { decided: 2, ids: ['gap-1', 'gap-2'] }, 'report: PRD + theme': { ready: true, screens: 12, features: 5, fields: 3, assumed: 0, notObserved: 0, check: 'audit ready' } }

const ONLY_START = (x) => !x.res.questions || x.res.questions.every((y) => ['link', 'apk', 'walk', 'walkfallback', 'name', 'firebase', 'purchases', 'keys'].includes(y.id))

let x = await sim('1 · start: unzipped APK, splits missing, a phone has the app → the ONE stop', L, { source: baseSrc })
ok(x.res.stage === 'questions' && x.res.questions.map((y) => y.id).join() === 'apk,walk,name,walkfallback' && x.calls.join() === 'source', 'every question in one stop before the audit: apk, walk, name and where the walk runs if it fails')
const fb = x.res.questions.find((y) => y.id === 'walkfallback')
ok(fb.options.map((o) => o.label).join('|') === 'Play on emulator (Recommended)|Plugin emulator|Go on without the walk' && /\?$/.test(fb.question) && fb.header.length <= 12, 'the fallback offers the other devices and no walk; the walk\'s own first choice (My phone, pairip) is not the recommended fallback')
ok(/AskUserQuestion tool, up to 4 questions per call/.test(x.res.nextStep) && /never start a timer/.test(x.res.nextStep) && /nothing is asked after this/.test(x.res.nextStep) && /"answers":\[\]/.test(x.res.nextStep), 'the chat asks all, waits, relaunches with the answers; it is told nothing is asked after this')
ok(/the Source step's questions, asked once at the start, are the only ones/.test(x.prompts.source) && /splitsMissing/.test(x.prompts.source) && /unzipped-base\.apk/.test(x.prompts.source), 'agents never ask; the source step detects the unzipped APK and missing splits')

const A1 = [{ id: 'apk', question: 'apk?', answer: 'Pull from my phone (Recommended)', by: 'user' }, { id: 'walk', question: 'walk?', answer: 'My phone', by: 'user' }, { id: 'name', question: 'name?', answer: 'Mendo', by: 'user' }, { id: 'walkfallback', question: 'f?', answer: 'Play on emulator (Recommended)', by: 'user' }]
const pulled = { ...baseSrc, apks: ['/p.source/apk/base.apk', '/p.source/apk/split_config.en.apk'], apkFrom: 'phone', unzipped: false, splitsMissing: false, installable: true }
x = await sim('2 · answered: no other stop until build-app, which asks nothing', { app: L, answers: A1 }, { source: pulled, ...fine })
ok(x.res.done && x.calls.join() === 'source,audit: store + web,audit: APK files,audit: walk,gaps → decisions,report: PRD + theme' && ONLY_START(x), 'audit, decisions and report run without a stop')
ok(/Pull from my phone": `.*pull <each path>/.test(x.prompts.source) && /source-app\/answers\.md/.test(x.prompts.source) && /every other earlier answer and the "## Decided without asking" section stay/.test(x.prompts.source) && /"## Superseded"/.test(x.prompts.source) && /source-app\/answers\.md does not already answer/.test(x.prompts.source), 'the source step pulls the set and adds to answers.md: earlier answers and decisions kept, retired theme/image answers superseded, answered subjects not asked again')
ok(/look for it beside the project/.test(x.prompts.source), 'an APK an earlier run audited is found beside the project')
{ const y = await sim('2b · "I\'ll add the APK set"', { app: L, answers: [{ id: 'apk', question: 'apk?', answer: "I'll add the APK set", by: 'user' }, ...A1.slice(1)] }, { source: baseSrc, ...fine })
  ok(/no APK file and no unzipped APK in the folder → stop/.test(y.prompts.source) && /An unzipped or incomplete set is used for its files/.test(y.prompts.source) && !/still not installable → stop/.test(y.prompts.source), '"I\'ll add the APK set": stops only when no APK at all is there; an unzipped base is used for its files') }
ok(/- iOS bundle id: <id>/.test(x.prompts['report: PRD + theme']) && /nothing under its "## Superseded"/.test(x.prompts['report: PRD + theme']), 'PRD §1 names the package (= namespace) and the iOS bundle id; superseded answers are not cited')
ok(/the user's phone moto e22s \(serial ZD22\)/.test(x.prompts['audit: walk']) && /phone save S/.test(x.prompts['audit: walk']) && /phone restore S/.test(x.prompts['audit: walk']) && !/uninstall com\.x/.test(x.prompts['audit: walk']), 'the walk runs on the phone, saves and restores its settings, never uninstalls')
ok(/dexdump/.test(x.prompts['audit: APK files']) && /- L<nn> · <path>/.test(x.prompts['audit: APK files']) && /source-app\.mjs" reuse "<unzipped>" \./.test(x.prompts['audit: APK files']) && /every split APK of the set/.test(x.prompts['audit: APK files']) && !/res-hashes/.test(JSON.stringify(x.prompts)), 'the APK files step records layouts (L), code data (dexdump) and takes the app\'s own files (reuse, splits included) — no copy ban')
ok(/primary and secondary ARE the source's/.test(x.prompts['report: PRD + theme'] || '') && /## 12\. Reused from the source app/.test(x.prompts['report: PRD + theme'] || '') && !/NEW theme|Not copied/.test(x.prompts['report: PRD + theme'] || ''), 'PRD: the source app\'s own theme is kept and every reusable file is placed; never a new theme or a copy ban')
ok(/nothing is asked after the start of this run: you decide each gap and record it/.test(x.prompts['gaps → decisions']) && /by: "decided"/.test(x.prompts['gaps → decisions']) && /### gap-<n> · <question>/.test(x.prompts['gaps → decisions']), 'gaps are decided (closest to the evidence) and recorded in answers.md and DECISIONS.md')
ok(/\[decided: gap-<n>\]/.test(x.prompts['report: PRD + theme']) && /Nothing is asked and nothing is guessed/.test(x.prompts['report: PRD + theme']) && /"Mendo"/.test(x.prompts['report: PRD + theme']) && /check \. --apk`/.test(x.prompts['report: PRD + theme']), 'the report cites decisions, decides a late gap the same way, and never returns a question')
ok(/"decideAll":true/.test(x.res.nextStep) && /without asking anything/.test(x.res.nextStep) && /then senior QA and the final audit/.test(x.res.nextStep), 'build-app is started with decideAll: no question in the contract or the build')

const deadWalk = { walked: 0, fields: 0, outputs: 0, navigation: 0, notReached: [], note: 'stopped at Play\'s licence screen' }
x = await sim('3 · the walk reaches no screen → the fallback chosen at the start, in the same run', { app: L, answers: A1 }, { source: pulled, ...fine, 'audit: walk': deadWalk, 'audit: walk (play)': { walked: 9, fields: 1, outputs: 1, navigation: 10, notReached: [] } })
ok(x.res.done && ONLY_START(x) && x.calls.includes('audit: walk (play)') && /installed from Google Play by the user/.test(x.prompts['audit: walk (play)']) && /check \. --apk`/.test(x.prompts['report: PRD + theme']), 'no question: the second walk runs on Play on the emulator and its screens count')

x = await sim('4 · both walks reach no screen → no walk, recorded, no question', { app: L, answers: A1 }, { source: pulled, ...fine, 'audit: walk': deadWalk, 'audit: walk (play)': deadWalk })
ok(x.res.done && ONLY_START(x) && /check \. --apk --no-walk`/.test(x.prompts['report: PRD + theme']) && /the devices tried and what each returned/.test(x.prompts['report: PRD + theme']) && x.logs.some((l) => /no screen reached on phone or play — PRD\.md comes from the files and screenshots; nothing is asked/.test(l)), 'the PRD is written from the files; Sources records both tries')
ok(/One of them is the walk: it reached no screen \(phone then play\)/.test(x.prompts['gaps → decisions']) && /first option "Go on without the walk"/.test(x.prompts['gaps → decisions']), 'going on without the walk is a recorded decision, so a later run does not re-audit for it')

x = await sim('5 · the walk agent returns nothing → the fallback runs', { app: L, answers: A1 }, { source: pulled, ...fine, 'audit: walk': null, 'audit: walk (play)': { walked: 4, fields: 0, outputs: 0, navigation: 3, notReached: [] } })
ok(x.res.done && x.calls.includes('audit: walk (play)') && ONLY_START(x), 'a dead walk agent is a failed walk: the fallback, no question')

const A2 = [...A1.filter((a) => a.id !== 'walkfallback'), { id: 'walkfallback', question: 'f?', answer: 'Go on without the walk', by: 'user' }]
x = await sim('6 · fallback "Go on without the walk" and the walk fails → no second walk', { app: L, answers: A2 }, { source: pulled, ...fine, 'audit: walk': deadWalk })
ok(x.res.done && !x.calls.some((c) => /audit: walk \(/.test(c)) && /--no-walk/.test(x.prompts['report: PRD + theme']), 'the answer from the start is followed')

x = await sim('7 · the user chose no walk (unzipped APK only)', { app: L, answers: [{ id: 'apk', question: 'a?', answer: 'Go on without the walk', by: 'user' }, { id: 'name', question: 'n?', answer: 'Mendo', by: 'user' }] }, { source: { ...baseSrc, phone: '', phoneModel: '' }, ...fine })
ok(x.res.done && !x.calls.includes('audit: walk') && /check \. --apk --no-walk`/.test(x.prompts['report: PRD + theme']), 'no walk question, no fallback question, no walk; the check is told')

x = await sim('8 · PRD.md ready + CONTRACT.md + code: build-app re-audits the contract, nothing asked', L, { source: { ...baseSrc, have: have({ store: 5, static: 80, walk: 12, prd: true, prdProblems: 0, contract: true, app: true, dartFiles: 9 }) } })
ok(x.res.resumed === 'build' && !x.res.questions && x.calls.join() === 'source' && /with args \{"noFigma":true,"decideAll":true\}/.test(x.res.nextStep) && /re-audited against PRD\.md/.test(x.res.nextStep), 'no question, no audit; build-app re-audits CONTRACT.md with decideAll and continues from the code')

x = await sim('9 · PRD.md ready, no contract: straight to the contract', L, { source: { ...baseSrc, have: have({ store: 5, static: 80, walk: 12, prd: true, prdProblems: 0 }) } })
ok(x.res.resumed === 'prd' && /"noFigma":true,"decideAll":true/.test(x.res.nextStep), 'a finished PRD.md goes to build-app without a new audit or a question')

const rc = have({ store: 52, static: 114, walk: 0, prd: true, prdProblems: 137, staticMissing: ['layouts', 'data', 'hashes'], contract: true, app: true, dartFiles: 127 })
x = await sim('10 · Repair Coach: contract + 127 .dart files, PRD.md fails the check, static.md lacks the 0.49.0 parts', { app: L, answers: [{ id: 'apk', question: 'a?', answer: 'Go on without the walk', by: 'user' }, { id: 'name', question: 'n?', answer: 'Keep Mendwise (Recommended)', by: 'user' }] }, { source: { ...baseSrc, phone: '', phoneModel: '', have: rc }, ...fine, 'audit: APK files (missing parts)': { layouts: 48, dataTables: 3 } })
ok(x.calls.join() === 'source,audit: APK files (missing parts),gaps → decisions,report: PRD + theme' && ONLY_START(x) && x.logs.some((l) => /re-auditing PRD\.md: 137 check problem\(s\); static\.md lacks layouts, data, hashes/.test(l)), 'store.md kept; only the missing static parts added; gaps decided; PRD.md re-audited — no full audit, no stop')
ok(/change none of its lines\. It lacks: layouts, data, hashes/.test(x.prompts['audit: APK files (missing parts)']) && /PRD\.md from an earlier run is here \(137 check problem\(s\)\): continue from it/.test(x.prompts['report: PRD + theme']) && /re-audits the CONTRACT\.md already here/.test(x.res.nextStep), 'the supplement adds only steps 8–10; the report continues PRD.md; build-app re-audits the contract')
ok(/with the new name the user answered at the start: "Mendwise";/.test(x.prompts['report: PRD + theme']), '"Keep Mendwise" keeps the name Mendwise')
console.log(fails ? `\n${fails} FAIL` : '\nall ok')
if (fails) process.exitCode = 1
