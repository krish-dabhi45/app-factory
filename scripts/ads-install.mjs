#!/usr/bin/env node
// Installs the team's ads + Remote Config implementation (skills/flutter-ads/SKILL.md) into a Flutter app — the only way
// app-factory adds ads. The implementation is the team's own change, nothing written by app-factory: the AI PPT app
// before its ads (PRE: /Users/mach/ads-testing.v2 commit 5ac9743 — the team's app base with its ad code in comments) and
// the team's build of it with its ads (PPT: /Users/mach/testing/ai_ppt_generater). Every file the team changed or added
// for the ads is in CHANGE; the team's other edits in that build are in NOT_ADS with the reason; the selftest fails when
// the two builds differ in a file that is in neither, so no part of the team's change can be missed.
// templates/flutter/ads/ is built from the two by `template` (before/, after/, base/, RECIPE.md), never edited by hand.
//
// An app file that is the team's file before its ads becomes the team's file after them, byte for byte. A team-base file
// that differs gets the team's change by a 3-way merge (git merge-file); the app's other lines stay. A screen that is not
// the team's screen is wired by hand from RECIPE.md (the team's own diff, with PPT file:line), checked by T1 / T2.
//   node ads-install.mjs <project>                 → what it did; exit 1 with NOT DONE lines it cannot do
//   node ads-install.mjs changes <project> <base>  → <project>/ADS_CHANGES.md: every file changed since <base> + checks
//   node ads-install.mjs verify <project> <base>   → skills/ads-implementation steps 8.1, 8.2, 8.4 and 9 in one call
//   node ads-install.mjs placements <project>      → every ad site in the app's code (file:line)
//   node ads-install.mjs seen <project> <serial> <placement> → that ad on the device screen now, whole: PASS / FAIL + screenshot
//   node ads-install.mjs proof <project>           → exit 1 until every placement has a PASS
//   node ads-install.mjs reset <project>           → revert app-factory's ads commits; a file the app had is never removed
//   node ads-install.mjs template                  → rebuild templates/flutter/ads/ from the team's two builds
//   node ads-install.mjs selftest
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const PPT = process.env.ADS_PPT || '/Users/mach/testing/ai_ppt_generater'
const PRE = process.env.ADS_PRE || '/Users/mach/ads-testing.v2@5ac9743' // <git repo>@<commit>: the PPT app before its ads
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'flutter', 'ads')
// the team build's own names, replaced per app (forApp)
const PKG = 'ai_ppt_generater', KEY = 'ai_ppt_maker_v1', KT_PKG = 'com.example.pptmaker'
const KT_MAIN = 'android/app/src/main/kotlin/com/example/pptmaker/MainActivity.kt'
const RES = 'android/app/src/main/res'
const MANIFEST = 'android/app/src/main/AndroidManifest.xml'

// ---- the team's ads change ----
// lib/ads: the app's copy becomes the team's (a file the app lacks is copied)
const ADS = ['lib/ads/ads_splash_utils.dart', 'lib/ads/ads_variable.dart', 'lib/ads/ads_load_util.dart', 'lib/ads/app_open_ad.dart',
  'lib/ads/banner_widget.dart', 'lib/ads/life_cycle.dart', 'lib/ads/ads_collapsible_banner.dart']
// the team's app base outside lib/ads: the team's change applied to the app's copy (a 3-way merge)
const BASE_FILES = ['lib/AdsUtils/dialog.dart', 'lib/in_app_purchase/initPlatformState.dart', 'lib/service/app_constant.dart',
  'pubspec.yaml', 'android/settings.gradle', 'android/app/build.gradle', MANIFEST, KT_MAIN,
  `${RES}/values/styles.xml`, `${RES}/values-night/styles.xml`, `${RES}/values-v35/styles.xml`, `${RES}/values-night-v35/styles.xml`,
  `${RES}/layout/native_admob_small.xml`, `${RES}/layout/native_admob_big.xml`, `${RES}/layout/native_admob_full.xml`,
  `${RES}/font/poppinsmedium.ttf`, `${RES}/font/poppinsbold.ttf`, `${RES}/font/poppinsregular.ttf`]
// the app's own screens: the team's file when the app's is the team's before; otherwise by hand from RECIPE.md
const SCREENS = ['lib/screens/splash_screen.dart', 'lib/screens/onboarding_screen.dart', 'lib/screens/home_screen.dart',
  'lib/screens/select_template_screen.dart', 'lib/screens/template_preview_screen.dart', 'lib/screens/setting_screen.dart']
const CHANGE = [...ADS, ...BASE_FILES, ...SCREENS]
// the team's other edits in the same build: nothing in them is ads or changes what the app does
const NOT_ADS = {
  'lib/generated/assets.dart': 'reformatted only',
  'lib/screens/preview_screen.dart': 'an import of the app\'s pptx_viewer.dart',
  'lib/screens/show_pptx_file_screen.dart': 'an import of pptx_viewer.dart and a commented-out block',
  'lib/service/api_service.dart': 'two imports nothing uses',
  'lib/AdsUtils/Permission_Manager.dart': 'every line commented out', 'lib/AdsUtils/initialized.dart': 'every line commented out',
  'lib/service/sharedPreferencesService.dart': 'every line commented out',
  [`${RES}/MainActivity.kt`]: 'a Kotlin file inside res/ (another app\'s package): never compiled',
  [`${RES}/values/colors.xml`]: 'colours no layout, style or code uses',
  ...Object.fromEntries(['circular_button_background.xml', 'circular_layout_background.xml', 'circular_textview_background.xml', 'rounded_corner.xml',
    'rounded_corner_ad.xml', 'info.png', 'setting.png', 'starred.png'].map((f) => [`${RES}/drawable/${f}`, 'a drawable nothing uses'])),
  ...Object.fromEntries(['bold.ttf', 'medium.ttf', 'regular.ttf', 'poppinssemibold.ttf', 'polymathdemobold.otf', 'polymathdemomedium.otf', 'polymathdemoregular.otf']
    .map((f) => [`${RES}/font/${f}`, 'a font no layout uses (the native layouts use poppinsbold / poppinsmedium / poppinsregular)'])),
}
// The team's change plus these fixes is what the installer applies (after/ = the team's file with its fixes). Each is an
// exact replacement (LF text; the file keeps its line endings); `template` fails when one no longer matches. Only ads that
// do not show are fixed here, each seen on a device (emulator af-standard, release build, 2026-10-29).
const FIXES = [
  { id: 'F1', file: 'lib/ads/ads_load_util.dart', why: 'onTapInter waits a fixed 2 s after InterstitialAd.load(), whose Future ends when the request is sent, not when the ad arrives: a load over 2 s → showInterCommon finds commonInterAd null, no interstitial (Use Template, log "commonInterAd------>null"). loadInterCommon now waits for the ad (or its failure), 10 s at most, as the team\'s loadRewardedAd does (:107-139)',
    from: '    if (adUnitId != "11") {\n      await InterstitialAd.load(', to: '    if (adUnitId != "11") {\n      final loaded = Completer<void>(); // app-factory F1: wait for the ad, as loadRewardedAd does\n      await InterstitialAd.load(' },
  { id: 'F1', file: 'lib/ads/ads_load_util.dart', from: '            commonInterAd = ad;\n            adLoad.value = 0;\n', to: '            commonInterAd = ad;\n            adLoad.value = 0;\n            if (!loaded.isCompleted) loaded.complete();\n' },
  { id: 'F1', file: 'lib/ads/ads_load_util.dart', from: "            showLog('InterstitialAd failed to load loadInter: $error');\n", to: "            showLog('InterstitialAd failed to load loadInter: $error');\n            if (!loaded.isCompleted) loaded.complete();\n" },
  { id: 'F1', file: 'lib/ads/ads_load_util.dart', from: '      );\n    } else {\n      showLog("ELSE -----");', to: '      );\n      await loaded.future.timeout(const Duration(seconds: 10), onTimeout: () {});\n    } else {\n      showLog("ELSE -----");' },
  { id: 'F2', file: 'lib/ads/ads_load_util.dart', why: 'showInterCommon with no ad called navigateScreen() and went on to commonInterAd! — a null-check exception (stack trace at ads_load_util.dart:227 on the device)',
    from: '    if (commonInterAd == null) {\n      // await loadInterCommon((AdsVariable.interPreLoad));\n      navigateScreen();\n    }\n', to: '    if (commonInterAd == null) {\n      // await loadInterCommon((AdsVariable.interPreLoad));\n      navigateScreen();\n      return; // app-factory F2\n    }\n' },
  { id: 'F3', file: 'lib/ads/ads_load_util.dart', why: 'every native shared one static nativeAd: the splash loads the home and the intro native at once (log 13:30:53.708 / .711), so a failing one disposed the other (nativeAd!.dispose()) and loadNative could return the other\'s ad; and one shared loaded / failed flag decided every NativeAdsWidget — the intro native did not show and, with it, Next / Done. Each native now keeps its own ad and its own loaded / failed state',
    from: '  static RxBool isNativeAdFailed = false.obs;\n', to: '  static RxBool isNativeAdFailed = false.obs;\n  // app-factory F3: each native\'s own state (the flags above stay for the screens\' conditions)\n  static final Set<Ad> loadedNatives = {}, failedNatives = {};\n  static RxInt nativeEvents = 0.obs;\n' },
  { id: 'F3', file: 'lib/ads/ads_load_util.dart', from: '    nativeAd = NativeAd(\n', to: '    final NativeAd thisAd = NativeAd( // app-factory F3\n' },
  { id: 'F3', file: 'lib/ads/ads_load_util.dart', from: "          showLog('isLoaded loadNative ${isNativeAdLoaded.value}');\n", to: "          showLog('isLoaded loadNative ${isNativeAdLoaded.value}');\n          loadedNatives.add(ad);\n          nativeEvents.value++;\n" },
  { id: 'F3', file: 'lib/ads/ads_load_util.dart', from: "          showLog('onAdFailedToLoad loadNative');\n          nativeAd!.dispose();\n", to: "          showLog('onAdFailedToLoad loadNative $error');\n          ad.dispose();\n          failedNatives.add(ad);\n          nativeEvents.value++;\n" },
  { id: 'F3', file: 'lib/ads/ads_load_util.dart', from: '    await nativeAd!.load();\n    return nativeAd!;\n', to: '    nativeAd = thisAd;\n    await thisAd.load();\n    return thisAd;\n' },
  { id: 'F3', file: 'lib/ads/ads_load_util.dart', from: '          ? !AdsLoadUtil.isNativeAdFailed.value && widget.showNativeAd != null\n                ? Obx(\n                    () => AdsLoadUtil.isNativeAdLoaded.value\n',
    to: '          ? AdsLoadUtil.nativeEvents.value >= 0 && widget.showNativeAd != null && !AdsLoadUtil.failedNatives.contains(widget.showNativeAd) // app-factory F3\n                ? Obx(\n                    () => AdsLoadUtil.nativeEvents.value >= 0 && AdsLoadUtil.loadedNatives.contains(widget.showNativeAd)\n' },
  { id: 'F4', file: 'lib/screens/onboarding_screen.dart', why: 'Continue showed only when nativeIntroBig == "11" and Next / Done only once the intro native loaded: an intro native that failed to load left every intro page with no button (device: pages 1-3, no Continue, no Done). Continue now shows whenever Next / Done does not',
    from: '                        if(AdsVariable.nativeIntroBig == "11"/* && AdsLoadUtil.isNativeAdLoaded.value != true && AdsVariable.isPurchase.value*/)\n',
    to: '                        if (!(AdsVariable.nativeIntroBig != "11" && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value)) // app-factory F4: Continue whenever Next / Done is not shown\n' },
  { id: 'F4', file: 'lib/screens/onboarding_screen.dart', why: 'Next / Done is a child of the outer Stack, outside any Obx: its condition was read once, when the screen was built. A native that loads after that (any slower load: device, 2026-10-30, intro with the native on screen and no Next and, with Continue now reactive, no Continue) left no button at all. It is now built again when the native loads; the position (top 50.w, right 50.w) and the button are the team\'s',
    from: '                if(AdsVariable.nativeIntroBig != "11" && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value)\n                  Positioned(\n                    top: 50.w,\n                    right: 50.w,\n                    child: Obx(() => PressUnPressWidget(child: appText(title: _activePage.value == 2 ? "Done" : "Next"',
    to: '                Positioned.fill( // app-factory F4: built again when the native loads\n                  child: Obx(() => (AdsVariable.nativeIntroBig != "11" && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value)\n                    ? Align(\n                        alignment: Alignment.topRight,\n                        child: Padding(\n                          padding: EdgeInsets.only(top: 50.w, right: 50.w),\n                          child: Obx(() => PressUnPressWidget(child: appText(title: _activePage.value == 2 ? "Done" : "Next"' },
  { id: 'F4', file: 'lib/screens/onboarding_screen.dart', from: '                      },\n                    ),\n                    ),\n                  )\n              ],\n', to: '                      },\n                    ),\n                    ),\n                        ),\n                      )\n                    : const SizedBox.shrink()),\n                )\n              ],\n' },
]
const withFixes = (f, buf) => {
  const mine = FIXES.filter((x) => x.file === f); if (!mine.length) return buf
  const raw = buf.toString(); let t = lf(raw)
  for (const x of mine) { if (!t.includes(x.from)) throw new Error(`${x.id} ${f}: the team's text it replaces is not there any more — check the fix against the team's file`); t = t.replace(x.from, x.to) }
  return Buffer.from(inEol(t, raw))
}
// generated by Flutter / Gradle / Xcode / the IDE — not source
const BUILD_OUTPUT = /(^|\/)(\.git|\.dart_tool|\.idea|\.gradle|\.kotlin|build|Pods|ephemeral|xcuserdata|swiftpm|\.claude)(\/|$)|\.iml$|(^|\/)(\.flutter-plugins(-dependencies)?|local\.properties|gradlew(\.bat)?|gradle-wrapper\.jar|Generated\.xcconfig|flutter_export_environment\.sh|GeneratedPluginRegistrant\.\w+|pubspec\.lock|Podfile\.lock|\.DS_Store)$/
// the team-base helpers lib/ads imports (unchanged by the team's change), and the definition that shows the app has its own
// (then that file is imported instead of a copy). custom_widgets.dart is not copied: it imports the team app's screens.
const SUPPORT = [
  ['service/app_connectivity.dart', /Future<bool>\s+checkConnectivity\s*\(/],
  ['service/shimmer_layout.dart', /class\s+Shimmer\s+extends/],
  ['AdsUtils/shimmer.dart', /class\s+ShimmerSmallNative\b/],
  ['AdsUtils/shimmer_banner.dart', /class\s+BannerShimmerWidget\b/],
  ['AdsUtils/loading_screen.dart', /\bloadingScreen\s*=\s*LoadingScreen\(/],
  ['in_app_purchase/store_config.dart', /class\s+StoreConfig\b/],
  ['in_app_purchase/constant.dart', /\bappleApiKey\s*=/],
  ['widgets/custom_widgets.dart', /void\s+showLog\s*\(/, 'the team\'s showLog / showToast / appText (PPT lib/widgets/custom_widgets.dart)'],
]

const read = (f) => fs.readFileSync(f, 'utf8')
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))])
const put = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t) }
const isImport = (l) => /^import\s/.test(l)
const isText = (f) => !/\.(ttf|otf|png|jpe?g|webp)$/.test(f)
const lf = (t) => t.replaceAll('\r\n', '\n')
const crlf = (t) => (t.match(/\r\n/g) || []).length * 2 > (t.match(/\n/g) || []).length // mostly CRLF
const inEol = (t, like) => crlf(like) ? lf(t).replace(/\n/g, '\r\n') : lf(t)
// Dart/Kotlin text with every /* … */ (nested) and // comment turned into spaces, line breaks kept; quotes respected.
function blank(t, lineComments = true) {
  let out = '', i = 0, depth = 0, q = ''
  while (i < t.length) {
    const two = t.slice(i, i + 2)
    if (depth) { const d = two === '/*' ? 1 : two === '*/' ? -1 : 0; if (d) { depth += d; out += '  '; i += 2 } else { out += t[i] === '\n' ? '\n' : ' '; i++ } }
    else if (q) { if (t[i] === '\\') { out += two; i += 2 } else if (t.startsWith(q, i)) { out += q; i += q.length; q = '' } else { out += t[i]; i++ } }
    else if (two === '/*') { depth = 1; out += '  '; i += 2 }
    else if (two === '//') { const e = t.indexOf('\n', i) < 0 ? t.length : t.indexOf('\n', i); out += lineComments ? ' '.repeat(e - i) : t.slice(i, e); i = e }
    else if (t[i] === "'" || t[i] === '"') { q = t.startsWith(t[i].repeat(3), i) ? t[i].repeat(3) : t[i]; out += q; i += q.length }
    else { out += t[i]; i++ }
  }
  return out
}
// a line diff (longest common subsequence on trimmed lines): the lines only in `b`, and the lines only in `a`
function lineDiff(a, b) {
  const k = (l) => l.trim(), A = lf(a).split('\n'), B = lf(b).split('\n'), n = A.length, m = B.length
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = k(A[i]) === k(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const added = [], removed = []; let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && k(A[i]) === k(B[j])) { i++; j++ }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { added.push([B[j], j + 1]); j++ }
    else { removed.push([A[i], i + 1]); i++ }
  }
  return { added, removed }
}

// ---- the two builds → templates/flutter/ads/ ----
const [PRE_REPO, PRE_REV] = PRE.split('@')
const preFiles = () => execFileSync('git', ['-C', PRE_REPO, 'ls-tree', '-r', '--name-only', PRE_REV], { encoding: 'utf8' }).split('\n').filter(Boolean)
const preRead = (f) => { try { return execFileSync('git', ['-C', PRE_REPO, 'show', `${PRE_REV}:${f}`], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
// The pre-ads commit lived in a temp git dir (ads-testing.v2's shadow.git) that macOS cleaned on 2026-10-30. What the change
// needs of it is stored in templates/flutter/ads/before/ (every changed file as it was); the rest of the pre-ads app equals
// the team's build file for file (verified against the commit while it existed; only NOT_ADS differ). A rebuild of the
// template is rebuilt from the stored before/ when the commit is gone (ADS_PRE=<git repo>@<commit> brings the commit back).
const preReadable = () => { try { execFileSync('git', ['-C', PRE_REPO, 'cat-file', '-e', `${PRE_REV}^{commit}`], { stdio: 'ignore' }); return true } catch { return false } }
const pptRead = (f) => fs.existsSync(path.join(PPT, f)) ? fs.readFileSync(path.join(PPT, f)) : null
// the files the two builds differ in (build output left out)
export function teamDiff() {
  const pre = new Set(preFiles().filter((f) => !BUILD_OUTPUT.test(f))), ppt = new Set(walk(PPT).filter((f) => !BUILD_OUTPUT.test(f)))
  return [...new Set([...pre, ...ppt])].filter((f) => { const a = pre.has(f) ? preRead(f) : null, b = ppt.has(f) ? pptRead(f) : null; return !a || !b || !a.equals(b) }).sort()
}
export function reference() {
  const m = new Map(), commit = preReadable() // the commit when it can be read, else the stored before/ (the same bytes, kept in the plugin)
  for (const f of CHANGE) {
    const b = commit ? preRead(f) : tplBuf(`before/${f}`), a = pptRead(f)
    if (!a) throw new Error(`${PPT}/${f} missing`)
    if (b) m.set(`before/${f}`, b)
    m.set(`after/${f}`, withFixes(f, a))
  }
  // the helpers, as the team app has them; another app's RevenueCat keys are never copied (the app's own go there)
  for (const [rel, , no] of SUPPORT) if (!no) m.set(`base/lib/${rel}`, pptRead(`lib/${rel}`))
  m.set('base/lib/in_app_purchase/constant.dart', Buffer.from(lf(pptRead('lib/in_app_purchase/constant.dart').toString()).replace(/^(const \w+ = )(['"]).*\2;$/gm, '$1"";')))
  // RECIPE.md: the team's change, file by file — what an app's own screens get by hand
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-recipe-'))
  const recipe = ['# The team\'s ads change', '',
    `Generated by \`ads-install.mjs template\` from the AI PPT app before its ads (\`${PRE}\`) and the team's build with its ads (\`${PPT}\`): \`git diff\` of every file in the change, line endings ignored. Line numbers are the team's files'. Never edited by hand.`, '']
  recipe.push('New files, copied whole by the installer: ' + CHANGE.filter((f) => !m.has(`before/${f}`)).map((f) => `\`${f}\``).join(', ') + '.', '')
  for (const f of CHANGE.filter((f) => isText(f) && m.has(`before/${f}`))) {
    const b = path.join(tmp, 'b'), a = path.join(tmp, 'a')
    fs.writeFileSync(b, lf((m.get(`before/${f}`) || '').toString())); fs.writeFileSync(a, lf(m.get(`after/${f}`).toString()))
    const d = spawnSync('git', ['diff', '--no-index', '-U3', '--', b, a], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode)/.test(l)).join('\n').trimEnd()
    recipe.push(`## \`${f}\``, '', `PPT \`${PPT}/${f}\``, '', '```diff', d, '```', '')
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  m.set('RECIPE.md', recipe.join('\n'))
  // pubspec lines for an app without the team's commented ones: the team's line for each package lib/ads and its helpers import
  const pub = lf(pptRead('pubspec.yaml').toString()), pkgs = new Set()
  for (const [f, t] of m) if (/^(after\/lib\/ads|base)\/.*\.dart$/.test(f)) for (const [, p] of t.toString().matchAll(/^import 'package:(\w+)\//gm)) if (p !== PKG && p !== 'flutter') pkgs.add(p)
  m.set('pubspec_lines.txt', [...pkgs].sort().map((p) => { const l = pub.match(new RegExp(`^  ${p}:.*$`, 'm')); if (!l) throw new Error(`PPT pubspec.yaml has no ${p}`); return l[0] }).join('\n') + '\n')
  return m
}
const OWN_TEMPLATE = ['ios', 'config.json'] // app-factory's iOS AppDelegate for an app with no factories; config.json's test values
function writeTemplate() {
  const m = reference() // read everything first: before/ is removed and written again below
  for (const d of fs.readdirSync(TEMPLATE)) if (!OWN_TEMPLATE.includes(d)) fs.rmSync(path.join(TEMPLATE, d), { recursive: true, force: true })
  for (const [f, t] of m) put(path.join(TEMPLATE, f), t)
  return `wrote ${m.size} files to templates/flutter/ads/ from ${preReadable() ? PRE : 'the stored before/'} (before) and ${PPT} (after)`
}
const tplBuf = (f) => fs.existsSync(path.join(TEMPLATE, f)) ? fs.readFileSync(path.join(TEMPLATE, f)) : null
const tpl = (f) => tplBuf(f)?.toString() ?? null

// ---- merge: lines of `ref` that `app` lacks are added; the app's own lines are never changed or removed ----
// (only for an app's own copy of a lib/ads file the team added, which has no "before" to merge against)
export function merge(app, ref) {
  const k = (l) => l.trim(), A0 = app.split('\n'), R0 = ref.split('\n')
  const have = new Set(A0.map(k)), newImps = R0.filter((l) => isImport(l) && !have.has(k(l)))
  const last = A0.findLastIndex(isImport)
  const A = last < 0 ? [...newImps, ...A0] : [...A0.slice(0, last + 1), ...newImps, ...A0.slice(last + 1)]
  const R = R0.filter((l) => !isImport(l))
  const dupComment = (l) => /^\s*(\/\/|<!--)/.test(l) && have.has(k(l))
  const n = A.length, m = R.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = k(A[i]) === k(R[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out = []; let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && k(A[i]) === k(R[j])) { out.push(A[i]); i++; j++ }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { if (!dupComment(R[j])) out.push(R[j]); j++ }
    else { out.push(A[i]); i++ }
  }
  return out.join('\n')
}
// the team's change (before → after) applied to the app's text; null when they touch the same lines (a conflict)
function merge3(app, before, after) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-merge-')), f = (n, t) => { fs.writeFileSync(path.join(d, n), lf(t)); return path.join(d, n) }
  const r = spawnSync('git', ['merge-file', '-p', f('app', app), f('before', before), f('after', after)], { encoding: 'utf8', maxBuffer: 64 << 20 })
  fs.rmSync(d, { recursive: true, force: true })
  return r.status === 0 ? r.stdout : null
}

// ---- the app ----
function appOf(root) {
  if (!fs.existsSync(path.join(root, 'pubspec.yaml'))) throw new Error(`no pubspec.yaml in ${root}`)
  const name = (read(path.join(root, 'pubspec.yaml')).match(/^name:\s*(\S+)/m) || [])[1]
  const src = path.join(root, 'android/app/src/main')
  const main = fs.existsSync(src) && walk(src).find((f) => /^(kotlin|java)\/.*\/MainActivity\.kt$/.test(f))
  const mainPath = main ? path.join(src, main) : undefined
  const ktPkg = mainPath && (read(mainPath).match(/^package\s+([\w.]+)/m) || [])[1]
  const gradle = ['android/app/build.gradle', 'android/app/build.gradle.kts'].find((f) => fs.existsSync(path.join(root, f)))
  const appId = (gradle && (read(path.join(root, gradle)).match(/applicationId\s*=?\s*["']([\w.]+)["']/) || [])[1]) || ktPkg
  const lib = path.join(root, 'lib'), dart = fs.existsSync(lib) ? walk(lib).filter((f) => f.endsWith('.dart')).sort() : []
  const live = new Map(dart.map((f) => [f, blank(read(path.join(lib, f)))]))
  // the parameter it already reads, else <pubspec name>_v1 (the team's form: ai_ppt_maker_v1)
  const key = [...live.values()].map((t) => (t.match(/\.getValue\(\s*"([^"]+)"\s*\)/) || [])[1]).find(Boolean) || `${name}_v1`
  const paths = {}
  for (const [rel, re] of SUPPORT) {
    const own = dart.find((f) => !ADS.includes(`lib/${f}`) && re.test(live.get(f)))
    if (own) paths[rel] = own
  }
  return { name, mainPath, ktPkg, appId, gradle, key, paths }
}
// the team's text with the app's names: its package (and where its helpers are), its parameter, its Android ids
const forApp = (t, a, file = '') => t.replace(new RegExp(`package:${PKG}/([\\w/]+\\.dart)`, 'g'), (x, r) => `package:${a.name}/${a.paths[r] || r}`)
  .replaceAll(`"${KEY}"`, `"${a.key}"`)
  .replaceAll(KT_PKG, file.endsWith('.kt') ? a.ktPkg : a.appId)
  .replace(/^name: ai_ppt_generater$/m, `name: ${a.name}`)
const appPath = (f, a, root) => f === KT_MAIN ? path.relative(root, a.mainPath) : f

// the team's manifest and Gradle lines, for an app whose own file the team's change does not merge into (another base,
// Kotlin Gradle): each is checked to be in the team's file by the selftest
const appBlocks = (appId) => [
  ['com.google.android.gms.ads.APPLICATION_ID', `        <meta-data\n            android:name="com.google.android.gms.ads.APPLICATION_ID"\n            android:value="ca-app-pub-3940256099942544~3347511713" />\n`],
  ['com.google.android.gms.ads.AdActivity', `        <activity\n            android:name="com.google.android.gms.ads.AdActivity"\n            android:screenOrientation="portrait"\n            android:theme="@style/adsStyle"\n            tools:replace="android:theme" />\n`],
  ['com.facebook.sdk.AutoInitEnabled', `        <meta-data\n            android:name="com.facebook.sdk.AutoInitEnabled"\n            android:value="false" />\n`],
  ['com.facebook.internal.FacebookInitProvider', `        <provider\n            android:name="com.facebook.internal.FacebookInitProvider"\n            android:authorities="${appId}.FacebookInitProvider"\n            android:exported="false"\n            tools:replace="android:authorities" />\n`],
]
const QUERIES = `    <queries>\n        <provider android:authorities="com.facebook.katana.provider.PlatformProvider" /> <!-- allows app to access Facebook app features -->\n        <provider android:authorities="com.facebook.orca.provider.PlatformProvider" /> <!-- allows sharing to Messenger app -->\n    </queries>\n`
const GRADLE_DEPS = [['implementation', 'com.android.support:multidex:1.0.3'], ['coreLibraryDesugaring', 'com.android.tools:desugar_jdk_libs:2.1.4'],
  ['implementation', 'com.intuit.sdp:sdp-android:1.0.6'], ['implementation', 'com.facebook.android:facebook-android-sdk:latest.release'],
  ['implementation', 'platform("com.google.firebase:firebase-bom:34.19.0")'], ['implementation', 'com.google.firebase:firebase-analytics'],
  ['implementation', 'com.google.firebase:firebase-crashlytics'], ['implementation', 'com.google.firebase:firebase-crashlytics-ndk']]
const depLine = (kts, [c, d]) => d.startsWith('platform(') ? (kts ? `${c}(${d})` : `${c} ${d.replace(/"/g, "'")}`) : kts ? `${c}("${d}")` : `${c} '${d}'`
const FB_PLUGINS = [['com.google.gms.google-services', '4.4.4'], ['com.google.firebase.crashlytics', '3.0.3']]

export function install(root) {
  const a = appOf(root), done = [], todo = []
  const at = (...p) => path.join(root, ...p)
  if (!a.mainPath) throw new Error('no android/app/src/main/**/MainActivity.kt (Kotlin) — create the app with flutter create')
  const patch = (rel, test, edit, what) => {
    const raw = read(at(rel)), s = lf(raw); if (test(s)) return
    const n = edit(s); if (n === s) throw new Error(`${rel}: could not ${what}`)
    fs.writeFileSync(at(rel), inEol(n, raw)); done.push(`${rel}: ${what} (the team's lines)`)
  }
  // the helpers lib/ads imports: the app's own where it has one, else the team's file
  for (const [rel, , no] of SUPPORT) {
    if (a.paths[rel]) { if (a.paths[rel] !== rel) done.push(`uses the app's lib/${a.paths[rel]} (the team's lib/${rel})`); continue }
    if (fs.existsSync(at('lib', rel))) continue
    if (no) { todo.push(`the app has no showLog() / showToast() / appText(): add ${no}`); continue }
    put(at('lib', rel), forApp(tpl(`base/lib/${rel}`), a)); a.paths[rel] = rel; done.push(`added lib/${rel} (the team's)`)
    if (rel === 'in_app_purchase/constant.dart') todo.push(`lib/${rel}: the app's RevenueCat keys and entitlement (the team's form; empty now)`)
  }

  const fallback = [] // team-base files the team's change could not be applied to as files: their lines go in below
  for (const f of CHANGE) {
    const rel = appPath(f, a, root), text = isText(f)
    const after = text ? forApp(tpl(`after/${f}`), a, f) : tplBuf(`after/${f}`), beforeRaw = tpl(`before/${f}`), before = beforeRaw && forApp(beforeRaw, a, f)
    if (!fs.existsSync(at(rel))) {
      if (!before || ADS.includes(f)) { put(at(rel), after); done.push(`added ${rel} (the team's)`) }
      else if (SCREENS.includes(f) || f.startsWith('lib/')) todo.push(`${rel}: the app has no such file — RECIPE.md "${f}" goes by hand into the app's file that does the same job`)
      else fallback.push(f)
      continue
    }
    if (!text) continue
    const raw = read(at(rel))
    if (lf(raw) === lf(after)) continue
    if (before && raw === before) { fs.writeFileSync(at(rel), after); done.push(`${rel}: the team's file (the app's was the team's before its ads)`); continue }
    if (before && lf(raw) === lf(before)) { fs.writeFileSync(at(rel), inEol(after, raw)); done.push(`${rel}: the team's file (the app's was the team's before its ads)`); continue }
    if (SCREENS.includes(f)) { todo.push(`${rel}: not the team's screen — RECIPE.md "${f}" by hand (skills/flutter-ads section 2)`); continue }
    if (!before) { // the app's own copy of a lib/ads file the team added: the team's lines it lacks go in
      const m = merge(lf(raw), lf(after)); fs.writeFileSync(at(rel), inEol(m, raw)); done.push(`${rel}: the app's own file, the team's missing lines added`); continue
    }
    const m = merge3(raw, before, after)
    if (m !== null) { fs.writeFileSync(at(rel), inEol(m, raw)); done.push(`${rel}: the team's change merged into the app's file (its other lines kept)`) }
    else if (f.startsWith('lib/')) todo.push(`${rel}: the team's change and the app's file touch the same lines — RECIPE.md "${f}" by hand`)
    else fallback.push(f)
  }

  // the team-base files of another base (or Kotlin Gradle): the team's lines added to the app's own file
  const fb = (f) => fallback.includes(f)
  if (fb('pubspec.yaml')) for (const line of tpl('pubspec_lines.txt').trimEnd().split('\n')) {
    const p = line.trim().split(':')[0], commented = new RegExp(`^#\\s*${p}:`, 'm')
    patch('pubspec.yaml', (s) => new RegExp(`^  ${p}:`, 'm').test(s), (s) => commented.test(s) ? s.replace(new RegExp(`^#\\s*(${p}:.*)$`, 'm'), '  $1') : s.replace(/^dependencies:\n/m, (x) => `${x}${line}\n`), p)
  }
  const mainRel = path.relative(root, a.mainPath)
  if (fb(KT_MAIN)) {
    if (/^package [\w.]+\s+import io\.flutter\.embedding\.android\.FlutterActivity\s+class MainActivity\s*:\s*FlutterActivity\(\)\s*$/.test(read(a.mainPath).trim())) {
      fs.writeFileSync(a.mainPath, forApp(tpl(`after/${KT_MAIN}`), a, KT_MAIN)); done.push(`${mainRel}: the team's MainActivity.kt (the app's was Flutter's default)`)
    } else todo.push(`${mainRel}: neither Flutter's default nor the team's — RECIPE.md "${KT_MAIN}" by hand`)
  }
  for (const v of ['values', 'values-night']) if (fb(`${RES}/${v}/styles.xml`) && fs.existsSync(at(`${RES}/${v}/styles.xml`))) {
    const rel = `${RES}/${v}/styles.xml`, team = lf(tpl(`after/${rel}`))
    for (const name of ['adsStyle', 'RatingBar']) {
      const block = team.match(new RegExp(`\\n([ \\t]*<style name="${name}"[\\s\\S]*?</style>)`))[1]
      patch(rel, (s) => s.includes(`name="${name}"`), (s) => s.replace(/\n?<\/resources>/, `\n${block}\n</resources>`), `style ${name}`)
    }
    patch(rel, (s) => /xmlns:tools=/.test(s), (s) => s.replace(/<resources\b/, '<resources xmlns:tools="http://schemas.android.com/tools"'), 'xmlns:tools')
  }
  if (fb(MANIFEST)) {
    patch(MANIFEST, (s) => /xmlns:tools=/.test(s), (s) => s.replace(/<manifest\b/, '<manifest xmlns:tools="http://schemas.android.com/tools"'), 'xmlns:tools')
    patch(MANIFEST, (s) => s.includes('"android.permission.INTERNET"'), (s) => s.replace(/(<manifest[^>]*>\n)/, '$1\n    <uses-permission android:name="android.permission.INTERNET"/>\n'), 'INTERNET permission')
    for (const [needle, block] of appBlocks(a.appId)) patch(MANIFEST, (s) => s.includes(`"${needle}"`), (s) => s.replace(/(\n[ \t]*<\/application>)/, `\n${block.trimEnd()}$1`), needle)
    patch(MANIFEST, (s) => s.includes('com.facebook.katana.provider.PlatformProvider'), (s) => s.replace(/<\/manifest>/, `${QUERIES}</manifest>`), 'Facebook <queries>')
  }
  if (fb('android/app/build.gradle')) {
    if (!a.gradle) todo.push('no android/app/build.gradle(.kts)')
    else {
      const kts = a.gradle.endsWith('.kts')
      patch(a.gradle, (s) => GRADLE_DEPS.every((d) => s.includes(depLine(kts, d))), (s) => {
        const lines = GRADLE_DEPS.filter((d) => !s.includes(depLine(kts, d))).map((d) => `    ${depLine(kts, d)}\n`).join('')
        return /^dependencies \{\n/m.test(s) ? s.replace(/^dependencies \{\n/m, (x) => x + lines) : `${s.trimEnd()}\n\ndependencies {\n${lines}}\n`
      }, 'dependencies (multidex, desugar, sdp, facebook-android-sdk, Firebase BoM)')
      if (/coreLibraryDesugaring/.test(read(at(a.gradle))) && !/isCoreLibraryDesugaringEnabled\s*=\s*true|coreLibraryDesugaringEnabled\s+true/.test(read(at(a.gradle))))
        patch(a.gradle, () => false, (s) => s.replace(/^([ \t]*)compileOptions \{\n/m, (x, ind) => `${x}${ind}    ${kts ? 'isCoreLibraryDesugaringEnabled = true' : 'coreLibraryDesugaringEnabled true'}\n`), 'core library desugaring on')
    }
  }
  if (fb('android/settings.gradle') || fb('android/app/build.gradle')) {
    const settings = ['android/settings.gradle', 'android/settings.gradle.kts'].find((f) => fs.existsSync(at(f)))
    if (!fs.existsSync(at('android/app/google-services.json'))) todo.push('Firebase: no android/app/google-services.json — without it Remote Config is never read and every ad id stays "11" (no ads); add it and run again (then the Firebase Gradle plugins go in)')
    else if (a.gradle && settings) {
      const sk = settings.endsWith('.kts'), kts = a.gradle.endsWith('.kts'), plug = (k, id, v) => k ? `id("${id}")${v ? ` version "${v}" apply false` : ''}` : `id "${id}"${v ? ` version "${v}" apply false` : ''}`
      patch(settings, (t) => FB_PLUGINS.every(([id]) => t.includes(id)), (t) => t.replace(/^([ \t]*)id[ (]"com\.android\.application"\)?.*\n/m, (x, ind) => x + FB_PLUGINS.filter(([id]) => !t.includes(id)).map(([id, v]) => `${ind}${plug(sk, id, v)}\n`).join('')), 'Firebase Gradle plugins')
      patch(a.gradle, (t) => FB_PLUGINS.every(([id]) => t.includes(`"${id}"`)), (t) => t.replace(/^([ \t]*)id[ (]"dev\.flutter\.flutter-gradle-plugin"\)?.*\n/m, (x, ind) => x + [...FB_PLUGINS].reverse().filter(([id]) => !t.includes(`"${id}"`)).map(([id]) => `${ind}${plug(kts, id)}\n`).join('')), 'Firebase Gradle plugins applied')
    }
  }

  // iOS: the team's change has none (its app base already has the factories). An app with Flutter's default AppDelegate
  // gets app-factory's (the same three factory ids and "nativeChannel"), Info.plist's App ID and tracking text.
  const del = 'ios/Runner/AppDelegate.swift'
  if (fs.existsSync(at(del)) && !/registerNativeAdFactory/.test(blank(read(at(del))))) {
    if (/^import Flutter\s+import UIKit\s+@main\s+@objc class AppDelegate: FlutterAppDelegate(, FlutterImplicitEngineDelegate)? \{[\s\S]*GeneratedPluginRegistrant\.register[\s\S]*\}\s*$/.test(read(at(del))) && read(at(del)).split('\n').length < 25) {
      fs.writeFileSync(at(del), tpl('ios/AppDelegate.swift')); done.push(`${del}: app-factory's three native ad factories (not run here)`)
    } else todo.push(`${del}: no native ad factory — the team's app base registers smallNativeAds / bigNativeAds / fullNativeAds in AppDelegate`)
  }
  const plist = 'ios/Runner/Info.plist'
  if (fs.existsSync(at(plist))) for (const [k, v] of [['GADApplicationIdentifier', 'ca-app-pub-3940256099942544~1458002511'], ['NSUserTrackingUsageDescription', 'This identifier will be used to deliver personalized ads to you.']])
    patch(plist, (s) => s.includes(`<key>${k}</key>`), (s) => s.replace(/\n<\/dict>\n<\/plist>/, `\n\t<key>${k}</key>\n\t<string>${v}</string>\n</dict>\n</plist>`), k)

  // config.json: the value to publish under the app's parameter — every key the app's ads_splash_utils reads
  if (!fs.existsSync(at('config.json')) && fs.existsSync(at('lib/ads/ads_splash_utils.dart'))) {
    const code = blank(read(at('lib/ads/ads_splash_utils.dart')), true), test = JSON.parse(tpl('config.json')), cfg = {}
    for (const [, k] of code.matchAll(/mapValues1\["(\w+)"\]/g)) if (!(k in cfg)) {
      const d = (code.match(new RegExp(`mapValues1\\["${k}"\\]\\s*\\?\\?\\s*([^;,)\\s]+)`)) || [])[1]
      cfg[k] = k in test ? test[k] : d === undefined ? '' : JSON.parse(d)
    }
    put(at('config.json'), JSON.stringify(cfg, null, 2) + '\n'); done.push(`added config.json (${Object.keys(cfg).length} keys: what lib/ads/ads_splash_utils.dart reads)`)
  }
  return { done, todo }
}

// ---- reset: start the ads work again ----
// app-factory's own ads commits are reverted newest first. A file an earlier app-factory version installed (its own
// names, never an app's) is removed only when the app's first commit does not have it. A file the app had is never removed.
const OLD = ['lib/ads/app_variable.dart', 'lib/ads/loading_screen.dart', 'lib/ads/app_connectivity.dart', 'lib/ads/ads_premium.dart',
  'lib/utils/app_connectivity.dart', 'lib/utils/shimmer_layout.dart', 'android/app/proguard-rules.pro',
  'remote_config.json', 'test/ads/ads_test.dart', 'integration_test/ads_device_test.dart', `${RES}/values/ads_styles.xml`, 'lib/premium_core/', 'test/premium_core/',
  'lib/google_ads_material/', 'test/google_ads_material/', 'assets/remote_config_default.json', `${RES}/layout/native_small.xml`, `${RES}/layout/native_big.xml`]
const OLD_KOTLIN = ['NativeAds.kt', 'NativeAdStyle.kt', 'LayoutNativeAdFactory.kt']
const ID = ['-c', 'user.name=app-factory', '-c', 'user.email=app-factory@local']
export function reset(root) {
  const git = (...x) => execFileSync('git', ['-C', root, ...x], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] })
  if (git('status', '--porcelain').trim()) return { ok: false, text: 'uncommitted changes — commit or stash them first, so the reset is commits you can undo' }
  const log = git('log', '--format=%H%x00%s%x00%b%x1e').split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => r.split('\0'))
  const undone = new Set(log.flatMap(([, , b]) => [...(b || '').matchAll(/This reverts commit ([0-9a-f]{40})/g)].map((m) => m[1])))
  const out = []
  for (const [h, subj] of log.filter(([h, s]) => s.startsWith('app-factory: ads') && !undone.has(h))) {
    try { git(...ID, 'revert', '--no-edit', h) } catch {
      const files = git('diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean); git('revert', '--abort')
      return { ok: false, text: [...out, `CONFLICT reverting ${h.slice(0, 7)} "${subj}" in: ${files.join(', ')} — aborted, that commit is untouched; revert it by hand (git revert ${h.slice(0, 7)}), then run reset again`].join('\n') }
    }
    out.push(`reverted ${h.slice(0, 7)} "${subj}"`)
  }
  const first = git('rev-list', '--max-parents=0', 'HEAD').trim().split('\n')[0]
  const inFirst = new Set(git('ls-tree', '-r', '--name-only', first).split('\n'))
  const { mainPath } = appOf(root)
  const cand = [...OLD.flatMap((p) => p.endsWith('/') ? (fs.existsSync(path.join(root, p)) ? walk(path.join(root, p)).map((f) => p + f) : []) : [p]),
    ...(mainPath ? OLD_KOTLIN.map((f) => path.relative(root, path.join(path.dirname(mainPath), f))) : [])]
  const left = cand.filter((f) => fs.existsSync(path.join(root, f)) && !inFirst.has(f)).sort()
  const kept = cand.filter((f) => fs.existsSync(path.join(root, f)) && inFirst.has(f))
  if (left.length) {
    git('rm', '-q', '--', ...left)
    git(...ID, 'commit', '-q', '-m', 'app-factory: reset — files of an earlier app-factory ads version', '-m', left.join('\n'))
    out.push(`removed ${left.length} file(s) an earlier app-factory version installed (one commit): ${left.join(', ')}`)
  }
  if (kept.length) out.push(`kept (in the app's first commit, so the app's own): ${kept.join(', ')}`)
  if (!out.length) out.push('nothing to reset: no app-factory ads commit and no file of an earlier app-factory version')
  out.push(`HEAD ${git('rev-parse', '--short', 'HEAD').trim()} — the <base> of the fresh run (step 1 again)`)
  return { ok: true, text: out.join('\n') }
}

// ---- changes: what the ads work changed since <base>, and the checks ----
const REPORT = 'ADS_CHANGES.md'
const TESTS_BEFORE = 'ads_tests_before.json', TESTS_AFTER = 'ads_tests_after.json'
const GENERATED = /(^|\/)(pubspec\.lock|Podfile\.lock|Package\.resolved|GeneratedPluginRegistrant\.\w+|generated_plugin(s|_registrant)?\.\w+)$/
// a line of ad code: what a prepared app comments out until its ads go in
const AD_CODE = /\b(AdsLoadUtil\(\)|AdsSplashUtils\(\)|AppOpenAdManager|onTapInter|onTapRewardCall|checkPurchaseNormal|NativeAdsWidget|BannerWidget|CollapsibleBannerWidget|showPrivacyOptionsForm|registerNativeAdFactory)\b|\bAdsVariable\.\w+\s*!=\s*"11"/
// the ad expressions of a line: a call or a value of the ads code, with its comparison
const AD_EXPR = /\b(?:AdsVariable|AdsLoadUtil|AdsSplashUtils\(\)|AdsLoadUtil\(\)|appOpenAdManager)(?:\.\w+)+(?:\s*(?:==|!=)\s*(?:"[^"]*"|true|false))?|\b(?:NativeAdsWidget|CollapsibleBannerWidget|BannerWidget|AppOpenAdManager|onTapInter|onTapRewardCall|checkPurchaseNormal|showPrivacyOptionsForm)\(/g
const exprs = (code) => [...code.matchAll(AD_EXPR)].map((m) => m[0].replace(/\s+/g, ' '))
const norm = (l) => l.replace(/^\s*(\/\/+|\/\*+|\*\/|#)\s?/, '').replace(/\*\/\s*$/, '').trim()
const bare = (l) => l.replace(/\/\*|\*\//g, '').trim()

// slotEdits: "file:line" (line numbers at <base>) of app lines a slot or the team's change needs changed in a screen that
// is not the team's. noScreen: the team's files (RECIPE.md; its screens) the app has nothing for. Both are listed for the audit.
export function changes(root, base, { slotEdits = [], noScreen = [] } = {}) {
  const git = (...x) => execFileSync('git', ['-C', root, ...x], { encoding: 'utf8', maxBuffer: 256 << 20 })
  const a = appOf(root)
  const files = new Map()
  for (const l of git('diff', '--no-renames', '--name-status', base).split('\n').filter(Boolean)) { const [s, f] = l.split('\t'); files.set(f, { status: s[0] }) }
  for (const l of git('diff', '--no-renames', '--numstat', base).split('\n').filter(Boolean)) { const [ad, d, f] = l.split('\t'); Object.assign(files.get(f), { add: ad, del: d }) }
  const fresh = (...x) => { try { return git('diff', '--no-index', ...x) } catch (e) { return e.stdout } }
  for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) { const [ad, d] = fresh('--numstat', '--', '/dev/null', f).split('\t'); files.set(f, { status: 'A', add: ad, del: d, untracked: true }) }
  files.delete(REPORT)
  const sorted = [...files].sort(([x], [y]) => x.localeCompare(y))
  const diffOf = (f, x) => (x.untracked ? fresh('--', '/dev/null', f) : git('diff', '--no-renames', base, '--', f)).split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode)/.test(l)).join('\n').trimEnd()
  const atBase = (f) => { try { return execFileSync('git', ['-C', root, 'show', `${base}:${f}`], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
  const now = (f) => fs.existsSync(path.join(root, f)) ? read(path.join(root, f)) : null
  const own = sorted.filter(([f]) => !GENERATED.test(f)), generated = sorted.filter(([f]) => GENERATED.test(f))
  const checks = []
  const check = (id, what, bad, ok = []) => checks.push([!bad.length, id, what, bad.length ? bad : ok])
  const team = (f) => { const b = tpl(`before/${f}`), af = tpl(`after/${f}`); return { before: b ? forApp(b, a, f) : '', after: forApp(af, a, f) } }

  // I: the app as it was still works
  check('I2', 'No test that existed before was changed or deleted', own.filter(([f, x]) => /^(test|integration_test)\//.test(f) && x.status !== 'A').map(([f, x]) => `\`${f}\` ${x.status === 'D' ? 'deleted' : 'changed'}`))
  const run = (n) => {
    const p = path.join(root, '.dart_tool', n); if (!fs.existsSync(p)) return null
    const suite = {}, test = {}, passed = new Set(), all = new Set()
    for (const e of read(p).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))) {
      if (e.type === 'suite') suite[e.suite.id] = path.relative(root, e.suite.path || '')
      else if (e.type === 'testStart') test[e.test.id] = `${suite[e.test.suiteID]}: ${e.test.name}`
      else if (e.type === 'testDone' && !e.hidden) { all.add(test[e.testID]); if (e.result === 'success' && !e.skipped) passed.add(test[e.testID]) }
    }
    return { passed, all }
  }
  const before = run(TESTS_BEFORE), after = run(TESTS_AFTER)
  const noTests = !before && !git('ls-tree', '-r', '--name-only', base).split('\n').some((f) => /^(test|integration_test)\/.*_test\.dart$/.test(f))
  check('I3', `Every test that passed before the ads work passes now${noTests ? ' (the app had no tests)' : before && after ? ` (${before.passed.size} passed before; ${after.passed.size} of ${after.all.size} pass now)` : ''}`,
    noTests ? [] : !before || !after ? [`\`.dart_tool/${!before ? TESTS_BEFORE : TESTS_AFTER}\` is missing: run the suite with \`--file-reporter json:.dart_tool/${!before ? TESTS_BEFORE : TESTS_AFTER}\``]
      : [...before.passed].filter((t) => !after.passed.has(t)).map((t) => `${t} — ${after.all.has(t) ? 'fails now' : 'no longer runs'}`))

  // T1: the team's change is in the app — every line it adds to lib/ads and the team-base files; in the screens, every ad
  // expression it adds (the app's own screens differ from the team's, its ad code does not)
  const libNow = walk(path.join(root, 'lib')).filter((f) => f.endsWith('.dart') && !ADS.includes(`lib/${f}`)).map((f) => blank(read(path.join(root, 'lib', f))).replace(/\s+/g, ' ')).join('\n')
  check('T1', 'The team\'s ads change is in the app (RECIPE.md): every line it adds to lib/ads/ and to the team-base files the app has; every ad call and condition it adds to the screens',
    CHANGE.filter(isText).flatMap((f) => {
      const t = team(f)
      const rel = appPath(f, a, root), is = now(rel)
      if (SCREENS.includes(f) || (is === null && f.startsWith('lib/') && t.before)) { // a screen, or a team-base file the app does it elsewhere
        if (noScreen.includes(f)) return []
        const add = lineDiff(t.before, t.after).added.map(([l]) => l).filter((l) => l.trim() && blank(l).trim())
        const miss = [...new Set(add.flatMap((l) => exprs(blank(l))))].filter((e) => !libNow.includes(e))
        return miss.length ? [`\`${f}\` (team's ${SCREENS.includes(f) ? 'screen' : 'file, not in the app'}): ${miss.length} ad expression(s) not in the app's lib/, first: \`${miss[0]}\``] : []
      }
      if (is === null) return ADS.includes(f) || !t.before ? [`\`${rel}\` missing`] : []
      // a file of another base (a fresh app's manifest, Kotlin Gradle): its ad lines are N1's and the pubspec packages'
      const was = atBase(rel)
      if (t.before && was !== null && lf(was) !== lf(t.before) && merge3(was, t.before, t.after) === null) {
        if (f !== 'pubspec.yaml') return []
        const pk = tpl('pubspec_lines.txt').trim().split('\n').map((l) => l.trim().split(':')[0]).filter((p) => !new RegExp(`^  ${p}:`, 'm').test(lf(is)))
        return pk.length ? [`\`pubspec.yaml\`: no ${pk.join(', ')}`] : []
      }
      const have = new Set(lf(is).split('\n').map((l) => l.trim()))
      const miss = lineDiff(t.before, t.after).added.map(([l]) => l.trim()).filter((l) => l && !isImport(l) && !have.has(l))
      return miss.length ? [`\`${rel}\`: ${miss.length} line(s) of the team's change missing, first: \`${miss[0].slice(0, 140)}\``] : []
    }), noScreen.map((f) => `no such screen in the app (--no-screen): \`${f}\``))
  // T2: no app line changed or removed but the ones the team's change itself replaces
  const edited = []
  const teamRemoved = new Set(CHANGE.filter(isText).flatMap((f) => { const t = team(f); return lineDiff(t.before, t.after).removed.map(([l]) => l.trim()) }))
  const textFiles = own.filter(([f, x]) => x.status !== 'A' && /\.(dart|kt|swift|xml|gradle|kts|yaml|plist|json|pro)$/.test(f))
  check('T2', 'The app\'s own lines are all still there, but the ones the team\'s change itself replaces (a commented-out line may come back live); no app file deleted',
    textFiles.flatMap(([f, x]) => {
      if (x.status === 'D') return [`\`${f}\` deleted`]
      const was = atBase(f), is = now(f); if (was === null || is === null) return []
      const nowLines = new Set(is.split('\n').flatMap((l) => [l.trim(), norm(l), bare(l)]))
      return lf(was).split('\n').map((l, i) => [l, i + 1]).filter(([l]) => bare(l) && !nowLines.has(l.trim()) && !nowLines.has(norm(l)) && !nowLines.has(bare(l)) && !teamRemoved.has(l.trim()))
        .filter(([l, n]) => slotEdits.includes(`${f}:${n}`) ? (edited.push(`\`${f}:${n}\` \`${l.trim().slice(0, 140)}\``), false) : true)
        .map(([l, n]) => `\`${f}:${n}\` (at ${base.slice(0, 7)}) \`${l.trim().slice(0, 140)}\` is gone`)
    }).slice(0, 40), edited.map((e) => `changed for the team's change in a screen of the app's own (--slot-edits): ${e}`))
  // T3: no ad code of its own — every ad expression the work added outside lib/ads is one the team's code has
  const teamExprs = new Set([...CHANGE.filter(isText).map((f) => team(f).after), ...SUPPORT.filter(([, , no]) => !no).map(([r]) => tpl(`base/lib/${r}`))].flatMap((t) => exprs(blank(t))))
  const added = own.filter(([f, x]) => /^lib\/.*\.dart$/.test(f) && !ADS.includes(f) && x.status !== 'D')
    .flatMap(([f]) => lineDiff(blank(atBase(f) || ''), blank(now(f))).added.flatMap(([l, n]) => exprs(l).filter((e) => !teamExprs.has(e)).map((e) => `\`${f}:${n}\` \`${e}\``)))
  check('T3', 'No ad code of its own: every ad call and condition the work added to the app is one the team\'s code has', added.slice(0, 40))
  // R3: every ad line the app had commented out (its prepared slots) is live now, unless the team's build has it commented too
  const refCommented = new Set(CHANGE.filter((f) => /\.(dart|kt)$/.test(f)).flatMap((f) => {
    const t = lf(team(f).after), ls = t.split('\n'), b = blank(t).split('\n'); return ls.filter((l, i) => l.trim() && !b[i].trim()).map(norm)
  }))
  const slotFiles = git('ls-tree', '-r', '--name-only', base).split('\n').filter((f) => /^lib\/.*\.dart$/.test(f) || /MainActivity\.kt$/.test(f))
  check('R3', 'Every ad line the app had prepared in a comment (a slot) is live now, where the app put it — unless the team\'s build has the same line commented out too',
    slotFiles.flatMap((f) => {
      const was = atBase(f), is = now(f); if (!was || is === null) return []
      const bb = blank(was, false).split('\n'), live = new Set(blank(is).split('\n').map((l) => l.trim()).filter(Boolean)), liveText = blank(is)
      const slot = (l, i) => /^\s*\/\//.test(l) ? bb[i].trim() !== '' : !bb[i].trim() && l.trim() !== ''
      return was.split('\n').map((l, i) => [l, i]).filter(([l, i]) => AD_CODE.test(l) && slot(l, i) && norm(l) && !refCommented.has(norm(l)))
        .filter(([l]) => !live.has(norm(l)) && !liveText.includes(norm(l)))
        .map(([l, i]) => `\`${f}:${i + 1}\` still commented out: \`${norm(l).slice(0, 140)}\``)
    }).slice(0, 40))
  // R4: the Remote Config parameter the app read before is the one it reads now
  const keyAt = (get) => git('ls-tree', '-r', '--name-only', base, '--', 'lib').split('\n').filter((f) => f.endsWith('.dart')).map((f) => (blank(get(f) || '').match(/\.getValue\(\s*"([^"]+)"\s*\)/) || [])[1]).find(Boolean)
  const keyBefore = keyAt(atBase), keyNow = (blank(now('lib/ads/ads_splash_utils.dart') || '').match(/\.getValue\(\s*"([^"]+)"\s*\)/) || [])[1]
  check('R4', `The Remote Config parameter is the app's own${keyBefore ? ` ("${keyBefore}", as before)` : ` ("${a.name}_v1": the app had none)`}`,
    keyNow === (keyBefore || `${a.name}_v1`) ? [] : [`lib/ads/ads_splash_utils.dart reads "${keyNow || 'nothing'}"`], [`"${keyNow}"`])
  // N1: the team's Android side
  const has = (f, s) => (now(f) || '').includes(s)
  check('N1', 'Android as the team\'s: MainActivity registers the native ad factories (live code), native_admob_small/big/full.xml, adsStyle, the AdMob APPLICATION_ID and AdActivity, facebook-android-sdk + sdp-android', [
    ...(a.mainPath && /registerNativeAdFactory/.test(blank(read(a.mainPath))) ? [] : ['MainActivity.kt registers no native ad factory (live code)']),
    ...['small', 'big', 'full'].filter((s) => !fs.existsSync(path.join(root, RES, `layout/native_admob_${s}.xml`))).map((s) => `${RES}/layout/native_admob_${s}.xml missing`),
    ...(has(`${RES}/values/styles.xml`, 'name="adsStyle"') ? [] : ['styles.xml has no adsStyle']),
    ...['com.google.android.gms.ads.APPLICATION_ID', 'com.google.android.gms.ads.AdActivity'].filter((k) => !has(MANIFEST, k)).map((k) => `AndroidManifest.xml has no ${k}`),
    ...['com.facebook.android:facebook-android-sdk', 'com.intuit.sdp:sdp-android'].filter((d) => !has(a.gradle || '', d)).map((d) => `${a.gradle} has no ${d}`)])
  const failed = checks.filter(([ok]) => !ok)
  const block = (s) => `\`\`\`diff\n${s}\n\`\`\``
  const head = git('log', '-1', '--format=%h %s', base).trim()
  return [
    '# Ads: what changed', '',
    `Generated by \`ads-install.mjs changes\` from git (\`git diff ${head.split(' ')[0]}\` plus untracked files) — not written by hand. App \`${a.name}\`; before the ads work: \`${head}\`. Remote Config parameter: \`${keyNow || '?'}\`.`, '',
    `- ${own.filter(([, x]) => x.status === 'A').length} files added, ${own.filter(([, x]) => x.status === 'M').length} changed, ${own.filter(([, x]) => x.status === 'D').length} deleted`,
    `- ${generated.length} files regenerated by \`flutter pub get\` (counted, not shown)`,
    `- Checks: ${checks.length - failed.length} passed, ${failed.length} failed${failed.length ? ` (${failed.map(([, id]) => id).join(', ')})` : ''}`, '',
    '## Checks', '',
    'I: the app as it was still works. T: the team\'s ads change (templates/flutter/ads/RECIPE.md) and nothing else. R: the app\'s slots and Remote Config parameter. N: the team\'s Android side. Each line was checked by the command, not judged by hand.', '',
    ...checks.flatMap(([ok, id, what, ev]) => [`- **${ok ? 'PASS' : 'FAIL'}** ${id} ${what}`, ...ev.map((e) => `  - ${e}`)]), '',
    '## Files: added, changed, deleted', '',
    '| file | | + | − |', '|---|---|---|---|',
    ...own.map(([f, x]) => `| \`${f}\` | ${{ A: 'added', M: 'changed', D: 'deleted' }[x.status] || x.status} | ${x.add} | ${x.del} |`),
    ...own.flatMap(([f, x]) => x.add === '-' ? ['', `### \`${f}\``, '', '(binary)'] : ['', `### \`${f}\``, '', block(diffOf(f, x))]), '',
    '## Regenerated by flutter pub get', '',
    ...(generated.length ? generated.map(([f, x]) => `- \`${f}\` (+${x.add} −${x.del})`) : ['(none)']), '',
  ].join('\n')
}

// skills/ads-implementation steps 8.1 (analyze), 8.2 (tests, JSON for I3), 8.4 (debug builds) and 9 (ADS_CHANGES.md) in one call
export function verify(root, base, { flutter = process.env.FLUTTER || 'flutter', ios = process.platform === 'darwin', ...opts } = {}) {
  const out = []; let ok = true
  const run = (title, args, pick, judge = (ls, status) => status === 0) => {
    const t = Date.now(), r = spawnSync(flutter, args, { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20 })
    const ls = `${r.stdout || ''}\n${r.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
    const pass = judge(ls, r.status); ok &&= pass
    out.push(`${pass ? 'PASS' : 'FAIL'} ${title}: \`flutter ${args.join(' ')}\` (exit ${r.status ?? r.error?.code}, ${Math.round((Date.now() - t) / 1000)} s)`, ...pick(ls, pass).filter(Boolean).map((l) => `  ${l.trim()}`))
  }
  const why = (ls, pass, keep) => pass ? [ls.findLast((l) => keep.test(l))] : [...ls.filter((l) => /\berror\b|Error:|FAILURE|What went wrong|\[!\]|^\s*>/i.test(l)).slice(0, 15), ls.at(-1)]
  // an info / warning in a file the ads work never touched was the app's own before: counted, not failed; one in a line
  // of the team's code is the team's
  const ISSUE = /^\s*(info|warning|error) • .* • (\S+?):\d+:\d+ • \w+$/
  const touched = new Set([['diff', '--name-only', base], ['ls-files', '--others', '--exclude-standard']].flatMap((x) => execFileSync('git', ['-C', root, ...x], { encoding: 'utf8' }).split('\n')).filter(Boolean))
  const teamLines = new Set(CHANGE.filter(isText).flatMap((f) => lf(tpl(`after/${f}`)).split('\n').map((l) => l.trim())).filter(Boolean))
  const teamLine = (l) => { const m = l.match(/ • (lib\/[\w/.]+\.dart):(\d+):/); if (!m) return false
    const line = lf(read(path.join(root, m[1]))).split('\n')[m[2] - 1]?.trim(); return !!line && teamLines.has(line) }
  const ours = (l) => { const m = l.match(ISSUE); return !!m && (m[1] === 'error' || (m[1] === 'warning' && touched.has(m[2]) && !teamLine(l))) }
  run('8.1 analyze', ['analyze'], (ls) => [ls.findLast((l) => /issues? found|No issues found/.test(l)) || ls.at(-1), ...ls.filter((l) => ours(l)).slice(0, 25),
    `${ls.filter((l) => ISSUE.test(l) && !ours(l)).length} not failed: infos, issues in files the ads work did not touch (the app's own) and in lines of the team's code`],
  (ls, status) => status === 0 || !ls.some(ours))
  const json = path.join(root, '.dart_tool', TESTS_AFTER)
  run('8.2 test suite', ['test', '-j', '4', '-r', 'failures-only', '--file-reporter', `json:.dart_tool/${TESTS_AFTER}`], (ls, pass) => {
    if (pass || !fs.existsSync(json)) return [ls.at(-1)]
    const name = {}, err = {}, failed = []
    for (const e of read(json).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))) {
      if (e.type === 'testStart') name[e.test.id] = e.test.name
      else if (e.type === 'error') err[e.testID] ??= e.error.split('\n')[0].slice(0, 160)
      else if (e.type === 'testDone' && !e.hidden && e.result !== 'success') failed.push(e.testID)
    }
    return [ls.at(-1), ...failed.slice(0, 15).map((id) => `✗ ${name[id]} — ${err[id] || 'no error message'}`)]
  }, (ls, status) => status === 0 || ls.some((l) => /No tests ran|No test files|Test directory "test" not found/.test(l)))
  run('8.4 Android build', ['build', 'apk', '--debug'], (ls, pass) => why(ls, pass, /✓ Built/))
  const xcode = ios && !/CommandLineTools/.test(spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout || '')
  if (!xcode && ios) out.push('SKIP 8.4 iOS build: xcode-select points at CommandLineTools, not Xcode (flutter-ads section 1)')
  else if (ios) run('8.4 iOS build', ['build', 'ios', '--simulator', '--debug'], (ls, pass) => why(ls, pass, /✓ Built/))
  else out.push('SKIP 8.4 iOS build: not a Mac')
  const r = changes(root, base, opts), rl = r.split('\n')
  const fails = rl.flatMap((l, i) => l.startsWith('- **FAIL**') ? [l, ...rl.slice(i + 1).filter((_, k, x) => x.slice(0, k + 1).every((y) => y.startsWith('  - '))).slice(0, 5).map((y) => `  ${y}`)] : [])
  fs.writeFileSync(path.join(root, REPORT), r); ok &&= !fails.length
  out.push(`${fails.length ? 'FAIL' : 'PASS'} 9 ${REPORT} written`, ...rl.filter((l) => /^- (\d|Checks)/.test(l)).map((l) => `  ${l}`), ...fails.map((l) => l.startsWith('- **FAIL**') ? `  ${l.slice(2)}` : l))
  return { ok, text: out.join('\n') }
}

// ---- seen: every ad placement of the app proven on screen, on a device ----
// placements(): every ad site in the app's live code outside lib/ads (file:line). seen(): run on the device with that
// placement on screen — a full-screen ad must be the resumed activity (com.google.android.gms.ads.AdActivity); a native
// must be shown whole (its ad_view as tall as NativeAdsWidget makes it, between the status and navigation bars, with
// ad_attribution, ad_headline and ad_call_to_action shown inside it); a banner must be shown (an AdView at least 50 dp
// tall, between the bars). It saves the screenshot and the verdict; proof() fails until every placement has a PASS.
const PLACES = [[/\bNativeAdsWidget\(/, 'native'], [/\b(?:Collapsible)?BannerWidget\(/, 'banner'], [/\.loadInterSplash\(/, 'full-screen: splash interstitial'],
  [/(?<!Future<void>\s)\bonTapInter\(/, 'full-screen: interstitial on tap'], [/(?<!Future<void>\s)\bonTapRewardCall\(/, 'full-screen: rewarded'],
  [/\.showOpenAdIntroPremium\(/, 'full-screen: intro app open'], [/\.loadAppLifecycleReactor\(/, 'full-screen: app open on resume']]
const SEEN = '.dart_tool/ads_seen.json'
const CHECKER = 2 // raised whenever `seen` / `launch` / `stress` get stricter: a record made by an older checker is STALE
export function placements(root, { all = false } = {}) {
  const lib = path.join(root, 'lib'), files = walk(lib).filter((f) => f.endsWith('.dart')).sort(), code = new Map(files.map((f) => [f, blank(read(path.join(lib, f)))]))
  const everything = [...code.values()].join('\n')
  // the top-level function a line is in, and whether anything calls it (an ad in a function nothing calls can never show)
  const fnAt = (ls, i) => { for (let k = i; k >= 0; k--) { const m = ls[k].match(/^(?:Future<[^>]*>|void|[A-Z]\w*(?:<[^>]*>)?\??)\s+(\w+)\s*\(/); if (m) return m[1]; if (/^(class|mixin|extension|enum)\b/.test(ls[k])) return null } return null }
  const called = (name) => (everything.match(new RegExp(`\\b${name}\\s*[(.]|\\b${name}\\b(?!\\s*\\()`, 'g')) || []).length > 1
  const ps = files.filter((f) => !f.startsWith('ads/')).flatMap((f) => code.get(f).split('\n').flatMap((l, i, ls) => PLACES.filter(([re]) => re.test(l)).map(([, kind]) => {
    const fn = fnAt(ls, i)
    return { id: `lib/${f}:${i + 1}`, kind, call: `lib/${f}|${l.trim()}`, dead: fn && !called(fn) ? `in ${fn}(), which nothing calls` : '' }
  })))
  return all ? ps : ps.filter((p) => !p.dead)
}
// ---- the run must not crash: launch, health, stress ----
// A run is recorded in .dart_tool/ads_seen.json: `launch` (the build installed and started, its pid), every `seen`, `stress`.
// health() is read after each of them: the crash buffer, the process (same pid as the launch's), an ANR of the app, an
// uncaught Dart exception in the ad code, or a framework-caught exception (an overflow, a build error) in lib/ads.
// A record is valid only for the code it was made on: libHash (every lib/**/*.dart) — a changed line makes it stale.
const ADB_BIN = () => process.env.ADB || path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb')
const adbOut = (serial, ...x) => { try { return execFileSync(ADB_BIN(), ['-s', serial, ...x], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] }) } catch (e) { return e.stdout?.toString() || '' } }
const libHash = (root) => { const h = createHash('sha1'), lib = path.join(root, 'lib'); for (const f of walk(lib).filter((x) => x.endsWith('.dart')).sort()) h.update(f).update(fs.readFileSync(path.join(lib, f))); return h.digest('hex').slice(0, 12) }
const readSeen = (root) => fs.existsSync(path.join(root, SEEN)) ? JSON.parse(read(path.join(root, SEEN))) : {}
const writeSeen = (root, all) => { fs.mkdirSync(path.join(root, '.dart_tool'), { recursive: true }); fs.writeFileSync(path.join(root, SEEN), JSON.stringify(all, null, 2)) }
// what in the logcat text is a crash of this app: pure, tested by the selftest with lines taken from a device
export function logProblems(text, pkg, appName, adFiles) {
  const ls = text.split('\n'), out = new Set()
  const frames = (i) => ls.slice(i, i + 30).flatMap((x) => [...x.matchAll(new RegExp(`(?:package:${appName}/|\\blib/)([\\w/.]+\\.dart):(\\d+)`, 'g'))].map((m) => `lib/${m[1]}:${m[2]}`))
  ls.forEach((l, i) => {
    if (/FATAL EXCEPTION/.test(l) && ls.slice(i, i + 3).some((x) => x.includes(`Process: ${pkg}`))) out.add(`FATAL EXCEPTION in ${pkg}: ${ls.slice(i + 1, i + 6).join(' ').replace(/\s+/g, ' ').slice(0, 200)}`)
    if (new RegExp(`ANR in ${pkg.replace(/\./g, '\\.')}\\b`).test(l)) out.add(l.replace(/^.*?(ANR in)/, '$1').trim().slice(0, 160))
    const m = l.match(/(Unhandled Exception:.*|EXCEPTION CAUGHT BY [A-Z ]+)/)
    if (m) { // uncaught: any frame in lib/ads or in a file with an ad placement; caught by the framework: only lib/ads
      const mine = frames(i).filter((f) => f.startsWith('lib/ads/') || (/Unhandled/.test(m[1]) && adFiles.includes(f.replace(/:\d+$/, ''))))
      if (mine.length) out.add(`${m[1].trim().slice(0, 100)} at ${mine[0]}`)
    }
  })
  return [...out]
}
export function monkeyProblems(text, wanted) {
  const bad = text.split('\n').filter((l) => /^\/\/ (CRASH|NOT RESPONDING):/.test(l)).map((l) => l.trim())
  const injected = Number((text.match(/Events injected: (\d+)/) || [])[1] || 0)
  if (!/Monkey finished/.test(text)) bad.push(`monkey did not finish (${/aborted/i.test(text) ? 'aborted' : 'no end line'}): ${injected} of ${wanted} events`)
  return { bad, injected }
}
function health(root, serial, pid0) {
  const a = appOf(root), bad = [], pkg = a.appId, adFiles = [...new Set(placements(root, { all: true }).map((p) => p.id.replace(/:\d+$/, '')))]
  const crash = adbOut(serial, 'logcat', '-b', 'crash', '-d', '-v', 'brief').trim()
  if (crash) bad.push(`crash buffer: ${crash.split('\n').slice(0, 4).join(' | ').slice(0, 300)}`)
  // pidof is empty for a moment while a process is forked and renamed: gone only when it stays empty over 3 reads
  let pid = ''
  for (let i = 0; i < 3 && !pid; i++) { pid = adbOut(serial, 'shell', 'pidof', pkg).trim(); if (!pid && i < 2) sleep(1) }
  if (!pid) bad.push('the app process is gone')
  else if (pid0 && pid !== pid0) bad.push(`the app process restarted (pid ${pid0} → ${pid}): it crashed or was killed — relaunch only with \`launch … --keep-data\``)
  bad.push(...logProblems(adbOut(serial, 'logcat', '-d', '-v', 'brief'), pkg, a.name, adFiles))
  return bad
}
const sleep = (sec) => spawnSync('sleep', [String(sec)])
// install <apk>, start it, and watch it `settle` s: no crash, same process (`--keep-data`: the app's data is kept)
export function launch(root, serial, apk, { keepData = false, settle = 30, wait = 150 } = {}) {
  const a = appOf(root), pkg = a.appId, kind = /release/i.test(path.basename(apk)) ? 'release' : 'debug' // the file name only: a project path may hold "release"
  if (!fs.existsSync(apk)) return { ok: false, text: `FAIL launch: no such file ${apk}` }
  const inst = adbOut(serial, 'install', '-r', apk)
  if (!/Success/.test(inst)) return { ok: false, text: `FAIL launch: install failed: ${inst.trim().slice(0, 200)}` }
  if (!keepData) adbOut(serial, 'shell', 'pm', 'clear', pkg)
  adbOut(serial, 'logcat', '-b', 'all', '-c')
  const comp = adbOut(serial, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', pkg).trim().split('\n').at(-1)
  adbOut(serial, 'shell', 'am', 'start', '-n', comp)
  let pid = '', up = 0, bad = []
  for (const t0 = Date.now(); Date.now() - t0 < wait * 1000;) {
    const now = adbOut(serial, 'shell', 'pidof', pkg).trim()
    if (now) { pid ||= now; up ||= Date.now(); if (Date.now() - up >= 4000 || Date.now() - up >= settle * 1000) { bad = health(root, serial, pid); if (bad.length || Date.now() - up >= settle * 1000) break } }
    sleep(3)
  }
  if (!pid) bad = [`the app never started within ${wait} s`]
  const ok = !bad.length, all = readSeen(root)
  all._cursor = deviceNow(serial); all._run = { pid, kind, at: new Date().toISOString() }; all._launch = { ...all._launch, [kind]: { ok, apk: path.basename(apk), pid, evidence: bad, libHash: libHash(root), checker: CHECKER, at: new Date().toISOString() } }
  writeSeen(root, all)
  return { ok, text: [`${ok ? 'PASS' : 'FAIL'} launch ${kind}: ${path.basename(apk)} started (pid ${pid || '-'}) and ran ${settle} s${keepData ? ' on the kept data' : ' on cleared data'}`, ...bad.map((b) => `  ${b}`)].join('\n') }
}
// monkey: random touches, scrolls, Back and Home in the app for <events> events (seed 1), the ad screens and the resume ad included
export function stress(root, serial, events = 600) {
  const a = appOf(root), all = readSeen(root), pid0 = all._run?.pid
  if (!pid0) return { ok: false, text: 'FAIL stress: no launch recorded — `ads-install.mjs launch` a debug build first' }
  const r = spawnSync(ADB_BIN(), ['-s', serial, 'shell', 'monkey', '-p', a.appId, '-s', '1', '--throttle', '700', '--pct-syskeys', '0', '--pct-appswitch', '5', '-v', String(events)], { encoding: 'utf8', maxBuffer: 256 << 20, timeout: (events * 2 + 180) * 1000 })
  const out = `${r.stdout || ''}\n${r.stderr || ''}`, { bad, injected } = monkeyProblems(out, events)
  fs.mkdirSync(path.join(root, '.dart_tool'), { recursive: true }); fs.writeFileSync(path.join(root, '.dart_tool', 'ads_stress.log'), out.split('\n').filter((l) => /^(:Sending|:Switch|\/\/|Events|\*\*)/.test(l)).slice(-150).join('\n') + '\n') // the last 150 events, for diagnosis
  bad.push(...health(root, serial, pid0))
  const ok = !bad.length && injected >= events * 0.9
  if (!bad.length && !ok) bad.push(`only ${injected} of ${events} events were injected`)
  all._stress = { ok, events, injected, kind: all._run?.kind, evidence: bad, libHash: libHash(root), checker: CHECKER, at: new Date().toISOString() }; writeSeen(root, all)
  return { ok, text: [`${ok ? 'PASS' : 'FAIL'} stress: ${injected} of ${events} random events (monkey, seed 1) on ${a.appId}`, ...bad.map((b) => `  ${b}`)].join('\n') }
}

// ---- an ad is proven on ITS screen, by ITS own show: ties between a placement and what the device shows ----
// native / banner: the UI text of the placement's own file (its string literals that look like UI text) is on the device screen.
// full-screen: the line the ad's own code logs when it is shown appeared after the last PASS (so a splash ad cannot pass
// for the tap's interstitial). The line must still be in lib/ads: if the ads code changed, the check says so instead of passing.
const MARKS = {
  'full-screen: splash interstitial': [{ src: 'onAdImpression loadInterSplash', is: (l) => l.includes('onAdImpression loadInterSplash') }],
  'full-screen: interstitial on tap': [{ src: 'onAdShowedFullScreenContent common showInter', is: (l) => l.includes('onAdShowedFullScreenContent common showInter') }],
  'full-screen: rewarded': [{ src: 'onAdShowedFullScreenContent Reward Ad', is: (l) => l.includes('onAdShowedFullScreenContent Reward Ad') }],
  'full-screen: intro app open': [{ src: 'onAdShowedFullScreenContent-==-', is: (l) => l.includes('onAdShowedFullScreenContent-==-') }],
  'full-screen: app open on resume': [{ src: 'AppState', is: (l) => l.includes('AppState.foreground') }, { src: 'onAdShowedFullScreenContent', is: (l) => /AppOpenAd.* onAdShowedFullScreenContent(?!-)/.test(l) }],
}
export function uiLiterals(code) { // the strings of a Dart file that are text a user reads: words with a space, or a capitalised word; no keys, paths or ids
  const out = new Set()
  const shown = blank(code).replace(/\b(?:showLog|print|debugPrint|log|FirebaseEventService\.logEvent)\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*;/g, '') // what is logged is not on the screen
  for (const m of shown.matchAll(/'([^'\\\n$]{3,40})'|"([^"\\\n$]{3,40})"/g)) {
    const t = (m[1] ?? m[2]).trim()
    if (/[A-Za-z]{3}/.test(t) && !/[/_.:@]/.test(t) && (/\s/.test(t) || /^[A-Z]/.test(t))) out.add(t)
  }
  return [...out]
}
export function markerHit(lines, items, cursor) { // the items' lines, in order, all newer than `cursor` ("MM-DD HH:MM:SS.mmm")
  let i = 0
  for (const l of lines) { const t = l.slice(0, 18); if (cursor && t <= cursor) continue; if (i < items.length && items[i].is(l)) i++ }
  return i === items.length
}
function screenStrings(serial) {
  let xml = ''
  for (let i = 0; i < 5 && !/<hierarchy/.test(xml); i++) { adbOut(serial, 'shell', 'uiautomator', 'dump', '/sdcard/ads_seen_ui.xml'); xml = adbOut(serial, 'shell', 'cat', '/sdcard/ads_seen_ui.xml'); if (!/<hierarchy/.test(xml)) sleep(1) }
  return [...xml.matchAll(/(?:content-desc|text)="([^"]+)"/g)].map((m) => m[1].replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim())
}
const deviceNow = (serial) => adbOut(serial, 'shell', "date '+%m-%d %H:%M:%S'").trim() + '.999' // quoted: adb shell splits its words again on the device; the whole second: a line in the cursor's second is not newer

// The screen as the app's window has it now: `dumpsys activity top` — every live view of the resumed activity with its
// visibility (V / I / G) and position, and the status / navigation bar frames. (uiautomator's tree was not used: on the
// emulator it still listed the intro's native on Home, 2026-10-29.)
function screenOf(serial) {
  const adb = (...x) => execFileSync(process.env.ADB || path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'), ['-s', serial, ...x], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
  const [W, H] = adb('shell', 'wm', 'size').toString().match(/(\d+)x(\d+)\s*$/m).slice(1).map(Number), dpi = Number(adb('shell', 'wm', 'density').toString().match(/(\d+)\s*$/m)[1])
  const dump = adb('shell', 'dumpsys', 'activity', 'top').toString()
  const top = (adb('shell', 'dumpsys', 'activity', 'activities').toString().match(/topResumedActivity=.*\{[^}]*\s(\S+\/\S+)\s/) || [])[1] || ''
  // the last activity block is the top one; its view hierarchy and its bar frames
  const block = dump.split(/\n(?=\s*ACTIVITY )/).at(-1)
  const bar = (t) => (block.match(new RegExp(`type=${t} frame=\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]`)) || []).slice(1).map(Number)
  const status = bar('statusBars'), nav = bar('navigationBars')
  const area = [0, status.length ? status[3] : 0, W, nav.length && nav[1] > H / 2 ? nav[1] : H] // where the app is seen
  const views = [], stack = []
  for (const l of (block.split('View Hierarchy:')[1] || '').split('\n')) {
    const m = l.match(/^(\s*)([\w.$]+)\{[0-9a-f]+ (\S{9}) \S{8} (-?\d+),(-?\d+)-(-?\d+),(-?\d+)(?: #[0-9a-f]+ (?:[\w.]+:)?id\/(\w+))?/)
    if (!m) { if (views.length && /^\s*\S/.test(l) && !/\{/.test(l)) break; continue }
    const depth = m[1].length
    while (stack.length && stack.at(-1).depth >= depth) stack.pop()
    const parent = stack.at(-1), [l0, t0, r0, b0] = m.slice(4, 8).map(Number), ox = parent ? parent.b[0] : 0, oy = parent ? parent.b[1] : 0
    const v = { depth, cls: m[2], id: m[8] || '', shown: m[3][0] === 'V' && (!parent || parent.shown), b: [ox + l0, oy + t0, ox + r0, oy + b0], parent }
    views.push(v); stack.push(v)
  }
  // the windows above the app's own (dumpsys lists the top one first): a popup, a dialog, the keyboard, AdMob's validator
  const wins = [], app = top.split('/')[0]
  for (const w of adb('shell', 'dumpsys', 'window', 'windows').toString().split(/\n(?=  Window #)/).slice(1)) {
    const title = (w.match(/Window\{\w+ \w+ ([^}]+)\}/) || [])[1] || '', f = (w.match(/ frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/) || []).slice(1).map(Number)
    if (/ty=BASE_APPLICATION/.test(w) && title.startsWith(`${app}/`)) break
    if (/isVisible=true/.test(w) && /isOnScreen=true/.test(w) && f.length && !/^(StatusBar|NavigationBar\d*|NotificationShade|Taskbar|ShellDropTarget|ScreenDecorOverlay\w*|pip-dismiss-overlay)$/.test(title)) wins.push({ title, b: f })
  }
  return { W, H, dpi, top, area, views, wins, png: () => adb('exec-out', 'screencap', '-p') }
}
// the heights NativeAdsWidget gives a native, in pixels on this screen (ScreenUtil: .w = value × screen width / design width)
function nativeHeights(root, W) {
  const util = read(path.join(root, 'lib/ads/ads_load_util.dart')), m = util.match(/height:\s*widget\.isSmallNative\s*\?\s*([\d\s()*/.+-]+)\.w\s*:\s*([\d\s()*/.+-]+)\.w/)
  const design = walk(path.join(root, 'lib')).filter((f) => f.endsWith('.dart')).map((f) => (read(path.join(root, 'lib', f)).match(/designSize:\s*const\s+Size\(\s*([\d.]+)/) || [])[1]).find(Boolean)
  if (!m || !design) return null
  return [m[1], m[2]].map((e) => Math.round(Function(`return (${e})`)() * W / Number(design)))
}
export function seen(root, serial, id) {
  const place = placements(root).find((p) => p.id === id)
  if (!place) return { ok: false, text: `${id} is not an ad placement of this app — \`ads-install.mjs placements ${root}\` lists them` }
  const s = screenOf(serial), [al, at, ar, ab] = s.area, ev = []
  const inArea = ([l, t, r, b]) => l >= al && t >= at && r <= ar && b <= ab && r > l && b > t
  const under = (v, n) => { for (let p = n.parent; p; p = p.parent) if (p === v) return true; return false }
  const fmt = (b) => `${b[0]},${b[1]}-${b[2]},${b[3]}`
  const over = (b, skip = /^$/) => s.wins.filter((w) => !skip.test(w.title) && w.b[0] < b[2] && w.b[2] > b[0] && w.b[1] < b[3] && w.b[3] > b[1])
  const covered = (b, skip) => over(b, skip).map((w) => ` — covered by the window "${w.title}" ${fmt(w.b)}${/^PopupWindow/.test(w.title) ? ' (an expanded collapsible banner: collapse it)' : ''}`).join('')
  let ok
  const all0 = readSeen(root)
  if (place.kind.startsWith('full-screen')) {
    ok = /(^|\/)com\.google\.android\.gms\.ads\.AdActivity$/.test(s.top)
    ev.push(`resumed activity: ${s.top || '?'}`)
    const items = MARKS[place.kind], adsSrc = walk(path.join(root, 'lib/ads')).map((f) => read(path.join(root, 'lib/ads', f))).join('\n')
    if (!items) { ok = false; ev.push(`no log line known for "${place.kind}"`) }
    else if (!items.every((m) => adsSrc.includes(m.src))) { ok = false; ev.push(`the line that shows "${place.kind}" (${items.map((m) => m.src).join(' … ')}) is not in lib/ads any more: the ads code changed, MARKS needs the new line`) }
    else {
      const lines = adbOut(serial, 'logcat', '-d', '-v', 'time').split('\n'), hit = markerHit(lines, items, all0._cursor)
      ev.push(`${hit ? 'shown by' : 'NOT shown by'} this placement's own ad code: the log has ${items.map((m) => `"${m.src}"`).join(' then ')}${all0._cursor ? ` after ${all0._cursor}` : ''}${hit ? '' : ' — another ad is on screen, or this one has not been shown since the last PASS'}`); ok = ok && hit
    }
  } else if (place.kind === 'native') {
    const hs = nativeHeights(root, s.W), ads = s.views.filter((v) => v.id === 'ad_view' && v.shown)
    ok = ads.some((v) => {
      const h = v.b[3] - v.b[1], parts = ['ad_attribution', 'ad_headline', 'ad_call_to_action'].map((k) => s.views.find((n) => n.id === k && under(v, n)))
      const whole = !!hs && hs.some((x) => Math.abs(x - h) <= 3), shown = parts.every((p) => p && p.shown && p.b[2] > p.b[0] && p.b[3] > p.b[1] && p.b[1] >= v.b[1] && p.b[3] <= v.b[3])
      const cov = covered(v.b)
      ev.push(`native ad_view ${fmt(v.b)}: ${h} px tall (NativeAdsWidget: ${hs ? hs.join(' or ') : '?'} px)${whole ? '' : ' — not the widget\'s height'}${inArea(v.b) ? '' : ` — not inside the app's visible area ${fmt(s.area)}: scroll it fully on screen`}${cov}; ${['ad_attribution', 'ad_headline', 'ad_call_to_action'].map((k, i) => `${k} ${parts[i] ? `${fmt(parts[i].b)}${parts[i].shown ? '' : ' hidden'}` : 'missing'}`).join('; ')}`)
      return whole && shown && inArea(v.b) && !cov
    })
    if (!ads.length) ev.push('no native ad (ad_view) shown on the screen')
  } else {
    const min = Math.round(50 * s.dpi / 160), banners = s.views.filter((v) => v.cls === 'com.google.android.gms.ads.AdView' && v.shown)
    // a banner's own expanded collapsible panel (a PopupWindow) is the banner, not something over it
    ok = banners.some((v) => inArea(v.b) && v.b[3] - v.b[1] >= min && !covered(v.b, /^PopupWindow/))
    ev.push(...(banners.length ? banners.map((v) => `banner AdView ${fmt(v.b)}: ${v.b[3] - v.b[1]} px tall (≥ ${min})${inArea(v.b) ? '' : ` — not inside the app's visible area ${fmt(s.area)}`}${covered(v.b, /^PopupWindow/)}`) : ['no banner (AdView) shown on the screen']))
  }
  if (!place.kind.startsWith('full-screen')) { // the screen of the placement's own file is the one showing
    const file = place.id.replace(/:\d+$/, ''), others = new Set(walk(path.join(root, 'lib')).filter((f) => f.endsWith('.dart') && !f.startsWith('ads/') && `lib/${f}` !== file).flatMap((f) => uiLiterals(read(path.join(root, 'lib', f)))))
    const lit = uiLiterals(read(path.join(root, file))).filter((l) => !others.has(l)), strs = screenStrings(serial), on = lit.filter((l) => strs.some((x) => x.includes(l)))
    const need = 1, tied = lit.length > 0 && on.length >= need // text only this screen has (a pager shows one page at a time: one is enough)
    ev.push(tied ? `on its screen: ${on.slice(0, 4).map((x) => `"${x}"`).join(', ')} are the text of ${place.id.replace(/:\d+$/, '')}` : `NOT on the screen of ${place.id.replace(/:\d+$/, '')}: ${lit.length ? `none of its ${lit.length} own texts is shown (${lit.slice(0, 4).map((x) => `"${x}"`).join(', ')} …)` : 'the file has no text of its own (every string is also in another screen) to tie the ad to its screen'} — this ad belongs to another screen`)
    ok = ok && tied
  }
  const dir = path.join(root, '.dart_tool', 'ads_seen'), shot = path.join(dir, `${id.replace(/[/:]/g, '_')}.png`)
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(shot, s.png())
  const all = readSeen(root), sick = health(root, serial, all._run?.pid)
  if (ok && place.kind.startsWith('full-screen')) all._cursor = deviceNow(serial) // the next full-screen ad needs its own, newer, show
  if (!all._run) sick.unshift('no `launch` recorded: start the app with `ads-install.mjs launch` so its process and crashes are watched')
  ev.push(...sick.map((b) => `CRASH CHECK: ${b}`)); ok = ok && !sick.length
  all[id] = { kind: place.kind, ok, evidence: ev, screenshot: path.relative(root, shot), libHash: libHash(root), checker: CHECKER, at: new Date().toISOString() }
  writeSeen(root, all)
  return { ok, text: [`${ok ? 'PASS' : 'FAIL'} ${id} (${place.kind})`, ...ev.map((e) => `  ${e}`), `  screenshot ${path.relative(root, shot)} — look at it: nothing of the app drawn over the ad`].join('\n') }
}
export function proof(root) {
  const all = readSeen(root), ps = placements(root), now = libHash(root)
  const fresh = (r) => r && r.libHash === now && r.checker === CHECKER // a PASS is for the code it was made on, by the checker as it is now
  // a full-screen ad is the same ad wherever it is called: one PASS covers the same statement elsewhere in the same file
  const twin = (p) => p.kind.startsWith('full-screen') && !(all[p.id]?.ok && fresh(all[p.id])) ? ps.find((q) => q !== p && q.call === p.call && all[q.id]?.ok && fresh(all[q.id])) : null
  const rows = ps.map((p) => [p, (all[p.id]?.ok && fresh(all[p.id])) || !twin(p) ? all[p.id] : { ok: true, libHash: now, checker: CHECKER, screenshot: `the same call as ${twin(p).id}, seen` }]), bad = rows.filter(([, r]) => !r || !r.ok || !fresh(r))
  const gates = [['launch debug', all._launch?.debug, 'the walk starts with `ads-install.mjs launch <debug apk>`'], ['launch release', all._launch?.release, '`ads-install.mjs launch <release apk>` of the final code'],
    ['stress', all._stress, '`ads-install.mjs stress` on the release build just launched (`launch <release apk>`, then `stress`)']].map(([name, r, how]) => [name, r, how, r?.ok && fresh(r) && (name !== 'stress' || r.kind === 'release')])
  return { ok: !bad.length && gates.every(([, , , good]) => good), text: [
    ...rows.map(([p, r]) => `${r?.ok && fresh(r) ? 'PASS' : r ? (fresh(r) ? 'FAIL' : 'STALE (the code changed after it passed)') : 'NOT SEEN'} ${p.id} (${p.kind})${r ? ` — ${r.screenshot}` : ''}`),
    ...placements(root, { all: true }).filter((p) => p.dead).map((p) => `NEVER CALLED ${p.id} (${p.kind}) — ${p.dead}: no user can reach it, not required`),
    ...gates.map(([name, r, how, good]) => `${good ? 'PASS' : r ? (fresh(r) ? 'FAIL' : 'STALE (the code changed after it passed)') : 'NOT RUN'} ${name}${good ? ` — ${r.apk || `${r.injected} events on the ${r.kind} build`}` : ` — ${how}`}${!good && r?.evidence?.length ? `: ${r.evidence[0]}` : ''}`),
    `${ps.length - bad.length} of ${ps.length} placements seen on screen${bad.length ? ' — open each one that is not, with its ad on screen, and run `seen`' : ''}; ${gates.filter(([, , , good]) => good).length} of ${gates.length} crash gates passed`].join('\n') }
}

// ---- selftests ----
// a fresh `flutter create --platforms ios,android` app (Flutter 3.47.7), trimmed to what the installer reads
function fixture(w) {
  w('pubspec.yaml', 'name: my_app\nenvironment:\n  sdk: ^3.13.5\ndependencies:\n  flutter:\n    sdk: flutter\n  cupertino_icons: ^1.0.8\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n')
  w('lib/main.dart', "import 'package:flutter/material.dart';\n\nvoid main() => runApp(const MaterialApp(home: Text('hi')));\n")
  w('android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt', 'package com.acme.my_app\n\nimport io.flutter.embedding.android.FlutterActivity\n\nclass MainActivity : FlutterActivity()\n')
  w(MANIFEST, '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="my_app">\n        <activity android:name=".MainActivity"/>\n    </application>\n</manifest>\n')
  w(`${RES}/values/styles.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">\n        <item name="android:windowBackground">@drawable/launch_background</item>\n    </style>\n</resources>\n')
  w('android/app/build.gradle.kts', 'android {\n    compileOptions {\n        sourceCompatibility = JavaVersion.VERSION_17\n    }\n    defaultConfig {\n        applicationId = "com.acme.my_app"\n        minSdk = flutter.minSdkVersion\n    }\n}\n\nflutter {\n    source = "../.."\n}\n')
  w('ios/Runner/AppDelegate.swift', 'import Flutter\nimport UIKit\n\n@main\n@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {\n  override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  ) -> Bool {\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }\n\n  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {\n    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)\n  }\n}\n')
  w('ios/Runner/Info.plist', '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleName</key>\n\t<string>my_app</string>\n</dict>\n</plist>\n')
}
const gitIn = (root) => (...x) => execFileSync('git', ['-C', root, ...ID, ...x], { encoding: 'utf8' })
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p))
const snapshot = (root) => walk(root).filter((f) => !f.startsWith('.git/')).map((f) => [f, fs.readFileSync(path.join(root, f)).toString('base64')])

function selftest() {
  const out = []
  const havePpt = fs.existsSync(PPT), havePre = preReadable()
  if (havePpt) {
    // the template is the team's two builds, nothing else; the change misses no file the builds differ in
    if (havePre) {
      for (const [f, t] of reference()) assert.ok(Buffer.from(t).equals(tplBuf(f) || Buffer.alloc(0)), `templates/flutter/ads/${f} is not what \`template\` builds from the team's builds (run it)`)
      const diff = teamDiff(), known = new Set([...CHANGE, ...Object.keys(NOT_ADS)])
      assert.deepEqual(diff.filter((f) => !known.has(f)), [], 'the team\'s builds differ in a file that is in neither CHANGE nor NOT_ADS')
      assert.deepEqual([...known].filter((f) => !diff.includes(f)), [], 'CHANGE / NOT_ADS name a file the team\'s builds do not differ in')
    } else { // the stored before/ and after/ against the team's build as it is now
      for (const f of CHANGE) {
        assert.ok(tplBuf(`after/${f}`)?.equals(withFixes(f, pptRead(f))), `templates/flutter/ads/after/${f} is not the team's file (+ FIXES): the team's build changed — rebuild with ADS_PRE`)
        if (!ADS.includes(f) && !f.includes('/layout/') && !f.includes('/font/') && !f.includes('-v35/')) assert.ok(tplBuf(`before/${f}`), `templates/flutter/ads/before/${f} missing`)
      }
      out.push(`pre-ads commit ${PRE} not on this Mac: the stored before/ is used (a rebuild of the template needs ADS_PRE)`)
    }
    // the fallback lines are the team's own
    const man = lf(pptRead(MANIFEST).toString()), gr = lf(pptRead('android/app/build.gradle').toString()), st = lf(pptRead('android/settings.gradle').toString())
    for (const [, b] of appBlocks(KT_PKG)) assert.ok(man.includes(b.trimEnd()), `manifest block not in the team's: ${b.split('\n')[1]}`)
    assert.ok(man.includes(QUERIES.split('\n').slice(1, 3).join('\n')) && man.includes('"android.permission.INTERNET"'))
    for (const d of GRADLE_DEPS) assert.ok(gr.includes(depLine(false, d)), `gradle line not in the team's: ${depLine(false, d)}`)
    for (const [id, v] of FB_PLUGINS) assert.ok(st.includes(`id "${id}" version "${v}" apply false`))
    out.push(`template = the team's builds; the change = ${CHANGE.length} files, ${Object.keys(NOT_ADS).length} other edits named`)

    // the AI PPT app before its ads → exactly the team's build
    const ppt = tmp('ads-ppt-'), at = (f) => path.join(ppt, f)
    if (havePre) for (const f of preFiles()) put(at(f), preRead(f))
    else { // the pre-ads app = the team's build, but every changed file as it was (or absent, when the change added it)
      for (const f of walk(PPT).filter((x) => !BUILD_OUTPUT.test(x) && !NOT_ADS[x] && !CHANGE.includes(x))) put(at(f), pptRead(f))
      for (const f of CHANGE) { const b = tplBuf(`before/${f}`); if (b) put(at(f), b) }
    }
    const g = gitIn(ppt); g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'base'); const base = g('rev-parse', 'HEAD').trim()
    const r = install(ppt)
    for (const f of CHANGE) assert.ok(fs.readFileSync(at(f)).equals(withFixes(f, pptRead(f))), `${f}: not the team's file (with FIXES) after install`)
    for (const x of FIXES) assert.ok(read(at(x.file)).replaceAll('\r\n', '\n').includes(x.to), `${x.id} not in ${x.file}`)
    assert.deepEqual(r.todo, [], 'nothing left by hand for the team\'s own app')
    const supportAdded = r.done.filter((l) => /^added lib\//.test(l) && !ADS.some((f) => l.startsWith(`added ${f}`)))
    assert.deepEqual(supportAdded, [], 'the team app\'s own helpers are used')
    const c = changes(ppt, base)
    for (const id of ['T1', 'T2', 'T3', 'R3', 'R4', 'N1']) assert.match(c, new RegExp(`\\*\\*PASS\\*\\* ${id} `), `${id} on the team's own result`)
    const snap = snapshot(ppt); install(ppt); assert.deepEqual(snapshot(ppt), snap, 'a second run changes nothing')
    fs.rmSync(ppt, { recursive: true, force: true })
    out.push(`the AI PPT app before its ads → the team's build + ${new Set(FIXES.map((x) => x.id)).size} fixes, every changed file byte for byte; T1 T2 T3 R3 R4 N1 pass`)
  } else out.push(`template and PPT checks skipped: ${PPT} not on this Mac`)

  // merge3: the team's change goes into an app file that differs elsewhere; a conflict is null
  assert.equal(merge3('a\nmine\nb\nc\n', 'a\nb\nc\n', 'a\nb\nteam\nc\n'), 'a\nmine\nb\nteam\nc\n')
  assert.equal(merge3('a\nmine\nc\n', 'a\nb\nc\n', 'a\nteam\nc\n'), null)
  assert.equal(merge("import 'x';\n\nclass S {\n  own();\n}\n", "import 'y';\n\nclass S {\n  ref();\n}\n"), "import 'x';\nimport 'y';\n\nclass S {\n  ref();\n  own();\n}\n")
  out.push('merge ok')

  // a fresh app (no team base): lib/ads + the team's helpers copied, the team's Android lines, NOT DONE for the rest
  const root = tmp('ads-install-'), w = (f, t) => put(path.join(root, f), t), rd = (f) => read(path.join(root, f))
  fixture(w)
  const first = install(root)
  const a0 = { name: 'my_app', paths: {}, key: 'my_app_v1', ktPkg: 'com.acme.my_app', appId: 'com.acme.my_app' }
  for (const f of ADS) assert.equal(rd(f), forApp(tpl(`after/${f}`), a0, f), `${f} copied`)
  assert.match(rd('lib/ads/ads_splash_utils.dart'), /getValue\("my_app_v1"\)/, 'no Remote Config parameter before: <pubspec name>_v1')
  assert.match(rd('lib/ads/ads_splash_utils.dart'), /^import 'package:my_app\/service\/app_connectivity\.dart';\r?$/m)
  assert.ok(fs.existsSync(path.join(root, 'lib/service/app_connectivity.dart')) && fs.existsSync(path.join(root, 'lib/AdsUtils/loading_screen.dart')))
  assert.match(rd('lib/in_app_purchase/constant.dart'), /^const \w+ = "";$/m, 'the team\'s RevenueCat keys never copied')
  assert.ok(!/goog_|appl_/.test(rd('lib/in_app_purchase/constant.dart')))
  assert.deepEqual(first.todo.map((t) => t.split(/[: ]/)[0]), ['lib/in_app_purchase/constant.dart', 'the', 'lib/AdsUtils/dialog.dart', 'lib/in_app_purchase/initPlatformState.dart', 'lib/service/app_constant.dart',
    ...SCREENS, 'Firebase'])
  assert.match(rd('pubspec.yaml'), /^  google_mobile_ads: \^5\.3\.1$/m, 'the team\'s line'); assert.match(rd('pubspec.yaml'), /^  get: /m)
  assert.match(rd('android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt'), /^package com\.acme\.my_app\r?$[\s\S]*registerNativeAdFactory[\s\S]*R\.id\.ad_media/m)
  for (const s of ['small', 'big', 'full']) assert.ok(fs.readFileSync(path.join(root, RES, `layout/native_admob_${s}.xml`)).equals(pptRead(`${RES}/layout/native_admob_${s}.xml`)), `the team's ${s} layout`)
  assert.match(rd(MANIFEST), /xmlns:tools=[\s\S]*permission\.INTERNET[\s\S]*ads\.APPLICATION_ID[\s\S]*ads\.AdActivity[\s\S]*com\.acme\.my_app\.FacebookInitProvider[\s\S]*<\/application>\n    <queries>/)
  assert.doesNotMatch(rd(MANIFEST), /ACCESS_NETWORK_STATE/, 'only the team\'s lines')
  assert.doesNotMatch(rd('android/app/build.gradle.kts'), /isMinifyEnabled|proguard/, 'the team sets no R8 lines')
  assert.match(rd('android/app/build.gradle.kts'), /compileOptions \{\n        isCoreLibraryDesugaringEnabled = true\n/)
  assert.match(rd('android/app/build.gradle.kts'), /dependencies \{\n    implementation\("com\.android\.support:multidex:1\.0\.3"\)\n    coreLibraryDesugaring\("com\.android\.tools:desugar_jdk_libs:2\.1\.4"\)/)
  assert.match(rd(`${RES}/values/styles.xml`), /<resources xmlns:tools="http:\/\/schemas\.android\.com\/tools">[\s\S]*LaunchTheme[\s\S]*\n    <style name="adsStyle"[\s\S]*<\/style>\n    <style name="RatingBar"[\s\S]*<\/style>\n<\/resources>\n$/)
  assert.ok(fs.existsSync(path.join(root, RES, 'values-v35/styles.xml')), 'the team\'s API 35 styles')
  const cfg = JSON.parse(rd('config.json'))
  assert.equal(cfg.interSplash, 'ca-app-pub-3940256099942544/1033173712'); assert.equal(cfg.apiCookie, ''); assert.ok('sendRedvenueToAnalyticsForNativeIntroBig' in cfg && 'discountShow' in cfg, 'every key the code reads')
  const snap = snapshot(root); install(root); assert.deepEqual(snapshot(root), snap, 'a second run changes nothing')
  fs.rmSync(root, { recursive: true, force: true })
  out.push('install (fresh app) ok')

  // changes: T2 a lost app line, R3 a slot still commented, R4 the parameter renamed, T3 ad code of its own
  const sk = tmp('ads-changes-'), ws = (f, t) => put(path.join(sk, f), t), rs = (f) => read(path.join(sk, f))
  fixture(ws); install(sk)
  ws('lib/home.dart', "class H {\n  build() {\n    // onTapInter(() => go());\n    keep();\n  }\n}\n")
  const g2 = gitIn(sk); g2('init', '-q'); g2('add', '-A'); g2('commit', '-q', '-m', 'base'); const b2 = g2('rev-parse', 'HEAD').trim()
  ws('lib/home.dart', "class H {\n  build() {\n    // onTapInter(() => go());\n  }\n}\n")
  ws('lib/ads/ads_splash_utils.dart', rs('lib/ads/ads_splash_utils.dart').replace('"my_app_v1"', '"other_v1"'))
  let c = changes(sk, b2)
  assert.match(c, /\*\*FAIL\*\* T2 [^\n]*\n(  - .*\n)*  - `lib\/home\.dart:4` \(at \w{7}\) `keep\(\);` is gone/)
  assert.match(c, /\*\*FAIL\*\* R3 [^\n]*\n(  - .*\n)*  - `lib\/home\.dart:3` still commented out: `onTapInter\(\(\) => go\(\)\);`/)
  assert.match(c, /\*\*FAIL\*\* R4 [^\n]*\n  - lib\/ads\/ads_splash_utils\.dart reads "other_v1"/)
  ws('lib/home.dart', "class H {\n  build() {\n    onTapInter(() => go());\n    keep(1);\n    if (AdsVariable.homeFlag.isOdd) PopScope();\n  }\n}\n")
  ws('lib/ads/ads_splash_utils.dart', rs('lib/ads/ads_splash_utils.dart').replace('"other_v1"', '"my_app_v1"'))
  c = changes(sk, b2, { slotEdits: ['lib/home.dart:4'] })
  for (const id of ['R3', 'R4']) assert.match(c, new RegExp(`\\*\\*PASS\\*\\* ${id} `), `${id} passes once fixed`)
  assert.match(c, /\*\*PASS\*\* T2 [^\n]*\n  - changed for the team's change in a screen of the app's own \(--slot-edits\): `lib\/home\.dart:4` `keep\(\);`\n/)
  assert.match(c, /\*\*FAIL\*\* T3 [^\n]*\n  - `lib\/home\.dart:5` `AdsVariable\.homeFlag\.isOdd`/, 'ad code the team\'s code does not have')
  assert.match(changes(sk, b2, { noScreen: [...SCREENS, 'lib/AdsUtils/dialog.dart', 'lib/in_app_purchase/initPlatformState.dart', 'lib/service/app_constant.dart'] }), /\*\*PASS\*\* T1 /, 'the team\'s files the app has nothing for are waived, and listed')
  assert.match(changes(sk, b2), /\*\*FAIL\*\* T1 [^\n]*\n(  - .*\n)*  - `lib\/screens\/splash_screen\.dart` \(team's screen\)/)
  fs.rmSync(sk, { recursive: true, force: true })
  out.push('changes ok')

  // crash detection: the lines a device gave for the F2 null show, a native crash, an ANR, and a monkey run
  const dev = "I/flutter ( 6364): [ERROR:flutter/runtime/dart_vm_initializer.cc(40)] Unhandled Exception: Null check operator used on a null value\nI/flutter ( 6364): #0      AdsLoadUtil.showInterCommon (package:ai_ppt_generater/ads/ads_load_util.dart:227)\nI/flutter ( 6364): #1      onTapInter.<anonymous closure>.<anonymous closure> (package:ai_ppt_generater/service/app_constant.dart:89)\n"
  assert.deepEqual(logProblems(dev, 'com.example.pptmaker', 'ai_ppt_generater', []), ['Unhandled Exception: Null check operator used on a null value at lib/ads/ads_load_util.dart:227'])
  assert.deepEqual(logProblems("E/AndroidRuntime( 1): FATAL EXCEPTION: main\nE/AndroidRuntime( 1): Process: com.example.pptmaker, PID: 1\nE/AndroidRuntime( 1): java.lang.IllegalStateException: boom\n", 'com.example.pptmaker', 'x', []).length, 1)
  assert.deepEqual(logProblems("E/AndroidRuntime( 1): FATAL EXCEPTION: main\nE/AndroidRuntime( 1): Process: other.app, PID: 1\n", 'com.example.pptmaker', 'x', []), [], 'another app\'s crash is not this app\'s')
  assert.equal(logProblems('E/ActivityManager( 1): ANR in com.example.pptmaker (com.example.pptmaker/.MainActivity)', 'com.example.pptmaker', 'x', []).length, 1)
  assert.deepEqual(logProblems("I/flutter (1): Unhandled Exception: x\nI/flutter (1): #0 f (package:x/screens/home_screen.dart:9)\n", 'p', 'x', []), [], 'an exception in a screen with no ad is the app\'s own')
  assert.equal(logProblems("I/flutter (1): Unhandled Exception: x\nI/flutter (1): #0 f (package:x/screens/home_screen.dart:9)\n", 'p', 'x', ['lib/screens/home_screen.dart']).length, 1, 'in a screen with an ad: reported')
  assert.deepEqual(logProblems("I/flutter (1): ══╡ EXCEPTION CAUGHT BY RENDERING LIBRARY ╞═══\nI/flutter (1): The relevant error-causing widget was: Column lib/screens/home_screen.dart:215\n", 'p', 'x', ['lib/screens/home_screen.dart']), [], 'a caught overflow counts only in lib/ads')
  assert.deepEqual(uiLiterals("final k = 'nativeHome';\nText('Use Template'); // 'Hidden'\nappText(title: \"Templates\", family: 'poppins_bold');\nImage.asset('assets/a/b.png'); var u = 'https://x.y'; log('$x here');"), ['Use Template', 'Templates'])
  assert.deepEqual(uiLiterals("showLog('Native home loaded on intro');\nprint(\"Tried to show ad\");\nText('Create with AI');"), ['Create with AI'], 'what is logged is not on the screen')
  const L = ['10-30 05:00:01.000 I/flutter ( 1): onAdImpression loadInterSplash', "10-30 05:00:09.100 I/flutter ( 1): AppState.foreground", "10-30 05:00:09.500 I/flutter ( 1): Instance of 'AppOpenAd' onAdShowedFullScreenContent"]
  assert.equal(markerHit(L, MARKS['full-screen: splash interstitial'], ''), true); assert.equal(markerHit(L, MARKS['full-screen: splash interstitial'], '10-30 05:00:02.000'), false, 'an older show is not this one')
  assert.equal(markerHit(L, MARKS['full-screen: app open on resume'], '10-30 05:00:02.000'), true); assert.equal(markerHit(L, MARKS['full-screen: intro app open'], ''), false, 'the resume ad is not the intro\'s')
  assert.equal(markerHit([L[2], L[1]], MARKS['full-screen: app open on resume'], ''), false, 'foreground comes first')
  assert.deepEqual(monkeyProblems('Events injected: 600\n// Monkey finished\n', 600), { bad: [], injected: 600 })
  assert.equal(monkeyProblems('Events injected: 41\n// CRASH: com.x (pid 9)\n** Monkey aborted due to error.\n', 600).bad.length, 2)
  out.push('crash detection ok')

  // placements / proof: every ad site, one not reachable (a function nothing calls) left out, the same full-screen call
  // elsewhere in the same file covered by one PASS, nothing PASSes without its own record
  const pl = tmp('ads-places-'), wp = (f, t) => put(path.join(pl, f), t)
  wp('lib/ads/ads_load_util.dart', 'class AdsLoadUtil {}\n')
  wp('lib/s.dart', "void build() {\n  NativeAdsWidget(showNativeAd: a);\n  m.showOpenAdIntroPremium(() {});\n  m.showOpenAdIntroPremium(() {});\n}\n\nFuture<void> neverUsed() async {\n  onTapRewardCall(go);\n}\n\nvoid main() => build();\n")
  assert.deepEqual(placements(pl).map((x) => `${x.id} ${x.kind}`), ['lib/s.dart:2 native', 'lib/s.dart:3 full-screen: intro app open', 'lib/s.dart:4 full-screen: intro app open'])
  assert.equal(placements(pl, { all: true }).find((x) => x.id === 'lib/s.dart:8').dead, 'in neverUsed(), which nothing calls')
  assert.equal(proof(pl).ok, false)
  wp(SEEN, JSON.stringify({ 'lib/s.dart:4': { ok: true, libHash: libHash(pl), checker: CHECKER, screenshot: 'x.png' } }))
  assert.match(proof(pl).text, /^NOT SEEN lib\/s\.dart:2 \(native\)\nPASS lib\/s\.dart:3 \(full-screen: intro app open\) — the same call as lib\/s\.dart:4, seen\n/)
  const h0 = libHash(pl), gate = { ok: true, libHash: h0, checker: CHECKER, apk: 'app-release.apk' }
  wp(SEEN, JSON.stringify({ 'lib/s.dart:4': { ok: true, libHash: h0, checker: CHECKER, screenshot: 'x.png' }, 'lib/s.dart:2': { ok: true, libHash: h0, checker: CHECKER, screenshot: 'y.png' } }))
  assert.equal(proof(pl).ok, false); assert.match(proof(pl).text, /NOT RUN launch debug — /, 'a run without launch / stress is not proven')
  wp(SEEN, JSON.stringify({ _launch: { debug: gate, release: gate }, _stress: { ok: true, libHash: h0, checker: CHECKER, kind: 'release', injected: 600 }, 'lib/s.dart:4': { ok: true, libHash: h0, checker: CHECKER, screenshot: 'x.png' }, 'lib/s.dart:2': { ok: true, libHash: h0, checker: CHECKER, screenshot: 'y.png' } }))
  assert.equal(proof(pl).ok, true); assert.match(proof(pl).text, /NEVER CALLED lib\/s\.dart:8/); assert.match(proof(pl).text, /3 of 3 crash gates passed/)
  wp('lib/s.dart', read(path.join(pl, 'lib/s.dart')) + '// edited\n')
  assert.equal(proof(pl).ok, false); assert.match(proof(pl).text, /STALE \(the code changed after it passed\) lib\/s\.dart:2/); assert.match(proof(pl).text, /STALE .* launch release/)
  fs.rmSync(pl, { recursive: true, force: true })
  out.push('placements / proof ok')

  // reset: app-factory's commits reverted; an earlier version's file removed only if the app's first commit lacks it
  const rr = tmp('ads-reset-'), wr = (f, t) => put(path.join(rr, f), t), gr = gitIn(rr)
  fixture(wr); wr('lib/ads/loading_screen.dart', 'the app\'s own\n'); gr('init', '-q'); gr('add', '-A'); gr('commit', '-q', '-m', 'base')
  wr('lib/ads/app_variable.dart', 'old app-factory port\n'); gr('add', '-A'); gr('commit', '-q', '-m', 'ads by an older app-factory')
  install(rr); gr('add', '-A'); gr('commit', '-q', '-m', 'app-factory: ads')
  const rs1 = reset(rr)
  assert.ok(rs1.ok, rs1.text)
  assert.match(rs1.text, /^reverted \w{7} "app-factory: ads"\nremoved 1 file\(s\) an earlier app-factory version installed \(one commit\): lib\/ads\/app_variable\.dart\nkept \(in the app's first commit, so the app's own\): lib\/ads\/loading_screen\.dart\n/)
  assert.equal(read(path.join(rr, 'lib/ads/loading_screen.dart')), 'the app\'s own\n')
  fs.rmSync(rr, { recursive: true, force: true })
  out.push('reset ok')
  return out.join('\n')
}

const main = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
const flag = (raw, name) => { const i = raw.indexOf(name); return i < 0 ? [[], raw] : [(raw[i + 1] || '').split(',').map((x) => x.trim()).filter(Boolean), raw.filter((_, k) => k !== i && k !== i + 1)] }
const [slotEdits, raw1] = flag(main ? process.argv.slice(2) : [], '--slot-edits'), [noScreen, argv] = flag(raw1, '--no-screen')
if (!main) { /* imported */ }
else if (argv[0] === 'selftest') console.log(selftest())
else if (argv[0] === 'template' && argv.length === 1) console.log(writeTemplate())
else if (argv[0] === 'placements' && argv.length === 2) console.log(placements(path.resolve(argv[1]), { all: true }).map((p) => `${p.id} (${p.kind})${p.dead ? ` — NEVER CALLED: ${p.dead}` : ''}`).join('\n'))
else if (argv[0] === 'seen' && argv.length === 4) { const { ok, text } = seen(path.resolve(argv[1]), argv[2], argv[3]); console.log(text); if (!ok) process.exit(1) }
else if (argv[0] === 'launch' && (argv.length === 4 || argv.length === 5)) { const { ok, text } = launch(path.resolve(argv[1]), argv[2], path.resolve(argv[3]), { keepData: argv.includes('--keep-data') }); console.log(text); if (!ok) process.exit(1) }
else if (argv[0] === 'stress' && (argv.length === 3 || argv.length === 4)) { const { ok, text } = stress(path.resolve(argv[1]), argv[2], Number(argv[3]) || 600); console.log(text); if (!ok) process.exit(1) }
else if (argv[0] === 'proof' && argv.length === 2) { const { ok, text } = proof(path.resolve(argv[1])); console.log(text); if (!ok) process.exit(1) }
else if (argv[0] === 'reset' && argv.length === 2) { const { ok, text } = reset(path.resolve(argv[1])); console.log(text); if (!ok) process.exit(1) }
else if (argv[0] === 'verify' && argv.length === 3) { const { ok, text } = verify(path.resolve(argv[1]), argv[2], { slotEdits, noScreen }); console.log(text); if (!ok) process.exit(1) }
else if (argv[0] === 'changes' && (argv.length === 3 || argv.length === 4)) {
  const out = path.resolve(argv[3] || path.join(argv[1], REPORT)), r = changes(path.resolve(argv[1]), argv[2], { slotEdits, noScreen })
  fs.writeFileSync(out, r)
  console.log(`${out}\n${r.split('\n').filter((l) => /^- (\d|Checks)/.test(l)).join('\n')}`)
  const fails = r.split('\n').filter((l) => l.startsWith('- **FAIL**'))
  if (fails.length) { console.error(`\n${fails.join('\n')}\n(evidence under each in ${REPORT})`); process.exit(1) }
} else if (argv.length === 1) {
  let r; try { r = install(path.resolve(argv[0])) } catch (e) { console.error(`ads-install: ${e.message}`); process.exit(1) }
  console.log(r.done.join('\n'))
  if (r.todo.length) { console.error(`\nNOT DONE — do these (skills/flutter-ads sections 2–3), then run again:\n- ${r.todo.join('\n- ')}`); process.exit(1) }
  console.log('\nads installed. Next: flutter pub get; then skills/flutter-ads section 2 for anything the team\'s change has that is not in yet.')
} else { console.error('usage: ads-install.mjs <project> | changes <project> <base commit> [<out file>] [--slot-edits f:n,…] [--no-screen f,…] | verify <project> <base commit> [--slot-edits …] [--no-screen …] | placements <project> | launch <project> <serial> <apk> [--keep-data] | stress <project> <serial> [events] | seen <project> <adb serial> <placement> | proof <project> | reset <project> | template | selftest'); process.exit(2) }
