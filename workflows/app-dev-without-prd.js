export const meta = {
  name: 'app-dev-without-prd',
  description: 'App dev without PRD: an app link (+ its APK if in the folder) → the app audited (store listing ∥ APK files ∥ every screen walked on the emulator) → PRD.md with every requirement sourced and a new theme, gated by source-app.mjs check → /app-factory:build-app builds it',
  whenToUse: 'Rebuild an existing app — all of its functionality, a new theme and colours — when there is no PRD and no Figma design. Run it in an empty project folder (an .apk/.apks/.xapk of the app may be in it) with the app\'s link as args: a Google Play or App Store link, or its website — {"app":"<link>"} or just the link. Optional: "apk":"<path>", "name":"<the new app\'s name>", "note":"<anything the build must follow>". It returns "nextStep": do exactly what it says — it starts /app-factory:build-app on the PRD.md this run wrote.',
  phases: [
    { title: 'Source', detail: 'the link resolved; the APK found in the folder, or pulled from a connected phone that already has the app (read only)' },
    { title: 'Audit', detail: 'in parallel: store + web listing → store.md; APK files → static.md; every screen walked on the plugin\'s emulator → walk.md + screenshots' },
    { title: 'Report', detail: 'PRD.md (every line sourced, every seen screen/feature/dependency covered) + the new theme in source-app/theme.json, until source-app.mjs check passes' },
  ],
}

const obj = (required, properties) => ({ type: 'object', required, properties })
const str = { type: 'string' }
const int = { type: 'integer' }
const bool = { type: 'boolean' }
const strs = { type: 'array', items: str }

// args: an object, a JSON string, or the bare link.
const ARGS = typeof args === 'string'
  ? (() => { try { return JSON.parse(args) } catch { const t = args.trim(); return /^https?:\/\//.test(t) ? { app: t } : t ? { note: t } : {} } })()
  : (args || {})
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
This run audits an EXISTING app (the "source app") so that /app-factory:build-app can rebuild all of its functionality with a new theme. The user has no PRD and no Figma design: the evidence you collect is the only spec, so it must be exact. Report only what a source shows — a store page, a web page, the APK's files, or the app on the emulator — and give each fact its source. What no source shows is "NOT OBSERVED", never a guess. Write no vague words: "etc", "and more", "various", "similar to", "as needed", "appropriate", "probably", "maybe", "TBD", "…" — state the exact text, number or behaviour.
The user is watching .pipeline/PROGRESS.md live: report as you go with \`${P} log source "<what you are doing or what just happened>"\` — when you start, before each long step and after each result. Never ask the user a question; never start a background, detached or headless process (\`&\`, \`nohup\`, \`claude -p\`); run every command in the foreground.
Files: the evidence goes ONLY into source-app/ (the files your task names); raw dumps, decompiled output and downloads go into ${dir}.source/ (outside the project). Never copy an image, icon, font, text file, key or ID value of the source app into the project except the screenshots your task names. A key, token or ID you see (AIza…, sk_…, an AdMob or Firebase id): record "<service> key present" — never its value.
This computer is the user's: never run sudo, pkill, killall, kill by name, reboot, or delete a device; the plugin's guard refuses them. Read only what you need: grep -n first, then the lines you need; batch independent reads and commands in one turn.`
let WHERE = where('.')

// ───────────────────────────── Source: the link and the APK ─────────────────────────────
phase('Source')
const src = await agent(
  `${WHERE}
Setup — find what can be audited. In order, stop at the first failure (ok=false, stop = the reason, in one sentence the user can act on):
1. \`pwd\` → projectDir. This command starts from a folder with no app and no spec in it: if pubspec.yaml, CONTRACT.md, PRD.md or any *PRD*.md exists → stop: "This folder already has an app or a PRD — for a PRD use /app-factory:build-app; for this command use an empty folder (the source app's APK may be in it)." If source-app/ exists → stop: "An earlier audit is here — delete source-app/ to audit again, or run /app-factory:build-app {\\"noFigma\\":true} to build from it."
2. \`mkdir -p "$(pwd).source" source-app/store source-app/screens\` → scratch = "$(pwd).source". \`${P} init PRD.md\` (the PRD this run writes), then \`${P} log source "auditing ${ARGS.app ? ARGS.app.replace(/"/g, '') : 'the APK in the folder'}"\`.
3. The link: ${ARGS.app ? `"${ARGS.app}"` : 'none given'}. Google Play (play.google.com/store/apps/details?id=<package>) → androidPackage. App Store (apps.apple.com/…/id<digits>) → iosId = the digits; then \`curl -s "https://itunes.apple.com/lookup?id=<iosId>&country=us"\` → its trackName and sellerName, and find its Android version: WebSearch \`"<trackName>" "<sellerName>" site:play.google.com\` → a Play link whose developer is the same sellerName → androidPackage (none → ""). Any other URL → website (fetch it and take a Play or App Store link it gives). No link → the APK is the only start.
4. The APK: ${ARGS.apk ? `"${ARGS.apk}"` : '`find . -maxdepth 2 \\( -iname "*.apk" -o -iname "*.apks" -o -iname "*.xapk" -o -iname "*.apkm" \\) -not -path "./build/*"`'}. A bundle (.apks, .xapk, .apkm — a zip of APKs): \`unzip -o -q <file> "*.apk" -d <scratch>/apk\`, and every APK in it is one install set. Files of different apps (check each with \`${AAPT} dump badging <apk> | head -1\`) → stop: "The folder has APKs of more than one app (<packages>) — keep only the one to rebuild." The base APK is base.apk, or the one whose badging line has no split=. Its package must equal androidPackage when the link gave one → else stop: "The APK is <package>, the link is <androidPackage> — they are different apps." No androidPackage yet → take it from the APK.
5. No APK, and androidPackage is known: the app may be on a connected phone. \`${P} devices real --sdk "${ANDROID_SDK}"\` → for each Android phone: \`${ADB} -s <serial> shell pm path <androidPackage>\`; listed → \`${ADB} -s <serial> pull <each path> <scratch>/apk/\` (all of them: base and splits) and apkFrom = "phone". That is the only thing you do on the phone: never launch, clear, uninstall or change anything there — it is the user's phone and the user's app.
6. Never download an APK from a website or mirror (an unverified build of someone else's app). No APK → apkFrom "none" and apks [] — the audit then rests on the store listing and the web.
7. .gitignore: append each of these lines that is missing (create the file if needed): *.apk, *.apks, *.xapk, *.apkm — the APK is evidence, not part of the new app.
Return ok, stop, projectDir, scratch, link, androidPackage, iosId, website, apks (absolute paths; the base first), apkFrom.`,
  { label: 'source', phase: 'Source', schema: obj(['ok', 'projectDir', 'scratch', 'apks', 'apkFrom'], { ok: bool, stop: str, projectDir: str, scratch: str, link: str, androidPackage: str, iosId: str, website: str, apks: strs, apkFrom: { type: 'string', enum: ['folder', 'phone', 'none'] } }), effort: 'low' },
)
if (!src || !src.ok) {
  log(`stopped: ${(src && src.stop) || 'the setup step returned no result'}`)
  return { aborted: true, stop: src && src.stop }
}
const DIR = src.projectDir.trim()
const SCRATCH = src.scratch.trim()
P = `PIPELINE_DIR="${DIR}/.pipeline" node "${PIPE}"`
WHERE = where(DIR)
const APK = src.apks.length > 0
const BASE = APK ? src.apks[0] : ''
const INSTALL = src.apks.length > 1 ? `${ADB} -s <serial> install-multiple -r ${src.apks.map((a) => `"${a}"`).join(' ')}` : `${ADB} -s <serial> install -r "${BASE}"`
log(`source: ${src.link || 'no link'}${src.androidPackage ? ` · Android ${src.androidPackage}` : ''}${src.iosId ? ` · iOS id${src.iosId}` : ''} · APK: ${APK ? `${src.apks.length} file(s) from the ${src.apkFrom}` : 'none — store and web only, no static analysis and no walk'}`)

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
Write source-app/static.md:
# APK — <package> <versionName> (<framework>)
## Facts — one line each, with the command it came from
## Dependencies and capabilities — one line per item: \`- D01 · <SDK, Dart package, permission, deep link, share target, service or receiver> — <the capability it gives this app> (<the exact evidence line>)\`. Every permission, every SDK and Dart package that is not a framework internal (flutter, material_color_utilities, collection, meta, vector_math, …), every intent-filter and every own service or receiver gets an id.
## App's own code — one line per own screen file or Activity/Fragment: \`- D<nn> · screen: <path or class>\`; the models and services as plain lines
## Texts — the UI texts, grouped by screen or prefix; the error messages under their own heading
## Network and backend — hosts, Firebase services, keys present (names only)
## Colours — name → #RRGGBB, or the Flutter line
\`${P} log source "APK: <framework>, <n> dependencies, <n> own screens"\`. Return the counts.`,
  { label: 'audit: APK files', phase: 'Audit', schema: obj(['framework', 'dependencies', 'ownScreens'], { framework: str, dependencies: int, ownScreens: int, obfuscated: bool }), effort: 'high' },
)
// The walk drives a device, so it runs as the plugin's tester sub-agent (agents/tester.md), like every device step of build-app.
const walk = () => {
  const prompt = `${WHERE}
WALK — every screen of the source app on the plugin's own Android emulator, written to source-app/walk.md with a screenshot of each. Never a connected phone: the APK is someone else's build, and a phone is the user's.
1. \`${P} devices claim "${DIR}"\` — if it fails, another project's run holds the devices: return walked 0 with that message as note and do nothing else. Then \`${P} devices up android --sdk "${ANDROID_SDK}"\` → its serial (S below), and \`${P} maestro-install\`.
2. Install: \`${INSTALL.replace('<serial>', 'S')}\` (no -g: the app's own permission requests are part of what you record). Install fails → record the error, run step 8, return walked 0 with it as note. Launch: \`${ADB} -s S shell monkey -p <package> -c android.intent.category.LAUNCHER 1\`, then \`${P} wait-app S --platform android --app <package> --sdk "${ANDROID_SDK}"\` (never a fixed pause).
3. Walk breadth-first from the first screen, by the element list only (the android-screen tool \`read_screen\` and adb at its at= points — never coordinates read off a screenshot). A screen is new when its title or its set of controls differs from every screen recorded (the same screen with other values is not new). For each new screen:
   - \`read_screen S\`, then \`${ADB} -s S exec-out screencap -p > source-app/screens/S<nn>-<slug>.png\` (on macOS then \`sips --resampleWidth 540 <file>\`);
   - in walk.md: \`## S<nn> · <its title>\`, then "screenshot: source-app/screens/S<nn>-<slug>.png", "reached: S<nn> → tap \\"<label>\\"", "elements:" every element top to bottom (kind — text, button, icon button, field, toggle, checkbox, slider, tab, list item, image —, its exact text, label or hint, its value), and "actions:" each control → what it did (opens S<nn>, a dialog or sheet with its exact texts, a toast with its text, a system screen, nothing);
   - tap every control once and come back (Back, or the screen's own back control; confirm with read_screen). Scroll every scrollable area to its end and record what appears. In a list open the first item only. Every tab, menu, drawer and overflow item counts as a control.
   Never buy (at the store's purchase sheet record the plans and prices shown, then Back), never sign in with a real account or create one (record the sign-in options, then stop on that branch), never send, post, call, share to a person, rate, report or delete an account (record the sheet or intent, then Back). An ad: record its type (full screen, banner, native), the screen and the tap that brought it, then close it.
4. Every input field: submit it empty, then one invalid value for each rule it may have (too long, letters in a number, negative, zero, a malformed email or URL), then a valid value; record "- field S<nn>/<label>: <input> → \\"<the exact message>\\" (<where it shows>)". Every calculation or generated output (a total, a conversion, a score, a generated text or file): run it with 3 different inputs and record "input → output" exactly, so the formula can be derived from them.
5. States: the first launch (onboarding, the permission dialogs: which permission, on which screen, its text — then allow it); empty states (this is a fresh install); offline — \`${ADB} -s S shell cmd connectivity airplane-mode enable\`, reopen each screen that loaded data and record what it shows, then \`… disable\`; persistence — create one record and change one setting, \`${ADB} -s S shell am force-stop <package>\`, relaunch, record what is still there; dark mode — \`${ADB} -s S shell cmd uimode night yes\`, reopen S01, one screenshot source-app/screens/S01-dark.png, record whether the app follows it, then \`night no\`; notifications it posts (\`${ADB} -s S shell dumpsys notification --noredact | grep -A4 <package>\`).
6. End of walk.md: "## Navigation" — a table | from | tap | to | with one row per action of step 3; "## Fields and outputs" — the lines of step 4; "## States" — step 5; "## Not reached" — every control that leads somewhere you did not go, and why.
7. \`${P} log source "walk: <n> screens, <n> fields, <n> outputs"\` after every 5 screens and at the end.
8. Always, also after a failure: \`${ADB} -s S uninstall <package>\`, \`${ADB} -s S emu kill\`, \`${P} devices release "${DIR}"\`.
Return walked (screens), fields, outputs, navigation (rows), notReached, note.`
  const opts = { label: 'audit: walk', phase: 'Audit', schema: obj(['walked', 'fields', 'outputs', 'navigation', 'notReached'], { walked: int, fields: int, outputs: int, navigation: int, notReached: strs, note: str }), effort: 'high' }
  return agent(prompt, { ...opts, agentType: 'app-factory:tester' }).catch((e) => {
    log(`walk: tester sub-agent unavailable (${String(e && e.message || e).slice(0, 120)}) — running as a plain agent`)
    return agent(prompt, opts)
  })
}
const [st, sa, wk] = await parallel([store, ...(APK ? [staticAudit, walk] : [])])
log(`audit: store ${st ? `${st.features} feature(s), ${st.screenshots} screenshot(s), ${st.pages} page(s)` : 'no result'}${APK ? ` · APK ${sa ? `${sa.framework}, ${sa.dependencies} dependencies, ${sa.ownScreens} own screens` : 'no result'} · walk ${wk ? `${wk.walked} screen(s), ${wk.fields} field(s), ${wk.outputs} output(s)${wk.note ? ` — ${wk.note}` : ''}` : 'no result'}` : ''}`)
if (!st) return { aborted: true, stop: 'the store audit returned no result — run again' }
const WALKED = Boolean(wk && wk.walked > 0)

// ───────────────────────────── Report: PRD.md + the new theme, gated by the checker ─────────────────────────────
phase('Report')
const report = await agent(
  `${WHERE}
REPORT — write PRD.md and source-app/theme.json from the evidence: source-app/store.md${APK ? ', source-app/static.md' : ''}${WALKED ? ', source-app/walk.md' : ''} and the screenshots they list (Read the ones you need). Read every evidence file in full first, in one turn. PRD.md is what /app-factory:build-app builds from: the new app has EVERY capability of the source app, reached the same way (same screens, controls, order and flows), with a NEW theme — and nothing it did not have. ${WALKED ? '' : APK ? 'The walk did not run (see walk.md or its absence): screens come from the APK\'s own screen files and the store screenshots — say so in Sources. ' : 'There was no APK: screens come from the store screenshots (P ids) and the listing only — say so in Sources, and mark every rule no source states NOT OBSERVED. '}Never change source-app/*.md.
Every requirement line — each bullet, numbered line and table row outside "Theme", "Not copied" and "Sources" — ends with its source: [walk: S07], [walk: S07 → S09], [store: F03], [store: P02], [store: <url>], [static: D04], [web: <url>], [user] (from the user's note or name), or ASSUMED (a choice you made, with why) or NOT OBSERVED (no source shows it; then the behaviour the build uses, ASSUMED). A URL you cite must be in store.md's "Fetched" list.
Sections — exactly these headings, numbered, in this order:
## 1. App — the new app's name: ${ARGS.name ? `"${String(ARGS.name).replace(/"/g, '')}" [user]` : 'one you choose — not the source app\'s name and not confusable with it — ASSUMED'}; what it does, one sentence; the source app (title, developer, package, App Store id, version audited).
## 2. Platforms — iOS and Android phones; tablets only if the source supports them (supportedDevices, supports-screens); minimum OS; orientation; languages (the new app: English, ASSUMED, unless the note says otherwise); dark mode as the source.
## 3. Screens — one "### S<nn> · <name>" per screen (${WALKED ? 'each S id of walk.md' : 'each own screen file or store screenshot'}): purpose; every element top to bottom with its exact label or hint (functional texts kept as they are; the source's brand name replaced by the new name); each action → where it leads; its empty, loading, error and offline states.
## 4. Navigation — the | from | tap | to | table${WALKED ? ' (every row of walk.md\'s)' : ''} and the first-launch flow.
## 5. Fields — | screen | field | type | required | limits | exact error messages | placeholder |, one row per input field; a limit no source shows: NOT OBSERVED, then the value used, ASSUMED.
## 6. Features — one "### <capability>" per capability: inputs → rules → outputs (a formula derived from the walk's input → output records, with the records quoted), what it stores, its errors and limits.
## 7. Data and backend — what the source keeps on the device and what on its servers (Data safety, the walk's persistence check, the SDKs); accounts and sign-in options; sync; backup. For the new app: the same capability on its OWN services — never the source's servers, endpoints, Firebase project or keys. Each external service a feature needs (sign-in, a cloud database, an AI or other paid API, maps) is one line "<feature> needs <service> — no key provided", so /app-factory:build-app's contract finds a free no-key service or a "not available" message for it, or asks for the key.
## 8. Monetisation — ads seen (type, screen, the tap that showed it), the plans and prices, what Premium unlocks (the paywall's texts), free limits seen. (build-app adds the team's ads + Premium pattern; this tells its contract what the source did.)
## 9. Permissions and notifications — each permission: when it is asked (screen) and what it is for; each notification posted.
## 10. Settings — every setting and what it changes.
## 11. Theme — the new look. The source app's palette first: measure it with \`${CHECK} palette <screenshot.png>…\` (the 12 most used exact colours) on ${WALKED ? 'S01 and two other walk screenshots' : 'the store screenshots (convert a jpeg or webp first: `sips -s format png <f> --out ' + SCRATCH + '/<name>.png`)'}${APK ? ', and static.md\'s Colours' : ''}; its primary = the colour of its app bar or main buttons, secondary = its accent; say where each was read. Then the new palette as a table | role | light hex | dark hex | used for | with the ten roles primary, onPrimary, secondary, onSecondary, background, onBackground, surface, onSurface, error, onError — a different colour family, not a shade of the old: the new primary and secondary each at least 60° of hue from the source's (or ≥ 150 apart in RGB for a grey), every on-colour at least 4.5:1 on its base. Dark hexes only if the source follows dark mode (walk S01-dark, or a DayNight theme). Then the rest of the new look, as exact values: font (the platform font — San Francisco / Roboto — unless the note says otherwise), corner radius of cards, buttons, fields and sheets, elevation (shadow or none), icon style (Material Symbols outlined or rounded). Layout, controls and their order stay the source's.
## 12. Not copied — the source's name, logo and app icon, illustrations, photos and mascots, marketing texts, fonts that are not free, and its keys, IDs, servers and endpoints; the new app's icon: Flutter's default for now unless the user gives one (the contract asks).
## 13. Coverage — | id | what was seen | where it is in this PRD | built or left out (why) |, one row for EVERY S, F, D and P id in the evidence files. Leave out only an SDK with no user-visible capability (analytics, crash reporting, attribution, the framework's own) or what "Not copied" lists — every other id is built.
## 14. Sources — every URL fetched, the APK (file name, package, version, \`shasum -a 256\`)${APK ? '' : ' — "no APK was given or found on a connected phone"'}, the walk (emulator, date)${WALKED ? '' : ' — "not walked: <why>"'}, and what could not be observed.
The screenshots in source-app/ show the OLD theme: they are evidence, never mockups or design — PRD.md never calls them that (build-app would compare the new app's pixels with them).
source-app/theme.json: {"source": {"primary": "#RRGGBB", "secondary": "#RRGGBB", "evidence": "<where each was read>"}, "colors": [{"role": "primary", "hex": "#RRGGBB", "use": "<what>"}, … all ten roles], "dark": [the same ten, only with dark mode]} — the exact hexes of the Theme table; build-app's colour check then lets the code use these colours and no others.
Then run \`${CHECK} check .${APK ? ' --apk' : ''}\`. It lists every problem: an untagged line, a vague word, an id from the evidence missing in PRD.md, a cited id or URL the evidence does not have, a file named that does not exist, a missing section, a theme role, a colour too close to the source's or text below 4.5:1. Fix PRD.md or theme.json and run it again until it prints "audit ready" — never weaken a line to pass (a requirement turned into a vague one fails review the same way).
Then \`rm -rf "${SCRATCH}"\` (the raw dumps) and \`${P} log source "PRD.md ready: <n> screens, <n> features, <n> fields, <n> ASSUMED, <n> NOT OBSERVED"\`. Return the counts and the checker's last line.`,
  { label: 'report: PRD + theme', phase: 'Report', schema: obj(['ready', 'screens', 'features', 'fields', 'assumed', 'notObserved', 'check'], { ready: bool, name: str, screens: int, features: int, fields: int, assumed: int, notObserved: int, check: str }), effort: 'high' },
)
if (!report || !report.ready) {
  log(`PRD.md did not pass the audit check${report ? `: ${report.check}` : ''} — fix what \`source-app.mjs check . ${APK ? '--apk' : ''}\` lists, then run /app-factory:build-app {"noFigma":true}`)
  return { aborted: true, report }
}
log(`PRD.md ready${report.name ? ` for "${report.name}"` : ''}: ${report.screens} screen(s), ${report.features} feature(s), ${report.fields} field(s), ${report.assumed} ASSUMED, ${report.notObserved} NOT OBSERVED`)
const buildArgs = `{"noFigma":true${ARGS.note ? `,"note":${JSON.stringify(String(ARGS.note))}` : ''}}`
return {
  done: true,
  report,
  evidence: { store: st, apk: sa || null, walk: wk || null, apkFrom: src.apkFrom },
  nextStep: `Tell the user in two lines: the source app was audited (${report.screens} screens, ${report.features} features, ${report.fields} fields; ${report.assumed} ASSUMED, ${report.notObserved} NOT OBSERVED — listed in PRD.md), and PRD.md, source-app/ (evidence and screenshots) and source-app/theme.json (the new palette) are in the project. Then, in this same chat, run the workflow app-factory:build-app (the /app-factory:build-app command) with args ${buildArgs} and follow its nextStep as always — it writes the contract from PRD.md, asks its questions, and builds.`,
}
