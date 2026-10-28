#!/usr/bin/env node
// Installs the ads + Remote Config pattern (skills/flutter-ads/SKILL.md) into a Flutter app — the only way
// app-factory adds ads. The pattern is IPTV_two's ads implementation (/Users/mach/testing/IPTV_two lib/ads/, its
// MainActivity.kt / NativeAds.kt / native_admob_*.xml, config.json), as the guide app common_flow_demo runs it. Copies
// templates/flutter/ads/ (= the guide app's files) and patches the native project; never overwrites a file that exists
// (a second run reports "kept").
//   node ads-install.mjs <project> [--no-premium]
//                                     → what it added/patched; exit 1 with the exact lines when a native file is not
//                                       Flutter's default and has no ad factory yet (the caller adds them, then reruns).
//                                       Also lib/premium_core/ (RevenueCat Premium, free uses per feature, paywall plan
//                                       switches) and its packages; --no-premium when CONTRACT.md says the app has no paid tier
//   node ads-install.mjs changes <project> <base>  → writes <project>/ADS_CHANGES.md: every file the ads work added,
//                                       changed or deleted since <base>, from git (see changes())
//   node ads-install.mjs verify <project> <base>   → skills/ads-implementation steps 8.1, 8.2, 8.4 and 9 in one call: each
//                                       step's result line, on a failure the lines that say why; exit 1 when one fails
//   … changes|verify … --replaced <file,file,…>  → the app's own ads layer that the wiring removed or rewrote (step 2a);
//                                       each is proved from <base> and left out of I1–I4, and listed in the report
//   node ads-install.mjs reset <project>  → start the ads work again from nothing (skills/ads-implementation step 1): every
//                                       `app-factory: ads…` commit reverted (newest first), then any template file still in
//                                       the app removed in one commit; prints the new HEAD = <base> of the fresh run.
//                                       Exit 1: uncommitted changes, or a revert that conflicts (aborted, files listed)
//   node ads-install.mjs selftest
// Template identifiers replaced: `package:common_flow_demo/` → `package:<pubspec name>/`,
// `package com.demo.common_flow_demo` → the package of the app's MainActivity.kt, the Remote Config parameter
// `"common_flow_demo_v1"` (AdsSplashUtils.remoteConfigKey) → `"<pubspec name>_v1"`.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const KOTLIN = '2.4.0' // the guide app's org.jetbrains.kotlin.android (android/settings.gradle.kts)
const olderThan = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false }
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'flutter', 'ads')
// Google's sample App IDs (developers.google.com/admob/{android,ios}/quick-start): debug builds work; the owner replaces them
const SAMPLE_APP_ID = { android: 'ca-app-pub-3940256099942544~3347511713', ios: 'ca-app-pub-3940256099942544~1458002511' }
// The exact versions the pattern was tested with = common_flow_demo's pubspec.lock (demoSelftest keeps them equal). Not
// ^ranges: a range resolves the newest release, which nobody has tested with this pattern yet. 2026-10-23: moved to
// google_mobile_ads 9.2.0 (Mobile Ads SDK Android 25.5.0, iOS 13.11; UMP Android 4.0.0, as 9.1.0) after the guide app and a
// fresh app passed their device tests on it, Android emulator and iOS simulator.
const DEPS = [
  ['google_mobile_ads', '9.2.0', 'ads (lib/ads/)'],
  ['firebase_core', '5.0.0', 'Remote Config (lib/ads/ads_splash_utils.dart)'],
  ['firebase_remote_config', '7.0.0', 'ads/flow values from one JSON key (AdsSplashUtils.remoteConfigKey)'],
  ['firebase_analytics', '13.0.0', 'ad revenue event (AdsLoadUtil.sendRevenueToAnalytics)'],
  ['firebase_crashlytics', '6.0.0', 'crash reports (AdsSplashUtils.getOnlineIds, as IPTV)'],
  ['shared_preferences', '2.5.6', 'Remote Config values kept for the next launch (AdsSplashUtils), free uses (premium_core/)'],
  ['app_tracking_transparency', '2.0.7', 'iOS tracking prompt before MobileAds (initializeWithOutGDPR)'],
  ['connectivity_plus', '7.3.2', 'online check before ads (lib/ads/app_connectivity.dart)'],
  ['fluttertoast', '10.0.2', '"Please Start Your Internet." (lib/ads/app_variable.dart)'],
  ['flutter_spinkit', '5.2.2', 'the "Loading..." dialog before an interstitial (lib/ads/loading_screen.dart)'],
  ['purchases_flutter', '10.16.0', 'Premium from the store\'s entitlement (premium_core/premium_store.dart)'],
]
// the Premium layer: installed unless --no-premium (an app with no paid tier); its packages only with it
const PREMIUM = 'premium_core/'
const PREMIUM_DEPS = new Set(['purchases_flutter'])
// Android: IPTV's native ad factories + layouts. NativeAds.kt goes next to MainActivity.kt; res/ → android/app/src/main/res/
const KOTLIN_FILES = ['NativeAds.kt']
const RES = 'android/app/src/main/res'
const resFiles = () => walk(path.join(TEMPLATE, 'android/res'))
// IPTV_two android/app/build.gradle.kts:63-64. facebook-android-sdk: IPTV's `latest.release` resolved to 19.0.0
// (2026-10-28), pinned; it also brings AppCompat + CardView, which native_admob_*.xml use (without them: "attribute
// cardCornerRadius not found"). sdp-android: the layouts' @dimen/_8sdp sizes.
const GRADLE_DEPS = [['com.facebook.android:facebook-android-sdk', '19.0.0', 'Facebook init (MainActivity "setToast"); AppCompat + CardView for native_admob_*.xml'],
  ['com.intuit.sdp:sdp-android', '1.0.6', 'native_admob_*.xml sizes (@dimen/_8sdp …)']]
// IPTV_two proguard-rules.pro: without `-keep class androidx.work.**` R8 strips WorkManager's Room database (pulled in by
// facebook-android-sdk) and the release build crashes at launch: "Failed to create an instance of androidx.work.impl.WorkDatabase"
const PROGUARD = 'android/app/proguard-rules.pro'
const PROGUARD_KEEP = '-keep class androidx.work.** { *; }'
// Files earlier app-factory versions installed (the google_ads_material layer): `reset` removes them too
const LEGACY = ['lib/google_ads_material/', 'test/google_ads_material/', 'assets/remote_config_default.json',
  `${RES}/layout/native_small.xml`, `${RES}/layout/native_big.xml`]
const LEGACY_KOTLIN = ['NativeAdStyle.kt', 'LayoutNativeAdFactory.kt']
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
    .replaceAll('"common_flow_demo_v1"', `"${name}_v1"`)
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
  patch('pubspec.yaml', (s) => /^\s+- assets\/ads\/config\.json/m.test(s),
    (s) => /^  assets:\n/m.test(s) ? s.replace(/^  assets:\n/m, (m) => `${m}    - assets/ads/config.json\n`)
      : s.replace(/^flutter:\n/m, (m) => `${m}  assets:\n    - assets/ads/config.json\n`),
    'add assets/ads/config.json')

  // Android: IPTV's native factories (NativeAds.kt), layouts, fonts, rating style; MainActivity; Facebook; App ID; R8 rules
  const kdir = path.dirname(mainPath)
  for (const f of KOTLIN_FILES) put(path.join(kdir, f), fix(read(path.join(TEMPLATE, 'android', f))))
  for (const f of resFiles()) put(at(RES, f), fs.readFileSync(path.join(TEMPLATE, 'android/res', f))) // fonts are binary
  const mainText = read(mainPath)
  if (!/registerNativeAdFactory/.test(mainText)) {
    if (/^package [\w.]+\s+import io\.flutter\.embedding\.android\.FlutterActivity\s+class MainActivity\s*:\s*FlutterActivity\(\)\s*$/.test(mainText.trim())) {
      fs.writeFileSync(mainPath, fix(read(path.join(TEMPLATE, 'android/MainActivity.kt')))); done.push(`${path.relative(root, mainPath)}: IPTV's "nativeChannel" → "setToast" handler (native factories "smallNativeAds" + "bigNativeAds" + "fullNativeAds", Facebook)`)
    } else todo.push(`${path.relative(root, mainPath)} is not Flutter's default: add from templates/flutter/ads/android/MainActivity.kt its configureFlutterEngine "nativeChannel" handler (on "setToast" it registers "smallNativeAds" / "bigNativeAds" / "fullNativeAds" with NativeAds.kt's factories and starts Facebook) and cleanUpFlutterEngine's three unregisterNativeAdFactory lines`)
  }
  put(at(PROGUARD), read(path.join(TEMPLATE, 'android/proguard-rules.pro')))
  patch(PROGUARD, (s) => s.includes(PROGUARD_KEEP),
    (s) => `${s.trimEnd()}\n\n# IPTV_two proguard-rules.pro (app-factory ads): WorkManager / Room, Facebook, Play services\n${read(path.join(TEMPLATE, 'android/proguard-rules.pro'))}`,
    'IPTV\'s keep rules (release crashed at launch without them)')
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
  // an older install's facebook-core line is replaced (it lacks the AppCompat + CardView the layouts need)
  const gradleDep = ([n, v]) => `implementation("${n}:${v}")`
  patch(gradle, (s) => GRADLE_DEPS.every((d) => s.includes(gradleDep(d))), (s) => {
    const t = s.replace(/^[ \t]*implementation\("com\.facebook\.android:facebook-(core|android-sdk):[^"]*"\).*\n/gm, '')
      .replace(/^[ \t]*implementation\("com\.intuit\.sdp:sdp-android:[^"]*"\).*\n/gm, '')
    const lines = GRADLE_DEPS.map(([n, v, why]) => `    ${gradleDep([n, v])} // ${why}\n`).join('')
    return /^dependencies \{\n/m.test(t) ? t.replace(/^dependencies \{\n/m, (m) => m + lines) : `${t.trimEnd()}\n\ndependencies {\n${lines}}\n`
  }, `${GRADLE_DEPS.map(([n, v]) => `${n}:${v}`).join(' + ')} (IPTV's)`)
  // release: IPTV's R8 setup (build.gradle.kts:41-45) so proguard-rules.pro is used
  const RELEASE = /^([ \t]*)(?:release|getByName\("release"\))\s*\{[ \t]*\n/m
  if (!RELEASE.test(read(at(gradle)).replaceAll('\r\n', '\n'))) todo.push(`${gradle} has no buildTypes { release { … } }: add one with isMinifyEnabled = true and proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") (IPTV_two build.gradle.kts:41-45)`)
  else patch(gradle, (s) => /proguardFiles\([\s\S]*?"proguard-rules\.pro"/.test(s),
    (s) => s.replace(RELEASE, (m, ind) => `${m}${ind}    // IPTV_two build.gradle.kts:41-45: proguard-rules.pro keeps WorkManager's Room database (facebook-android-sdk)\n${ind}    isMinifyEnabled = true\n${ind}    proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")\n`),
    'release: isMinifyEnabled + proguard-rules.pro (IPTV\'s)')
  patch(gradle, (s) => !/minSdk\s*=\s*(\d+)/.test(s) || +s.match(/minSdk\s*=\s*(\d+)/)[1] >= 24,
    (s) => s.replace(/minSdk\s*=\s*\d+/, 'minSdk = 24 // google_mobile_ads'), 'minSdk 24')
  // firebase_analytics 13 brings play-services-measurement 24.0.0, built with Kotlin 2.4 metadata: an app on the Kotlin
  // Gradle plugin 2.2.20 failed "binary version of its metadata is 2.4.0, expected version is 2.2.0" (Live Street View,
  // 2026-10-27). The guide app builds with 2.4.0; an older plugin is raised to it, a newer one is kept.
  const settingsGradle = 'android/settings.gradle.kts'
  const kotlinAt = (s) => (s.match(/id\("org\.jetbrains\.kotlin\.android"\)\s+version\s+"([\d.]+)"/) || [])[1]
  if (fs.existsSync(at(settingsGradle))) patch(settingsGradle, (s) => !kotlinAt(s) || !olderThan(kotlinAt(s), KOTLIN),
    (s) => s.replace(/(id\("org\.jetbrains\.kotlin\.android"\)\s+version\s+")[\d.]+("[^\n]*)/, `$1${KOTLIN}$2 // firebase_analytics 13 (play-services-measurement 24)`),
    `Kotlin Gradle plugin ${KOTLIN} (firebase_analytics 13 needs it)`)
  // Kotlin 2.4 rejects `kotlinOptions { jvmTarget = "…" }` ("Using 'jvmTarget: String' is an error. Please migrate to the
  // compilerOptions DSL"): moved to the guide app's `kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_n } }`, same JVM
  const KOTLIN_OPTIONS = /\n[ \t]*kotlinOptions\s*\{\s*\n\s*jvmTarget\s*=\s*(?:JavaVersion\.VERSION_([\d_]+)\.toString\(\)|"([\d.]+)")\s*\n\s*\}[ \t]*\n/
  patch(gradle, (s) => !KOTLIN_OPTIONS.test(s), (s) => {
    const m = s.match(KOTLIN_OPTIONS), jvm = m[1] || m[2].replaceAll('.', '_')
    return `${s.replace(KOTLIN_OPTIONS, '\n').trimEnd()}\n\nkotlin {\n    compilerOptions {\n        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_${jvm}\n    }\n}\n`
  }, 'kotlinOptions → compilerOptions (Kotlin 2.4)')

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
  if (!/TemplateNativeAdFactory/.test(delText)) {
    if (delText.trim() === flutterDefault) { fs.writeFileSync(at(del), read(path.join(TEMPLATE, 'ios/AppDelegate.swift'))); done.push(`${del}: native factories "smallNativeAds" + "bigNativeAds" + "fullNativeAds" and the "nativeChannel" colours (TemplateNativeAdFactory + NativeAdStyle; app-factory's addition, IPTV has none on iOS)`) }
    else todo.push(`${del} is not Flutter's default: add from templates/flutter/ads/ios/AppDelegate.swift the imports (GoogleMobileAds, google_mobile_ads), the lines after GeneratedPluginRegistrant (the registerNativeAdFactory loop for "smallNativeAds" / "bigNativeAds" / "fullNativeAds" and the "nativeChannel" handler), and everything below "// MARK: - Native ads"`)
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
  if (mainPath) for (const f of KOTLIN_FILES)
    m.set(path.relative(root, path.join(path.dirname(mainPath), f)), fix(read(path.join(TEMPLATE, 'android', f))))
  for (const f of resFiles()) m.set(`${RES}/${f}`, read(path.join(TEMPLATE, 'android/res', f)))
  return m
}

// Start again from nothing, with git only (history kept, nothing guessed): the plugin's own ads commits — subject starting
// "app-factory: ads", what ads-implementation step 9 commits — are reverted newest first (one already reverted is skipped).
// A template file still there afterwards came from somewhere else (installed by hand, an older run committed under
// another message): `git rm` in one commit, so the next install copies every file fresh instead of keeping a stale one.
// The app's own ads layer that an ads commit had replaced comes back with the revert: step 2a lists it again.
const ID = ['-c', 'user.name=app-factory', '-c', 'user.email=app-factory@local']
export function reset(root) {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] })
  if (git('status', '--porcelain').trim()) return { ok: false, text: 'uncommitted changes — commit or stash them first, so the reset is commits you can undo' }
  const log = git('log', '--format=%H%x00%s%x00%b%x1e').split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => r.split('\0'))
  const undone = new Set(log.flatMap(([, , b]) => [...(b || '').matchAll(/This reverts commit ([0-9a-f]{40})/g)].map((m) => m[1])))
  const ours = log.filter(([h, subj]) => subj.startsWith('app-factory: ads') && !undone.has(h))
  const out = []
  for (const [h, subj] of ours) {
    try { git(...ID, 'revert', '--no-edit', h) } catch {
      const files = git('diff', '--name-only', '--diff-filter=U').trim().split('\n').filter(Boolean)
      git('revert', '--abort')
      return { ok: false, text: [...out, `CONFLICT reverting ${h.slice(0, 7)} "${subj}" in: ${files.join(', ')} — aborted, that commit is untouched; the commits after it changed the same lines: revert it by hand (git revert ${h.slice(0, 7)}), then run reset again`].join('\n') }
    }
    out.push(`reverted ${h.slice(0, 7)} "${subj}"`)
  }
  // the template's files and what earlier app-factory versions installed (LEGACY: the google_ads_material layer)
  const tpl = new Set([...['lib', 'test', 'integration_test', 'assets'].flatMap((d) => walk(path.join(TEMPLATE, d)).map((f) => `${d}/${f}`)),
    ...resFiles().map((f) => `${RES}/${f}`),
    ...LEGACY.flatMap((p) => p.endsWith('/') ? (fs.existsSync(path.join(root, p)) ? walk(path.join(root, p)).map((f) => p + f) : []) : [p])])
  const { mainPath } = ids(root)
  if (mainPath) for (const f of [...KOTLIN_FILES, ...LEGACY_KOTLIN]) tpl.add(path.relative(root, path.join(path.dirname(mainPath), f)))
  const left = [...tpl].filter((f) => fs.existsSync(path.join(root, f))).sort()
  if (left.length) {
    git('rm', '-q', '--', ...left)
    git(...ID, 'commit', '-q', '-m', 'app-factory: reset — template files not from an app-factory ads commit', '-m', left.join('\n'))
    out.push(`removed ${left.length} template file(s) not from an app-factory ads commit (one commit): ${left.join(', ')}`)
  }
  if (!out.length) out.push('nothing to reset: no app-factory ads commit and no template file in the app')
  out.push(`HEAD ${git('rev-parse', '--short', 'HEAD').trim()} — the <base> of the fresh run (step 1 again)`)
  return { ok: true, text: out.join('\n') }
}

function resetSelftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-reset-'))
  const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t) }
  const g = (...a) => execFileSync('git', ['-C', root, ...ID, ...a], { encoding: 'utf8' })
  fixture(w); w('lib/other.dart', 'const a = 1;\n')
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'base')
  install(root); w('lib/other.dart', 'const a = 1;\nconst ad = true;\n')
  g('add', '-A'); g('commit', '-q', '-m', 'app-factory: ads')
  w('lib/later.dart', 'const later = 2;\n'); g('add', '-A'); g('commit', '-q', '-m', 'the user\'s own work after the ads')
  w('lib/dirty.dart', 'x'); assert.match(reset(root).text, /uncommitted changes/); fs.rmSync(path.join(root, 'lib/dirty.dart'))
  const r = reset(root)
  assert.ok(r.ok, r.text); assert.match(r.text, /^reverted [0-9a-f]{7} "app-factory: ads"\nHEAD [0-9a-f]{7}/)
  assert.ok(!fs.existsSync(path.join(root, 'lib/ads')), 'installed files gone')
  assert.equal(read(path.join(root, 'lib/other.dart')), 'const a = 1;\n', 'the wiring in the app reverted')
  assert.equal(read(path.join(root, 'lib/later.dart')), 'const later = 2;\n', 'later work kept')
  assert.equal(g('status', '--porcelain'), '')
  assert.match(reset(root).text, /^nothing to reset/, 'a reverted ads commit is not reverted twice')
  // template files committed under another message → removed in one commit, so the next install is fresh
  install(root); g('add', '-A'); g('commit', '-q', '-m', 'ads by hand')
  const left = reset(root)
  assert.match(left.text, /^removed \d+ template file\(s\) not from an app-factory ads commit/)
  assert.ok(!fs.existsSync(path.join(root, 'lib/ads/ads_variable.dart')))
  assert.ok(install(root).done.some((l) => l.startsWith('added lib/ads/ads_variable.dart')), 'install copies it fresh, not "kept"')
  g('add', '-A'); g('commit', '-q', '-m', 'app-factory: ads again')
  // a later commit on the same line → revert conflicts: aborted, tree clean, nothing guessed
  w('lib/ads/ads_variable.dart', 'changed later\n'); g('add', '-A'); g('commit', '-q', '-m', 'edit an installed file')
  w('lib/ads/ads_variable.dart', 'changed again\n'); g('add', '-A'); g('commit', '-q', '-m', 'app-factory: ads fix')
  w('lib/ads/ads_variable.dart', 'changed a third time\n'); g('add', '-A'); g('commit', '-q', '-m', 'the user edits it')
  const c = reset(root)
  assert.ok(!c.ok); assert.match(c.text, /CONFLICT reverting [0-9a-f]{7} "app-factory: ads fix" in: lib\/ads\/ads_variable\.dart — aborted/)
  assert.equal(g('status', '--porcelain'), '', 'the aborted revert leaves the tree clean')
  // an app with an earlier app-factory version's layer (lib/google_ads_material/, its Kotlin factory, layouts, defaults
  // JSON) committed by hand: reset removes those too, so the IPTV layer is installed on a clean app
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-reset-legacy-'))
  const wo = (f, t) => { fs.mkdirSync(path.dirname(path.join(old, f)), { recursive: true }); fs.writeFileSync(path.join(old, f), t) }
  const go = (...a) => execFileSync('git', ['-C', old, ...ID, ...a], { encoding: 'utf8' })
  fixture(wo)
  for (const f of ['lib/google_ads_material/ads_id.dart', 'test/google_ads_material/ads_rules_test.dart', 'assets/remote_config_default.json',
    `${RES}/layout/native_small.xml`, 'android/app/src/main/kotlin/com/acme/my_app/LayoutNativeAdFactory.kt']) wo(f, 'old\n')
  go('init', '-q'); go('add', '-A'); go('commit', '-q', '-m', 'old ads layer')
  assert.match(reset(old).text, /^removed 5 template file\(s\) not from an app-factory ads commit \(one commit\): .*LayoutNativeAdFactory\.kt.*lib\/google_ads_material\/ads_id\.dart/)
  assert.ok(!fs.existsSync(path.join(old, 'lib/google_ads_material')) && !fs.existsSync(path.join(old, 'assets/remote_config_default.json')))
  fs.rmSync(old, { recursive: true, force: true })
  fs.rmSync(root, { recursive: true, force: true })
  return 'reset selftest ok'
}

const REPORT = 'ADS_CHANGES.md'
// `flutter test --file-reporter json:.dart_tool/<name>` before the ads work (step 1) and after it (step 8)
const TESTS_BEFORE = 'ads_tests_before.json', TESTS_AFTER = 'ads_tests_after.json'
// Files `flutter pub get` rewrites: counted, never printed.
const GENERATED = /(^|\/)(pubspec\.lock|Podfile\.lock|Package\.resolved|GeneratedPluginRegistrant\.\w+|generated_plugin(s|_registrant)?\.\w+)$/
const TEST_NAME = /\b(?:testWidgets|test|group|patrolTest)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g

// What implementing ads changed in the app, read from git and the files — nothing in it is written by hand: the app's
// working tree (committed or not, plus untracked files) against <base>, the commit before the ads work.
export function changes(root, base, replaced = []) {
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

  // the ads layer's public names, from the template itself: its classes and top-level functions (onTapInter, setupFbAdsId …)
  const api = [...new Set([...tpl].filter(([f]) => /^lib\/(ads|premium_core)\//.test(f))
    .flatMap(([, s]) => [...s.matchAll(/^(?:(?:abstract )?(?:class|enum|mixin) ([A-Z]\w*)|(?:Future<[^\n(]*>|void|bool|String) ([a-z]\w*)\()/gm)].map((m) => m[1] || m[2])))]
  const uses = []
  const src = new Map() // the app's own lib/**/*.dart (not the template) → its lines
  const lib = path.join(root, 'lib')
  if (fs.existsSync(lib)) for (const f of walk(lib).filter((f) => f.endsWith('.dart') && !/^(ads|premium_core)\//.test(f)).sort()) {
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
  const patched = new Set(['pubspec.yaml', 'android/settings.gradle.kts', 'android/app/src/main/AndroidManifest.xml', 'android/app/build.gradle.kts', 'android/app/src/main/res/values/strings.xml', PROGUARD,
    'ios/Runner/AppDelegate.swift', 'ios/Runner/Info.plist', 'ios/Runner.xcodeproj/project.pbxproj', mainPath && path.relative(root, mainPath)])
  const word = { A: 'added', M: 'changed', D: 'deleted' }

  // --replaced: the app's own ads layer, removed or rewritten on purpose (skills/ads-implementation step 2a). Each path
  // is proved from <base>: it imports an ads SDK or another replaced file, or (lib/) only replaced files import it.
  // Proved files are left out of I1, I2 and I4, and their tests out of I3's "no longer runs"; the report lists them.
  const SDK = /^import\s+['"]package:(google_mobile_ads|applovin_max|unity_ads_plugin|facebook_audience_network|easy_audience_network|ironsource_mediation)\//m
  const atBase = (f) => { try { return git('show', `${base}:${f}`) } catch { return null } }
  const baseLib = replaced.length ? git('ls-tree', '-r', '--name-only', base, '--', 'lib').split('\n').filter((f) => f.endsWith('.dart')) : []
  const imports = (from, s, to) => [...s.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].some(([, i]) => i.startsWith('package:')
    ? i === `package:${name}/${to.replace(/^lib\//, '')}` : path.posix.normalize(path.posix.join(path.posix.dirname(from), i)) === to)
  const why = new Map(), badReplaced = []
  for (const f of new Set(replaced)) {
    const s = atBase(f), others = replaced.filter((o) => o !== f)
    if (s === null) { badReplaced.push(`--replaced \`${f}\` is not in ${base}`); continue }
    const dep = others.find((o) => imports(f, s, o))
    const users = /^lib\//.test(f) ? baseLib.filter((u) => u !== f && imports(u, atBase(u), f)) : []
    if (SDK.test(s)) why.set(f, 'imports an ads SDK')
    else if (dep) why.set(f, `imports \`${dep}\``)
    else if (users.length && users.every((u) => replaced.includes(u))) why.set(f, `only ${users.map((u) => `\`${u}\``).join(', ')} import it`)
    else badReplaced.push(`--replaced \`${f}\` imports no ads SDK and no replaced file${users.length ? `, and is also imported by ${users.filter((u) => !replaced.includes(u)).map((u) => `\`${u}\``).join(', ')}` : ''}`)
  }
  const kept = own.filter(([f]) => !why.has(f))

  check('I1', 'Only files the ads work owns were touched: the template\'s, the native files and pubspec the installer patches, lib/, test/, integration_test/, CONTRACT.md',
    [...badReplaced, ...kept.filter(([f]) => !patched.has(f) && !/^(lib|test|integration_test)\//.test(f) && f !== 'CONTRACT.md').map(([f, x]) => `\`${f}\` ${word[x.status] || x.status}`)])
  check('I2', 'No test that existed before was changed or deleted',
    kept.filter(([f, x]) => /^(test|integration_test)\//.test(f) && x.status !== 'A').map(([f, x]) => `\`${f}\` ${word[x.status] || x.status}`))
  const inApp = (p) => { // a path from a test report, relative to the app — also when the report was recorded in another folder
    const r = path.relative(root, p); if (!r.startsWith('..')) return r
    const parts = p.split(path.sep)
    for (let i = 1; i < parts.length; i++) if (fs.existsSync(path.join(root, ...parts.slice(i)))) return parts.slice(i).join('/')
    return r
  }
  const run = (name) => {
    const p = path.join(root, '.dart_tool', name); if (!fs.existsSync(p)) return null
    const suite = {}, test = {}, passed = new Set(), all = new Set()
    for (const l of read(p).split('\n').filter((l) => l.trim())) {
      const e = JSON.parse(l)
      if (e.type === 'suite') suite[e.suite.id] = inApp(e.suite.path || '')
      else if (e.type === 'testStart') test[e.test.id] = `${suite[e.test.suiteID]}: ${e.test.name}`
      else if (e.type === 'testDone' && !e.hidden) { all.add(test[e.testID]); if (e.result === 'success' && !e.skipped) passed.add(test[e.testID]) }
    }
    return { passed, all }
  }
  const before = run(TESTS_BEFORE), after = run(TESTS_AFTER)
  check('I3', `Every test that passed before the ads work passes now${before && after ? ` (${before.passed.size} passed before; ${after.passed.size} of ${after.all.size} pass now)` : ''}`,
    !before || !after ? [`\`.dart_tool/${!before ? TESTS_BEFORE : TESTS_AFTER}\` is missing: run the suite with \`--file-reporter json:.dart_tool/${!before ? TESTS_BEFORE : TESTS_AFTER}\``]
      : [...before.passed].filter((t) => !after.passed.has(t) && (after.all.has(t) || !why.has(t.split(': ')[0]))).map((t) => `${t} — ${after.all.has(t) ? 'fails now' : 'no longer runs'}`),
    before && before.all.size > before.passed.size ? [`${before.all.size - before.passed.size} failed or were skipped already before the ads work`] : [])
  const ALLOW_IMPORT = /^import\s+['"][^'"]*ads\/ads_variable\.dart['"]\s*;/
  // the diff with /* … */ blanked on both sides: commented-out code is neither gained nor lost, code put inside /* */ is lost
  const liveDiff = (f, x) => {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-live-')), a = path.join(t, 'before'), b = path.join(t, 'now')
    fs.writeFileSync(a, x.status === 'A' ? '' : blankBlockComments(git('show', `${base}:${f}`)))
    fs.writeFileSync(b, blankBlockComments(read(path.join(root, f))))
    // -w: a line only re-indented (moved into a block) is neither lost nor gained
    let d = ''; try { git('diff', '--no-index', '-w', a, b) } catch (e) { d = e.stdout }
    fs.rmSync(t, { recursive: true, force: true })
    return d.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).join('\n')
  }
  // what a purchase does to the ads in IPTV (AdsUtils/dialog.dart:84-85, ads_splash_utils.dart:326-329)
  const ALLOW_CALL = /^(AdsVariable\.isPurchase\.value\s*=\s*(true|false)|AdsVariable\.resetAdIds\(\))\s*;\s*(\/\/.*)?$/
  check('I4', 'The backend (lib/data/, lib/domain/) keeps every line it had and gains only an import of ads/ads_variable.dart and the calls AdsVariable.isPurchase.value = …, AdsVariable.resetAdIds() (flutter-ads section 7)',
    kept.filter(([f]) => /^lib\/(data|domain)\//.test(f)).flatMap(([f, x]) => {
      if (x.status === 'D') return [`\`${f}\` deleted`]
      const d = liveDiff(f, x)
      return [...lines(d, '-').map((l) => `\`${f}\` lost \`${l}\``),
        ...lines(d, '+').filter((l) => !/^\/\//.test(l) && !ALLOW_IMPORT.test(l) && !ALLOW_CALL.test(l)).map((l) => `\`${f}\` gained \`${l}\``)]
    }))
  const pubNow = fs.existsSync(path.join(root, 'pubspec.yaml')) ? read(path.join(root, 'pubspec.yaml')) : ''
  const basePub = own.some(([f, x]) => f === 'pubspec.yaml' && x.status === 'M') ? git('show', `${base}:pubspec.yaml`).replaceAll('\r\n', '\n') : ''
  const oldOverride = new Set((basePub.match(OVERRIDES)?.[1] || '').split('\n').map((l) => l.trim()))
  const overridden = new RegExp(`^  webview_flutter_wkwebview: ${WKWEBVIEW.replaceAll('.', '\\.')}$`, 'm').test(pubNow)
  const pinned = (l) => DEPS.some(([n, v]) => new RegExp(`^${n}:`).test(l) && new RegExp(`^  ${n}: ${v.replaceAll('.', '\\.')}( |$)`, 'm').test(pubNow))
    || (overridden && oldOverride.has(l) && /^(webview_flutter_wkwebview:|# iOS \(Swift Package Manager\):)/.test(l))
  check('I5', 'pubspec.yaml keeps every line it had (no existing package or version changed; an ads package set to the tested version, P14, is the pattern\'s)',
    own.filter(([f]) => f === 'pubspec.yaml').flatMap(([f, x]) => lines(diffOf(f, x), '-').filter((l) => !pinned(l)).map((l) => `lost \`${l}\``)))

  // only these may gain lines (a new Remote Config key: its AdsVariable field, its read + SharedPreferences copy)
  const MAY_GROW = new Set(['lib/ads/ads_variable.dart', 'lib/ads/ads_splash_utils.dart'])
  const CONFIG = 'assets/ads/config.json'
  const json = (s) => { try { return JSON.parse(s) } catch { return null } }
  check('P1', `The installed files are the guide app's (IPTV_two's ads layer) as the template has them; only ads_variable.dart, ads_splash_utils.dart and ${CONFIG} may gain lines (a new key — flutter-ads section 2)`, [
    ...[...tpl.keys()].filter((f) => !fs.existsSync(path.join(root, f))).map((f) => `\`${f}\` missing`),
    ...differ.flatMap(([f]) => {
      if (f === CONFIG) {
        const t = json(tpl.get(f)), a = json(read(path.join(root, f)))
        return !a ? [`\`${f}\` is not valid JSON`] : Object.keys(t).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(t[k])).map((k) => `\`${f}\` "${k}": ${k in a ? `${JSON.stringify(a[k])}, the template has ${JSON.stringify(t[k])}` : 'missing'}`)
      }
      return MAY_GROW.has(f) ? lines(tplDiff.get(f), '-').map((l) => `\`${f}\` lost \`${l}\``) : [`\`${f}\` differs from the template`]
    })])
  // IPTV splash_screen.dart:28-52: the stored + Remote Config ids first, then the splash interstitial
  const steps = ['AdsSplashUtils().getOnlineIds(', 'AdsLoadUtil().loadInterSplash(']
  const ordered = [...src].flatMap(([f, ls]) => {
    const t = ls.map((l) => code(l) ? l : '').join('\n'), pos = []
    for (const s of steps) { const i = t.indexOf(s, pos.length ? pos.at(-1) + 1 : 0); if (i < 0) return []; pos.push(i) }
    return [`${f}:${pos.map((p) => t.slice(0, p).split('\n').length).join(', ')}`]
  })
  check('P2', `The splash runs IPTV's steps in this order in one file: ${steps.join(' → ')}… (flutter-ads section 3)`,
    ordered.length ? [] : steps.map((s) => `${s}: ${at(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join(', ') || 'not found'}`), ordered)
  present('P3', 'The app\'s MaterialApp has the ads\' navigator (the "Loading..." dialog, the screen behind an app open ad): navigatorKey: AdsVariable.navigatorKey', /navigatorKey:\s*AdsVariable\.navigatorKey/)
  present('P4', 'Home starts the resume app open ad (IPTV screens/bottom_bar/home_screen.dart:57): AdsSplashUtils().loadAppLifecycleReactor()', /AdsSplashUtils\(\)\.loadAppLifecycleReactor\(\)/)
  present('P5', 'Home feature taps go through IPTV\'s tap rule: onTapInter(', /\bonTapInter\(/)
  // IPTV: switching tabs never shows an ad (its tab bar only sets currentPageIndex, home_screen.dart:201)
  const TAB = /onDestinationSelected|BottomNavigationBar|NavigationBar\(|TabBar\(|onTabChanged|goBranch\(|currentPageIndex|currentIndex\s*=|selectedIndex\s*=|tabController|\.animateTo\(|(?<!\b(?:final|var|const|late|int|num|bool|String|Widget|List<[^>]*>|Map<[^>]*>)\s+)\b_?(tab|index|page)\w*\s*=(?!=)/i // an assignment, not a declaration (`final tabs = [` holds the tab pages)
  check('P16', 'No ad on a tab switch: onTapInter( is not in a tab bar / tab change handler (its line or the 3 lines before) and never wraps a tab change (flutter-ads section 2)',
    [...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && /\bonTapInter\(/.test(l) && ls.slice(Math.max(0, i - 3), i + 1).some((p) => code(p) && TAB.test(p))
      ? [`${f}:${i + 1} \`${l.trim()}\``] : [])))
  // consent can be changed later: IPTV setting_screen.dart:127-141, the guide app setting_screen.dart:48-49
  check('P17', 'A privacy options entry (IPTV setting_screen.dart:127-141): AdsVariable.isPrivacyOptionsRequired decides whether it shows and showPrivacyOptionsForm( opens the form (flutter-ads section 5)',
    [['AdsVariable.isPrivacyOptionsRequired', /AdsVariable\.isPrivacyOptionsRequired\b/], ['showPrivacyOptionsForm(', /\bshowPrivacyOptionsForm\(/]]
      .filter(([, re]) => !at(re).length).map(([n]) => `${n}: not found in the app's own lib/`),
    at(/AdsVariable\.isPrivacyOptionsRequired\b|\bshowPrivacyOptionsForm\(/))
  // onTapInter shows nothing while isFirstTimeVisited is null; the splash flow branches on it (IPTV main.dart:22, screens/intro_screen.dart:124, screens/bottom_bar/home_screen.dart:75)
  const firstRead = /AdsVariable\.isFirstTimeVisited\s*=\s*.*getBool\(\s*['"]isFirstTime['"]\s*\)/, firstWrite = /setBool\(\s*['"]isFirstTime['"]\s*,\s*true\s*\)/
  check('P18', 'The launch reads "isFirstTime" into AdsVariable.isFirstTimeVisited, and the app stores it true once the intro is done or Home is reached (IPTV main.dart:22, screens/intro_screen.dart:124, screens/bottom_bar/home_screen.dart:75)',
    [[firstRead, 'AdsVariable.isFirstTimeVisited = prefs.getBool("isFirstTime")'], [firstWrite, 'setBool("isFirstTime", true)']].filter(([re]) => !at(re).length).map(([, n]) => `${n}: not found in the app's own lib/`),
    at(new RegExp(`${firstRead.source}|${firstWrite.source}`)))
  // a search box on a list is not a form: IPTV's Channels tab has one (channels_screen.dart:68, "Search Channels...") and the banner (:135)
  const formField = (ls) => ls.some((l, i) => code(l) && /\b(TextField|TextFormField|CupertinoTextField)\(/.test(l) && !ls.slice(i, i + 10).some((n) => /search/i.test(n)))
  check('P7', 'No banner on a screen with a text field — a search field (its controller, hint or handler says "search") does not count (flutter-ads section 2)',
    [...src].filter(([, ls]) => ls.some((l) => code(l) && /\bBannerWidget\(/.test(l)) && formField(ls)).map(([f]) => `${f} has BannerWidget and a text field`))
  if (hasPremium(root)) present('P9', 'The Premium screen stops the resume app open ad: AdsVariable.isShowingAd.value = true (IPTV in_app_purchase/app.dart:80; the next onTapInter clears it)', /AdsVariable\.isShowingAd\.value\s*=\s*true/)
  const OTHER_ADS = /\b(FirebaseRemoteConfig|MobileAds\.instance|(Interstitial|AppOpen|Rewarded|RewardedInterstitial|AdManagerInterstitial)Ad\.load|BannerAd\(|AdManagerBannerAd\(|NativeAd\()/
  const splashUtils = path.join(root, 'lib/ads/ads_splash_utils.dart')
  const key = fs.existsSync(splashUtils) && (read(splashUtils).match(/static const remoteConfigKey = "([^"]*)"/) || [])[1]
  check('P11', `One Remote Config key (AdsSplashUtils.remoteConfigKey = \`${name}_v1\`), and lib/ads/ is the only ads and Remote Config code: no other Remote Config fetch, ads SDK init or ad load in the app's own lib/ (flutter-ads section 3)`, [
    ...(key === `${name}_v1` ? [] : [`AdsSplashUtils.remoteConfigKey: ${key ? `"${key}"` : 'not found'} (expected "${name}_v1")`]),
    ...[...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && OTHER_ADS.test(l) ? [`${f}:${i + 1} \`${l.trim()}\``] : []))])
  const NET = /connectivity|isOnline|hasInternet|isConnected|internetConnection/i
  const loads = [...src].flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && /AdsSplashUtils\(\)\.getOnlineIds\(/.test(l) ? [[f, i]] : []))
  check('P12', 'The ads startup runs online or offline: no `if` on the connection before AdsSplashUtils().getOnlineIds( in its file (IPTV splash_screen.dart:30 runs it first; offline it keeps the ids the last online launch stored and opens the next screen after 4 s, ads_splash_utils.dart:289-292); step 8 also opens the app offline',
    !loads.length ? ['AdsSplashUtils().getOnlineIds( not found (P2)'] : loads.flatMap(([f, n]) => src.get(f).slice(0, n).flatMap((l, i) => code(l) && /\bif\s*\(/.test(l) && NET.test(l) ? [`${f}:${i + 1} \`${l.trim()}\` comes before the startup at line ${n + 1}`] : [])),
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
  const gradleNow = fs.existsSync(path.join(root, 'android/app/build.gradle.kts')) ? read(path.join(root, 'android/app/build.gradle.kts')) : ''
  check('P15', `The native settings the guide app has: AndroidManifest.xml INTERNET, AD_ID and the AdMob APPLICATION_ID; build.gradle.kts ${GRADLE_DEPS.map(([n, v]) => `${n}:${v}`).join(', ')} and release proguardFiles(… "proguard-rules.pro"); ${PROGUARD} \`${PROGUARD_KEEP}\` (IPTV's; release crashes at launch without it); Info.plist GADApplicationIdentifier and NSUserTrackingUsageDescription`, [
    ...['android.permission.INTERNET', 'com.google.android.gms.permission.AD_ID', 'com.google.android.gms.ads.APPLICATION_ID'].filter((k) => !has('android/app/src/main/AndroidManifest.xml', k)).map((k) => `AndroidManifest.xml has no ${k}`),
    ...(gradleNow ? GRADLE_DEPS.filter(([n, v]) => !gradleNow.includes(`implementation("${n}:${v}")`)).map(([n, v]) => `build.gradle.kts has no implementation("${n}:${v}")`) : []),
    ...(gradleNow && !/proguardFiles\([\s\S]*?"proguard-rules\.pro"/.test(gradleNow) ? ['build.gradle.kts: release does not use proguard-rules.pro'] : []),
    ...(fs.existsSync(path.join(root, PROGUARD)) && read(path.join(root, PROGUARD)).includes(PROGUARD_KEEP) ? [] : [`${PROGUARD} has no \`${PROGUARD_KEEP}\``]),
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
    ...(why.size ? [`## Replaced: the app's own ads layer (--replaced, proved from ${head.split(' ')[0]})`, '',
      ...[...why].map(([f, w]) => `- \`${f}\` ${word[files.get(f)?.status] || 'unchanged'} — ${w}`), ''] : []),
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
  w('android/app/build.gradle.kts', 'android {\n    defaultConfig {\n        minSdk = flutter.minSdkVersion\n    }\n\n    buildTypes {\n        release {\n            // TODO: Add your own signing config for the release build.\n            // Signing with the debug keys for now, so `flutter run --release` works.\n            signingConfig = signingConfigs.getByName("debug")\n        }\n    }\n}\n\nflutter {\n    source = "../.."\n}\n')
  w('ios/Runner/AppDelegate.swift', `import Flutter\nimport UIKit\n\n@main\n@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {\n  override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  ) -> Bool {\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }\n\n  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {\n    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)\n  }\n}\n`)
  w('ios/Runner/Info.plist', '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleName</key>\n\t<string>my_app</string>\n</dict>\n</plist>\n')
  w('ios/Runner.xcodeproj/project.pbxproj', 'IPHONEOS_DEPLOYMENT_TARGET = 13.0;\nIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n')
}

// The template is the guide app's ads code (flutter-ads: "a copy of the guide app"), byte for byte: lib/ads/, premium_core/,
// their tests, config.json (IPTV's, verbatim), MainActivity.kt / NativeAds.kt / proguard-rules.pro / res/ (IPTV's),
// AppDelegate.swift; and the versions the installer pins are the ones the guide app builds with.
const DEMO = process.env.ADS_DEMO || '/Users/mach/testing/common_flow_demo'
function demoSelftest() {
  if (!fs.existsSync(DEMO)) return `template = common_flow_demo: not checked (${DEMO} is not on this machine)`
  const kt = walk(path.join(DEMO, 'android/app/src/main')).find((f) => /(^|\/)MainActivity\.kt$/.test(f))
  const DIRS = ['lib/ads', 'test/ads', 'lib/premium_core', 'test/premium_core', 'integration_test', 'assets/ads']
  const pairs = [
    ...DIRS.flatMap((d) => walk(path.join(TEMPLATE, d)).map((f) => [`${d}/${f}`, `${d}/${f}`])),
    ...[...KOTLIN_FILES, 'MainActivity.kt'].map((f) => [`android/${f}`, path.join('android/app/src/main', path.dirname(kt), f)]),
    ['android/proguard-rules.pro', PROGUARD],
    ...resFiles().map((f) => [`android/res/${f}`, `${RES}/${f}`]),
    ['ios/AppDelegate.swift', 'ios/Runner/AppDelegate.swift'],
  ]
  for (const [t, d] of pairs) assert.ok(fs.readFileSync(path.join(TEMPLATE, t)).equals(fs.readFileSync(path.join(DEMO, d))), `template ${t} = common_flow_demo ${d}`)
  for (const d of DIRS) assert.deepEqual(walk(path.join(DEMO, d)).sort(), walk(path.join(TEMPLATE, d)).sort(), `${d}: same files in common_flow_demo and the template`)
  assert.match(read(path.join(DEMO, 'lib/ads/ads_splash_utils.dart')), /static const remoteConfigKey = "common_flow_demo_v1";/, 'the key fix() rewrites')
  const lock = read(path.join(DEMO, 'pubspec.lock'))
  for (const [n, v] of DEPS) assert.equal(locked(lock, n), v, `${n}: the installer pins the version common_flow_demo's pubspec.lock has`)
  assert.equal(locked(lock, 'webview_flutter_wkwebview'), WKWEBVIEW, 'webview_flutter_wkwebview: the version common_flow_demo resolves')
  assert.ok(read(path.join(DEMO, 'pubspec.yaml')).includes(PIN.replace('dependency_overrides:\n', '')), 'the override (comment + version) is common_flow_demo\'s')
  const gradle = read(path.join(DEMO, 'android/app/build.gradle.kts'))
  for (const [n, v] of GRADLE_DEPS) assert.ok(gradle.includes(`implementation("${n}:${v}")`), `${n}:${v} is common_flow_demo's`)
  assert.match(gradle, /isMinifyEnabled = true\n\s*proguardFiles\([\s\S]*?"proguard-rules\.pro"/, 'common_flow_demo\'s release uses proguard-rules.pro')
  assert.equal(read(path.join(DEMO, 'ios/Runner/Info.plist')).match(/<key>NSUserTrackingUsageDescription<\/key>\s*<string>([^<]*)</)[1], ATT_TEXT)
  return `template = common_flow_demo (${pairs.length} files, ${DEPS.length + 1} package versions, ${GRADLE_DEPS.length} Android libraries, the override, R8, the tracking text compared)`
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
  w('lib/ui/home_tabs.dart', "final tabs = [\n  ListTile(onTap: () => onTapInter(() => open())),\n];\n") // a list named tabs is not a tab change
  w('lib/data/purchase.dart', "class Buyer {\n  void bought() {\n  }\n}\n")
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
  // the wiring, as flutter-ads sections 2–3 say (the guide app's, IPTV's): launch reads isFirstTime, splash runs
  // getOnlineIds then loadInterSplash, the navigator key, a banner, Home's resume reactor and tap rule, the privacy row,
  // Premium sets isShowingAd, IPTV's odd-homeFlag back rule; the backend gains only the purchase lines; one allowed
  // addition to an installed file. Commented-out code is not checked (an RC fetch and a product-name match inside /* */)
  w('lib/ui/old.dart', "/* outer /* inner */\nvoid x() {\n  final rc = FirebaseRemoteConfig.instance;\n  if (info.activeSubscriptions.toString().contains('week')) {}\n}\n*/\n")
  w('lib/domain/rule.dart', 'int rule() => 1;\n/*\nint old() => 2;\n*/\n')
  w('lib/main.dart', "import 'package:flutter/material.dart';\nimport 'package:my_app/ads/banner_widget.dart';\n\nFuture<void> main() async {\n  final prefs = await SharedPreferences.getInstance();\n  AdsVariable.isFirstTimeVisited = prefs.getBool(\"isFirstTime\") ?? false;\n  await AdsSplashUtils().getOnlineIds(() {});\n  await AdsLoadUtil().loadInterSplash(() {}, () {}, AdsVariable.interSplash, enable: true);\n  runApp(MaterialApp(navigatorKey: AdsVariable.navigatorKey, home: Column(children: [Text('home'), BannerWidget(adsId: AdsVariable.banner, enable: true)])));\n  AdsSplashUtils().loadAppLifecycleReactor();\n  onTapInter(() {});\n  await prefs.setBool(\"isFirstTime\", true);\n}\n")
  w('lib/data/purchase.dart', "import '../ads/ads_variable.dart';\n\nclass Buyer {\n  void bought() {\n    AdsVariable.isPurchase.value = true; // IPTV dialog.dart:84-85\n    AdsVariable.resetAdIds();\n  }\n}\n")
  w('lib/ui/channels.dart', "Widget channels() => Scaffold(\n  body: TextField(\n    controller: searchController,\n  ),\n  bottomNavigationBar: BannerWidget(adsId: AdsVariable.banner, enable: true),\n);\n") // P7: a search box is not a form
  w('lib/ui/settings.dart', "Widget privacy() => AdsVariable.isPrivacyOptionsRequired.value ? ListTile(onTap: () => showPrivacyOptionsForm((e) {})) : const SizedBox();\n")
  w('lib/ui/premium.dart', "void initState() {\n  AdsVariable.isShowingAd.value = true;\n}\n")
  w('lib/ui/feature.dart', "Widget feature() => PopScope(\n  onPopInvokedWithResult: (didPop, _) {\n    if (didPop && AdsVariable.homeFlag.isOdd) {\n      AdsVariable.homeFlag++;\n    }\n  },\n  child: const SizedBox(),\n);\n") // IPTV's back rule
  w('test/ads_wiring_test.dart', "void main() {\n  testWidgets('AC47 home shows the banner', (t) async {});\n  test('AC48 another user\\'s profile', () {});\n}\n")
  fs.appendFileSync(path.join(root, 'lib/ads/ads_variable.dart'), '// app addition\n')
  w('pubspec.lock', lockOf())
  fs.appendFileSync(path.join(root, 'linux/flutter/generated_plugin_registrant.cc'), '#include <firebase_core/firebase_core_plugin_c_api.h>\n') // flutter pub get
  w(`.dart_tool/${TESTS_AFTER}`, testRun([['test/app_test.dart', [['home opens', 'success'], ['was already failing', 'failure']]], ['test/ads_wiring_test.dart', [['AC47 home shows the banner', 'success']]]]))
  g('add', 'lib/main.dart'); g('commit', '-q', '-m', 'part of the ads work committed') // committed and uncommitted both count

  const r = changes(root, base)
  const tplCount = [...templateFiles(root).keys()].length
  assert.match(r, new RegExp(`- ${tplCount} files installed from the template — \\*\\*1 differ from it\\*\\*`))
  assert.match(r, /- `lib\/ads\/ads_variable\.dart` — \*\*differs from the template\*\*/)
  assert.match(r, /### `lib\/ads\/ads_variable\.dart` against the template\n\n```diff\n[\s\S]*\+\/\/ app addition/)
  assert.match(r, /\| `lib\/main\.dart` \| changed \| 11 \| 1 \|/)
  assert.match(r, /### `lib\/main\.dart`\n\n```diff\n[\s\S]*\+import 'package:my_app\/ads\/banner_widget\.dart';[\s\S]*-void main\(\) => runApp\(const MaterialApp\(home: Text\('home'\)\)\);/)
  assert.match(r, /\| `pubspec\.yaml` \| changed \|/)
  assert.match(r, /\| `android\/app\/src\/main\/AndroidManifest\.xml` \| changed \|/)
  assert.match(r, /\| `android\/app\/proguard-rules\.pro` \| added \|/)
  assert.match(r, /\| `test\/ads_wiring_test\.dart` \| added \| 4 \| 0 \|/)
  assert.match(r, /- lib\/main\.dart:9: `runApp\(MaterialApp\(navigatorKey: AdsVariable\.navigatorKey, home: Column\(children: \[Text\('home'\), BannerWidget\(adsId: AdsVariable\.banner, enable: true\)\]\)\)\);`/)
  assert.match(r, /- lib\/main\.dart:11: `onTapInter\(\(\) \{\}\);`/, 'a top-level function of the layer counts as a use')
  assert.match(r, /## Tests added\n\n- test\/ads_wiring_test\.dart: AC47 home shows the banner\n- test\/ads_wiring_test\.dart: AC48 another user's profile\n/, 'an escaped quote does not cut the name')
  assert.match(r, /## Regenerated by flutter pub get\n\n- `linux\/flutter\/generated_plugin_registrant\.cc` \(\+1 −0\)\n- `pubspec\.lock` \(\+\d+ −0\)/)
  assert.doesNotMatch(r, /### `pubspec\.lock`/, 'generated files are not printed')
  assert.doesNotMatch(r, /untouched\.dart|\.dart_tool/, 'a file the ads work did not touch is not listed')
  assert.doesNotMatch(r, /### `lib\/ads\/banner_widget\.dart`/, 'an identical template file is listed, not printed')
  // the checks, on an app wired as the pattern says
  assert.match(r, /- Checks: 20 passed, 0 failed\n/)
  assert.doesNotMatch(r, /\*\*FAIL\*\*/)
  assert.match(r, /\*\*PASS\*\* I5 /, 'google_mobile_ads ^9.1.0 → 9.2.0 and the old override → 3.27.2 are the pattern, not a broken package')
  assert.match(r, /\*\*PASS\*\* I4 /, 'the backend gained only the import and IPTV\'s purchase lines')
  assert.doesNotMatch(r, /lib\/ui\/old\.dart:/, 'code inside /* */ is not checked')
  assert.match(r, /\*\*PASS\*\* I3 .* \(1 passed before; 2 of 3 pass now\)\n  - 1 failed or were skipped already before the ads work\n/)
  assert.match(r, /\*\*PASS\*\* P2 .*\n  - lib\/main\.dart:7, 8\n/)
  assert.match(r, /\*\*PASS\*\* P3 .*\n  - lib\/main\.dart:9\n/)
  assert.match(r, /\*\*PASS\*\* P4 .*\n  - lib\/main\.dart:10\n/)
  assert.match(r, /\*\*PASS\*\* P12 .*\n  - lib\/main\.dart:7\n/)
  assert.match(r, /\*\*PASS\*\* P17 .*\n  - lib\/ui\/settings\.dart:1\n/)
  assert.match(r, /\*\*PASS\*\* P18 .*\n  - lib\/main\.dart:6\n  - lib\/main\.dart:12\n/)
  assert.match(r, /\*\*PASS\*\* P9 .*\n  - lib\/ui\/premium\.dart:2\n/)
  // the same test report recorded in another folder (the app was copied or moved after step 1): still matched
  const beforeJson = path.join(root, '.dart_tool', TESTS_BEFORE), recorded = read(beforeJson)
  fs.writeFileSync(beforeJson, recorded.replaceAll(JSON.stringify(root).slice(1, -1), '/elsewhere/old-copy'))
  assert.match(changes(root, base), /\*\*PASS\*\* I3 .* \(1 passed before; 2 of 3 pass now\)/)
  fs.writeFileSync(beforeJson, recorded)
  w(REPORT, r)
  assert.equal(changes(root, base), r, 'the report does not list itself')
  g('add', '-A'); g('commit', '-q', '-m', 'the rest of the ads work')
  assert.equal(changes(root, base), r, 'the same report before and after the commit')

  // an app that had the ads layer before the base (an earlier install): a template file it changes is still checked by P1
  const installed = g('rev-parse', 'HEAD').trim(), json = 'assets/ads/config.json'
  w(json, r_(json).replace('{', '{\n  "app_value": "1",'))
  const y = changes(root, installed)
  assert.match(y, /- 1 files installed from the template — \*\*1 differ from it\*\*/)
  assert.match(y, /\*\*PASS\*\* I1 /, 'config.json is the template\'s file')
  assert.match(y, /\*\*PASS\*\* P1 /, 'a new key is an allowed addition')
  w(json, r_(json).replace('"interSplash": "ca-app-pub-3940256099942544/1033173712"', '"interSplash": "11"'))
  assert.match(changes(root, installed), /\*\*FAIL\*\* P1 .*\n  - `assets\/ads\/config\.json` "interSplash": "11", the template has "ca-app-pub-3940256099942544\/1033173712"\n/)
  w(json, r_(json).replace('"interSplash": "11"', '"interSplash": "ca-app-pub-3940256099942544/1033173712"'))

  // each rule broken once: every check fails, with the line that breaks it
  w('lib/data/purchase.dart', r_('lib/data/purchase.dart').replace('class Buyer {', 'class Buyer2 {').replace('ads/ads_variable.dart', 'ads/ads_load_util.dart'))
  w('test/app_test.dart', "void main() {\n  testWidgets('home opens', (t) async {}, skip: true);\n}\n")
  w('functions/index.js', 'exports.api = () => {}\n')
  w(`.dart_tool/${TESTS_AFTER}`, testRun([['test/app_test.dart', [['home opens', 'failure']]]]))
  w('pubspec.yaml', r_('pubspec.yaml').replace('cupertino_icons: ^1.0.8', 'cupertino_icons: ^1.0.9').replace(/^  webview_flutter_wkwebview: \^3\.20\.0 .*\n/m, ''))
  fs.appendFileSync(path.join(root, 'lib/ads/banner_widget.dart'), '// edited\n')
  w('lib/ads/ads_splash_utils.dart', r_('lib/ads/ads_splash_utils.dart').replace('remoteConfigKey = "my_app_v1"', 'remoteConfigKey = "other_v1"'))
  w(json, r_(json).replace('"interSplash": "ca-app-pub-3940256099942544/1033173712"', '"interSplash": "11"'))
  fs.rmSync(path.join(root, 'lib/ads/loading_screen.dart'))
  w('pubspec.lock', lockOf({ google_mobile_ads: '9.1.0', webview_flutter_wkwebview: '3.27.1' }))
  w('ios/Runner/Info.plist', r_('ios/Runner/Info.plist').replace(/\t<key>NSUserTrackingUsageDescription<\/key>\n\t<string>[^<]*<\/string>\n/, ''))
  w('android/app/build.gradle.kts', r_('android/app/build.gradle.kts').replace(/^.*sdp-android.*\n/m, ''))
  w(PROGUARD, '-keep class com.acme.** { *; }\n')
  w('lib/ui/old_ads.dart', "final rc = FirebaseRemoteConfig.instance;\n")
  w('lib/main.dart', "import 'package:flutter/material.dart';\n\nFuture<void> main() async {\n  if (!await checkConnectivity()) return;\n  await AdsLoadUtil().loadInterSplash(() {}, () {}, AdsVariable.interSplash, enable: true);\n  await AdsSplashUtils().getOnlineIds(() {});\n  runApp(const MaterialApp(home: Text('home')));\n}\n")
  w('lib/ui/form.dart', "Widget form() => Scaffold(body: TextField(), bottomNavigationBar: BannerWidget(adsId: AdsVariable.banner, enable: true));\n")
  w('lib/domain/rule.dart', '/*\nint rule() => 1;\n*/\n')
  w('lib/ui/premium.dart', "void initState() {}\nbool premium(info) => info.activeSubscriptions.toString().contains('week');\n")
  w('lib/ui/settings.dart', "/*Widget row() => ListTile(onTap: () => showPrivacyOptionsForm((e) {}));*/\nbool need() => AdsVariable.isPrivacyOptionsRequired.value;\n") // the row commented out
  w('lib/ui/tabs.dart', "Widget bar() => NavigationBar(\n  onDestinationSelected: (i) => onTapInter(() => setTab(i)),\n);\n")
  const x = changes(root, base)
  assert.match(x, /- Checks: 1 passed, 19 failed \(I1, I2, I3, I4, I5, P1, P2, P3, P4, P16, P17, P18, P7, P9, P11, P12, P13, P14, P15\)\n/)
  for (const ev of [
    /\*\*FAIL\*\* I1 .*\n  - `functions\/index\.js` added\n/,
    /\*\*FAIL\*\* I2 .*\n  - `test\/app_test\.dart` changed\n/,
    /\*\*FAIL\*\* I3 .*\n  - test\/app_test\.dart: home opens — fails now\n/,
    /\*\*FAIL\*\* I4 [\s\S]*?  - `lib\/data\/purchase\.dart` lost `class Buyer \{`\n  - `lib\/data\/purchase\.dart` gained `import '\.\.\/ads\/ads_load_util\.dart';`\n  - `lib\/data\/purchase\.dart` gained `class Buyer2 \{`\n/,
    /  - `lib\/domain\/rule\.dart` lost `int rule\(\) => 1;`\n/,
    /\*\*FAIL\*\* I5 .*\n  - lost `cupertino_icons: \^1\.0\.8`\n/,
    /  - lost `webview_flutter_wkwebview: \^3\.20\.0 # the app's own`\n/,
    /  - `lib\/ads\/loading_screen\.dart` missing\n/,
    /  - `assets\/ads\/config\.json` "interSplash": "11", the template has "ca-app-pub-3940256099942544\/1033173712"\n/,
    /  - `lib\/ads\/ads_splash_utils\.dart` lost `static const remoteConfigKey = "my_app_v1";`\n/,
    /  - `lib\/ads\/banner_widget\.dart` differs from the template\n/,
    /\*\*FAIL\*\* P2 .*\n  - AdsSplashUtils\(\)\.getOnlineIds\(: lib\/main\.dart:6\n  - AdsLoadUtil\(\)\.loadInterSplash\(: lib\/main\.dart:5\n/,
    /\*\*FAIL\*\* P3 .*\n  - not found in the app's own lib\/\n/,
    /\*\*FAIL\*\* P4 .*\n  - not found in the app's own lib\/\n/,
    /\*\*FAIL\*\* P16 .*\n  - lib\/ui\/tabs\.dart:2 `onDestinationSelected: \(i\) => onTapInter\(\(\) => setTab\(i\)\),`\n/,
    /\*\*FAIL\*\* P17 .*\n  - showPrivacyOptionsForm\(: not found in the app's own lib\/\n/,
    /\*\*FAIL\*\* P18 .*\n  - AdsVariable\.isFirstTimeVisited = prefs\.getBool\("isFirstTime"\): not found in the app's own lib\/\n  - setBool\("isFirstTime", true\): not found in the app's own lib\/\n/,
    /\*\*FAIL\*\* P7 .*\n  - lib\/ui\/form\.dart has BannerWidget and a text field\n/,
    /\*\*FAIL\*\* P9 .*\n  - not found in the app's own lib\/\n/,
    /\*\*FAIL\*\* P11 .*\n  - AdsSplashUtils\.remoteConfigKey: "other_v1" \(expected "my_app_v1"\)\n  - lib\/ui\/old_ads\.dart:1 `final rc = FirebaseRemoteConfig\.instance;`\n/,
    /\*\*FAIL\*\* P12 .*\n  - lib\/main\.dart:4 `if \(!await checkConnectivity\(\)\) return;` comes before the startup at line 6\n/,
    /\*\*FAIL\*\* P13 .*\n  - lib\/ui\/premium\.dart:2 `bool premium\(info\) => info\.activeSubscriptions\.toString\(\)\.contains\('week'\);`\n/,
    /\*\*FAIL\*\* P14 .*\n  - google_mobile_ads 9\.1\.0 \(tested: 9\.2\.0\)\n  - webview_flutter_wkwebview 3\.27\.1 \(tested: 3\.27\.2, flutter-ads section 1\)\n/,
    /\*\*FAIL\*\* P15 .*\n  - build\.gradle\.kts has no implementation\("com\.intuit\.sdp:sdp-android:1\.0\.6"\)\n  - android\/app\/proguard-rules\.pro has no `-keep class androidx\.work\.\*\* \{ \*; \}`\n  - Info\.plist has no NSUserTrackingUsageDescription\n/,
  ]) assert.match(x, ev)
  fs.rmSync(root, { recursive: true, force: true })
  return 'changes selftest ok'
}

// --replaced: an app's own ads layer (an SDK file, a rule only it uses, a screen that imports it, its test) is proved
// from <base> and left out of I1–I4; an unrelated file is refused; without --replaced the same removal fails I2–I4
function replacedSelftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-replaced-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  const g = (...a) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' })
  const run = (suites) => suites.flatMap(([file, tests], s) => [{ type: 'suite', suite: { id: s, path: path.join(root, file) } },
    ...tests.flatMap((name, i) => [{ type: 'testStart', test: { id: s * 100 + i, name, suiteID: s } }, { type: 'testDone', testID: s * 100 + i, result: 'success', skipped: false, hidden: false }])])
    .map((e) => JSON.stringify(e)).join('\n') + '\n'
  fixture(w)
  w('pubspec.yaml', 'name: my_app\nenvironment:\n  sdk: ^3.13.5\ndependencies:\n  flutter:\n    sdk: flutter\n')
  w('lib/data/old_ads.dart', "import 'package:google_mobile_ads/google_mobile_ads.dart';\nimport '../domain/old_rules.dart';\n\nclass OldAds {}\n")
  w('lib/domain/old_rules.dart', 'bool mayShow() => true;\n')
  w('lib/domain/rule.dart', 'int rule() => 1;\n')
  w('lib/ui/old_dialog.dart', "import 'package:my_app/data/old_ads.dart';\n\nvoid showOld() {}\n")
  w('lib/main.dart', "import 'ui/old_dialog.dart';\nimport 'domain/rule.dart';\n\nvoid main() => showOld();\n")
  w('test/old_ads_test.dart', "import 'package:my_app/data/old_ads.dart';\n\nvoid main() {\n  test('old ad shows', () {});\n}\n")
  w('test/app_test.dart', "void main() {\n  test('home opens', () {});\n}\n")
  w('.gitignore', '.dart_tool/\n')
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'app with its own ads')
  const base = g('rev-parse', 'HEAD').trim()
  w(`.dart_tool/${TESTS_BEFORE}`, run([['test/app_test.dart', ['home opens']], ['test/old_ads_test.dart', ['old ad shows']]]))
  for (const f of ['lib/data/old_ads.dart', 'lib/domain/old_rules.dart', 'lib/ui/old_dialog.dart', 'test/old_ads_test.dart', 'lib/domain/rule.dart']) fs.rmSync(path.join(root, f))
  w('lib/main.dart', "void main() {}\n")
  w(`.dart_tool/${TESTS_AFTER}`, run([['test/app_test.dart', ['home opens']]]))
  const layer = ['lib/data/old_ads.dart', 'lib/domain/old_rules.dart', 'lib/ui/old_dialog.dart', 'test/old_ads_test.dart']
  const ok = changes(root, base, layer)
  assert.match(ok, /## Replaced: the app's own ads layer \(--replaced, proved from \w+\)\n\n- `lib\/data\/old_ads\.dart` deleted — imports an ads SDK\n- `lib\/domain\/old_rules\.dart` deleted — only `lib\/data\/old_ads\.dart` import it\n- `lib\/ui\/old_dialog\.dart` deleted — imports `lib\/data\/old_ads\.dart`\n- `test\/old_ads_test\.dart` deleted — imports `lib\/data\/old_ads\.dart`\n/)
  for (const id of ['I1', 'I2', 'I3']) assert.match(ok, new RegExp(`\\*\\*PASS\\*\\* ${id} `))
  assert.match(ok, /\*\*FAIL\*\* I4 .*\n  - `lib\/domain\/rule\.dart` deleted\n(?!  - `lib\/(data\/old_ads|domain\/old_rules))/, 'an unrelated backend file is still the app\'s: its loss fails')
  const bad = changes(root, base, [...layer, 'lib/domain/rule.dart'])
  assert.match(bad, /\*\*FAIL\*\* I1 .*\n  - --replaced `lib\/domain\/rule\.dart` imports no ads SDK and no replaced file, and is also imported by `lib\/main\.dart`\n/)
  const none = changes(root, base)
  assert.match(none, /\*\*FAIL\*\* I2 .*\n  - `test\/old_ads_test\.dart` deleted\n/)
  assert.match(none, /\*\*FAIL\*\* I3 .*\n  - test\/old_ads_test\.dart: old ad shows — no longer runs\n/)
  assert.match(none, /\*\*FAIL\*\* I4 .*\n  - `lib\/data\/old_ads\.dart` deleted\n  - `lib\/domain\/old_rules\.dart` deleted\n  - `lib\/domain\/rule\.dart` deleted\n/)
  assert.doesNotMatch(none, /## Replaced/)
  fs.rmSync(root, { recursive: true, force: true })
  return 'replaced selftest ok'
}

// skills/ads-implementation steps 8.1 (analyze), 8.2 (whole test suite, JSON for I3), 8.4 (debug builds; iOS on a Mac) and 9
// (ADS_CHANGES.md) in one call, so the agent reads one short result instead of four outputs. Every step runs even after a
// failure: the agent fixes from one result. `flutter` is the binary (FLUTTER, else flutter on PATH).
export function verify(root, base, { flutter = process.env.FLUTTER || 'flutter', ios = process.platform === 'darwin', replaced = [] } = {}) {
  const out = []; let ok = true
  const run = (title, args, pick, judge = (ls, status) => status === 0) => {
    const t = Date.now(), r = spawnSync(flutter, args, { cwd: root, encoding: 'utf8', maxBuffer: 256 << 20 })
    const ls = `${r.stdout || ''}\n${r.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '').split('\n').map((l) => l.trimEnd()).filter((l) => l.trim())
    const pass = judge(ls, r.status); ok &&= pass
    out.push(`${pass ? 'PASS' : 'FAIL'} ${title}: \`flutter ${args.join(' ')}\` (exit ${r.status ?? r.error?.code}, ${Math.round((Date.now() - t) / 1000)} s)`,
      ...pick(ls, pass).filter(Boolean).map((l) => `  ${l.trim()}`))
  }
  const why = (ls, pass, keep) => pass ? [ls.findLast((l) => keep.test(l))] // the success line, else the error lines and the last line
    : [...ls.filter((l) => /\berror\b|Error:|FAILURE|What went wrong|\[!\]|^\s*>/i.test(l)).slice(0, 15), ls.at(-1)]
  // an info / warning in a file the ads work never touched (not in `git diff <base>`, not new) was there before it: the
  // app's own, counted with its place, not failed. An error, or any issue in a touched file, fails.
  const ISSUE = /^\s*(info|warning|error) • .* • (\S+?):\d+:\d+ • \w+$/
  const touched = new Set([['diff', '--name-only', base], ['ls-files', '--others', '--exclude-standard']]
    .flatMap((a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).split('\n')).filter(Boolean))
  const ours = (l) => { const m = l.match(ISSUE); return !!m && (m[1] === 'error' || touched.has(m[2])) }
  const before = (ls) => ls.filter((l) => ISSUE.test(l) && !ours(l)).map((l) => l.match(ISSUE)[2] + l.match(/:\d+:\d+/)[0])
  run('8.1 analyze', ['analyze'], (ls) => [ls.findLast((l) => /issues? found|No issues found/.test(l)) || ls.at(-1),
    ...ls.filter((l) => ours(l) && /^\s*(error|warning) •/.test(l)).slice(0, 20), ...ls.filter((l) => ours(l) && /^\s*info •/.test(l)).slice(0, 10),
    before(ls).length && `${before(ls).length} in files unchanged since ${base.slice(0, 7)} (the app's own, not failed): ${before(ls).slice(0, 5).join(', ')}`],
  (ls, status) => status === 0 || (ls.some((l) => ISSUE.test(l)) && !ls.some(ours)))
  const json = path.join(root, '.dart_tool', TESTS_AFTER)
  run('8.2 test suite', ['test', '-j', '4', '-r', 'failures-only', '--file-reporter', `json:.dart_tool/${TESTS_AFTER}`], (ls, pass) => {
    if (pass || !fs.existsSync(json)) return [ls.at(-1)]
    const name = {}, err = {}, caught = {}, failed = [] // caught: the framework's "EXCEPTION CAUGHT" print, where the real cause is
    for (const e of read(json).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))) {
      if (e.type === 'testStart') name[e.test.id] = e.test.name
      else if (e.type === 'error') err[e.testID] ??= e.error.split('\n')[0].slice(0, 160)
      else if (e.type === 'print' && /EXCEPTION CAUGHT/.test(e.message)) caught[e.testID] ??= e.message.split('\n').slice(2, 4).map((l) => l.trim()).join(' ').slice(0, 200)
      else if (e.type === 'testDone' && !e.hidden && e.result !== 'success') failed.push(e.testID)
    }
    return [ls.at(-1), ...failed.slice(0, 15).map((id) => `✗ ${name[id]} — ${caught[id] || err[id] || 'no error message'}`)]
  })
  run('8.4 Android build', ['build', 'apk', '--debug'], (ls, pass) => why(ls, pass, /✓ Built/))
  if (ios) run('8.4 iOS build', ['build', 'ios', '--simulator', '--debug'], (ls, pass) => why(ls, pass, /✓ Built/))
  else out.push('SKIP 8.4 iOS build: not a Mac')
  const r = changes(root, base, replaced), rl = r.split('\n')
  const fails = rl.flatMap((l, i) => l.startsWith('- **FAIL**') ? [l, ...rl.slice(i + 1).filter((_, k, a) => a.slice(0, k + 1).every((x) => x.startsWith('  - '))).slice(0, 3).map((x) => `  ${x}`)] : [])
  fs.writeFileSync(path.join(root, REPORT), r); ok &&= !fails.length
  out.push(`${fails.length ? 'FAIL' : 'PASS'} 9 ${REPORT} written`, ...r.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- `') && !l.startsWith('- **')).slice(0, 6).map((l) => `  ${l}`),
    ...fails.map((l) => l.startsWith('- **FAIL**') ? `  ${l.replace('- ', '')}` : l), ...(fails.length ? [`  (all evidence lines in ${REPORT})`] : []))
  return { ok, text: out.join('\n') }
}

function verifySelftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-verify-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  fixture(w)
  const g = (...a) => execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' })
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'base'); const base = g('rev-parse', 'HEAD').trim()
  install(root)
  // a flutter stand-in: analyze finds an error among infos, one test fails, the APK builds
  w('flutter.sh', `#!/bin/sh
case "$1 $2" in
  "analyze ") printf '  info • Unused • lib/a.dart:1:1 • unused\n  error • Undefined name x • lib/b.dart:2:3 • undefined_identifier\n\n2 issues found. (ran in 1.0s)\n'; exit 1;;
  "test -j") printf '%s\n' '{"type":"testStart","test":{"id":1,"name":"home opens"}}' '{"type":"print","testID":1,"message":"══╡ EXCEPTION CAUGHT BY FLUTTER TEST FRAMEWORK ╞══\\nThe following TestFailure was thrown running a test:\\nExpected: exactly one matching candidate\\n  Actual: _TextWidgetFinder:<Found 0 widgets>\\nmore"}' '{"type":"error","testID":1,"error":"Test failed. See exception logs above.\\nThe test description was: home opens"}' '{"type":"testDone","testID":1,"result":"failure","hidden":false}' > .dart_tool/${TESTS_AFTER}; echo '00:01 +2 -1: Some tests failed.'; exit 1;;
  "build apk") echo 'Running Gradle task'; echo '✓ Built build/app/outputs/flutter-apk/app-debug.apk'; exit 0;;
esac
exit 9
`)
  fs.chmodSync(path.join(root, 'flutter.sh'), 0o755); fs.mkdirSync(path.join(root, '.dart_tool'), { recursive: true })
  const v = verify(root, base, { flutter: path.join(root, 'flutter.sh'), ios: false })
  assert.equal(v.ok, false)
  assert.match(v.text, /^FAIL 8\.1 analyze: `flutter analyze` \(exit 1, \d+ s\)\n  2 issues found\. \(ran in 1\.0s\)\n  error • Undefined name x • lib\/b\.dart:2:3 • undefined_identifier\n/)
  assert.doesNotMatch(v.text, /info • Unused/, 'infos are counted, not listed')
  assert.match(v.text, /FAIL 8\.2 test suite: .*\n  00:01 \+2 -1: Some tests failed\.\n  ✗ home opens — Expected: exactly one matching candidate Actual: _TextWidgetFinder:<Found 0 widgets>\n/)
  assert.match(v.text, /PASS 8\.4 Android build: .*\n  ✓ Built build\/app\/outputs\/flutter-apk\/app-debug\.apk\nSKIP 8\.4 iOS build: not a Mac\n/)
  assert.doesNotMatch(v.text, /Running Gradle task/, 'a passing step prints only its result line')
  assert.match(v.text, /(PASS|FAIL) 9 ADS_CHANGES\.md written\n  - \d+ files installed from the template/)
  assert.match(v.text, /  \*\*FAIL\*\* P2 .*\n    - .+\n/, 'a failed check comes with its evidence lines')
  assert.ok(fs.existsSync(path.join(root, REPORT)))
  // analyze: an info in a file untouched since base passes (listed); an info in an installed file fails
  const an = (out) => { w('flutter.sh', `#!/bin/sh\n[ "$1" = analyze ] && { printf '${out}\\n\\n1 issue found. (ran in 1.0s)\\n'; exit 1; }\nexit 0\n`); return verify(root, base, { flutter: path.join(root, 'flutter.sh'), ios: false }).text }
  assert.match(an('   info • Old • test/old_test.dart:9:2 • deprecated_member_use'), /^PASS 8\.1 analyze: .*\n  1 issue found\. .*\n  1 in files unchanged since \w{7} \(the app's own, not failed\): test\/old_test\.dart:9:2\n/)
  assert.match(an('   info • New • lib/ads/ads_variable.dart:3:1 • unused_import'), /^FAIL 8\.1 analyze: .*\n  1 issue found\. .*\n  info • New • lib\/ads\/ads_variable\.dart:3:1 • unused_import\n/)
  fs.rmSync(root, { recursive: true, force: true })
  return 'verify selftest ok'
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-install-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  fixture(w)
  const r = (f) => read(path.join(root, f))
  w('android/settings.gradle.kts', 'plugins {\n    id("org.jetbrains.kotlin.android") version "2.2.20" apply false\n}\n')
  w('android/app/build.gradle.kts', r('android/app/build.gradle.kts').replace('android {\n', 'android {\n    kotlinOptions {\n        jvmTarget = JavaVersion.VERSION_17.toString()\n    }\n\n'))

  const first = install(root)
  assert.deepEqual(first.todo, [])
  assert.doesNotMatch(r('android/app/build.gradle.kts'), /kotlinOptions/)
  assert.match(r('android/app/build.gradle.kts'), /\nkotlin \{\n    compilerOptions \{\n        jvmTarget = org\.jetbrains\.kotlin\.gradle\.dsl\.JvmTarget\.JVM_17\n    \}\n\}\n$/, 'kotlinOptions moved to compilerOptions, same JVM')
  assert.match(r('android/settings.gradle.kts'), /id\("org\.jetbrains\.kotlin\.android"\) version "2\.4\.0" apply false \/\/ firebase_analytics 13 \(play-services-measurement 24\)\n/, 'Kotlin 2.2.20 raised to the tested 2.4.0')
  const ads = walk(path.join(TEMPLATE, 'lib/ads'))
  assert.ok(ads.length === 9 && ads.every((f) => fs.existsSync(path.join(root, 'lib/ads', f))), 'every IPTV ads file copied')
  assert.match(r('lib/ads/ads_splash_utils.dart'), /static const remoteConfigKey = "my_app_v1";/, 'the Remote Config parameter is <pubspec name>_v1')
  assert.match(r('test/ads/ads_test.dart'), /package:my_app\/ads\/ads_variable\.dart/)
  assert.doesNotMatch(r('integration_test/ads_device_test.dart'), /common_flow_demo/)
  assert.match(r('android/app/src/main/kotlin/com/acme/my_app/NativeAds.kt'), /^package com\.acme\.my_app$/m)
  assert.match(r('android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt'), /^package com\.acme\.my_app$[\s\S]*"setToast"[\s\S]*"fullNativeAds",\s*NativeAdFull\([\s\S]*"bigNativeAds",\s*NativeAdBig\([\s\S]*"smallNativeAds",\s*NativeAdSmall\(/m)
  assert.ok(resFiles().length === 7 && resFiles().every((f) => fs.readFileSync(path.join(root, RES, f)).equals(fs.readFileSync(path.join(TEMPLATE, 'android/res', f)))), 'layouts, fonts (binary), rating style copied as they are')
  assert.equal(r(PROGUARD), read(path.join(TEMPLATE, 'android/proguard-rules.pro')))
  assert.match(r('android/app/src/main/AndroidManifest.xml'), /permission\.INTERNET[\s\S]*gms\.permission\.AD_ID[\s\S]*ads\.APPLICATION_ID" android:value="ca-app-pub-3940256099942544~3347511713"[\s\S]*<\/application>/)
  assert.match(r('android/app/src/main/res/values/strings.xml'), /facebook_client_token_placeholder/)
  assert.match(r('android/app/build.gradle.kts'), /\ndependencies \{\n    implementation\("com\.facebook\.android:facebook-android-sdk:19\.0\.0"\) \/\/ .*\n    implementation\("com\.intuit\.sdp:sdp-android:1\.0\.6"\) \/\/ .*\n\}\n/)
  assert.match(r('android/app/build.gradle.kts'), /        release \{\n            \/\/ IPTV_two .*\n            isMinifyEnabled = true\n            proguardFiles\(getDefaultProguardFile\("proguard-android-optimize\.txt"\), "proguard-rules\.pro"\)\n            \/\/ TODO/)
  assert.match(r('ios/Runner/AppDelegate.swift'), /\("smallNativeAds", NativeKind\.small\), \("bigNativeAds", \.big\), \("fullNativeAds", \.full\)[\s\S]*"nativeChannel"[\s\S]*class TemplateNativeAdFactory/)
  assert.match(r('ios/Runner/Info.plist'), /<key>GADApplicationIdentifier<\/key>\n\t<string>ca-app-pub-3940256099942544~1458002511<\/string>\n\t<key>NSUserTrackingUsageDescription<\/key>\n\t<string>This identifier will be used to deliver personalized ads to you\.<\/string>\n<\/dict>/)
  assert.equal(r('ios/Runner.xcodeproj/project.pbxproj'), 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;\nIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n')
  const pub = r('pubspec.yaml')
  for (const [n] of DEPS) assert.match(pub, new RegExp(`^  ${n}: .+ # `, 'm'), `${n} with its reason`)
  for (const [n, v] of DEPS) assert.match(pub, new RegExp(`^  ${n}: ${v.replaceAll('.', '\\.')} # `, 'm'), `${n} pinned to the tested ${v}`)
  assert.match(pub, /^dev_dependencies:\n  integration_test: .*\n    sdk: flutter\n/m)
  assert.match(pub, /^dependency_overrides:\n  # .*\n  webview_flutter_wkwebview: 3\.27\.2\n/m)
  assert.doesNotMatch(pub.split('dependency_overrides:')[0], /webview_flutter_wkwebview/, 'not a dependency: deps would call it unused')
  assert.match(pub, /^flutter:\n  assets:\n    - assets\/ads\/config\.json\n  uses-material-design: true/m)
  assert.equal(r('assets/ads/config.json'), read(path.join(TEMPLATE, 'assets/ads/config.json')), 'IPTV\'s config.json as it is')
  const prem = walk(path.join(TEMPLATE, 'lib/premium_core'))
  assert.ok(prem.length === 3 && prem.every((f) => fs.existsSync(path.join(root, 'lib/premium_core', f))), 'the Premium layer is installed by default')
  assert.match(r('test/premium_core/premium_rules_test.dart'), /package:my_app\/premium_core\/free_use_gate\.dart/)

  w('android/settings.gradle.kts', 'plugins {\n    id("org.jetbrains.kotlin.android") version "2.5.0" apply false\n}\n') // newer than the tested one: kept
  // second run: nothing added twice, nothing overwritten
  const snapshot = walk(root).map((f) => [f, r(f)])
  const second = install(root)
  assert.ok(second.done.every((l) => l.startsWith('kept ')), second.done.join('\n'))
  assert.deepEqual(walk(root).map((f) => [f, r(f)]), snapshot)
  assert.match(r('android/settings.gradle.kts'), /version "2\.5\.0" apply false/, 'a newer Kotlin plugin is kept')

  // an app whose native files were already changed: nothing guessed, exact steps returned
  fs.writeFileSync(path.join(root, 'android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt'), 'package com.acme.my_app\n\nclass MainActivity : FlutterFragmentActivity() { /* own code */ }\n')
  fs.writeFileSync(path.join(root, 'ios/Runner/AppDelegate.swift'), 'import Flutter\n// own code\n')
  const third = install(root)
  assert.equal(third.todo.length, 2)
  assert.match(third.todo[0], /MainActivity\.kt is not Flutter's default/)
  assert.match(third.todo[1], /AppDelegate\.swift is not Flutter's default/)
  fs.rmSync(root, { recursive: true, force: true })

  // an app from an earlier app-factory version (facebook-core 18, no sdp) with its own proguard-rules.pro and a release
  // block that names the default file only: the Facebook line replaced, IPTV's keep rules appended, proguard-rules.pro added
  const up = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-install-'))
  const wu = (f, t) => { fs.mkdirSync(path.dirname(path.join(up, f)), { recursive: true }); fs.writeFileSync(path.join(up, f), t) }
  fixture(wu)
  wu('android/app/build.gradle.kts', read(path.join(up, 'android/app/build.gradle.kts')).replace('signingConfig = signingConfigs.getByName("debug")\n',
    'signingConfig = signingConfigs.getByName("debug")\n            proguardFiles(getDefaultProguardFile("proguard-android.txt"))\n') +
    '\ndependencies {\n    implementation("com.facebook.android:facebook-core:18.0.0") // Facebook init (MainActivity)\n    implementation("androidx.core:core-ktx:1.13.1")\n}\n')
  wu(PROGUARD, '-keep class com.acme.** { *; }\n')
  assert.deepEqual(install(up).todo, [])
  const ug = read(path.join(up, 'android/app/build.gradle.kts'))
  assert.doesNotMatch(ug, /facebook-core/)
  assert.match(ug, /\ndependencies \{\n    implementation\("com\.facebook\.android:facebook-android-sdk:19\.0\.0"\) .*\n    implementation\("com\.intuit\.sdp:sdp-android:1\.0\.6"\) .*\n    implementation\("androidx\.core:core-ktx:1\.13\.1"\)\n\}/, 'the app\'s own dependency kept')
  assert.match(ug, /proguardFiles\(getDefaultProguardFile\("proguard-android-optimize\.txt"\), "proguard-rules\.pro"\)/, 'IPTV\'s R8 line added')
  assert.match(ug, /proguardFiles\(getDefaultProguardFile\("proguard-android\.txt"\)\)/, 'the app\'s own line kept')
  const up_ = read(path.join(up, PROGUARD))
  assert.ok(up_.startsWith('-keep class com.acme.** { *; }\n\n# IPTV_two proguard-rules.pro') && up_.endsWith(read(path.join(TEMPLATE, 'android/proguard-rules.pro'))), 'the app\'s rules kept, IPTV\'s appended')
  fs.rmSync(up, { recursive: true, force: true })

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
  o = shape((t) => t.replace('  cupertino_icons: ^1.0.8\n', '  cupertino_icons: ^1.0.8\n  firebase_analytics:\n    git: https://example.com/firebase_analytics.git\n'))
  assert.deepEqual(o.todo, ['pubspec.yaml: firebase_analytics is not from pub.dev (git/path): the pattern was tested with 13.0.0; set it, or keep it and say so'])
  assert.match(o.out, /^  firebase_analytics:\n    git: https:\/\/example\.com\/firebase_analytics\.git\n/m)

  // an app with no paid tier: no Premium layer, no purchase package (shared_preferences stays: lib/ads/ keeps the Remote
  // Config values in it), and changes() does not miss them
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-install-'))
  fixture((f, s) => { fs.mkdirSync(path.dirname(path.join(bare, f)), { recursive: true }); fs.writeFileSync(path.join(bare, f), s) })
  const plist = path.join(bare, 'ios/Runner/Info.plist')
  fs.writeFileSync(plist, read(plist).replaceAll('\n', '\r\n').replace('\r\n', '\n')) // CRLF, its first line LF
  assert.deepEqual(install(bare, { premium: false }).todo, [])
  assert.match(read(plist), /<key>NSUserTrackingUsageDescription<\/key>\r\n\t<string>/, 'CRLF Info.plist patched')
  assert.equal(read(plist).match(/[^\r]\n/g).length, 1, 'every untouched line keeps its ending')
  assert.ok(!read(plist).split('\n')[0].endsWith('\r'), 'the LF line is still LF')
  assert.ok(!fs.existsSync(path.join(bare, 'lib/premium_core')) && !fs.existsSync(path.join(bare, 'test/premium_core')))
  assert.doesNotMatch(read(path.join(bare, 'pubspec.yaml')), /^  purchases_flutter:/m)
  assert.match(read(path.join(bare, 'pubspec.yaml')), /^  shared_preferences: 2\.5\.6 # /m)
  assert.ok(![...templateFiles(bare).keys()].some((f) => f.includes('premium_core')), 'P1 does not expect the Premium files')
  fs.rmSync(bare, { recursive: true, force: true })
  return 'selftest ok'
}

const rawArgv = process.argv.slice(2)
const ri = rawArgv.indexOf('--replaced') // --replaced a,b,c: the app's own ads layer (changes / verify)
const replacedArg = ri < 0 ? [] : (rawArgv[ri + 1] || '').split(',').map((f) => f.trim()).filter(Boolean)
const argv = ri < 0 ? rawArgv : rawArgv.filter((_, i) => i !== ri && i !== ri + 1)
if (argv[0] === 'selftest') console.log(`${selftest()}\n${changesSelftest()}\n${replacedSelftest()}\n${verifySelftest()}\n${resetSelftest()}\n${demoSelftest()}`)
else if (argv[0] === 'reset' && argv.length === 2) {
  const { ok, text } = reset(path.resolve(argv[1]))
  console.log(text); if (!ok) process.exit(1)
}
else if (argv[0] === 'verify' && argv.length === 3) {
  const { ok, text } = verify(path.resolve(argv[1]), argv[2], { replaced: replacedArg })
  console.log(text); if (!ok) process.exit(1)
}
else if (argv[0] === 'changes' && (argv.length === 3 || argv.length === 4)) {
  const out = path.resolve(argv[3] || path.join(argv[1], REPORT))
  const r = changes(path.resolve(argv[1]), argv[2], replacedArg)
  fs.writeFileSync(out, r)
  console.log(`${out}\n${r.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- `')).slice(0, 6).join('\n')}`)
  const fails = r.split('\n').filter((l) => l.startsWith('- **FAIL**'))
  if (fails.length) { console.error(`\n${fails.join('\n')}\n(evidence under each in ${REPORT})`); process.exit(1) }
} else if ((argv.length === 1 || (argv.length === 2 && argv[1] === '--no-premium')) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { done, todo } = install(path.resolve(argv[0]), { premium: argv[1] !== '--no-premium' })
  console.log(done.join('\n'))
  if (todo.length) { console.error(`\nNOT DONE — add these, then run again:\n- ${todo.join('\n- ')}`); process.exit(1) }
  console.log('\nads pattern installed. Next: flutter pub get; wire it as skills/flutter-ads/SKILL.md section 3 says.')
} else if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { console.error('usage: ads-install.mjs <project> [--no-premium] | reset <project> | changes <project> <base commit> [<out file>] [--replaced a,b] | verify <project> <base commit> [--replaced a,b] | selftest'); process.exit(2) }
