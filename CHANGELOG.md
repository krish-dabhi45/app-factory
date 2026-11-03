# Changelog

One entry per version in `.claude-plugin/plugin.json`, newest first. Each entry gives the commit, the date, every file changed and what it now does, the checks run with their results, and what was not checked. Versions before 0.47.0 are only in `git log`.

## 0.47.0 — 2026-11-03 — commit 61d2d07

**App dev without PRD:** a new command, `/app-factory:app-dev-without-prd`. It audits an existing app from its link (and its APK, if it has one), writes `PRD.md` from what it saw with a new colour theme, then starts `/app-factory:build-app {"noFigma":true}` on it. 10 files, 402 lines added, 25 removed.

### Added

- `workflows/app-dev-without-prd.js` (175 lines): the command. Arguments: `app` (a Google Play, App Store or website link; the bare link also works), `apk` (path), `name` (the new app's name), `note`. It runs in 3 phases:
  1. **Source** (1 agent). It stops when the folder already has `pubspec.yaml`, `CONTRACT.md`, `PRD.md`, `*PRD*.md` or `source-app/`. It resolves the link to an Android package and an App Store id. For an App Store link, it finds the Android version with `itunes.apple.com/lookup` and a Play search by title and developer.
     - APK: it takes the `.apk`, `.apks`, `.xapk` or `.apkm` in the folder. It stops when the APKs belong to different apps, or when the APK's package differs from the link's. With no APK in the folder, it pulls the app from a connected phone that has it (`pm path` + `adb pull`) and does nothing else on that phone. It never downloads an APK from a website.
     - It appends `*.apk`, `*.apks`, `*.xapk` and `*.apkm` to `.gitignore`.
  2. **Audit** (3 agents in parallel; the last 2 run only with an APK):
     - **store + web** → `source-app/store.md` and `source-app/store/`. Sources: the Play page and its Data safety page, the iTunes lookup JSON, the App Store page (in-app purchases with prices, App Privacy), and up to 10 of the developer's own pages. Ids: F<nn> for each claimed capability, P<nn> for each screenshot.
     - **APK files** → `source-app/static.md`, using `aapt2` (newest build-tools), `apkanalyzer` (Java 17), `unzip` and `strings`. It records: badging, the manifest (activities, services, receivers, intent filters, meta-data names), the framework, SDK packages, the app's own Dart file paths (`package:<app>/<path>.dart`), texts, URL hosts and colours. Keys and IDs are recorded as "present" only, never their values. It uses `jadx` only when it is installed. Ids: D<nn> for each dependency, permission, intent filter and own screen.
     - **walk** → `source-app/walk.md` and `source-app/screens/S<nn>-<slug>.png`. It runs as the `app-factory:tester` sub-agent on the plugin's emulator `af-standard` (`devices claim` → `devices up android`), never on a phone.
       - Screens: breadth-first by the `read_screen` element list; every control tapped once.
       - Fields: tried empty, with invalid values, then a valid value; the exact messages recorded.
       - Calculations and outputs: each run with 3 inputs.
       - States: first launch, airplane mode, force-stop and relaunch, dark mode, notifications.
       - It never buys, signs in, creates an account, sends, posts, rates or deletes.
       - At the end it uninstalls the app, stops the emulator and releases the devices. Ids: S<nn> per screen.
  3. **Report** (1 agent) → `PRD.md` and `source-app/theme.json`, repeated until `source-app.mjs check` passes, then the scratch folder `<project>.source/` is deleted.
     - `PRD.md` has 14 fixed sections: App, Platforms, Screens, Navigation, Fields, Features, Data and backend, Monetisation, Permissions and notifications, Settings, Theme, Not copied, Coverage, Sources.
     - `source-app/theme.json` has 10 colour roles: primary, onPrimary, secondary, onSecondary, background, onBackground, surface, onSurface, error, onError. A dark set is added only when the source app follows dark mode.
- `scripts/source-app.mjs` (168 lines):
  - `check <project> [--apk]` exits 1 and lists every problem:
    - a missing or empty section;
    - a bullet, numbered line or table row (outside Theme, Not copied and Sources) without `[walk: S<nn>]`, `[store: F<nn>|P<nn>|<url>]`, `[static: D<nn>]`, `[web: <url>]`, `[user]`, `ASSUMED` or `NOT OBSERVED`;
    - any of these words anywhere outside Sources: etc, and so on, and more, various, misc, TBD, TODO, something like, similar to, as needed, appropriate, maybe, probably, somehow, stuff, `…`, `...`;
    - an S, F, D or P id from the evidence files that is not in `PRD.md`;
    - a cited id or URL that the evidence files do not have;
    - a `source-app/<path>` file named in `PRD.md` that does not exist;
    - `store.md` missing, or with `--apk`, `static.md` or `walk.md` missing;
    - a theme role that is not `#RRGGBB`;
    - an on-colour below 4.5:1 contrast on its base (WCAG 2.x);
    - a new primary or secondary within 60° of hue of the source's (both coloured), or less than 150 apart in RGB (either one grey, black or white);
    - a `theme.json` colour that is not in the PRD's Theme section.
  - `palette <png> [more pngs]` prints the 12 most used exact colours of fully opaque pixels, each with its share of pixels.
  - `selftest` covers: a passing audit, a vague word, an untagged line, an uncovered id, an unknown id, an unfetched URL, a missing file, a colour too close to the source's, low contrast, `walk.md` required only with `--apk`, grey distance, the 21:1 black-on-white contrast, and the palette counts.

### Changed

- `scripts/pipeline.mjs` `colors`: when `design/colors.json` is absent, it checks `lib/` against `source-app/theme.json`, light and dark colours. `design/colors.json` still wins when both exist. Its messages name whichever file was used.
- `workflows/build-app.js`, contract prompt, 2 lines:
  - without `design/`, `source-app/theme.json` is the palette and its colours raise no question;
  - a `source-app/` screenshot is never registered as a design reference (it shows the old theme, so a pixel comparison would fail on every colour).
- `skills/flutter-app/SKILL.md` U1: names `source-app/theme.json` as the palette of a rebuilt app.
- `scripts/configure.mjs` and `scripts/self-configure.mjs`: they write `ROOT`, `FLUTTER`, `ANDROID_SDK`, `JAVA_HOME` and `ANDROID_IMAGE` into every `workflows/*.js`, where before they wrote only `build-app.js`.
- `README.md`: a file-table row for the new workflow and script; the Commands list changed from 3 to 4 commands.
- `GUIDE.md`: section 4 lists 4 commands, there is a new section 4a for the command, and section 6 runs `source-app.mjs selftest`.
- `.claude-plugin/plugin.json`: version 0.46.0 → 0.47.0, and the description names the new command.

### Checked (all passed)

- `node scripts/source-app.mjs selftest`, `node scripts/pipeline.mjs selftest`, `node scripts/configure.mjs selftest`, `node scripts/self-configure.mjs selftest`.
- `node scripts/simulate.mjs` (the build-app workflow with fake agents): no FAIL.
- The new workflow run with fake agents on 4 paths. In every path no prompt contains `undefined`.

  | Path | Steps that ran | Result |
  |---|---|---|
  | No APK | source → store → report | done, `nextStep` = build-app with `{"noFigma":true}` |
  | APK bundle (2 APKs) + `name` + `note` | source → store ∥ APK files ∥ walk (as `app-factory:tester`) → report | done, `nextStep` passes the note on |
  | Setup stops | source only | aborted with its reason |
  | Check fails | source → store → report | aborted with the checker's line |
- `colors` on a temporary project with a `theme.json`: it passed with 2 theme colours, then failed on an added `#1976D2` with `lib/a.dart:3 #1976D2`.
- The APK commands on `IPTV_two/build/app/outputs/flutter-apk/app-release.apk` (Flutter, release build):
  - `aapt2 dump badging` gave package `com.example.iptv_player`, minSdk 26, targetSdk 37 and 15 permissions;
  - `apkanalyzer dex packages --defined-only` printed package rows;
  - `strings` on `libapp.so` found `package:iptv_player/main.dart` and 46 own `.dart` files, plus the 8 most used Dart packages: flutter, iptv_player, hive, get, media_kit, purchases_flutter, google_mobile_ads, material_color_utilities.

### Not checked

- A real run of `/app-factory:app-dev-without-prd`: no store fetch, no walk on the emulator, no `PRD.md` written by its agents, and no build from such a PRD.
- A native Kotlin/Java APK, a React Native APK, an obfuscated Flutter build, and `.apks`/`.xapk` bundles: the commands for them are in the prompts but have not been run.
- Play's page layout. The screenshot URLs are taken with `grep` from the HTML, so a change to Google's markup can break this step.

### Not in this version

The uncommitted ads changes in the working tree at the time of this commit are not part of 0.47.0:
- `scripts/ads-install.mjs` (`main.dart` `?? false`);
- `scripts/release-check.mjs` (O8: Facebook ID and token still `"11"`);
- `templates/flutter/ads/config.json` (`nativeHome` demo id);
- `skills/ads-implementation/SKILL.md` and `skills/flutter-ads/SKILL.md`;
- their lines in `README.md` and `GUIDE.md`.
