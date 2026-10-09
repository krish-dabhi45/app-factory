#!/usr/bin/env node
// Points the build-app workflow at this machine: writes the default plugin folder, Flutter, Android SDK, Java and
// Android system image into workflows/build-app.js (a workflow script cannot look them up itself). Run by install.sh.
//   node configure.mjs            — find them, write them, print what was found (a WARNING for each one missing)
//   node configure.mjs selftest
// Found from: the plugin's own folder; flutter on PATH; ANDROID_HOME / ANDROID_SDK_ROOT, else Android Studio's default
// SDK folder; JAVA_HOME, else (macOS) Homebrew's openjdk@17; the system image matching this CPU (arm64 or x86_64).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const WF = path.join(ROOT, 'workflows', 'build-app.js')
const fwd = (p) => p.replace(/\\/g, '/') // Node and Git Bash both accept C:/… on Windows

export function onPath(name, env = process.env, platform = process.platform) {
  const exts = platform === 'win32' ? ['.bat', '.cmd', '.exe', ''] : ['']
  for (const d of (env.PATH || env.Path || '').split(path.delimiter)) for (const e of exts) {
    const f = path.join(d, name + e)
    try { if (fs.statSync(f).isFile()) return fs.realpathSync(f) } catch { /* not here */ }
  }
  return null
}

export function find(env = process.env, platform = process.platform, arch = process.arch, home = os.homedir()) {
  const exists = (p) => p && fs.existsSync(p)
  const sdkDefault = { darwin: path.join(home, 'Library', 'Android', 'sdk'), linux: path.join(home, 'Android', 'Sdk'), win32: path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Android', 'Sdk') }[platform]
  const sdk = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, sdkDefault].find(exists) || null
  const java = [env.JAVA_HOME, platform === 'darwin' ? '/opt/homebrew/opt/openjdk@17' : null].find(exists) || null
  return {
    root: fwd(ROOT),
    flutter: (() => { const f = onPath('flutter', env, platform); return f && fwd(f) })(),
    androidSdk: sdk && fwd(sdk),
    javaHome: java && fwd(java),
    androidImage: `system-images;android-35;google_apis_playstore;${arch === 'arm64' ? 'arm64-v8a' : 'x86_64'}`,
  }
}

// Replaces the default of one `const NAME = ARGS.key || '…'` line; a value not found keeps the line as it is.
export function write(src, f) {
  const set = (s, name, key, v) => (v ? s.replace(new RegExp(`^const ${name} = ARGS\\.${key} \\|\\| '[^'\\n]*'$`, 'm'), `const ${name} = ARGS.${key} || '${v.replace(/'/g, "\\'")}'`) : s)
  let s = set(src, 'ROOT', 'root', f.root)
  s = set(s, 'FLUTTER', 'flutter', f.flutter)
  s = set(s, 'ANDROID_SDK', 'androidSdk', f.androidSdk)
  s = set(s, 'JAVA_HOME', 'javaHome', f.javaHome)
  return set(s, 'ANDROID_IMAGE', 'androidImage', f.androidImage)
}

function selftest() {
  const src = "const ROOT = ARGS.root || '/old'\nconst FLUTTER = ARGS.flutter || '/old/flutter'\nconst ANDROID_SDK = ARGS.androidSdk || '/old/sdk'\nconst JAVA_HOME = ARGS.javaHome || '/old/java'\nconst ANDROID_IMAGE = ARGS.androidImage || 'old'\n"
  const out = write(src, { root: 'C:/Users/a b/app-factory', flutter: null, androidSdk: '/home/a/Android/Sdk', javaHome: null, androidImage: 'system-images;android-35;google_apis_playstore;x86_64' })
  assert.match(out, /^const ROOT = ARGS\.root \|\| 'C:\/Users\/a b\/app-factory'$/m)
  assert.match(out, /^const FLUTTER = ARGS\.flutter \|\| '\/old\/flutter'$/m, 'a tool not found keeps its line')
  assert.match(out, /^const ANDROID_SDK = ARGS\.androidSdk \|\| '\/home\/a\/Android\/Sdk'$/m)
  assert.match(out, /x86_64'$/m)
  // PATH search: a flutter.bat on Windows, a plain flutter elsewhere
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'))
  fs.writeFileSync(path.join(tmp, 'flutter.bat'), '@echo off'); fs.writeFileSync(path.join(tmp, 'flutter'), '#!/bin/sh')
  assert.equal(path.basename(onPath('flutter', { PATH: tmp }, 'win32')), 'flutter.bat')
  assert.equal(path.basename(onPath('flutter', { PATH: tmp }, 'linux')), 'flutter')
  const f = find({ PATH: '', ANDROID_HOME: tmp }, 'linux', 'x64', tmp)
  assert.deepEqual([f.androidSdk, f.flutter, f.javaHome, f.androidImage.endsWith('x86_64')], [fwd(tmp), null, null, true])
  return 'selftest ok'
}

const direct = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (direct && process.argv[2] === 'selftest') console.log(selftest())
else if (direct) {
  const f = find(), before = fs.readFileSync(WF, 'utf8'), after = write(before, f)
  if (after !== before) fs.writeFileSync(WF, after)
  console.log(`plugin  : ${f.root}\nflutter : ${f.flutter || 'WARNING: not found on PATH — install Flutter or pass {"flutter":"<path>"}'}\nandroid : ${f.androidSdk || 'WARNING: no Android SDK (ANDROID_HOME, ANDROID_SDK_ROOT or Android Studio\'s default folder) — Android builds and the emulator will fail'}\njava    : ${f.javaHome || 'WARNING: JAVA_HOME not set — avdmanager (the Android emulator setup) needs Java 17'}\nimage   : ${f.androidImage}\nios     : ${process.platform === 'darwin' ? 'macOS — iOS builds and simulators available when Xcode is installed' : 'not available on this system (iOS needs macOS with Xcode) — runs test on Android only'}`)
}
