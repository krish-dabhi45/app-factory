#!/usr/bin/env node
// Installs the ads + Remote Config pattern (skills/flutter-ads/SKILL.md) into a Flutter app — the only way
// app-factory adds ads. Copies templates/flutter/ads/ (the tested common_flow_demo files) and patches the native
// project; never overwrites a file that exists (a second run reports "kept").
//   node ads-install.mjs <project>    → what it added/patched; exit 1 with the exact lines when a native file is not
//                                       Flutter's default and has no ad factory yet (the caller adds them, then reruns)
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

export function install(root) {
  const done = [], todo = []
  const at = (...p) => path.join(root, ...p)
  const { mainPath, fix } = ids(root)
  if (!mainPath) throw new Error('no android/app/src/main/**/MainActivity.kt (Kotlin) — create the app with flutter create')
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

// Every file the template puts into this app (its path in the app → the text install() writes there).
function templateFiles(root) {
  const { mainPath, fix } = ids(root)
  const m = new Map()
  for (const dir of ['lib', 'test', 'integration_test', 'assets'])
    for (const f of walk(path.join(TEMPLATE, dir))) m.set(`${dir}/${f}`, fix(read(path.join(TEMPLATE, dir, f))))
  if (mainPath) for (const f of ['NativeAdStyle.kt', 'SmallNativeAdFactory.kt'])
    m.set(path.relative(root, path.join(path.dirname(mainPath), f)), fix(read(path.join(TEMPLATE, 'android', f))))
  m.set('android/app/src/main/res/layout/native_small.xml', read(path.join(TEMPLATE, 'android/native_small.xml')))
  return m
}

const REPORT = 'ADS_CHANGES.md'
// Files `flutter pub get` rewrites: counted, never printed.
const GENERATED = /(^|\/)(pubspec\.lock|Podfile\.lock|Package\.resolved|GeneratedPluginRegistrant\.\w+|generated_plugins?\.\w+)$/
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

  const fromTpl = sorted.filter(([f, x]) => x.status === 'A' && tpl.has(f))
  const differ = fromTpl.filter(([f]) => read(path.join(root, f)) !== tpl.get(f))
  const own = sorted.filter(([f, x]) => !(x.status === 'A' && tpl.has(f)) && !GENERATED.test(f))
  const generated = sorted.filter(([f]) => GENERATED.test(f))

  // the ads layer's public names, from the template itself
  const api = [...new Set([...tpl].filter(([f]) => f.startsWith('lib/google_ads_material/'))
    .flatMap(([, s]) => [...s.matchAll(/^(?:abstract )?(?:class|enum|mixin) ([A-Z]\w*)/gm)].map((m) => m[1])))]
  const uses = []
  const lib = path.join(root, 'lib')
  if (fs.existsSync(lib)) for (const f of walk(lib).filter((f) => f.endsWith('.dart') && !f.startsWith('google_ads_material/')).sort())
    read(path.join(lib, f)).split('\n').forEach((l, i) => { if (new RegExp(`\\b(${api.join('|')})\\b`).test(l)) uses.push(`lib/${f}:${i + 1}: \`${l.trim()}\``) })

  const tests = own.filter(([f]) => /^(test|integration_test)\//.test(f)).flatMap(([f, x]) =>
    diffOf(f, x).split('\n').filter((l) => l.startsWith('+')).flatMap((l) => [...l.matchAll(TEST_NAME)].map((m) => `${f}: ${m[2].replace(/\\(.)/g, '$1')}`)))

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
    '',
    `## Installed from the template`,
    '',
    ...fromTpl.map(([f]) => `- \`${f}\`${differ.some(([d]) => d === f) ? ' — **differs from the template**' : ''}`),
    ...differ.flatMap(([f]) => {
      const t = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ads-tpl-')), path.basename(f)); fs.writeFileSync(t, tpl.get(f))
      let d = ''; try { git('diff', '--no-index', t, path.join(root, f)) } catch (e) { d = e.stdout }
      fs.rmSync(path.dirname(t), { recursive: true, force: true })
      return ['', `### \`${f}\` against the template`, '', block(d.split('\n').filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).join('\n').trimEnd())]
    }),
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

function changesSelftest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-changes-'))
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s) }
  const g = (...a) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' })
  fixture(w)
  w('lib/main.dart', "import 'package:flutter/material.dart';\n\nvoid main() => runApp(const MaterialApp(home: Text('home')));\n")
  w('lib/untouched.dart', '// not part of the ads work\n')
  g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'app before ads')
  const base = g('rev-parse', 'HEAD').trim()

  assert.deepEqual(install(root).todo, [])
  // the wiring: a banner on home, a test, one deliberate edit of an installed file, and something pub get rewrites
  w('lib/main.dart', "import 'package:flutter/material.dart';\nimport 'package:my_app/google_ads_material/banner_ad_widget.dart';\n\nvoid main() => runApp(const MaterialApp(home: Column(children: [Text('home'), BannerAdWidget()])));\n")
  w('test/ads_wiring_test.dart', "void main() {\n  testWidgets('AC47 home shows the banner', (t) async {});\n  test('AC48 another user\\'s profile', () {});\n}\n")
  fs.appendFileSync(path.join(root, 'lib/google_ads_material/ad_flags.dart'), '// app addition\n')
  w('pubspec.lock', 'packages: {}\n')
  g('add', 'lib/main.dart'); g('commit', '-q', '-m', 'part of the ads work committed') // committed and uncommitted both count

  const r = changes(root, base)
  const tplCount = [...templateFiles(root).keys()].length
  assert.match(r, new RegExp(`- ${tplCount} files installed from the template — \\*\\*1 differ from it\\*\\*`))
  assert.match(r, /- `lib\/google_ads_material\/ad_flags\.dart` — \*\*differs from the template\*\*/)
  assert.match(r, /### `lib\/google_ads_material\/ad_flags\.dart` against the template\n\n```diff\n[\s\S]*\+\/\/ app addition/)
  assert.match(r, /\| `lib\/main\.dart` \| changed \| 2 \| 1 \|/)
  assert.match(r, /### `lib\/main\.dart`\n\n```diff\n[\s\S]*\+import 'package:my_app\/google_ads_material\/banner_ad_widget\.dart';[\s\S]*-void main\(\) => runApp\(const MaterialApp\(home: Text\('home'\)\)\);/)
  assert.match(r, /\| `pubspec\.yaml` \| changed \|/)
  assert.match(r, /\| `android\/app\/src\/main\/AndroidManifest\.xml` \| changed \|/)
  assert.match(r, /\| `test\/ads_wiring_test\.dart` \| added \| 4 \| 0 \|/)
  assert.match(r, /- lib\/main\.dart:4: `void main\(\) => runApp\(const MaterialApp\(home: Column\(children: \[Text\('home'\), BannerAdWidget\(\)\]\)\)\);`/)
  assert.match(r, /- 1 lines in the app's own code use the ads layer/, 'the import line names no class; lib/google_ads_material/ itself is not counted')
  assert.match(r, /## Tests added\n\n- test\/ads_wiring_test\.dart: AC47 home shows the banner\n- test\/ads_wiring_test\.dart: AC48 another user's profile\n/, 'an escaped quote does not cut the name')
  assert.match(r, /## Regenerated by flutter pub get\n\n- `pubspec\.lock` \(\+1 −0\)/)
  assert.doesNotMatch(r, /### `pubspec\.lock`/, 'generated files are not printed')
  assert.doesNotMatch(r, /untouched\.dart/, 'a file the ads work did not touch is not listed')
  assert.doesNotMatch(r, /### `lib\/google_ads_material\/banner_ad_widget\.dart`/, 'an identical template file is listed, not printed')
  w(REPORT, r)
  assert.equal(changes(root, base), r, 'the report does not list itself')
  g('add', '-A'); g('commit', '-q', '-m', 'the rest of the ads work')
  assert.equal(changes(root, base), r, 'the same report before and after the commit')
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
if (argv[0] === 'selftest') console.log(`${selftest()}\n${changesSelftest()}`)
else if (argv[0] === 'changes' && (argv.length === 3 || argv.length === 4)) {
  const out = path.resolve(argv[3] || path.join(argv[1], REPORT))
  const r = changes(path.resolve(argv[1]), argv[2])
  fs.writeFileSync(out, r)
  console.log(`${out}\n${r.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- `')).slice(0, 5).join('\n')}`)
} else if (argv.length === 1 && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { done, todo } = install(path.resolve(argv[0]))
  console.log(done.join('\n'))
  if (todo.length) { console.error(`\nNOT DONE — add these, then run again:\n- ${todo.join('\n- ')}`); process.exit(1) }
  console.log('\nads pattern installed. Next: flutter pub get; wire it as skills/flutter-ads/SKILL.md section 3 says.')
} else if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { console.error('usage: ads-install.mjs <project> | changes <project> <base commit> [<out file>] | selftest'); process.exit(2) }
