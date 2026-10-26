#!/usr/bin/env node
// Installs the ads + Remote Config pattern (skills/flutter-ads/SKILL.md) into a Flutter app — the only way
// app-factory adds ads. Copies templates/flutter/ads/ (the tested common_flow_demo files) and patches the native
// project; never overwrites a file that exists (a second run reports "kept").
//   node ads-install.mjs <project> [--no-premium]
//                                     → what it added/patched; exit 1 with the exact lines when a native file is not
//                                       Flutter's default and has no ad factory yet (the caller adds them, then reruns).
//                                       Also lib/premium_core/ (RevenueCat Premium, free uses per feature, paywall plan
//                                       switches) and its packages; --no-premium when CONTRACT.md says the app has no paid tier
//   node ads-install.mjs changes <project> <base>  → writes <project>/ADS_CHANGES.md: every file the ads work added,
//                                       changed or deleted since <base>, from git (see changes())
//   node ads-install.mjs selftest
// Template identifiers replaced: `package:common_flow_demo/` → `package:<pubspec name>/`,
// `package com.demo.common_flow_demo` → the package of the app's MainActivity.kt.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'flutter', 'ads')
// Google's sample App IDs (developers.google.com/admob/{android,ios}/quick-start): debug builds work; the owner replaces them
const SAMPLE_APP_ID = { android: 'ca-app-pub-3940256099942544~3347511713', ios: 'ca-app-pub-3940256099942544~1458002511' }
// The exact versions the pattern was tested with = common_flow_demo's pubspec.lock (demoSelftest keeps them equal). Not
// ^ranges: a range resolves the newest release, which nobody has tested with this pattern yet. 2026-10-23: moved to
// google_mobile_ads 9.2.0 (Mobile Ads SDK Android 25.5.0, iOS 13.11; UMP Android 4.0.0, as 9.1.0) after the guide app and a
// fresh app passed their device tests on it, Android emulator and iOS simulator.
const DEPS = [
  ['google_mobile_ads', '9.2.0', 'ads (google_ads_material/)'],
  ['firebase_core', '5.0.0', 'Remote Config + ad_impression (google_ads_material/)'],
  ['firebase_remote_config', '7.0.0', 'ads/flow values from one JSON key (google_ads_material/remote_config.dart)'],
  ['firebase_analytics', '13.0.0', 'ad revenue event ad_impression (google_ads_material/ad_impression.dart)'],
  ['firebase_crashlytics', '6.0.0', 'crash reports, set after RemoteConfigLoader.load when Firebase is configured (flutter-ads section 3)'],
  ['shimmer', '4.0.0', 'native ad loading shimmer (google_ads_material/native_ad_widget.dart)'],
  ['purchases_flutter', '10.16.0', 'Premium from the store\'s entitlement (premium_core/premium_store.dart)'],
  ['shared_preferences', '2.5.6', 'free uses per feature and the demo unlock (premium_core/)'],
]
// the Premium layer: installed unless --no-premium (an app with no paid tier); its packages only with it
const PREMIUM = 'premium_core/'
const PREMIUM_DEPS = new Set(['purchases_flutter', 'shared_preferences'])
const hasPremium = (root) => fs.existsSync(path.join(root, 'lib', PREMIUM))
const depsFor = (premium) => DEPS.filter(([n]) => premium || !PREMIUM_DEPS.has(n))
// The guide app's Info.plist text (common_flow_demo ios/Runner/Info.plist), shown if the app asks for tracking permission
const ATT_TEXT = 'This identifier will be used to deliver personalized ads to you.'
// google_mobile_ads' Package.swift says iOS 13; webview_flutter_wkwebview 3.27.1 said iOS 15 → Swift Package Manager refused the
// pair; 3.27.2 says 13 again. Pinned to the tested version (demoSelftest: = the guide app's lock and override text, so a
// later 3.27.x/3.28 that raises it again is never picked up by itself). An override, not a dependency: no Dart file imports it, and `pipeline.mjs deps` (which the gate and the
// optimise step run) fails on — and removes — an unimported dependency.
const WKWEBVIEW = '3.27.2'
const PIN = `dependency_overrides:\n  # iOS (Swift Package Manager): webview_flutter_wkwebview 3.27.1 declared iOS 15 (google_mobile_ads declares 13); 3.27.2 is 13 again. The tested version.\n  webview_flutter_wkwebview: ${WKWEBVIEW}\n`

// the version pubspec.lock resolved for a package (undefined when it is not there)
const locked = (lock, n) => (lock.match(new RegExp(`^  ${n}:\\n(?: {4}.*\\n)*? {4}version: "([^"]+)"`, 'm')) || [])[1]
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))])
const read = (f) => fs.readFileSync(f, 'utf8')
const OVERRIDES = /^dependency_overrides:\n((?:[ \t].*(?:\n|$)|\n)*)/m // a pubspec's overrides section, LF text
// `n` (an edit of `s`, the LF form of `raw`) written back with raw's line endings: the lines before and after the edit keep
// their own, the edited lines get CRLF. ponytail: a /g edit in two places gives the unchanged lines between them CRLF too
function withEndings(raw, s, n) {
  const split = (t) => t.split(/(?<=\n)/), a = split(s), b = split(n), r = split(raw)
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++
  let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
  return [...r.slice(0, p), ...b.slice(p, b.length - q).map((l) => l.replace(/\n$/, '\r\n')), ...r.slice(r.length - q)].join('')
}
// Dart text with every /* … */ (nested, as Dart allows) turned into spaces, line breaks kept so line numbers stay; a "/*"
// inside a string or a // comment is not a comment. ponytail: ${…} in a string is not parsed (a quote inside it ends the string)
function blankBlockComments(t) {
  let out = '', i = 0, depth = 0, q = '', raw = false
  while (i < t.length) {
    const two = t.slice(i, i + 2)
    if (depth) {
      const d = two === '/*' ? 1 : two === '*/' ? -1 : 0
      if (d) { depth += d; out += '  '; i += 2 } else { out += t[i] === '\n' ? '\n' : ' '; i++ }
    } else if (q) {
      if (!raw && t[i] === '\\') { out += two; i += 2 } else if (t.startsWith(q, i)) { out += q; i += q.length; q = '' } else { out += t[i]; i++ }
    } else if (two === '/*') { depth = 1; out += '  '; i += 2 }
    else if (two === '//') { const e = t.indexOf('\n', i) < 0 ? t.length : t.indexOf('\n', i); out += t.slice(i, e); i = e }
    else if (t[i] === "'" || t[i] === '"') { q = t.startsWith(t[i].repeat(3), i) ? t[i].repeat(3) : t[i]; raw = t[i - 1] === 'r' && !/\w/.test(t[i - 2] || ''); out += q; i += q.length }
    else { out += t[i]; i++ }
  }
  return out
}

// The app's pubspec name, its MainActivity.kt (undefined when it has none) and the template-text rewrite for this app.
function ids(root) {
  if (!fs.existsSync(path.join(root, 'pubspec.yaml'))) throw new Error(`no pubspec.yaml in ${root}`)
  const name = (read(path.join(root, 'pubspec.yaml')).match(/^name:\s*(\S+)/m) || [])[1]
  const src = path.join(root, 'android/app/src/main')
  const main = fs.existsSync(src) && walk(src).find((f) => /(^|\/)MainActivity\.kt$/.test(f))
  const mainPath = main ? path.join(src, main) : undefined
  const pkg = mainPath && (read(mainPath).match(/^package\s+([\w.]+)/m) || [])[1]
  const fix = (s) => s.replaceAll('package:common_flow_demo/', `package:${name}/`).replaceAll('package com.demo.common_flow_demo', `package ${pkg}`)
  return { name, mainPath, fix }
}

export function install(root, { premium = true } = {}) {
  const done = [], todo = []
  const deps = depsFor(premium)
  const at = (...p) => path.join(root, ...p)
  const { mainPath, fix } = ids(root)
  if (!mainPath) throw new Error('no android/app/src/main/**/MainActivity.kt (Kotlin) — create the app with flutter create')
  const put = (to, text) => {
    if (fs.existsSync(to)) return done.push(`kept ${path.relative(root, to)} (exists)`)
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, text); done.push(`added ${path.relative(root, to)}`)
  }
  const patch = (rel, test, edit, what) => {
    const f = at(rel); const raw = read(f); const s = raw.replaceAll('\r\n', '\n') // the edits match LF text
    if (test(s)) return
    const n = edit(s); if (n === s) throw new Error(`${rel}: could not ${what}`)
    fs.writeFileSync(f, raw === s ? n : withEndings(raw, s, n)); done.push(`${rel}: ${what}`)
  }

  // Dart: the ads layer, its tests, the defaults JSON
  for (const dir of ['lib', 'test', 'integration_test', 'assets'])
    for (const f of walk(path.join(TEMPLATE, dir)).filter((f) => premium || !f.startsWith(PREMIUM))) put(at(dir, f), fix(read(path.join(TEMPLATE, dir, f))))

  // pubspec: dependencies at the tested versions (with the reason, flutter-app L11) — an app's own line for one is set to it,
  // keeping its comment; a git/path entry is left for the user. Then integration_test, the override, the asset
  const has = (s, n) => new RegExp(`^  ${n}:`, 'm').test(s)
  const exact = (s, n, v) => new RegExp(`^  ${n}: ${v.replaceAll('.', '\\.')}( |$)`, 'm').test(s)
  const notPub = (s, n) => new RegExp(`^  ${n}:[ \\t]*(#.*)?\\n    `, 'm').test(s)
  patch('pubspec.yaml', (s) => deps.every(([n, v]) => exact(s, n, v) || notPub(s, n)), (s) => deps
    .reduce((t, [n, v, why]) => !has(t, n) || exact(t, n, v) || notPub(t, n) ? t
      : t.replace(new RegExp(`^  ${n}:[^#\\n]*?([ \\t]+#.*)?$`, 'm'), (m, c) => `  ${n}: ${v}${c || ` # ${why}`}`), s)
    .replace(/^dependencies:\n  flutter:\n    sdk: flutter\n/m, (m) => m + deps.filter(([n]) => !has(s, n)).map(([n, v, why]) => `  ${n}: ${v} # ${why}\n`).join('')),
    'the ads packages at the tested versions')
  const pubText = read(at('pubspec.yaml')).replaceAll('\r\n', '\n')
  for (const [n, v] of deps) if (notPub(pubText, n)) todo.push(`pubspec.yaml: ${n} is not from pub.dev (git/path): the pattern was tested with ${v}; set it, or keep it and say so`)
  patch('pubspec.yaml', (s) => /^  integration_test:/m.test(s),
    (s) => s.replace(/^dev_dependencies:\n/m, (m) => `${m}  integration_test: # device ad tests (integration_test/ads_device_test.dart)\n    sdk: flutter\n`),
    'add integration_test')
  patch('pubspec.yaml', (s) => (s.match(OVERRIDES)?.[1] || '').split('\n').includes(`  webview_flutter_wkwebview: ${WKWEBVIEW}`),
    (s) => OVERRIDES.test(s) ? s.replace(OVERRIDES, (m, body) => PIN + body // an older override of it (and its comment) is replaced
      .replace(/^  # iOS \(Swift Package Manager\):.*(\n|$)/m, '').replace(/^  webview_flutter_wkwebview:.*(\n|$)(    .*(\n|$))*/m, ''))
      : `${s.trimEnd()}\n\n${PIN}`,
    `pin webview_flutter_wkwebview ${WKWEBVIEW} (iOS build)`)
  patch('pubspec.yaml', (s) => /^\s+- assets\/remote_config_default\.json/m.test(s),
    (s) => /^  assets:\n/m.test(s) ? s.replace(/^  assets:\n/m, (m) => `${m}    - assets/remote_config_default.json\n`)
      : s.replace(/^flutter:\n/m, (m) => `${m}  assets:\n    - assets/remote_config_default.json\n`),
    'add assets/remote_config_default.json')

  // Android: native factory, layout, Facebook, App ID
  const kdir = path.dirname(mainPath)
  for (const f of ['NativeAdStyle.kt', 'SmallNativeAdFactory.kt']) put(path.join(kdir, f), fix(read(path.join(TEMPLATE, 'android', f))))
  put(at('android/app/src/main/res/layout/native_small.xml'), read(path.join(TEMPLATE, 'android/native_small.xml')))
  const mainText = read(mainPath)
  if (!/registerNativeAdFactory/.test(mainText)) {
    if (/^package [\w.]+\s+import io\.flutter\.embedding\.android\.FlutterActivity\s+class MainActivity\s*:\s*FlutterActivity\(\)\s*$/.test(mainText.trim())) {
      fs.writeFileSync(mainPath, fix(read(path.join(TEMPLATE, 'android/MainActivity.kt')))); done.push(`${path.relative(root, mainPath)}: native factory "smallNative" + Facebook channel`)
    } else todo.push(`${path.relative(root, mainPath)} is not Flutter's default: add from templates/flutter/ads/android/MainActivity.kt the configureFlutterEngine registration (GoogleMobileAdsPlugin.registerNativeAdFactory(flutterEngine, "smallNative", SmallNativeAdFactory(layoutInflater))), the "nativeChannel" handler and cleanUpFlutterEngine`)
  }
  const strings = 'android/app/src/main/res/values/strings.xml'
  put(at(strings), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n')
  patch(strings, (s) => s.includes('facebook_app_id_placeholder'),
    (s) => s.replace('</resources>', '    <!-- Facebook SDK needs a value here; the real id/token are set at runtime from Remote Config (facebookId, facebookToken). -->\n    <string name="facebook_app_id_placeholder">0</string>\n    <string name="facebook_client_token_placeholder">0</string>\n</resources>'),
    'Facebook placeholders')
  const manifest = 'android/app/src/main/AndroidManifest.xml'
  patch(manifest, (s) => s.includes('com.google.android.gms.permission.AD_ID'),
    (s) => s.replace(/(<manifest[^>]*>\n)/, `$1${['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE', 'com.google.android.gms.permission.AD_ID']
      .filter((p) => !s.includes(`"${p}"`)).map((p) => `    <uses-permission android:name="${p}"/>\n`).join('')}`),
    'internet + AD_ID permissions')
  patch(manifest, (s) => s.includes('com.google.android.gms.ads.APPLICATION_ID'),
    (s) => s.replace(/(\n\s*)<\/application>/, `$1    <!-- AdMob App ID: Google's sample id; replace with the app's own before release. -->$1    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${SAMPLE_APP_ID.android}"/>$1    <!-- Facebook: id/token at runtime from Remote Config (MainActivity "nativeChannel"). -->$1    <meta-data android:name="com.facebook.sdk.AutoInitEnabled" android:value="false"/>$1    <meta-data android:name="com.facebook.sdk.ApplicationId" android:value="@string/facebook_app_id_placeholder"/>$1    <meta-data android:name="com.facebook.sdk.ClientToken" android:value="@string/facebook_client_token_placeholder"/>$1</application>`),
    'AdMob App ID + Facebook meta-data')
  const gradle = 'android/app/build.gradle.kts'
  patch(gradle, (s) => s.includes('com.facebook.android:facebook-core'),
    (s) => /^dependencies \{\n/m.test(s) ? s.replace(/^dependencies \{\n/m, (m) => `${m}    implementation("com.facebook.android:facebook-core:18.0.0") // Facebook init (MainActivity)\n`)
      : `${s.trimEnd()}\n\ndependencies {\n    implementation("com.facebook.android:facebook-core:18.0.0") // Facebook init (MainActivity)\n}\n`,
    'facebook-core dependency')
  patch(gradle, (s) => !/minSdk\s*=\s*(\d+)/.test(s) || +s.match(/minSdk\s*=\s*(\d+)/)[1] >= 24,
    (s) => s.replace(/minSdk\s*=\s*\d+/, 'minSdk = 24 // google_mobile_ads'), 'minSdk 24')

  // iOS: native factory in AppDelegate.swift (no Xcode project edit), App ID, iOS 15
  const del = 'ios/Runner/AppDelegate.swift'
  const delText = read(at(del))
  const flutterDefault = `import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}`
  if (!/SmallNativeAdFactory/.test(delText)) {
    if (delText.trim() === flutterDefault) { fs.writeFileSync(at(del), read(path.join(TEMPLATE, 'ios/AppDelegate.swift'))); done.push(`${del}: native factory "smallNative" (SmallNativeAdFactory + NativeAdStyle)`) }
    else todo.push(`${del} is not Flutter's default: add from templates/flutter/ads/ios/AppDelegate.swift the imports (GoogleMobileAds, google_mobile_ads), the FLTGoogleMobileAdsPlugin.registerNativeAdFactory(…, factoryId: "smallNative", …) line after GeneratedPluginRegistrant, and everything below "// MARK: - Native ads"`)
  }
  patch('ios/Runner/Info.plist', (s) => s.includes('GADApplicationIdentifier'),
    (s) => s.replace(/\n<\/dict>\n<\/plist>/, `\n\t<key>GADApplicationIdentifier</key>\n\t<string>${SAMPLE_APP_ID.ios}</string>\n</dict>\n</plist>`),
    'GADApplicationIdentifier (Google sample; replace before release)')
  patch('ios/Runner/Info.plist', (s) => s.includes('NSUserTrackingUsageDescription'),
    (s) => s.replace(/\n<\/dict>\n<\/plist>/, `\n\t<key>NSUserTrackingUsageDescription</key>\n\t<string>${ATT_TEXT}</string>\n</dict>\n</plist>`),
    'NSUserTrackingUsageDescription (the guide app\'s text)')
  const pbx = 'ios/Runner.xcodeproj/project.pbxproj'
  if (fs.existsSync(at(pbx))) patch(pbx, (s) => ![...s.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].some((m) => parseFloat(m[1]) < 15),
    (s) => s.replace(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g, (m, v) => parseFloat(v) < 15 ? 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;' : m), 'iOS deployment target 15.0')

  return { done, todo }
}

// Every file the template puts into this app (its path in the app → the text install() writes there).
function templateFiles(root) {
  const { mainPath, fix } = ids(root)
  const m = new Map()
  for (const dir of ['lib', 'test', 'integration_test', 'assets'])
    for (const f of walk(path.join(TEMPLATE, dir)).filter((f) => hasPremium(root) || !f.startsWith(PREMIUM))) m.set(`${dir}/${f}`, fix(read(path.join(TEMPLATE, dir, f))))
  if (mainPath) for (const f of ['NativeAdStyle.kt', 'SmallNativeAdFactory.kt'])
    m.set(path.relative(root, path.join(path.dirname(mainPath), f)), fix(read(path.join(TEMPLATE, 'android', f))))
  m.set('android/app/src/main/res/layout/native_small.xml', read(path.join(TEMPLATE, 'android/native_small.xml')))
  return m
}

const REPORT = 'ADS_CHANGES.md'
// `flutter test --file-reporter json:.dart_tool/<name>` before the ads work (step 1) and after it (step 8)
const TESTS_BEFORE = 'ads_tests_before.json', TESTS_AFTER = 'ads_tests_after.json'
// Files `flutter pub get` rewrites: counted, never printed.
const GENERATED = /(^|\/)(pubspec\.lock|Podfile\.lock|Package\.resolved|GeneratedPluginRegistrant\.\w+|generated_plugin(s|_registrant)?\.\w+)$/
const TEST_NAME = /\b(?:testWidgets|test|group|patrolTest)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g

// What implementing ads changed in the app, read from git and the files — nothing in it is written by hand: the app's
// working tree (committed or not, plus untracked files) against <base>, the commit before the ads work.
export function changes(root, base) {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20 })
  const tpl = templateFiles(root)
  const { name } = ids(root)
  const files = new Map() // path → { status: A|M|D, add, del }
  for (const l of git('diff', '--no-renames', '--name-status', base).split('\n').filter(Boolean)) {
    const [s, f] = l.split('\t'); files.set(f, { status: s[0] })
  }
  for (const l of git('diff', '--no-renames', '--numstat', base).split('\n').filter(Boolean)) {
    const [a, d, f] = l.split('\t'); Object.assign(files.get(f), { add: a, del: d })
  }
  // a file not committed yet: git's own diff against nothing, so it reads the same as once it is committed
  const fresh = (...a) => { try { return git('diff', '--no-index', ...a) } catch (e) { return e.stdout } }
  for (const f of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
    const [add, del] = fresh('--numstat', '--', '/dev/null', f).split('\t')
    files.set(f, { status: 'A', add, del, untracked: true })
  }
  files.delete(REPORT)
  const sorted = [...files].sort(([a], [b]) => a.localeCompare(b))
  const diffOf = (f, x) => (x.untracked ? fresh('--', '/dev/null', f) : git('diff', '--no-renames', base, '--', f)).split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file mode)/.test(l)).join('\n').trimEnd()
  const block = (s) => `\`\`\`diff\n${s}\n\`\`\``

  const fromTpl = sorted.filter(([f, x]) => x.status !== 'D' && tpl.has(f)) // added now, or there from an earlier install
  const differ = fromTpl.filter(([f]) => read(path.join(root, f)) !== tpl.get(f))
  const own = sorted.filter(([f, x]) => !(x.status !== 'D' && tpl.has(f)) && !GENERATED.test(f))
  const generated = sorted.filter(([f]) => GENERATED.test(f))

  // the ads layer's public names, from the template itself
  const api = [...new Set([...tpl].filter(([f]) => /^lib\/(google_ads_material|premium_core)\//.test(f))
    .flatMap(([, s]) => [...s.matchAll(/^(?:abstract )?(?:class|enum|mixin) ([A-Z]\w*)/gm)].map((m) => m[1])))]
  const uses = []
  const src = new Map() // the app's own lib/**/*.dart (not the template) → its lines
  const lib = path.join(root, 'lib')
  if (fs.existsSync(lib)) for (const f of walk(lib).filter((f) => f.endsWith('.dart') && !/^(google_ads_material|premium_core)\//.test(f)).sort()) {
    src.set(`lib/${f}`, blankBlockComments(read(path.join(lib, f))).split('\n'))
    src.get(`lib/${f}`).forEach((l, i) => { if (new RegExp(`\\b(${api.join('|')})\\b`).test(l)) uses.push(`lib/${f}:${i + 1}: \`${l.trim()}\``) })
  }

  const tests = own.filter(([f]) => /^(test|integration_test)\//.test(f)).flatMap(([f, x]) =>
    diffOf(f, x).split('\n').filter((l) => l.startsWith('+')).flatMap((l) => [...l.matchAll(TEST_NAME)].map((m) => `${f}: ${m[2].replace(/\\(.)/g, '$1')}`)))

  const tplDiff = new Map(differ.map(([f]) => {
    const t = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ads-tpl-')), path.basename(f)); fs.writeFileSync(t, tpl.get(f))
    let d = ''; try { git('diff', '--no-index', t, path.join(root, f)) } catch (e) { d = e.stdout }
    fs.rmSync(path.dirname(t), { recursive: true, force: true })
    return [f, d.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).join('\n').trimEnd()]
  }))
  const lines = (d, sign) => d.split('\n').filter((l) => l.startsWith(sign) && l.slice(1).trim()).map((l) => l.slice(1).trim())
  const code = (l) => l.trim() && !/^\s*(\/\/|\/?\*|import )/.test(l) // not blank, a comment or an import

  // Checks: [passed, id, what, evidence]. I = the app as it was still works; P = the common_flow_demo pattern.
  const checks = []
  const check = (id, what, bad, ok = []) => checks.push([!bad.length, id, what, bad.length ? bad : ok])
  const at = (re) => [...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && re.test(l) ? [`${f}:${i + 1}`] : []))
  const present = (id, what, re) => { const w = at(re); check(id, what, w.length ? [] : ['not found in the app\'s own lib/'], w) }
  const { mainPath } = ids(root)
  const patched = new Set(['pubspec.yaml', 'android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle.kts', 'android/app/src/main/res/values/strings.xml',
    'ios/Runner/AppDelegate.swift', 'ios/Runner/Info.plist', 'ios/Runner.xcodeproj/project.pbxproj', mainPath && path.relative(root, mainPath)])
  const word = { A: 'added', M: 'changed', D: 'deleted' }

  check('I1', 'Only files the ads work owns were touched: the template\'s, the native files and pubspec the installer patches, lib/, test/, integration_test/, CONTRACT.md',
    own.filter(([f]) => !patched.has(f) && !/^(lib|test|integration_test)\//.test(f) && f !== 'CONTRACT.md').map(([f, x]) => `\`${f}\` ${word[x.status] || x.status}`))
  check('I2', 'No test that existed before was changed or deleted',
    own.filter(([f, x]) => /^(test|integration_test)\//.test(f) && x.status !== 'A').map(([f, x]) => `\`${f}\` ${word[x.status] || x.status}`))
  const run = (name) => {
    const p = path.join(root, '.dart_tool', name); if (!fs.existsSync(p)) return null
    const suite = {}, test = {}, passed = new Set(), all = new Set()
    for (const l of read(p).split('\n').filter((l) => l.trim())) {
      const e = JSON.parse(l)
      if (e.type === 'suite') suite[e.suite.id] = path.relative(root, e.suite.path || '')
      else if (e.type === 'testStart') test[e.test.id] = `${suite[e.test.suiteID]}: ${e.test.name}`
      else if (e.type === 'testDone' && !e.hidden) { all.add(test[e.testID]); if (e.result === 'success' && !e.skipped) passed.add(test[e.testID]) }
    }
    return { passed, all }
  }
  const before = run(TESTS_BEFORE), after = run(TESTS_AFTER)
  check('I3', `Every test that passed before the ads work passes now${before && after ? ` (${before.passed.size} passed before; ${after.passed.size} of ${after.all.size} pass now)` : ''}`,
    !before || !after ? [`\`.dart_tool/${!before ? TESTS_BEFORE : TESTS_AFTER}\` is missing: run the suite with \`--file-reporter json:.dart_tool/${!before ? TESTS_BEFORE : TESTS_AFTER}\``]
      : [...before.passed].filter((t) => !after.passed.has(t)).map((t) => `${t} — ${after.all.has(t) ? 'fails now' : 'no longer runs'}`),
    before && before.all.size > before.passed.size ? [`${before.all.size - before.passed.size} failed or were skipped already before the ads work`] : [])
  const ALLOW_IMPORT = /^import\s+['"][^'"]*google_ads_material\/(ad_flags|ads_id|app_open_ad_manager)\.dart['"]\s*;/
  // the diff with /* … */ blanked on both sides: commented-out code is neither gained nor lost, code put inside /* */ is lost
  const liveDiff = (f, x) => {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-live-')), a = path.join(t, 'before'), b = path.join(t, 'now')
    fs.writeFileSync(a, x.status === 'A' ? '' : blankBlockComments(git('show', `${base}:${f}`)))
    fs.writeFileSync(b, blankBlockComments(read(path.join(root, f))))
    let d = ''; try { git('diff', '--no-index', a, b) } catch (e) { d = e.stdout }
    fs.rmSync(t, { recursive: true, force: true })
    return d.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).join('\n')
  }
  const ALLOW_CALL = /^(AppResumeAdListener\.skipNextResume\(\)|AdFlags\.isPremium\s*=\s*(true|false)|AdsId\.disableAllAds\(\))\s*;\s*(\/\/.*)?$/
  check('I4', 'The backend (lib/data/, lib/domain/) keeps every line it had and gains only imports of ad_flags.dart, ads_id.dart or app_open_ad_manager.dart and the calls skipNextResume(), AdFlags.isPremium = …, AdsId.disableAllAds() (flutter-ads section 7)',
    own.filter(([f]) => /^lib\/(data|domain)\//.test(f)).flatMap(([f, x]) => x.status === 'D' ? [`\`${f}\` deleted`] : [
      ...lines(liveDiff(f, x), '-').map((l) => `\`${f}\` lost \`${l}\``),
      ...lines(liveDiff(f, x), '+').filter((l) => !/^\/\//.test(l) && !ALLOW_IMPORT.test(l) && !ALLOW_CALL.test(l)).map((l) => `\`${f}\` gained \`${l}\``)]))
  const pubNow = fs.existsSync(path.join(root, 'pubspec.yaml')) ? read(path.join(root, 'pubspec.yaml')) : ''
  const basePub = own.some(([f, x]) => f === 'pubspec.yaml' && x.status === 'M') ? git('show', `${base}:pubspec.yaml`).replaceAll('\r\n', '\n') : ''
  const oldOverride = new Set((basePub.match(OVERRIDES)?.[1] || '').split('\n').map((l) => l.trim()))
  const overridden = new RegExp(`^  webview_flutter_wkwebview: ${WKWEBVIEW.replaceAll('.', '\\.')}$`, 'm').test(pubNow)
  const pinned = (l) => DEPS.some(([n, v]) => new RegExp(`^${n}:`).test(l) && new RegExp(`^  ${n}: ${v.replaceAll('.', '\\.')}( |$)`, 'm').test(pubNow))
    || (overridden && oldOverride.has(l) && /^(webview_flutter_wkwebview:|# iOS \(Swift Package Manager\):)/.test(l))
  check('I5', 'pubspec.yaml keeps every line it had (no existing package or version changed; an ads package set to the tested version, P14, is the pattern\'s)',
    own.filter(([f]) => f === 'pubspec.yaml').flatMap(([f, x]) => lines(diffOf(f, x), '-').filter((l) => !pinned(l)).map((l) => `lost \`${l}\``)))

  const MAY_GROW = new Set(['lib/google_ads_material/ad_flags.dart', 'lib/google_ads_material/ads_id.dart', 'lib/google_ads_material/native_ad_manager.dart'])
  const json = (s) => { try { return JSON.parse(s) } catch { return null } }
  check('P1', 'The installed files are common_flow_demo\'s as the template has them; only ad_flags.dart, ads_id.dart, native_ad_manager.dart and remote_config_default.json may gain lines (new keys, slots, flags — flutter-ads section 2)', [
    ...[...tpl.keys()].filter((f) => !fs.existsSync(path.join(root, f))).map((f) => `\`${f}\` missing`),
    ...differ.flatMap(([f]) => {
      if (f === 'assets/remote_config_default.json') {
        const t = json(tpl.get(f)), a = json(read(path.join(root, f)))
        return !a ? [`\`${f}\` is not valid JSON`] : Object.keys(t).filter((k) => a[k] !== t[k]).map((k) => `\`${f}\` "${k}": ${k in a ? `"${a[k]}", the template has "${t[k]}"` : 'missing'}`)
      }
      return MAY_GROW.has(f) ? lines(tplDiff.get(f), '-').map((l) => `\`${f}\` lost \`${l}\``) : [`\`${f}\` differs from the template`]
    })])
  const steps = [`RemoteConfigLoader.load('${name}_v1')`, 'FacebookInit.init()', 'SplashAds.run(', 'SplashAds.afterSplash()']
  const ordered = [...src].flatMap(([f, ls]) => {
    const t = ls.map((l) => code(l) ? l.replaceAll('"', "'") : '').join('\n'), pos = []
    for (const s of steps) { const i = t.indexOf(s, pos.length ? pos.at(-1) + 1 : 0); if (i < 0) return []; pos.push(i) }
    return [`${f}:${pos.map((p) => t.slice(0, p).split('\n').length).join(', ')}`]
  })
  check('P2', `Startup runs the pattern's steps in this order in one file: ${steps.join(' → ')}… (flutter-ads section 3)`,
    ordered.length ? [] : steps.map((s) => `${s}: ${at(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll("'", '[\'"]'))).join(', ') || 'not found'}`), ordered)
  present('P3', 'The ads\' "Showing Ads..." loader has its navigator: AppHud.navigatorKey', /AppHud\.navigatorKey/)
  present('P4', 'Home turns the resume app open ad on: AppResumeAdListener.enabled = true', /AppResumeAdListener\.enabled\s*=\s*true/)
  present('P5', 'Home feature taps go through the home tap rule: AdTapHelper.onHomeTap(', /AdTapHelper\.onHomeTap\(/)
  const LEAVE = /\b(openAppSettings|launchUrl|launchUrlString|pickImage|pickMultiImage|pickVideo|pickMedia|pickMultipleMedia|pickFiles|getDirectoryPath|saveFile|requestReview|openStoreListing|buyNonConsumable|buyConsumable|restorePurchases)\s*\(|\b(Share|SharePlus\.instance)\.share\w*\s*\(/
  const leaves = [...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && LEAVE.test(l) ? [[f, i, ls.slice(Math.max(0, i - 3), i + 1).findLastIndex((p) => /skipNextResume\(\)/.test(p))]] : []))
  const callName = (f, i) => src.get(f)[i].match(LEAVE)[0].replace(/\s*\($/, '')
  check('P6', 'Every call that leaves the app (picker, Settings, browser, share, review, store, purchase) has AppResumeAdListener.skipNextResume() on one of the 3 lines before it (flutter-ads section 3)',
    leaves.filter(([, , k]) => k < 0).map(([f, i]) => `${f}:${i + 1} \`${callName(f, i)}\` has no skipNextResume() before it`),
    leaves.map(([f, i, k]) => `${f}:${i + 1} \`${callName(f, i)}\` — skipNextResume() at line ${Math.max(0, i - 3) + k + 1}`))
  check('P7', 'No banner on a screen with a text field (flutter-ads section 2)',
    [...src].filter(([, ls]) => ls.some((l) => code(l) && /BannerAdWidget\(/.test(l)) && ls.some((l) => code(l) && /\b(TextField|TextFormField|CupertinoTextField)\(/.test(l))).map(([f]) => `${f} has BannerAdWidget and a text field`))
  check('P9', 'Every screen that blocks the resume ad (Premium) unblocks it: AppResumeAdListener.block() with unblock() (flutter-ads section 3)',
    [...src].filter(([, ls]) => ls.some((l) => code(l) && /AppResumeAdListener\.block\(\)/.test(l)) && !ls.some((l) => code(l) && /AppResumeAdListener\.unblock\(\)/.test(l))).map(([f]) => `${f} calls block() but never unblock()`))
  const crash = at(/FlutterError\.onError\s*=\s*FirebaseCrashlytics\.instance\.recordFlutterFatalError/)
  const crashFile = (w) => src.get(w.split(':')[0])
  check('P10', 'Crash reports are set up as the guide app does (firebase.dart): FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError and PlatformDispatcher.instance.onError, in a file that checks RemoteConfigState.firebaseReady first (no Firebase files → nothing set, no crash)',
    !crash.length ? ['FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError: not found in the app\'s own lib/'] : crash.flatMap((w) => [
      ...(crashFile(w).some((l) => code(l) && /PlatformDispatcher\.instance\.onError\s*=/.test(l)) ? [] : [`${w.split(':')[0]} has no PlatformDispatcher.instance.onError`]),
      ...(crashFile(w).some((l) => code(l) && /RemoteConfigState\.firebaseReady/.test(l)) ? [] : [`${w.split(':')[0]} sets the handlers without checking RemoteConfigState.firebaseReady`])]),
    crash)
  const OTHER_ADS = /\b(FirebaseRemoteConfig|MobileAds\.instance|(Interstitial|AppOpen|Rewarded|RewardedInterstitial|AdManagerInterstitial)Ad\.load|BannerAd\(|AdManagerBannerAd\(|NativeAd\()/
  const keys = [...new Set([...src].flatMap(([, ls]) => ls.filter(code).flatMap((l) => [...l.matchAll(/RemoteConfigLoader\.load\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]))))]
  check('P11', `One Remote Config key (\`${name}_v1\`), and lib/google_ads_material/ is the only ads and Remote Config code: no other Remote Config fetch, ads SDK init or ad load in the app's own lib/ (flutter-ads section 3)`, [
    ...(keys.length === 1 && keys[0] === `${name}_v1` ? [] : [`RemoteConfigLoader.load keys: ${keys.map((k) => `'${k}'`).join(', ') || 'none'} (expected only '${name}_v1')`]),
    ...[...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && OTHER_ADS.test(l) ? [`${f}:${i + 1} \`${l.trim()}\``] : []))])
  const NET = /connectivity|isOnline|hasInternet|isConnected|internetConnection/i
  const loads = [...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && /RemoteConfigLoader\.load\(/.test(l) ? [[f, i]] : []))
  check('P12', 'The ads startup runs online or offline: no `if` on the connection before RemoteConfigLoader.load in its file (the guide app runs it on the first connectivity result, whatever it is: offline → the defaults, and the SDK starts on the consent stored on the device); step 8 also opens the app offline',
    !loads.length ? ['RemoteConfigLoader.load not found (P2)'] : loads.flatMap(([f, n]) => src.get(f).slice(0, n).flatMap((l, i) => code(l) && /\bif\s*\(/.test(l) && NET.test(l) ? [`${f}:${i + 1} \`${l.trim()}\` comes before the startup at line ${n + 1}`] : [])),
    loads.map(([f, n]) => `${f}:${n + 1}`))
  check('P13', 'Premium comes from the store\'s active entitlement (the guide app: customerInfo.entitlements.all[entitlementKey]?.isActive), never from a match on product or subscription id names (flutter-ads section 5)',
    [...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && /(activeSubscriptions|allPurchasedProductIdentifiers|productIdentifier|productId|productID)\b[^;]*\.contains\(/.test(l) ? [`${f}:${i + 1} \`${l.trim()}\``] : [])))
  const lockText = fs.existsSync(path.join(root, 'pubspec.lock')) ? read(path.join(root, 'pubspec.lock')) : null
  const wk = lockText && locked(lockText, 'webview_flutter_wkwebview')
  const tested = depsFor(hasPremium(root))
  check('P14', `The ads packages resolve to the versions the pattern was tested with (common_flow_demo's pubspec.lock): ${tested.map(([n, v]) => `${n} ${v}`).join(', ')}, webview_flutter_wkwebview ${WKWEBVIEW}`,
    !lockText ? ['pubspec.lock missing: run flutter pub get'] : [
      ...tested.filter(([n, v]) => locked(lockText, n) !== v).map(([n, v]) => `${n} ${locked(lockText, n) || 'is not in pubspec.lock'} (tested: ${v})`),
      ...(wk && wk !== WKWEBVIEW ? [`webview_flutter_wkwebview ${wk} (tested: ${WKWEBVIEW}, flutter-ads section 1)`] : [])])
  const has = (f, needle) => !fs.existsSync(path.join(root, f)) || read(path.join(root, f)).includes(needle)
  check('P15', 'The native settings the guide app has: AndroidManifest.xml INTERNET, AD_ID and the AdMob APPLICATION_ID; Info.plist GADApplicationIdentifier and NSUserTrackingUsageDescription', [
    ...['android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID', 'com.google.android.gms.ads.APPLICATION_ID'].filter((k) => !has('android/app/src/main/AndroidManifest.xml', k)).map((k) => `AndroidManifest.xml has no ${k}`),
    ...['GADApplicationIdentifier', 'NSUserTrackingUsageDescription'].filter((k) => !has('ios/Runner/Info.plist', `<key>${k}</key>`)).map((k) => `Info.plist has no ${k}`)])
  const failed = checks.filter(([ok]) => !ok)

  const head = git('log', '-1', '--format=%h %s', base).trim()
  return [
    `# Ads: what changed`,
    '',
    `Generated by \`ads-install.mjs changes\` from git (\`git diff ${head.split(' ')[0]}\` plus untracked files) and the plugin's template — not written by hand. App \`${name}\`; before the ads work: \`${head}\`. Remote Config key: \`${name}_v1\`.`,
    '',
    `- ${fromTpl.length} files installed from the template — ${differ.length ? `**${differ.length} differ from it** (diff below)` : 'all identical to it'}`,
    `- ${own.filter(([, x]) => x.status === 'A').length} files added by the wiring, ${own.filter(([, x]) => x.status === 'M').length} changed, ${own.filter(([, x]) => x.status === 'D').length} deleted`,
    `- ${uses.length} lines in the app's own code use the ads layer`,
    `- ${tests.length} test names added outside the template's tests`,
    `- ${generated.length} files regenerated by \`flutter pub get\` (counted, not shown)`,
    `- Checks: ${checks.length - failed.length} passed, ${failed.length} failed${failed.length ? ` (${failed.map(([, id]) => id).join(', ')})` : ''}`,
    '',
    `## Checks`,
    '',
    'I: the app as it was still works. P: the ads follow the common_flow_demo pattern (skills/flutter-ads). Each line was checked by the command, not judged by hand.',
    '',
    ...checks.flatMap(([ok, id, what, ev]) => [`- **${ok ? 'PASS' : 'FAIL'}** ${id} ${what}`, ...ev.map((e) => `  - ${e}`)]),
    '',
    `## Installed from the template`,
    '',
    ...fromTpl.map(([f]) => `- \`${f}\`${differ.some(([d]) => d === f) ? ' — **differs from the template**' : ''}`),
    ...differ.flatMap(([f]) => ['', `### \`${f}\` against the template`, '', block(tplDiff.get(f))]),
    '',
    `## The app's own files: added, changed, deleted`,
    '',
    '| file | | + | − |', '|---|---|---|---|',
    ...own.map(([f, x]) => `| \`${f}\` | ${{ A: 'added', M: 'changed', D: 'deleted' }[x.status] || x.status} | ${x.add} | ${x.del} |`),
    ...own.flatMap(([f, x]) => x.add === '-' ? ['', `### \`${f}\``, '', '(binary)'] : ['', `### \`${f}\``, '', block(diffOf(f, x))]),
    '',
    `## Where the app's own code uses the ads layer`,
    '',
    ...(uses.length ? uses.map((u) => `- ${u}`) : ['(none)']),
    '',
    `## Tests added`,
    '',
    ...(tests.length ? tests.map((t) => `- ${t}`) : ['(none)']),
    '',
    `## Regenerated by flutter pub get`,
    '',
    ...(generated.length ? generated.map(([f, x]) => `- \`${f}\` (+${x.add} −${x.del})`) : ['(none)']),
    '',
  ].join('\n')
}

// the files of a fresh `flutter create --platforms ios,android` (Flutter 3.47.7), trimmed to what the installer reads
function fixture(w) {
  w('pubspec.yaml', 'name: my_app\nenvironment:\n  sdk: ^3.13.5\ndependencies:\n  flutter:\n    sdk: flutter\n  cupertino_icons: ^1.0.8\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n')
  w('android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt', 'package com.acme.my_app\n\nimport io.flutter.embedding.android.FlutterActivity\n\nclass MainActivity : FlutterActivity()\n')
  w('android/app/src/main/AndroidManifest.xml', '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="my_app">\n        <activity android:name=".MainActivity"/>\n    </application>\n</manifest>\n')
  w('android/app/build.gradle.kts', 'android {\n    defaultConfig {\n        minSdk = flutter.minSdkVersion\n    }\n}\n\nflutter {\n    source = "../.."\n}\n')
  w('ios/Runner/AppDelegate.swift', `import Flutter\nimport UIKit\n\n@main\n@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {\n  override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  ) -> Bool {\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }\n\n  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {\n    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)\n  }\n}\n`)
  w('ios/Runner/Info.plist', '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleName</key>\n\t<string>my_app</string>\n</dict>\n</plist>\n')
  w('ios/Runner.xcodeproj/project.pbxproj', 'IPHONEOS_DEPLOYMENT_TARGET = 13.0;\nIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n')
}

// The template is the guide app's ads code (flutter-ads: "a copy of the guide app"): byte for byte, except the defaults
// JSON, which leaves out the guide app's own credit values (its RemoteValues, not part of the pattern).
const DEMO = process.env.ADS_DEMO || '/Users/mach/testing/common_flow_demo'
const DEMO_ONLY_KEYS = ['credit_pack_credit', 'free_credit', 'week_credit', 'year_credit', 'free_uses_quick_edit']
function demoSelftest() {
  if (!fs.existsSync(DEMO)) return `template = common_flow_demo: not checked (${DEMO} is not on this machine)`
  const kt = walk(path.join(DEMO, 'android/app/src/main')).find((f) => /(^|\/)MainActivity\.kt$/.test(f))
  const pairs = [
    ...['lib/google_ads_material', 'test/google_ads_material', 'lib/premium_core', 'test/premium_core'].flatMap((d) => walk(path.join(TEMPLATE, d)).map((f) => [`${d}/${f}`, `${d}/${f}`])),
    ...walk(path.join(TEMPLATE, 'integration_test')).map((f) => [`integration_test/${f}`, `integration_test/${f}`]),
    ...['NativeAdStyle.kt', 'SmallNativeAdFactory.kt', 'MainActivity.kt'].map((f) => [`android/${f}`, path.join('android/app/src/main', path.dirname(kt), f)]),
    ['android/native_small.xml', 'android/app/src/main/res/layout/native_small.xml'],
    ['ios/AppDelegate.swift', 'ios/Runner/AppDelegate.swift'],
  ]
  for (const [t, d] of pairs) assert.equal(read(path.join(TEMPLATE, t)), read(path.join(DEMO, d)), `template ${t} = common_flow_demo ${d}`)
  for (const d of ['lib/google_ads_material', 'test/google_ads_material', 'lib/premium_core', 'test/premium_core'])
    assert.deepEqual(walk(path.join(DEMO, d)).sort(), walk(path.join(TEMPLATE, d)).sort(), `${d}: same files in common_flow_demo and the template`)
  const demo = JSON.parse(read(path.join(DEMO, 'assets/remote_config_default.json')))
  for (const k of DEMO_ONLY_KEYS) delete demo[k]
  assert.deepEqual(JSON.parse(read(path.join(TEMPLATE, 'assets/remote_config_default.json'))), demo, 'defaults JSON = common_flow_demo\'s without its demo-only keys (credits, its Quick Edit free uses)')
  const lock = read(path.join(DEMO, 'pubspec.lock'))
  for (const [n, v] of DEPS) assert.equal(locked(lock, n), v, `${n}: the installer pins the version common_flow_demo's pubspec.lock has`)
  assert.equal(locked(lock, 'webview_flutter_wkwebview'), WKWEBVIEW, 'webview_flutter_wkwebview: the version common_flow_demo resolves')
  assert.ok(read(path.join(DEMO, 'pubspec.yaml')).includes(PIN.replace('dependency_overrides:\n', '')), 'the override (comment + version) is common_flow_demo\'s')
  assert.equal(read(path.join(DEMO, 'ios/Runner/Info.plist')).match(/<key>NSUserTrackingUsageDescription<\/key>\s*<string>([^<]*)</)[1], ATT_TEXT)
  return `template = common_flow_demo (${pairs.length + 1} files, ${DEPS.length + 1} package versions, the override, the tracking text compared)`
}

function changesSelftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-changes-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  const r_ = (f) => read(path.join(root, f))
  const g = (...a) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' })
  // `flutter test --file-reporter json:` output, as Flutter 3.47.7 writes it (one hidden "loading" test per file)
  const testRun = (suites) => {
    let id = 0; const out = []
    suites.forEach(([file, tests], s) => {
      out.push({ type: 'suite', suite: { id: s, path: path.join(root, file) } },
        { type: 'testStart', test: { id: ++id, name: `loading ${path.join(root, file)}`, suiteID: s } }, { type: 'testDone', testID: id, result: 'success', skipped: false, hidden: true })
      for (const [name, result] of tests) out.push({ type: 'testStart', test: { id: ++id, name, suiteID: s } }, { type: 'testDone', testID: id, result, skipped: false, hidden: false })
    })
    return out.map((e) => JSON.stringify(e)).join('\n') + '\n'
  }
  // pubspec.lock as `flutter pub get` writes it, for the ads packages
  const lockOf = (over = {}) => 'packages:\n' + Object.entries({ ...Object.fromEntries(DEPS.map(([n, v]) => [n, v])), webview_flutter_wkwebview: WKWEBVIEW, ...over })
    .map(([n, v]) => `  ${n}:\n    dependency: "direct main"\n    description:\n      name: ${n}\n      sha256: "00"\n      url: "https://pub.dev"\n    source: hosted\n    version: "${v}"\n`).join('')
  fixture(w)
  // an app that already had google_mobile_ads at another version than the tested one
  w('pubspec.yaml', r_('pubspec.yaml').replace('  cupertino_icons: ^1.0.8\n', '  cupertino_icons: ^1.0.8\n  google_mobile_ads: ^9.1.0\n')
    .replace('  cupertino_icons: ^1.0.8\n', '  cupertino_icons: ^1.0.8\n  webview_flutter_wkwebview: ^3.20.0 # the app\'s own\n')
    + 'dependency_overrides:\n  # iOS (Swift Package Manager): google_mobile_ads 9.1.0 declares iOS 13, webview_flutter_wkwebview 3.27.1+ iOS 15.\n  webview_flutter_wkwebview: ">=3.23.0 <3.27.1"\n')
  w('.gitignore', '.dart_tool/\n')
  w('lib/main.dart', "import 'package:flutter/material.dart';\n\nvoid main() => runApp(const MaterialApp(home: Text('home')));\n")
  w('lib/data/picker.dart', "import 'package:image_picker/image_picker.dart';\n\nclass Picker {\n  Future<void> pick() async {\n    await ImagePicker().pickImage(source: ImageSource.gallery);\n  }\n}\n")
  w('test/app_test.dart', "void main() {\n  testWidgets('home opens', (t) async {});\n}\n")
  w('lib/untouched.dart', '// not part of the ads work\n')
  w('lib/domain/rule.dart', 'int rule() => 1;\n')
  w('linux/flutter/generated_plugin_registrant.cc', '//  Generated file. Do not edit.\n')
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'app before ads')
  const base = g('rev-parse', 'HEAD').trim()
  w(`.dart_tool/${TESTS_BEFORE}`, testRun([['test/app_test.dart', [['home opens', 'success'], ['was already failing', 'failure']]]]))

  assert.deepEqual(install(root).todo, [])
  assert.match(r_('pubspec.yaml'), /^  google_mobile_ads: 9\.2\.0 # /m, 'the installer sets the app\'s own ^9.1.0 line')
  assert.ok(r_('pubspec.yaml').endsWith(PIN), 'and replaces the old override')
  // the wiring, as flutter-ads sections 2–3 say: startup steps in order, HUD key, banner, home rule, resume ad; the
  // backend gains only an allowed import and skipNextResume(); a test; one allowed addition to an installed file
  // fix 3: commented-out code is not checked (a share and a product-name match inside /* */)
  w('lib/ui/old.dart', "/* outer /* inner */\nvoid share() {\n  Share.share('hi');\n  if (info.activeSubscriptions.toString().contains('week')) {}\n}\n*/\n")
  w('lib/domain/rule.dart', 'int rule() => 1;\n/*\nint old() => 2;\n*/\n')
  w('lib/main.dart', "import 'package:flutter/material.dart';\nimport 'package:my_app/google_ads_material/banner_ad_widget.dart';\n\nFuture<void> main() async {\n  await RemoteConfigLoader.load('my_app_v1');\n  if (RemoteConfigState.firebaseReady) {\n    FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;\n    PlatformDispatcher.instance.onError = (error, stack) {\n      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);\n      return true;\n    };\n  }\n  await FacebookInit.init();\n  await SplashAds.run(isFirstTime: false);\n  SplashAds.afterSplash();\n  runApp(MaterialApp(navigatorKey: AppHud.navigatorKey, home: Column(children: [Text('home'), BannerAdWidget()])));\n  AppResumeAdListener.enabled = true;\n  AdTapHelper.onHomeTap(() {});\n}\n")
  w('lib/data/picker.dart', "import 'package:image_picker/image_picker.dart';\nimport '../google_ads_material/app_open_ad_manager.dart';\n\nclass Picker {\n  Future<void> pick() async {\n    AppResumeAdListener.skipNextResume(); // no app open ad on the way back\n    await ImagePicker().pickImage(source: ImageSource.gallery);\n  }\n}\n")
  w('test/ads_wiring_test.dart', "void main() {\n  testWidgets('AC47 home shows the banner', (t) async {});\n  test('AC48 another user\\'s profile', () {});\n}\n")
  fs.appendFileSync(path.join(root, 'lib/google_ads_material/ad_flags.dart'), '// app addition\n')
  w('pubspec.lock', lockOf())
  fs.appendFileSync(path.join(root, 'linux/flutter/generated_plugin_registrant.cc'), '#include <firebase_core/firebase_core_plugin_c_api.h>\n') // flutter pub get
  w(`.dart_tool/${TESTS_AFTER}`, testRun([['test/app_test.dart', [['home opens', 'success'], ['was already failing', 'failure']]], ['test/ads_wiring_test.dart', [['AC47 home shows the banner', 'success']]]]))
  g('add', 'lib/main.dart'); g('commit', '-q', '-m', 'part of the ads work committed') // committed and uncommitted both count

  const r = changes(root, base)
  const tplCount = [...templateFiles(root).keys()].length
  assert.match(r, new RegExp(`- ${tplCount} files installed from the template — \\*\\*1 differ from it\\*\\*`))
  assert.match(r, /- `lib\/google_ads_material\/ad_flags\.dart` — \*\*differs from the template\*\*/)
  assert.match(r, /### `lib\/google_ads_material\/ad_flags\.dart` against the template\n\n```diff\n[\s\S]*\+\/\/ app addition/)
  assert.match(r, /\| `lib\/main\.dart` \| changed \| 17 \| 1 \|/)
  assert.match(r, /### `lib\/main\.dart`\n\n```diff\n[\s\S]*\+import 'package:my_app\/google_ads_material\/banner_ad_widget\.dart';[\s\S]*-void main\(\) => runApp\(const MaterialApp\(home: Text\('home'\)\)\);/)
  assert.match(r, /\| `pubspec\.yaml` \| changed \|/)
  assert.match(r, /\| `android\/app\/src\/main\/AndroidManifest\.xml` \| changed \|/)
  assert.match(r, /\| `test\/ads_wiring_test\.dart` \| added \| 4 \| 0 \|/)
  assert.match(r, /- lib\/main\.dart:16: `runApp\(MaterialApp\(navigatorKey: AppHud\.navigatorKey, home: Column\(children: \[Text\('home'\), BannerAdWidget\(\)\]\)\)\);`/)
  assert.match(r, /- 9 lines in the app's own code use the ads layer/, 'import lines name no class; lib/google_ads_material/ itself is not counted')
  assert.match(r, /## Tests added\n\n- test\/ads_wiring_test\.dart: AC47 home shows the banner\n- test\/ads_wiring_test\.dart: AC48 another user's profile\n/, 'an escaped quote does not cut the name')
  assert.match(r, /## Regenerated by flutter pub get\n\n- `linux\/flutter\/generated_plugin_registrant\.cc` \(\+1 −0\)\n- `pubspec\.lock` \(\+\d+ −0\)/)
  assert.doesNotMatch(r, /### `pubspec\.lock`/, 'generated files are not printed')
  assert.doesNotMatch(r, /untouched\.dart|\.dart_tool/, 'a file the ads work did not touch is not listed')
  assert.doesNotMatch(r, /### `lib\/google_ads_material\/banner_ad_widget\.dart`/, 'an identical template file is listed, not printed')
  // the checks, on an app wired as the pattern says
  assert.match(r, /- Checks: 19 passed, 0 failed\n/)
  assert.match(r, /\*\*PASS\*\* I5 /, 'google_mobile_ads ^9.1.0 → 9.2.0 and the old override → 3.27.2 are the pattern, not a broken package')
  assert.doesNotMatch(r, /lib\/ui\/old\.dart:/, 'code inside /* */ is not checked')
  assert.doesNotMatch(r, /\*\*FAIL\*\*/)
  assert.match(r, /\*\*PASS\*\* I3 .* \(1 passed before; 2 of 3 pass now\)\n  - 1 failed or were skipped already before the ads work\n/)
  assert.match(r, /\*\*PASS\*\* P2 .*\n  - lib\/main\.dart:5, 13, 14, 15\n/)
  assert.match(r, /\*\*PASS\*\* P3 .*\n  - lib\/main\.dart:16\n/)
  assert.match(r, /\*\*PASS\*\* P10 .*\n  - lib\/main\.dart:7\n/)
  assert.match(r, /\*\*PASS\*\* P12 .*\n  - lib\/main\.dart:5\n/)
  assert.match(r, /\*\*PASS\*\* P6 .*\n  - lib\/data\/picker\.dart:7 `pickImage` — skipNextResume\(\) at line 6\n/)
  w(REPORT, r)
  assert.equal(changes(root, base), r, 'the report does not list itself')
  g('add', '-A'); g('commit', '-q', '-m', 'the rest of the ads work')
  assert.equal(changes(root, base), r, 'the same report before and after the commit')

  // an app that had the ads layer before the base (an earlier install): a template file it changes is still checked by P1
  const installed = g('rev-parse', 'HEAD').trim(), json = 'assets/remote_config_default.json'
  w(json, r_(json).replace('{', '{\n  "app_value": "1",'))
  const y = changes(root, installed)
  assert.match(y, /- 1 files installed from the template — \*\*1 differ from it\*\*/)
  assert.match(y, /\*\*PASS\*\* I1 /, 'the defaults JSON is the template\'s file')
  assert.match(y, /\*\*PASS\*\* P1 /, 'a new key is an allowed addition')
  w(json, r_(json).replace('"splash_ad_wait_seconds": "8"', '"splash_ad_wait_seconds": "3"'))
  assert.match(changes(root, installed), /\*\*FAIL\*\* P1 .*\n  - `assets\/remote_config_default\.json` "splash_ad_wait_seconds": "3", the template has "8"\n/)
  w(json, r_(json).replace('"splash_ad_wait_seconds": "3"', '"splash_ad_wait_seconds": "8"'))

  // each rule broken once: every check fails, with the line that breaks it
  w('lib/data/picker.dart', r_('lib/data/picker.dart').replace('class Picker {', 'class Picker2 {').replace('app_open_ad_manager.dart', 'interstitial_ad_manager.dart'))
  w('test/app_test.dart', "void main() {\n  testWidgets('home opens', (t) async {}, skip: true);\n}\n")
  w('functions/index.js', 'exports.api = () => {}\n')
  w(`.dart_tool/${TESTS_AFTER}`, testRun([['test/app_test.dart', [['home opens', 'failure']]]]))
  w('pubspec.yaml', r_('pubspec.yaml').replace('cupertino_icons: ^1.0.8', 'cupertino_icons: ^1.0.9').replace(/^  webview_flutter_wkwebview: \^3\.20\.0 .*\n/m, ''))
  fs.appendFileSync(path.join(root, 'lib/google_ads_material/banner_ad_widget.dart'), '// edited\n')
  w('lib/google_ads_material/ads_id.dart', r_('lib/google_ads_material/ads_id.dart').replace(/^.*useTestIds.*\n/m, ''))
  w('assets/remote_config_default.json', r_('assets/remote_config_default.json').replace('"splash_ad_wait_seconds": "8"', '"splash_ad_wait_seconds": "3"'))
  fs.rmSync(path.join(root, 'lib/google_ads_material/app_hud.dart'))
  w('pubspec.lock', lockOf({ google_mobile_ads: '9.1.0', webview_flutter_wkwebview: '3.27.1' }))
  w('ios/Runner/Info.plist', r_('ios/Runner/Info.plist').replace(/\t<key>NSUserTrackingUsageDescription<\/key>\n\t<string>[^<]*<\/string>\n/, ''))
  w('lib/ui/crash.dart', "void setUp() {\n  FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;\n}\n")
  w('lib/ui/old_ads.dart', "final rc = FirebaseRemoteConfig.instance;\nFuture<void> other() => RemoteConfigLoader.load('other_v1');\n")
  w('lib/main.dart', "import 'package:flutter/material.dart';\n\nFuture<void> main() async {\n  if (!await checkConnectivity()) return;\n  await FacebookInit.init();\n  await RemoteConfigLoader.load('my_app_v1');\n  await SplashAds.run(isFirstTime: false);\n  SplashAds.afterSplash();\n  runApp(const MaterialApp(home: Text('home')));\n}\n")
  w('lib/ui/form.dart', "Widget form() => Scaffold(body: TextField(), bottomNavigationBar: const BannerAdWidget());\n")
  w('lib/ui/share.dart', "final g = 'assets/*';\nvoid share() {\n  Share.share('hi');\n}\n/* x */\n")
  w('lib/domain/rule.dart', '/*\nint rule() => 1;\n*/\n')
  w('lib/ui/premium.dart', "void initState() {\n  AppResumeAdListener.block();\n}\nbool premium(info) => info.activeSubscriptions.toString().contains('week');\n")
  const x = changes(root, base)
  assert.match(x, /- Checks: 0 passed, 19 failed \(I1, I2, I3, I4, I5, P1, P2, P3, P4, P5, P6, P7, P9, P10, P11, P12, P13, P14, P15\)\n/)
  for (const ev of [
    /\*\*FAIL\*\* I1 .*\n  - `functions\/index\.js` added\n/,
    /\*\*FAIL\*\* I2 .*\n  - `test\/app_test\.dart` changed\n/,
    /\*\*FAIL\*\* I3 .*\n  - test\/app_test\.dart: home opens — fails now\n/,
    /\*\*FAIL\*\* I4 [\s\S]*?  - `lib\/data\/picker\.dart` lost `class Picker \{`\n  - `lib\/data\/picker\.dart` gained `import '\.\.\/google_ads_material\/interstitial_ad_manager\.dart';`\n  - `lib\/data\/picker\.dart` gained `class Picker2 \{`\n/,
    /\*\*FAIL\*\* I5 .*\n  - lost `cupertino_icons: \^1\.0\.8`\n/,
    /  - `lib\/google_ads_material\/app_hud\.dart` missing\n/,
    /  - `assets\/remote_config_default\.json` "splash_ad_wait_seconds": "3", the template has "8"\n/,
    /  - `lib\/google_ads_material\/ads_id\.dart` lost `.*useTestIds.*`\n/,
    /  - `lib\/google_ads_material\/banner_ad_widget\.dart` differs from the template\n/,
    /\*\*FAIL\*\* P2 .*\n  - RemoteConfigLoader\.load\('my_app_v1'\): lib\/main\.dart:6\n  - FacebookInit\.init\(\): lib\/main\.dart:5\n/,
    /\*\*FAIL\*\* P10 .*\n  - lib\/ui\/crash\.dart has no PlatformDispatcher\.instance\.onError\n  - lib\/ui\/crash\.dart sets the handlers without checking RemoteConfigState\.firebaseReady\n/,
    /\*\*FAIL\*\* P11 .*\n  - RemoteConfigLoader\.load keys: '(my_app_v1', 'other_v1|other_v1', 'my_app_v1)' \(expected only 'my_app_v1'\)\n  - lib\/ui\/old_ads\.dart:1 `final rc = FirebaseRemoteConfig\.instance;`\n/,
    /\*\*FAIL\*\* P12 .*\n  - lib\/main\.dart:4 `if \(!await checkConnectivity\(\)\) return;` comes before the startup at line 6\n/,
    /\*\*FAIL\*\* P13 .*\n  - lib\/ui\/premium\.dart:4 `bool premium\(info\) => info\.activeSubscriptions\.toString\(\)\.contains\('week'\);`\n/,
    /\*\*FAIL\*\* P14 .*\n  - google_mobile_ads 9\.1\.0 \(tested: 9\.2\.0\)\n  - webview_flutter_wkwebview 3\.27\.1 \(tested: 3\.27\.2, flutter-ads section 1\)\n/,
    /\*\*FAIL\*\* P15 .*\n  - Info\.plist has no NSUserTrackingUsageDescription\n/,
    /\*\*FAIL\*\* P3 .*\n  - not found in the app's own lib\/\n/,
    /\*\*FAIL\*\* P6 .*\n  - lib\/ui\/share\.dart:3 `Share\.share` has no skipNextResume\(\) before it\n/,
    /  - `lib\/domain\/rule\.dart` lost `int rule\(\) => 1;`\n/,
    /  - lost `webview_flutter_wkwebview: \^3\.20\.0 # the app's own`\n/,
    /\*\*FAIL\*\* P7 .*\n  - lib\/ui\/form\.dart has BannerAdWidget and a text field\n/,
    /\*\*FAIL\*\* P9 .*\n  - lib\/ui\/premium\.dart calls block\(\) but never unblock\(\)\n/,
  ]) assert.match(x, ev)
  fs.rmSync(root, { recursive: true, force: true })
  return 'changes selftest ok'
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-install-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  fixture(w)
  const r = (f) => read(path.join(root, f))

  const first = install(root)
  assert.deepEqual(first.todo, [])
  const ads = walk(path.join(TEMPLATE, 'lib/google_ads_material'))
  assert.ok(ads.length >= 15 && ads.every((f) => fs.existsSync(path.join(root, 'lib/google_ads_material', f))), 'every template Dart file copied')
  assert.match(r('test/google_ads_material/ads_rules_test.dart'), /package:my_app\/google_ads_material\/ads_id\.dart/)
  assert.doesNotMatch(r('integration_test/ads_device_test.dart'), /common_flow_demo/)
  assert.match(r('android/app/src/main/kotlin/com/acme/my_app/SmallNativeAdFactory.kt'), /^package com\.acme\.my_app$/m)
  assert.match(r('android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt'), /^package com\.acme\.my_app$[\s\S]*registerNativeAdFactory\(\s*flutterEngine, "smallNative"/m)
  assert.ok(fs.existsSync(path.join(root, 'android/app/src/main/res/layout/native_small.xml')))
  assert.match(r('android/app/src/main/AndroidManifest.xml'), /permission\.INTERNET[\s\S]*gms\.permission\.AD_ID[\s\S]*ads\.APPLICATION_ID" android:value="ca-app-pub-3940256099942544~3347511713"[\s\S]*<\/application>/)
  assert.match(r('android/app/src/main/res/values/strings.xml'), /facebook_client_token_placeholder/)
  assert.match(r('android/app/build.gradle.kts'), /dependencies \{\n    implementation\("com\.facebook\.android:facebook-core:18\.0\.0"\)/)
  assert.match(r('ios/Runner/AppDelegate.swift'), /registerNativeAdFactory\([\s\S]*factoryId: "smallNative"[\s\S]*class SmallNativeAdFactory/)
  assert.match(r('ios/Runner/Info.plist'), /<key>GADApplicationIdentifier<\/key>\n\t<string>ca-app-pub-3940256099942544~1458002511<\/string>\n\t<key>NSUserTrackingUsageDescription<\/key>\n\t<string>This identifier will be used to deliver personalized ads to you\.<\/string>\n<\/dict>/)
  assert.equal(r('ios/Runner.xcodeproj/project.pbxproj'), 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;\nIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n')
  const pub = r('pubspec.yaml')
  for (const [n] of DEPS) assert.match(pub, new RegExp(`^  ${n}: .+ # `, 'm'), `${n} with its reason`)
  for (const [n, v] of DEPS) assert.match(pub, new RegExp(`^  ${n}: ${v.replaceAll('.', '\\.')} # `, 'm'), `${n} pinned to the tested ${v}`)
  assert.match(pub, /^dev_dependencies:\n  integration_test: .*\n    sdk: flutter\n/m)
  assert.match(pub, /^dependency_overrides:\n  # .*\n  webview_flutter_wkwebview: 3\.27\.2\n/m)
  assert.doesNotMatch(pub.split('dependency_overrides:')[0], /webview_flutter_wkwebview/, 'not a dependency: deps would call it unused')
  assert.match(pub, /^flutter:\n  assets:\n    - assets\/remote_config_default\.json\n  uses-material-design: true/m)
  assert.deepEqual(Object.keys(JSON.parse(r('assets/remote_config_default.json'))).filter((k) => /credit|quick_edit/.test(k)), [], 'no demo-only keys')
  const prem = walk(path.join(TEMPLATE, 'lib/premium_core'))
  assert.ok(prem.length === 3 && prem.every((f) => fs.existsSync(path.join(root, 'lib/premium_core', f))), 'the Premium layer is installed by default')
  assert.match(r('test/premium_core/premium_rules_test.dart'), /package:my_app\/premium_core\/free_use_gate\.dart/)

  // second run: nothing added twice, nothing overwritten
  const snapshot = walk(root).map((f) => [f, r(f)])
  const second = install(root)
  assert.ok(second.done.every((l) => l.startsWith('kept ')), second.done.join('\n'))
  assert.deepEqual(walk(root).map((f) => [f, r(f)]), snapshot)

  // an app whose native files were already changed: nothing guessed, exact steps returned
  fs.writeFileSync(path.join(root, 'android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt'), 'package com.acme.my_app\n\nclass MainActivity : FlutterFragmentActivity() { /* own code */ }\n')
  fs.writeFileSync(path.join(root, 'ios/Runner/AppDelegate.swift'), 'import Flutter\n// own code\n')
  const third = install(root)
  assert.equal(third.todo.length, 2)
  assert.match(third.todo[0], /MainActivity\.kt is not Flutter's default/)
  assert.match(third.todo[1], /AppDelegate\.swift is not Flutter's default/)
  fs.rmSync(root, { recursive: true, force: true })

  // pubspec shapes the installer has to change: packages at other versions (own comment kept), an older override among
  // others, the app's own webview dependency without an override, a package from git
  const shape = (edit) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-install-')), f = path.join(d, 'pubspec.yaml')
    fixture((g, t) => { fs.mkdirSync(path.dirname(path.join(d, g)), { recursive: true }); fs.writeFileSync(path.join(d, g), t) })
    fs.writeFileSync(f, edit(read(f))); const { todo } = install(d); const out = read(f); fs.rmSync(d, { recursive: true, force: true }); return { todo, out }
  }
  let o = shape((t) => t.replace('  cupertino_icons: ^1.0.8\n', '  cupertino_icons: ^1.0.8\n  google_mobile_ads: ^9.1.0 # mine\n  shared_preferences: ^2.5.5\n')
    + 'dependency_overrides:\n  foo: 1.0.0\n  # iOS (Swift Package Manager): google_mobile_ads 9.1.0 declares iOS 13, webview_flutter_wkwebview 3.27.1+ iOS 15.\n  webview_flutter_wkwebview: ">=3.23.0 <3.27.1"\n')
  assert.deepEqual(o.todo, [])
  assert.match(o.out, /^  google_mobile_ads: 9\.2\.0 # mine$/m)
  assert.match(o.out, /^  shared_preferences: 2\.5\.6 # /m)
  for (const [n] of DEPS) assert.equal(o.out.match(new RegExp(`^  ${n}:`, 'gm')).length, 1, `${n} once`)
  assert.ok(o.out.endsWith(`${PIN}  foo: 1.0.0\n`), 'old override replaced, the app\'s other override kept')
  assert.equal(o.out.match(/^dependency_overrides:/gm).length, 1)
  o = shape((t) => t.replace('  cupertino_icons: ^1.0.8\n', '  cupertino_icons: ^1.0.8\n  webview_flutter_wkwebview: ^3.20.0\n'))
  assert.match(o.out, /^  webview_flutter_wkwebview: \^3\.20\.0$/m, 'the app\'s own dependency kept')
  assert.ok(o.out.endsWith(`\n\n${PIN}`), 'and the override added')
  o = shape((t) => t.replace('  cupertino_icons: ^1.0.8\n', '  cupertino_icons: ^1.0.8\n  shimmer:\n    git: https://example.com/shimmer.git\n'))
  assert.deepEqual(o.todo, ['pubspec.yaml: shimmer is not from pub.dev (git/path): the pattern was tested with 4.0.0; set it, or keep it and say so'])
  assert.match(o.out, /^  shimmer:\n    git: https:\/\/example\.com\/shimmer\.git\n/m)

  // an app with no paid tier: no Premium layer, no purchase or preferences package, and changes() does not miss them
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-install-'))
  fixture((f, s) => { fs.mkdirSync(path.dirname(path.join(bare, f)), { recursive: true }); fs.writeFileSync(path.join(bare, f), s) })
  const plist = path.join(bare, 'ios/Runner/Info.plist')
  fs.writeFileSync(plist, read(plist).replaceAll('\n', '\r\n').replace('\r\n', '\n')) // CRLF, its first line LF
  assert.deepEqual(install(bare, { premium: false }).todo, [])
  assert.match(read(plist), /<key>NSUserTrackingUsageDescription<\/key>\r\n\t<string>/, 'CRLF Info.plist patched')
  assert.equal(read(plist).match(/[^\r]\n/g).length, 1, 'every untouched line keeps its ending')
  assert.ok(!read(plist).split('\n')[0].endsWith('\r'), 'the LF line is still LF')
  assert.ok(!fs.existsSync(path.join(bare, 'lib/premium_core')) && !fs.existsSync(path.join(bare, 'test/premium_core')))
  assert.doesNotMatch(read(path.join(bare, 'pubspec.yaml')), /^  (purchases_flutter|shared_preferences):/m)
  assert.ok(![...templateFiles(bare).keys()].some((f) => f.includes('premium_core')), 'P1 does not expect the Premium files')
  fs.rmSync(bare, { recursive: true, force: true })
  return 'selftest ok'
}

const argv = process.argv.slice(2)
if (argv[0] === 'selftest') console.log(`${selftest()}\n${changesSelftest()}\n${demoSelftest()}`)
else if (argv[0] === 'changes' && (argv.length === 3 || argv.length === 4)) {
  const out = path.resolve(argv[3] || path.join(argv[1], REPORT))
  const r = changes(path.resolve(argv[1]), argv[2])
  fs.writeFileSync(out, r)
  console.log(`${out}\n${r.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- `')).slice(0, 6).join('\n')}`)
  const fails = r.split('\n').filter((l) => l.startsWith('- **FAIL**'))
  if (fails.length) { console.error(`\n${fails.join('\n')}\n(evidence under each in ${REPORT})`); process.exit(1) }
} else if ((argv.length === 1 || (argv.length === 2 && argv[1] === '--no-premium')) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { done, todo } = install(path.resolve(argv[0]), { premium: argv[1] !== '--no-premium' })
  console.log(done.join('\n'))
  if (todo.length) { console.error(`\nNOT DONE — add these, then run again:\n- ${todo.join('\n- ')}`); process.exit(1) }
  console.log('\nads pattern installed. Next: flutter pub get; wire it as skills/flutter-ads/SKILL.md section 3 says.')
} else if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { console.error('usage: ads-install.mjs <project> [--no-premium] | changes <project> <base commit> [<out file>] | selftest'); process.exit(2) }
