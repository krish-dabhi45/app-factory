# Changelog

One entry per version in `.claude-plugin/plugin.json`, newest first. Each entry gives the commit, the date, every file changed and what it now does, the checks run with their results, and what was not checked. Versions before 0.47.0 are only in `git log`.

## 0.49.0 — 2026-11-04 — commit 3cae25e

**Ask every question, then one command does it all:** `/app-factory:app-dev-without-prd` asks every open question — before the audit, when the walk fails, and before `PRD.md` — and waits for the answers; `/app-factory:build-app` asks every contract question (no cap of 4, no 5-minute fallback); ads are added after development and before the device tests; the audit fixes G1, G2, G4, G5 and G6 from the Repair Coach audit; G3 (where the walk runs) is a start question. 10 files besides this entry.

### Added

- `scripts/simulate-without-prd.mjs` (63 lines): runs `workflows/app-dev-without-prd.js` with fake agents through 10 folder states and prints `ok` or `FAIL` for 26 checks; exit 1 on a FAIL. States: start (unzipped APK, split APKs missing, a phone has the app); answers given (pulled from the phone, walk on the phone); the walk reaches no screen; Play on the emulator after a failed walk, with store and static evidence kept; gaps before `PRD.md`; gaps answered and one more found by the report; no walk chosen; `CONTRACT.md` present; `PRD.md` ready; the walk agent returns nothing.
- `scripts/source-app.mjs`:
  - `hashes <dir>`: one line `<sha1> <W>x<H>|- <path>` for every file of an unzipped APK's `res/` and `assets/` except `.xml`, `.arsc`, `.dex`; pixel size from the PNG, WebP (VP8, VP8L, VP8X) or JPEG header. On `Repair Coach AI/`: 82 lines in 0.07 s.
  - `copied <project>`: exit 1 when a file under `assets/`, `android/app/src/main/res/` or `ios/Runner/` has the bytes of a `source-app/res-hashes.txt` file, or is an image with the same name stem and pixel size (a converted copy). Files equal to a plugin template file are skipped; launcher and splash names (`ic_launcher*`, `launch_image`, `launch_background`, `splash`, `icon-app-*`, `appicon*`) count only by bytes. No `res-hashes.txt` → passes with "no APK files were audited".
  - L ids (`- L<nn> · <layout file>`) for layout files, cited as `[static: L12]` and covered like S, F, D and P ids.
- `workflows/build-app.js`, **Ads** phase between the gate and Explore: an `ads` agent does the `skills/ads-implementation` steps on CONTRACT.md's `ads` group (step 6 maps the plan to the contract's ads criteria; it also writes `integration_test/ads_flow_test.dart`, one test per placement and one Premium journey), then a separate read-only `ads audit` agent does step 9b. A FAIL goes back to `ads r2` / `ads r3` with the FAIL lines; a clean audit with `changes` and `proof` passing → `ads commit` (`app-factory: ads`). A `app-factory: ads` commit whose `proof` exits 0 → `already`, nothing redone. `done` now also needs the ads (`adsOk`); the result has `ads` and `adsAudit`.

### Changed

- `workflows/build-app.js`, questions: the contract step gives every question `ask = true` and returns all of them; `nextStep` (new `askAll`) tells the chat to ask ALL of them with AskUserQuestion, up to 4 per call, in order, never start a timer and wait for the answers, then relaunch with one answer per question (`"by":"user"`). The 5-minute `sleep 300` timer and the timeout relaunch are removed. The relaunch args keep `noFigma`.
- `workflows/build-app.js`, ads order: CONTRACT.md section 9 puts every placement's criterion in one group `ads`, the last of section 5. The build loop builds every other group (`devGroups`); the builders' skill text says a feature group never writes ads code. Phases in `meta`: Ads added after Build.
- `workflows/build-app.js`, final checks: also run `source-app.mjs copied .` → `copiedOk`; `done` needs it.
- `scripts/pipeline.mjs` `decisions`: no cap of 4 — every question marked `ask` is listed as asked; "no reply in 5 minutes" appears in DECISIONS.md only when an old record has a timeout. Selftest: 6 questions → 5 asked, 1 not asked.
- `scripts/source-app.mjs` `check` (G5):
  - a requirement line needs `[walk: ..]`, `[store: ..]`, `[static: ..]`, `[web: ..]` or `[user]`; `ASSUMED` or `NOT OBSERVED` only on a line that also has `[user]`;
  - every quoted text and backticked name (4 characters or more, no `<placeholder>`) in a tagged line must be in `store.md`, `static.md`, `walk.md` or `answers.md` (case and whitespace ignored, a literal `\n` read as a space); a text with the new name and a PRD heading are skipped;
  - section App must start with `- Name: **<name>**`;
  - with `--apk`, `walk.md` must have a `## S<nn>` screen unless `--no-walk`.
  On Repair Coach's PRD.md (0.47.0's output): 137 problems, of them 77 guesses without `[user]` and 11 texts not in the evidence (`Step n/4`, `back_button`, `Secured with the App Store`, `Report a result`, `Billed per year`, `App Store settings`, `Go to App Store`, `500 left`, `N left`, a composed category path, a reworded palette text).
- `scripts/source-app.mjs` `status`: reads `source-app/answers.md`; "Answer: Go on without the walk" → the PRD count uses `--no-walk`.
- `workflows/app-dev-without-prd.js`:
  - every relaunch carries all answers (`args.answers`); answered ids are never asked again; an option label's " (Recommended)" is dropped before comparing; the Source agent writes `source-app/answers.md`; agents never ask directly — they return `questions` and the run stops with `stage: "questions"` and an `askAll` `nextStep` that relaunches this workflow.
  - Source (G1): an unzipped APK folder (`AndroidManifest.xml` + `classes.dex`) is zipped into the scratch folder for the file audit (`unzipped`, not installable); `splitsMissing` = `com.android.vending.splits.required` true and no split APK; `pairip` = `com.pairip` in the manifest; `installable`; `phone` / `phoneModel` = a connected phone where `pm path` lists the app. Questions: `apk` (not installable: Pull from my phone / I'll add the APK set / Go on without the walk), `walk` (G3: Plugin emulator / Play on emulator / My phone, each only when it applies; one option → used without asking; the code drops `walk` when the user chose no walk), `name` (3 proposed names), `link` (more than one candidate app). "I'll add the APK set" with the set still incomplete → stop with what is missing.
  - Walk: per device — `emulator` (install, Play licence screen → walked 0), `play` (opens `market://details?id=<package>`, the user installs; polls `pm path` every 30 s up to 30 minutes; the Google account stays), `phone` (`phone save` / `phone restore`, no install, uninstall or data clear; first launch NOT OBSERVED). It runs without an APK when the device has the app.
  - G2: a walk that ran and reached no screen, or returned nothing → question `walkfail-<n>` (another device, the same again, or Go on without the walk) before any PRD work.
  - APK files (G4): step 8, every own layout (`res/layout*/` minus 28 library prefixes) via `aapt2 dump xmltree` → L ids; step 9, `dexdump -d` of every `classes*.dex` → for each text group, the method that reads those string fields gives the table (`D<nn> · data: <table> (dexdump: class <class> method <method>)`); step 10, `source-app/res-hashes.txt`. Returns `layouts` and `dataTables`.
  - New phase **Questions**: a read-only `gaps` agent lists every behaviour PRD.md needs that the evidence does not show exactly, one question each (`P1`, `P2` and on); the run stops to ask them. It runs once (skipped when any `P` answer exists).
  - Report: no guess — a missing behaviour is returned as another `P<n>` question with `ready=false`; the first line is `- Name: **<name>** [user]`; texts copied from the evidence; Sources lists every answer; `check` gets `--no-walk` only when the user chose no walk or no device could run it.
  - The last `nextStep` runs build-app through contract, development, ads, device tests, senior QA and final audit without waiting in between.
- `scripts/notify.mjs`: the Stop branch for "no reply in 5 minutes I continue with the recommended options" and its selftest line removed — questions come through AskUserQuestion, whose PreToolUse notification names the first question.
- `scripts/simulate.mjs`: the question scenarios now check that every question is asked with AskUserQuestion and no timer; 6 new scenarios: ads after the gate and before `devices`, an audit FAIL → `ads r2`, ads already proven → kept, ads never passing → not done but tested, a copied source file → not done. 105 `ok` lines.
- `GUIDE.md`: section 4a rewritten for the one command (questions, the walk devices, L ids and data tables, the check rules, the copy check); the build table's step 2 (every question, no timer) and an Ads row; the notification row; section 6 runs `simulate-without-prd.mjs`. `README.md`: the file rows for the no-PRD command, `simulate-without-prd.mjs` and `notify.mjs`; build steps 1 and 2.
- `.claude-plugin/plugin.json`: version 0.48.0 → 0.49.0.

### Checked (all passed)

- `node scripts/source-app.mjs selftest` (adds: a guess without `[user]` caught and with it passing; an invented backticked name caught while an evidence text, the new name and a PRD heading pass; the Name line required; a walk with no screen failing unless `--no-walk`; WebP and PNG sizes; a converted copy and a byte copy caught while a new image and a launcher icon pass), `node scripts/pipeline.mjs selftest`, `node scripts/notify.mjs selftest`, `node scripts/configure.mjs selftest`, `node scripts/self-configure.mjs selftest`.
- `node scripts/simulate.mjs`: exit 0, no `FAIL` line.
- `node scripts/simulate-without-prd.mjs`: exit 0, `all ok`.
- `source-app.mjs copied` on a scratch copy of Repair Coach's `assets/` and `android/app/src/main/res/` with `hashes` of `Repair Coach AI/`: exit 1, 9 files — `assets/flags/{brazil,france,germany,india,portugal,russia,saudi_arabia,spain}.png` (the APK's `drawable-nodpi-v4/*.webp`, 44x33) and `assets/images/update_database.png` (same bytes as `res/drawable/img_update_database.png`). Before the launcher-name rule it also listed 15 `ic_launcher*` files by size only.
- `dexdump` (build-tools 36.1.0) on Repair Coach's `classes3.dex`: `subcat_cleaning_tech` is read in class `Ls81;` method `b`, which holds the whole category tree.

### Not checked

- A real run of either command with the new questions: no AskUserQuestion dialog shown from a workflow's `nextStep`, no relaunch with answers, no `gaps` agent on real evidence, no Ads phase on a real app.
- The walk on "Play on emulator" (a Google sign-in on `af-standard`) and on "My phone"; whether a PairIP app installed from a full APK set opens past its licence screen.
- The layout and `dexdump` steps on a Flutter, React Native or obfuscated-resource APK: a Flutter app's data is in `libapp.so` (step 4 `strings` only); React Native's `index.android.bundle` is not read beyond the framework check.
- An App Store-only app (no Android version): no APK, no Android walk; the PRD rests on the store, the web and the answers.
- `copied`: a source image renamed and resized is not caught; a source app that ships Flutter's default launcher icon would match the new app's default icon by bytes.
- During development, an agent that meets a choice nothing covered still records a `DECIDED` finding; it cannot stop the run to ask.

### Not in this version

The uncommitted ads changes in the working tree before 0.48.0 are still not part of this version: `scripts/ads-install.mjs`, `scripts/release-check.mjs`, `templates/flutter/ads/config.json`, `skills/ads-implementation/SKILL.md`, `skills/flutter-ads/SKILL.md`, and their lines in `README.md` and `GUIDE.md` (the ads section).

## 0.48.0 — 2026-11-04 — commit 98f9fe1

**Continue from the work in the folder:** `/app-factory:app-dev-without-prd` and `/app-factory:build-app` now start from what an earlier run left in the project folder, where before the first stopped on any `PRD.md`, `CONTRACT.md`, `pubspec.yaml` or `source-app/` and the second rebuilt every group (its interface step rewrote the shared layer as placeholders). 6 files.

### Added

- `scripts/source-app.mjs` `status <project>` (20 lines): prints JSON `{sourceApp, store, static, walk, prd, prdProblems, contract, app, dartFiles}` — the number of F ids in `store.md`, D ids in `static.md` and S ids in `walk.md` (0 = the file is missing, or the walk reached no screen), whether `PRD.md` exists and how many problems `check` finds in it, whether `CONTRACT.md` exists, `app` = an app project's root file (`pubspec.yaml`, `project.yml`, `settings.gradle`, `settings.gradle.kts`, `package.json`, or a `*.xcodeproj` folder), and the `.dart` files under `lib/`. `selftest` covers: a complete audit is found with 0 PRD problems; a `walk.md` with no `## S<nn>` screen counts as 0; `settings.gradle.kts` and `Demo.xcodeproj` each count as an app project.
- `workflows/build-app.js`: an **existing work** agent (label `existing work`, read only, effort low) at the start of the Build phase, for the Flutter stack. No `.dart` file in `lib/`, or `lib/main.dart` as the only one and still Flutter's counter app (`_incrementCounter`) → `existing=false` and the build runs as before; any other code counts, whoever wrote it. Otherwise it runs `flutter pub get`, `flutter analyze` and the unit and widget tests (`flutter test -j 4 -r expanded --no-pub test/`; no `test/` folder → every criterion is `missing`) and returns every contract criterion as `done` (a test named after it exists and every one passed), `failing` or `missing`, and `sharedLayer` (the build skill's layer — `lib/main.dart`, theme, routes and `lib/ui/core/app_keys.dart` — exists and analyze has no error; code in another structure is existing work with `sharedLayer` false). It marks no feature passing — the final audit still does.
- `scripts/simulate.mjs`: 3 scenarios — a folder with the app (shared layer kept, `done: [AC1]`): no `interface` call, no `items` agents, `logic: settings` told "Build only AC2, from the files already here"; a folder with code in another structure (`sharedLayer` false, no test passing): `interface` runs told "never replace an existing file with a stub or placeholder" and both groups extend the files there; a folder without code: `interface` and every group run.

### Changed

- `workflows/app-dev-without-prd.js`, Source step 1: runs `source-app.mjs status .` and returns it as `have` plus `resume`:
  - `CONTRACT.md` → `resume: "build"`; the workflow returns at once with `nextStep` = `/app-factory:build-app {"stage":"build","noFigma":true}` (and the note).
  - `PRD.md` with 0 problems → `resume: "prd"`; `nextStep` = `/app-factory:build-app {"noFigma":true}`.
  - a PRD (`PRD.md` or `*PRD*.md`) and no `source-app/` → stops: "This folder already has a PRD — use /app-factory:build-app."
  - an app project (`status` `app` true) and no `source-app/` → stops: "This folder already has an app and no audit of a source app — use an empty folder (the source app's APK may be in it)." Before this version only `pubspec.yaml` stopped it, so a native Android, XcodeGen or npm project folder was audited into.
  - anything else → `resume: "audit"`.
- `workflows/app-dev-without-prd.js`, Audit phase: an evidence file with ids is kept (logged "audit: <file> kept from the earlier run (<n> <ids>)") and its agent does not run; `store.md` with 0 F ids, `static.md` with 0 D ids (with an APK) or `walk.md` with 0 screens (with an APK) runs again. `WALKED` is true when the kept `walk.md` has screens.
- `workflows/app-dev-without-prd.js`, Report phase: the static evidence (`static.md` in the prompt, `check --apk`, the Theme and Sources lines) follows `STATIC` = an APK in this run or a kept `static.md`, where before it followed the APK alone. An existing `PRD.md` is continued: the agent runs `check` first, fixes what it lists, and changes only the lines the new evidence adds to or corrects.
- `workflows/build-app.js`, Build phase: no `interface` call when the existing work has the shared layer, and with existing code without it the `interface` prompt tells it to keep every file that exists and "never replace an existing file with a stub or placeholder"; a group whose criteria are all `done` is skipped (logged "group <name>: every criterion (<ids>) already passes its tests — kept as built, not built again"); the other groups' prompts name the criteria that already pass ("keep their code and tests as they are") and the ones to build ("from the files already here: read them first, then extend or fix them — never create again a file, screen, stub or test that exists").
- `GUIDE.md` section 4a: the folder rule and a table of what runs for each folder state, and the build-app existing work step.
- `.claude-plugin/plugin.json`: version 0.47.0 → 0.48.0.

### Checked (all passed)

- `node scripts/source-app.mjs selftest` → `selftest ok`.
- `node scripts/source-app.mjs status "/Users/mach/testing/repair coach"` → `{"sourceApp":true,"store":52,"static":114,"walk":0,"prd":true,"prdProblems":0,"contract":true,"app":true,"dartFiles":127}`.
- `node scripts/simulate.mjs`: exit 0, no `FAIL` line, the 3 new scenarios `ok`.
- `node scripts/source-app.mjs status` on 4 folders: `repair coach` → app true, 127 `.dart` files, contract true; `IPTV_two` → app true, 57; `ai_ppt_generater` → app true, 50; `invoice-maker` (only `.claude/` in it) → app false, 0. The same run on `workflows/build-app.js` of HEAD (61d2d07's) also had no `FAIL` line.
- `workflows/app-dev-without-prd.js` with fake agents on 5 folder states (no prompt contains `undefined`, `NaN` or `[object Object]`):

  | Folder | Agents that ran | Result |
  |---|---|---|
  | new | source → store ∥ APK files ∥ walk → report | `nextStep` `{"noFigma":true}` |
  | `CONTRACT.md` + 127 `.dart` files (Repair Coach's `status`) | source | `resumed: build`, `nextStep` `{"stage":"build","noFigma":true}` |
  | `PRD.md` with 0 problems, no contract | source | `resumed: prd`, `nextStep` `{"noFigma":true}` |
  | `store.md` 52, `static.md` 114, `walk.md` 0, `PRD.md` 3 problems | source → walk → report | store and static kept; the report prompt says to continue the PRD |
  | `static.md` 114, no APK in the folder | source → store → report | `static.md` in the report prompt and `check . --apk` |

### Not checked

- A real run of either command on a folder with earlier work: no agent ran `source-app.mjs status`, and the `existing work` agent was not run on Repair Coach's 127 `.dart` files (it runs `flutter pub get`, which writes `.dart_tool/` there).
- `pipeline.mjs affected`: a skipped group has no "app-factory: group <name>" commit, so its code is only in the baseline commit.
- The SwiftUI stack: it has no existing work step (`STACK.own` is false there), so a SwiftUI build in a folder with code still builds every group. `/app-factory:app-dev-without-prd` always hands over to the Flutter stack.
- `resume: "build"` passes no answers: a CONTRACT.md whose questions were never answered is built with each question's recommended option, as when the 5-minute wait ends.

### Not in this version

The uncommitted ads changes in the working tree before this version are not part of 0.48.0: `scripts/ads-install.mjs`, `scripts/release-check.mjs`, `templates/flutter/ads/config.json`, `skills/ads-implementation/SKILL.md`, `skills/flutter-ads/SKILL.md`, and their lines in `README.md` and `GUIDE.md` (the ads section).

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
