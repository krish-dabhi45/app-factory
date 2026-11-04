// Runs workflows/app-dev-without-prd.js with fake agents (no Claude, no devices): which steps run, which questions stop
// the run, and what each prompt and nextStep says, for each folder state below. Run after every change to the workflow:
// node scripts/simulate-without-prd.mjs
import fs from 'node:fs'
const src = fs.readFileSync(new URL('../workflows/app-dev-without-prd.js', import.meta.url), 'utf8').replace(/^export const meta = /m, 'const meta = ')
const AF = Object.getPrototypeOf(async () => {}).constructor
const have = (o) => ({ store: 0, static: 0, walk: 0, prd: false, prdProblems: null, contract: false, app: false, dartFiles: 0, ...o })
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
const baseSrc = { ok: true, resume: 'audit', have: have({}), projectDir: '/p', scratch: '/p.source', link: L, androidPackage: 'com.x', apks: ['/p.source/apk/unzipped-base.apk'], apkFrom: 'folder', unzipped: true, splitsMissing: true, pairip: true, installable: false, phone: 'ZD22', phoneModel: 'moto e22s', questions: [q('apk', ['Pull from my phone', "I'll add the APK set", 'Go on without the walk']), q('walk', ['My phone', 'Play on emulator']), q('name', ['Mendo', 'Fixa', 'Rivo'])] }
const fine = { 'audit: store + web': { title: 't', features: 3, screenshots: 2, pages: 1 }, 'audit: APK files': { framework: 'native', dependencies: 9, ownScreens: 4, layouts: 40, dataTables: 2 }, 'audit: walk': { walked: 12, fields: 3, outputs: 2, navigation: 20, notReached: [] }, gaps: { questions: [] }, 'report: PRD + theme': { ready: true, screens: 12, features: 5, fields: 3, assumed: 0, notObserved: 0, check: 'audit ready' } }

let x = await sim('1 · start: unzipped APK, splits missing, a phone has the app', L, { source: baseSrc })
ok(x.res.stage === 'questions' && x.res.questions.map((y) => y.id).join() === 'apk,walk,name' && x.calls.join() === 'source', 'stops before the audit with the apk, walk and name questions')
ok(/AskUserQuestion tool, up to 4 questions per call/.test(x.res.nextStep) && /never start a timer/.test(x.res.nextStep) && /app-factory:app-dev-without-prd again/.test(x.res.nextStep) && /"answers":\[\]/.test(x.res.nextStep), 'the chat asks all, waits, relaunches this workflow with the answers')
ok(/Never ask the user directly/.test(x.prompts.source) && /"walk" \(header "Walk on"\)/.test(x.prompts.source) && /splitsMissing/.test(x.prompts.source) && /unzipped-base\.apk/.test(x.prompts.source), 'the source step detects the unzipped APK and missing splits and writes the questions')

const A1 = [{ id: 'apk', question: 'apk?', answer: 'Pull from my phone (Recommended)', by: 'user' }, { id: 'walk', question: 'walk?', answer: 'My phone', by: 'user' }, { id: 'name', question: 'name?', answer: 'Mendo', by: 'user' }]
const pulled = { ...baseSrc, apks: ['/p.source/apk/base.apk', '/p.source/apk/split_config.en.apk'], apkFrom: 'phone', unzipped: false, splitsMissing: false, installable: true }
x = await sim('2 · answers given: pulled from the phone, walk on the phone', { app: L, answers: A1 }, { source: pulled, ...fine })
ok(x.res.done && x.calls.join() === 'source,audit: store + web,audit: APK files,audit: walk,gaps,report: PRD + theme', 'answered questions are not asked again; audit, gaps, report run')
ok(/Pull from my phone": `.*pull <each path>/.test(x.prompts.source) && /source-app\/answers\.md/.test(x.prompts.source), 'the source step pulls the set and writes answers.md')
ok(/the user's phone moto e22s \(serial ZD22\)/.test(x.prompts['audit: walk']) && /phone save S/.test(x.prompts['audit: walk']) && /phone restore S/.test(x.prompts['audit: walk']) && !/uninstall com\.x/.test(x.prompts['audit: walk']), 'the walk runs on the phone, saves and restores its settings, never uninstalls')
ok(/dexdump/.test(x.prompts['audit: APK files']) && /- L<nn> · <path>/.test(x.prompts['audit: APK files']) && /hashes .* > source-app\/res-hashes\.txt/.test(x.prompts['audit: APK files']), 'the APK files step records layouts (L), code data (dexdump) and file hashes')
ok(/- Name: \*\*<the new name>\*\* \[user\]" with the new name "Mendo"/.test(x.prompts['report: PRD + theme']) && /check \. --apk`/.test(x.prompts['report: PRD + theme']) && /then senior QA and the final audit/.test(x.res.nextStep), 'the report names the answered name; the next step runs the whole build chain')

x = await sim('3 · the walk reaches no screen', { app: L, answers: A1 }, { source: pulled, ...fine, 'audit: walk': { walked: 0, fields: 0, outputs: 0, navigation: 0, notReached: [], note: 'stopped at Play\'s licence screen' } })
ok(x.res.stage === 'questions' && x.res.questions[0].id === 'walkfail-1' && /licence screen/.test(x.res.questions[0].question) && x.res.questions[0].options.some((o) => o.label === 'Go on without the walk') && !x.calls.includes('gaps'), 'a failed walk stops with the walkfail-1 question before any PRD work')

const A2 = [...A1, { id: 'walkfail-1', question: 'w?', answer: 'Play on emulator', by: 'user' }]
x = await sim('4 · after walkfail: Play on the emulator; evidence kept', { app: L, answers: A2 }, { source: { ...pulled, have: have({ store: 5, static: 80 }) }, ...fine })
ok(!x.calls.includes('audit: store + web') && !x.calls.includes('audit: APK files') && /installed from Google Play by the user/.test(x.prompts['audit: walk']) && /market:\/\/details\?id=com\.x/.test(x.prompts['audit: walk']), 'kept evidence is not redone; the walk now installs from Play on the emulator')

x = await sim('5 · gaps found before PRD.md', { app: L, answers: A2 }, { source: { ...pulled, have: have({ store: 5, static: 80, walk: 12 }) }, ...fine, gaps: { questions: [q('P1', ['500 characters', '1000 characters']), q('P2', ['Roboto', 'Inter'])] } })
ok(x.res.stage === 'questions' && x.res.questions.map((y) => y.id).join() === 'P1,P2' && !x.calls.includes('report: PRD + theme'), 'every gap is asked before PRD.md is written')

const A3 = [...A2, { id: 'P1', question: 'p1?', answer: '500 characters', by: 'user' }, { id: 'P2', question: 'p2?', answer: 'Roboto', by: 'user' }]
x = await sim('6 · gaps answered; the report finds one more', { app: L, answers: A3 }, { source: { ...pulled, have: have({ store: 5, static: 80, walk: 12 }) }, ...fine, 'report: PRD + theme': { ready: false, screens: 0, features: 0, fields: 0, assumed: 0, notObserved: 0, check: '', questions: [q('P3', ['Daily', 'Weekly'])] } })
ok(!x.calls.includes('gaps') && x.res.stage === 'questions' && x.res.questions.map((y) => y.id).join() === 'P3', 'answered gaps are not asked again; a gap the report finds is asked too')

x = await sim('7 · the user chose no walk (unzipped APK only)', { app: L, answers: [{ id: 'apk', question: 'a?', answer: 'Go on without the walk', by: 'user' }, { id: 'name', question: 'n?', answer: 'Mendo', by: 'user' }] }, { source: { ...baseSrc, phone: '', phoneModel: '' }, ...fine })
ok(x.res.done && !x.calls.includes('audit: walk') && /check \. --apk --no-walk`/.test(x.prompts['report: PRD + theme']), 'no walk is run; the check is told the user chose none')

x = await sim('8 · CONTRACT.md here: no question, straight to the build', L, { source: { ...baseSrc, resume: 'build', have: have({ contract: true, dartFiles: 9 }) } })
ok(x.res.resumed === 'build' && !x.res.questions, 'finished work is continued without re-asking')
x = await sim('9 · PRD.md ready, no contract: straight to the contract', L, { source: { ...baseSrc, resume: 'prd', have: have({ store: 5, static: 80, walk: 12, prd: true, prdProblems: 0 }) } })
ok(x.res.resumed === 'prd' && /"noFigma":true/.test(x.res.nextStep), 'a finished PRD.md goes to build-app without a new audit')
x = await sim('10 · the walk agent returns nothing: asked, never skipped silently', { app: L, answers: A1 }, { source: pulled, ...fine, 'audit: walk': null })
ok(x.res.stage === 'questions' && /^walkfail-1$/.test(x.res.questions[0].id) && /no result from the walk/.test(x.res.questions[0].question) && !x.calls.includes('report: PRD + theme'), 'a dead walk is a question, not a PRD without a walk')
console.log(fails ? `\n${fails} FAIL` : '\nall ok')
if (fails) process.exitCode = 1
