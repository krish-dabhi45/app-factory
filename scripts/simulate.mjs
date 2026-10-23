// Runs workflows/build-app.js with fake agents (no Claude, no devices): checks which steps run, in what order and
// in parallel, for each scenario below. Run after every change to the workflow: node scripts/simulate.mjs
import fs from 'node:fs'
const src = fs.readFileSync(new URL('../workflows/build-app.js', import.meta.url), 'utf8').replace(/^export const meta = /m, 'const meta = ')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

const st = (b = 0, own = { logic: 0, ui: 0, shared: 0, unrouted: 0 }) => ({ blocking: b, blockingByOwner: own })
async function sim(name, args, over = {}) {
  const calls = [], logs = [], prompts = {}, running = new Set(), along = {} // along[label]: the agents already running when it started
  let inParallel = 0, maxPar = 0
  const def = (label) => {
    if (label === 'design import') return { status: 'none', prdScreens: 0, screens: 0, matchedScreens: 0, flows: 0, colors: 0, assets: 0, missing: 0, figmaCalls: 0, compression: '', note: '' }
    if (label === 'contract' || label.startsWith('setup')) return { claimed: true, projectDir: '/p/app', features: [{ id: 'AC1', title: 'a' }, { id: 'AC2', title: 'b' }], groups: [{ name: 'items', criteria: ['AC1'] }, { name: 'settings', criteria: ['AC2'] }], blocked: ['AC9'], assumed: [], questions: [{ id: 'Q1' }], simulatorId: 'SIM1', hasDesign: false }
    if (label.startsWith('integrate') || label.startsWith('gate')) return { buildOk: true, testsOk: true, testSummary: 'ok', filesChanged: [] }
    if (label === 'devices') return { ios: { standard: 'S1', small: 'S2', large: 'S3' }, android: { standard: 'af-standard' }, androidInScope: true, freeMemoryMB: 4000 }
    if (label === 'explore') return { screens: ['a'], flows: ['f'], notInContract: 0, missing: 0 }
    if (label.startsWith('test setup')) return { base: 'B', bundleId: 'x', shards: [['integration_test/a_test.dart'], ['integration_test/b_test.dart'], ['integration_test/c_test.dart']], name: '', runTests: true }
    if (label.includes('runner') || label.startsWith('test r')) return { testsRun: 5, passed: 5, failed: 0, testsFixed: [], filed: [], blocked: [], resolved: [], ...st() }
    if (label.startsWith('merge')) return { merged: [], rejected: [], ...st() }
    if (label.startsWith('fix')) return { fixed: [], pendingDevice: [], ...st() }
    if (label === 'senior QA setup') return { appPath: 'a', bundleId: 'x' }
    if (label.startsWith('senior QA')) return { scenarios: ['1'], filed: [], ...st() }
    if (label.startsWith('final audit')) return { verdict: 'pass', passing: [], fixed: [], removed: [], ...st() }
    if (label === 'final checks') return { designOk: true, assetsOk: true, secretsOk: true, releaseOk: true, output: 'ok' }
    if (label.startsWith('lessons')) return { timing: 'ended', cleanup: 'cleanup: freed 1 MB' }
    return null
  }
  const agent = async (prompt, opts = {}) => {
    const label = opts.label || '?'
    calls.push(label); prompts[label] = prompt; along[label] = [...running]; running.add(label)
    inParallel++; maxPar = Math.max(maxPar, inParallel)
    await new Promise((r) => setTimeout(r, 1))
    inParallel--; running.delete(label)
    const o = over[label]
    return typeof o === 'function' ? o(calls.filter((c) => c === label).length) : o !== undefined ? o : def(label)
  }
  const parallel = async (fns) => Promise.all(fns.map((f) => f()))
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', src)
  const res = await fn(args, agent, parallel, () => {}, (l) => logs.push(l))
  return { name, calls, logs, res, maxPar, prompts, along }
}
const show = (x) => console.log(`\n## ${x.name}\n${x.calls.join(' | ')}\n→ done=${x.res.done} gateRounds=${x.res.gateRounds} testRounds=${x.res.testRounds} seniorQa=${x.res.seniorQa} maxParallel=${x.maxPar}${x.res.questions ? ` questions=${x.res.questions.length}` : ''}`)
const bad = (x) => Object.entries(x.prompts).filter(([, p]) => /undefined|\[object Object\]|NaN|\$\{/.test(p)).map(([l]) => l)
const check = (cond, msg) => { if (!cond) { console.log(`   FAIL: ${msg}`); process.exitCode = 1 } else console.log(`   ok: ${msg}`) }

let x = await sim('no Figma link in the PRD → asked at once', {})
show(x); check(x.res.stage === 'figma' && x.calls.join() === 'design import' && /"figma":"<that link>"/.test(x.res.nextStep) && /"noFigma":true/.test(x.res.nextStep), 'stops after the link search and asks for the link, before any contract work')
check(/timing pause "asking for the Figma link"/.test(x.prompts['design import']), 'the wait for the answer is recorded as a pause')
x = await sim('contract stage, user chose no Figma', { noFigma: true })
show(x); check(x.res.questions?.length === 1 && x.calls.includes('contract'), 'continues to the contract and its questions')
const opt = [{ label: 'Yes (Recommended)', description: 'a' }, { label: 'No', description: 'b' }]
const qq = (id, ask) => ({ id, area: 'logic', header: id, question: `${id}?`, options: opt, affects: 'AC1', ask, why: 'w' })
x = await sim('contract stage: only the important questions are asked, with a 5-minute fallback', { noFigma: true }, { contract: { claimed: true, projectDir: '/p/app', features: [], groups: [], assumed: [], questions: [qq('Q1', true), qq('Q2', false), qq('Q3', true), qq('Q4', true), qq('Q5', true), qq('Q6', true)] } })
show(x)
check(/only the 4 question\(s\)[^—]*\(Q1, Q3, Q4, Q5\)/.test(x.res.nextStep) && /The other 2 question\(s\) use their recommended option/.test(x.res.nextStep), 'asks only questions marked ask, at most 4; the rest use the recommended option')
check(/run_in_background true and the command `sleep 300`/.test(x.res.nextStep) && /not with AskUserQuestion/.test(x.res.nextStep), 'asks in a chat message and starts a 5-minute background timer')
const toArgs = x.res.nextStep.match(/The timer ends first[^\n]*?with args (\{.*?\]\})/)
check(toArgs && JSON.parse(toArgs[1]).answers.map((a) => `${a.id}:${a.answer}:${a.by}`).join() === 'Q1:Yes (Recommended):timeout,Q3:Yes (Recommended):timeout,Q4:Yes (Recommended):timeout,Q5:Yes (Recommended):timeout', 'on timeout: valid build args with the recommended option for every asked question')
check(/decisions --questions <that file>/.test(x.prompts.contract) && !/write[^.]*\.pipeline\/questions/.test(x.prompts.contract), 'the contract step records every question for DECISIONS.md through the command, not by editing .pipeline/')
x = await sim('contract stage: no question needs the user', { noFigma: true }, { contract: { claimed: true, projectDir: '/p/app', features: [], groups: [], assumed: [], questions: [qq('Q1', false)] } })
check(/No question needs the user \(1 settled/.test(x.res.nextStep), 'nothing important → straight to the build')
x = await sim('build: answers are recorded in DECISIONS.md', { stage: 'build', answers: [{ id: 'Q1', answer: 'No', isDefault: false, by: 'user' }] })
check(/decisions --answers <that file>/.test(x.prompts['setup (approved contract)']), 'the build records the answers and rewrites DECISIONS.md through the command')
x = await sim('a key pasted as an answer never reaches an agent', { stage: 'build', answers: [{ id: 'Q2', answer: 'AIzaSyD-test0123456789abcdefghijklmnopq', isDefault: false, by: 'user' }] })
check(x.res.stage === 'secret' && x.calls.length === 0 && /secret set <NAME>/.test(x.res.nextStep) && !x.res.nextStep.includes('AIzaSyD'), 'stops before any agent; tells the chat to store it')
x = await sim('a key written in PRD.md is stored before any agent reads it', { noFigma: true })
check(/Before anything reads PRD\.md, run `[^`]*secret import`/.test(x.prompts['design import']) && /`[^`]*secret import`/.test(x.prompts.contract) && !/secret import PRD\.md|init PRD\.md/.test(Object.values(x.prompts).join(' ')) && /`[^`]*prd` prints its name/.test(x.prompts.contract) && /Provided keys/.test(x.prompts.contract) && x.calls.includes('contract'), 'the PRD (any *PRD*.md name) is imported first; no command names PRD.md')
x = await sim('text typed after the command is a note, not a stage', 'You are a senior app developer, no extra scope.')
check(x.res.stage !== undefined && !x.res.error && x.calls.includes('design import') && /The user's note for this run: "You are a senior app developer, no extra scope\."/.test(x.prompts['design import']) && /"note":"You are a senior app developer, no extra scope\."/.test(x.res.nextStep || ''), 'free text does not fail the launch; it reaches every agent and the build-stage args')
x = await sim('a bare stage word still works', 'build')
check(x.calls.includes('setup (approved contract)'), 'the word "build" is the build stage')
x = await sim('build: keys reach device tests only through the secrets file; a key in a file fails the run', { stage: 'build' }, { 'final checks': { designOk: true, assetsOk: true, secretsOk: false, releaseOk: true, output: 'SECRETS (1)' } })
check(/secret define\) -d S1/.test(x.prompts['test r1 iOS runner 1']) && /secret native/.test(x.prompts['test setup r1']) && /secret move\` then \`[^`]*secret scan/.test(x.prompts['integrate + gate']) && /secret move/.test(x.prompts['explore']), 'flow tests get --dart-define-from-file; worktrees get native keys; the gate scans')
check(x.res.done === false, 'a key found by the final scan → not done')
check(/iPhone SE \(3rd generation\)/.test(x.prompts.devices) && /iPhone 17 Pro Max/.test(x.prompts.devices) && /the iPhone SE \(375×667/.test(x.prompts['test r1 iOS runner 2']) && /iPhone 17 Pro Max \(440×956/.test(x.prompts['test r1 iOS runner 3']) && /cp "[^"]*templates\/flutter\/test\/ui\/fits_screen\.dart" test\/ui\/fits_screen\.dart/.test(x.prompts.interface) && ['senior QA setup', 'senior QA Android', 'explore', 'integrate + gate'].every((l) => /secret define\)/.test(x.prompts[l])), 'flow tests run on the smallest, a standard and the largest iPhone; the layout helper is shared')
x = await sim('build: the release check gates the build and the end; owner items are logged, never guessed', { stage: 'build' }, { 'final checks': { designOk: true, assetsOk: true, secretsOk: true, releaseOk: false, output: 'Fix in code (1)\n- C4 the app has a paywall\n\nOwner before store release (2)\n- O1 store IDs still com.example\n- O3 Google\'s sample AdMob App ID' } })
check(/scripts\/release-check\.mjs" \.\` \(its "Fix in code" list empty/.test(x.prompts['integrate + gate']) && /release-check\.mjs" \.\`/.test(x.prompts['final checks']), 'the gate and the final checks run release-check')
check(x.res.done === false, 'a release-check code item at the end → not done')
check(x.logs.some((l) => /before store release, the owner: O1 store IDs still com\.example \| O3 Google's sample AdMob App ID/.test(l)), 'the owner list is logged')
check(/--no-premium. when section 9 says "No paid tier"/.test(x.prompts.interface) && /PremiumStore\.instance\.configure with ApiKeys\.revenuecatAppleKey/.test(x.prompts.interface), 'the interface installs Premium unless the contract says no paid tier, and wires the store keys')
x = await sim('no iPhone SE: the runners still name their simulator by what it is', { stage: 'build' }, { devices: { ios: { standard: 'S1', small: '', large: 'S3' }, android: { standard: 'af-standard' }, androidInScope: true, freeMemoryMB: 4000 } })
check(/the iPhone 17 Pro Max \(440×956/.test(x.prompts['test r1 iOS runner 2']) && !/iPhone SE \(375/.test(x.prompts['test r1 iOS runner 2']) && /PRD\.md, CONTRACT\.md and DECISIONS\.md: read them in/.test(x.prompts['test r1 iOS runner 2']), 'runner 2 on S3 is called the iPhone 17 Pro Max; runners read PRD.md in the project')
// Linux and Windows: no iOS simulator, no Xcode — every device step on the Android emulator, no macOS-only command anywhere
for (const os of ['linux', 'win32']) {
  const setupNoMac = { claimed: true, projectDir: '/p/app', features: [{ id: 'AC1', title: 'a' }, { id: 'AC2', title: 'b' }], groups: [{ name: 'items', criteria: ['AC1'] }, { name: 'settings', criteria: ['AC2'] }], blocked: [], assumed: [], simulatorId: '', iosHost: false, hostOs: os, hasDesign: true }
  const devNoMac = { ios: { standard: '', small: '', large: '' }, android: { standard: 'af-standard' }, androidInScope: false, freeMemoryMB: 6000 }
  const qaOk = { scenarios: ['1', '2', '3', '4', '5'], filed: [], blocking: 0, blockingByOwner: { logic: 0, ui: 0, shared: 0, unrouted: 0 } }
  x = await sim(`build on ${os}`, { stage: 'build' }, { 'setup (approved contract)': setupNoMac, devices: devNoMac, 'test setup r1': { base: 'B', bundleId: 'x', shards: [], name: '', runTests: true }, 'senior QA Android': qaOk })
  const all = Object.entries(x.prompts).filter(([k]) => k !== 'setup (approved contract)').map(([, v]) => v).join('\n')
  check(!/xcrun|simctl|vm_stat|cp -Rc|df -g|swift "|open -a Simulator|flutter build ios|iphonesimulator/.test(all), `${os}: no iOS or macOS-only command in any agent prompt (found: ${(all.match(/xcrun|simctl|vm_stat|cp -Rc|df -g|swift "|open -a Simulator|flutter build ios|iphonesimulator/g) || []).slice(0, 5).join(', ') || 'none'})`)
  check(!x.calls.some((c) => /iOS runner|senior QA (setup|\d)/.test(c)) && x.calls.includes('test r1 Android runner') && x.calls.includes('senior QA Android'), `${os}: no iOS runner or iOS tester; the Android runner and the Android senior QA run`)
  check(/no iOS runner \(this computer has no iOS simulator\)/.test(x.prompts['test setup r1']) && /"[^"]*" pub get/.test(x.prompts['test setup r1']) && /cp -R "/.test(x.prompts['test setup r1']), `${os}: round setup makes only the Android snapshot, with pub get and a plain cp -R`)
  check(/Fresh install: `[^`]*uninstall <applicationId>/.test(x.prompts.explore) && /all ten scenarios of section 8/.test(x.prompts['senior QA Android']) && /read_screen/.test(x.prompts['senior QA Android']) && /read_screen/.test(x.prompts.explore) && /wait-app/.test(x.prompts.explore), `${os}: explore installs the APK on the emulator; Android senior QA runs every scenario`)
  check(/flutter build apk --debug [^`]*` \(no iOS build: this computer is not a Mac/.test(x.prompts['integrate + gate']) && /an Android emulator of the frame's size/.test(x.prompts['final audit + fix'] || x.prompts['final audit + fix + optimise'] || '') && /pipeline\.mjs" freemem/.test(x.prompts.devices), `${os}: the gate builds the APK only; the design check uses an Android emulator; memory from freemem`)
  check(os === 'win32' ? /avdmanager\.bat"/.test(x.prompts.devices) : /avdmanager" create avd/.test(x.prompts.devices), `${os}: avdmanager is called by its real file name`)
  check(x.res.iosHost === false && x.logs.some((l) => /iOS: not built or tested/.test(l)), `${os}: the result and the log say iOS was not built or tested`)
}
x = await sim('SwiftUI on Linux stops at once', { stage: 'build', stack: 'swiftui' }, { 'setup (approved contract)': { claimed: true, projectDir: '/p/app', features: [], groups: [], assumed: [], iosHost: false, hostOs: 'linux' } })
check(x.res.aborted && x.logs.some((l) => /SwiftUI stack needs macOS/.test(l)), 'SwiftUI without a Mac: stopped with the reason, locks released')
x = await sim('faster start: batching, slim contract result, generated design documents', { figma: 'https://www.figma.com/design/abc/x' }, { contract: { claimed: true, projectDir: '/p/app', features: [], groups: [], assumed: [], questionCount: 62, questions: [qq('Q3', true), qq('Q9', true)] } })
check(Object.entries(x.prompts).every(([, v]) => /Batch independent actions: reads, lookups/.test(v)), 'every agent prompt asks for independent actions in one turn')
check(/The other 60 question\(s\) use their recommended option/.test(x.res.nextStep) && /\(Q3, Q9\)/.test(x.res.nextStep) && /Return in "questions" ONLY the questions whose ask is true/.test(x.prompts.contract), 'the contract returns only the asked questions; the chat counts the rest from questionCount')
check(/design-docs\.mjs" slugs design/.test(x.prompts['design import']) && /design-docs\.mjs" build design/.test(x.prompts['design import']) && !/6\. Map everything, ONLY from the MCP responses/.test(x.prompts['design import']) && /assets\/<slug>-<the file name in the response>/.test(x.prompts['design import']), 'the import names files by slug and writes its documents with design-docs.mjs')
x = await sim('stuck runs and layout checks in the build', { stage: 'build' })
check(/stale "<the log>" --device S1 --platform ios --app x/.test(x.prompts['test r1 iOS runner 1']) && /device-reset <device> --platform android/.test(x.prompts['test r1 Android runner']) && /app-restart/.test(x.prompts['test r1 iOS runner 1']), 'every runner gets the check → app restart → device reset steps for its own device and app')
check(/-r expanded --no-pub[^`]*\| tee "<your scratchpad>\/flow-S1\.log"/.test(x.prompts['test r1 iOS runner 1']) && /set -o pipefail/.test(x.prompts['test r1 iOS runner 1']), 'device flow tests print a line per test into a log per device')
check(/layout-lint` \(sizes that cannot fit a 320×568 phone\)/.test(x.prompts['integrate + gate']), 'the gate runs the layout lint')
check(/freemem --need 2500/.test(x.prompts['test r1 Android runner']) && Object.values(x.prompts).every((v) => /Never run sudo, drop_caches, swapoff/.test(v)), 'the emulator starts only with enough memory; no agent frees memory any other way')
check(/test -j 4 -r failures-only/.test(x.prompts['logic: g1'] || Object.values(x.prompts).join('\n')) && !/" test -r failures-only/.test(Object.values(x.prompts).join('\n')), 'unit and widget tests run at most 4 test processes')
x = await sim('explore by the design route', { stage: 'build' }, { 'setup (approved contract)': { claimed: true, projectDir: '/p/app', features: [{ id: 'AC1', title: 'a' }], groups: [{ name: 'items', criteria: ['AC1'] }], blocked: [], assumed: [], simulatorId: 'SIM1', hasDesign: true } })
check(/read design\/ROUTE\.md .*follow ROUTE\.md screen by screen/.test(x.prompts.explore) && /Do not read PRD\.md whole/.test(x.prompts.explore), 'with a design, exploring follows ROUTE.md; the PRD is searched, not read whole')
x = await sim('explore without a design', { stage: 'build' })
check(/read CONTRACT\.md sections 1 \(Screens\) and 6 \(User flows\); visit the screens in the order/.test(x.prompts.explore) && !/ROUTE\.md/.test(x.prompts.explore.split('Read "')[0]), 'without a design, exploring follows the contract\'s screens and flows')
x = await sim('import writes the route', { figma: 'https://www.figma.com/design/abc/x' })
check(/ROUTE\.md \(the exploring plan/.test(x.prompts['design import']) && /"routeSkip"/.test(x.prompts['design import']), 'the design import builds ROUTE.md and lists mockup reactions to skip')
x = await sim('contract stage, link given', { figma: 'https://www.figma.com/design/abc/x' })
show(x); check(x.calls.includes('contract') && /"https:\/\/www\.figma\.com\/design\/abc\/x"/.test(x.prompts['design import']), 'imports the given link, then the contract')
check(/every app gets the team's ads \+ Remote Config pattern by default, whether or not PRD\.md mentions ads/.test(x.prompts.contract) && /"Not in scope" only when PRD\.md or the user's note says the app has no ads/.test(x.prompts.contract), 'ads + Remote Config are in every contract unless the PRD says no ads')
x = await sim('unattended (stage all) never asks', { stage: 'all' })
show(x); check(x.res.stage !== 'figma' && x.calls.includes('contract'), 'no question in an unattended run')

x = await sim('build: parallel, clean run', { stage: 'build' })
show(x)
check(x.calls.indexOf('interface') < x.calls.indexOf('logic: items'), 'interface before the groups')
check(/If CONTRACT\.md section 9 \(Ads\) lists placements, install the ads \+ Remote Config pattern only this way: `node "[^"]+\/scripts\/ads-install\.mjs"/.test(x.prompts.interface) && !/has an "Ads" section/.test(Object.values(x.prompts).join()), 'the interface step installs ads when section 9 lists placements (a "Not in scope" section 9 does not count)')
check(['logic: items', 'ui: items', 'tests: items'].every((l) => x.calls.includes(l)), 'logic ∥ UI ∥ tests per group')
check(x.calls.filter((c) => c.startsWith('test r1 iOS runner')).length === 3, '3 iOS runners (4000 MB free)')
check(x.calls.includes('test r1 Android runner'), 'Android runner')
check(!x.calls.some((c) => /audit r|re-check|verify|design check|test cases|APPMAP/i.test(c) && !c.startsWith('final')), 'no deep audit, re-check, verify or test-design step')
check(x.res.done === true && x.calls.includes('senior QA 3') && x.calls.includes('senior QA Android'), 'senior QA on 3 simulators + Android, done')
check(bad(x).length === 0, `no undefined/[object Object]/\${ in prompts${bad(x).length ? ': ' + bad(x).join(', ') : ''}`)
check(/--name '\\b\(AC/.test(x.prompts['final audit + fix + optimise']) || /affected <base>/.test(x.prompts['final audit + fix + optimise']), 'final audit re-runs only affected device tests')
check(/-x android/.test(x.prompts['test r1 iOS runner 1']) && /-x ios/.test(x.prompts['test r1 Android runner']), 'platform tags excluded per platform')
check(/-r failures-only --no-pub/.test(x.prompts['test r1 iOS runner 1']), 'failures-only reporter')
check(/DESIGN CHECK, forced/.test(x.prompts['final audit + fix + optimise']) && /design-check` passes/.test(x.prompts['final audit + fix + optimise']), 'final audit runs the forced design check and needs design-check to pass')
check(!/compare these designed screens/.test(x.prompts['test r1 iOS runner 1']), 'runners do not compare designs (done once, at the end)')

check(x.calls.indexOf('final checks') > x.calls.indexOf('final audit + fix + optimise') && /design-check/.test(x.prompts['final checks']) && /components/.test(x.prompts['final audit + fix + optimise']), 'a separate agent re-runs design-check and assets after the final audit; the audit does the component inventory')
x = await sim('final audit says pass but the design check fails → not done', { stage: 'build' }, { 'final checks': { designOk: false, assetsOk: true, output: 'design check: 1 of 3 screen(s) not done — premium: components 30/34, 4 UNCHECKED' } })
show(x); check(x.res.done === false, 'not done when the separate design check fails, whatever the auditor said')
x = await sim('low memory → 1 runner', { stage: 'build' }, { devices: { ios: { standard: 'S1', small: 'S2', large: 'S3' }, android: { standard: '' }, androidInScope: false, freeMemoryMB: 1200 } })
show(x); check(x.calls.filter((c) => c.startsWith('test r1 iOS runner')).length === 1 && !x.calls.includes('test r1 Android runner'), '1 runner, no Android when not in scope')

x = await sim('gate fails 3 times → no testing', { stage: 'build' }, { 'integrate + gate': { buildOk: false, testsOk: false, testSummary: 'x', filesChanged: [] }, 'gate r2': { buildOk: false, testsOk: false, testSummary: 'x', filesChanged: [] }, 'gate r3': { buildOk: false, testsOk: false, testSummary: 'x', filesChanged: [] } })
show(x); check(!x.calls.some((c) => c.startsWith('test r')) && x.res.done === false, 'stops before testing, not done')

const found = st(2, { logic: 1, ui: 0, shared: 0, unrouted: 1 })
x = await sim('round 1 finds bugs → fixers → round 2 affected only', { stage: 'build' }, {
  'merge r1': (n) => (n === 1 ? { merged: [], rejected: [], ...found } : { merged: [], rejected: [], ...st(1) }),
  'merge r2': { merged: [], rejected: [], ...st() },
  'test setup r2': { base: 'B2', bundleId: 'x', shards: [['a'], ['b'], ['c']], name: '\\b(AC1)\\b', runTests: true },
  'fix r1 logic': { fixed: ['X1'], pendingDevice: ['X2'], ...st(1) },
  'fix r1 shared': { fixed: [], pendingDevice: [], ...st(1) },
})
show(x)
check(x.calls.includes('fix r1 logic') && x.calls.includes('fix r1 shared') && !x.calls.includes('fix r1 ui'), 'only the owners with findings fix')
check(x.calls.filter((c) => c === 'fix r1 logic').length === 1, 'a pending fix is not fixed twice')
check(/--name '\\b\(AC1\)\\b'/.test(x.prompts['test r2 iOS runner 1']), 'round 2 runs only the affected tests')
check(x.res.testRounds === 2 && x.res.done === true, 'clean after round 2')
check(/affected --platform ios`/.test(x.prompts['test setup r2']) && /affected --platform android`/.test(x.prompts['test setup r2']), 'round 2 asks affected once per platform, since each one\'s last run')
check(/LAUNCH CHECK FIRST/.test(x.prompts['test r1 Android runner']) && !/LAUNCH CHECK/.test(x.prompts['test r1 iOS runner 1']), 'the Android runner starts with a launch check')
check(/app-factory: fix logic <X ids>/.test(x.prompts['fix r1 logic']), 'fixers name the findings they fixed in the commit')
const two = (setup) => sim('round 2 per platform', { stage: 'build' }, {
  'merge r1': (n) => (n === 1 ? { merged: [], rejected: [], ...found } : { merged: [], rejected: [], ...st(1) }),
  'merge r2': { merged: [], rejected: [], ...st() },
  'test setup r2': { base: 'B2', bundleId: 'x', shards: [['a'], ['b'], ['c']], runTests: true, ...setup },
  'fix r1 logic': { fixed: ['X1'], pendingDevice: ['X2'], ...st(1) }, 'fix r1 shared': { fixed: [], pendingDevice: [], ...st(1) },
})
x = await two({ name: '', androidName: '\\b(AC7)\\b', runIos: false, runAndroid: true })
check(!x.calls.some((c) => /^test r2 iOS/.test(c)) && /--name '\\b\(AC7\)\\b'/.test(x.prompts['test r2 Android runner']), 'nothing to re-run on iOS: no iOS runner; Android runs its own list')
x = await two({ name: '\\b(AC1)\\b', androidName: '', runIos: true, runAndroid: false })
check(x.calls.includes('test r2 iOS runner 1') && !x.calls.includes('test r2 Android runner'), 'nothing to re-run on Android: no Android runner that round')

x = await sim('nothing changed but blockers remain → stop, not done', { stage: 'build' }, {
  'merge r1': { merged: [], rejected: [], ...st(1, { logic: 1, ui: 0, shared: 0, unrouted: 0 }) },
  'fix r1 logic': { fixed: [], pendingDevice: [], ...st(1, { logic: 1, ui: 0, shared: 0, unrouted: 0 }) },
  'test setup r2': { base: 'B2', bundleId: 'x', shards: [], name: '', runTests: false },
})
show(x); check(!x.calls.includes('test r2 iOS runner 1') && !x.calls.some((c) => c.startsWith('senior')) && x.res.done === false, 'no pointless round, no senior QA, not done')

x = await sim('senior QA files a bug → fix → affected round → final', { stage: 'build' }, {
  'senior QA 2': { scenarios: ['4', '5'], filed: ['X9'], ...st(1, { logic: 0, ui: 1, shared: 0, unrouted: 0 }) },
  'senior QA Android': { scenarios: ['1', '5'], filed: [], ...st(1, { logic: 0, ui: 1, shared: 0, unrouted: 0 }) },
  'test setup r2': { base: 'B2', bundleId: 'x', shards: [['a']], name: '\\b(AC2)\\b', runTests: true },
})
show(x); check(x.calls.includes('fix r1 ui') && x.calls.filter((c) => c === 'senior QA 1').length === 1 && x.res.done === true, 'senior QA once, its fix re-tested, done')

x = await sim('swiftui stack', { stage: 'build', stack: 'swiftui' })
show(x); check(!x.calls.includes('interface') && x.calls.includes('build: items') && x.calls.includes('test r1 iOS') && x.res.done === true, 'serial build, one runner, done')
check(bad(x).length === 0, `swiftui prompts clean${bad(x).length ? ': ' + bad(x).join(', ') : ''}`)

x = await sim('parallel:false (flutter)', { stage: 'build', parallel: false })
show(x); check(!x.calls.includes('interface') && x.calls.includes('build: items') && x.calls.includes('gate'), 'one builder per group, then the gate')

// ── Real phones: whichever is connected runs its platform's device tests beside the simulators ──
const PHONES = { ios: { standard: 'S1', small: 'S2', large: 'S3' }, android: { standard: 'af-standard' }, androidInScope: true, freeMemoryMB: 4000, phones: { android: 'ZD1', androidModel: 'moto_e22s', ios: 'IP1', iosName: 'iPhone 11' } }
x = await sim('an iPhone and an Android phone connected', { stage: 'build' }, { devices: PHONES, 'test setup r1': { base: 'B', bundleId: 'x', shards: [['integration_test/a_test.dart'], ['integration_test/b_test.dart']], name: '', runTests: true } })
show(x)
check(/devices real/.test(x.prompts.devices) && /phone save <that serial>/.test(x.prompts.devices), 'the devices step finds the connected phones and saves the Android phone\'s settings')
check(x.logs.some((l) => /iOS runners: the iPhone iPhone 11 \+ 1 simulator\(s\).*5400 MB kept for the phone build/.test(l)), 'memory: the simulators leave room for both phone builds (4000 MB free → 1 simulator)')
check(x.calls.includes('test r1 iOS runner 1 (iPhone)') && x.calls.includes('test r1 iOS runner 2') && x.calls.includes('test r1 Android runner (phone)') && !x.calls.includes('test r1 Android runner'), 'round 1: the iPhone, one simulator and the Android phone — no emulator')
check(['test r1 iOS runner 1 (iPhone)', 'test r1 iOS runner 2'].every((l) => x.along['test r1 Android runner (phone)'].includes(l)), 'the Android phone runs AT THE SAME TIME as the iPhone and the simulator')
check(/-d IP1 /.test(x.prompts['test r1 iOS runner 1 (iPhone)']) && /real iPhone iPhone 11 \(udid IP1\)/.test(x.prompts['test r1 iOS runner 1 (iPhone)']) && /-d S1 /.test(x.prompts['test r1 iOS runner 2']), 'each iOS runner on its own device; the iPhone is never booted or reset')
check(/-d ZD1 /.test(x.prompts['test r1 Android runner (phone)']) && /never start, stop, reset or wipe it/.test(x.prompts['test r1 Android runner (phone)']) && /gradlew --stop/.test(x.prompts['test r1 Android runner (phone)']), 'the Android phone runner: its serial, hands off the phone, Gradle stopped after')
check(/qa-r1-android/.test(x.prompts['merge r1']) && x.calls.filter((c) => c === 'merge r1').length === 1 && /3b\. The Android runner's snapshot/.test(x.prompts['test setup r1']), 'one merge of the iOS and Android branches; the Android worktree made in setup')
check(x.calls.includes('senior QA Android (phone)') && x.along['senior QA Android (phone)'].includes('senior QA 1') && /build apk --debug/.test(x.prompts['senior QA setup']) && /gradlew --stop/.test(x.prompts['senior QA setup']), 'senior QA on the Android phone at the same time as the iOS testers, on an APK built once')
check(x.res.done === true && bad(x).length === 0, `done, prompts clean${bad(x).length ? ': ' + bad(x).join(', ') : ''}`)

x = await sim('both phones unusable (locked) → simulator and emulator take over', { stage: 'build' }, { devices: PHONES,
  'test setup r1': { base: 'B', bundleId: 'x', shards: [['integration_test/a_test.dart'], ['integration_test/b_test.dart']], name: '', runTests: true },
  'test r1 iOS runner 1 (iPhone)': { testsRun: 0, passed: 0, failed: 0, testsFixed: [], filed: [], blocked: [], resolved: [], ...st() },
  'test r1 Android runner (phone)': { testsRun: 0, passed: 0, failed: 0, testsFixed: [], filed: [], blocked: [], resolved: [], ...st() },
  'senior QA Android (phone)': { scenarios: [], filed: [], ...st() } })
show(x)
check(x.calls.includes('test r1 iOS runner 1 (iPhone fallback)') && /-d S1 /.test(x.prompts['test r1 iOS runner 1 (iPhone fallback)']) && /integration_test\/a_test\.dart/.test(x.prompts['test r1 iOS runner 1 (iPhone fallback)']), "the iPhone's share runs on the iPhone 17 simulator")
check(x.calls.includes('test r1 Android runner') && /Android emulator af-standard/.test(x.prompts['test r1 Android runner']) && x.calls.indexOf('test r1 Android runner') > x.calls.indexOf('merge r1'), 'the emulator runs the Android tests after the iOS merge')
check(x.calls.includes('senior QA Android') && x.calls.indexOf('senior QA Android') > x.calls.indexOf('senior QA Android (phone)'), 'the Android senior QA moves to the emulator')
check(x.res.done === true && bad(x).length === 0, 'done, prompts clean')

x = await sim('no phone connected: as before', { stage: 'build' })
check(!x.calls.some((c) => /\((iPhone|phone)\)/.test(c)) && x.calls.includes('test r1 Android runner') && !x.along['test r1 Android runner'].some((l) => /iOS runner/.test(l)), 'without phones: simulators, then the emulator after them — unchanged')

