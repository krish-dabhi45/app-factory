# Changelog

One entry per version in `.claude-plugin/plugin.json`, newest first. Each entry gives the commit, the date, every file changed and what it now does, the checks run with their results, and what was not checked. Versions before 0.47.0 are only in `git log`.

## 0.58.0 — 2026-11-06 — commit 7b1afa4

**The first run of the ads checks on a real app: the Mendwise app in `/Users/mach/testing/repair coach` (package `com.mendwise.app`, no git, no `google-services.json`), in a copy in the session scratchpad, with the device steps on the emulator `af-standard`.** Three checker defects it exposed are fixed here.

| Defect (evidence on Mendwise) | Now |
|---|---|
| R3 failed on 4 `///` doc comments that name an ad call in prose: `usage_repository.dart:51`, `car_templates_view.dart:15`, `unlock_dialog.dart:11`, `subcategory_view.dart:19` | a line starting with `///` is never a slot; no file of the template, of `ai_ppt_generater` or of `IPTV_two` has a `///` ad slot (grep) |
| `seen` on the intro native: "NOT on the screen of onboarding_view.dart: none of its 3 own texts is shown" — the intro titles are in `onboarding_view_model.dart:17` | `screenFiles(root, file)`: the screen's file plus the local files it imports whose name starts with its stem (`onboarding_view.dart` → `onboarding_view_model.dart`); their texts count as the screen's |
| `uiLiterals` dropped every string with a `.`, so 'Scan Your Car. Fix It Fast.' and 'Fix Anything, Step by Step.' were not text | a `.` drops a string only when a non-space character follows it (`a.png`, `app.title`, `v1.0.2` still dropped) |

### Changed

- `scripts/ads-install.mjs`: R3 skips `///` lines; `screenFiles` added and used by `seen`; `uiLiterals` period rule; `CHECKER` 5 → 6 (earlier `seen` records are STALE).
- `skills/flutter-ads/SKILL.md` section 1: the device-test method — host `flutter test` and `flutter test -d <device> test/<file>` both fail in the `objective_c` native-assets hook (`ld: tapi error: malformed file`, `unknown architecture arm64e.x1-macos`); `flutter run -t test/<file>` runs under the live binding, where unchanged tests fail (6 of 6); a wrapper in `integration_test/` calling `IntegrationTestWidgetsFlutterBinding.ensureInitialized()` and each test file's `main()` runs them (49 of 49).
- `.claude-plugin/plugin.json`: 0.58.0.

### Checked

- `node scripts/ads-install.mjs selftest` → ok, with the new cases: a `/// Taps go through the team's onTapInter (RECIPE.md).` line in a base file is not in R3's evidence; `screenFiles` of `lib/launch/views/onboarding_view.dart` = itself + `lib/launch/view_models/onboarding_view_model.dart` (a `package:` import of another file is not included); `uiLiterals` keeps 'Scan Your Car. Fix It Fast.' and 'Driving Test Ready', drops 'assets/a.png', 'app.title', 'v1.0.2'.
- `node scripts/simulate.mjs` exit 0; `node scripts/simulate-without-prd.mjs` exit 0.
- On the Mendwise copy:
  - `ads-install.mjs changes`: before the installer, R5 FAIL "config.json is missing or not JSON", T1 FAIL "`pubspec.yaml`: no fluttertoast", R3 FAIL (the 4 doc comments); after the installer, R5 FAIL "every colour key is still the template's"; after the THEME values (`#FFFFFF`, `#1F1A14`, `#1F1A14`, `#B45309`, `#B45309`, `#FFFFFF`, `#B45309`, `#FFFFFF`, from `app_theme.dart:34`, `:51` and `app_colors.dart:6`, `:7`, `:11`, `:12`) and this version: 8 checks PASS, I3 FAIL only because the test suite was not run in the copy.
  - debug APK built in 192 s; `ads-install.mjs launch` → "PASS launch debug: app-debug.apk started (pid 6369) and ran 30 s on cleared data".
  - `adb exec-out screencap -p` gives "PNG image data, 1080 x 2400, 8-bit/color RGBA, non-interlaced"; `ads-install.mjs pixel` on it: Start button `#B45309` = `AppColors.primary`, page `#FFF8F1` = `AppColors.background` (`app_colors.dart:10`).
  - `ads-install.mjs seen <copy> emulator-5554 lib/ui/features/launch/views/onboarding_view.dart:148` → FAIL "no native ad (ad_view) shown on the screen"; logcat: "Default FirebaseApp failed to initialize because no default options were found".
  - the app's `test/ui/ads/ads_test.dart` and `test/ui/launch/onboarding_view_test.dart` with one new test, through the `integration_test` wrapper on the emulator: "03:42 +49: All tests passed!".

### Not checked

- `seen`'s `alignment:` and `theme:` lines on a loaded ad: Mendwise has no `google-services.json`, so the team's code never starts AdMob (flutter-ads section 1) and no ad loads.
- `seen`'s screen tie with the view-model texts on a device: it needs a loaded intro native (same reason).

### Not in this version

- The changes in `/Users/mach/testing/repair coach` (not a plugin file): `lib/main.dart` `?? false`, `pubspec.yaml` `fluttertoast: ^10.0.2`, a new `config.json` with the THEME colours, one new test in `test/ui/ads/ads_test.dart`.

## 0.57.0 — 2026-11-06 — commit a7a2aa7

**Where an ad sits in an app's look is now taken from the team's two apps with ads, the AI PPT app and IPTV_two, rule by rule with both apps' file:line.** The user asked that such tasks follow those two apps' handling, without rules of app-factory's own. 0.56.0 had three rules that neither app has, and they are removed:

| 0.56.0 rule | What both apps do (evidence) | 0.57.0 |
|---|---|---|
| the frame copies the item's fill `color`, shadow and inner padding | the frame `Container` has `alignment: Alignment.center`, `width: sw`, `padding: EdgeInsets.all(30.w)` and no fill in both (PPT `home_screen.dart:225-234`, IPTV `bottom_bar/stream_now_iptv_screen.dart:94-105`); only the border is the item's (PPT `Color(0xff343434)` `:262`, IPTV `Color(0xFFE9EDF3), width: 1.5` `:178`), and the radius (PPT `35.w` = item `:261`; IPTV `20`, card `15` `:177`) | the team's `Container` as written, with the app item's radius, border and gap |
| ADAPTED kind **theme**: `CollapsibleBannerWidget(backgroundColor:)` with the app's colour | no call passes `backgroundColor:` (PPT `home_screen.dart:297`, `select_template_screen.dart:170`, `template_preview_screen.dart:113`; IPTV uses `BannerWidget`) | removed; 9b fails a `backgroundColor:`; the `#060B12` strip is listed under "Kept as the team has them" |
| the native colour mapping presented as part of the team's pattern | both apps ship the same defaults (`ads_variable.dart:51-60`, IPTV `:52-61`: `#342F38`, `#FFFFFF`, `#6F34FF` → `#C93EA2`), used on no screen of either app; real values are only in each app's Firebase Remote Config, not in either folder. IPTV_two's `config.json` (2026-10-26) and `common_flow_demo/remote_config.json` (2026-10-28) are app-factory's outputs, not the team's | the mapping stays and is marked as app-factory's rule in section 8 and in the report |

Added from both apps: the bottom margin of the frame = the gap between the list's items (PPT `.marginOnly(bottom: 40.w)` `:234` = item `:270`; IPTV `30.w` `:98` = `30.verticalSpace` `:66`, `:77`, `:86`); the native inside the list's content padding (PPT `:217`, IPTV `:35`, both `50.w`); the intro native with no frame, the last child after the main button and `50.verticalSpace` (PPT `onboarding_screen.dart:146-151`, IPTV `intro_screen.dart:140-145`); a banner as the last child of the body `Column`, below the content and outside its padding, spanning the screen (PPT 3 screens, IPTV `channel_list_screen.dart:122`, `bottom_bar/channels_screen.dart:135`, `playlist_group_screen.dart:82` with the padding on the content at `:39`).

### Changed

- `skills/flutter-ads/SKILL.md`: section 8 rewritten: the two-app table, "The frame" (the team's `Container` as code, an item with no border → no `border:`, decided because neither app shows one), "Where natives and banners sit", the colour keys with the app-factory rule marked, "Kept as the team has them" (adds the collapsible banner strip `#060B12`), "Measured on the device". Section 2: the native host bullet and the banner bullet point at section 8; ADAPTED kind **frame** = the team's frame with the item's radius, border and gap; kind **theme** removed. The "Never" list says IPTV_two is cited only in section 8 and no IPTV_two code is installed.
- `skills/ads-implementation/SKILL.md`: step 2 "Its look" reads the item's radius, border, fill and gap, the banner screens' body `Column`, the intro page's main button; step 3 frame and host-padding rows; step 5 item 5 puts the frame, the intro native and the banners as section 8 says; step 8: a banner's gaps are 0, a list native has the team's frame, the intro native none; 9b fails a frame that is not section 8's `Container`, a `backgroundColor:` on `CollapsibleBannerWidget(`, a banner or intro native in another place; step 10 marks the THEME rows as app-factory's rule.
- `scripts/ads-install.mjs`: `adLook(img, v, views, area, dpi, want, { banner: true })` from `seen` fails a banner with more than 2 px free on either side ("does not span the screen"); `CHECKER` 4 → 5 (records of 0.56 are STALE).
- `README.md`, `GUIDE.md`: the same rules in their ads lines.
- `.claude-plugin/plugin.json`: 0.57.0.

### Checked

- Every file:line in the section 8 table read in `/Users/mach/testing/ai_ppt_generater` and `/Users/mach/testing/IPTV_two` (three were off by one or two lines in the first draft and were corrected: `ads_variable.dart:51-60` / `:52-61`, IPTV's gaps `:66` `:77` `:86`, PPT home banner `:295-297`).
- `node scripts/ads-install.mjs selftest` → ok, with the new cases: a banner 1 px from each edge passes, a banner with 40 px on each side fails "does not span the screen (40 px and 40 px".
- `node scripts/simulate.mjs` exit 0; `node scripts/simulate-without-prd.mjs` exit 0.
- This entry scanned with `source-app.mjs`'s VAGUE regex.

### Not checked

- `seen` on a device: no device was connected (`adb devices` empty).
- The team's published native colours: they are only in the two apps' Firebase Remote Config consoles.

## 0.56.0 — 2026-11-06 — commit c7c1d18

**The ads take the app's look on every screen, the intro included, and the device run measures it.** The user asked that once ads are placed they match the app's theme and alignment on all screens. The team's code already has three places where an ad's look is set, and 0.55 left all three at the PPT app's values:

| Where the team sets the look (evidence) | 0.55 | 0.56 |
|---|---|---|
| Eight Remote Config colour keys: read at `lib/ads/ads_splash_utils.dart:32-39` and `:125-132`, sent at `:364-377`, applied by `MainActivity.kt` (`NativeAdFull` `:212` `:236` `:247`, `NativeAdBig` `:399` `:423` `:434`, `NativeAdSmall` `:557` `:579` `:589`) | `config.json` got the template's values (`nativeBGColor` `#FFFFFF`, `btnBgColor1` / `btnBgColor2` `#FF7236`) in every app | each key from the app's theme, with its file:line or a screenshot pixel (flutter-ads section 8 table: which view each key colours, which app colour it takes) |
| The frame around the home native: `after/lib/screens/home_screen.dart:225-234`, the same width, radius and border as the topic item at `:256-262` (`Color(0xff343434)`) | no rule: the native went in with no frame or the PPT border | a list native gets the decoration of the app's own list item (ADAPTED kind **frame**, with the item's file:line) |
| `CollapsibleBannerWidget(backgroundColor:)`: `after/lib/ads/ads_collapsible_banner.dart:23`, default `Color(0xff060B12)`, painted at `:153` `:159` `:191`; the team's call `home_screen.dart:297` passes none | a dark navy strip in every app | the app's bottom-edge colour (ADAPTED kind **theme**) |

### Added

- `skills/flutter-ads/SKILL.md` section 8 "Theme and alignment": the colour table (8 keys → view → the app's value); values `#RRGGBB` / `#AARRGGBB` only, because `Color.parseColor` takes nothing else and the team's fallback `"1A1A1A"` (`:32`, `:125`) has no `#`; a literal → its hex, a Material constant → its value, a computed colour → `ads-install.mjs pixel` on the step-2 screenshot; light / dark: one set, `themeMode: ThemeMode.dark` → `darkTheme`, else `theme`, and the report states the dark-mode result when the app follows the system; the frame rule; the collapsible banner rule; the list of looks kept as the team's with file:line (`ad_advertiser` `#E0DFDF` in the three layouts, Poppins fonts, the "Loading" dialog `loading_screen.dart:21-43`, the shimmers `shimmer.dart:12` / `shimmer_banner.dart:16-21`, the "Advertisements" label `ads_collapsible_banner.dart:201-205`, Google's full-screen ads); the alignment rules for natives, banners and intro pages.
- `scripts/ads-install.mjs`:
  - check **R5** in `changes`: every colour key `lib/ads/ads_splash_utils.dart` reads is in `config.json` as `#RRGGBB` / `#AARRGGBB`, and not all of them still equal the template's values. `verify` fails while R5 fails.
  - `pngPixels(buf)`: reads an 8-bit RGB / RGBA, non-interlaced PNG (what `adb exec-out screencap -p` gives) with `node:zlib`, all five PNG filters.
  - `adLook(img, v, views, area, dpi, want)`, run by `seen` on every native and banner: `alignment:` line with the gaps to the left and right screen edges in px and dp, FAIL when they differ by more than 2 px; for a native a `theme:` line with the most common colour inside `ad_view` outside its content views (`ad_media`, `ad_headline`, `ad_body`, `ad_call_to_action`, `ad_attribution`, `ad_advertiser`, `ad_stars`, `ad_icon`, `ad_price`, `ad_store`, `btn_card`) on a 15 × 7 grid, FAIL when it differs from `config.json`'s `nativeBGColor` by more than 8 in a channel; the app's colour just outside the ad is printed. A see-through `nativeBGColor` is printed, not compared.
  - command `pixel <png> <x> <y>` → `#RRGGBB`; exit 1 for a point outside the image.

### Changed

- `scripts/ads-install.mjs`: `seen` takes the screenshot once, before the checks, and saves that same image; `CHECKER` 3 → 4, so `proof` shows every `seen` record made before 0.56 as STALE; the `ADS_CHANGES.md` legend reads "R: the app's slots, Remote Config parameter and native colours".
- `skills/flutter-ads/SKILL.md`: section 1 (`config.json`'s colour keys are the app's theme); section 2 (a list native framed as one of the list's items, inside its padding; a `CollapsibleBannerWidget` gets `backgroundColor:`; ADAPTED kinds **frame** and **theme** added; **host** padding uses the app's own value with its file:line); section 5 (R5); section 6 (the `alignment:` and `theme:` checks of `seen`).
- `skills/ads-implementation/SKILL.md`: description; step 2 "Its look" (theme / darkTheme / themeMode, home list padding and item decoration, main button, banner screens' bottom edge and floating button, intro background and padding, computed colours with screenshot x,y); step 3 THEME rows and frame / theme / host-padding rows; step 5 item 5 writes them; step 8 checks on every native and banner screen including intro pages (`alignment:` gaps = the plan's padding × density ÷ 160, `theme:` the same colour, the frame, the last list item fully above the banner, no floating button on it, a dark-mode screenshot when the app follows the system) and FAIL cases; step 9 lists R5; 9b gets `config.json` and fails a THEME row that is not the colour at its source, a colour key with no THEME row, a frame / padding / `backgroundColor:` not equal to its app source; step 10 reports all of it.
- `README.md` (`ads-install.mjs` row: R5, the `seen` alignment / colour checks, `pixel`), `GUIDE.md` (ads: "The app's look" line, R5 in the checks list).
- `.claude-plugin/plugin.json`: 0.56.0.

### Checked

- `node scripts/ads-install.mjs selftest` → ok, with the new cases: R5 FAIL on the template's colours, FAIL on `nativeBGColor` `"FFFFFF"`, PASS on `#F4F1EC`; a 5 × 5 RGBA PNG with one row per filter type 0–4 read back pixel for pixel; `adLook` centred (40 px / 15 dp each side at 420 dpi) with the same colour → ok, `#FFFFFF` on the device against `#F4F1EC` → FAIL, 0 px / 80 px → FAIL "NOT centred (80 px apart)"; the team's PPT build still gives T1 T2 T3 R3 R4 N1 PASS.
- `pngPixels` on a real PNG (`ai_ppt_generater/assets/splash_screen/bg.png`, 1242 × 2688 RGBA): 0 of 68,352 sampled pixels differ from the same file converted to BMP by `sips`; 92 ms to read.
- `node scripts/simulate.mjs` exit 0; `node scripts/simulate-without-prd.mjs` exit 0; `node scripts/pipeline.mjs selftest` ok.
- Added lines scanned with `source-app.mjs`'s VAGUE regex: the matches are JavaScript spread syntax (three dots), the dialog text "Loading" followed by three dots as the app shows it, and lines that already had the ellipsis character before this version.

### Not checked

- `seen`'s `alignment:` and `theme:` lines on a device: `adb devices` listed no device on this Mac during this change. The first `/app-factory:ads-implementation` run with a device is the first device check.
- That `adb exec-out screencap -p` on every device gives 8-bit RGB / RGBA non-interlaced PNG: if it does not, `pngPixels` throws, `seen` skips the colour comparison (no image), and the alignment check still runs.
- Dark mode on the device (`cmd uimode night yes`) as written in step 8.
- iOS: the team's change has no iOS part (flutter-ads section 1), so iOS natives are not covered by section 8.

### Not in this version

- No change to the team's layouts, `MainActivity.kt` or `lib/ads/`: the `ad_advertiser` `#E0DFDF` text and the other looks in section 8's "Kept as the team has them" list stay as the team has them.

## 0.55.0 — 2026-11-05 — commit c912503

**A rerun on a folder that already has the app continues from it — checked against the Mendwise folder (`/Users/mach/app-dev.v1`).** The resume itself has been in the plugin since 2026-11-04 (no-PRD: `source-app.mjs status` → PRD.md re-audited when its check fails, CONTRACT.md and `lib/` kept; build-app: contract re-audit, "existing work" step, groups whose criteria pass are not built again). Under 0.54's checker Mendwise's status is `{prd: true, prdProblems: 12, staticMissing: ["assets"], contract: true, dartFiles: 218}`, so a rerun re-audits PRD.md and continues from the code. Tracing that rerun found 5 defects, fixed here:

| Defect (evidence) | Now |
|---|---|
| The source step rewrote `source-app/answers.md` with only the new run's answers: Mendwise's P1–P18 (platforms, minimum OS, the name Mendwise, keep package `com.aifix.repairai.diyguide`) would be lost and decided again | The new answers are added; an answer with the same id is replaced, every other earlier answer and "Decided without asking" stay. A subject already answered there (name, Firebase, purchases, keys) is not asked again |
| Earlier answers to questions 0.54 no longer asks (P8 font Karla, P9 teal `#0F9D8A`, P10–P12 radius, elevation, icon style, P13 "New AI-generated photos" because source images "may not be copied") would still be cited as `[user]` against the source theme | Moved, as written, under "## Superseded" in answers.md with why; the report reads answers.md whenever it exists and cites nothing under Superseded |
| The APK an earlier run audited was moved out of the folder (Mendwise: `/Users/mach/app-dev.v1.sources/Repair Coach AI/`, 2026-11-04 20:39), so `apks` would be empty, `NEED_STATIC` false and `reuse` never run | When static.md or PRD.md's Sources names an audited APK and the folder has none, the source step searches beside the project (`find "$(dirname "$(pwd)")" -maxdepth 3 …`, 0.09 s on this Mac — finds that folder) and uses the one of the same package |
| Answer "I'll add the APK set" stopped the run unless the set was installable — an unzipped base (all Mendwise has) could never be used | It stops only when no APK and no unzipped APK is there; an unzipped or incomplete set is used for its files (static.md, `reuse`), the walk runs where "walk"/"walkfallback" says |
| The existing-work step counted a criterion done when its unit test passed, also when the test faked the API of a provided key (Mendwise: every AI test used `MockClient`) — those groups would not be rebuilt or retested | A test that replaces the client of a key `secret names` lists with a fake marks the criterion failing: built and tested again against the real API |

**App ids as the team's apps have them.** `ai_ppt_generater`: namespace = applicationId = `com.example.pptmaker`, `kotlin/com/example/pptmaker/MainActivity.kt`; `IPTV_two`: `com.example.iptv_player` the same. Mendwise had namespace `com.aifix.repairai.mendwise` (flutter create's `--org` + project name) and applicationId `com.aifix.repairai.diyguide`, MainActivity in `kotlin/com/aifix/repairai/mendwise/`.

### Changed

- `scripts/pipeline.mjs`: new `ids [--ios <bundle id>] [--fix] [--root <dir>]` — fails when the Android namespace is not the applicationId, MainActivity is not in `kotlin|java/<applicationId as folders>/` with that `package` line, the manifest names classes in the old namespace, or (with `--ios`) a Runner `PRODUCT_BUNDLE_IDENTIFIER` is not the id (RunnerTests: `<id>.RunnerTests`); `--fix` sets the namespace, moves MainActivity and every file of its package, rewrites their `package` lines and the manifest, removes the emptied folders, sets the iOS ids. Selftest added.
- `workflows/build-app.js`: the Flutter make rule runs `ids --fix` after setting applicationId and on code already here (`--ios` when PRD.md or CONTRACT.md names the iOS bundle id); the final checks run it (six commands with the own stack); the existing-work step's faked-key rule (above).
- `workflows/app-dev-without-prd.js`: source step 1 (APK beside the project), step 2 (answers.md added to, Superseded), step 8 (answered subjects not asked), the "I'll add the APK set" stop; the report reads answers.md whenever it exists, and PRD §1 gets "- Package: <id>" (applicationId = namespace = MainActivity's package; the source's when the app ships as its update) and "- iOS bundle id: <id>" (the source App Store app's `bundleId` from the iTunes lookup, else the Android package).
- `scripts/simulate.mjs`, `scripts/simulate-without-prd.mjs`: assertions for each change above; new scenario 2b ("I'll add the APK set").
- `.claude-plugin/plugin.json`: 0.55.0.

### Checked

- `pipeline.mjs selftest` ok (new `ids` case: namespace, MainActivity and a second file of its package moved, manifest and iOS ids rewritten, then `ids` ok); `source-app`, `secrets` selftests ok; `ads-install selftest` ok.
- `simulate.mjs` exit 0 (115 ok); `simulate-without-prd.mjs` exit 0.
- `ids` on a copy of Mendwise: reported the 2 problems; `--fix` changed the namespace and moved MainActivity to `kotlin/com/aifix/repairai/diyguide/`; `flutter build apk --debug` on that copy ✓ (65 s); `aapt2` on the APK: package `com.aifix.repairai.diyguide`, activity `com.aifix.repairai.diyguide.MainActivity`. The copy was deleted; `/Users/mach/app-dev.v1` itself is unchanged.
- The beside-the-project `find` run from `/Users/mach/app-dev.v1` returns `/Users/mach/app-dev.v1.sources/Repair Coach AI/AndroidManifest.xml`.

### Not checked

- A real rerun of `/app-factory:app-dev-without-prd` on `/Users/mach/app-dev.v1` (the answers.md merge, the Superseded move and the PRD re-audit are agent steps; only the prompts were checked by the simulator).
- `ids --fix` on an iOS project build (`--ios` was checked on the pbxproj text only).

## 0.54.0 — 2026-11-05 — commit c912503

**From the audit of the Mendwise run (`/Users/mach/app-dev.v1`, plugin 0.49/0.50, 2026-11-04 08:38 → 2026-11-05 04:01 UTC).** Every mistake found there now has a rule, a command or a check, for every app, not only this one:

| Mendwise mistake (evidence) | Now |
|---|---|
| Your own app treated as someone else's: the theme had to be ≥ 60° of hue from the source (`source-app.mjs` `distinct`), so your blue `#4B56D4` became teal `#0F9D8A`; the source's icon, illustrations and photos were "Not copied", and the build failed on any reuse (`copied`, added in 0.48.0) | The source app is the user's own: its colours are kept (checked: `theme.json` primary and secondary = the source's), its icon, images, Lottie animations, sounds and fonts are reused (`source-app.mjs reuse` → `source-app/assets/`, each an `A` id the PRD must place); no "new" colour, theme, font or icon-style question; the name question offers "Keep <name>" first |
| 0 images shipped: the APK's 17 Lottie files, 3 quiz sounds, launcher icon and 10 flags unused; "New AI-generated photos" recommended though the build cannot make them; icon tiles instead | `reuse` takes them; an image not in the APK is fetched with `source-app.mjs image` (Openverse, public domain first) and opened before it is kept; a recommended option must be one the build can deliver; never an "icon tiles" option |
| The IFM key was stored, but the user's own Run had no `--dart-define-from-file`: the app sent an empty `Bearer`, IFM answered 401, the screen said "Request failed" | `secret runconfig` writes the Android Studio and VS Code run configurations and a README section with the key file; an empty provided key never sends a request and says so; a failed request logs its status and the API's message |
| Every automated test faked the AI (`MockClient`, flutter-app L6 "no test may reach the network"); the one real call, in senior QA 13 h after the code, found 4 of 7 requests failing (X98) | A provided key is tested against the real API (flow tests, senior QA); new L14: ≥ 6 real answers checked against fixed rules and the prompt refined, recorded in `.pipeline/real-answers.md`; fakes only for missing keys and for what a device test cannot drive |
| Ads: 85 min, 3 rounds, 0 of 11 placements seen — no Firebase files, and the team's code starts AdMob only after Firebase (`ads_splash_utils.dart:105`, `:288`, `:292` → `:471`) | The Firebase files are asked for at the start (never "Run without Firebase (Recommended)"); missing → the ads are wired and audited once and blocked with that reason; the owner's AdMob ids missing → Google's test ids, and the ads are proven with them |
| No purchase screen: "Subscriptions aren't available yet"; the team's premium screen was not in the plugin, and its build shows a hard-coded offering of another app | The team's premium screen is a reference in the template; flutter-ads section 7: plans from `Purchases.getOfferings()`, shown per Remote Config, Restore, `resetAdIds`; a RevenueCat Test Store key is asked at the start and purchases are tested for real |
| Two "first launch" flags (`settings.onboarding_done` and the team's `isFirstTime`) | One flag (the team's); the flow test relaunches the app and asserts the intro does not show again |
| The Android 11 phone (minSdk 32) was tried again in each of 4 test stages | `devices pick` skips a phone below the app's minSdk once, with the reason |

12 files besides this entry, plus 1 new template file.

### Changed

- `scripts/source-app.mjs`:
  - `check`: section "Not copied" → "Reused from the source app"; `assets.md` is evidence and its `A` ids must be cited; theme rule: `colors.primary` / `colors.secondary` must equal `source.primary` / `source.secondary` (was: at least 60° of hue away; `hsl` and `distinct` removed); `status.staticMissing` lists `assets` instead of `hashes`.
  - new `reuse <unzipped apk> <project>`: copies the launcher icon, raster images (largest density per name), `res/raw` (Lottie `.json`, sounds), `res/font` and the APK's `assets/` into `source-app/assets/<kind>/`, library files (`abc_`, `mtrl_`, ad networks' prefixes) left out, and writes `source-app/assets.md` (`- A<nn> · <kind> · <file> — <size> · from <apk path>`).
  - new `image <project> <slot> <words…> [--next <n>]`: Openverse search (no key), `license=cc0,pdm` first, else `license_type=commercial` marked "attribution required"; a host that answers with no `image/*` is passed over for the next hit; saved as `assets/images/<slot>.png` (`sips`), credited in `assets/images/CREDITS.md`.
  - removed `hashes` and `copied`. Selftest: own colours kept, `reuse` (largest density, library and XML files left out, `A` ids required in PRD.md), `pick` with `--next`.
- `workflows/app-dev-without-prd.js`: the source app is the user's own (intro, `whenToUse`, phase details); step 10 runs `reuse` (split APKs included) instead of `hashes`; PRD section 11 keeps the source theme and font; section 12 "Reused from the source app" (one row per `A` id, "Images not in the APK" with search words, the user's own servers used, a key found in the APK stored with `secret`); section 13 covers `A` ids; the name question offers "Keep <name>" first; three new start questions: `firebase`, `purchases` (RevenueCat Test Store key first), `keys` (your services' keys and hosts, imported with `secret import`).
- `workflows/build-app.js`:
  - contract: the owner's AdMob App ID and ad ids are never asked (Google's test ids); a recommended option must be deliverable; the Firebase-files question (with the fact) and the RevenueCat question (Test Store key first); images, animations, sounds and the icon of a no-PRD PRD are the source's, a missing image is fetched; the paywall is a criterion (flutter-ads section 7); `decideAll` never "decides" a file, key or host — it takes what is present and the start answers.
  - setup and first group run `secret runconfig`; the final checks run it again and no longer run `copied` (`copiedOk` removed from `done`).
  - the integrator runs the L14 answer checks and fetches missing images; the flow-test writer tests provided keys against the real API and relaunches the app for a later-launch rule; the audit cites L1–L14.
  - Ads phase: no Firebase files → `noFirebase`: one round, wiring checked and audited, ads criteria blocked with the reason, committed.
- `scripts/secrets.mjs`: new `secret runconfig` (`.vscode/launch.json` `toolArgs`, `.idea/runConfigurations/main_dart.xml` `additionalArgs`, README section between `<!-- app-factory:run -->` markers; names only, never a value). Selftest added.
- `scripts/pipeline.mjs`: `pickPhone(…, minSdk)` — `devices pick` reads the app's `minSdk` from `android/app/build.gradle(.kts)` and each phone's `ro.build.version.sdk`; a phone below it is skipped with why. Selftest added.
- `scripts/ads-install.mjs` `template`: writes `templates/flutter/ads/reference/lib/in_app_purchase/app.dart` (the team's premium screen, never installed).
- `skills/flutter-app/SKILL.md`: L6, L12 items 6–8, L13.7, new L14, T1, T4, T8, U12 (the source's Lottie files), U14 (the user's own files; `image` for a missing one).
- `skills/flutter-ads/SKILL.md`: section 1 — Firebase starts AdMob (with file:line), test ids when the owner's are missing, RevenueCat Test Store key; section 2 — one first-launch flag; new section 7 — the premium screen.
- `skills/ads-implementation/SKILL.md`: step 1 checks the Firebase files (missing → steps 2–7 and 9 only, no device rounds); step 8's seeding note.
- `scripts/simulate.mjs`: the copy-check scenario replaced by run configurations at setup and at the end, L14 and image fetching by the integrator, and the no-Firebase ads path (113 `ok` lines). `scripts/simulate-without-prd.mjs`: the start questions include `firebase`, `purchases`, `keys`; the APK step runs `reuse`; the PRD keeps the source theme and has "Reused".
- `GUIDE.md` (sections 4 and 4a), `README.md` (no-PRD, secrets and command rows), `.claude-plugin/plugin.json` 0.53.0 → 0.54.0.

### Checked (all passed)

- `source-app.mjs reuse` on the real Repair Coach AI base APK folder: 17 animations, 3 sounds, 3 launcher icons, 7 fonts, 18 images, each with an `A` id; 4 of the images are ad-network icons (`icon_close`, `icon_skip`, `icon_soundon`, `icon_soundoff`) that the PRD must mark "not used".
- `source-app.mjs image` against the live Openverse API: a CC0 photo saved (1024×683) and credited; `--next 1` passed over `cdn.stocksnap.io`, which answered with an HTML page, and saved the next hit.
- IFM: a request with an empty key → HTTP 401 "You didn't provide an API key"; one 5-token request with the stored key → HTTP 200.
- The Android Studio run configuration field: the installed Flutter plugin 81.0.2 (`instrumented-flutter-idea-81.0.2.jar`, `io/flutter/run/SdkFields.class`) has `additionalArgs` and `filePath`, serialized by `XmlSerializer`.
- Self-tests: `ads-install`, `source-app`, `pipeline`, `secrets`, `notify`, `release-check`, `configure`, `self-configure`. `simulate.mjs`: exit 0, 113 `ok`. `simulate-without-prd.mjs`: exit 0, all ok.

### Not checked

- A full run (no-PRD audit + build) with these rules: no agent has written a PRD with "Reused", run L14 on real answers, fetched images during a build, or built a paywall from section 7.
- A RevenueCat Test Store purchase on a device; the Firebase-files path with real files.
- Opening the written run configuration in Android Studio (the field name is verified from the plugin's class, the dialog was not opened).
- The answer-quality rules of L14 judged on a real model's answers.

## 0.53.0 — 2026-11-04 — commit c912503

**Ads on any app, from the plugin alone:**
- `/app-factory:ads-implementation` and the build's Ads phase copy the team's ads implementation (structure, files, style) into any Flutter app.
- They put the team's ad lines into the app's own screens, launch and purchase code. The app's structure is kept.
- A run needs no folder outside the plugin, never asks, and never stops for a missing piece.

**Before:** a run on another Mac stopped and asked. Its report:
- the team's `lib/ads` calls `showLog()` 109 times and `showToast()` 8 times, both defined in the team app's `custom_widgets.dart`, which the template left out;
- the 9b audit pointed at `/Users/mach/testing/ai_ppt_generater`, which is not on that Mac;
- `RECIPE.md`'s screen hunks mostly remove `/*` from code the team's app had in comments, so an app without that code had nothing to attach them to, and 11 files came out as "by hand";
- the folder had no git repository, so `changes` / `verify` could not run;
- the app's release signing pointed at a keystore of another Mac (`/Users/imac/…/invictes.jks`).

10 files besides this entry, plus 1 new template file.

### Changed

- `scripts/ads-install.mjs`:
  - **`template`** writes the new file `base/lib/widgets/custom_widgets.dart`. It holds the team's `showLog`, `showToast` and `appText` (from the team's `lib/widgets/custom_widgets.dart`) and the font name `appText` uses (`fontFamilyMedium`, from the team's `lib/service/app_constant.dart`), each as the team wrote it, taken by the new `decls()`.
  - **`RECIPE.md`** now:
    - says every file a run needs is in the plugin (`templates/flutter/ads/after/` and `before/`);
    - names the after file in each section instead of the team's folder path;
    - lists "The team's ad lines" for each file wired by hand: the live ad lines of the after file, with the team's line numbers (new `adLines()`; 10 sections).
  - **`SUPPORT`:** the app's own `custom_widgets.dart` counts only when it defines all three of `showLog`, `showToast` and `appText`. Otherwise the installer copies the file from `base/`. The NOT DONE line "the app has no showLog() / showToast() / appText()" is removed. If the app has its own file at the team's path that lacks them, the NOT DONE line names the declarations to copy from `base/`.
  - **Gradle 9:** the table `GRADLE9`. Besides the existing `google_mobile_ads ^7.0.0`, `fluttertoast` is now `^10.0.2` instead of the team's `^8.2.12`.
    - Why: `^8.2.12` resolves to 8.2.14, which is compiled against SDK 33, and AGP 9.1.0's AAR metadata check fails on it ("Dependency 'androidx.fragment:fragment:1.7.1' requires … 34 or later … :fluttertoast is currently compiled against android-33", fresh `flutter create` app).
    - 10.0.2 is what the IPTV app builds with on Gradle 9.3.1.
    - It applies only when the app does not already list the package.
  - **New `base <project>`** prints the `<base>` commit.
    - A folder with no git repository gets one: `git init`, the app as it is in one commit "app-factory: base — the app before its ads" by app-factory, and build output listed in `.git/info/exclude`, so no app file is written.
    - Uncommitted changes → exit 1 with the reason.
  - **New `release <project>`** runs `flutter build apk --release` with `-Pandroid.injected.signing.store.file=~/.android/debug.keystore` (plus the password and alias). The release build for the device checks is signed with this Mac's debug key, whatever the app's own signing config says; that config is not touched.
  - **Selftest:**
    - "template whole": every `package:<team>/` import of `lib/ads` and `base/` is a template file;
    - a fresh app gets the three helpers, and its NOT DONE list no longer has the helper line;
    - Gradle 9 gives `fluttertoast ^10.0.2` and `google_mobile_ads ^7.0.0`;
    - `base` makes a repository without writing an app file, leaves build output out, reuses the commit on a second run, and refuses uncommitted changes.
- `templates/flutter/ads/`:
  - new `base/lib/widgets/custom_widgets.dart`;
  - `RECIPE.md` rebuilt (1474 → 1620 lines);
  - `pubspec_lines.txt` gains `fluttertoast: ^8.2.12`, the team's line, because `base/` now imports it.
- `skills/flutter-ads/SKILL.md`:
  - **Rule:** "the team's implementation, in the app's structure", replacing "the team's change, nothing else". These are the team's, as written: `lib/ads`, `base/`, the Android side, and every ad line (the call, its arguments, condition, widget, place in the tree, order). The app's screens, launch, navigation, state and purchase code stay the app's. The only lines written for an app are ADAPTED lines.
  - **No reason to ask or stop:** a missing helper comes from `base/`, a team screen with no counterpart is `--no-screen`, and a structure difference is handled by ADAPTED lines.
  - **Section 2 rewritten:**
    - the launch rule: an app with a launch screen, an app that picks its first screen in a controller or service, and an app that opens home directly;
    - ad lines read from `after/<file>` at the line `RECIPE.md` lists;
    - where `onTapInter` / `onTapRewardCall` / `checkPurchaseNormal` go (`lib/service/app_constant.dart` when the app has no file of app-wide functions);
    - **hosting a native or banner:** a native goes into the app's own scroll at the team's relative position; a body that is not a scroll taking an extra child (a `GridView.count`, a single widget) is wrapped so the ad sits in a scroll; a widget that lacks ad lifecycle is converted `StatelessWidget` → `StatefulWidget`; a per-screen banner whose job lives inside another screen goes on that screen if it has a scrollable body, else `--no-screen`;
    - **the intro:** an intro with a single button keeps its own button and page logic and gets only the native and the app-open calls — never the team's second button, its F4 `Positioned` region or its `.sp` font ternaries;
    - **the purchase screen:** `UpsellScreen(…)` → the app's purchase screen with the app's own arguments, or none when it takes none (dropping the team's named args is a navigation swap, not an added line); a team function with no tap or action in the app (e.g. `checkPurchaseNormal` where the app limits nothing) goes in as the team wrote it, noted "not called"; no purchase screen at all → `--no-screen`;
    - `resetAdIds()` next to the line where the app records a purchase; an app that records no premium state (a purchase screen that only returns a result) gets the team's `AdsVariable.isPurchase.value = true;` where the purchase succeeds, with `resetAdIds()` next to it;
    - step 4 now lists **six** ADAPTED kinds (every non-team line must be exactly one, and 9b fails any other kind or a false stated fact): **import**; **wrapper** (a post-frame / `async` wrapper — incl. `main()` → `async` with `WidgetsFlutterBinding.ensureInitialized()` + `SharedPreferences.getInstance()` where the team's line reads a `prefs` the app lacks — a `State` member or a parameter); **navigation / state swap** (the app's own nav or state call, incl. the app's purchase-screen constructor); **GetMaterialApp wrap** (`GetMaterialApp` inside `ScreenUtilInit(1242×2688)` for an app without GetX / ScreenUtil); **host** (the `StatelessWidget` → `StatefulWidget` or body wrap above, slot only); **state** (the `isPurchase.value = true` line above).
  - Section 3's helpers paragraph and the `lib/main.dart` NOT DONE line (now the exact `async` + `ensureInitialized` + `getInstance` recipe for an app with no app-wide `prefs`) are updated.
- `skills/ads-implementation/SKILL.md`:
  - the rule and "no question and no stop after step 1";
  - step 1 uses `ads-install.mjs base` (the no-git question is gone);
  - step 3's plan has one row per team ad line plus one per ADAPTED line;
  - step 5 follows flutter-ads section 2;
  - step 8's release build uses `ads-install.mjs release`;
  - step 2/3 wording for the hosting / intro / purchase / state rules;
  - the 9b audit reads the team's files in the plugin (`after/`, `base/`), not `/Users/mach/testing/ai_ppt_generater`, and FAILs an ADAPTED line of an unlisted kind or with a false fact about the app;
  - step 10 reports every ADAPTED line, a git repository made in step 1, and the debug-key release build.
- `workflows/build-app.js`: the ads lines of the coding rule, the audit, the contract rule, the interface step and the first group's step say "the team's ad lines of the team's screen with the same job (RECIPE.md lists them; read them in templates/flutter/ads/after/), nothing but the ADAPTED kinds of section 2 step 4" instead of "the RECIPE.md hunks, nothing of your own". The Ads phase prompt: step 1's `base` finds the build's repository, and gaps are decided by flutter-ads section 2.
- `scripts/simulate.mjs`: the interface check matches the new wording.
- `GUIDE.md` (the ads paragraph) and `README.md` (the `ads-install.mjs` row).
- `.claude-plugin/plugin.json`: version 0.52.0 → 0.53.0.

### Checked (all passed)

- **Signing,** on a fresh `flutter create` app with a release signing config whose keystore does not exist (`/Users/imac/missing/invictes.jks`):
  - `flutter build apk --release` failed: "Keystore file '/Users/imac/missing/invictes.jks' not found for signing config 'release'";
  - with the injected signing it built;
  - `apksigner verify --print-certs`: "CN=Android Debug", SHA-256 6fece323…b36ec, the same as `~/.android/debug.keystore`.
- **The same app, with no git repository:**
  - `ads-install.mjs base` made repository 34449aa;
  - the installer copied `lib/ads`, the eight helpers (the new `custom_widgets.dart` included) and the Android lines;
  - `flutter pub get` passed;
  - `flutter analyze` gave 0 errors (48 infos, 3 warnings) before any wiring;
  - `ads-install.mjs release .` gave PASS (53.1 MB APK). Before the Gradle 9 `fluttertoast` line it failed at the AAR metadata check.
- **End-to-end wiring, by an agent, on an app that is not the team's base** — a plain Flutter + Navigator notes app (no GetX, no ScreenUtil): a launch through a service (not a splash widget), a one-button intro, a `GridView.count` StatelessWidget home, a notebook tap (the `onTapInter` feature), an export action (the `onTapRewardCall` reward), settings, and a no-argument purchase screen that records no premium state. Run twice:
  - **first run** (before the rule additions): it completed with no hard stop, 0 analyze errors, a PASS release build and T1–T3 PASS, but reported six places the four ADAPTED kinds did not cover, where it had to improvise (convert-to-stateful, wrap the body, drop the purchase constructor args, invent a premium line, place a banner, scaffold `prefs`). Those six became the rules above.
  - **second run** (after the additions, from a clean base): every one of the six was covered by a named rule (`host` ×2, the intro rule, a navigation swap, "not called", the `wrapper` recipe, `state`); **no line fell outside the six ADAPTED kinds.** `flutter analyze lib` → 0 errors; `ads-install.mjs release .` → PASS (60.2 MB APK, debug-key signed); `changes . <base>` → T1, T2 (with the 15 reshaped app lines as `--slot-edits`), T3, R3, R4, N1 PASS. Each of the 15 `--slot-edits` was verified by hand to be an app line a team line reshapes (e.g. `GridView.count` → scroll + column, `main()` → `async`, the notebook tap → `onTapInter`), with the app's own behaviour kept inside the new wrapping — no app code lost.
- **Selftests and simulators:**
  - `node scripts/ads-install.mjs selftest`: every line ok, including the new "template whole" and "base ok";
  - `node scripts/simulate.mjs`: exit 0, 111 `ok` lines;
  - `node scripts/simulate-without-prd.mjs`: exit 0.

### Not checked

- **On a device.** Both wiring runs stopped at the release build; no `seen` / `proof` / `stress` / `launch` ran, so no ad was seen on a screen and no crash-free run was proven for 0.53.0. Without a `google-services.json` every id stays `"11"` and no ad renders until seeded or configured (the team's behaviour, kept).
- iOS (not built on this Mac).
- `fluttertoast` 10.0.2 with the team's `showToast` on a device: it compiles (analyze, release build); a toast was not seen.
- The 9b audit agent on the wired app (the wiring runs stopped before step 9b); I3 needs the step-1 before-tests snapshot, which the device stage produces.

## 0.52.0 — 2026-11-04 — commit f4ef044

**Questions only at the start:** `/app-factory:app-dev-without-prd` asks every question of the run in ONE stop, before the audit, and waits for the answers; after that nothing is asked — not after the audit, not by the PRD writer, not by build-app's contract, never during development. Every later gap gets the option closest to the evidence and the answers and is recorded (`source-app/answers.md`, `DECISIONS.md`, PRD.md Sources). Before: up to 5 stops (start, walk failed, gaps before PRD.md, a gap the report found, contract questions). 8 files besides this entry.

### Changed

- `workflows/app-dev-without-prd.js`:
  - the start stop has a new question `walkfallback` (header "If walk fails"), built in the workflow: the devices that apply other than the walk's own first choice (order phone, Play on emulator, plugin emulator) and "Go on without the walk", the first recommended. It is asked with `link`, `apk`, `walk` and `name` (the `name` question offers "Keep <name>" first when PRD.md exists; "Keep " is dropped from the answer).
  - a walk that reaches no screen or returns nothing → a second walk on the `walkfallback` device in the same run (`audit: walk (<mode>)`), no question; both fail, or the answer was no walk → no walk, logged, and the Decide step records "Go on without the walk" as a decision. The `walkfail-<n>` question is removed; `walk` became `walk(mode)` with `deviceFor(mode)`.
  - phase **Questions** → **Decide**: agent `gaps → decisions` decides each gap (id `gap-<n>`, the first option closest to the evidence and the answers) and records it: a "## Decided without asking" section in `source-app/answers.md` ("### gap-<n> · <question>", "Decided:", "Why:"), and DECISIONS.md through `decisions --questions <file> --add` and `--answers` with `by: "decided"`. It never stops the run.
  - Report: no `questions` in its result any more; a late gap is decided and recorded the same way and cited `[decided: gap-<n>]`; Sources lists every decision and every walk tried. `--no-walk` whenever no screen was walked (chosen, impossible, or both walks failed).
  - build-app is started with `"decideAll":true` (the last `nextStep` and both resume paths).
  - `meta` description and `whenToUse`, phase titles, and the shared prompt: "the Source step's questions, asked once at the start, are the only ones of this run".
- `workflows/build-app.js`: `DECIDE_ALL` (`"decideAll":true`): the contract step and the contract re-audit set every question `ask = false`, record it and its first option as answered `by: "decided"`, and return no question; the workflow also drops any question an agent returns in that mode (logged "not asked; their first options apply"). build-app on its own still asks every contract question in its one stop before development. The Ads phase prompt: never ask the user; the project is a git repository, so ads-implementation step 1's no-git question never applies.
- `scripts/pipeline.mjs` `decisions`: answers `by: "decided"` → "decided without asking (questions are asked only at the start) → the option closest to the evidence and the answers"; counted in DECISIONS.md's head and the command's output (`decided <n>`). Selftest: Q8 recorded as decided.
- `scripts/source-app.mjs`: `check` accepts `[decided: gap-<n>]` as a source when `source-app/answers.md` has "### gap-<n> ·" (else "cites gap-<n>, which source-app/answers.md does not record"); `ASSUMED` / `NOT OBSERVED` allowed next to `[user]` or `[decided: gap-<n>]`. `status`: "Decided: Go on without the walk" counts like the answer. Selftest: a recorded decision passes, an unrecorded one fails, the no-walk decision removes the no-walked-screen problem.
- `scripts/simulate-without-prd.mjs`: rewritten for the one stop — 10 states (the stop with `walkfallback`; answered → no other stop; fallback walk in the same run; both walks fail; a dead walk agent; fallback "no walk"; no walk chosen; PRD ready + contract; PRD ready; Repair Coach), 32 `ok` lines; every state checks that no question other than the start ones is returned.
- `scripts/simulate.mjs`: 2 scenarios — `decideAll` contract (no question reaches the user even when the agent returns one) and `decideAll` re-audit. 111 `ok` lines.
- `GUIDE.md` section 4a (the one stop, `walkfallback`, Decide, the `[decided: gap-<n>]` tag, `decideAll`), the build table's step 2 and the contract re-audit paragraph. `README.md`: the no-PRD row.
- `.claude-plugin/plugin.json`: version 0.51.0 → 0.52.0.

### Checked (all passed)

- `node scripts/simulate.mjs`: exit 0, no `FAIL` line. `node scripts/simulate-without-prd.mjs`: exit 0, `all ok`.
- `node scripts/source-app.mjs selftest`, `node scripts/pipeline.mjs selftest`, `node scripts/notify.mjs selftest`, `node scripts/configure.mjs selftest`, `node scripts/self-configure.mjs selftest`, `node scripts/release-check.mjs selftest`.
- `grep` over `agents/` and `skills/`: the tester agent and the QA skill already say never to ask during a run; ads-implementation step 1's no-git question is covered by the Ads phase prompt.

### Not checked

- A real run: no start stop shown from a workflow's `nextStep`, no fallback walk on a device, no `gaps → decisions` agent on real evidence.
- `/app-factory:build-app` on its own still has a second stop before development when PRD.md has no Figma link and `noFigma` is not given (the Figma question comes before the contract questions).

## 0.51.0 — 2026-11-04 — commit f4ef044 (one commit with 0.52.0)

**Re-audit, then continue — never restart:** fired in a folder that already has the source evidence, PRD.md, CONTRACT.md and code, `/app-factory:app-dev-without-prd` re-audits PRD.md (only what is missing or fails the current check), `/app-factory:build-app` re-audits CONTRACT.md against PRD.md, and the build continues from the code: criteria whose tests pass are kept, changed and added ones are built, a removed one's own code is deleted. 9 files besides this entry.

### Changed

- `workflows/build-app.js`, contract stage with CONTRACT.md present (both commands; before: "left unchanged — run again with stage build", or with stage `all` "use it unchanged"): a **re-audit** — PRD requirement without a criterion → new criterion, next AC number ("added"); a criterion whose input, output, text, number or limit PRD.md now states differently → rewritten under the same AC id ("changed"); a criterion with no PRD line, question id or ASSUMED mark → section "Removed criteria" ("removed"), registered `blocked "removed by the contract re-audit"` so `coverage` does not ask for its test; a matching criterion is not touched; ads placements go into the last group `ads`; new gaps → questions with the next Q ids, recorded with `decisions --questions <file> --add`. Returns `reaudit {changed, added, removed}`; the contract stage logs the three lists and passes them to the build stage in its args (`"reaudit":{"changed":[<ids>],"added":[<ids>],"removed":[<ids>]}`).
- `workflows/build-app.js`, build stage: `REAUDIT` (args, or this run's own with stage `all`); a changed or added criterion is not `done` even when an old test named after it passes, and its group's prompt says to make its code and tests match the new line; the first integrator / gate round deletes the code, screens and tests that serve only a removed criterion. The existing work step ignores the "Removed criteria" section. Answers: each one applied once — an id already in `.pipeline/answers.json` is skipped (before: all skipped once that file existed, so a re-audit's answers were never applied).
- `scripts/pipeline.mjs` `decisions`: `--answers` adds to the recorded answers (a later answer with the same id replaces the earlier one); `--questions <file> --add` adds to the recorded questions; without `--add` questions still replace. Selftest: Q7 added and answered with Q1–Q6 and their answers kept.
- `scripts/source-app.mjs` `status`: `staticMissing` — what a `static.md` from before 0.49.0 lacks: `layouts` (no `## Layouts`), `data` (no `## Data in the code`), `hashes` (no `source-app/res-hashes.txt`). On Repair Coach: `["layouts","data","hashes"]`, `prdProblems` 137.
- `workflows/app-dev-without-prd.js`:
  - the resume decision moved from the Source agent into the workflow: PRD.md with 0 problems and no `staticMissing` part that the APK in the folder can add → no audit, `nextStep` = `/app-factory:build-app {"noFigma":true}` (its contract stage re-audits an existing CONTRACT.md; before: `{"stage":"build"}`, which used the contract unchanged); otherwise the PRD is re-audited (log "re-auditing PRD.md: <n> check problem(s); static.md lacks <parts>"), CONTRACT.md and `lib/` kept.
  - new agent `audit: APK files (missing parts)`: with `staticMissing` and an APK, only steps 8–10 (layouts, code data, hashes — now one shared text, `STATIC_EXTRA`) are done and appended to `static.md`; no other line of it changes.
  - no `walk` question when `walk.md` already has a screen; with PRD.md present, the `name` question's first option is "Keep <the PRD's name>".
  - the last `nextStep` says build-app re-audits the CONTRACT.md already there and continues the code in `lib/`.
- `scripts/simulate.mjs`: 2 scenarios — CONTRACT.md present → re-audit prompt, the lists logged and passed on, no "left unchanged"; build after a re-audit → AC1 (changed, its old test passing) rebuilt, AC2 kept, AC9's code deleted by the integrator, answers applied one by one. 109 `ok` lines.
- `scripts/simulate-without-prd.mjs` (68 lines): scenario 8 now expects `{"noFigma":true}` and the re-audit; new scenario 11 (Repair Coach's `status`: contract, 127 `.dart` files, 137 PRD problems, `staticMissing` all three, no walk chosen) → `source, audit: APK files (missing parts), gaps, report` only. 11 states, 30 `ok` lines.
- `GUIDE.md` section 4a: the earlier-work table (PRD ready / PRD re-audit / evidence only) and a "Contract re-audit" paragraph; the existing work paragraph names the rebuilt and deleted criteria. `README.md`: build-app step 1 and the no-PRD row.
- `.claude-plugin/plugin.json`: version 0.50.0 → 0.51.0.

### Checked (all passed)

- `node scripts/simulate.mjs`: exit 0, no `FAIL` line. `node scripts/simulate-without-prd.mjs`: exit 0, `all ok`.
- `node scripts/source-app.mjs selftest`, `node scripts/pipeline.mjs selftest`, `node scripts/notify.mjs selftest`, `node scripts/configure.mjs selftest`, `node scripts/self-configure.mjs selftest`, `node scripts/release-check.mjs selftest`.
- `node scripts/source-app.mjs status "/Users/mach/testing/repair coach"` → `"prdProblems":137,"staticMissing":["layouts","data","hashes"],"contract":true,"dartFiles":127`.

### Not checked

- A real re-audit: no agent compared a real CONTRACT.md with a real PRD.md, and no build ran with a `reaudit` list.
- A build stopped half-way after a re-audit and continued later without the `reaudit` args: a changed criterion whose old test still passes would then count as done.
- The SwiftUI stack: no existing work step, so every group is built (unchanged from 0.48.0).

## 0.50.0 — 2026-11-04 — commit 5381789

**Ads fixes found on the IPTV app (2026-10-30 to 2026-11-03):** the splash interstitial on a fresh install, a build on Gradle 9, `config.json` keys added after the wiring, a release build that hangs on its launch screen, a system crash read as the app's, and Facebook's `"11"`. These are the uncommitted ads changes listed under "Not in this version" in 0.47.0, 0.48.0 and 0.49.0. 7 files besides this entry.

### Changed

- `scripts/ads-install.mjs`:
  - `install`, `lib/main.dart`: `isFirstTimeVisited = <prefs>.getBool("isFirstTime");` becomes `isFirstTimeVisited = <prefs>.getBool("isFirstTime") ?? false;`, as the team's `main.dart:16`. Left null on a fresh install, `loadInterSplash` (`isFirstTimeVisited != null`) skips the splash interstitial. A `main.dart` that never sets it → a NOT DONE line: add the team's line before `runApp`.
  - `install`, `pubspec.yaml` (an app not on the team's base): with `android/gradle/wrapper/gradle-wrapper.properties` at Gradle 9 or newer, `google_mobile_ads: ^7.0.0` instead of the team's `^5.3.1` — 5.3.1 calls `configurations.all`, which Gradle 9 removed ("unknown property 'all'", IPTV on Gradle 9.3.1); the line says so.
  - `install`, `config.json`: written again on every run — a key `lib/ads/ads_splash_utils.dart` reads and the file lacks is added, a value already there is kept (before: written only when missing, so an app whose ad lines were still commented got 28 keys and no ad id).
  - `changes` T2: `lib/main.dart`'s `isFirstTime` line is not reported as gone (the installer adds `?? false`).
  - `crashMine(text, pkg, pids)`: the crash buffer lines that hold the app's package or one of its pids; `health` (used by `seen`) reports only those — a system process crash (Bluetooth SIGABRT after an emulator boot) is not the app's.
  - `launch`: FAIL "the app never drew its first screen" when logcat has no `Displayed <package>/` line after the watch (the IPTV release build hung on its launch screen with its process up); the `seen` cursor starts at the cleared log, so an ad shown during the launch (the splash ad) counts.
  - `CHECKER` 2 → 3: `seen` / `launch` / `stress` records from before this version are STALE.
  - `selftest`: the fresh app's NOT DONE list ends with `lib/main.dart`; a second `install` turns `getBool("isFirstTime");` into `?? false;`; `crashMine` drops a Bluetooth SIGABRT and keeps the app's FATAL EXCEPTION (2 lines) and its native crash (1 line).
- `scripts/release-check.mjs`: O8 — `facebookId` / `facebookToken` in `config.json` still `"11"` or empty → an owner item: Facebook rejects `"11"` (GraphResponse 400, errorCode 190, IPTV on the emulator); `selftest` covers both flagged and real values.
- `templates/flutter/ads/config.json`: `nativeHome` `"11"` → Google's native test unit `ca-app-pub-3940256099942544/2247696110`.
- `skills/ads-implementation/SKILL.md`: step 2 finds block-comment slots with `grep -rn "/\*" lib` (the IPTV home native was one); step 4 says the installer's second run adds `config.json` keys and still lists a file wired by hand; step 5.2: an app line that is the team's expression with its own value gets the team's line with the app's value in place of the team's old one, noted for `--slot-edits`.
- `skills/flutter-ads/SKILL.md`: section 1 (Facebook `"11"`, O8); section 2 (the IPTV intro image `sw * 0.9` → the team's ternary with `sw * 0.68 : sw * 0.9`); section 3 (the `main.dart` line); T2 (the `isFirstTime` exception).
- `GUIDE.md` (ads section: Install, Remote Config) and `README.md` (the `ads-install.mjs` and `release-check.mjs` rows: the `main.dart` line, the T2 exception, O6, O7, O8).
- `.claude-plugin/plugin.json`: version 0.49.0 → 0.50.0.

### Checked (all passed)

- `node scripts/ads-install.mjs selftest` (8.3 s): template = the builds, T1 T2 T3 R3 R4 N1, merge, fresh install, changes, crash detection, placements / proof, reset.
- `node scripts/release-check.mjs selftest`.

### Not checked

- The Gradle 9 `google_mobile_ads` `^7.0.0` line: no selftest has a Gradle 9 wrapper; the reason in the code is the IPTV build of 2026-10-30, not a run in this version.
- `launch`'s "never drew its first screen" check and the cursor change: they need a device; no run in this version.
- The skill texts were not run by an agent.

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
