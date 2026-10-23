export const meta = {
  name: 'build-app',
  description: 'PRD → contract (questions; a missing key → a verified free service for now, or "not available") → parallel build per group (logic ∥ UI ∥ flow tests) → integrator + script gate → explore → flow tests on parallel iOS simulators, Android alongside the fixers → senior QA in parallel → one final audit that fixes, with optimisation',
  whenToUse: 'Build a new app (Flutter, iOS + Android) from PRD.md in the current project. Run it with no args first: it imports the Figma design, audits the PRD and design, and returns "questions" plus "nextStep". Then do exactly what nextStep says: ask the user only the most important questions (those marked "ask", at most 4) in one chat message, wait up to 5 minutes for a reply (a background sleep 300 timer), and run this workflow again in the same chat with {"stage":"build","answers":[…]} — the answers given, or the recommended options when the timer ends first. Every question and the option selected is listed in DECISIONS.md. Nothing is asked after that. If PRD.md has no Figma link, the first call returns one question asking for it (nextStep says how to continue: "figma":"<link>" or "noFigma":true). Optional: "parallel":false (one builder per group instead of logic ∥ UI ∥ tests), "figma":"<figma.com/design URL>", "noFigma":true, "refreshDesign":true, "stack":"swiftui" (native iOS only), "maxRounds":3, "maxTestRounds":3.',
  phases: [
    { title: 'Design import', detail: 'the whole Figma design imported once into design/, images compressed — later agents never call Figma' },
    { title: 'Contract', detail: 'PRD (+ design) → CONTRACT.md with its Decisions; a missing key → a free no-key service (searched and called once to prove it) for now, or a "not available" message; the switch to the real key needs no code change' },
    { title: 'Build', detail: 'interface in Dart → per group: logic builder ∥ UI builder ∥ flow-test writer → integrator → script gate (no audit)' },
    { title: 'Explore', detail: 'every screen and flow visited once; what is missing or extra becomes a finding' },
    { title: 'Test', detail: 'flow tests on up to 3 iOS simulators at once (own worktree each) → Android runner while the fixers fix → later rounds re-run only affected tests' },
    { title: 'Senior QA', detail: 'real-user journeys split across the iOS simulators, then Android' },
    { title: 'Final', detail: 'one final audit that fixes (weak tests, code rules, anything missing), optimisation, run report, cleanup' },
  ],
}

const obj = (required, properties) => ({ type: 'object', required, properties })
const str = { type: 'string' }
const int = { type: 'integer' }
const bool = { type: 'boolean' }
const strs = { type: 'array', items: str }
const BUILD = obj(['buildOk', 'testsOk', 'testSummary', 'filesChanged'], { buildOk: bool, testsOk: bool, testSummary: str, appPath: str, filesChanged: strs })
const DESIGN_IMPORT = obj(['status', 'prdScreens', 'screens', 'matchedScreens', 'flows', 'colors', 'assets', 'missing', 'figmaCalls', 'compression', 'note'], {
  status: { type: 'string', enum: ['imported', 'reused', 'none', 'failed'] },
  prdScreens: int,
  screens: int,
  matchedScreens: int,
  flows: int,
  colors: int,
  assets: int,
  missing: int,
  figmaCalls: int,
  compression: str,
  note: str,
})
const GROUP = obj(['name', 'criteria'], { name: str, criteria: strs })
// Questions come back to the chat that started the run. It asks only those marked "ask" (the most important, at most 4)
// in one chat message, waits 5 minutes for a reply, then continues with the recommended options. Every question, asked
// or not, is listed with its options and the selected one in DECISIONS.md (pipeline.mjs decisions).
const QUESTION = obj(['id', 'area', 'header', 'question', 'options', 'affects', 'ask', 'why'], {
  id: str,
  area: str,
  header: { type: 'string', maxLength: 12 },
  question: str,
  options: { type: 'array', minItems: 2, maxItems: 4, items: obj(['label', 'description'], { label: str, description: str }) },
  affects: str,
  ask: bool,
  why: str,
})
const CONTRACT = obj(['claimed', 'projectDir', 'features', 'groups', 'assumed'], {
  claimed: bool,
  questions: { type: 'array', items: QUESTION },
  questionCount: int,
  designScreensRead: int,
  hasDesign: bool,
  existingContract: bool,
  simulatorId: str,
  iosHost: bool,
  hostOs: str,
  projectDir: str,
  features: { type: 'array', items: obj(['id', 'title'], { id: str, title: str }) },
  groups: { type: 'array', items: GROUP },
  blocked: strs,
  assumed: strs,
})
const EXPLORE = obj(['screens', 'flows', 'notInContract', 'missing'], { screens: strs, flows: strs, notInContract: int, missing: int })
// iOS: the iPhone 17, and the smallest and largest iPhones the installed runtime runs (build skill U15); Android: one phone.
const DEVICES = obj(['ios', 'android', 'androidInScope', 'freeMemoryMB', 'phones'], { ios: obj(['standard', 'small', 'large'], { standard: str, small: str, large: str }), android: obj(['standard'], { standard: str }), androidInScope: bool, freeMemoryMB: int,
  phones: obj(['android', 'ios'], { android: str, androidModel: str, ios: str, iosName: str }) })
// Finding counts come back from an agent that runs anyway (runner, merge, fixer, senior QA, final audit) — no agent exists only to count.
const STATUS = {
  blocking: int,
  blockingByOwner: obj(['logic', 'ui', 'shared', 'unrouted'], { logic: int, ui: int, shared: int, unrouted: int }),
}
const withStatus = (schema) => ({ ...schema, required: [...schema.required, 'blocking', 'blockingByOwner'], properties: { ...schema.properties, ...STATUS } })
const ROUND_SETUP = obj(['base', 'bundleId', 'shards', 'name', 'runTests'], { base: str, bundleId: str, shards: { type: 'array', items: strs }, name: str, androidName: str, runIos: bool, runAndroid: bool, runTests: bool })
const RUNNER = withStatus(obj(['testsRun', 'passed', 'failed', 'testsFixed', 'filed', 'blocked', 'resolved'], {
  testsRun: int, passed: int, failed: int, testsFixed: strs, filed: strs, blocked: strs, resolved: strs, designScreensCompared: int,
}))
const MERGE = withStatus(obj(['merged', 'rejected'], { merged: strs, rejected: strs }))
const FIXES = withStatus(obj(['fixed', 'pendingDevice'], { fixed: strs, pendingDevice: strs }))
const QA_RESULT = withStatus(obj(['scenarios', 'filed'], { scenarios: strs, filed: strs }))
const QA_SETUP = obj(['appPath', 'bundleId'], { appPath: str, bundleId: str })
const FINAL = withStatus(obj(['verdict', 'passing', 'fixed', 'removed'], {
  verdict: { type: 'string', enum: ['pass', 'fail'] }, passing: strs, fixed: strs, removed: strs,
  sizeBefore: str, sizeAfter: str, linesBefore: int, linesAfter: int, packagesRemoved: strs, stepsReverted: strs,
}))

// args may arrive as an object, a JSON string, or a bare stage word ("build") — accept all three.
// Text typed after the command that is neither JSON nor a stage word is the user's note for this run (v4's first launch
// failed on "You are a senior app developer, …" read as a stage name).
const ARGS = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { const t = args.trim(); return ['contract', 'build', 'all'].includes(t) ? { stage: t } : t ? { note: t } : {} } })()
  : (args || {})
// ponytail: a workflow script cannot ask where its plugin lives, so the folder is a default here — if the plugin folder moves, change ROOT (or pass args.root).
const ROOT = ARGS.root || '/Users/mach/testing/app-factory'
const PIPE = `${ROOT}/scripts/pipeline.mjs`
const SKILL = `${ROOT}/skills/flutter-app/SKILL.md`
const QA = `${ROOT}/skills/app-qa/SKILL.md`
const ADS = `${ROOT}/skills/flutter-ads/SKILL.md`
const MAX_ROUNDS = ARGS.maxRounds || 3
const MAX_TEST_ROUNDS = ARGS.maxTestRounds || 3
// Parallel development is the default: logic builder ∥ UI builder ∥ flow-test writer per group. "parallel":false → one builder.
const PARALLEL = ARGS.parallel !== false
// stage 'contract' (the default) = write CONTRACT.md and stop for human approval;
// 'build' = CONTRACT.md is approved, build from it; 'all' = both without stopping (unattended pilots only).
const STAGE = ARGS.stage || 'contract'
// The user's answers, passed in by the chat after it asked the questions: [{id, question, answer, isDefault, by: "user"|"timeout"}].
const ANSWERS = Array.isArray(ARGS.answers) ? ARGS.answers : []
// A key value must never reach an agent's prompt: an answer that looks like one stops the run before any agent starts.
// ponytail: format heuristic (known key prefixes, or one ≥ 30-character token of letters and digits); stored keys are exact-matched later by `secret scan`.
const KEYLIKE = /AIza[0-9A-Za-z_-]{35}|\bsk-[A-Za-z0-9_-]{20,}|\b[sr]k_live_|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}|\bxox[abpr]-|\b[ps]k\.eyJ|(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])\b[A-Za-z0-9_-]{30,}\b/
const KEY_ANSWERS = ANSWERS.filter((x) => KEYLIKE.test(String(x && x.answer)))
if (!['contract', 'build', 'all'].includes(STAGE)) throw new Error(`unknown stage "${STAGE}" — use contract, build or all`)
log(`stage: ${STAGE}${ARGS.stage ? '' : ' (default — no stage given)'}`)
// stack 'flutter' (default: iOS + Android) | 'swiftui' (native iOS only).
const STACK_NAME = ARGS.stack || 'flutter'
const FLUTTER = ARGS.flutter || '/Users/mach/Flutter Workspace/flutter/bin/flutter'
// Android: the SDK, the Java that Flutter uses (avdmanager needs it; none is on PATH here), and the one installed system image.
const ANDROID_SDK = ARGS.androidSdk || '/Users/mach/Library/Android/sdk'
const JAVA_HOME = ARGS.javaHome || '/opt/homebrew/opt/openjdk@17'
const ANDROID_IMAGE = ARGS.androidImage || 'system-images;android-35;google_apis_playstore;arm64-v8a'
const ADB = `"${ANDROID_SDK}/platform-tools/adb"`
// Files a build may rewrite by itself (CocoaPods, generated Xcode settings) — never a scope violation.
// ponytail: listed by hand from what flutter build changes on iOS; extend if a build touches another generated file.
const BUILD_NOISE = ['ios/Podfile.lock', 'ios/Runner.xcodeproj/project.pbxproj', 'ios/Runner.xcworkspace/**', 'ios/Flutter/**', '.metadata', 'android/local.properties']
const FT = `"${FLUTTER}" test`
// unit and widget tests: at most 4 test processes per command — without -j it starts one per two CPU cores (package:test
// defaultConcurrency), and up to three agents test at once; 4 is the default on this 8-core Mac, so nothing changes here
const UT = `${FT} -j 4`
// Every build that runs the app passes the stored keys (scripts/secrets.mjs); empty when none are stored. Run in the
// project or one of its worktrees — the secrets file is found from the directory.
const DEFINE = `$(node "${PIPE}" secret define)`
const STACK = {
  swiftui: {
    make: `- iOS SwiftUI app generated with XcodeGen (project.yml), using the platform version, app name and bundle id given in PRD.md.
- All calculation logic in a pure type, with XCTest unit tests named after each acceptance criterion (testAC12_...), and XCUITest flow tests named "testAC12_…".`,
    full: `- Run \`xcodegen generate\`, then \`xcodebuild build\` and \`xcodebuild test -skip-testing:<UI test target>\` using ONLY the simulator id shown in the brief (-destination 'id=<udid>').`,
    quick: `- Run \`xcodegen generate\` and \`xcodebuild test -skip-testing:<UI test target>\` using ONLY the simulator id shown in the brief; both must succeed for buildOk and testsOk.`,
    flow: (files, udid, name, platform) => `\`xcodebuild test -destination 'id=${udid}' -only-testing:<UI test target>\`${name ? ' limited with -only-testing to the tests named after the criteria in the filter' : ''}`,
    check: '`xcodebuild build`',
    install: 'Build for it if needed, install the .app (`xcrun simctl install <udid> <path>`), and launch it using the bundle id from PRD.md.',
    skills: { all: '', logic: '', ui: '', tests: '', audit: '' },
    parallelBuild: false, // two xcodebuild runs and xcodegen in one project collide on the project file and build database
    owners: '`@logic` (model and logic Swift files), `@ui` (SwiftUI view files), `@shared` (project.yml, the app entry point, UI tests)',
    own: null, // no folder convention → one runner, findings only; one fixer fixes
  },
  flutter: {
    make: `- Flutter app for iOS and Android. The Flutter binary is "${FLUTTER}" (quote the path — it contains a space). If pubspec.yaml is absent, run \`flutter create --platforms ios,android --project-name <snake_case name> --org <org> .\` in the project directory; take the app name and bundle id from PRD.md or CONTRACT.md, or choose them and say so in your handoff.
- Structure, logic, UI and test rules are in the flutter-app skill file named in this prompt.`,
    full: `- Run \`flutter analyze\` (no issues), \`${UT} -r failures-only --no-pub\` (unit and widget tests), \`flutter build ios --simulator --debug ${DEFINE}\` and, when CONTRACT.md includes Android, \`flutter build apk --debug ${DEFINE}\`; then \`${'${P}'} coverage\`, \`${'${P}'} deps\`, \`${'${P}'} colors\`, \`${'${P}'} layout-lint\` (sizes that cannot fit a 320×568 phone), \`${'${P}'} assets\` (app icon and image variants), \`${'${P}'} secret move\` then \`${'${P}'} secret scan\` (every key found moved to its proper place; none left in any file), \`node "${ROOT}/scripts/release-check.mjs" .\` (its "Fix in code" list empty — undeclared packages, unused permissions, restore outside its tap, a paywall without Restore / Terms / Privacy; its "Owner" list is for the owner, never fixed by guessing IDs or keys) and \`${'${P}'} stray\`. All must succeed for buildOk and testsOk. Device flow tests are NOT run here — the test runners run them.`,
    quick: `- Run \`flutter analyze <your folders>\` (no issues) and \`${UT} <your test folders> -r failures-only --no-pub\`; both must succeed for buildOk and testsOk. Do NOT run device tests or the iOS and Android builds now.`,
    // -r expanded: a line as each test starts and ends, so a stuck run shows (pipeline.mjs stale); tee keeps it in a log per device
    flow: (files, udid, name, platform) => `\`set -o pipefail; ${FT} ${files} ${DEFINE} -d ${udid} -x ${platform === 'ios' ? 'android' : 'ios'} -r expanded --no-pub${name ? ` --name '${name}'` : ''} 2>&1 | tee "<your scratchpad>/flow-${String(udid).replace(/[^\w-]/g, '_')}.log"\``,
    check: '`flutter analyze`',
    install: `Build with \`"${FLUTTER}" build ios --simulator --debug ${DEFINE}\`, install build/ios/iphonesimulator/Runner.app (\`xcrun simctl install <udid> <path>\`), and launch it using the bundle id in ios/Runner.xcodeproj/project.pbxproj (PRODUCT_BUNDLE_IDENTIFIER).`,
    parallelBuild: true,
    owners: '`@logic` (lib/domain, lib/data), `@ui` (lib/ui), `@shared` (lib/main.dart, pubspec.yaml, integration_test/, ios/, android/, assets/, lib/google_ads_material/)',
    own: {
      logic: ['lib/domain/**', 'lib/data/**', 'test/domain/**', 'test/data/**'],
      ui: ['lib/ui/**', 'test/ui/**'],
      tests: ['integration_test/**', 'dart_test.yaml'],
      shared: ['lib/main.dart', 'pubspec.yaml', 'pubspec.lock', 'analysis_options.yaml', 'integration_test/**', 'dart_test.yaml', 'ios/**', 'android/**', 'assets/**', 'l10n.yaml', 'lib/google_ads_material/**', 'test/google_ads_material/**'],
    },
  },
}[STACK_NAME]
if (!STACK) throw new Error(`unknown stack "${ARGS.stack}" — use swiftui or flutter`)
if (STACK_NAME === 'flutter') {
  const ads = ` If CONTRACT.md section 9 (Ads) lists placements, also read "${ADS}" in full: its sections 2–6 are requirements too; lib/google_ads_material/ is installed by scripts/ads-install.mjs and only its API is used (its section 7).`
  STACK.skills = {
    all: `Before writing any code, read "${SKILL}" in full. Every numbered rule in it is a requirement.${ads}`,
    logic: `Before writing any code, read "${SKILL}" in full. Sections 1, 2 and 4 (T1) are your requirements.${ads}`,
    ui: `Before writing any code, read "${SKILL}" in full. Sections 1, 3 and 4 (T2, T3, T7) are your requirements.${ads}`,
    tests: `Before writing any test, read "${SKILL}" sections 1 and 4 and "${QA}" section 3 (how flow tests are written) in full.`,
    audit: `Check the code against every rule in "${SKILL}" (S1–S5, L1–L13, U0–U15, T1–T8) and fix what breaks one: a layout copied from the frame instead of adapted (U15) — a top offset or a frame-sized box from the design, a size multiplied by the screen width or height or a screenutil/sizer package, a stretched image, text in a fixed-height box or truncated where the design shows it whole, a body that does not scroll on the smallest phone, the Figma status bar or home indicator built as widgets — or a screen without its T3 layout test on every size; a paid or rate-limited API called more than CONTRACT.md's "API calls" table allows — a second call for data the first could return, a missing or wildcard field mask, no cache, a call from build(), typed input without debounce or session token, retries on 4xx — or a row without its call-budget test (L13, T8); a key value in any file, test or fixture (L12 — the secret scan in the final checks fails on it); a feature with a missing key that does not follow its "Missing keys" line — no lib/config/api_keys.dart switch, another substitute, no note or "not available" message, a crash or blank instead, or a key written in the code (L12); an app icon not made by app-icon.mjs from the contract's icon, or an icon set that fails \`assets\` (U13); a provided image or icon not used, replaced by a lookalike or a Material icon, drawn without its stated width and height, or loaded as an @2x/@3x file by name (U14); with a design, any colour, asset, font or navigation not from design/ (U0 — \`colors\`), content under the system bars (U10), a field without its placeholder (U11), motion that breaks U12 (a literal Duration in lib/ui/, anything the app adds over 400 ms, a PageRouteBuilder no FLOWS.md transition calls for, a bare GestureDetector on a tappable element, a busy button that stays enabled, an animation package without a source, an AnimationController not disposed), a designed screen without its asset-placement test (T7), an unjustified package (L11), imports that break S2, a rule living in a widget or view model or never called from its screen (L1), double used for money (L2), a field without a validator and edge tests (L8), code no criterion asked for (L9), a screen without its layout tests (T3), a user flow without its flow test (T4). If CONTRACT.md section 9 (Ads) lists placements, also check "${ADS}" sections 2–7: lib/google_ads_material/ identical to the plugin's templates/flutter/ads/lib/google_ads_material/ apart from the new keys, slots and flags its section 2 allows (judged by that skill, not by S3/L11 or \`colors\`); every placement in the Ads table wired at its screen with the template's API and nothing else; every placement's keys in assets/remote_config_default.json; the wiring order of section 3 (Remote Config, Facebook, store check with AdFlags.isPremium + AdsId.disableAllAds, SplashAds.run, SplashAds.afterSplash, AppResumeAdListener.enabled at home); skipNextResume before share, review, store page, purchase and restore; block/unblock on every Premium screen; test/google_ads_material/ present and passing.`,
  }
}
const PAR_BUILD = PARALLEL && STACK.parallelBuild
if (!PARALLEL) log('parallel build off ("parallel":false) — one builder per group')
else if (!STACK.parallelBuild) log('parallel build is not available for this stack — one builder is used')

const GIT_COMMIT = 'git add -A && git -c user.name=app-factory -c user.email=app-factory@localhost commit -q --allow-empty -m'
// Several agents commit in one repository at the same time: each commits only its own paths, and retries while
// another agent holds git's index lock. The message names the group, which is how `pipeline.mjs affected` maps files to criteria.
// Only paths that exist are passed (git fails on a missing pathspec), as positional arguments (zsh does not split a $var).
const COMMIT_OWN = (paths, msg) => `set --; for p in ${paths}; do [ -e "$p" ] && set -- "$@" "$p"; done; [ $# -eq 0 ] || for i in 1 2 3 4 5 6; do git add -A -- "$@" && git -c user.name=app-factory -c user.email=app-factory@localhost commit -q --allow-empty -m "${msg}" -- "$@" && break; sleep 2; done`
const SEVERITY = `Severity: critical = crash, data loss, or wrong data/calculation; major = a user-visible break of a cited source (a criterion, field-table row, PRD line or numbered skill rule — e.g. text that differs from the contract, overlapping or clipped UI, a broken flow); minor = invisible to the user, or a NOT IN CONTRACT / PROPOSAL / DECIDED note. A finding with no source is a minor PROPOSAL: never blocking, never fixed in this run.`
const ROUTE = `Give every finding an owner, chosen by where the CAUSE is (read the code first): ${STACK.owners} — written right after the severity: \`finding add <ACn> <severity> @<owner> "<text>"\`.`
const where = (dir, p) => `Project directory: ${dir} — run every command there. Wherever this prompt says PRD.md it means the project's PRD file: \`${p} prd\` prints its name (PRD.md, or the one *PRD*.md file in the project folder) — quote that name in commands.${ARGS.note ? ` The user's note for this run: ${JSON.stringify(String(ARGS.note))} — follow it wherever it does not contradict the PRD or CONTRACT.md.` : ''} The .pipeline/ state is written ONLY through \`${p} <command>\`; never edit .pipeline/ files by hand.
The user is watching .pipeline/PROGRESS.md live. Report as you go with \`${p} log <your phase> "<what you are doing or what just happened>"\`: once when you start, before every build or test run, and after each result (e.g. "unit tests: 26 passed, 0 failed"). Keep each line short and factual.
Never call a Figma tool (mcp__figma__*): if design/ exists it already holds the whole design, imported through the Figma MCP — FLOWS.md (every navigation), COLORS.md and colors.json (every colour), ASSETS.md (every image and icon → its file in assets/), FONTS.md, tokens.json, pages/<page>.metadata.xml (every layer's position and size), screens/<slug>.context.md (Figma's design data and reference code). Build only from those files; never invent a colour, asset, font or navigation. reference/<slug>.png are screenshots kept ONLY for the runners' design comparison — never read layout, sizes, colours or text from a screenshot.
Never ask the user a question during this run — every question was settled in the chat before it started, and each one's selected option is in DECISIONS.md. If something is still unclear, choose the behaviour closest to CONTRACT.md and PRD.md, carry on, and record it with \`${p} finding add <ACn or -> minor "DECIDED: <what you chose and why>"\`.
A feature whose API key, endpoint or account is not provided is built exactly as CONTRACT.md's "Missing keys" section says (build skill L12): it works now through the free, no-key service the contract names, with its short "for now" note on screen — or, where the contract names none, shows its "not available" banner or message — and the key is read only from lib/config/api_keys.dart, so adding it later switches to the real service with no code change. Never pick another substitute yourself. Only behaviour that truly needs the real service, or a platform API that does not exist, is BLOCKED: never test it, record \`${p} feature <ACn> blocked "<what is missing>"\`.
Read only what you need: never print a whole file with cat — find the line with grep -n, then read just that range (sed -n 'A,Bp', or Read with offset and limit). Run unit and widget tests with \`-j 4 -r failures-only --no-pub\` so only failures print and no more than 4 test processes run; device flow tests exactly as your task gives them (\`-r expanded\` into a log, so a stuck run shows — QA rule E10). A command output over 8 KB is cut to its first and last lines with the path of the full text — read that file the same targeted way.
This computer is the user's: free memory only by stopping the plugin's own devices (app-factory-… simulators, af-… emulators) when your task says to, and handle a stuck app or device only with \`${p} app-restart\` / \`device-reset\`. Never run sudo, drop_caches, swapoff or swapon, sysctl, purge, pkill, killall, kill by name or of a process you did not start, reboot or shutdown, or delete a device: they can freeze or crash the computer or kill the user's own programs, and the plugin's guard refuses them. Still short of memory → a critical finding, never a workaround.
The project folder holds only the app, its tests, CONTRACT.md and design/: keep notes and scratch files outside it (your scratchpad or /tmp). \`${p} stray\` fails on anything else; delete what it lists before you finish.
API keys: never print, echo, log, write or commit a key value, and never put one in a prompt, a finding, a handoff or a test. The stored keys live outside the project; \`${p} secret names\` lists them (names only). The app reads keys only through lib/config/api_keys.dart (build skill L12): every \`flutter run\`, \`flutter test\` on a device and \`flutter build\` that should use them adds \`$(${p} secret define)\`; a key a native SDK reads goes in with \`${p} secret native <NAME> android:<manifest placeholder> ios:<xcconfig variable>\` (it writes the git-ignored android/local.properties and ios/Flutter/Secrets.xcconfig). Command output and file reads show a stored key as ‹NAME›: that is the key working as intended — never try to recover it. A key you find anywhere in the project — a raw value, or a ‹NAME› copied into a file — goes to its proper place only with \`${p} secret move\`: it stores the key and rewires the file (Dart → ApiKeys.<name> from lib/config/api_keys.dart; AndroidManifest.xml → the manifest placeholder NAME, filled from git-ignored local.properties by android/app/build.gradle.kts; Info.plist and Swift → $(NAME), from git-ignored ios/Flutter/Secrets.xcconfig); never copy, print, move or delete a key yourself. If it lists a file as NOT WIRED, change that code to read the key the way it says. \`${p} secret scan\` must pass before you finish.
The plugin's skills and scripts are in ${ROOT} — where a skill writes \`<plugin>/scripts/…\`, run \`${ROOT}/scripts/…\`.
Batch independent actions: reads, lookups (grep, sed -n, ls) and file writes that do not depend on each other's results go in ONE turn, as several tool calls at once — Claude Code runs them together; every turn costs about 10 s however small it is (v4: 198 of 225 turns in the first three steps held one call, e.g. 26 design files read one per turn). Only an action that needs the previous result waits for it.
Keep simple things simple: do exactly what your task and its sources ask, the shortest way that fully works — no extra steps, files, layers, packages, tools, screens or retries they do not call for, and no rebuilding something that already works.
Everything must be visible to the user: run every command in the foreground and wait for it. Never start a background, detached or headless process — no \`&\`, \`nohup\`, \`disown\`, background shell, or \`claude -p\` — and never leave a process of yours running when you finish. Whenever the app runs in a simulator, its Simulator window must be open; leave the Simulator app open.`
let P = `node "${PIPE}"`
// Every step that drives the app on a simulator or emulator runs as the plugin's own tester sub-agent (agents/tester.md):
// its standing rules (shared devices, fresh install, report only what was seen, lessons in its memory) apply to all of them.
// If that agent type cannot be resolved, the same prompt runs as a plain workflow agent instead of the step failing.
const TESTER = 'app-factory:tester'
const asTester = (prompt, opts) => agent(prompt, { ...opts, agentType: TESTER }).catch((e) => {
  log(`${opts.label}: tester sub-agent unavailable (${String(e && e.message || e).slice(0, 120)}) — running as a plain agent`)
  return agent(prompt, opts)
})
let WHERE = where('.', P)

if (KEY_ANSWERS.length) return {
  stage: 'secret',
  nextStep: `The answers for ${KEY_ANSWERS.map((x) => x.id).join(', ')} look like key values — nothing was started, and no agent saw them. For each: store it with \`printf '%s' '<the value>' | node "${PIPE}" secret set <NAME>\` in the project directory, then run this workflow again with the same args, that answer replaced by "provided". Do not repeat the value in the chat.`,
}

// ───────────────────────────── Design import: the only step that calls Figma ─────────────────────────────
// Every Figma read counts against the account's quota (Pro plan, Full seat: 200 calls/day, 10/min — Figma's rate-limits doc),
// so the whole design is fetched once and cached in design/; every later agent reads the files instead.
let designImport = null
if (STAGE !== 'build' || ARGS.figma || ARGS.refreshDesign) {
  phase('Design import')
  designImport = await agent(
    `${WHERE.replace(/^Never call a Figma tool.*\n/m, '')}
Design import — you are the ONLY agent in this run allowed to call Figma tools. Before anything reads PRD.md, run \`${P} secret import\`: every API key written in PRD.md is stored outside the project under a name (PRD.md stays as written and is git-ignored), and from then on every read of PRD.md shows ‹NAME› where the value is — that is the key, provided and ready to use. Put its output line in note. Then run \`${P} init\` (safe if already initialised), then \`${P} timing start design-import\`.
1. The Figma link: ${ARGS.figma ? `"${ARGS.figma}"` : 'search PRD.md for a URL containing figma.com/design/'}. None → ${STAGE === 'contract' && !ARGS.noFigma ? `run \`${P} timing pause "asking for the Figma link"\` (the chat asks the user now), then ` : ''}return status "none" with every count 0, and do nothing else.
   You may fail: if the file cannot be opened (no access for this Figma account — check with whoami — or a wrong link), return status "failed" with the reason in note. Never return "imported" for a partial import.
2. ${ARGS.refreshDesign ? 'The user asked for a fresh import: delete design/ and import again.' : 'If design/manifest.json exists for the same file key and every file it lists exists → run step 7 only (it compresses just the images not compressed yet), then return status "reused" without calling Figma.'}
3. Read these MCP resources (ReadMcpResourceTool, server "figma") and follow them: skill://figma/figma-design-to-code/SKILL.md (for get_design_context) and skill://figma/figma-use/SKILL.md (for use_figma — you only READ the file: never create, change or delete anything in it). Load all the tools in one ToolSearch call: select:mcp__figma__get_metadata,mcp__figma__get_design_context,mcp__figma__get_screenshot,mcp__figma__use_figma,mcp__figma__download_assets.
4. Budget: every call costs from a daily allowance (Pro plan, Full seat: 200 a day, 10 a minute), so make as few as possible and count them by tool. The first get_metadata is the access check. A per-minute rate limit → wait 60 s (\`node -e "setTimeout(()=>{},60000)"\`) and retry once. A plan, daily or monthly limit (for example "tool call limit on the Starter plan") or no access → do NOT retry — it will not reset in a minute: stop at once, status "failed", and say in note which file and team, and that the import needs a file on a team where this account has a Full or Dev seat (or the link passed as "figma").
5. Import the design as it is — every screen, flow, colour, font, image and icon — in this order:
   a. get_metadata(fileKey) → the pages. If the URL has a node-id, import only that node.
   b. get_metadata(fileKey, page) for each page that holds app screens → save the XML verbatim to design/pages/<page-slug>.metadata.xml. Its top-level frames are the screens. Skip frames that are not app screens (component sheets, notes, old versions) and list them as skipped.
   c. One use_figma call (skillNames "resource:figma-use"; no page switch) that returns, JSON-serialised: every local variable collection with its modes, every local variable (name, resolvedType, valuesByMode — colours converted from the 0–1 range to #RRGGBB plus alpha), every local paint style (name, its paints as #RRGGBB) and every local text style (name, fontName, fontSize, lineHeight, letterSpacing). Save it verbatim to design/tokens.json.
   d. For each page from b, one use_figma call that switches to that page once (\`await figma.setCurrentPageAsync(await figma.getNodeByIdAsync("<page id>"))\`) and returns a COMPACT inventory — use_figma replies are cut off at about 20 KB, so return summaries, not per-layer dumps; positions and sizes are already in the page metadata XML. Per screen frame: id and name; (1) only the nodes that have \`reactions\` — node id, name, and the reactions as JSON.parse(JSON.stringify(node.reactions)), so no field is guessed; (2) its colours as a de-duplicated list — #RRGGBB, opacity, the bound variable id from node.boundVariables (or null), how many layers use it, and as what (fill, stroke, text); (3) the layers with an IMAGE fill — id and name only; (4) the icons and vector graphics (VECTOR and BOOLEAN_OPERATION nodes, and INSTANCE nodes whose main component is an icon) — id and name only, the outermost icon layer only, not its parts; (5) the font families and styles its text uses, de-duplicated. Inside the script, before returning, measure JSON.stringify(result).length: if it is over 18000 characters, return as many whole screens as fit plus "remaining": [their ids], and make the next call for those — never cut a screen in half. Issue the page calls in ONE message, in parallel, as figma-use requires. Save each result verbatim to design/pages/<page-slug>.inventory.json (merge the parts of a split page).
   Names: after d, run \`node "${ROOT}/scripts/design-docs.mjs" slugs design\` once — it prints each screen frame's slug; every file of a screen uses it (screens/<slug>.context.md, assets/<slug>-<file name>, reference/<slug>.png).
   e. For each screen: get_design_context(fileKey, frame, clientFrameworks "${STACK_NAME === 'flutter' ? 'flutter' : 'swiftui'}", clientLanguages "${STACK_NAME === 'flutter' ? 'dart' : 'swift'}", skillNames "resource:figma-design-to-code") → save the full response text verbatim to design/screens/<slug>.context.md. Download every asset it references into design/assets/<slug>-<the file name in the response> right away, as the response describes (the URLs expire). If the response is flagged sparse: pick the screen's visible child nodes from the page's metadata XML (not from a screenshot) and fetch them in one batch of get_design_context calls, each saved to design/screens/<slug>.<child-slug>.context.md. A server error is different from a sparse response: retry that screen once; if it fails again, do NOT fetch its child layers — record it in MISSING.md (its metadata and inventory are still imported) and move on. get_design_context also returns a screenshot inline: do not use it for anything.
   f. Every image and icon in the inventories (d) that step e did not download: download_assets(fileKey, its node id) and save it to design/assets/ (svg for vectors and icons; the original format for images). download_assets returns at most 20 images and 20 SVGs per call — call it on smaller nodes until every one is covered.
   g. Reference screenshots, for the runners' design comparison only — one call per page, not one per screen: get_screenshot(fileKey, <page id>, maxDimension 16384) and download the PNG with the curl command it returns to design/pages/<page-slug>.png. scale = its width ÷ original_width. minX and minY = the smallest x and y of ALL top-level layers in that page's metadata XML (screens and non-screens). For each screen: \`node "${ROOT}/scripts/crop.mjs" design/pages/<page-slug>.png <scale> design/reference/<slug>.png <x − minX> <y − minY> <width> <height>\` with the frame's x, y, width, height from the metadata (exact crop; it fails rather than cut outside the image). Open the first and the last crop and confirm each shows its whole screen. If the page call is refused, scale is below 1, a crop fails, or a crop shows the wrong area: fall back to get_screenshot(fileKey, frame, maxDimension 2048) for each screen instead.
6. Map everything with the plugin's script — never write these documents yourself (v4's agent spent 15,173 tokens and 9 script runs writing its own generator). First write design/import.json, the only part that needs judgement: {"url", "fileKey", "importedAt" (\`date -u +%FT%TZ\`), "figmaCalls", "figmaCallsByTool": {tool: count}, "prd": {"total": the number of screens PRD.md states (its total, or the count of the screens it lists), "screens": [{"name": "<PRD screen, with its section>", "frames": ["<the Figma frame ids that show it>"]}] — a PRD screen with no frame gets []}, "states": {"<frame id>": "<the state it shows: empty, loading, error, a variant>"}, "prdColors": [every colour PRD.md names: {"name", "value": "#RRGGBB", "alpha", "use"}], "skipped": ["<top-level frames that are not app screens: name (id)>"], "routeSkip": ["<element id, or an id prefix like I1:1601;, of every reaction drawn inside an illustration or mockup — a phone pictured on an onboarding page — that the app will not make tappable>"]}. Then \`node "${ROOT}/scripts/design-docs.mjs" build design\` — from what a–g saved it writes SCREENS.md (PRD vs Figma, with ✓/✗ per frame and the totals), FLOWS.md (one row per reaction, transitions verbatim; interactive-looking layers without a reaction; screens no flow reaches), colors.json and COLORS.md (every colour, raw ones, near-duplicates, PRD colours matched or NO MATCH with the closest), ASSETS.md (every image, icon and mask each screen's design code uses, placed from the metadata; files downloaded but unused), FONTS.md, MISSING.md (every gap, numbered — the contract step turns each into a question), DESIGN.md, ROUTE.md (the exploring plan: every screen in the order the design's buttons reach it, the taps that get there, each button with the screen it opens) and manifest.json — and prints the counts you return in step 8. If MISSING.md shows a gap that comes from import.json (a PRD screen mapped to the wrong frame, a PRD colour misread), fix import.json and run build again; never edit the generated files.
7. Compress the images — once, here, before any code uses them, so every screen is built and audited with the final files: \`node "${ROOT}/scripts/assets.mjs" design --dpr <D> --max-width 440\`, where D is 3 if PRD.md says the app is for iOS only, otherwise 4 (Android's sharpest screens are 4×); add \`--no-resize\` if PRD.md or the design includes tablets or iPad. Run it in the foreground — it takes about a minute. It turns every image into lossless WebP (pixel-identical — the encoder's own check must report PSNR 99, or the image is kept as it was) and scales an image down only to what the sharpest phone can show at the largest size the design draws it (sizes from screens/*.context.md and the page metadata; an image whose drawn size it cannot work out is never scaled). It keeps the originals in design/originals/, renames every reference in design/ (manifest, ASSETS.md, context files) to the new .webp names, and writes design/COMPRESSION.md. Do not convert, scale or rename any image yourself. If the command fails, return status "failed" with its output in note. Return its last output line as compression.
8. \`${P} handoff design-import "<screens, flows, colours, assets downloaded/missing, fonts, figma calls, MISSING items, compression>"\` and return the counts design-docs.mjs build printed (screens, prdScreens, matchedScreens, flows, colors, assets, missing).`,
    { label: 'design import', phase: 'Design import', schema: DESIGN_IMPORT },
  )
  log(`design import: ${designImport ? `${designImport.status}, PRD ${designImport.prdScreens} screen(s) · Figma ${designImport.screens} · matched ${designImport.matchedScreens}, ${designImport.flows} flow(s), ${designImport.colors} colour(s), ${designImport.assets} asset(s), ${designImport.missing} MISSING item(s), ${designImport.figmaCalls} Figma call(s)${designImport.compression ? `, images: ${designImport.compression}` : ''}${designImport.note ? ` — ${designImport.note}` : ''}` : 'no result'}`)
}

// No Figma link in PRD.md: ask for it at once, in the chat — before the contract is written without a design.
if (designImport && designImport.status === 'none' && STAGE === 'contract' && !ARGS.figma && !ARGS.noFigma) {
  log('PRD.md has no Figma link — the chat asks for it now')
  const again = (extra) => `{${[ARGS.parallel === false ? '"parallel":false' : '', ARGS.stack ? `"stack":"${ARGS.stack}"` : '', ARGS.note ? `"note":${JSON.stringify(String(ARGS.note))}` : '', extra].filter(Boolean).join(',')}}`
  return {
    stage: 'figma',
    questions: [{ id: 'F1', area: 'design', header: 'Figma link', question: 'PRD.md has no Figma link. Which Figma file is the design for this app?',
      options: [
        { label: 'Paste the Figma link (Recommended)', description: 'Type the figma.com/design/… link under Other: the whole design is imported, every screen is built and checked against it' },
        { label: 'No Figma design', description: 'Build from PRD.md and the mockups it gives; screens are checked only against those mockups' },
      ], affects: 'every screen' }],
    nextStep: `Ask the user this one question now with AskUserQuestion, exactly as given. If the answer contains a figma.com/design/ link, run this workflow again in this same chat with args ${again('"figma":"<that link>"')}. If they chose "Paste the Figma link" without typing one, ask them in the chat for the link and do the same. If they chose "No Figma design", run it again with args ${again('"noFigma":true')}. Do not start anything else.`,
  }
}
if (designImport && (designImport.status === 'failed' || !designImport.status)) {
  log(`design import failed${designImport.note ? `: ${designImport.note}` : ''} — stopped before the contract, so nothing is written without the design. Fix access to the Figma file, then run again with {"refreshDesign":true}.`)
  return { aborted: true, designImport }
}
if (designImport === null && STAGE !== 'build') log('design import returned no result — stopped before the contract')
if (designImport === null && STAGE !== 'build') return { aborted: true, designImport }
const DESIGNED = Boolean(designImport && ['imported', 'reused'].includes(designImport.status))

// ───────────────────────────── Contract ─────────────────────────────
phase('Contract')
const contract = await agent(
  `${WHERE}
First run \`${P} claim\`. If it fails, another run is active on this project: stop immediately and return claimed=false with empty lists and projectDir="". Then, before reading PRD.md, \`${P} secret import\` (a key written in PRD.md is stored outside the project; reads of PRD.md show ‹NAME›).
Run \`pwd\` and return it as projectDir, and hasDesign = whether design/manifest.json exists. Run \`${P} host\` and return iosHost = its "ios" value and hostOs = its "os" value. Then run \`${P} init\` (safe if already initialised) and \`${P} timing start ${STAGE}\` (it records the start, or the resume after the questions, or an interruption). The test devices are SHARED by every project on this Mac: ${STAGE === 'contract' ? '' : `first take the machine-wide device lock with \`${P} devices claim "$(pwd)"\`; if it fails, another project's run is using the devices: run \`${P} timing end "not started: devices busy"\` and \`${P} release\`, stop, and return claimed=false with that message as the only assumed item and empty lists. Then `}use the simulator named "app-factory-iphone-17": if it is in \`xcrun simctl list devices\`, use it; otherwise create it with \`xcrun simctl create "app-factory-iphone-17" "iPhone 17" <an installed iOS runtime id from \`xcrun simctl list runtimes\`>\` (if that runtime has no iPhone 17, the newest iPhone it supports). Record it with \`${P} sim <udid>\` and return it as simulatorId. Never create a device named after the project, and never change or delete a device whose name does not start with "app-factory-" or "af-".
${STAGE === 'contract' ? '' : `Make the project a git repository the test phase can rely on: if \`git rev-parse --is-inside-work-tree\` fails, run \`git init -q\`. Make sure .gitignore contains each of these lines (append the missing ones): .pipeline/, build/, .dart_tool/, .flutter-plugins, .flutter-plugins-dependencies, ios/Pods/, android/.gradle/, DerivedData/, *.iml, .idea/, ios/Flutter/Secrets.xcconfig (API keys are never committed). Then \`${GIT_COMMIT} "app-factory: baseline"\` (skip if a commit with that message exists).
`}${STAGE === 'build'
    ? `CONTRACT.md has been approved by the user. ${ANSWERS.length ? `The user answered these questions in the chat: ${JSON.stringify(ANSWERS)}. ` : 'No answers were passed in: every question keeps its recommended option. '}Apply the answers once (skip this, up to "Log each applied answer", if .pipeline/answers.json already exists — \`test -f .pipeline/answers.json\`): for every answer with isDefault false, change the CONTRACT.md lines tagged with that id (e.g. "(Q3)") to match it; if an answer needs behaviour the contract does not have yet, add the criteria and field-table rows it needs (next free AC numbers). An answer "provided" for a key: \`${P} secret names\` must list it (the value was stored outside the project and is never shown to you); if a native SDK reads it, run \`${P} secret native <NAME> android:<placeholder> ios:<variable>\` and wire the placeholder (android/app/build.gradle manifestPlaceholders → AndroidManifest.xml) and the variable (ios/Flutter/Debug.xcconfig and Release.xcconfig \`#include? "Secrets.xcconfig"\` → Info.plist → read at startup); then in the "Missing keys" section mark it provided and register its blocked criteria with \`${P} feature <ACn> failing <title>\`. Not listed → the question's recommended option applies; log "<NAME> not stored". An endpoint or account name (not a secret) goes into CONTRACT.md as given. An answer choosing the free service or "not available" for a key: set that behaviour in the "Missing keys" section and its criteria. An asset or font answered with a file path: if the file is there, copy it into design/assets/ (fonts into design/assets/fonts/) and change its row in design/ASSETS.md or design/FONTS.md from MISSING to that file; if not, the question's default applies — log which. Write the answers exactly as given above (\`[]\` when none were passed in) as JSON to a file in your scratchpad, then run \`${P} decisions --answers <that file>\` — it records them and rewrites DECISIONS.md with every question, its options and the selected one. Log each applied answer with \`${P} log contract "Q<n> applied: <change>"\`. Do not write a new contract. If the brief lists no features, register every criterion from CONTRACT.md: \`${P} feature <ACn> failing <short title>\` — and every criterion the "Missing keys" section marks as needing the real service with \`${P} feature <ACn> blocked "needs <KEY>"\` instead. If the brief lists no feature groups, register the groups of the "Feature groups" section with \`${P} group <name> <ACn,ACn,...>\`. If CONTRACT.md has no field table, add one (every input field: screen, field, type, required, limits, exact error message, placeholder example — ASSUMED where no source states it). Return the features, the groups in build order, the blocked criteria and the ASSUMED items. Finish with \`${P} handoff contract "approved contract in use; <what you registered>"\`.`
    : `${STAGE === 'contract'
      ? `If CONTRACT.md already exists, do NOT overwrite it — it may be the user's approved contract: run \`${P} timing pause "waiting for the build call"\` and \`${P} release\` and return existingContract=true with the features from the brief (empty list if none), groups=[] and assumed=["CONTRACT.md already exists and was not changed"]. Otherwise:`
      : `If CONTRACT.md already exists, do NOT rewrite it: use it unchanged, register its criteria and groups only if the brief lists none, return existingContract=true, and skip to the handoff. Otherwise:`}
Read PRD.md and, if design/manifest.json exists, the WHOLE imported design: manifest.json, SCREENS.md, DESIGN.md, FLOWS.md, COLORS.md, colors.json, ASSETS.md, FONTS.md, MISSING.md, tokens.json, every pages/*.inventory.json and every screens/*.context.md (not the reference screenshots). First check every file manifest.json lists exists; if one does not, stop and return claimed=true, designScreensRead=0 and assumed=["design files missing: <which>"]. Return designScreensRead = the number of screens/*.context.md screens you read.
STEP 1 — UPFRONT AUDIT, in your own reasoning (no file). This is the only time the user is asked anything; nothing may be asked later, so find every gap now. Go through the whole app — every screen, field, rule and stored record the PRD and design imply — and check:
- Design: every PRD screen has a design screen and every design screen maps to the PRD; each screen's empty, loading and error states are designed; every text, image, icon and font exists in the design data; every button has a destination. If design/MISSING.md exists, EVERY line in it becomes its own question, with these defaults unless a better one is obvious: a missing image or icon → "put the file at design/provided/<name>.<ext>"; default: a plain grey box of the same size labelled with the asset's name. A custom font → "put the font files at design/provided/fonts/"; default: the platform font (San Francisco on iOS, Roboto on Android). An element with no reaction → "where does it lead?"; default: it does nothing and is left out of the contract. A screen no flow reaches → "how does the user get there?". A PRD colour with NO MATCH, near-duplicate colours, colours used raw → "which design colour is meant?"; default: the nearest design colour by value.
- Colours: every colour PRD.md names is mapped to a design colour in design/COLORS.md (or is a question).
- Logic: every calculation has an exact formula, rounding rule and order of operations; every limit has an exact number and what happens when it is reached; every field has its type, required or not, length or range, format and error message; dates, currency and number formats; numbering and ids.
- Dependencies: for every feature, everything outside the app it needs to work — an API key, an endpoint, an account or sign-in, store product ids, an SDK app id, a platform API. For each one PRD.md does not supply (the value, or where it is):
  1. Search for a FREE service that does the same job WITHOUT a key (WebSearch, then its own documentation — e.g. maps tiles, geocoding, weather, currency rates): read its usage terms (rate limit, attribution it requires, whether an app like this may use it) and make one real request to it with curl, without any key. It qualifies only if that request succeeds and its terms allow this use; record the URL, the request and the HTTP status. Never pick a service you did not call, and never one that needs a sign-up or a key.
  2. Ask one question: "<feature> needs <X>, which the PRD does not give. What should it do until you add it?" — options: "Free <service> for now (Recommended)" (only when one qualified): "<feature> works with <service>, no key; a short note on screen says it is the free version for now; add the key later and it switches to <the real service> with no code change"; "Not available until the key is added" (Recommended when nothing qualified): "<feature> shows '<Feature> isn't available yet' — a banner on its screen, or a short message when tapped; add the key later and it works"; "I'll provide the key": "Store it from a terminal in the project directory — node \"${PIPE}\" secret set <NAME>, paste the key, Return, Ctrl-D — so it never enters the chat; then answer 'provided'. (Pasted here instead, it is stored the same way and never passed on.)" Such a question is ask = true and counts first among the 4 asked. Never ask for ad unit ids (the ads skill uses Google's demo ids).
- Data and backend: where data lives; accounts and sign-in; what works offline; backup, export and import; deleting data and what it takes with it; payments (real store purchase or not); notifications.
- Platform: iOS, Android or both; minimum OS versions; phone only or tablet; orientation; languages; dark mode.
${STACK.own ? `- App icon: find the file PRD.md or the design gives as the app (launcher) icon, and inspect it: \`node "${ROOT}/scripts/app-icon.mjs" inspect <file>\`. iOS needs a square, opaque, full-bleed 1024×1024 image — the system rounds the corners itself (Apple HIG); Android's adaptive icon keeps the logo inside the centred 66 of 108 dp. Every option must be buildable without another answer (an unattended run takes the recommended one), and the question says "or type the path of a 1024×1024 square, full-bleed icon under Other". A file that is not square, is smaller than 1024 px, or has transparent corners (a pre-rounded or cut-out logo) → one question that states what the file is (size, transparent corners): "Use <file> adjusted (Recommended)" — enlarged ×<1024÷size> (soft) and its transparent corners filled with a colour you name (the design's background colour), so its own rounded corners show inside the system's; a non-square file has no adjusted option — then the next case applies. No icon file at all → one question: "Keep the default icon for now (Recommended)" — the app ships with Flutter's icon and the final report says so. An optional second file, a logo-only transparent PNG for the Android foreground, may be given the same way.
` : ''}${STACK.own ? `- Ads + Remote Config: every app gets the team's ads + Remote Config pattern by default, whether or not PRD.md mentions ads — read "${ADS}" and map this app's screens to its placement table (section 2); a screen that fits no row gets no ad; the table decides every placement (every tap on home that opens another screen is a feature entry; the banner is adaptive) — no question about placements. Leave ads out only when PRD.md or the user's note says the app has no ads.
- Premium (the paid tier, "${ADS}" section 5): what PRD.md says it unlocks, its plans and any free uses per feature; PRD.md silent → the guide app's default, Premium = no ads, plans as the RevenueCat offering has them — no question. "No paid tier" only when PRD.md or the user's note says the app is free with nothing to buy.
` : ''}- Scope: everything the PRD names but does not define (a menu item, a report, a setting).
- Screens: the PRD's screen total against the Figma screens in design/SCREENS.md. Every PRD screen without a Figma frame, every Figma screen not in the PRD, and any difference between the two totals is a question (default: build only the screens both contain; a PRD-only screen is built in the design's style from the PRD).
- Functionality: for every feature in the PRD, its inputs, rules, outputs, what it stores, and what happens on an error, a limit and an empty state. Each of these that neither PRD.md nor the design states is a question.
Return in "questions" ONLY the questions whose ask is true (at most 4, in the order asked) and in questionCount the number of all questions — every one of them is already recorded by \`${P} decisions --questions\` (DECISIONS.md); returning the rest again costs minutes of writing (v4: an 18,975-token reply) and nothing reads it. The chat that started this run asks the user the returned ones; write no questions file in the project. One question (Q1, Q2, …) per gap whose answer changes what gets built: id; area (design, logic, data, dependency, platform, scope); header = a label of at most 12 characters; question = one full sentence that names the screens or features it affects and ends with "?"; options = 2 to 4 choices, each a label of at most 5 words and a one-line description of what gets built if it is chosen, the recommended one FIRST with " (Recommended)" at the end of its label; affects = the screens or features. Do not add an "Other" option — the dialog always offers one. Do not ask what PRD.md or the design already answers, and do not ask about implementation details the user does not care about. Every proposed addition (section 4 below) is also a question, with "Leave it out (Recommended)" first.
Mark each question with ask (true or false) and why (one line). The user is asked only the most important ones — ask = true only when (a) the answer is something only the user has: a file, link, key, account or a price; (b) the recommended option adds or drops a screen or feature PRD.md names, or ads or payments; or (c) the recommended option could lose the user's data or leave a PRD flow unfinished. At most 4 are asked: if more qualify, keep first the questions only the user can answer (a key, file, link, account or price), then those that change the most criteria, and set the rest to false — and list the asked ones first. Every other question is ask = false — it is settled with its recommended option, and why says why that option is safe. Then write the whole questions array you will return, exactly, as JSON to a file in your scratchpad (outside the project) and run \`${P} decisions --questions <that file>\` — it checks the format (ids, headers of at most 12 characters, questions ending in "?", 2–4 options with the recommended first, ask and why) and, when it passes, records them and writes DECISIONS.md, the one record of every question, its options and the selected option. If it lists problems, fix those questions and run it again; never write your own checker.
STEP 2 — Write CONTRACT.md using the recommended option of every question, and tag every line a question affects with its id, e.g. "(Q3)", so the answers can be applied later. It is the only document this run writes (no LOGIC.md, INTERFACE.md, TESTCASES.md, APPMAP.md or audit file). Sections (when there is a design: screens, fields and texts follow it, every flow in design/FLOWS.md is part of a criterion, and colours are named as in design/COLORS.md; where it disagrees with PRD.md, PRD.md decides behaviour and the design decides appearance — list every such conflict as ASSUMED):
1. Screens: for each screen, its state (fields and types), the user actions, and the empty/error/loading states.
2. Field table: one row per input field — screen, field, type, required, limits (length, min, max, format), the exact error message for each way it can be invalid, and the example shown as its placeholder (from the design data when the design shows one; otherwise a value that passes this field's own rules, marked ASSUMED — never real personal data).
3. Acceptance criteria: a numbered list (AC1, AC2, ...), each testable as exact input → exact expected output. Where the PRD is silent, choose a behaviour and mark it "ASSUMED". Every requirement in PRD.md must be covered by at least one criterion.
4. Proposed additions: behaviour the PRD does not ask for, allowed only when (a) a PRD flow cannot be completed without it, (b) without it a user can lose data, or (c) a list in the PRD can grow past one screen and has no way to find a record. Each names the test it meets and is a question; quality basics (validation, empty/loading/error states, delete confirmation, data surviving a restart) are not listed — they are always built.
5. Feature groups: 4–10 groups by screen or feature area, each named with one lowercase word or hyphenated words (items, invoice-settings) and listing its criteria; every criterion in exactly one group, in build order (a group only depends on earlier ones).
6. User flows: every end-to-end journey a user takes (from the PRD and design/FLOWS.md), each as one line: screens in order → the criteria it passes through. Every criterion that a user reaches through the screens is in at least one flow — the flow-test writers write one device test per flow.
7. Devices: the platforms (iOS, Android or both) and form factors (phones; tablets only if the PRD, the design or an answer says so) the app must work on.
8. Missing keys: per missing key — its name (e.g. MAPS_API_KEY), the features and criteria it serves, the chosen behaviour (Q id): the free service (name, base URL, the request you made and its HTTP status, its usage limits and the attribution its terms require) or "not available"; the exact text on screen (free: default "<Feature>: free version for now"; not available: default "<Feature> isn't available yet", as a banner on <screen> or a message when <element> is tapped); and how to add the key later (\`--dart-define=<NAME>=…\`, plus the native file an SDK needs). Write a normal criterion for the free or not-available behaviour (it is tested), and a separate criterion, registered blocked "needs <NAME>", only for behaviour that needs the real service.
   Provided keys — every name \`${P} secret names\` lists (a key PRD.md gave shows there as ‹NAME›; one the user stored shows the same way): the features and criteria it serves, the constant in lib/config/api_keys.dart that reads it, and whether a native SDK reads it (then the manifest placeholder and xcconfig variable \`${P} secret native\` gets). A provided key is never a question and never "missing".
   API calls — for every paid or rate-limited API the app uses (keyed, or the free service above): one row per user action that calls it — action, endpoint, the ONE request it makes, every response field the screens and logic read (that is the field mask or fields= list; from its documentation, URL cited), whether a batch endpoint or a session token applies (cited), the cache lifetime its terms allow (quote the terms and URL; silent → this session only), and the call budget (requests per action: normally 1; repeating the action within the cache lifetime: 0). Each row is part of a criterion (build skill L13, T8). Never call a paid API to write this — its documentation is enough.${STACK.own ? `
   App icon: the exact arguments the build passes to app-icon.mjs after the project — "--source <file>" plus, only if the user chose them, "--allow-upscale", "--fill #RRGGBB" and "--foreground <logo-only png>"; or "--none <Q id>" when no usable icon was given (Q id).` : ''}
${STACK.own ? `9. Ads — the table and the screen lines from "${ADS}" section 2, each placement with its criterion in a feature group; "Not in scope" only when PRD.md or the user's note says the app has no ads, with that line quoted. Then the Premium lines ("${ADS}" section 5): the entitlement id (default "pro"); what Premium unlocks (always: no ads); "paywall_plans" — the package types in the order the paywall shows them (default "" = the offering's own order); one line per feature with a free allowance: its key, "free_uses_<key>" and the default count, with the criterion that tests the paywall at the limit; or "No paid tier" with the PRD.md line quoted.
` : ''}${STACK.own ? '10' : '9'}. Decisions: one line — "Every question, its options and the selected option: DECISIONS.md." (do not copy them here).
Register every screen's design reference for the end-of-testing design check: with design/, each frame of design/SCREENS.md that CONTRACT.md keeps — \`${P} reference <slug> design/reference/<slug>.png <W>x<H> --mask <live areas> <the state the frame shows>\` (W×H = the frame's size in points from the page metadata); without design/, each screen mockup PRD.md gives, the same way (its frame size in points as PRD.md states it, or the image's pixels ÷ its scale). Masks are only live areas the contract names (a map, camera or Look Around view, live data), as x,y,w,h in points — never a bar or a button. Register every criterion: \`${P} feature <ACn> failing <short title>\` — or, for a blocked one, \`${P} feature <ACn> blocked "<what is missing>"\` — and every group: \`${P} group <name> <ACn,ACn,...>\`.
Finish with \`${P} handoff contract "<number of questions, decisions, blocked criteria, every ASSUMED item and every proposed addition>"\` and return the questions.${STAGE === 'all' ? ' This is an unattended run: nobody is asked — every question keeps its recommended option: write a JSON file in your scratchpad with one entry per question whose ask is true, {"id":"<id>","answer":"<the label of its first option>","isDefault":true,"by":"unattended"}, and run \`${P} decisions --answers <that file>\`.' : ''}${STAGE === 'contract' ? ` This is a contract-only run: after the handoff, run \`${P} timing pause "questions in the chat"\` and \`${P} release\`.` : ''}`}`,
  { label: STAGE === 'build' ? 'setup (approved contract)' : 'contract', schema: CONTRACT, ...(STAGE === 'build' ? {} : { effort: 'high' }) },
)
if (!contract || !contract.claimed) {
  log(`not started: ${(contract && contract.assumed && contract.assumed[0]) || 'another pipeline run holds this project'} — nothing was changed`)
  return { aborted: true, contract }
}
if (DESIGNED && STAGE !== 'build' && !contract.existingContract && contract.designScreensRead !== designImport.screens) {
  log(`the upfront audit read ${contract.designScreensRead ?? 0} of ${designImport.screens} imported screens — stopped: a contract written without the whole design would be guessed. ${(contract.assumed || []).join('; ')}`)
  await agent(`${where((contract.projectDir || '.').trim() || '.', P)}
Run ${STAGE === 'contract' ? '' : `\`${P} devices release "${(contract.projectDir || '').trim() || '$(pwd)'}"\` and `}\`${P} timing end "stopped: the upfront audit did not read the whole design"\` and \`${P} release\`, then stop.`, { label: 'release locks', effort: 'low' })
  return { aborted: true, contract, designImport }
}
if (STAGE === 'contract') {
  log(contract.existingContract
    ? 'CONTRACT.md already existed and was left unchanged — to build from it, run again with {"stage":"build"}; to write a new one, delete CONTRACT.md first'
    : `${(contract.questions || []).length} question(s) for the user — the chat asks them now, then starts the build.`)
  const qs = contract.questions || []
  const asked = qs.filter((q) => q.ask).slice(0, 4) // the contract step marks at most 4; the cap holds even if it marks more
  const total = Math.max(contract.questionCount || 0, qs.length) // the contract returns only the asked ones; the rest are in DECISIONS.md
  const rerun = `{"stage":"build"${ARGS.parallel === false ? ',"parallel":false' : ''}${ARGS.stack ? `,"stack":"${ARGS.stack}"` : ''}${ARGS.note ? `,"note":${JSON.stringify(String(ARGS.note))}` : ''}`
  return {
    stage: 'contract',
    questions: qs,
    nextStep: asked.length
      ? `Ask the user only the ${asked.length} question(s) in "questions" whose "ask" is true (${asked.map((q) => q.id).join(', ')}) — in ONE chat message, not with AskUserQuestion (its dialog cannot time out). For each: "**<id> · <header>** — <question>", then its options numbered, each with its description, the first ending in "(Recommended)". End the message with: "Reply like ${asked[0].id}: 2, or type your own answer. With no reply in 5 minutes I continue with the recommended options.${total > asked.length ? ` The other ${total - asked.length} question(s) use their recommended option.` : ''} Every question, its options and the selected one are in DECISIONS.md." Then start the 5-minute timer: the Bash tool with run_in_background true and the command \`sleep 300\` — and end your turn. Then:
- A reply that contains a key value (a token-like string, or the user says it is a key): never put it in the answers or in any message to the workflow. Store it first — \`printf '%s' '<the value>' | node "${PIPE}" secret set <NAME>\` in the project directory (NAME from the question, e.g. MAPS_API_KEY) — and use the answer "provided". Do not repeat the value in the chat.
- The user replies first: map each answer to its option's label, or keep their own text. Run this workflow again in this same chat with args ${rerun},"answers":[{"id":"<id>","question":"<question>","answer":"<label or text>","isDefault":<true if it is the first option>,"by":"user"}, …]} — one entry per question they answered (a question they skipped is left out and keeps its recommended option). Then stop the timer with TaskStop (if that is not possible, ignore it when it ends).
- The timer ends first (its completion notice arrives; that notice is not a reply): run this workflow again in this same chat with args ${rerun},"answers":[${asked.map((q) => `{"id":"${q.id}","answer":${JSON.stringify(q.options[0].label)},"isDefault":true,"by":"timeout"}`).join(',')}]} and tell the user in one line that the recommended options were used.
- The timer ends after the build has started: do nothing. A reply after the build has started is not applied to this run — say so in one line.
Ask nothing else and do not change any option.`
      : `No question needs the user (${total} settled with their recommended option — see DECISIONS.md). Run this workflow again with args ${rerun}} in this same chat.`,
    contract,
  }
}
if ((contract.blocked || []).length) log(`blocked criteria (need a real key or a platform API — not tested; the rest of each feature works for now, see CONTRACT.md "Missing keys"): ${contract.blocked.join(', ')}`)

// A design imported in this call, or in the earlier contract call (the setup step reports design/manifest.json).
const HAS_DESIGN = DESIGNED || Boolean(contract.hasDesign)
const ABS = (contract.projectDir || '').trim()
// The machine (pipeline.mjs host): iOS builds and simulators only on macOS with Xcode; anywhere else every device step
// runs on the Android emulator, and the iOS app is not built or tested.
const IOS_HOST = contract.iosHost !== false
const HOST_OS = contract.hostOs || 'darwin'
const CP_CLONE = HOST_OS === 'darwin' ? 'cp -Rc' : 'cp -R' // -c: an APFS clone, macOS only
const AVDMANAGER = `"${ANDROID_SDK}/cmdline-tools/latest/bin/avdmanager${HOST_OS === 'win32' ? '.bat' : ''}"`
if (!IOS_HOST) log(`this computer is ${HOST_OS} without Xcode — iOS is not built or tested here; every device step runs on the Android emulator`)
if (ABS) {
  // Absolute from here on, so agents working in a git worktree still write to the one shared .pipeline/.
  P = `PIPELINE_DIR="${ABS}/.pipeline" node "${PIPE}"`
  WHERE = where(ABS, P)
}
// Without a Mac the gate builds the Android app only (an iOS build needs Xcode).
const IOS_GATE = `\`flutter build ios --simulator --debug ${DEFINE}\` and, when CONTRACT.md includes Android, \`flutter build apk --debug ${DEFINE}\``
const FULL = () => { const t = STACK.full.replaceAll('${P}', P); return IOS_HOST ? t : t.replace(IOS_GATE, `\`flutter build apk --debug ${DEFINE}\` (no iOS build: this computer is not a Mac with Xcode)`) }
if (!IOS_HOST && !STACK.own) {
  log('the SwiftUI stack needs macOS with Xcode — stopped; run on a Mac, or use the Flutter stack')
  await agent(`${WHERE}\nRun \`${P} timing end "stopped: SwiftUI needs macOS"\` and \`${P} release\`, then stop.`, { label: 'release locks', effort: 'low' })
  return { aborted: true, contract }
}
const groups = (contract.groups || []).filter((g) => g.criteria && g.criteria.length)
if (!groups.length) groups.push({ name: 'all', criteria: contract.features.map((f) => f.id), unregistered: true })
const STATUS_LAST = `Your last command: \`${P} status\`; return its "blocking" and "blockingByOwner" values exactly as printed.`

// ───────────────────────────── Build: interface → per group logic ∥ UI ∥ flow tests → integrator → gate ─────────────────────────────
phase('Build')
if (PAR_BUILD) {
  await agent(
    `${WHERE}
Interface step: per feature group, a logic builder, a UI builder and a flow-test writer will work at the same time after you, so they need a fixed meeting point — in Dart, not in a document. First run \`${P} brief build\`. ${STACK.skills.all}
Project conventions, for reference:
${STACK.make}
Write ONLY the shared layer now, for the whole app: create the project and its folder structure, the theme, the data models, storage, navigation/routes (every screen as a placeholder that compiles), and every logic function and repository method the screens will need (calculation, validation per field of the field table, limits, numbering) as a compiling stub with its final name, parameters and return type, body not implemented. Add lib/ui/core/app_keys.dart: one \`abstract final class AppKeys\` with a \`ValueKey\` constant for every interactive widget and every asset the contract and design name (build skill U6, T7) — the UI builders use these on the widgets and the flow-test writers find widgets by them. Add every package the app will need to pubspec.yaml now and fetch them — the builders may not change it. Add dart_test.yaml declaring the tags "ios" and "android" (flow tests that only apply to one platform). Copy the layout-test helper: \`mkdir -p test/ui && cp "${ROOT}/templates/flutter/test/ui/fits_screen.dart" test/ui/fits_screen.dart\` (the UI builders' layout tests import it; build skill T3). If CONTRACT.md section 9 (Ads) lists placements, install the ads + Remote Config pattern only this way: \`node "${ROOT}/scripts/ads-install.mjs" "$(pwd)"\` — with \`--no-premium\` when section 9 says "No paid tier" — then \`flutter pub get\` (it adds lib/google_ads_material/, lib/premium_core/ unless --no-premium, their tests, the native ad factories and the packages; if it prints NOT DONE, add exactly those lines and run it again) and wire it as "${ADS}" sections 3 and 5 say: PremiumStore.instance.configure with ApiKeys.revenuecatAppleKey / revenuecatGoogleKey (REVENUECAT_APPLE_KEY / REVENUECAT_GOOGLE_KEY, build skill L12; none → demo mode) and section 9's entitlement id, and each "free_uses_<feature>" default into assets/remote_config_default.json. For every key in CONTRACT.md's "Provided keys" that a native SDK reads, run \`${P} secret native <NAME> android:<placeholder> ios:<variable>\` and wire them (build skill L12). Make the app icon from CONTRACT.md's "App icon" line, only this way (build skill U13): \`node "${ROOT}/scripts/app-icon.mjs" "$(pwd)" <the arguments that line gives>\` — if it refuses, the contract's choice was not recorded: file a major finding and use no other icon. Doc comments on the stubs say which criteria each serves. \`flutter analyze\` must succeed. Then \`${GIT_COMMIT} "app-factory: interface"\`.
Finish with \`${P} handoff interface "<what exists, where>"\`.`,
    { label: 'interface', phase: 'Build', effort: 'high' },
  )
}
for (const [gi, g] of groups.entries()) {
  const G = `Feature group ${gi + 1} of ${groups.length}: "${g.name}" — criteria ${g.criteria.join(', ')}. Build only what these criteria and their fields in CONTRACT.md need (rule L9: nothing that is not in the contract; file ideas as PROPOSAL findings). A criterion the brief shows as blocked is built up to its missing piece only. Earlier groups are done: do not change their behaviour except to fix an open finding in your inbox.`
  if (PAR_BUILD) {
    const own = STACK.own
    const res = await parallel([
      () => agent(
        `${WHERE}
${G}
You are the LOGIC builder; a UI builder and a flow-test writer work on this group in the same directory right now. You may create or edit ONLY ${own.logic.join(', ')}. ${STACK.skills.logic} Run \`${P} brief build logic\` and fix every finding in your inbox first. Implement this group's stubs from the interface, a validator with edge tests for each of its fields (L8), and a unit test per criterion named after it ("AC12 ..."). Think the logic through before coding (inputs, invariants, every edge, failure modes) — in your reasoning, not in a file; give a function a one-line comment only where a decision is not obvious from the code (a formula, rounding, an order). Do not change any signature; if one is wrong, implement the closest correct behaviour and report "signature problem: <which, why>" in your handoff. Every other file is frozen: report a needed change as "shared change needed: <file, what, why>". A compile error in the other agents' files is not yours. Check only your own folders: \`flutter analyze lib/domain lib/data test/domain test/data\` (no issues) and \`${UT} test/domain test/data -r failures-only --no-pub\`. Then commit only your files: \`${COMMIT_OWN('lib/domain lib/data test/domain test/data', `app-factory: logic ${g.name}`)}\`.
Finish with \`${P} handoff logic "${g.name}: <files, test result, anything unresolved>"\`. Do NOT mark features passing.`,
        { label: `logic: ${g.name}`, phase: 'Build', effort: 'high' },
      ),
      () => agent(
        `${WHERE}
${G}
You are the UI builder; a logic builder and a flow-test writer work on this group in the same directory right now. You may create or edit ONLY ${own.ui.join(', ')}. ${STACK.skills.ui} Run \`${P} brief build ui\` and fix every finding in your inbox first. Build this group's screens, their empty/loading/error states and actions, each interactive widget and asset with its AppKeys key, showing each field's validator message next to the field — calling ONLY the interface's functions, never re-implementing a rule. Sizes, largest text, locale and dark mode are tested here, as widget tests (T3) — never on a device. The logic may still be stubs while you work, so check only your own folders: \`flutter analyze lib/ui test/ui\` (no issues) and \`${UT} test/ui -r failures-only --no-pub\`. Every other file is frozen: report "missing from interface: <what>" or "shared change needed: <file, what, why>" in your handoff. Then commit only your files: \`${COMMIT_OWN('lib/ui test/ui', `app-factory: ui ${g.name}`)}\`.
Finish with \`${P} handoff ui "${g.name}: <files, what is wired to which function, anything unresolved>"\`. Do NOT mark features passing.`,
        { label: `ui: ${g.name}`, phase: 'Build' },
      ),
      () => agent(
        `${WHERE}
${G}
You are the FLOW-TEST WRITER for this group; a logic builder and a UI builder build it in the same directory right now, so the app is not finished — you write the device tests from the contract, not from the app. You may create or edit ONLY ${own.tests.join(', ')}. ${STACK.skills.tests} Run \`${P} brief build\`. From CONTRACT.md's "User flows" section, take every flow that passes through this group's criteria and write it as ONE device test in integration_test/${g.name}_flow_test.dart (QA skill section 3): it starts from empty storage, drives the screens by AppKeys only, and asserts every criterion on the way — the data (values, messages, what is stored) and the UI (each element present with its contract text, inside the safe area, not overlapping its neighbours). Name each test "<flow> AC.. AC..", with every criterion it checks. Tag a test that only applies to one platform with \`tags: ['ios']\` or \`tags: ['android']\`. No test for a blocked criterion. Edges, validation and formulas are unit tests, sizes and text scale widget tests — not yours. Check: \`flutter analyze integration_test\` (no issues; the app's code may still be stubs, so do not run the tests now). Then commit only your files: \`${COMMIT_OWN('integration_test dart_test.yaml', `app-factory: tests ${g.name}`)}\`.
Finish with \`${P} handoff tests "${g.name}: <flows, tests, criteria each covers>"\`.`,
        { label: `tests: ${g.name}`, phase: 'Build' },
      ),
    ])
    if (res.some((x) => !x)) log(`group ${g.name}: the ${['logic', 'UI', 'test'].filter((_, i) => !res[i]).join(' and ')} agent returned no result — the integrator finds what is missing`)
  } else {
    await agent(
      `${WHERE}
${G}
${STACK.skills.all} First run \`${P} brief build\` and fix every open finding in it.
${gi === 0 ? `This is the first group: create the project and the shared layer the build skill describes (structure, theme, storage, navigation, AppKeys, and \`mkdir -p test/ui && cp "${ROOT}/templates/flutter/test/ui/fits_screen.dart" test/ui/fits_screen.dart\`) as well as this group, run \`${P} secret native <NAME> android:<placeholder> ios:<variable>\` for every key in CONTRACT.md's "Provided keys" that a native SDK reads, and make the app icon from CONTRACT.md's "App icon" line only with \`node "${ROOT}/scripts/app-icon.mjs" "$(pwd)" <the arguments that line gives>\` (build skill U13). If CONTRACT.md section 9 (Ads) lists placements, install the ads + Remote Config pattern only this way: \`node "${ROOT}/scripts/ads-install.mjs" "$(pwd)"\` — with \`--no-premium\` when section 9 says "No paid tier" — then \`flutter pub get\` (it adds lib/google_ads_material/, lib/premium_core/ unless --no-premium, their tests, the native ad factories and the packages; if it prints NOT DONE, add exactly those lines and run it again) and wire it as "${ADS}" sections 3 and 5 say: PremiumStore.instance.configure with ApiKeys.revenuecatAppleKey / revenuecatGoogleKey (REVENUECAT_APPLE_KEY / REVENUECAT_GOOGLE_KEY, build skill L12; none → demo mode) and section 9's entitlement id, and each "free_uses_<feature>" default into assets/remote_config_default.json.` : 'The project exists: add this group to it.'}
Then build it, and write this group's flow tests (QA skill section 3) for the flows in CONTRACT.md's "User flows" section that pass through its criteria:
${STACK.make}
${STACK.quick}
Then \`${GIT_COMMIT} "app-factory: group ${g.name}"\`. Finish with \`${P} handoff build "${g.name}: <files, test result, anything unresolved>"\`. Do NOT mark features passing. A failing build is a valid result; report it honestly.`,
      { label: `build: ${g.name}`, phase: 'Build', schema: BUILD, effort: 'high' },
    )
  }
}

// ───────────────────────────── Integrator + gate (scripts only — no audit) ─────────────────────────────
const fixer = (label, owner, ph, extra = '') => agent(
  `${WHERE}
${label}. ${extra}${STACK.skills.all} Run \`${P} brief ${ph === 'Test' ? 'test' : 'build'}${owner ? ` ${owner}` : ''}\`: every finding in your inbox is your to-do list. ${owner && STACK.own ? `You may create or edit ONLY ${STACK.own[owner].join(', ')}; ${owner === 'shared' ? 'you also take the unrouted findings — one whose cause is in lib/domain, lib/data or lib/ui you route instead (`finding route <Xn> <logic|ui>`), and ' : ''}other fixers work on the other files right now — do not touch them.` : ''}
Fix each finding following "${QA}" sections 5 and 6: reproduce it first with a unit or widget test that fails (no device needed); fix the cause; the test passes → resolve the finding with that evidence. Only when it cannot be reproduced without a device: fix it, then \`${P} finding pending <Xn> "<the flow test that proves it>"\` and list it in pendingDevice — it leaves every fixer's inbox, and the next test round re-runs that test and resolves it. A cause outside the code — a platform API that does not exist, or behaviour the "Missing keys" section says needs the real key: \`${P} finding block <Xn> "<what, and the evidence>"\` and \`${P} feature <ACn> blocked "<what is missing>"\`. A feature's free or not-available behaviour is never blocked — fix it (build skill L12).
Check: \`flutter analyze\` and \`${UT} -r failures-only --no-pub\` must pass. ${owner && STACK.own ? `Then commit only your files: \`${COMMIT_OWN(STACK.own[owner].map((g) => g.replace(/\/\*\*$/, '')).join(' '), `app-factory: fix ${owner} <X ids>`)}\` — replace <X ids> with every finding id you fixed or marked pending, space-separated (e.g. "app-factory: fix ui X74 X75"): the next round re-runs exactly those findings' tests (\`affected --platform\`); a commit without ids re-runs everything` : `Then \`${GIT_COMMIT} "app-factory: ${label}"\``}. Finish with \`${P} handoff fix "<fixed, pending device, blocked>"\`. ${STATUS_LAST}`,
  { label, phase: ph, schema: FIXES, effort: 'high' },
)
const fixers = async (ph, r, counts) => {
  const owners = STACK.own
    ? ['logic', 'ui', 'shared'].filter((o) => !counts || (o === 'shared' ? counts.blockingByOwner.shared + counts.blockingByOwner.unrouted : counts.blockingByOwner[o]) > 0)
    : ['']
  if (!owners.length) return counts
  const out = (await parallel(owners.map((o) => () => fixer(`fix r${r}${o ? ` ${o}` : ''}`, o, ph)))).filter(Boolean)
  return out.length ? out[out.length - 1] : counts
}

let round = 0
let build = null
while (round < MAX_ROUNDS) {
  round++
  build = await agent(
    `${WHERE}
${round === 1 && PAR_BUILD
    ? `You are the INTEGRATOR. Every feature group was built by a logic builder, a UI builder and a flow-test writer in parallel against the interface. Run \`${P} brief build shared\`, then read (do not edit) the "interface", "logic", "ui" and "tests" handoffs in .pipeline/state.json: resolve every "signature problem", "missing from interface" and "shared change needed" item. Then go through CONTRACT.md criterion by criterion and confirm each user action on screen actually calls the logic that enforces it (a rule that is correct in the logic but never called from the screen is the defect to look for); fix what is not wired. You may edit any file. ${STACK.skills.all}`
    : round === 1
      ? `Every feature group is built. Run \`${P} brief build\` and make the gate below pass. ${STACK.skills.all}`
      : `Gate round ${round}: the previous gate failed. Run \`${P} brief build\` and fix what made it fail. ${STACK.skills.all}`}
The gate — scripts only, no audit:
${FULL()}
Fix whatever it reports until all of it passes (a test you change must still check its criterion). Then \`${GIT_COMMIT} "app-factory: integration${round > 1 ? ` r${round}` : ''}"\`. Finish with \`${P} handoff build "<what you wired or fixed, gate result>"\`. Do NOT mark features passing.`,
    { label: round === 1 ? (PAR_BUILD ? 'integrate + gate' : 'gate') : `gate r${round}`, phase: 'Build', schema: BUILD, effort: 'high' },
  )
  log(`round ${round}: gate ${build && build.buildOk && build.testsOk ? 'passed' : 'FAILED'}${build ? ` — ${build.testSummary}` : ''}`)
  if (build && build.buildOk && build.testsOk) break
}
const gateOk = Boolean(build && build.buildOk && build.testsOk)

let explore = null
let senior = []
let finalAudit = null
let androidRan = true // set for real once the devices are known
let testRound = 0
let qaDone = false
let blocking = null
if (!gateOk) {
  log(`the gate did not pass in ${round} round(s) — testing skipped; escalate to a human with the open findings in .pipeline/PROGRESS.md`)
} else {
  // ───────────────────────────── Devices ─────────────────────────────
  phase('Explore')
  const dev = await agent(
    `${WHERE}
Get this run's test devices from the SHARED set every project on this computer uses (this run holds the machine-wide device lock): the platforms and form factors in CONTRACT.md's "Devices" section (if it has none: phones on ${STACK.own ? 'iOS and Android' : 'iOS'}). Use a device of the set if it exists; create it only if it does not. Never create a device named after the project, and never use, change or delete any device outside the set — the user has other simulators and emulators.
${IOS_HOST ? 'iOS' : 'iOS: none — this computer cannot run iOS simulators (they need macOS with Xcode): return "" for the iOS standard, small and large, and skip the rest of this paragraph. On a Mac:'} (runtime: the installed iOS runtime), the set's names: standard "app-factory-iphone-17" — the simulator \`${P} brief\` shows; small "app-factory-iphone-se" (device type iPhone SE (3rd generation): 375×667 points, home button — the smallest iPhone the installed runtime runs) and large "app-factory-iphone-17-pro-max" (iPhone 17 Pro Max: 440×956 points, the largest): the parallel test runners and senior QA use them, so the flow tests run on the smallest, a standard and the largest iPhone (build skill U15). Create no other iOS device: every other size, text size, locale and dark mode is covered by the layout tests (T3).
${STACK.own ? `Android, ${IOS_HOST ? 'only if CONTRACT.md includes Android' : 'always (this computer has no iOS simulator, so the app is tested on Android)'}: run \`export JAVA_HOME="${JAVA_HOME}"\` first (avdmanager needs it), then \`echo no | ${AVDMANAGER} create avd -n "af-standard" -k "${ANDROID_IMAGE}" -d medium_phone\` if "af-standard" does not exist (other sizes are covered by widget tests). Do not boot it now. Then \`${P} maestro-install\` — the Maestro copy the android-screen tools read Android screens with (once per computer, about 2 minutes the first time; it prints "is installed" after that). If it fails, log it with \`${P} log devices "<its output>"\` and go on: Android is then driven by \`adb\` alone.` : 'No Android in this stack.'}
Then measure the memory the parallel runners can use: ${IOS_HOST ? 'shut down every booted simulator named app-factory-…, then ' : ''}\`${P} freemem\` → freeMemoryMB (the number it prints).
Then the REAL phones connected right now: \`${P} devices real\`. phones.android = the first Android serial it lists (and its model in androidModel) when Android is tested in this run (CONTRACT.md's Devices section includes Android${IOS_HOST ? '' : ', or always on this computer'}), else "" — then \`${P} phone save <that serial>\` (its own settings — font size, dark mode, Wi-Fi, mobile data, rotation — are put back when the run releases the devices). phones.ios = ${IOS_HOST ? 'the udid of the first iOS device it lists whose type is "iPhone" (an "iPad" only when CONTRACT.md\'s Devices section has tablets) and whose developerMode is "enabled" (and its name in iosName), else "" — a connected iPhone with developer mode off: log it with \`' + P + ' log devices "<name>: turn on Settings › Privacy & Security › Developer Mode to test on it"\`' : '"" (iOS cannot be built on this computer)'}. A phone is used as found: never pair one, unlock one with a code, or change a setting the tests do not need. A phone is the user's — never reset, wipe, shut down or delete it.
Return the iOS udids (standard, small, large; "" for one that could not be made), phones, the Android emulator name ("" when Android is not in scope or it was not made), androidInScope = whether CONTRACT.md's Devices section includes Android (exactly what it says), and freeMemoryMB.`,
    { label: 'devices', phase: 'Explore', schema: DEVICES, effort: 'low' },
  )
  const IOS = dev ? dev.ios : { standard: contract.simulatorId || '', small: '', large: '' }
  const AND = STACK.own && dev ? dev.android : { standard: '' } // Android needs the Flutter stack
  const ANDROID_REQUIRED = Boolean(STACK.own && dev && (dev.androidInScope || !IOS_HOST))
  if (ANDROID_REQUIRED && !AND.standard && !(dev && dev.phones && dev.phones.android)) log('Android is in the contract but no Android phone is connected and no Android emulator could be set up — the Android pass cannot run, so this run will not finish as done')
  androidRan = !ANDROID_REQUIRED
  // Parallel iOS runners, each on its own simulator and in its own worktree. Three simulators at once ran fine on this
  // 8 GB Mac (Invoice Maker run); with builds on top it is not measured yet, so the count follows free memory.
  // ponytail: memory thresholds are a first guess — the run report shows how three runners behaved; adjust after it.
  const SIMS = [IOS.standard, IOS.small, IOS.large].filter(Boolean)
  const mem = dev ? dev.freeMemoryMB : 0
  // Real phones: a connected one runs its platform's device tests beside the simulators (in the same parallel batch).
  // A phone needs no simulator or emulator memory, but its build does run on this Mac: the simulator count leaves room for
  // it — Android: 4200 MB (an APK build peaked at 4,166 MB, measured here 2026-10-15); iPhone: 1200 MB (an xcodebuild test
  // run; estimated, from app-auditor-and-tester's cost table).
  const PH = (STACK.own && dev && dev.phones) || { android: '', ios: '', androidModel: '', iosName: '' }
  const APHONE = ANDROID_REQUIRED || AND.standard ? PH.android || '' : '' // only when Android is tested
  const IPHONE = IOS_HOST && STACK.own && ABS ? PH.ios || '' : ''
  const ANDROID_DEV = APHONE || AND.standard // the Android device: the phone when one is connected, else the emulator
  const reserve = (APHONE && SIMS.length ? 4200 : 0) + (IPHONE ? 1200 : 0)
  const free = mem - reserve
  const N = !STACK.own || !ABS ? 1 : Math.min(SIMS.length, free >= 3500 ? 3 : free >= 2000 ? 2 : 1)
  log(`devices — iOS runners: ${IPHONE ? `the iPhone ${PH.iosName || IPHONE} + ` : ''}${N} simulator(s) (free memory ${mem} MB${reserve ? `, ${reserve} MB kept for the phone build(s)` : ''}): ${SIMS.slice(0, N).join(', ')}; Android: ${APHONE ? `the phone ${PH.androidModel || ''} ${APHONE}, beside the simulators${AND.standard ? ` (emulator ${AND.standard} only if the phone cannot be used)` : ''}` : AND.standard || (ANDROID_REQUIRED ? 'IN THE CONTRACT BUT NOT SET UP' : 'not in scope')}`)
  const ON = {
    // a real phone: the user's own — never started, stopped, reset or wiped by the run
    iphone: (udid) => `the real iPhone ${PH.iosName || ''} (udid ${udid}), connected — the user's own: never boot, shut down, erase or reset it, and never a simctl command on it; flutter test signs and installs the app itself (the project's DEVELOPMENT_TEAM, set by flutter create). It must be unlocked: a run that fails because the iPhone is locked, disconnected, or "not trusted"/"Developer Mode" is not a problem of the app — run nothing more on it, file nothing, say "PHONE UNUSABLE: <the error line>" in your handoff and return testsRun 0 (its tests then run on a simulator).`,
    aphone: (serial) => `the real Android phone ${PH.androidModel || ''} (serial ${serial}), connected by cable — the user's own: never start, stop, reset or wipe it, and never an emulator command on it (its settings were saved with \`${P} phone save\` and are put back at release). First \`${ADB} -s ${serial} shell input keyevent KEYCODE_WAKEUP\` and \`${ADB} -s ${serial} shell dumpsys window | grep -o "isKeyguardShowing=[a-z]*"\`: true → swipe up once (\`${ADB} -s ${serial} shell input swipe 360 1400 360 300 200\`) and check again (a locked phone stops every test: no frames are drawn behind the lock screen). Still locked (a code), disconnected (\`${ADB} -s ${serial} get-state\` is not "device") or "unauthorized" → not a problem of the app: run nothing on it, file nothing, say "PHONE UNUSABLE: <why>" in your handoff and return testsRun 0 (a test runner) or no scenarios (senior QA) — the emulator then takes over. After your last Android build or test run: \`cd android && ./gradlew --stop; cd ..\` (its daemons hold about 3.7 GB of this computer's memory while idle).`,
    ios: (udid) => `iOS simulator ${udid}: \`xcrun simctl boot ${udid}\` (ignore "already booted"), make it visible (\`open -a Simulator --args -CurrentDeviceUDID ${udid}\`).`,
    android: (avd) => `Android emulator ${avd}. Before starting it, make room — never touching a device whose name does not start with "app-factory-" or "af-" (those are the user's): (1) memory: ${IOS_HOST ? 'shut down every booted simulator named app-factory-… (\`xcrun simctl list devices booted\`, then \`xcrun simctl shutdown <udid>\`) and ' : ''}stop any running emulator whose AVD name starts with af- (\`${ADB} devices\`, \`${ADB} -s <serial> emu avd name\`, \`${ADB} -s <serial> emu kill\`). This frees memory only: never delete a simulator, an emulator or their files. Then \`${P} freemem --need 2500\` — on Linux and Windows it fails when less memory is available than the emulator needs: start nothing then, and file a critical finding with its output (an emulator started into a full machine can freeze it); (2) disk — check only: \`${P} freedisk\` must print at least 6 (GB free); if not, delete nothing — file a critical finding "not enough disk for the Android emulator: <its output> GB free". Start it with \`"${ANDROID_SDK}/emulator/emulator" -avd ${avd} -no-snapshot-save -no-audio &\` — the ONE command allowed to keep running, because the emulator is a window like the Simulator app — then wait until \`${ADB} -s <serial> shell getprop sys.boot_completed\` prints 1 (23–28 s measured here; give up after 300 s), then \`${ADB} -s <serial> shell settings put secure stylus_handwriting_enabled 0\` (typed text otherwise opens Android's "Try out your stylus" sheet over the app), then \`${P} settle <serial>\` — it returns when the just-booted emulator's CPU is idle (at most 180 s; used before that, the emulator misses Android's 5 s input deadline and shows "isn't responding" dialogs). If it does not boot: stop it, make room again, start it once more; if it still does not boot, file a critical finding "Android emulator ${avd} did not boot: <last lines of its output>" and run no Android test — never report an Android test as passed without running it. Stop the emulator before you finish.`,
  }

  const onAndroid = (d) => (d === APHONE ? ON.aphone(d) : ON.android(d))
  const serialOf = (d) => (d === APHONE ? d : '<emulator serial>')
  // ───────────────────────────── Explore ─────────────────────────────
  // Android, the same way on every device step without an iOS simulator: a fresh debug install, launched by its id
  const ANDROID_INSTALL = `\`${ADB} -s <serial> uninstall <applicationId>\` (ignore "not installed"), \`"${FLUTTER}" build apk --debug ${DEFINE}\`, \`${ADB} -s <serial> install -r build/app/outputs/flutter-apk/app-debug.apk\`, launch with \`${ADB} -s <serial> shell 'am start -n $(cmd package resolve-activity --brief -c android.intent.category.LAUNCHER <applicationId> | tail -n 1)'\` (applicationId: android/app/build.gradle.kts).`
  if (!IOS.standard && !ANDROID_DEV) log('no test device at all (no iOS simulator, no Android phone or emulator) — exploring and device testing cannot run')
  explore = !IOS.standard && !ANDROID_DEV ? null : await asTester(
    `${WHERE}
Explore the app once, before testing — by plan, not by trial. ${HAS_DESIGN ? 'First, in ONE turn, read design/ROUTE.md (every screen in the order the design\'s buttons reach it, the taps that get there, each button with the screen it must open) and CONTRACT.md sections 1 (Screens) and 6 (User flows); follow ROUTE.md screen by screen.' : 'First, in ONE turn, read CONTRACT.md sections 1 (Screens) and 6 (User flows); visit the screens in the order the flows reach them.'} Do not read PRD.md whole — search it only for a detail the contract lacks. Read "${QA}" sections 0 and 2 and follow section 2 exactly, on the ${IOS.standard ? `${ON.ios(IOS.standard)} Fresh install: ${STACK.install.replace(/<udid>/g, IOS.standard)}` : `${onAndroid(ANDROID_DEV)} Fresh install: ${ANDROID_INSTALL}`} After each launch \`${P} wait-app <udid|serial> --platform ${IOS.standard ? 'ios' : 'android'} --app <id>\` (never a fixed pause). ${IOS.standard ? 'Drive it with the mobile-mcp tools (ToolSearch, mobile_*; on "Agent is not installed on the device" run \`npx -y mobilecli agent install --device <udid>\` once; typed text after \`--\`): find elements with mobile_list_elements_on_screen and tap them' : `Drive it with the android-screen tool read_screen <serial> (ToolSearch "read_screen") and adb: tap an element at its at= with \`${ADB} -s <serial> shell input tap <x> <y>\`, back with \`input keyevent KEYCODE_BACK\`, text with \`input text\` (spaces as %s) — never mobile-mcp on Android`}, and take a screenshot only to file a finding. After each screen read the app's log as QA section 2 says. Do not write a file: return every screen and every flow you saw, and file the "not in CONTRACT.md" and "in CONTRACT.md but not found" items as findings (${ROUTE}). Finish with \`${P} handoff explore "<screens, flows, mismatches>"\`.`,
    { label: 'explore', phase: 'Explore', schema: EXPLORE },
  )

  // ───────────────────────────── Test rounds ─────────────────────────────
  const runnerPrompt = (r, k, ctx) => `${where(ctx.dir, P)}
PRD.md, CONTRACT.md and DECISIONS.md: read them in ${ABS} (PRD.md may be git-ignored, so not in this checkout).
Test round ${r}, ${ctx.platform === 'ios' ? `iOS runner ${k}` : 'Android runner'}. ${ctx.dir !== ABS ? `This directory is a git worktree of ${ABS} on branch ${ctx.branch}; ${ctx.platform === 'ios' ? 'the other runners work in their own worktrees on their own simulators at the same time' : 'fixers change the main checkout while you run — you test this snapshot'}. ` : ''}Read "${QA}" sections 0, 4 and 6 (running and resolving), and section 7 if you have screens to compare.
${ctx.platform === 'ios' ? (ctx.device === IPHONE ? `Your device: ${ON.iphone(ctx.device)}` : `Your simulator: ${ON.ios(ctx.device)}`) : `Your device: ${onAndroid(ctx.device)}`}
STUCK RUN — check, then restart the app, then the device: when a test command outlasts the Bash limit and you wait on its log, run \`${P} stale "<the log>" --device ${ctx.platform === 'ios' ? ctx.device : ctx.device === APHONE ? ctx.device : '<serial>'} --platform ${ctx.platform} --app ${ctx.platform === 'ios' ? (ctx.app || '<bundle id>') : '<applicationId from android/app/build.gradle.kts>'}\` at each check instead of only reading it. "running" → keep waiting. "stalled" (no new line for 10 min, the app gone while a test runs, or the device down) → (1) \`${P} app-restart <device> --platform ${ctx.platform} --app <id>\` and re-run only the file it was on, once; (2) stalled again → \`${P} device-reset <device> --platform ${ctx.platform} --app <id>\` (shuts it down — its memory freed — wipes its data, boots it; only the plugin's own devices) and re-run that file once${ctx.platform === 'android' ? ', with the serial the reset prints' : ''}; (3) stalled a third time → a major finding "hang in <test>" with the log's last lines, and go on with the next files. Never wait on a stalled run, never reset any other device.
${ctx.platform === 'android' ? `LAUNCH CHECK FIRST: run, alone, the flow test of CONTRACT.md's first user flow (the same command with --plain-name "<its test name>"). If the app crashed or never started — the app process gone, "Lost connection to device", a native exception (FATAL EXCEPTION, StackOverflowError, NullPointerException) in the log — file ONE critical finding with those log lines and stop here: every other test would fail the same way (v4 round 1: one crash on opening the Street View tab failed all 19 tests in a 41-minute run). Otherwise run the rest.
` : ''}Your tests: ${ctx.files.length ? ctx.files.join(', ') : 'none'}. Run them, one command for all of them: ${STACK.flow(ctx.files.join(' '), ctx.platform === 'ios' ? ctx.device : serialOf(ctx.device), ctx.name, ctx.platform)}. ${ctx.name ? `Only the tests whose name matches ${ctx.name} run: the criteria whose code changed since the last round — a test that passed before and whose code did not change is never run again. ` : ''}Then re-run only the failing tests, by name.${ctx.platform === 'ios' ? ` Your ${ctx.device === IPHONE ? `device is a real ${PH.iosName || 'iPhone'}` : `simulator is ${ctx.device === IOS.small ? 'the iPhone SE (375×667, the smallest)' : ctx.device === IOS.large ? 'the iPhone 17 Pro Max (440×956, the largest)' : 'the iPhone 17'}`}: a test that fails because an element is off the screen, under a bar or the keyboard, squeezed or cut off — and \`tester.ensureVisible\` does not bring it into view — is a layout defect of the app (build skill U15): file it @ui with the screen, the element and this device; never change the test to tap a position.` : ''}
For each failing test, find out why (read the test and the code, never guess):
- the test does not match CONTRACT.md (wrong key, wrong expectation, a timing it does not wait for) → fix the test, in your files only (integration_test/);
- the app does not match CONTRACT.md → file it (QA section 4: the test name, Expected quoted from the contract, Observed from the failure, Device). ${SEVERITY} ${ROUTE}
- a platform API that does not exist, or behaviour that CONTRACT.md's "Missing keys" section says needs the real key → \`${P} finding block\` / \`${P} feature <ACn> blocked\` (QA section 6) — never retry it. A feature with a missing key is NOT blocked: it is tested in its free or not-available behaviour, and a failure there is a normal finding.
Resolve every open finding whose test now passes (QA section 6): \`${P} finding resolve <Xn> "<test name> passes on ${ctx.platform}"\`.
${ctx.screens && ctx.screens.length ? `LAST, after the tests: compare these designed screens with the Figma reference, as QA section 7 says (mobile-mcp; elements by mobile_list_elements_on_screen, one screenshot per screen): ${ctx.screens.join(', ')}.
` : ''}${STACK.own ? `Before finishing: \`${P} scope <base> integration_test/** dart_test.yaml ${BUILD_NOISE.join(' ')}\` (base = \`git rev-parse HEAD\` when you started) must print "in scope"; then \`${GIT_COMMIT} "qa r${r} ${ctx.platform} ${k}"\`. ` : ''}Finish with \`${P} handoff test-${ctx.platform}${ctx.platform === 'ios' ? `-${k}` : ''} "<tests run, passed, failed, tests fixed, filed, blocked, resolved>"\`. ${STATUS_LAST}`

  const setupRound = (r, prevBase, n, sims = SIMS.slice(0, n), phoneBeside = false) => agent(
    `${WHERE}
Prepare test round ${r}: ${n ? `${n} iOS runner(s), each in its own git worktree on its own device (${n > sims.length ? `the real iPhone ${IPHONE} and ` : ''}simulator(s) ${sims.join(', ')}), at the same time${phoneBeside ? `, and the Android runner on the real phone ${APHONE} at the same time as them` : ''}` : 'no iOS runner (this computer has no iOS simulator) — the Android runner tests every flow'}.
1. \`${GIT_COMMIT} "qa r${r} start"\` in ${ABS}; base = \`git rev-parse HEAD\`.
2. Which tests: ${prevBase ? `per platform, since that platform's last run — \`${P} affected --platform ios\` → name (its "name": the --name filter; "" = every test) and runIos = name is not null${ANDROID_DEV ? `; \`${P} affected --platform android\` → androidName and runAndroid the same way` : ''}. A platform whose "name" is null has nothing to re-run this round. If neither has anything, return runTests=false and stop here.` : `round 1 runs every flow test on every platform: name = "", androidName = "", runIos = true, runAndroid = ${Boolean(ANDROID_DEV)}.`} ${n ? `Then \`${P} shard ${n}\` → shards (one list of test files per runner).
3. For k = 1..${n}: remove any leftover worktree and branch (\`git worktree remove --force "${ABS}.worktrees/r<k>"\`, \`git branch -D qa-r${r}-<k>\`, ignore errors), then \`git worktree add "${ABS}.worktrees/r<k>" -b qa-r${r}-<k>\` and clone the build caches into it so its first build is incremental (measured here: 51 s → 33 s): \`for d in .dart_tool build ios/Pods; do [ -e "${ABS}/$d" ] && ${CP_CLONE} "${ABS}/$d" "${ABS}.worktrees/r<k>/$d"; done\`; then, in it, \`"${FLUTTER}" pub get\` (it writes the plugin registrant files git ignores — without them the build fails) and \`${P} secret native\` (writes any native SDK key into its git-ignored files).
${phoneBeside ? `3b. The Android runner's snapshot as well: remove a leftover one (\`git worktree remove --force "${ABS}.worktrees/android"\`, \`git branch -D qa-r${r}-android\`, ignore errors), then \`git worktree add "${ABS}.worktrees/android" -b qa-r${r}-android\`, clone the build caches into it (\`for d in .dart_tool build; do [ -e "${ABS}/$d" ] && ${CP_CLONE} "${ABS}/$d" "${ABS}.worktrees/android/$d"; done\`), then in it \`"${FLUTTER}" pub get\` and \`${P} secret native\`.
` : ''}4. Boot the simulators ${sims.join(', ')} (\`xcrun simctl boot <udid>\`, ignore "already booted") and open them${n > sims.length ? ` — never the real iPhone ${IPHONE}` : ''} (\`open -a Simulator --args -CurrentDeviceUDID <udid>\`)${HAS_DESIGN && r === 1 ? '; run \`npx -y mobilecli agent install --device <udid>\` for each (the design comparison drives them with mobile-mcp)' : ''}.` : `shards = [].
3. The Android runner's snapshot: remove a leftover one (\`git worktree remove --force "${ABS}.worktrees/android"\`, \`git branch -D qa-r${r}-android\`, ignore errors), then \`git worktree add "${ABS}.worktrees/android" -b qa-r${r}-android\`, clone the build caches into it (\`for d in .dart_tool build; do [ -e "${ABS}/$d" ] && ${CP_CLONE} "${ABS}/$d" "${ABS}.worktrees/android/$d"; done\`), then in it \`"${FLUTTER}" pub get\` and \`${P} secret native\`.
4. Nothing to boot here.`}
Return base, bundleId (PRODUCT_BUNDLE_IDENTIFIER in ios/Runner.xcodeproj/project.pbxproj), shards, name and runTests=true.`,
    { label: `test setup r${r}`, phase: 'Test', schema: ROUND_SETUP, effort: 'low' },
  )
  const merge = (r, branches, then = '') => agent(
    `${WHERE}
Merge test round ${r} into ${ABS}. Base: the "qa r${r} start" commit. For each branch: \`${P} scope <base>..<branch> integration_test/** dart_test.yaml ${BUILD_NOISE.join(' ')}\` — in scope → \`git merge --no-ff -q -m "merge <branch>" <branch>\`; out of scope or a conflict → do not merge it (\`git merge --abort\` if needed) and file \`${P} finding add - major @shared "<branch> not merged: <scope or conflict output>"\`. Branches: ${branches.join(', ')}. Then remove their worktrees (\`git worktree remove --force <dir>\`) and delete the merged branches. ${then}Then \`${P} handoff merge "<merged, rejected>"\`. ${STATUS_LAST}`,
    { label: `merge r${r}`, phase: 'Test', schema: MERGE, effort: 'low' },
  )

  let prevBase = null
  while (testRound < MAX_TEST_ROUNDS) {
    testRound++
    phase('Test')
    let counts = null
    if (STACK.own && ABS) {
      const IOS_DEVS = [IPHONE, ...SIMS.slice(0, N)].filter(Boolean) // a connected iPhone takes one share of the tests
      const PHONE_BESIDE = Boolean(APHONE && IOS_DEVS.length) // the Android phone runs in the same batch as the iOS runners
      const setup = await setupRound(testRound, prevBase, IOS_DEVS.length, SIMS.slice(0, N), PHONE_BESIDE)
      if (!setup || !setup.base) { log('test setup failed — stopping the test phase; see .pipeline/PROGRESS.md'); break }
      if (!setup.runTests) { log(`test round ${testRound}: no code changed since round ${testRound - 1} — nothing to re-run; ${blocking ?? '?'} blocking finding(s) stay open`); break }
      const runIos = setup.runIos !== false, runAndroid = setup.runAndroid !== false
      log(`test round ${testRound}: iOS ${runIos ? (setup.name ? `re-runs ${(setup.name.match(/AC\d+/g) || []).length} criteria` : 'runs every test') : 'has nothing to re-run'}; Android ${!ANDROID_DEV ? 'not in scope' : runAndroid ? (setup.androidName ? `re-runs ${(setup.androidName.match(/AC\d+/g) || []).length} criteria` : 'runs every test') : 'has nothing to re-run'}`)
      prevBase = setup.base
      // iOS: one runner per device at once — a connected iPhone first, then the simulators — each with its own worktree
      // (none without a Mac); with a connected Android phone, its runner joins the same batch
      const shards = IOS_DEVS.length && runIos ? (setup.shards || []).slice(0, IOS_DEVS.length) : []
      const andRun = (device, then = '') => asTester(runnerPrompt(testRound, 'android', { platform: 'android', dir: `${ABS}.worktrees/android`, branch: `qa-r${testRound}-android`, device, files: ['integration_test/'], name: (setup.androidName ?? setup.name) || '' }) + then,
        { label: `test r${testRound} Android runner${device === APHONE ? ' (phone)' : ''}`, phase: 'Test', schema: RUNNER })
      // a phone that could not be used ran nothing (ON.aphone / ON.iphone): its runner reports 0 tests run
      const unusable = (x) => !x || x.testsRun === 0
      const besideNow = PHONE_BESIDE && runAndroid && shards.length > 0
      const batch = await parallel([
        ...shards.map((files, i) => () => asTester(
          runnerPrompt(testRound, i + 1, { platform: 'ios', dir: `${ABS}.worktrees/r${i + 1}`, branch: `qa-r${testRound}-${i + 1}`, device: IOS_DEVS[i], app: setup.bundleId, files, name: setup.name || '',
            screens: null }), // the design check runs once, at the end of testing (final audit, QA section 7)
          { label: `test r${testRound} iOS runner ${i + 1}${IOS_DEVS[i] === IPHONE ? ' (iPhone)' : ''}`, phase: 'Test', schema: RUNNER },
        )),
        ...(besideNow ? [() => andRun(APHONE)] : []),
      ])
      const ios = batch.slice(0, shards.length)
      // the iPhone could not be used (locked, unplugged, not trusted): its share runs on the iPhone 17 simulator now that it is free
      for (let i = 0; i < shards.length; i++) {
        if (IOS_DEVS[i] !== IPHONE || !unusable(ios[i]) || !shards[i].length) continue
        log(`round ${testRound}: the iPhone could not be used — its ${shards[i].length} test file(s) run on the simulator ${SIMS[0]} instead`)
        ios[i] = await asTester(runnerPrompt(testRound, i + 1, { platform: 'ios', dir: `${ABS}.worktrees/r${i + 1}`, branch: `qa-r${testRound}-${i + 1}`, device: SIMS[0], app: setup.bundleId, files: shards[i], name: setup.name || '', screens: null }),
          { label: `test r${testRound} iOS runner ${i + 1} (iPhone fallback)`, phase: 'Test', schema: RUNNER })
      }
      ios.forEach((x, i) => log(`round ${testRound} iOS runner ${i + 1}: ${x ? `${x.testsRun} tests, ${x.failed} failed, tests fixed ${x.testsFixed.length}, filed ${x.filed.length}, blocked ${x.blocked.length}, resolved ${x.resolved.length}` : 'NO RESULT — its tests are untested'}`))
      let anBeside = besideNow ? batch[shards.length] : null
      if (besideNow) {
        log(`round ${testRound} Android runner (phone ${APHONE}): ${anBeside && !unusable(anBeside) ? `${anBeside.testsRun} tests, ${anBeside.failed} failed, filed ${anBeside.filed.length}, blocked ${anBeside.blocked.length}` : 'the phone could not be used'}`)
        if (anBeside && anBeside.testsRun > 0) androidRan = true
        if (unusable(anBeside)) anBeside = null // the emulator takes over below, after the iOS merge
        else counts = await merge(testRound, [...shards.map((_, i) => `qa-r${testRound}-${i + 1}`), `qa-r${testRound}-android`])
      }
      if (shards.length && !(besideNow && anBeside)) counts = await merge(testRound, shards.map((_, i) => `qa-r${testRound}-${i + 1}`), ANDROID_DEV && runAndroid && !anBeside
        ? `Then prepare the Android runner's snapshot: \`git worktree add "${ABS}.worktrees/android" -b qa-r${testRound}-android\` (remove a leftover one first) and clone the build caches into it as above (.dart_tool build), then run \`"${FLUTTER}" pub get\` and \`${P} secret native\` in it. `
        : '')
      // Android after the iOS runners (the emulator does not fit beside the simulators; or the phone could not be used):
      // its runner on its snapshot, while the fixers fix the iOS findings in the main checkout (they need no device)
      const lateAndroid = besideNow ? (anBeside ? '' : AND.standard) : ANDROID_DEV
      if (besideNow && anBeside) {
        counts = await fixers('Test', testRound, counts) // iOS and Android findings together
      } else if (lateAndroid && runAndroid) {
        let [an, fx] = await parallel([
          () => andRun(lateAndroid),
          () => (shards.length ? fixers('Test', testRound, counts) : null), // without iOS runners there is nothing to fix yet
        ])
        if (lateAndroid === APHONE && unusable(an) && AND.standard) {
          log(`round ${testRound}: the Android phone could not be used — the emulator ${AND.standard} runs the Android tests`)
          an = await andRun(AND.standard)
        }
        log(`round ${testRound} Android runner: ${an ? `${an.testsRun} tests, ${an.failed} failed, filed ${an.filed.length}, blocked ${an.blocked.length}` : 'NO RESULT'}`)
        if (an && an.testsRun > 0) androidRan = true
        counts = await merge(testRound, [`qa-r${testRound}-android`])
        counts = await fixers('Test', testRound, counts) // the Android findings
      } else {
        counts = await fixers('Test', testRound, counts)
      }
    } else {
      // native iOS stack: one runner in the project, findings only; one fixer
      const one = await asTester(runnerPrompt(testRound, 1, { platform: 'ios', dir: ABS || '.', device: IOS.standard, files: ['the UI test target'], name: '' }), { label: `test r${testRound} iOS`, phase: 'Test', schema: RUNNER })
      counts = await fixers('Test', testRound, one)
    }
    blocking = counts ? counts.blocking : null
    log(`test round ${testRound}: ${blocking ?? '?'} blocking finding(s) open`)
    if (blocking !== 0) continue

    if (!qaDone) {
      // ───────────────────────────── Senior QA: real-user journeys, split across the iOS simulators ─────────────────────────────
      phase('Senior QA')
      const qs = !SIMS.length ? null : await agent(
        `${WHERE}
Prepare senior QA: \`"${FLUTTER}" build ios --simulator --debug ${DEFINE}\` once in ${ABS}; boot ${SIMS.slice(0, N).join(', ')}, open them, and on each: uninstall the app (ignore "not installed"), install build/ios/iphonesimulator/Runner.app, and run \`npx -y mobilecli agent install --device <udid>\`.${APHONE ? ` Then the Android phone ${APHONE} (its tester works at the same time as the simulators'): \`"${FLUTTER}" build apk --debug ${DEFINE}\` once, then \`cd android && ./gradlew --stop; cd ..\` (the build's daemons hold about 3.7 GB while idle), then \`${ADB} -s ${APHONE} uninstall <applicationId>\` (ignore "not installed") and \`${ADB} -s ${APHONE} install -r build/app/outputs/flutter-apk/app-debug.apk\` (applicationId: android/app/build.gradle.kts).` : ''} Return appPath and bundleId.`,
        { label: 'senior QA setup', phase: 'Senior QA', schema: QA_SETUP, effort: 'low' },
      )
      // app-qa section 8: scenarios 1–9 on iOS (10, no connection, is Android's), split over the simulators — 6 (this
      // screen size) on every one; scenario 3 writes a test, the others are by hand
      const plan = !N ? [] : N >= 3 ? [[1, 2, 6, 7], [4, 5, 6, 8], [3, 6, 9]] : N === 2 ? [[1, 2, 5, 6, 7], [3, 4, 6, 8, 9]] : [[1, 2, 3, 4, 5, 6, 7, 8, 9]]
      const qaKey = (udid) => (udid === IOS.small ? 'ios-se' : udid === IOS.large ? 'ios-pro-max' : 'ios-17')
      const QA_ANDROID = (dev, beside) => asTester(
          `${WHERE}
You are the senior QA tester on Android${beside ? ', at the same time as the iOS testers on their simulators' : plan.length ? ', after the iOS testers' : ' — the only one (this computer has no iOS simulator)'}: ${onAndroid(dev)} Fresh install: ${dev === APHONE && beside ? `\`${ADB} -s ${dev} uninstall <applicationId>\` (ignore "not installed"), \`${ADB} -s ${dev} install -r build/app/outputs/flutter-apk/app-debug.apk\` (built for you — never build it again here), launch with \`${ADB} -s ${dev} shell 'am start -n $(cmd package resolve-activity --brief -c android.intent.category.LAUNCHER <applicationId> | tail -n 1)'\`.` : ANDROID_INSTALL} Read "${QA}" sections 0, 4 and 8 and run ${plan.length ? "the scenarios where Android differs: 1 (first use), 5 (navigation — with Android's system back button and back gesture), 6 (only its font scale 2.0 part), 7, 8, 9 and 10 (no connection)" : `all ten scenarios of section 8, in order (5 with Android's system back button and back gesture; 6 at font scale 2.0; scenario 3 writes integration_test/volume_test.dart — run it on the ${dev === APHONE ? 'phone' : 'emulator'} with the flow-test command and commit only that file: \`${COMMIT_OWN('integration_test/volume_test.dart', 'app-factory: tests senior-qa')}\`)`}; your device in \`${P} scenario list|done\` is android — first list what is done and skip it, record each scenario when it is done. After every launch or reopen \`${P} wait-app ${dev === APHONE ? dev : '<serial>'} --platform android --app <applicationId>\`. Drive the app with the android-screen tool read_screen ${dev === APHONE ? dev : '<serial>'} (ToolSearch "read_screen") and \`${ADB} -s ${dev === APHONE ? dev : '<serial>'} shell input tap <x> <y>\` at an element's at= — never mobile-mcp on Android; an "isn't responding" or "has stopped" dialog is answered by \`${P} probe\`, never by your tap (QA E10). File only what breaks a source; you do not fix app code. ${SEVERITY} ${ROUTE} Finish with \`${P} handoff senior-qa-android "<scenarios, filed>"\`. ${STATUS_LAST}`,
          { label: `senior QA Android${dev === APHONE ? ' (phone)' : ''}`, phase: 'Senior QA', schema: QA_RESULT, effort: 'high' },
        )
      const qaBeside = Boolean(APHONE && plan.length)
      const unusableQa = (x) => !x || !(x.scenarios || []).length // a phone that could not be used: no scenario done
      senior = await parallel([...plan.map((sc, i) => () => asTester(
        `${WHERE}
You are senior QA tester ${i + 1} of ${plan.length}, working at the same time as the others on your own simulator: ${ON.ios(SIMS[i])} The app is already installed (${qs ? qs.bundleId : 'bundle id in ios/Runner.xcodeproj/project.pbxproj'}). Read PRD.md and CONTRACT.md as your knowledge of what the app must do, then "${QA}" sections 0, 4 and 8. Run scenario(s) ${sc.join(', ')} of section 8, in order, at a user's pace${sc.includes(3) ? ' (scenario 3 writes integration_test/volume_test.dart — run it on your simulator with the flow-test command; you may edit only that file)' : ''}; your device in \`${P} scenario list|done\` is ${qaKey(SIMS[i])} — first list what is done and skip it, record each scenario when it is done. After every launch or reopen \`${P} wait-app ${SIMS[i]} --platform ios --app <bundle id>\`. Drive the app with the mobile-mcp tools as the user would: find elements with mobile_list_elements_on_screen and tap them; take a screenshot when you file a finding or finish a scenario, not after every tap. File only what breaks a source; you do not fix app code. ${SEVERITY} ${ROUTE}
${sc.includes(3) ? `Commit your test: \`${COMMIT_OWN('integration_test/volume_test.dart', 'app-factory: tests senior-qa')}\`. ` : ''}Finish with \`${P} handoff senior-qa-${i + 1} "<scenarios, filed>"\`. ${STATUS_LAST}`,
        { label: `senior QA ${i + 1}`, phase: 'Senior QA', schema: QA_RESULT, effort: 'high' },
      )), ...(qaBeside ? [() => QA_ANDROID(APHONE, true)] : [])])
      let androidQa = qaBeside ? senior.pop() : null
      if (qaBeside && unusableQa(androidQa)) { log('senior QA: the Android phone could not be used — the Android tester runs on the emulator after the iOS testers'); androidQa = null }
      let last = senior.filter(Boolean).pop() || null
      if (androidQa) last = androidQa
      else if (ANDROID_DEV && (!qaBeside || AND.standard)) {
        let aq = await QA_ANDROID(qaBeside ? AND.standard : ANDROID_DEV, false)
        if (!qaBeside && ANDROID_DEV === APHONE && unusableQa(aq) && AND.standard) { log('senior QA: the Android phone could not be used — the emulator takes over'); aq = await QA_ANDROID(AND.standard, false) }
        last = aq || last
      }
      qaDone = true
      senior.forEach((x, i) => log(`senior QA ${i + 1}: ${x ? `scenarios ${x.scenarios.join(', ')}, filed ${x.filed.length}` : 'no result'}`))
      blocking = last ? last.blocking : null
      if (blocking !== 0 && blocking !== null) {
        const fx = await fixers('Test', testRound, last)
        blocking = fx ? fx.blocking : blocking
        log(`senior QA: fixes made — the next test round re-runs only the affected tests`)
        continue
      }
    }
    break
  }

  // ───────────────────────────── Final: one audit at the end that fixes, with the optimisation ─────────────────────────────
  phase('Final')
  const OPTIMISE_NOW = Boolean(STACK.own && qaDone && blocking === 0) // only a finished, passing app is optimised
  finalAudit = await agent(
    `${WHERE}
FINAL AUDIT — the last step, done once. There was no audit after the build, so this is where weak tests, broken code rules and anything missing are caught — and FIXED, not only filed. You are a skeptical senior developer. Read "${QA}" sections 0, 1, 5 and 6, then in this order:
1. Take \`git rev-parse HEAD\` as base. \`${P} coverage\` must pass (blocked criteria are excluded).
1b. DESIGN CHECK, forced (section 7, in full): for every screen \`${P} references\` lists — ${IOS_HOST ? `on a simulator of the frame's size (\`${P} design-device <W> <H>\`), status bar set to 9:41 and full` : `on an Android emulator of the frame's size (no iOS simulator on this computer): \`${P} design-device <W> <H>\` prints its AVD name and three config.ini values — create it once (\`echo no | ${AVDMANAGER} create avd -n <name> -k "${ANDROID_IMAGE}" -d medium_phone\`), set those keys in ~/.android/avd/<name>.avd/config.ini, start it as the Android steps say; screenshot with \`${ADB} -s <serial> exec-out screencap -p > <file>\`; the frame's status bar and home indicator are iOS's, so mask the emulator's status bar and navigation bar (their height in points: pixels ÷ 3)`} — screenshot, \`node "${ROOT}/scripts/screen-diff.mjs"\`, every region looked at; the component inventory — \`node "${ROOT}/scripts/design-components.mjs" extract\` (or the PRD mockup's components listed by you), \`${P} components\`, the app's element list matched with \`design-components.mjs match\`, every remaining component decided present / missing / excluded and recorded with \`${P} component-results\`, none left unchecked; every bar and button checked against the frame; \`${P} design-result\` recorded; and every FLOWS.md transition checked in the code, as a table in your handoff. Every defect is a DESIGN finding that you fix in step 4 and re-check on that screen only. ${IOS_HOST ? 'Shut the design simulators down' : 'Stop the design emulator'} when done.
2. Weak tests (section 1, F1): one break-it probe per piece of code a criterion depends on; a test that still passes with the code broken is rewritten until it fails, then the code restored.
3. Code rules (F2): ${STACK.skills.audit} Fix each break.
4. Missing (F3): every criterion that is not blocked is implemented and reachable on screen; implement what is missing, with its unit/widget tests and, for a flow, its flow test. Assets (F3, build skill U0, U13, U14): \`${P} assets\` must pass; every image and icon PRD.md or design/ASSETS.md gives is used where it says, from that file, at its stated size in points, with its placement test — fix each one that is not.
5. Traceability (F4): delete code no criterion, field, approved proposal or skill rule accounts for, with its tests; log each removal.
Every change in steps 2–5 follows section 5: a test that fails before the change and passes after it.
${OPTIMISE_NOW ? `6. Optimise (section 1, F5): make the code smaller and simpler as a senior developer would — and change NOTHING the user or the logic can tell apart. Read "${SKILL}" rules L2, L10, L11 and S5.
` : ''}${OPTIMISE_NOW ? '7' : '6'}. Your changes on the devices — only the affected tests, never the whole suite: \`${P} affected <base>\`; if its "name" is not null, run those flow tests ${IOS.standard ? `on ${IOS.standard} (${STACK.flow('integration_test/', IOS.standard, '<name>', 'ios')})` : ''}${ANDROID_DEV ? `${IOS.standard ? ', then ' : ''}on Android (${onAndroid(ANDROID_DEV)}${APHONE && AND.standard ? ` — if the phone cannot be used, the emulator: ${ON.android(AND.standard)}` : ''} — ${STACK.flow('integration_test/', serialOf(ANDROID_DEV), '<name>', 'android')})` : ''}. Fix what fails.
${OPTIMISE_NOW ? '8' : '7'}. The gate once: ${FULL()}
${OPTIMISE_NOW ? '9' : '8'}. Statuses: \`${P} feature <ACn> passing\` when its tests pass and no critical or major finding on it is open, otherwise \`failing\`; blocked ones stay blocked. Size (F5 step 1 and 7): record it with \`${P} report size "<before → after, per package>"\`.
verdict = pass only if the gate passes, coverage passes, \`${P} design-check\` passes and no critical or major finding is open. ${SEVERITY} ${ROUTE}
Commit with \`${GIT_COMMIT} "final audit"\` and \`${P} handoff final "<fixed, removed${OPTIMISE_NOW ? ', size before → after, lines before → after, packages removed, steps undone' : ''}, verdict>"\`. Return what you fixed and removed${OPTIMISE_NOW ? ', and the optimisation numbers' : ''}. ${STATUS_LAST}`,
    { label: OPTIMISE_NOW ? 'final audit + fix + optimise' : 'final audit + fix', phase: 'Final', schema: FINAL, effort: 'high' },
  )
  if (finalAudit && OPTIMISE_NOW) log(`optimise: ${finalAudit.sizeBefore || '?'} → ${finalAudit.sizeAfter || '?'}, lib/ lines ${finalAudit.linesBefore ?? '?'} → ${finalAudit.linesAfter ?? '?'}, packages removed: ${(finalAudit.packagesRemoved || []).join(', ') || 'none'}`)
  if (finalAudit) log(`final audit: ${finalAudit.verdict}, fixed ${finalAudit.fixed.length}, removed ${finalAudit.removed.length}`)
  blocking = finalAudit ? finalAudit.blocking : null
}

// The final audit's two end checks, re-run by a separate agent from the scripts: the run is not done on the auditor's word.
let finalChecks = null
if (finalAudit) {
  finalChecks = await agent(
    `${WHERE}
Run these ${STACK.own ? 'four' : 'three'} commands exactly, and nothing else: \`${P} design-check\`, \`${P} assets\`${STACK.own ? `, \`${P} secret scan\` and \`node "${ROOT}/scripts/release-check.mjs" .\`` : ` and \`${P} secret scan\``}. Return designOk = whether design-check exited 0, assetsOk = whether assets exited 0, secretsOk = whether secret scan exited 0, ${STACK.own ? 'releaseOk = whether release-check exited 0, ' : 'releaseOk = true, '}and output = the lines each printed. Do not fix anything.`,
    { label: 'final checks', phase: 'Final', effort: 'low', schema: obj(['designOk', 'assetsOk', 'secretsOk', 'releaseOk', 'output'], { designOk: bool, assetsOk: bool, secretsOk: bool, releaseOk: bool, output: str }) },
  )
  log(`final checks: design ${finalChecks && finalChecks.designOk ? 'ok' : 'NOT OK'}, assets ${finalChecks && finalChecks.assetsOk ? 'ok' : 'NOT OK'}, no key in any file ${finalChecks && finalChecks.secretsOk ? 'ok' : 'NOT OK'}${STACK.own ? `, release check ${finalChecks && finalChecks.releaseOk ? 'ok' : 'NOT OK'}` : ''}`)
  if (finalChecks && !(finalChecks.designOk && finalChecks.assetsOk && finalChecks.secretsOk && finalChecks.releaseOk)) log(`not done: ${finalChecks.output.slice(0, 600)}`)
  const owner = finalChecks ? finalChecks.output.split('\n').filter((l) => /^- O\d /.test(l.trim())) : []
  if (owner.length) log(`before store release, the owner: ${owner.map((l) => l.trim().slice(2)).join(' | ')}`)
  if (finalChecks && /no app icon given/.test(finalChecks.output)) log('app icon: none was given — the app ships with Flutter\'s default icon until one is added with app-icon.mjs --source (build skill U13)')
}

// ───────────────────────────── Lessons, run report, cleanup, release ─────────────────────────────
phase('Final')
const done0 = Boolean(gateOk && qaDone && finalAudit && finalAudit.verdict === 'pass' && blocking === 0 && androidRan && finalChecks && finalChecks.designOk && finalChecks.assetsOk && finalChecks.secretsOk && finalChecks.releaseOk)
const closing = await agent(
  `${WHERE}
Lessons from this run. Read every finding in .pipeline/state.json and the rules in "${QA}"${STACK.own ? ` and "${SKILL}"` : ''}. For each kind of defect that occurred in at least two findings and that no existing rule prevents, write a proposed rule: the rule text, which skill and section it belongs in, and the finding ids it comes from — with \`${P} report lessons "<the rules, or 'No new rules: <why>'>"\`. Do NOT edit any skill file — the user decides. Then measure the run: \`node "${ROOT}/scripts/run-report.mjs" "${ABS || '$(pwd)'}" --save\`. Then clean up, in the foreground: \`${P} cleanup "${ABS || '$(pwd)'}"${done0 ? ' --done' : ''} --devices --sdk "${ANDROID_SDK}" --java "${JAVA_HOME}"\` — it removes the test worktrees, build output and caches, probe copies, cut command outputs and backup files${done0 ? ', the screenshots and the qa-r* branches' : ' (the run is not done, so screenshots and branches stay as evidence)'}, stops and deletes this Mac's app-factory-* simulators and af-* emulators (never any other device). Do not delete anything else yourself. Then run \`${P} timing end${done0 ? '' : ' "not done"'}\`, \`${P} devices release "${ABS || '$(pwd)'}"\`, \`${P} release\` and \`${P} status\`. Return timing = the exact line \`${P} timing\` prints, and cleanup = the line the cleanup command printed.`,
  { label: 'lessons + report + release', phase: 'Final', effort: 'low', schema: obj(['timing', 'cleanup'], { timing: str, cleanup: str }) },
)
if (closing) log(`run time: ${closing.timing}`)
if (closing && closing.cleanup) log(closing.cleanup)
const done = done0
if (!androidRan) log('not done: Android is in the contract and its test pass did not run to the end')
if (typeof IOS_HOST !== 'undefined' && !IOS_HOST) log('iOS: not built or tested — this computer is not a Mac with Xcode; build and test the iOS app on a Mac')
if (!done) log('not done — escalate to a human with the open findings in .pipeline/PROGRESS.md')

return { done, iosHost: IOS_HOST, runTime: closing ? closing.timing : null, gateRounds: round, testRounds: testRound, seniorQa: qaDone, contract, gate: build, explore, finalAudit, finalChecks, blocking }
