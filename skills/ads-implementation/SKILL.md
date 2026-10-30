---
name: ads-implementation
description: Adds the team's ads + Remote Config implementation (skills/flutter-ads — the team's own change to its AI PPT app, applied by ads-install.mjs) to a Flutter app that is already built, in the folder open in this window — lists the ad slots the app prepared, applies the team's change (whole files where the app's are the team's base, a 3-way merge elsewhere), wires the rest from RECIPE.md hunk by hunk, verifies on a device, audits every change against the team's diff and reports. Use only when the user types /app-factory:ads-implementation.
disable-model-invocation: true
---

# Add ads + Remote Config to an existing Flutter app

Read `${CLAUDE_PLUGIN_ROOT}/skills/flutter-ads/SKILL.md` in full before step 2. Its rule is this command's rule: **the team's change, nothing else** — every ads line comes from the team's change (`${CLAUDE_PLUGIN_ROOT}/templates/flutter/ads/RECIPE.md`, PPT file:line) or is the app's own ad code switched on from a comment. Never IPTV_two, never a line of your own, never a fix of the team's code. This command adds ads and nothing else: a bug found on the way is reported, not fixed.

## 1. Check the folder and the device — stop at the first failure and say why

- `pubspec.yaml` with `flutter:` and an `android/` or `ios/` folder. Otherwise: "Not a Flutter app."
- A git repository with nothing uncommitted (`git status --short` prints nothing). Uncommitted changes → stop: "Commit or stash your changes first, so this change is one commit you can revert." No git repository → say no `ADS_CHANGES.md` can be made and the change cannot be reverted, and ask whether to go on.
- Earlier ads work by app-factory is undone first: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ads-install.mjs" reset "$(pwd)"` — it reverts every `app-factory: ads…` commit and removes the files an earlier app-factory version installed (its own names: `lib/ads/app_variable.dart`, `remote_config.json`, `lib/premium_core/` …) only when the app's first commit does not have them. **It never removes a file the app had.** Exit 1 → stop and quote it. Record `git rev-parse --short HEAD`: `<base>` of steps 8–9.
- The app's tests before anything changes: `"<flutter>" test -j 4 -r failures-only --file-reporter json:.dart_tool/ads_tests_before.json`. Quote the result line; a test failing here is reported, not fixed.
- A device, picked without asking: `node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" devices pick android` (else `ios`). Use its `serial` / `udid` from here on; put its `skipped` line in the report. Android: `pipeline.mjs maestro-install` once.

## 2. What the app already has — read, change nothing

- **Its slots** — the ad code it left in comments: `grep -rnE "^\s*(//|/\*|\*).*\b(AdsVariable|AdsLoadUtil|AdsSplashUtils|AppOpenAdManager|onTapInter|onTapRewardCall|checkPurchaseNormal|NativeAdsWidget|BannerWidget|CollapsibleBannerWidget|showPrivacyOptionsForm)\b" lib`, the block comments around them (`/* … */` over several lines: read the file), `grep -n "^#.*google_mobile_ads\|^#.*purchases_flutter" pubspec.yaml`, and `MainActivity.kt` (a commented factory block). List each: file:line, what it is.
- **Its own ads files** — `ls lib/ads lib/AdsUtils lib/in_app_purchase 2>/dev/null`; in `lib/ads/ads_splash_utils.dart` its Remote Config parameter (`getValue("…")`) and its empty blocks.
- **Its screens** — the app's file for each job of flutter-ads section 2's table (splash, intro, home, the `onTapInter` list, the reward-gated action, settings, the purchase): file and the tap that opens each. On the device (`flutter run -d <id>`): each screen once, its element list and one screenshot (`${CLAUDE_PLUGIN_ROOT}/skills/app-qa/SKILL.md` E2, E8: elements from the element list, never coordinates off a screenshot). Stop `flutter run`.

## 3. The plan — a table, nothing in it of your own

One row per RECIPE.md hunk: team file:line | the app's file (flutter-ads section 2's job table) | done by the installer / by hand / no such screen (`--no-screen`). Then one row per slot of step 2 the recipe does not cover. Nothing else. Do not ask the user about placements.

## 4. Install

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ads-install.mjs" "$(pwd)" && "<flutter>" pub get
```

Quote its lines (flutter-ads section 3 says what each does). `NOT DONE` lines are done in step 5, then it runs again until it prints none. What it wrote is never redone or edited by hand.

## 5. Wire — what the installer left, from RECIPE.md

flutter-ads section 2, exactly:
1. **The app's slots.** Remove the comment markers around the app's ad code and nothing else, and add the imports it needs, using the app's own paths.
2. **Each NOT DONE file, RECIPE.md section by section.** Find the app's file with the same job. Each hunk's `+` lines go in as the team wrote them, at the same place relative to the same code; only a name of the team's app that the app lacks is replaced with the app's own. A `-` line is removed only where the app has the same line, noted for `--slot-edits <file:line at base>`. A team file the app has nothing for is noted for `--no-screen <team file>`.
3. **No line of your own.** Not even where the team's code looks wrong: the PPT intro hides Continue while the intro native is on and shows its own Next/Done, and both go in as the team has them.
4. **Keep each file's line endings.**
5. Then run `"<flutter>" analyze` and fix only what the ads lines broke.

## 6. Contract (only in an app-factory project: CONTRACT.md and `.pipeline/` present)

CONTRACT.md section 9: the table of step 3. Section 3: a `### ads` group, one criterion per row, numbered after the highest AC; section 5: `ads — AC…` last. `pipeline.mjs feature <ACn> failing "<title>"` for each, `… group ads <ACn…>`; after step 8 passes, `feature <ACn> passing`.

## 7. Tests (app-factory project only)

Per criterion one widget test named "ACn …" that the ad widget of its row is on its screen once `AdsLoadUtil.isNativeAdLoaded.value = true` (natives) and gone with `AdsVariable.isPurchase.value = true; AdsVariable.resetAdIds();` — mock the `dev.fluttercommunity.plus/connectivity`, `PonnamKarthik/fluttertoast` and `nativeChannel` channels.

## 8. Verify — quote each result line

`node "${CLAUDE_PLUGIN_ROOT}/scripts/ads-install.mjs" verify "$(pwd)" <base> [--slot-edits <file:line,…>] [--no-screen <team file,…>]` (Bash timeout 600000): analyze (errors fail; a warning fails only in a line the ads work wrote — one in a file it did not touch is the app's own, one in a line of the team's code is the team's, both listed; infos are listed), the whole test suite (an app with no tests passes it) (a test that passed in step 1 and fails now was broken by the wiring: fix the wiring, never the test), the debug builds, then step 9's report. Then on the device of step 1, `flutter run -d <id>` and each row of the table with a screenshot:
- a full-screen ad: Android `adb -s <id> shell dumpsys activity activities | grep topResumedActivity` = `com.google.android.gms.ads.AdActivity`; the log (`showLog`) has `onAdImpression loadInterSplash` for the splash interstitial;
- the device has no `google-services.json` values → every id is `"11"`: seed the last online launch instead — debug build, `adb -s <id> shell run-as <applicationId>` writes `shared_prefs/FlutterSharedPreferences.xml` with `flutter.<key>` = the `config.json` values (ints as `<long>`), then launch;
- first launch: splash interstitial → the intro as the team's (PPT: with `nativeIntroBig` on, the big native under the text and Next / Done at the top right, no Continue), every intro page whole (nothing drawn over the native or cut off) → Done → intro app open → Home; the home native in its slot; a home feature tap → "Loading..." → interstitial, Back, next tap → interstitial; each banner screen; the reward action → the rewarded ad, then the action; Settings' privacy row where consent requires it; Home key, ~10 s, reopen → app open ad;
- on every screenshot nothing of the app covers an ad;
- **no crash, enforced by the tool** (flutter-ads section 6), not by looking: the walk starts with `ads-install.mjs launch "$(pwd)" <serial> build/app/outputs/flutter-apk/app-debug.apk` (clears the app's data, clears the logs, starts it, watches it 30 s) and every `seen` re-checks the crash buffer, the process id, ANRs and uncaught exceptions in the ad code. A relaunch in the middle of the walk is only `launch … --keep-data`; a hand-made `am start` changes the pid and is reported as a crash;
- **release, then stress on it:** `flutter build apk --release` (stop the emulator and the Gradle daemons first on a small Mac), `ads-install.mjs launch "$(pwd)" <serial> build/app/outputs/flutter-apk/app-release.apk` (R8 and the release engine are where the earlier launch crash was), then `ads-install.mjs stress "$(pwd)" <serial> 600`: 600 random touches, drags and app switches (monkey, seed 1, no system keys: a device with no physical keys makes monkey exit with -5 otherwise). `stress` runs on the release build because that is what ships: on a debug build in a 2 GB emulator the app ANRs under monkey at 108 % CPU with 22,000 page faults in 10 s, which says little about a user's phone. It FAILS on a crash, an ANR or a monkey abort, keeps monkey's last 150 events in `.dart_tool/ads_stress.log`, and an ANR is diagnosed with `adb shell dumpsys dropbox --print data_app_anr` (the main thread's stack and the CPU per process). It can press anything the app has, including the app's own server calls: a test device only. `proof` needs both PASS on the final code.

A crash found by `launch`, `seen` or `stress` is fixed in the wiring, or reported with its log lines when it is in the team's own code: the log line with its file:line is quoted, the cause is found from the code, the fix is a named exact replacement like flutter-ads' F1–F4 and only that, never a guard that hides the error. Every record is for the code it was made on: after a fix `proof` shows every earlier PASS as STALE, so the walk, `stress` and the release launch are done again.
**Every ad seen** (flutter-ads section 6), not optional:
1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/ads-install.mjs" placements "$(pwd)"` gives the list.
2. For each placement, open its screen on the device and wait for its ad. A native or banner must be scrolled fully on screen. A rewarded ad is reached by using up the free uses: a debug build, `run-as` writing the use counter into `shared_prefs`, the same way as the seeded values.
3. Run `ads-install.mjs seen "$(pwd)" <serial> <file:line>` and quote its PASS / FAIL line.
4. Open the screenshot it saved. Anything of the app drawn over the ad is a FAIL.
5. A FAIL is fixed in the wiring (a native cut off by its parent, a banner under another widget) and seen again. An ad that does not load is not a wiring fault: quote the SDK's error line from logcat (`Ads` tag).
6. `ads-install.mjs proof "$(pwd)"` must exit 0 before step 9, and its lines go into the report. It needs every placement PASS, the debug `launch`, the release `launch` and `stress`, all for the code as it is now.

Then stop `flutter run`; on a real phone uninstall the app and put back every setting you changed; a device `devices pick` started is stopped (`adb -s <serial> emu kill`), never deleted.

## 9. Record what changed — then 9b, then commit

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ads-install.mjs" changes "$(pwd)" <base> [--slot-edits <file:line,…>] [--no-screen <team file,…>]
```

It writes `ADS_CHANGES.md` from git (never edit it, never write it yourself): every file added, changed or deleted since `<base>` with its diff, and the checks of flutter-ads section 5 — T1 the team's change is in, T2 the app's lines kept, T3 no ad code of its own, R3 the slots live, R4 the Remote Config parameter, N1, I2, I3. Every check must PASS. A FAIL is fixed in the wiring — never by deleting an app line, editing a line the installer wrote or the report — then step 8 and this command run again. A `--slot-edits` line is only an app line a team hunk replaces; 9b judges each.

### 9b. Audit — a separate agent, before the commit

Start an agent (Agent tool, general-purpose) that changes nothing, with this task:

> Audit the ads work in `<app path>`. Read `ADS_CHANGES.md` (every diff since `<base>`), `${CLAUDE_PLUGIN_ROOT}/templates/flutter/ads/RECIPE.md` (the team's change, with the team's file:line in `/Users/mach/testing/ai_ppt_generater`) and the plan table (pasted below). For every hunk in the app's files write one row: file:line | what changed | its source, which is the RECIPE.md hunk it applies (team file:line) or the app's slot it switches on (file:line at `<base>`: `git show <base>:<file>`) | PASS or FAIL. Open the source and compare: FAIL when the hunk has no source; differs from its source (another condition, value, size, key, widget, callback, position, order) other than a team-app name replaced with the app's own name for the same thing (say which); adds a line the team's hunk does not have; removes an app line the team's hunk does not remove; or a recipe hunk for a file the app has is missing (a plan row with no hunk). A file the installer wrote whole as the team's (its report line "the team's file") is one PASS row after `cmp` with the team's file, with the app's names. Change nothing. Return the table and the FAIL rows.

Every FAIL is fixed, then steps 8, 9 and 9b run again until 9b has no FAIL. Then, in an app-factory project: `git add -A && git -c user.name=app-factory -c user.email=app-factory@localhost commit -q -m "app-factory: ads"` — local only, never push; elsewhere leave it uncommitted and list the files.

## 10. Report to the user, in this order

The slots found (step 2) and the plan table with each row's source; `ADS_CHANGES.md`'s Checks section, quoted; the 9b table (every row) and what each FAIL fix changed; each step-8 result line, the `proof` lines (every placement PASS with its screenshot); what is not verified and why (iOS on this Mac; no Firebase files → seeded values; the team's behaviours kept, flutter-ads section 4); each team-app name replaced in step 5; before release: the owner's AdMob App IDs (`AndroidManifest.xml`, `Info.plist`), the real ad unit ids in Remote Config under the app's parameter, the app's RevenueCat keys in `lib/in_app_purchase/constant.dart` when the installer wrote it.
