#!/usr/bin/env node
// Release readiness of a Flutter app, from its files only (no build, no device).
//   node release-check.mjs [<app dir>]   — prints two lists; exits 1 when "Fix in code" has an item
//   node release-check.mjs selftest
// Fix in code (the run fixes these):
//   C1 every package lib/ imports is declared under dependencies: in pubspec.yaml
//   C2 no Android/iOS permission without a package in pubspec.yaml that uses it
//   C3 restorePurchases() only inside lib/premium_core/ (PremiumStore.restore(), called from a user's tap); in lib/ads/ (the
//      team's ads code, its fetchPurchaseN on every launch) it is owner item O7, not changed
//   C4 an app with a paywall (loadPlans() called) also has a restore() call and the words Terms and Privacy on screen
//      (anywhere in lib/: in an MVVM app the view model loads and restores, the view shows the links)
// Owner before store release (need the owner's accounts; listed, never fail the run):
//   O1 store IDs still com.example · O2 release signed with the debug key · O3 Google's sample AdMob App ID
//   O4 no Firebase config file (Remote Config, Analytics, Crashlytics run on the defaults) · O5 cleartext HTTP allowed
//   O6 Google's demo ad units in config.json · O7 restorePurchases() on every launch in lib/ads/ (the team's)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

// permission → the packages that use it; permission_handler covers every one
const PERMISSIONS = [
  ['location', /ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION|NSLocation\w*UsageDescription/, ['geolocator', 'location', 'google_maps_flutter', 'mapbox_maps_flutter', 'flutter_background_geolocation']],
  ['camera', /android\.permission\.CAMERA|NSCameraUsageDescription/, ['camera', 'image_picker', 'mobile_scanner', 'qr_code_scanner', 'flutter_barcode_scanner']],
  ['microphone', /RECORD_AUDIO|NSMicrophoneUsageDescription/, ['record', 'camera', 'speech_to_text', 'flutter_sound', 'audio_waveforms']],
  ['contacts', /READ_CONTACTS|NSContactsUsageDescription/, ['flutter_contacts', 'contacts_service']],
]
const SAMPLE_ADMOB = 'ca-app-pub-3940256099942544~'

const walk = (d) => !fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
// files written on Windows have CRLF line ends: read every file with LF
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const text = (root, f) => fs.existsSync(path.join(root, f)) ? read(path.join(root, f)) : ''
const code = (l) => !/^\s*(\/\/|\/?\*)/.test(l)

// the package names under one top-level pubspec section
function section(pubspec, name) {
  const m = pubspec.match(new RegExp(`^${name}:\\n((?:[ \\t#].*\\n|\\n)*)`, 'm'))
  return new Set(m ? [...m[1].matchAll(/^ {2}([a-z0-9_]+):/gm)].map((x) => x[1]) : [])
}

export function check(root) {
  const pub = text(root, 'pubspec.yaml')
  const app = (pub.match(/^name:\s*(\S+)/m) || [])[1]
  const deps = section(pub, 'dependencies')
  const dart = walk(path.join(root, 'lib')).filter((f) => f.endsWith('.dart')).map((f) => [path.relative(root, f), read(f).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n')])
  const where = (re, files = dart) => files.flatMap(([f, ls]) => ls.flatMap((l, i) => code(l) && re.test(l) ? [`${f}:${i + 1}`] : []))
  const fix = [], owner = []

  for (const [f, ls] of dart) ls.forEach((l, i) => {
    for (const m of l.matchAll(/^\s*(?:import|export)\s+['"]package:([a-z0-9_]+)\//g)) {
      if (m[1] !== app && m[1] !== 'flutter' && !deps.has(m[1])) fix.push(`C1 ${f}:${i + 1} imports package:${m[1]}, which pubspec.yaml does not declare under dependencies:`)
    }
  })

  const manifest = text(root, 'android/app/src/main/AndroidManifest.xml'), plist = text(root, 'ios/Runner/Info.plist')
  if (!deps.has('permission_handler')) for (const [name, re, pkgs] of PERMISSIONS) {
    const found = [['AndroidManifest.xml', manifest], ['Info.plist', plist]].filter(([, s]) => re.test(s)).map(([n]) => n)
    if (found.length && !pkgs.some((p) => deps.has(p))) fix.push(`C2 ${name} permission in ${found.join(' and ')}, but no package that uses it (${pkgs.join(', ')}): remove it — stores reject unused permissions`)
  }

  // lib/ads/ is the team's ads code (skills/flutter-ads): its fetchPurchaseN restores on every launch, as the team's app does
  // does — listed for the owner, not changed by the run
  const outside = dart.filter(([f]) => !f.startsWith('lib/premium_core/') && !f.startsWith('lib/ads/'))
  for (const w of where(/\brestorePurchases\s*\(/, outside)) fix.push(`C3 ${w} calls restorePurchases(): use PremiumStore.instance.restore() from the Restore button only`)
  for (const w of where(/\brestorePurchases\s*\(/, dart.filter(([f]) => f.startsWith('lib/ads/')))) owner.push(`O7 ${w} restores purchases on every launch (the team's fetchPurchaseN, lib/ads as installed): App Review may ask for restore to happen only from a Restore button`)

  const paywall = where(/\.loadPlans\s*\(/, outside)
  if (paywall.length) {
    const all = outside.flatMap(([, ls]) => ls.filter(code)).join('\n')
    const missing = [['a restore() call', /\.restore\s*\(/], ['a "Terms of Use" text', /['"][^'"\n]*terms[^'"\n]*['"]/i], ['a "Privacy Policy" text', /['"][^'"\n]*privacy[^'"\n]*['"]/i]]
      .filter(([, re]) => !re.test(all)).map(([n]) => n)
    if (missing.length) fix.push(`C4 the app has a paywall (${paywall.join(', ')}) but lib/ has no ${missing.join(', ')} (App Store 3.1.1 restore; links required for subscriptions)`)
  }

  const gradle = text(root, 'android/app/build.gradle.kts') || text(root, 'android/app/build.gradle')
  const pbx = text(root, 'ios/Runner.xcodeproj/project.pbxproj')
  const ids = [...new Set([...(gradle.match(/applicationId\s*=?\s*"com\.example\.[^"]*"/g) || []),
    ...[...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?(com\.example\.[\w.-]+)"?;/g)].map((m) => m[1]).filter((id) => !id.endsWith('.RunnerTests'))])]
  if (ids.length) owner.push(`O1 store IDs still com.example (${ids.join(', ')}): set the IDs registered in Play Console / App Store Connect`)
  if (/release\s*\{[^}]*signingConfig\s*=?\s*signingConfigs\.(getByName\("debug"\)|debug)/.test(gradle)) owner.push('O2 the Android release build is signed with the debug key: add the upload keystore (key.properties) and a release signingConfig')
  const sample = [['AndroidManifest.xml', manifest], ['Info.plist', plist]].filter(([, s]) => s.includes(SAMPLE_ADMOB)).map(([n]) => n)
  if (sample.length) owner.push(`O3 Google's sample AdMob App ID in ${sample.join(' and ')}: set the app's own App ID from AdMob (ad unit ids go in Remote Config)`)
  if (deps.has('firebase_core')) {
    const missing = [['android/app/google-services.json', !!manifest], ['ios/Runner/GoogleService-Info.plist', !!plist]].filter(([f, has]) => has && !fs.existsSync(path.join(root, f))).map(([f]) => f)
    if (missing.length && !fs.existsSync(path.join(root, 'lib/firebase_options.dart'))) owner.push(`O4 no ${missing.join(' or ')}: Remote Config, Analytics and Crashlytics run on the defaults there — add the files from the Firebase console`)
  }
  const clear = [['AndroidManifest.xml', /usesCleartextTraffic="true"/.test(manifest)], ['Info.plist', /NSAllowsArbitraryLoads<\/key>\s*<true\/>/.test(plist)]].filter(([, on]) => on).map(([n]) => n)
  // config.json (the installer's; remote_config.json from app-factory 0.41–0.43) = the value to publish as the Remote Config
  // parameter (not bundled): a release build serves the ids Remote Config gives it, and Google's demo ones show test ads
  const cfgName = ['config.json', 'remote_config.json'].find((f) => text(root, f)) || 'config.json'
  let defaults = {}; try { defaults = JSON.parse(text(root, cfgName) || '{}') } catch {}
  const demo = Object.entries(defaults).filter(([, v]) => String(v).startsWith(SAMPLE_ADMOB.slice(0, -1) + '/')).map(([k]) => k)
  if (demo.length) owner.push(`O6 Google's demo ad units in ${cfgName} (${demo.join(', ')}): published as the Remote Config parameter, a release build shows Google test ads from them, which earn nothing — put the app's own ad unit ids there and publish it`)
  if (clear.length) owner.push(`O5 cleartext HTTP allowed in ${clear.join(' and ')}: keep only if the app must load http:// content, and say why in App Review notes`)
  return { fix, owner }
}

function report({ fix, owner }) {
  return [`Fix in code (${fix.length})`, ...fix.map((l) => `- ${l}`), '', `Owner before store release (${owner.length})`, ...owner.map((l) => `- ${l}`)].join('\n')
}

function selftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-check-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  try {
    // an app like the 2026-10-23 audit's: com.example, debug signing, sample App ID, location with no location package,
    // url_launcher imported but not declared, restore on launch, a paywall without Restore or Terms
    w('pubspec.yaml', 'name: my_app\ndependencies:\n  flutter:\n    sdk: flutter\n#  geolocator: ^14.0.1\n  firebase_core: 5.0.0 # Remote Config\n  purchases_flutter: 10.16.0\n\ndev_dependencies:\n  url_launcher: ^6.0.0\n')
    w('android/app/build.gradle.kts', 'android {\n    defaultConfig {\n        applicationId = "com.example.my_app"\n    }\n    buildTypes {\n        release {\n            signingConfig = signingConfigs.getByName("debug")\n        }\n    }\n}\n')
    w('android/app/src/main/AndroidManifest.xml', `<manifest>\n<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n<application android:usesCleartextTraffic="true">\n<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${SAMPLE_ADMOB}3347511713"/>\n</application>\n</manifest>\n`)
    w('ios/Runner/Info.plist', '<dict>\n<key>NSLocationWhenInUseUsageDescription</key>\n<string>x</string>\n</dict>\n')
    w('ios/Runner.xcodeproj/project.pbxproj', 'PRODUCT_BUNDLE_IDENTIFIER = com.example.myApp;\nPRODUCT_BUNDLE_IDENTIFIER = com.example.myApp.RunnerTests;\n')
    w('lib/main.dart', "import 'package:flutter/material.dart';\nimport 'package:url_launcher/url_launcher.dart';\nimport 'package:my_app/ui/paywall.dart';\n// Purchases.restorePurchases(); in a comment does not count\nFuture<void> main() async {\n  await Purchases.restorePurchases();\n}\n/* nor in a block comment:\n    await Purchases.restorePurchases();\n*/\n")
    w('lib/ui/paywall.dart', "void init() => PremiumStore.instance.loadPlans();\nfinal link = Text('Privacy Policy');\n")
    w('lib/premium_core/premium_store.dart', 'final i = Purchases.restorePurchases();\n')
    let r = check(root)
    assert.deepEqual(r.fix.map((l) => l.slice(0, 2)), ['C1', 'C2', 'C3', 'C4'], report(r))
    assert.match(r.fix[0], /lib\/main\.dart:2 imports package:url_launcher/)
    assert.match(r.fix[1], /location permission in AndroidManifest\.xml and Info\.plist/)
    assert.match(r.fix[2], /lib\/main\.dart:6 calls restorePurchases/, 'the comment on line 4 and premium_core are not flagged')
    assert.match(r.fix[3], /paywall \(lib\/ui\/paywall\.dart:1\) but lib\/ has no a restore\(\) call, a "Terms of Use" text \(/, 'Privacy Policy is there')
    w('config.json', '{"interSplash": "ca-app-pub-3940256099942544/1033173712", "banner": "11", "nativeHome": "ca-app-pub-1234567890123456/111"}')
    w('lib/ads/ads_splash_utils.dart', 'fetchPurchaseN() async {\n  final customerInfo1 = await Purchases.restorePurchases();\n}\n') // the team's
    r = check(root)
    assert.deepEqual(r.fix.map((l) => l.slice(0, 2)), ['C1', 'C2', 'C3', 'C4'], 'lib/ads/ is not a code fix')
    assert.deepEqual(r.owner.map((l) => l.slice(0, 2)), ['O7', 'O1', 'O2', 'O3', 'O4', 'O6', 'O5'], report(r))
    assert.match(r.owner[0], /O7 lib\/ads\/ads_splash_utils\.dart:2 restores purchases on every launch/)
    assert.match(r.owner[5], /demo ad units in config\.json \(interSplash\)/, '"11" and an own id are not flagged')
    fs.rmSync(path.join(root, 'lib/ads'), { recursive: true })
    assert.match(r.owner[1], /com\.example\.my_app.*com\.example\.myApp\)/)
    assert.doesNotMatch(r.owner[1], /RunnerTests/)
    // the same app made ready: every list empty
    w('pubspec.yaml', 'name: my_app\ndependencies:\n  flutter:\n    sdk: flutter\n  firebase_core: 5.0.0\n  purchases_flutter: 10.16.0\n  url_launcher: 6.3.0\n  geolocator: 14.0.1\n')
    w('android/app/build.gradle.kts', 'android {\n    defaultConfig {\n        applicationId = "com.acme.notes"\n    }\n    buildTypes {\n        release {\n            signingConfig = signingConfigs.getByName("release")\n        }\n    }\n}\n')
    w('android/app/src/main/AndroidManifest.xml', '<manifest>\n<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n<application>\n<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-1234567890123456~1234567890"/>\n</application>\n</manifest>\n')
    w('ios/Runner.xcodeproj/project.pbxproj', 'PRODUCT_BUNDLE_IDENTIFIER = com.acme.notes;\n')
    w('lib/main.dart', "import 'package:flutter/material.dart';\nimport 'package:url_launcher/url_launcher.dart';\n")
    // MVVM: the view model loads and restores, the view shows the links
    w('lib/ui/paywall.dart', "void init() => PremiumStore.instance.loadPlans();\nvoid r() => PremiumStore.instance.restore();\n")
    w('lib/ui/paywall_view.dart', "final links = [Text('Terms of Use'), Text('Privacy Policy')];\n")
    w('android/app/google-services.json', '{}'); w('ios/Runner/GoogleService-Info.plist', '<plist/>')
    w('config.json', '{"interSplash": "ca-app-pub-1234567890123456/222", "banner": "11"}')
    r = check(root)
    assert.deepEqual(r, { fix: [], owner: [] }, report(r))
    // a pubspec saved with CRLF line ends parses the same
    w('pubspec.yaml', 'name: my_app\r\ndependencies:\r\n  flutter:\r\n    sdk: flutter\r\n  firebase_core: 5.0.0\r\n  purchases_flutter: 10.16.0\r\n  url_launcher: 6.3.0\r\n  geolocator: 14.0.1\r\n')
    assert.deepEqual(check(root).fix, [])
    // permission_handler can request any permission: no C2
    w('pubspec.yaml', 'name: my_app\ndependencies:\n  permission_handler: 11.0.0\n  url_launcher: 6.3.0\n')
    assert.deepEqual(check(root).fix, [])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
  return 'selftest ok'
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const a = process.argv[2]
    if (a === 'selftest') console.log(selftest())
    else { const r = check(path.resolve(a || '.')); console.log(report(r)); if (r.fix.length) process.exit(1) }
  } catch (e) { console.error(`release-check: ${e.message}`); process.exit(1) }
}
