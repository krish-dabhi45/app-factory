#!/usr/bin/env node
// Installs the ads + Remote Config pattern (skills/flutter-ads/SKILL.md) into a Flutter app — the only way
// app-factory adds ads. Copies templates/flutter/ads/ (the tested common_flow_demo files) and patches the native
// project; never overwrites a file that exists (a second run reports "kept").
//   node ads-install.mjs <project>    → what it added/patched; exit 1 with the exact lines when a native file is not
//                                       Flutter's default and has no ad factory yet (the caller adds them, then reruns)
//   node ads-install.mjs selftest
// Template identifiers replaced: `package:common_flow_demo/` → `package:<pubspec name>/`,
// `package com.demo.common_flow_demo` → the package of the app's MainActivity.kt.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'flutter', 'ads')
// Google's sample App IDs (developers.google.com/admob/{android,ios}/quick-start): debug builds work; the owner replaces them
const SAMPLE_APP_ID = { android: 'ca-app-pub-3940256099942544~3347511713', ios: 'ca-app-pub-3940256099942544~1458002511' }
const DEPS = [
  ['google_mobile_ads', '^9.1.0', 'ads (google_ads_material/)'],
  ['firebase_core', '^5.0.0', 'Remote Config + ad_impression (google_ads_material/)'],
  ['firebase_remote_config', '^7.0.0', 'ads/flow values from one JSON key (google_ads_material/remote_config.dart)'],
  ['firebase_analytics', '^13.0.0', 'ad revenue event ad_impression (google_ads_material/ad_impression.dart)'],
  ['shimmer', '^4.0.0', 'native ad loading shimmer (google_ads_material/native_ad_widget.dart)'],
]
// google_mobile_ads 9.1.0's Package.swift says iOS 13; webview_flutter_wkwebview 3.27.1+ says iOS 15 → Swift Package Manager
// refuses the pair. An override, not a dependency: no Dart file imports it, and `pipeline.mjs deps` (which the gate and the
// optimise step run) fails on — and removes — an unimported dependency.
const PIN = 'dependency_overrides:\n  # iOS (Swift Package Manager): google_mobile_ads 9.1.0 declares iOS 13, webview_flutter_wkwebview 3.27.1+ iOS 15.\n  webview_flutter_wkwebview: ">=3.23.0 <3.27.1"\n'

const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name))])
const read = (f) => fs.readFileSync(f, 'utf8')

export function install(root) {
  const done = [], todo = []
  const at = (...p) => path.join(root, ...p)
  if (!fs.existsSync(at('pubspec.yaml'))) throw new Error(`no pubspec.yaml in ${root}`)
  const name = (read(at('pubspec.yaml')).match(/^name:\s*(\S+)/m) || [])[1]
  const main = walk(at('android/app/src/main')).find((f) => /(^|\/)MainActivity\.kt$/.test(f))
  if (!main) throw new Error('no android/app/src/main/**/MainActivity.kt (Kotlin) — create the app with flutter create')
  const mainPath = at('android/app/src/main', main)
  const pkg = (read(mainPath).match(/^package\s+([\w.]+)/m) || [])[1]
  const fix = (s) => s.replaceAll('package:common_flow_demo/', `package:${name}/`).replaceAll('package com.demo.common_flow_demo', `package ${pkg}`)
  const put = (to, text) => {
    if (fs.existsSync(to)) return done.push(`kept ${path.relative(root, to)} (exists)`)
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, text); done.push(`added ${path.relative(root, to)}`)
  }
  const patch = (rel, test, edit, what) => {
    const f = at(rel); const s = read(f)
    if (test(s)) return
    const n = edit(s); if (n === s) throw new Error(`${rel}: could not ${what}`)
    fs.writeFileSync(f, n); done.push(`${rel}: ${what}`)
  }

  // Dart: the ads layer, its tests, the defaults JSON
  for (const dir of ['lib', 'test', 'integration_test', 'assets'])
    for (const f of walk(path.join(TEMPLATE, dir))) put(at(dir, f), fix(read(path.join(TEMPLATE, dir, f))))

  // pubspec: dependencies (with the reason, flutter-app L11), integration_test, the asset
  patch('pubspec.yaml', (s) => DEPS.every(([n]) => new RegExp(`^  ${n}:`, 'm').test(s)),
    (s) => s.replace(/^dependencies:\n  flutter:\n    sdk: flutter\n/m, (m) => m + DEPS.filter(([n]) => !new RegExp(`^  ${n}:`, 'm').test(s)).map(([n, v, why]) => `  ${n}: ${v} # ${why}\n`).join('')),
    'add the ads packages')
  patch('pubspec.yaml', (s) => /^  integration_test:/m.test(s),
    (s) => s.replace(/^dev_dependencies:\n/m, (m) => `${m}  integration_test: # device ad tests (integration_test/ads_device_test.dart)\n    sdk: flutter\n`),
    'add integration_test')
  patch('pubspec.yaml', (s) => /^  webview_flutter_wkwebview:/m.test(s),
    (s) => /^dependency_overrides:\n/m.test(s) ? s.replace(/^dependency_overrides:\n/m, PIN) : `${s.trimEnd()}\n\n${PIN}`,
    'pin webview_flutter_wkwebview <3.27.1 (iOS build)')
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
    (s) => s.replace(/minSdk\s*=\s*\d+/, 'minSdk = 24 // google_mobile_ads 9.1.0'), 'minSdk 24')

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
  const pbx = 'ios/Runner.xcodeproj/project.pbxproj'
  if (fs.existsSync(at(pbx))) patch(pbx, (s) => ![...s.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].some((m) => parseFloat(m[1]) < 15),
    (s) => s.replace(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g, (m, v) => parseFloat(v) < 15 ? 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;' : m), 'iOS deployment target 15.0')

  return { done, todo }
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-install-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  // the files of a fresh `flutter create --platforms ios,android` (Flutter 3.47.7), trimmed to what the installer reads
  w('pubspec.yaml', 'name: my_app\nenvironment:\n  sdk: ^3.13.5\ndependencies:\n  flutter:\n    sdk: flutter\n  cupertino_icons: ^1.0.8\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n')
  w('android/app/src/main/kotlin/com/acme/my_app/MainActivity.kt', 'package com.acme.my_app\n\nimport io.flutter.embedding.android.FlutterActivity\n\nclass MainActivity : FlutterActivity()\n')
  w('android/app/src/main/AndroidManifest.xml', '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="my_app">\n        <activity android:name=".MainActivity"/>\n    </application>\n</manifest>\n')
  w('android/app/build.gradle.kts', 'android {\n    defaultConfig {\n        minSdk = flutter.minSdkVersion\n    }\n}\n\nflutter {\n    source = "../.."\n}\n')
  w('ios/Runner/AppDelegate.swift', `import Flutter\nimport UIKit\n\n@main\n@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {\n  override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  ) -> Bool {\n    return super.application(application, didFinishLaunchingWithOptions: launchOptions)\n  }\n\n  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {\n    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)\n  }\n}\n`)
  w('ios/Runner/Info.plist', '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleName</key>\n\t<string>my_app</string>\n</dict>\n</plist>\n')
  w('ios/Runner.xcodeproj/project.pbxproj', 'IPHONEOS_DEPLOYMENT_TARGET = 13.0;\nIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n')
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
  assert.match(r('ios/Runner/Info.plist'), /<key>GADApplicationIdentifier<\/key>\n\t<string>ca-app-pub-3940256099942544~1458002511<\/string>\n<\/dict>/)
  assert.equal(r('ios/Runner.xcodeproj/project.pbxproj'), 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;\nIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n')
  const pub = r('pubspec.yaml')
  for (const [n] of DEPS) assert.match(pub, new RegExp(`^  ${n}: .+ # `, 'm'), `${n} with its reason`)
  assert.match(pub, /^dev_dependencies:\n  integration_test: .*\n    sdk: flutter\n/m)
  assert.match(pub, /^dependency_overrides:\n  # .*\n  webview_flutter_wkwebview: ">=3\.23\.0 <3\.27\.1"\n/m)
  assert.doesNotMatch(pub.split('dependency_overrides:')[0], /webview_flutter_wkwebview/, 'not a dependency: deps would call it unused')
  assert.match(pub, /^flutter:\n  assets:\n    - assets\/remote_config_default\.json\n  uses-material-design: true/m)
  assert.deepEqual(Object.keys(JSON.parse(r('assets/remote_config_default.json'))).filter((k) => /credit/.test(k)), [], 'no demo credit keys')

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
  return 'selftest ok'
}

const argv = process.argv.slice(2)
if (argv[0] === 'selftest') console.log(selftest())
else if (argv.length === 1 && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { done, todo } = install(path.resolve(argv[0]))
  console.log(done.join('\n'))
  if (todo.length) { console.error(`\nNOT DONE — add these, then run again:\n- ${todo.join('\n- ')}`); process.exit(1) }
  console.log('\nads pattern installed. Next: flutter pub get; wire it as skills/flutter-ads/SKILL.md section 3 says.')
} else if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { console.error('usage: ads-install.mjs <project> | selftest'); process.exit(2) }
