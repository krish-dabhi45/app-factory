export const meta = {
  name: 'app-dev-without-prd',
  description: 'App dev without PRD, one command: questions first → the source app audited (store ∥ APK files with layouts and code data ∥ every screen walked) → every gap asked → PRD.md (every line sourced or answered, new theme), gated by source-app.mjs check → /app-factory:build-app: contract (every question asked) → development → ads → device tests → senior QA → final audit',
  whenToUse: 'Rebuild an existing app — all of its functionality, a new theme and colours — when there is no PRD and no Figma design. Run it in an empty project folder (an .apk/.apks/.xapk of the app may be in it) with the app\'s link as args: a Google Play or App Store link, or its website — {"app":"<link>"} or just the link. Optional: "apk":"<path>", "name":"<the new app\'s name>", "note":"<anything the build must follow>". It stops to ask the user every open question (before the audit, when the walk fails, and before PRD.md) and returns "nextStep": do exactly what it says — ask them all with AskUserQuestion, wait for the answers, relaunch with them; once PRD.md passes, it starts /app-factory:build-app on it.',
  phases: [
    { title: 'Source', detail: 'the link resolved; the APK set checked (complete, signed, one app); questions: the APK set, where the walk runs, the new name' },
    { title: 'Audit', detail: 'in parallel: store + web listing → store.md; APK files → static.md (layouts, code data, file hashes); every screen walked on the chosen device → walk.md + screenshots' },
    { title: 'Questions', detail: 'every behaviour PRD.md needs that no evidence shows becomes a question for the user — nothing is guessed' },
    { title: 'Report', detail: 'PRD.md (every line sourced, every seen screen/feature/dependency covered) + the new theme in source-app/theme.json, until source-app.mjs check passes' },
  ],
}

const obj = (required, properties) => ({ type: 'object', required, properties })
const str = { type: 'string' }
const int = { type: 'integer' }
const bool = { type: 'boolean' }
const strs = { type: 'array', items: str }
const QUESTIONS = { type: 'array', items: obj(['id', 'header', 'question', 'options', 'why'], { id: str, header: str, question: str, options: { type: 'array', items: obj(['label', 'description'], { label: str, description: str }) }, why: str }) }

// args: an object, a JSON string, or the bare link.
const ARGS = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { const t = args.trim(); return /^https?:\/\//.test(t) ? { app: t } : t ? { note: t } : {} } })()
  : (args || {})
// The user's answers so far (each relaunch carries all of them). Every open question is asked and waited for (user,
// 2026-11-04): before the audit (apk, walk, name, link), when a walk fails (walkfail-<n>), before PRD.md (P<n>).
const ANSWERS = Array.isArray(ARGS.answers) ? ARGS.answers : []
const label = (a) => String(a.answer).replace(/ \(Recommended\)$/, '') // the first option's label carries " (Recommended)"
const ANS = Object.fromEntries(ANSWERS.map((a) => [a.id, label(a)]))
const NO_WALK = 'Go on without the walk'
const fails = ANSWERS.filter((a) => /^walkfail-\d+$/.test(a.id)).map(label)
const walkPick = fails.length ? fails[fails.length - 1] : (ANS.walk || '')
const SKIP_WALK = ANS.apk === NO_WALK || walkPick === NO_WALK
// where the walk runs: "My phone" / "Play on emulator" / "Plugin emulator" (an own answer is matched by its words)
const WALK_ON = SKIP_WALK ? 'none' : /phone/i.test(walkPick) ? 'phone' : /play/i.test(walkPick) ? 'play' : 'emulator'
const askAll = (qs, what) => `Ask the user ALL ${qs.length} question(s) in "questions" (${qs.map((q) => q.id).join(', ')}) — ${what} — with the AskUserQuestion tool, up to 4 questions per call, in the order given, as many calls as it takes. Each: header = its header, question = its question, options = its options as given (label and description; the first one ends in "(Recommended)"); never add, drop or reword an option, never answer one yourself, never start a timer: wait for the answers however long they take. A reply with a key value: store it with \`printf '%s' '<the value>' | node "${ROOT}/scripts/pipeline.mjs" secret set <NAME>\` in the project directory and use the answer "provided" — never repeat the value. Then run the workflow app-factory:app-dev-without-prd again in this same chat with these args, with one entry per question added to the end of "answers" — {"id":"<id>","question":"<question>","answer":"<the option's label or the user's own text>","by":"user"}: ${JSON.stringify({ ...ARGS, answers: ANSWERS })}`
const ask = (qs, what) => {
  const open = (qs || []).filter((q) => q && !(q.id in ANS)).map((q) => ({ ...q, header: String(q.header).slice(0, 12) }))
  if (!open.length) return null
  log(`${open.length} question(s) for the user (${what}) — the run waits for the answers`)
  return { stage: 'questions', questions: open, nextStep: askAll(open, what) }
}
// ponytail: a workflow script cannot ask where its plugin lives — configure.mjs / self-configure.mjs write these defaults per machine.
const ROOT = ARGS.root || '/Users/mach/testing/app-factory'
const ANDROID_SDK = ARGS.androidSdk || '/Users/mach/Library/Android/sdk'
const JAVA_HOME = ARGS.javaHome || '/opt/homebrew/opt/openjdk@17'
const PIPE = `${ROOT}/scripts/pipeline.mjs`
const CHECK = `node "${ROOT}/scripts/source-app.mjs"`
const ADB = `"${ANDROID_SDK}/platform-tools/adb"`
const AAPT = `"$(ls -d "${ANDROID_SDK}"/build-tools/*/ | sort -V | tail -1)aapt2"`
const APKANALYZER = `JAVA_HOME="${JAVA_HOME}" "${ANDROID_SDK}/cmdline-tools/latest/bin/apkanalyzer"`
let P = `node "${PIPE}"`

const where = (dir) => `Project directory: ${dir} — run every command there.${ARGS.note ? ` The user's note for this run: ${JSON.stringify(String(ARGS.note))}.` : ''}
This run audits an EXISTING app (the "source app") so that /app-factory:build-app can rebuild all of its functionality with a new theme. The user has no PRD and no Figma design: the evidence you collect is the only spec, so it must be exact. Report only what a source shows — a store page, a web page, the APK's files, or the app on the emulator — and give each fact its source. What no source shows is "NOT OBSERVED" and becomes a question for the user — never a guess. Write no vague words: "etc", "and more", "various", "similar to", "as needed", "appropriate", "probably", "maybe", "TBD", "…" — state the exact text, number or behaviour.
The user is watching .pipeline/PROGRESS.md live: report as you go with \`${P} log source "<what you are doing or what just happened>"\` — when you start, before each long step and after each result. Never ask the user directly: an open question goes into the "questions" you return — the run stops, the chat asks the user every one, waits, and relaunches with the answers.${ANSWERS.length ? ` The user's answers so far (also in source-app/answers.md): ${JSON.stringify(ANSWERS.map((a) => ({ id: a.id, question: a.question, answer: a.answer })))}.` : ''} Never start a background, detached or headless process (\`&\`, \`nohup\`, \`claude -p\`); run every command in the foreground.
Files: the evidence goes ONLY into source-app/ (the files your task names); raw dumps, decompiled output and downloads go into ${dir}.source/ (outside the project). Never copy an image, icon, font, text file, key or ID value of the source app into the project except the screenshots your task names. A key, token or ID you see (AIza…, sk_…, an AdMob or Firebase id): record "<service> key present" — never its value.
This computer is the user's: never run sudo, pkill, killall, kill by name, reboot, or delete a device; the plugin's guard refuses them. Read only what you need: grep -n first, then the lines you need; batch independent reads and commands in one turn.`
let WHERE = where('.')

// ───────────────────────────── Source: the link and the APK ─────────────────────────────
phase('Source')
const src = await agent(
  `${WHERE}
Setup — find what can be audited. In order, stop at the first failure (ok=false, stop = the reason, in one sentence the user can act on):
1. \`pwd\` → projectDir. Work an earlier run left here is continued, never started over: \`${CHECK} status .\` prints {sourceApp, store, static, walk (the ids each evidence file holds; 0 = missing, or a walk that reached no screen), prd, prdProblems, contract, app, dartFiles} → return it as "have", then:
   - contract true → the build has started from this folder's PRD: return ok=true and resume="build" — skip steps 2–7.
   - sourceApp false and (prd true, or any *PRD*.md exists) → stop: "This folder already has a PRD — use /app-factory:build-app."
   - sourceApp false and app true → stop: "This folder already has an app and no audit of a source app — use an empty folder (the source app's APK may be in it)."
   - prd true and prdProblems 0 → the audit and its PRD are done: return ok=true and resume="prd" — skip steps 2–7.
   - otherwise resume="audit": continue; the evidence files with ids are kept as they are, the rest are written by this run.
2. \`mkdir -p "$(pwd).source" source-app/store source-app/screens\` → scratch = "$(pwd).source". \`${P} init PRD.md\` (the PRD this run writes), then \`${P} log source "auditing ${ARGS.app ? ARGS.app.replace(/"/g, '') : 'the APK in the folder'}"\`.${ANSWERS.length ? ` Write source-app/answers.md (replace it): "# Answers" and, per answer above, "## <id> · <question>" then "Answer: <answer>" — the user's words as given; PRD.md cites them as [user].` : ''}
3. The link: ${ARGS.app ? `"${ARGS.app}"` : 'none given'}. Google Play (play.google.com/store/apps/details?id=<package>) → androidPackage. App Store (apps.apple.com/…/id<digits>) → iosId = the digits; then \`curl -s "https://itunes.apple.com/lookup?id=<iosId>&country=us"\` → its trackName and sellerName, and find its Android version: WebSearch \`"<trackName>" "<sellerName>" site:play.google.com\` → a Play link whose developer is the same sellerName → androidPackage. Any other URL → website (fetch it and take a Play or App Store link it gives). ${ANS.link ? `The user answered which app it is: ${JSON.stringify(ANS.link)} — use it.` : 'More than one Play app could be it, or none and there is no APK → question "link" (header "Source app"): one option per candidate (title — developer — package), the closest match first.'}
4. The APK set: ${ARGS.apk ? `"${ARGS.apk}"` : '`find . -maxdepth 2 \\( -iname "*.apk" -o -iname "*.apks" -o -iname "*.xapk" -o -iname "*.apkm" \\) -not -path "./build/*"`'}. A bundle (.apks, .xapk, .apkm — a zip of APKs): \`unzip -o -q <file> "*.apk" -d <scratch>/apk\`, and every APK in it is one install set. Files of different apps (check each with \`${AAPT} dump badging <apk> | head -1\`) → stop: "The folder has APKs of more than one app (<packages>) — keep only the one to rebuild." The base APK is base.apk, or the one whose badging line has no split=. Its package must equal androidPackage when the link gave one → else stop: "The APK is <package>, the link is <androidPackage> — they are different apps." No androidPackage yet → take it from the APK.
   No APK file, but an unzipped APK in the folder (\`find . -maxdepth 2 -name AndroidManifest.xml -not -path "./android/*" -not -path "./build/*" -not -path "./ios/*"\` with classes.dex beside it) → \`(cd "<that folder>" && zip -q -r -X "<scratch>/apk/unzipped-base.apk" .)\` is the base for the APK-files audit; unzipped = true. It cannot be installed: unzipping drops the v2/v3 signature block (\`ls "<folder>/META-INF"\` shows whether a v1 .RSA/.SF/.EC is left).
   splitsMissing = the base's manifest requires splits (\`${APKANALYZER} manifest print <base> | grep -A1 com.android.vending.splits.required\` → value true) and the set has no split APK (no split= among the badging lines). pairip = \`${APKANALYZER} manifest print <base> | grep -c com.pairip\` > 0 (Play's licence check: a copy not installed by Play may stop at its licence screen). installable = an APK set is here, not unzipped, and not splitsMissing.
5. A connected phone with the app: when androidPackage is known — \`${P} devices real --sdk "${ANDROID_SDK}"\` → for each Android phone \`${ADB} -s <serial> shell pm path <androidPackage>\`; listed → phone = that serial, phoneModel = its model. That is all you do on the phone here.${ANS.apk === 'Pull from my phone' ? ` The user chose "Pull from my phone": \`${ADB} -s <phone> pull <each path> <scratch>/apk/\` (base and every split), apkFrom = "phone"; these are the set (installable when signed and complete).` : ''}
6. Never download an APK from a website or mirror (an unverified build of someone else's app).
7. .gitignore: append each of these lines that is missing (create the file if needed): *.apk, *.apks, *.xapk, *.apkm — the APK is evidence, not part of the new app.
8. Questions — return in "questions" each of these whose id is not in the user's answers above (id; header of at most 12 characters; question ending in "?"; 2 to 4 options, each a label of at most 5 words and a one-line description of what happens, the recommended one first with " (Recommended)" at the end of its label; why = what it decides):
   - "apk" (header "APK set"), only when not installable: the question says exactly what is missing (no APK; only an unzipped APK with no signature; a base APK without its <n> split APKs, as res/xml/splits0.xml or the manifest shows). Options in this order, each only when it applies: "Pull from my phone" (phone has the app: base and splits copied read only; nothing on the phone changes); "I'll add the APK set" (put the .apks/.xapk/.apkm, or base.apk with every split_config.*.apk, in the folder, then answer); "${NO_WALK}" (no walk: screens come from the APK's layouts and the store screenshots, and every behaviour no file shows is asked before PRD.md).${ANS.apk === "I'll add the APK set" ? ' The user answered "I\'ll add the APK set": if the set is still not installable → stop: "The folder still has no complete, signed APK set: <what is missing>."' : ''}
   - "walk" (header "Walk on"), when the walk can run somewhere and the user did not choose "${NO_WALK}": options, each only when it applies — "Plugin emulator" (installable: the set is installed on the plugin's own emulator af-standard; with pairip it may stop at Play's licence screen), "Play on emulator" (androidPackage known: the emulator, a Google Play image, opens the app's Play page; the user signs in to a Google account in the emulator window and taps Install; the walk waits up to 30 minutes; the account stays on that emulator), "My phone" (phone has the app: the walk uses the app as installed on <phoneModel> — taps every control, switches airplane and dark mode and puts them back, never buys, signs in, sends or deletes; records it creates stay in the app; the first launch cannot be seen). Recommended first: "Plugin emulator" when installable and not pairip; else "My phone" when there is a phone; else "Play on emulator". Only one option applies → no question; that one is used.
   - "name" (header "New name")${ARGS.name ? ' — skip: the name was given' : ''}: 3 names you propose — none containing a word of the source app's title, none confusable with it — the first recommended.
   - "link" as step 3 says.
Return ok, stop, resume, have, projectDir, scratch, link, androidPackage, iosId, website, apks (absolute paths; the base first — the zipped unzipped folder counts), apkFrom, unzipped, splitsMissing, pairip, installable, phone, phoneModel and questions.`,
  { label: 'source', phase: 'Source', schema: obj(['ok', 'resume', 'have', 'projectDir', 'scratch', 'apks', 'apkFrom'], { ok: bool, stop: str, resume: { type: 'string', enum: ['audit', 'prd', 'build'] }, have: obj(['store', 'static', 'walk', 'prd', 'prdProblems', 'contract', 'app', 'dartFiles'], { store: int, static: int, walk: int, prd: bool, prdProblems: { type: ['integer', 'null'] }, contract: bool, app: bool, dartFiles: int }), projectDir: str, scratch: str, link: str, androidPackage: str, iosId: str, website: str, apks: strs, apkFrom: { type: 'string', enum: ['folder', 'phone', 'none'] }, unzipped: bool, splitsMissing: bool, pairip: bool, installable: bool, phone: str, phoneModel: str, questions: QUESTIONS }), effort: 'low' },
)
if (!src || !src.ok) {
  log(`stopped: ${(src && src.stop) || 'the setup step returned no result'}`)
  return { aborted: true, stop: src && src.stop }
}
const HAVE = src.have
const NOTE = ARGS.note ? `,"note":${JSON.stringify(String(ARGS.note))}` : ''
const buildApp = (args, done) => `Tell the user in one line: ${done}. Then, in this same chat, run the workflow app-factory:build-app (the /app-factory:build-app command) with args ${args} and follow its nextStep as always.`
// An earlier run got this far: continue from it instead of auditing again.
if (src.resume === 'build') {
  log(`continuing: CONTRACT.md is here, so the audit and the contract are done — the build goes on from the ${HAVE.dartFiles} .dart file(s) already in lib/`)
  return { done: true, resumed: 'build', have: HAVE, nextStep: buildApp(`{"stage":"build","noFigma":true${NOTE}}`, `this folder's audit, PRD.md and CONTRACT.md are done (${HAVE.dartFiles} .dart files in lib/), so the build continues from the code already here`) }
}
if (src.resume === 'prd') {
  log('continuing: PRD.md is here and passes source-app.mjs check — the audit is not run again')
  return { done: true, resumed: 'prd', have: HAVE, nextStep: buildApp(`{"noFigma":true${NOTE}}`, 'the audit and PRD.md from the earlier run are done and pass the check, so the contract is written from them') }
}
// Questions before the audit: nothing is audited on a guess about the APK set, the device or the name.
const startQs = ask((src.questions || []).filter((q) => !(SKIP_WALK && q.id === 'walk')), 'before the audit: the source app, its APK set, where the walk runs and the new app\'s name')
if (startQs) return startQs
const DIR = src.projectDir.trim()
const SCRATCH = src.scratch.trim()
P = `PIPELINE_DIR="${DIR}/.pipeline" node "${PIPE}"`
WHERE = where(DIR)
const APK = src.apks.length > 0
const BASE = APK ? src.apks[0] : ''
const INSTALL = src.apks.length > 1 ? `${ADB} -s <serial> install-multiple -r ${src.apks.map((a) => `"${a}"`).join(' ')}` : `${ADB} -s <serial> install -r "${BASE}"`
// The walk's device: the user's answer; when only one place could run it (no question was asked), that one.
const WALK_MODE = SKIP_WALK ? 'none' : walkPick ? WALK_ON : src.installable && !src.pairip ? 'emulator' : src.phone ? 'phone' : src.androidPackage ? 'play' : src.installable ? 'emulator' : 'none'
const CAN_WALK = WALK_MODE === 'emulator' ? Boolean(src.installable) : WALK_MODE === 'phone' ? Boolean(src.phone) : WALK_MODE === 'play' ? Boolean(src.androidPackage) : false
log(`source: ${src.link || 'no link'}${src.androidPackage ? ` · Android ${src.androidPackage}` : ''}${src.iosId ? ` · iOS id${src.iosId}` : ''} · APK: ${APK ? `${src.apks.length} file(s) from the ${src.apkFrom}${src.unzipped ? ' (an unzipped APK: files only)' : ''}${src.splitsMissing ? ' (split APKs missing)' : ''}` : 'none'} · walk: ${CAN_WALK ? { emulator: 'the plugin\'s emulator', play: 'the emulator, installed from Play', phone: `the user's phone ${src.phoneModel || src.phone}` }[WALK_MODE] : SKIP_WALK ? 'none (the user chose to go on without it)' : 'none possible'}`)

// ───────────────────────────── Audit: store ∥ APK files ∥ walk ─────────────────────────────
phase('Audit')
const store = () => agent(
  `${WHERE}
STORE AND WEB — write source-app/store.md: what the public sources say about the source app. Android package: ${src.androidPackage || 'none'}; App Store id: ${src.iosId || 'none'}; website: ${src.website || src.link || 'none'}. Fetch pages with \`curl -sL -A "Mozilla/5.0" -o ${SCRATCH}/<name>.html "<url>"\` (or WebFetch) and record every URL you used under "Fetched:" with its HTTP status (\`curl -w "%{http_code}"\`). Only the two stores and the developer's own pages — no blogs, review sites or APK mirrors.
1. Google Play${src.androidPackage ? '' : ' (skip: no package)'}: https://play.google.com/store/apps/details?id=${src.androidPackage || '<package>'}&hl=en&gl=US → title, developer, category, the whole "About this app" text, "What's new", "Contains ads", "In-app purchases" and its price range, rating and count, downloads, content rating, last update, required Android version; https://play.google.com/store/apps/datasafety?id=${src.androidPackage || '<package>'}&hl=en&gl=US → each data type collected and shared, and why. Screenshots: the play-lh.googleusercontent.com images of the screenshot carousel in their order (not the icon, the feature graphic or other apps' icons) → \`curl -sL "<url>=w1080" -o source-app/store/play-<nn>\`, then add the extension \`file -b --mime-type\` reports (png, jpeg or webp).
2. App Store: ${src.iosId ? `id ${src.iosId}` : `find it: \`curl -s "https://itunes.apple.com/search?term=<the Play title, URL-encoded>&entity=software&country=us&limit=10"\` → the result whose sellerName is the Play developer (none → skip)`}. \`curl -s "https://itunes.apple.com/lookup?id=<id>&country=us"\` → description, releaseNotes, price, genres, minimumOsVersion, supportedDevices (iPad or not), languageCodesISO2A, version; screenshotUrls → source-app/store/ios-<nn>.<ext> the same way. https://apps.apple.com/us/app/id<id> → "In-App Purchases" (each item's name and price) and "App Privacy".
3. The developer's pages the listings link — website, help or FAQ, privacy policy, terms (at most 10 pages; no help page linked → WebSearch "<title> <developer> help" and take only the developer's own domain): what they say about features, limits, plans, accounts and data.
4. Read every screenshot you downloaded (Read tool), one by one.
Write source-app/store.md, in this order:
# Store and web — <title> by <developer>
Fetched: one line per URL — "<url> — <status>"
## Listing — one line per fact (title, developer, category, platforms, price, every in-app purchase with its price, contains ads, minimum OS, devices, languages, rating, downloads, last update), each ending with [store: <url>]
## Features claimed — one capability per line: \`- F01 · <the claim, quoted where possible> [store: <url>]\` — split a sentence that claims two capabilities into two ids; every capability any source states gets an id
## Screenshots — \`- P01 · source-app/store/<file> — <the screen it shows: every visible text, control and value, top to bottom>\`
## Data safety and privacy — each data type: collected / shared / why, [store: <url>]
## Plans — each paid item or plan: name, price, period, what it unlocks, [store: <url>]
\`${P} log source "store: <n> features, <n> screenshots, <n> pages"\`. Return the counts and title, developer, iosId, androidPackage as found.`,
  { label: 'audit: store + web', phase: 'Audit', schema: obj(['title', 'features', 'screenshots', 'pages'], { title: str, developer: str, iosId: str, androidPackage: str, features: int, screenshots: int, pages: int }), effort: 'high' },
)
const staticAudit = () => agent(
  `${WHERE}
APK FILES — write source-app/static.md: what the source app's own files show. Base APK: "${BASE}"${src.apks.length > 1 ? `; splits: ${src.apks.slice(1).join(', ')}` : ''}. Tools (all installed): A = ${AAPT}, AA = ${APKANALYZER}. Put every raw output in ${SCRATCH}/static/ and read it with grep; nothing raw goes into the project.
1. \`A dump badging <base>\` → package, versionName, versionCode, minSdk, targetSdk, application-label, launchable-activity, every uses-permission and uses-feature, native-code, supports-screens, the number of locales.
2. \`AA manifest print <base>\` → every activity, service, receiver and provider; every intent-filter with its action, scheme, host and mimeType (deep links; share targets: android.intent.action.SEND); every meta-data NAME (com.google.android.gms.ads.APPLICATION_ID = AdMob, com.facebook.sdk.ApplicationId, com.google.firebase.*, com.onesignal.*).
3. Framework, from \`unzip -l <base>\`: lib/*/libflutter.so → Flutter; assets/index.android.bundle → React Native; lib/*/libunity.so → Unity; assets/public/ or assets/www/ → Capacitor / Cordova; only classes*.dex → native Kotlin/Java.
4. Code. Flutter: L = lib/arm64-v8a/libapp.so (else armeabi-v7a, x86_64); \`unzip -p <base> L | strings -n 6 > ${SCRATCH}/static/libapp.txt\`; the app's own Dart package = \`grep -oE 'package:[a-z0-9_]+/main\\.dart' ${SCRATCH}/static/libapp.txt\`; its own files = \`grep -oE 'package:<it>/[A-Za-z0-9_/]+\\.dart' … | sort -u\` (every screen, model, service and widget file of the app — its structure); the packages it uses = \`grep -oE 'package:[a-z0-9_]+/' … | sort | uniq -c | sort -rn\`. No package: paths (an obfuscated build) → record "Dart symbols obfuscated — structure NOT OBSERVED". Native: \`AA dex packages --defined-only <base>\` → the top-level packages (SDKs) and the app's own package's classes (C lines): its Activities, Fragments, ViewModels and services. If \`command -v jadx\` finds jadx: \`jadx -d ${SCRATCH}/jadx --no-res <base>\` and read the app's own package for its formulas, validation rules and limits (cite file:line); without jadx write "jadx not installed — rules come from the walk".
5. Texts: \`A dump resources <base> | grep -A1 " string/"\` → the default-locale UI texts and error messages (skip the abc_*, mtrl_*, common_google_* library strings); Flutter: the asset list \`unzip -l <base> | grep flutter_assets/\` (fonts from FontManifest.json, images by name, l10n .arb/.json files — read those for the texts).
6. Network and backend: URL hosts in the code (\`grep -oE 'https?://[A-Za-z0-9.-]+' ${SCRATCH}/static/libapp.txt | sort -u\`, or the same over \`unzip -p <base> "classes*.dex" | strings\`), and the backend resources (google_app_id, project_id, firebase_database_url, gcm_defaultSenderId — "Firebase project present", never the values).
7. Colours: \`A dump resources <base> | grep -A1 " color/"\` and the theme parents in the manifest's application theme (DayNight → dark mode); a Flutter app keeps its colours in code — write "Flutter: colours are not in the resources" then.
8. Layouts (native Kotlin/Java only — the screens' structure when no walk shows it): the app's own layouts are the res/layout*/ files (\`unzip -l <base> | grep -E "res/layout[^/]*/"\`) whose names start with none of these library prefixes: abc_, mtrl_, m3_, m3c_, material_, design_, exo_, notification_, select_dialog_, support_, browser_actions_, custom_dialog, ime_, preference_, admob_, applovin_, com_facebook_, tt_, pangle_, bm_, unity_, admost_, adapty_, crop_image_, ucrop_, libraries_, ted_, mal_. For each: \`A dump xmltree --file <path> <base>\` → one line \`- L<nn> · <path> — <the elements top to bottom: widget (the last part of its class), android:id, text or hint (its string name and that string's text), contentDescription, inputType, maxLength, visibility gone, an included layout>\`. Every res/navigation/*.xml (destinations, actions, arguments) and res/menu/*.xml goes under Facts.
9. Data in the code (native): DD = "$(ls -d "${ANDROID_SDK}"/build-tools/*/ | sort -V | tail -1)dexdump" (installed with the build tools); \`for f in $(unzip -Z1 <base> "classes*.dex"); do unzip -p <base> "$f" > ${SCRATCH}/static/$f; "$DD" -d ${SCRATCH}/static/$f; done > ${SCRATCH}/static/dex.txt\`. Resource names survive R8 as field names (\`Lzz8;.subcat_cleaning_tech:I\`), so for every group of Texts whose order or nesting the app shows — lists, categories → subcategories → items, options, plans, steps, templates — \`grep -n "\\.<one string name of the group>:I" ${SCRATCH}/static/dex.txt\`, then read that method: the order of the field reads and the new-instance per entry give the table. Record it as \`- D<nn> · data: <what> — <every entry in order, nested as the code nests it> (dexdump: class <Lx;> method <name>)\`. A limit, count or timeout a rule uses: the const next to it in the same method, with class and method. A table no method holds (from the server): "data: <what> — not in the APK (loaded from <host>)".
10. File hashes for the copy check at the end of the build: unzipped = "${SCRATCH}/unzipped" — \`unzip -o -q <base> "res/*" "assets/*" -d "${SCRATCH}/unzipped"\` (with an unzipped APK in the folder, that folder instead) — then \`${CHECK} hashes "<unzipped>" > source-app/res-hashes.txt\`. It lists the source's files so the new app can be checked against them; never copy a file from it.
Write source-app/static.md:
# APK — <package> <versionName> (<framework>)
## Facts — one line each, with the command it came from
## Dependencies and capabilities — one line per item: \`- D01 · <SDK, Dart package, permission, deep link, share target, service or receiver> — <the capability it gives this app> (<the exact evidence line>)\`. Every permission, every SDK and Dart package that is not a framework internal (flutter, material_color_utilities, collection, meta, vector_math, …), every intent-filter and every own service or receiver gets an id.
## App's own code — one line per own screen file or Activity/Fragment: \`- D<nn> · screen: <path or class>\`; the models and services as plain lines
## Layouts — the L lines of step 8 (native)
## Data in the code — the data lines of step 9 (their D ids continue the numbering)
## Texts — the UI texts, grouped by screen or prefix; the error messages under their own heading
## Network and backend — hosts, Firebase services, keys present (names only)
## Colours — name → #RRGGBB, or the Flutter line
\`${P} log source "APK: <framework>, <n> dependencies, <n> own screens, <n> layouts, <n> data tables"\`. Return the counts.`,
  { label: 'audit: APK files', phase: 'Audit', schema: obj(['framework', 'dependencies', 'ownScreens', 'layouts', 'dataTables'], { framework: str, dependencies: int, ownScreens: int, layouts: int, dataTables: int, obfuscated: bool }), effort: 'high' },
)
// The walk drives a device, so it runs as the plugin's tester sub-agent (agents/tester.md), like every device step of build-app.
const PKG = src.androidPackage || '<package>'
// Steps 1, 2 and 8 of the walk per device (the user's answer to "walk", or "walkfail-<n>")
const WALK_ON_DEVICE = {
  emulator: {
    what: "the plugin's own Android emulator af-standard (installed from the APK set)",
    start: `\`${P} devices claim "${DIR}"\` — if it fails, another project's run holds the devices: return walked 0 with that message as note and do nothing else. Then \`${P} devices up android --sdk "${ANDROID_SDK}"\` → its serial (S below), and \`${P} maestro-install\`.
2. Install: \`${INSTALL.replace('<serial>', 'S')}\` (no -g: the app's own permission requests are part of what you record). Install fails → record the error, run step 8, return walked 0 with it as note. The app opens on Play's licence screen (pairip) → record it with a screenshot, run step 8, return walked 0 with "stopped at Play's licence screen" as note.`,
    end: `\`${ADB} -s S uninstall ${PKG}\`, \`${ADB} -s S emu kill\`, \`${P} devices release "${DIR}"\`.`,
  },
  play: {
    what: "the plugin's own Android emulator af-standard, with the app installed from Google Play by the user",
    start: `\`${P} devices claim "${DIR}"\` — if it fails, another project's run holds the devices: return walked 0 with that message as note and do nothing else. Then \`${P} devices up android --sdk "${ANDROID_SDK}"\` → its serial (S below), and \`${P} maestro-install\`.
2. Install from Play: \`${ADB} -s S shell am start -a android.intent.action.VIEW -d "market://details?id=${PKG}"\`, then \`${P} log source "waiting for you: in the emulator window sign in to Google Play and tap Install for ${PKG} (up to 30 minutes)"\`. Check every 30 s with \`${ADB} -s S shell pm path ${PKG}\`, in foreground commands of at most 9 minutes each (\`for i in $(seq 18); do ${ADB} -s S shell pm path ${PKG} | grep -q package: && break; sleep 30; done\`), up to 30 minutes in all. Not installed by then → run step 8, return walked 0 with "not installed from Play within 30 minutes" as note.`,
    end: `\`${ADB} -s S emu kill\` (the app and the Google account stay on that emulator; never uninstall or sign out for the user), \`${P} devices release "${DIR}"\`.`,
  },
  phone: {
    what: `the user's phone ${src.phoneModel || src.phone} (serial ${src.phone}), where the app is installed — the user chose it`,
    start: `S = ${src.phone}. \`${P} phone save S\` (its settings, put back at step 8), and \`${P} maestro-install\`.
2. No install: the app is on the phone. Never install, uninstall, clear data or change anything outside the app; the app keeps what the user had. The first launch and the fresh-install empty states cannot be seen here — write "NOT OBSERVED (walked on the user's installed app)" for them in step 5.`,
    end: `\`${P} phone restore S\` (airplane mode, dark mode and the other settings back as they were). Leave the app installed.`,
  },
}[WALK_MODE] || null
const walk = () => {
  const prompt = `${WHERE}
WALK — every screen of the source app on ${WALK_ON_DEVICE.what}, written to source-app/walk.md with a screenshot of each. Use no other device.
1. ${WALK_ON_DEVICE.start} Launch: \`${ADB} -s S shell monkey -p ${PKG} -c android.intent.category.LAUNCHER 1\`, then \`${P} wait-app S --platform android --app ${PKG} --sdk "${ANDROID_SDK}"\` (never a fixed pause).
3. Walk breadth-first from the first screen, by the element list only (the android-screen tool \`read_screen\` and adb at its at= points — never coordinates read off a screenshot). A screen is new when its title or its set of controls differs from every screen recorded (the same screen with other values is not new). For each new screen:
   - \`read_screen S\`, then \`${ADB} -s S exec-out screencap -p > source-app/screens/S<nn>-<slug>.png\` (on macOS then \`sips --resampleWidth 540 <file>\`);
   - in walk.md: \`## S<nn> · <its title>\`, then "screenshot: source-app/screens/S<nn>-<slug>.png", "reached: S<nn> → tap \\"<label>\\"", "elements:" every element top to bottom (kind — text, button, icon button, field, toggle, checkbox, slider, tab, list item, image —, its exact text, label or hint, its value), and "actions:" each control → what it did (opens S<nn>, a dialog or sheet with its exact texts, a toast with its text, a system screen, nothing);
   - tap every control once and come back (Back, or the screen's own back control; confirm with read_screen). Scroll every scrollable area to its end and record what appears. In a list open the first item only. Every tab, menu, drawer and overflow item counts as a control.
   Never buy (at the store's purchase sheet record the plans and prices shown, then Back), never sign in with a real account or create one (record the sign-in options, then stop on that branch), never send, post, call, share to a person, rate, report or delete an account (record the sheet or intent, then Back). An ad: record its type (full screen, banner, native), the screen and the tap that brought it, then close it.
4. Every input field: submit it empty, then one invalid value for each rule it may have (too long, letters in a number, negative, zero, a malformed email or URL), then a valid value; record "- field S<nn>/<label>: <input> → \\"<the exact message>\\" (<where it shows>)". Every calculation or generated output (a total, a conversion, a score, a generated text or file): run it with 3 different inputs and record "input → output" exactly, so the formula can be derived from them.
5. States: the first launch (onboarding, the permission dialogs: which permission, on which screen, its text — then allow it); empty states (this is a fresh install); offline — \`${ADB} -s S shell cmd connectivity airplane-mode enable\`, reopen each screen that loaded data and record what it shows, then \`… disable\`; persistence — create one record and change one setting, \`${ADB} -s S shell am force-stop <package>\`, relaunch, record what is still there; dark mode — \`${ADB} -s S shell cmd uimode night yes\`, reopen S01, one screenshot source-app/screens/S01-dark.png, record whether the app follows it, then \`night no\`; notifications it posts (\`${ADB} -s S shell dumpsys notification --noredact | grep -A4 <package>\`).
6. End of walk.md: "## Navigation" — a table | from | tap | to | with one row per action of step 3; "## Fields and outputs" — the lines of step 4; "## States" — step 5; "## Not reached" — every control that leads somewhere you did not go, and why.
7. \`${P} log source "walk: <n> screens, <n> fields, <n> outputs"\` after every 5 screens and at the end.
8. Always, also after a failure: ${WALK_ON_DEVICE.end}
Return walked (screens), fields, outputs, navigation (rows), notReached, note.`
  const opts = { label: 'audit: walk', phase: 'Audit', schema: obj(['walked', 'fields', 'outputs', 'navigation', 'notReached'], { walked: int, fields: int, outputs: int, navigation: int, notReached: strs, note: str }), effort: 'high' }
  return agent(prompt, { ...opts, agentType: 'app-factory:tester' }).catch((e) => {
    log(`walk: tester sub-agent unavailable (${String(e && e.message || e).slice(0, 120)}) — running as a plain agent`)
    return agent(prompt, opts)
  })
}
// Evidence an earlier run wrote is kept (HAVE: its ids); only the missing parts run. A walk with no screen runs again.
const kept = (name, n, unit) => async () => { log(`audit: ${name} kept from the earlier run (${n} ${unit})`); return { kept: true } }
const [st, sa, wk] = await parallel([
  HAVE.store ? kept('store.md', HAVE.store, 'F ids') : store,
  ...(APK ? [HAVE.static ? kept('static.md', HAVE.static, 'D ids') : staticAudit] : [async () => null]),
  ...(HAVE.walk ? [kept('walk.md', HAVE.walk, 'screens')] : CAN_WALK ? [walk] : []),
])
const shown = (r, f) => (!r ? 'no result' : r.kept ? 'kept' : f(r))
log(`audit: store ${shown(st, (r) => `${r.features} feature(s), ${r.screenshots} screenshot(s), ${r.pages} page(s)`)}${APK ? ` · APK ${shown(sa, (r) => `${r.framework}, ${r.dependencies} dependencies, ${r.ownScreens} own screens, ${r.layouts} layouts, ${r.dataTables} data tables`)}` : ''} · walk ${HAVE.walk || CAN_WALK ? shown(wk, (r) => `${r.walked} screen(s), ${r.fields} field(s), ${r.outputs} output(s)${r.note ? ` — ${r.note}` : ''}`) : 'not run'}`)
if (!st) return { aborted: true, stop: 'the store audit returned no result — run again' }
const WALKED = Boolean(HAVE.walk || (wk && wk.walked > 0))
const STATIC = APK || HAVE.static > 0 // static.md exists: from this run or an earlier one
// The walk ran and reached no screen: the user decides what happens next — another device, or no walk.
if (CAN_WALK && !HAVE.walk && !WALKED) { // also when the walk agent returned nothing
  const n = fails.length + 1
  const opts = [
    ...(src.phone && WALK_MODE !== 'phone' ? [{ label: 'My phone', description: `walk the app as installed on ${src.phoneModel || src.phone}: every control tapped, airplane and dark mode switched and put back; never buys, signs in, sends or deletes; records it creates stay in the app` }] : []),
    ...(src.androidPackage && WALK_MODE !== 'play' ? [{ label: 'Play on emulator', description: 'the emulator opens the app\'s Play page; you sign in to a Google account in the emulator window and tap Install; the walk waits up to 30 minutes' }] : []),
    ...(src.installable && WALK_MODE !== 'emulator' ? [{ label: 'Plugin emulator', description: 'install the APK set on the plugin\'s emulator af-standard and walk it there' }] : []),
    { label: 'Try the walk again', description: `the same device again (${WALK_MODE})` },
    { label: NO_WALK, description: 'no walk: screens come from the APK\'s layouts and the store screenshots; every behaviour no file shows is asked before PRD.md' },
  ].slice(0, 4)
  opts[0] = { ...opts[0], label: `${opts[0].label} (Recommended)` }
  const q = ask([{ id: `walkfail-${n}`, header: 'Walk failed', question: `The walk on ${WALK_MODE === 'phone' ? 'your phone' : 'the emulator'} reached no screen (${((wk && wk.note) || 'no result from the walk').slice(0, 160)}) — where should it run now?`, options: opts, why: 'without a walk the screens, fields, outputs and states come only from files and screenshots' }], 'the walk reached no screen')
  if (q) return q
}
// Questions before PRD.md: every behaviour the PRD needs that no evidence shows is asked — nothing is guessed.
phase('Questions')
const P_DONE = ANSWERS.some((a) => /^P\d+$/.test(a.id))
if (!P_DONE) {
  const gaps = await agent(
    `${WHERE}
GAPS — read only: change no file. Read the evidence in full, in one turn: source-app/store.md${STATIC ? ', source-app/static.md' : ''}${WALKED ? ', source-app/walk.md' : ''}${ANSWERS.length ? ', source-app/answers.md' : ''}. PRD.md (written next) must state for the new app: platforms (iOS, Android, tablets, minimum OS, orientation, languages, dark mode); every screen's elements, actions and empty / loading / error / offline states; every field's type, required, limits and exact error messages; every feature's inputs → rules → outputs (formulas, limits, what it stores); data and backend (what is stored where, accounts, sync, backup; each external service a feature needs); monetisation (ads, plans and prices, what Premium unlocks, free limits); permissions and when each is asked; notifications; settings; and for the new look: font, corner radius, elevation, icon style. For each of these the evidence does not show exactly (no quoted text, number or behaviour with its id), write one question: id P1, P2, … in order; header of at most 12 characters; question = one sentence naming the screen or feature and what is unknown, ending with "?"; 2 to 4 options, each a label of at most 5 words and a one-line description of exactly what gets built, the one closest to the evidence first with " (Recommended)" at the end of its label; why = which evidence lacks it (the file and id, or "no source shows it"). Group nothing: one unknown per question. Do not ask what the evidence or an answer above already settles. \`${P} log source "gaps: <n> question(s)"\`. Return questions (empty when the evidence covers everything).`,
    { label: 'gaps', phase: 'Questions', schema: obj(['questions'], { questions: QUESTIONS }), effort: 'high' },
  )
  const q = ask(gaps && gaps.questions, 'before PRD.md: what no evidence shows')
  if (q) return q
}

// ───────────────────────────── Report: PRD.md + the new theme, gated by the checker ─────────────────────────────
phase('Report')
const report = await agent(
  `${WHERE}
REPORT — write PRD.md and source-app/theme.json from the evidence: source-app/store.md${STATIC ? ', source-app/static.md' : ''}${WALKED ? ', source-app/walk.md' : ''} ${ANSWERS.length ? ', source-app/answers.md (the user\'s answers)' : ''}${HAVE.static || APK ? ', source-app/res-hashes.txt (only for Not copied)' : ''} and the screenshots they list (Read the ones you need). Read every evidence file in full first, in one turn. PRD.md is what /app-factory:build-app builds from: the new app has EVERY capability of the source app, reached the same way (same screens, controls, order and flows), with a NEW theme — and nothing it did not have. ${WALKED ? '' : STATIC ? 'The walk did not run (see walk.md or its absence): screens come from the APK\'s own screen files and the store screenshots — say so in Sources. ' : 'There was no APK: screens come from the store screenshots (P ids) and the listing only — say so in Sources; a rule no source states was asked before this step (source-app/answers.md) or is a question you return. '}Never change source-app/*.md.${HAVE.prd ? ` PRD.md from an earlier run is here (${HAVE.prdProblems} check problem(s)): continue from it — run the check first, fix what it lists, and change only the lines the evidence written in this run adds to or corrects; never write it again from the start.` : ''}
Every requirement line — each bullet, numbered line and table row outside "Theme", "Not copied" and "Sources" — ends with its source: [walk: S07], [walk: S07 → S09], [store: F03], [store: P02], [store: <url>], [static: D04], [static: L12], [web: <url>], or [user] (an answer in source-app/answers.md, or the user's note). A text in quotes or a name in backticks is copied from the evidence exactly (only the source's brand replaced by the new name). Nothing is guessed: a behaviour no evidence and no answer gives is NOT written — return it in "questions" (id P<next number after the answers' P ids>, header of at most 12 characters, a question ending in "?", 2 to 4 options with the closest to the evidence first and " (Recommended)" at its end, why = which evidence lacks it) and return ready=false; the run asks the user and relaunches. "ASSUMED" or "NOT OBSERVED" may appear only on a line that also cites the [user] answer that settled it. A URL you cite must be in store.md's "Fetched" list.
Sections — exactly these headings, numbered, in this order:
## 1. App — the FIRST line exactly "- Name: **<the new name>** [user]" with the new name ${ARGS.name ? JSON.stringify(String(ARGS.name)) : ANS.name ? JSON.stringify(ANS.name) : 'the name the user answered'}; what it does, one sentence; the source app (title, developer, package, App Store id, version audited).
## 2. Platforms — iOS and Android phones; tablets only if the source supports them (supportedDevices, supports-screens); minimum OS; orientation; languages; dark mode as the source — each from the evidence or the user's answer.
## 3. Screens — one "### S<nn> · <name>" per screen (${WALKED ? 'each S id of walk.md' : 'each own screen file or store screenshot'}): purpose; every element top to bottom with its exact label or hint (functional texts kept as they are; the source's brand name replaced by the new name); each action → where it leads; its empty, loading, error and offline states.
## 4. Navigation — the | from | tap | to | table${WALKED ? ' (every row of walk.md\'s)' : ''} and the first-launch flow.
## 5. Fields — | screen | field | type | required | limits | exact error messages | placeholder |, one row per input field; a limit no source shows: the user's answer, [user].
## 6. Features — one "### <capability>" per capability: inputs → rules → outputs (a formula derived from the walk's input → output records, with the records quoted), what it stores, its errors and limits.
## 7. Data and backend — what the source keeps on the device and what on its servers (Data safety, the walk's persistence check, the SDKs); accounts and sign-in options; sync; backup. For the new app: the same capability on its OWN services — never the source's servers, endpoints, Firebase project or keys. Each external service a feature needs (sign-in, a cloud database, an AI or other paid API, maps) is one line "<feature> needs <service> — no key provided", so /app-factory:build-app's contract finds a free no-key service or a "not available" message for it, or asks for the key.
## 8. Monetisation — ads seen (type, screen, the tap that showed it), the plans and prices, what Premium unlocks (the paywall's texts), free limits seen. (build-app adds the team's ads + Premium pattern; this tells its contract what the source did.)
## 9. Permissions and notifications — each permission: when it is asked (screen) and what it is for; each notification posted.
## 10. Settings — every setting and what it changes.
## 11. Theme — the new look. The source app's palette first: measure it with \`${CHECK} palette <screenshot.png>…\` (the 12 most used exact colours) on ${WALKED ? 'S01 and two other walk screenshots' : 'the store screenshots (convert a jpeg or webp first: `sips -s format png <f> --out ' + SCRATCH + '/<name>.png`)'}${STATIC ? ', and static.md\'s Colours' : ''}; its primary = the colour of its app bar or main buttons, secondary = its accent; say where each was read. Then the new palette as a table | role | light hex | dark hex | used for | with the ten roles primary, onPrimary, secondary, onSecondary, background, onBackground, surface, onSurface, error, onError — a different colour family, not a shade of the old: the new primary and secondary each at least 60° of hue from the source's (or ≥ 150 apart in RGB for a grey), every on-colour at least 4.5:1 on its base. Dark hexes only if the source follows dark mode (walk S01-dark, or a DayNight theme). Then the rest of the new look, as exact values: font (the platform font — San Francisco / Roboto — unless the note says otherwise), corner radius of cards, buttons, fields and sheets, elevation (shadow or none), icon style (Material Symbols outlined or rounded). Layout, controls and their order stay the source's.
## 12. Not copied — the source's name, logo and app icon, illustrations, photos and mascots, marketing texts, fonts that are not free, and its keys, IDs, servers and endpoints; the new app's icon: Flutter's default for now unless the user gives one (the contract asks).
## 13. Coverage — | id | what was seen | where it is in this PRD | built or left out (why) |, one row for EVERY S, F, D and P id in the evidence files. Leave out only an SDK with no user-visible capability (analytics, crash reporting, attribution, the framework's own) or what "Not copied" lists — every other id is built.
## 14. Sources — every URL fetched, the APK (file name, package, version, \`shasum -a 256\`)${STATIC ? '' : ' — "no APK was given or found on a connected phone"'}, the walk (device, date)${WALKED ? '' : ' — "not walked: <why>"'}, every answer of source-app/answers.md (id, question, answer), and what could not be observed.
The screenshots in source-app/ show the OLD theme: they are evidence, never mockups or design — PRD.md never calls them that (build-app would compare the new app's pixels with them).
source-app/theme.json: {"source": {"primary": "#RRGGBB", "secondary": "#RRGGBB", "evidence": "<where each was read>"}, "colors": [{"role": "primary", "hex": "#RRGGBB", "use": "<what>"}, … all ten roles], "dark": [the same ten, only with dark mode]} — the exact hexes of the Theme table; build-app's colour check then lets the code use these colours and no others.
Then run \`${CHECK} check .${STATIC ? ' --apk' : ''}${STATIC && !WALKED && (SKIP_WALK || !CAN_WALK) ? ' --no-walk' : ''}\`. It lists every problem: a guess without the user's answer, a quoted text or backticked name that is not in the evidence, an untagged line, a vague word, an id from the evidence missing in PRD.md, a cited id or URL the evidence does not have, a file named that does not exist, a missing section, a theme role, a colour too close to the source's or text below 4.5:1. Fix PRD.md or theme.json and run it again until it prints "audit ready" — never weaken a line to pass (a requirement turned into a vague one fails review the same way).
With questions to return: stop here (leave PRD.md as it is; the next run continues it) and return ready=false with them. Otherwise \`rm -rf "${SCRATCH}"\` (the raw dumps; source-app/res-hashes.txt stays) and \`${P} log source "PRD.md ready: <n> screens, <n> features, <n> fields, <n> ASSUMED, <n> NOT OBSERVED"\`. Return the counts and the checker's last line.`,
  { label: 'report: PRD + theme', phase: 'Report', schema: obj(['ready', 'screens', 'features', 'fields', 'assumed', 'notObserved', 'check'], { ready: bool, name: str, screens: int, features: int, fields: int, assumed: int, notObserved: int, check: str, questions: QUESTIONS }), effort: 'high' },
)
const reportQs = report && !report.ready && ask(report.questions, 'gaps found while writing PRD.md')
if (reportQs) return reportQs
if (!report || !report.ready) {
  log(`PRD.md did not pass the audit check${report ? `: ${report.check}` : ''} — fix what \`source-app.mjs check .${STATIC ? ' --apk' : ''}${STATIC && !WALKED && (SKIP_WALK || !CAN_WALK) ? ' --no-walk' : ''}\` lists, then run /app-factory:app-dev-without-prd again in this folder (it continues from here)`)
  return { aborted: true, report }
}
log(`PRD.md ready${report.name ? ` for "${report.name}"` : ''}: ${report.screens} screen(s), ${report.features} feature(s), ${report.fields} field(s), ${report.assumed} ASSUMED, ${report.notObserved} NOT OBSERVED`)
const buildArgs = `{"noFigma":true${ARGS.note ? `,"note":${JSON.stringify(String(ARGS.note))}` : ''}}`
return {
  done: true,
  report,
  evidence: { store: st, apk: sa || null, walk: wk || null, apkFrom: src.apkFrom },
  nextStep: `Tell the user in two lines: the source app was audited (${report.screens} screens, ${report.features} features, ${report.fields} fields; ${report.assumed} ASSUMED, ${report.notObserved} NOT OBSERVED — listed in PRD.md), and PRD.md, source-app/ (evidence and screenshots) and source-app/theme.json (the new palette) are in the project. Then, in this same chat, run the workflow app-factory:build-app (the /app-factory:build-app command) with args ${buildArgs} and follow its nextStep as always, without waiting for the user in between: it writes the contract from PRD.md and asks every open question (all of them, waiting for the answers), then develops the app, adds the ads once development passes its gate, runs the device flow tests on the app with ads, then senior QA and the final audit — this is the same one command the user started.`,
}
