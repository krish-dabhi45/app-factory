---
name: ads-implementation
description: Adds the team's ads + Remote Config pattern (skills/flutter-ads, templates/flutter/ads) to a Flutter app that is already built, in the folder open in this window — explores the entire app (its code, then every screen on a device), decides every placement from the pattern's table, installs, wires, adds the criteria and tests, verifies on the device and reports. Use only when the user types /app-factory:ads-implementation.
disable-model-invocation: true
---

# Add ads + Remote Config to an existing Flutter app

`/app-factory:build-app` puts this pattern into every new app by itself. This command is for an app that is already built, or was built without ads. Do the steps in order. The rules — where each ad goes, the wiring, the Remote Config keys, Premium, the tests — are in `${CLAUDE_PLUGIN_ROOT}/skills/flutter-ads/SKILL.md`: read it in full before step 2. The installed files are never rewritten; the app only calls their API. This command adds ads and nothing else: a bug found on the way is reported, not fixed.

## 1. Check the folder and the device — stop at the first failure and say why

- `pubspec.yaml` with `flutter:` and an `android/` or `ios/` folder. Otherwise: "Not a Flutter app."
- A git repository with nothing uncommitted (`git status --short` prints nothing). Uncommitted changes → stop: "Commit or stash your changes first, so this change is one commit you can revert." No git repository → say the change cannot be reverted with git and ask whether to go on.
- CONTRACT.md section 9 quotes a PRD line saying the app has no ads → tell the user and go on only if they confirm.
- `lib/google_ads_material/` already there → `diff -r "${CLAUDE_PLUGIN_ROOT}/templates/flutter/ads/lib/google_ads_material" lib/google_ads_material`; list every difference that is not one of flutter-ads section 2's allowed additions (new keys, slots, flags). Do not install again; do steps 2, 3 and 5–10 for what is missing.
- A device with internet, awake and unlocked (a locked screen hangs device work): a connected phone (`node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" devices real`), or else the plugin's own `af-*` emulator or `app-factory-*` simulator — never one of the user's own devices. Android: `pipeline.mjs maestro-install` once (the element list needs it). No device → stop: "Connect a phone, unlocked — the app is explored on a device before any ad is placed."

## 2. Explore the entire app — before changing anything

Read `${CLAUDE_PLUGIN_ROOT}/skills/app-qa/SKILL.md` rules E2 and E8 first: elements are found and tapped from the element list (Android `read_screen`, iOS mobile-mcp), never by coordinates read off a screenshot; after a launch, `pipeline.mjs wait-app`, never a fixed pause.

**a. From the code — the full list.** Every route, pushed screen, modal, bottom sheet and dialog, each with its file, the screen that opens it and the tap that does. Then: home (the first screen a returning, logged-in user sees); tabs and their roots; the text fields of each screen; a splash screen, onboarding, Premium / paywall screen, store purchase, reward (credits, an unlock); every call that leaves the app — `grep -rnE "Share|share_plus|launchUrl|url_launcher|in_app_review|requestReview|openStoreListing|buyNonConsumable|buyConsumable|restorePurchases|ImagePicker|FilePicker|camera|openAppSettings|mailto:|tel:" lib`.

**b. On the device — the app as it is now.** `flutter run -d <id>`, then visit every screen of the list once, in the order taps reach it: from launch, through logging in when the app has accounts (a test account from CONTRACT.md, the seed data or the README; none → register one in the app), every tab, every pushed screen, modal and sheet. On each screen read its element list and record: how you got there, every element that opens another screen and which screen it opens, the text fields, every element that leaves the app. One screenshot per screen. After each screen read the app's log (app-qa section 2); an error there goes in the report.

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

As flutter-ads section 3 says, including its "App shapes" list (no splash screen, `go_router`, no onboarding, no paid tier, tabs). The Remote Config key is `<pubspec name>_v1`. Every placement exactly as the table of step 3; `skipNextResume()` before every call in the map's "leaves the app" column; `block()`/`unblock()` on every Premium screen; `AdTapHelper.resetHome()` on inner-screen action buttons (not back). Code under `lib/data/` and `lib/domain/` imports only `ad_flags.dart`, `ads_id.dart` and `app_open_ad_manager.dart` (flutter-ads section 7).

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
2. The whole test suite: `flutter test -j 4 -r failures-only` — the app's existing tests too.
3. In an app-factory project: `pipeline.mjs coverage` and `pipeline.mjs deps`.
4. `flutter build apk --debug` (Android in the app); `flutter build ios --simulator --debug` on a Mac. firebase_core 5 needs Xcode 26.2 or newer: an older Xcode fails here — quote its error line and report iOS as not built for that reason (flutter-ads section 1), not as passing.
5. On the device of step 1: `flutter test integration_test/ads_device_test.dart integration_test/<the launch test> -d <id>` — all pass. A banner `LoadAdError(code: 3 …)` is Google's no-fill: re-run that test once (`--plain-name "adaptive banner loads"`); a second failure is a failure.
6. `flutter run -d <id>` once and walk the table, with a screenshot at each point (Android: `adb -s <id> shell dumpsys activity activities | grep topResumedActivity` — `com.google.android.gms.ads.AdActivity` is a full-screen ad): the log has `SplashAds: interstitial loaded` or `not ready` before the first screen; the launch ad shows and its ✕ leads to the first screen; the first home feature tap shows the interstitial, then its screen; a banner screen shows the banner with no `Banner fail` in the log; Home key, then reopening the app → the app open ad; after a "leaves the app" call (picker, Settings, share) and back → no ad. Then stop `flutter run` and, on a real phone, `adb -s <id> uninstall <applicationId>` so the phone is left as it was.

## 9. Commit

In an app-factory project: `git add -A && git -c user.name=app-factory -c user.email=app-factory@localhost commit -q -m "app-factory: ads"` — local only, never push. Elsewhere: leave the change uncommitted and list the files.

## 10. Report to the user, in this order

The app map (the screens explored on the device, any "not reached" with its reason, and log errors seen); the table; the files added and changed; each check of step 8 with its result line; what is not verified and why (iOS when Xcode is too old; no `google-services.json` / `GoogleService-Info.plist` → the app runs on `assets/remote_config_default.json` only; before release: the owner's AdMob App IDs in `AndroidManifest.xml` and `Info.plist`, and the real ad unit ids in Remote Config key `<pubspec name>_v1` — a release build never serves Google's demo ids, so it shows no ads until they are set).
