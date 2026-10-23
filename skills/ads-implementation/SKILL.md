---
name: ads-implementation
description: Adds the team's ads + Remote Config pattern (skills/flutter-ads, templates/flutter/ads) to a Flutter app that is already built, in the folder open in this window — explores the entire app (its code, then every screen on a device), decides every placement from the pattern's table, installs, wires, adds the criteria and tests, verifies on the device and reports. Use only when the user types /app-factory:ads-implementation.
disable-model-invocation: true
---

# Add ads + Remote Config to an existing Flutter app

`/app-factory:build-app` puts this pattern into every new app by itself. This command is for an app that is already built, or was built without ads. Do the steps in order. The rules — where each ad goes, the wiring, the Remote Config keys, Premium, the tests — are in `${CLAUDE_PLUGIN_ROOT}/skills/flutter-ads/SKILL.md`: read it in full before step 2. The installed files are never rewritten; the app only calls their API. This command adds ads and nothing else: a bug found on the way is reported, not fixed. Everything the app already does must keep working: the backend (`lib/data/`, `lib/domain/`) only gains the calls flutter-ads section 7 allows, no existing test is changed, and every test that passed before still passes — step 9's checks I1–I5 prove it from git and the test results, and P1–P9 prove the ads follow the common_flow_demo pattern.

## 1. Check the folder and the device — stop at the first failure and say why

- `pubspec.yaml` with `flutter:` and an `android/` or `ios/` folder. Otherwise: "Not a Flutter app."
- A git repository with nothing uncommitted (`git status --short` prints nothing). Uncommitted changes → stop: "Commit or stash your changes first, so this change is one commit you can revert." No git repository → say the change cannot be reverted with git and that no `ADS_CHANGES.md` (step 9) can be made, and ask whether to go on. Record `git rev-parse --short HEAD` now: it is `<base>` in step 9.
- The app's tests as they are, before anything changes: `"<flutter>" test -j 4 -r failures-only --file-reporter json:.dart_tool/ads_tests_before.json`. Quote the result line. A test that fails here already failed before the ads work: report it, do not fix it (step 9's check I3 counts only the tests that passed here).
- CONTRACT.md section 9 quotes a PRD line saying the app has no ads → tell the user and go on only if they confirm.
- `lib/google_ads_material/` already there → `diff -r "${CLAUDE_PLUGIN_ROOT}/templates/flutter/ads/lib/google_ads_material" lib/google_ads_material`; list every difference that is not one of flutter-ads section 2's allowed additions (new keys, slots, flags). Do not install again; do steps 2, 3 and 5–10 for what is missing.
- A device with internet. First a connected phone: `node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" devices real` — an Android phone when the app has `android/`, else an iPhone. An Android phone must be awake and unlocked (a locked screen hangs device work): `adb -s <serial> shell input keyevent KEYCODE_WAKEUP`, then `adb -s <serial> shell dumpsys window | grep -o "isKeyguardShowing=[a-z]*"`; `true` → swipe up once (`adb -s <serial> shell input swipe 360 1400 360 300 200`), wait 1 s, check again; still `true` (the phone has a code) → use the emulator below instead and tell the user why. An app launched behind the lock screen never gets focus: `wait-app` then reports not ready.
  **No phone (or a locked one): start the plugin's own device** — `node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" devices up android` when the app has `android/`, else `devices up ios` (macOS). It creates the emulator `af-standard` (or the simulator `app-factory-iphone-17`) when it does not exist, frees memory only by shutting down the plugin's own simulators, starts it in its window, waits until it has booted and settled, and prints `"serial"` (or `"udid"`) — use that id in every later step. Measured on this Mac: created, booted and settled in 132 s; started again in 52–60 s; 0.4 s when it is already running. The whole step 8 passed on it (7 device tests, every placement and exit by hand). It never uses or changes the user's own emulators and simulators. If it fails, its message says what is missing (the system image, Java, memory, disk) — do that, then run it again; there is no other way to get a device. An emulator or simulator has no photos: a picker opens empty, which is enough to check it leaves and returns.
  Android: `pipeline.mjs maestro-install` once (the element list needs it). iOS simulator: `npx -y mobilecli agent install --device <udid>` once per new simulator (mobile-mcp's element list needs it).

## 2. Explore the entire app — before changing anything

Read `${CLAUDE_PLUGIN_ROOT}/skills/app-qa/SKILL.md` rules E2 and E8 first: elements are found and tapped from the element list (Android `read_screen`, iOS mobile-mcp), never by coordinates read off a screenshot; after a launch, `pipeline.mjs wait-app`, never a fixed pause.

**a. From the code — the full list.** Every route, pushed screen, modal, bottom sheet and dialog, each with its file, the screen that opens it and the tap that does. Then: home (the first screen a returning, logged-in user sees); tabs and their roots; the text fields of each screen; a splash screen, onboarding, Premium / paywall screen, store purchase, reward (credits, an unlock); every call that leaves the app — `grep -rnE "Share|share_plus|launchUrl|url_launcher|in_app_review|requestReview|openStoreListing|buyNonConsumable|buyConsumable|restorePurchases|ImagePicker|FilePicker|camera|openAppSettings|mailto:|tel:" lib`. Then the app's own ads and Remote Config code, which the pattern replaces — `grep -rnE "FirebaseRemoteConfig|MobileAds\.instance|(Interstitial|AppOpen|Rewarded|RewardedInterstitial)Ad\.load|BannerAd\(|NativeAd\(|getValue\(" lib --include=*.dart | grep -v google_ads_material` — with every value it reads from its own Remote Config key; the purchase check (where it runs, and whether it runs only inside another fetch) and the rule it uses for Premium; and any connectivity check in front of the startup.

**b. On the device — the app as it is now.** `flutter run -d <id>`, then visit every screen of the list once, in the order taps reach it: from launch, through logging in when the app has accounts (a test account from CONTRACT.md, the seed data or the README; none → register one in the app), every tab, every pushed screen, modal and sheet. Tap a text field and wait 1 s before `input text` (typed earlier, the first letters are lost). On a real phone never pick from the owner's photos or files: a screen behind that is mapped from the code and marked so. On each screen read its element list and record: how you got there, every element that opens another screen and which screen it opens, the text fields, every element that leaves the app. One screenshot per screen. After each screen read the app's log (app-qa section 2); an error there goes in the report.

**c. The app map.** Compare a and b: a screen in the code that the device never reached, or one the device showed that the code list missed, is reached the way the code gives — or listed as "not reached" with the reason. The map has one row per screen: screen | reached from (screen, tap) | taps that open another screen | text field | leaves the app. Stop `flutter run`. Write no file.

## 3. Decide every placement from the pattern

Each row of the map gets its row of flutter-ads section 2 — the pattern decides; do not ask the user which taps count or which banner type:
- home's feature entries are exactly the map's "taps that open another screen" on home, except settings, premium, credits and the bottom navigation;
- a screen with a text field gets no banner; a screen pushed from home or a tab without one gets the adaptive banner;
- tab roots and the tab bar are "Home — bottom navigation": no ad;
- every "leaves the app" entry gets `AppResumeAdListener.skipNextResume()` right before its call;
- inner-screen action buttons (not back) reset the home counter;
- splash, onboarding, Premium and rewarded rows only when the map has that screen or reward.

Write the table: screen | ad | trigger / position | Remote Config keys | code | why this row.

## 4. Install

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ads-install.mjs" "$(pwd)" && "<flutter>" pub get
```

If it prints `NOT DONE`, add exactly the lines it prints and run it again.

## 5. Wire

As flutter-ads section 3 says, including its "App shapes" list (no splash screen, `go_router`, no onboarding, no paid tier, tabs). The Remote Config key is `<pubspec name>_v1`. Every placement exactly as the table of step 3; `skipNextResume()` before every call in the map's "leaves the app" column; `block()`/`unblock()` on every Premium screen; `AdTapHelper.resetHome()` on inner-screen action buttons (not back). Code under `lib/data/` and `lib/domain/` imports only `ad_flags.dart`, `ads_id.dart` and `app_open_ad_manager.dart` (flutter-ads section 7). Also, as flutter-ads section 3 says (checks P10–P15 in step 9):
- the crash-report step 1b right after `RemoteConfigLoader.load`, inside `if (RemoteConfigState.firebaseReady)`;
- the startup on every launch, online or offline — a connectivity check in front of it (step 2a) is moved behind it, never around it;
- the app's own ads and Remote Config code of step 2a is replaced: its ad loads, SDK start and Remote Config fetch leave the startup and the screens; each value it read from its own key goes into `assets/remote_config_default.json` with the same value and is read with `AdsId.get(key, default)`; the purchase check that ran inside that fetch runs on its own as startup step 3, unchanged. Report every moved key: the owner publishes it under `<pubspec name>_v1` before release;
- an ads package the app already had at another version is set to the tested version (flutter-ads section 1), then `"<flutter>" pub get`.

## 6. Contract (only in an app-factory project: CONTRACT.md and `.pipeline/` present)

- CONTRACT.md section 9: the table of step 3 and one line per screen with no ad and why.
- Section 3: a `### ads` group with one criterion per placement, numbered after the highest existing AC.
- Section 5: `ads — AC…` as the last group.
- Register them: `node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" feature <ACn> failing "<criterion title>"` for each, then `… group ads <ACn…>`; after step 8 passes, `feature <ACn> passing` for each.

## 7. Tests

The installed `test/google_ads_material/` and `integration_test/ads_device_test.dart` stay as they are. Per criterion one widget or unit test whose name starts with its id ("AC47 …") and checks the wiring in the app's own screens, with the SDK not started (`AdFlags.adsReady` false, so no platform call):
- the ad widget is on its screen and absent on the screens the table excludes;
- a home feature tap increases `AdFlags.homeFlag` and still navigates at once when no ad is ready; an inner action resets it to 0;
- home sets `AppResumeAdListener.enabled`;
- each call that leaves the app sets the skip window: `AppResumeAdListener.shouldShowOnForeground()` is false right after it (mock the plugin's method channel);
- with a paid tier: Premium shows no ad widget anywhere;
- the launch step, in `integration_test/`, as flutter-ads section 6 says (the splash ad switched off for the run, its loading checked on its own).

## 8. Verify — every check must pass; quote each result line

1. `flutter analyze` — no issues.
2. The whole test suite: `flutter test -j 4 -r failures-only --file-reporter json:.dart_tool/ads_tests_after.json` — the app's existing tests too. A test that passed in step 1 and fails now was broken by the wiring: fix the wiring, never the test.
3. In an app-factory project: `pipeline.mjs coverage` and `pipeline.mjs deps`.
4. `flutter build apk --debug` (Android in the app); `flutter build ios --simulator --debug` on a Mac. firebase_core 5 needs Xcode 26.2 or newer (built with Xcode 27.0): an older Xcode fails resolving `firebase-ios-sdk` — quote its error line and report iOS as not built for that reason, not as passing. `Flutter.framework/Flutter does not exist, cannot thin` is Flutter's own cache missing its simulator engine: `flutter precache --ios --force`, delete `build/ios`, build again.
5. On the device of step 1: `flutter test integration_test/ads_device_test.dart integration_test/<the launch test> -d <id>` — all pass. On iOS, a fresh install first shows Google's tracking explainer and then the tracking prompt (flutter-ads section 1): while the tests run, tap **Continue**, then **Allow**, found in the element list, once per test file. A banner `LoadAdError(code: 3 …)` is Google's no-fill: re-run that test once (`--plain-name "adaptive banner loads"`); a second failure is a failure.
6. `flutter run -d <id>` once (a debug build opened any other way stayed on the iOS launch screen with no Dart running) and walk the table, with a screenshot at each point. Android: `adb -s <id> shell dumpsys activity activities | grep topResumedActivity` — `com.google.android.gms.ads.AdActivity` is a full-screen ad. iOS: judge every ad from the screenshot — mobile-mcp's element list showed the app's own screen under a full-screen ad and never lists a banner; reopen with `xcrun simctl launch <udid> <bundle id>` (brings the running app forward: the same pid in `xcrun simctl spawn <udid> launchctl list` and no new `SplashAds` line prove the ad is the app open ad, not a relaunch's splash ad). the log has `SplashAds: interstitial loaded` or `not ready` before the first screen; the launch ad shows and its ✕ leads to the first screen; the first home feature tap shows the interstitial, then its screen; with `home_screen_ad_continue_ads_online` "0" the 2nd tap shows none and the 3rd shows it again; an inner action (FOLLOW, send…) then the next home tap → the interstitial (the counter was reset); a banner screen shows the banner with no `Banner fail` in the log; Home key, then reopening the app → the app open ad; after every entry of the map's "leaves the app" column (picker, Settings, share — each entry point, not one of them) and back → no ad. No crash, checked, not assumed: Android — after the launch and again after the walk `adb -s <id> logcat -b crash -d` prints nothing and `adb -s <id> shell pidof <applicationId>` prints the same pid (clear the crash buffer with `logcat -b crash -c` before the launch); iOS — the launch test of item 5 passed (Home shown, no exception), and the app's pid in `xcrun simctl spawn <udid> launchctl list` is the same at the end of the walk as right after the launch.
7. Offline launch (Android device; a real phone is put back online at the end): `adb -s <id> shell cmd connectivity airplane-mode enable`, `adb -s <id> shell ping -c1 -W2 8.8.8.8` fails, `am force-stop`, clear the log and the crash buffer, launch. Home must show (element list), with `SplashAds:` in the log (the startup ran: verified 2026-10-23 on the emulator — `SplashAds: interstitial not ready after 493 ms`, Home in 2 s), no line in the crash buffer. Then `airplane-mode disable`, wait until the ping answers, and in the same process (same pid) the next home feature tap shows the interstitial and a banner screen shows its banner — the ads come back without a restart (verified the same day: the interstitial 3 s after the tap, the banner on the next screen).
Then stop `flutter run`; on a real phone `adb -s <id> uninstall <applicationId>` so the phone is left as it was; a device `devices up` started is stopped to free memory — `adb -s <serial> emu kill` / `xcrun simctl shutdown <udid>` — and never deleted.

## 9. Record what changed, then commit

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/ads-install.mjs" changes "$(pwd)" <base>
```

It writes `ADS_CHANGES.md` in the app from git (every file added, changed or deleted since `<base>`, committed or not, with its diff), the template (each installed file checked byte for byte against it) and the code (every line of the app's own `lib/` that uses the ads layer, as file:line), and prints its summary lines. Never edit it by hand and never write it yourself — rerun the command after any later change. A template file marked **differs from the template** whose diff is not one of flutter-ads section 2's allowed additions (new keys, slots, flags) is a mistake: restore it and run the command again.

Its **Checks** section, near the top, is each rule checked by the command, PASS or FAIL with the file:line lines behind it; the command exits 1 when one fails. I = the app as it was still works: I1 only files the ads work owns were touched; I2 no test that existed before was changed or deleted; I3 every test that passed in step 1 passes in step 8 (from the two `.dart_tool/ads_tests_*.json` files); I4 the backend keeps every line it had and gains only imports of `ad_flags.dart` / `ads_id.dart` / `app_open_ad_manager.dart` and `skipNextResume()` / `AdFlags.isPremium = …` / `AdsId.disableAllAds()`; I5 `pubspec.yaml` keeps every line (no existing package or version changed). P = the common_flow_demo pattern: P1 the installed files are the template's (the plugin's selftest checks the template against common_flow_demo itself), only the allowed additions; P2 startup order `RemoteConfigLoader.load('<pubspec name>_v1')` → `FacebookInit.init()` → `SplashAds.run(` → `SplashAds.afterSplash()` in one file; P3 `AppHud.navigatorKey`; P4 `AppResumeAdListener.enabled = true`; P5 `AdTapHelper.onHomeTap(`; P6 `skipNextResume()` within the 3 lines before every call that leaves the app; P7 no banner on a screen with a text field; P9 every `block()` has its `unblock()`; P10 crash reports set as the guide app's `firebase.dart`, behind `RemoteConfigState.firebaseReady`; P11 one Remote Config key, and no Remote Config fetch, ads SDK start or ad load outside `lib/google_ads_material/`; P12 no `if` on the connection before `RemoteConfigLoader.load` in its file; P13 Premium from the store's active entitlement, never a match on product or subscription id names; P14 the ads packages resolve (`pubspec.lock`) to the tested versions; P15 the native settings: `INTERNET`, `AD_ID`, the AdMob `APPLICATION_ID`, `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`. Every check must PASS before the commit. A FAIL is fixed in the wiring (never by changing the backend, an existing test or an installed file, and never by editing the report), then steps 8.1–8.2 and this command run again. A FAIL that cannot pass without breaking the pattern — for example a backend line that must change shape to take `skipNextResume()`, or a P13 Premium rule in the app's own purchase code (changing how the app decides who paid is not ads work) — is not committed: stop and show the user that FAIL with its evidence lines.

In an app-factory project: `git add -A && git -c user.name=app-factory -c user.email=app-factory@localhost commit -q -m "app-factory: ads"` — local only, never push. Elsewhere: leave the change uncommitted and list the files.

## 10. Report to the user, in this order

The app map (the screens explored on the device, any "not reached" with its reason, and log errors seen); the table; `ADS_CHANGES.md`'s **Checks** section, quoted in full; what changed — its summary lines and its "Where the app's own code uses the ads layer" list, quoted, not retold — and each row of the table next to the file:line lines that implement it: a row with no line there, or a line there with no row, is reported as a mismatch; each check of step 8 with its result line; what is not verified and why (iOS when Xcode is too old; no `google-services.json` / `GoogleService-Info.plist` → the app runs on `assets/remote_config_default.json` only; before release: the owner's AdMob App IDs in `AndroidManifest.xml` and `Info.plist`, and the real ad unit ids in Remote Config key `<pubspec name>_v1` — a release build never serves Google's demo ids, so it shows no ads until they are set).
