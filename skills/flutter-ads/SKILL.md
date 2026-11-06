---
name: flutter-ads
description: AdMob ads + Firebase Remote Config for a Flutter app — the team's own implementation, its structure and its style: the change the team made to put ads into its AI PPT app, stored whole in templates/flutter/ads/ (nothing outside the plugin is needed). scripts/ads-install.mjs copies the team's ads files and helpers into any Flutter app; the team's ad statements go into the app's own screens, launch and purchase code (section 2), from the team's files in templates/flutter/ads/after/ with the line numbers in RECIPE.md. Use when CONTRACT.md section 9 (Ads) lists placements, or when asked to add, audit or move ads or Remote Config in a Flutter app.
user-invocable: false
---

# Flutter ads + Remote Config — the team's change, applied

**The rule: the team's implementation, in the app's structure.** The team added ads to its AI PPT app in one change: the app before its ads (commit `5ac9743` of the team's app base, whose ad code was in comments) → the team's build. That change is the implementation. `templates/flutter/ads/` holds all of it, so a run needs nothing outside the plugin:
- `before/` and `after/`: every file the change touches, as it was and as the team left it;
- `base/`: the helpers `lib/ads` uses. These are the team's files, plus the team's `showLog` / `showToast` / `appText` and the font name `appText` uses, taken from the team's `custom_widgets.dart` and `app_constant.dart`;
- `RECIPE.md`: the change as `git diff`, with the team's line numbers, and for each file wired by hand the team's ad lines in its after file.

The team's folders it was built from (`/Users/mach/ads-testing.v2`, `/Users/mach/testing/ai_ppt_generater`) are needed only to rebuild the template (`ads-install.mjs template`), never by a run. The template is never edited, and the selftest fails if:
- the template is not the two builds;
- the two builds differ in a file that is neither in the change nor named as a non-ads edit (`NOT_ADS` in the script: a reformatted file, unused drawables and fonts, fully commented files);
- the installer, run on the app before its ads, does not produce the team's build byte for byte in every file of the change.

**Plus four fixes, and only these** (`FIXES` in `ads-install.mjs`, applied to the team's files by `template`; each is an exact replacement, and `template` fails if the team's text it replaces changes). Each is an ad that did not show on the device (emulator, 2026-10-29):
- **F1** `onTapInter` waited a fixed 2 s after `InterstitialAd.load()`, whose Future ends when the request is sent. A slower load meant no interstitial: Use Template, log `commonInterAd------>null`. `loadInterCommon` now waits for the ad or its failure, 10 s at most, as the team's `loadRewardedAd` already does.
- **F2** `showInterCommon` with no ad went on to `commonInterAd!` (a null-check exception) after navigating. It now returns.
- **F3** Every native shared one static `nativeAd` and one loaded / failed flag. The splash loads the home and intro natives at once, so one native's failure disposed and hid the other. Each native now keeps its own ad and its own state.
- **F4** The intro hid Continue whenever `nativeIntroBig != "11"`, and Next / Done appear only once the native has loaded. A failed native therefore left the intro with no button. Continue now shows whenever Next / Done does not.

**What is the team's, and what is the app's.**
- **The team's, as written:**
  - `lib/ads/`, the helpers in `base/`, and the Android factories, layouts, styles, Gradle and manifest lines;
  - every ad statement in the screens: the call, its arguments, its condition, the widget, where it sits in the widget tree, and the order.
- **The app's, kept as they are:** its screens, its launch, its navigation, its state management and its purchase code. The team's ad statements go into the app's code that does the same job (section 2).
- **Written for an app (ADAPTED lines):** only the glue the app's structure needs for a team statement to run there, in the kinds listed in section 2 step 4. Each is listed with the team file:line it serves and the fact about the app that needs it.

**Never:**
- anything from IPTV_two or an earlier app-factory version (IPTV_two is cited only in section 8, as the team's second example of where an ad sits in an app's look; none of its code is installed);
- an ad condition, size, widget, `PopScope`, key spelling, Gradle or manifest line that the team's code does not have.

**Not even a fix:** the team's `addAdIds()` reads `"nativeBig"` and its Remote Config key is spelled `sendRedvenueToAnalyticsForNativeIntroBig`. Both stay as the team wrote them. A bug you find is reported, not fixed.

**Nothing here is a reason to ask or to stop.**
- A helper the app lacks is copied from `base/` by the installer.
- A team screen the app has no counterpart for is `--no-screen`.
- A difference in the app's structure is handled by ADAPTED lines.

**Why (2026-10-29):** 0.44.0 copied IPTV_two first and the PPT build only for the rewarded ad and the collapsible banner, and gave the agent a table of IPTV lines I had written. On the PPT app that put in:
- IPTV's small native layout next to the team's factory, so the small native had no image;
- IPTV's intro sizes, without the team's `nativeIntroBig != "11"` guard and Next/Done button;
- IPTV's `PopScope` on template preview;
- IPTV's R8 lines and network permission;
- a renamed Remote Config key.

It also missed the team's `resetAdIds()` after a purchase (`initPlatformState.dart:13`). The team's own change, applied as a whole, has none of these gaps.

## 1. Verified facts

- **Ad unit ids** are Remote Config values under the app's parameter; `"11"` turns that ad off. `config.json` sits at the project root and is not an asset (the app never reads it). The installer writes it with every key the app's `lib/ads/ads_splash_utils.dart` reads (`mapValues1["…"]`): Google's test units for the ad ids, the code's own default for the rest (`apiCookie` `""`). This is the value to publish. Its eight colour keys are set from the app (section 8), never left at the template's. Before a release the owner's ids replace the test units (`release-check.mjs` O6), and the app's Facebook App ID and Client Token replace `facebookId` / `facebookToken` `"11"`: `"11"` does not turn Facebook off, the SDK starts with it and Facebook rejects every call (O8). Without `google-services.json` / `GoogleService-Info.plist`, Remote Config is never read, every id stays `"11"` and no ads show.
- **Firebase starts AdMob.** In the team's `getOnlineIds`, `Firebase.initializeApp()` (`lib/ads/ads_splash_utils.dart:105`) opens a `try`; `setupFbAdsId()` (`:288`, which makes `MainActivity.kt` register the three native factories in its `"setToast"` handler) and `initializeGDPR()` (`:292`, the only caller of `MobileAds.instance.initialize()` at `:471`) run inside it. Without `google-services.json` / `GoogleService-Info.plist`, `:105` throws and both are skipped: no ad shows, with any id (Mendwise, 2026-11-04: "No NativeAdFactory with id: smallNativeAds", 0 of 11 placements seen after 3 rounds). So build-app's contract asks for the Firebase files at the start (never recommends going without them), and while they are missing every ads criterion is blocked at once, the wiring checked and audited, no device rounds.
- **The owner's ids missing → Google's test ids, and testing goes on:** the AdMob App ID (manifest, `Info.plist`) and every ad unit id are Google's test ids (the installer writes them in `config.json`, the value to publish under the app's Remote Config parameter); the ads are built and proven on a device with them. `release-check.mjs` O6 blocks the store release until the owner's ids replace them.
- **RevenueCat:** the team's `getOnlineIds` runs `configureSDK()` unawaited at launch, and `Purchases.configure` throws "API key must be set" with an empty key on every launch (`:381-394`; Mendwise X71). `lib/in_app_purchase/constant.dart` (app-owned) reads its keys from `lib/config/api_keys.dart` (flutter-app L12): a RevenueCat Test Store key (`REVENUECAT_TEST_API_KEY` — the dashboard's Test configuration; `purchases_flutter` 9.8.0 or later, the template has ^10.15.2) in debug and profile builds, the platform keys (`REVENUECAT_GOOGLE_API_KEY`, `REVENUECAT_APPLE_API_KEY`) in release — RevenueCat: never ship a Test Store key. With a Test Store key, purchases run for real in test mode and are tested on the device (section 7).
- **The Remote Config parameter is the app's**: the one its code already reads (`remoteConfig.getValue("…")`; PPT: `ai_ppt_maker_v1`). An app with none gets `<pubspec name>_v1`.
- **Native ads need the factories registered** before a native loads. The team's `MainActivity.kt` handles `"nativeChannel"` → `"setToast"` (called by `setupFbAdsId()`) and registers `smallNativeAds` / `bigNativeAds` / `fullNativeAds`. Its small factory binds `R.id.ad_media`, which the team's `native_admob_small.xml` has. A factory and its layouts always come together, from the team.
- `native_admob_*.xml` need AppCompat + CardView. The team's `facebook-android-sdk:latest.release` brings both.
- **Release:** the team's change adds no R8 lines (no `minifyEnabled`, no `proguard-rules.pro`). The launch crash "Failed to create an instance of androidx.work.impl.WorkDatabase" (2026-10-28) was app-factory's own plain-Flutter port. Step 8 still runs a release build on a device.
- **iOS:** the team's change has no iOS part; the team's app base already has the factories. An app with Flutter's default `AppDelegate.swift` gets app-factory's, with the same three factory ids and `"nativeChannel"`. iOS is not built or run on this Mac (`xcode-select` → CommandLineTools).
- Host `flutter test` fails on this Mac in the `objective_c` native-assets hook (`ld: tapi error: malformed file … unknown architecture arm64e.x1-macos`, Command Line Tools SDK). `flutter test -d <device> test/…` fails the same way, and `flutter run -t test/…` runs the tests under the live binding, where unchanged tests fail too (Mendwise 2026-11-06: 6 of 6). What works: a wrapper in `integration_test/` that calls `IntegrationTestWidgetsFlutterBinding.ensureInitialized();` and then the `main()` of each test file it imports (`import '../test/ui/ads/ads_test.dart' as ads;` … `ads.main();`), run with `flutter test integration_test/<wrapper>.dart -d <device>` (Mendwise: 49 of 49 on the emulator, 3 min 42 s). Delete the wrapper afterwards. A device test on a locked phone hangs: wake and unlock first.

## 2. The screens: the team's ad code, in the app's structure

The installer applies the whole change when the app's files are the team's files before the ads. That covers `lib/ads/`, `AdsUtils/dialog.dart`, `in_app_purchase/initPlatformState.dart`, `service/app_constant.dart`, `pubspec.yaml`, Android and the six screens. For anything it cannot apply it prints a `NOT DONE … RECIPE.md "<file>"` line: a screen of another app, or a team-base file that the app has elsewhere or has changed on the same lines. Each one is done here:

1. **Switch on the app's own slots first.** Every ad line the app left in a comment comes back exactly as written, where it is (check R3).
2. **Find the app's code with the same job** for each RECIPE.md section. The job is what the team's ad lines do in that file:

| Team file (RECIPE.md section) | Its job in the app |
|---|---|
| `lib/screens/splash_screen.dart` | the launch: the code that runs between the app's start and its first real screen (see the launch rule below) |
| `lib/screens/onboarding_screen.dart` | the intro pages before home |
| `lib/screens/home_screen.dart` | home, the first screen after the intro |
| `lib/screens/select_template_screen.dart` | the screen whose item tap opens the app's main feature: the `onTapInter` tap |
| `lib/screens/template_preview_screen.dart` | the screen of the action the app limits for free users: the `onTapRewardCall` action |
| `lib/screens/setting_screen.dart` | settings |
| `lib/AdsUtils/dialog.dart`, `lib/in_app_purchase/initPlatformState.dart` | where a purchase, or a restored one, sets the app's premium state |
| `lib/service/app_constant.dart` | where the app keeps app-wide functions |

   **The launch rule.** The team runs its splash lines in the first screen's `initState`, inside `addPostFrameCallback`: `getOnlineIds(navigateScreen)`, then `loadInterSplash(…)` with `loadPreLoadAds()` and `navigateScreen()`. `navigateScreen` opens the next screen.
   - **The app has a launch screen:** a screen shown before home, as `home:` / `initialRoute` of its `MaterialApp` / `GetMaterialApp`. The team's lines go in that screen's `initState`, and the app's own move to the next screen goes inside `navigateScreen`.
   - **The app picks its first screen in other code:** for example a controller or service that loads state, then navigates. The team's lines go at the point where that code opens the first screen, and that code's own navigation goes inside `navigateScreen`.
   - **The app opens home directly:** the team's lines go in home's `initState`, and `navigateScreen` opens nothing.
   - In each case, the team's conditions in `navigateScreen` (`isFirstTimeVisited`, `showIntro`) go in only for a screen the app has.
3. **Put each ad line in as the team wrote it.**
   - Read the line in `templates/flutter/ads/after/<team file>` at the line RECIPE.md lists. In the app's code with the same job, put it at the same place relative to the same code (in `initState`, under the same widget, inside the same callback): the same condition, value, size, widget, callback and order.
   - The only thing you replace is a name of the team's app that the app does not have: its screen classes (`HomeScreen`, `UpsellScreen`), list or controller (`homeController.topicList`), text arrays (`mTitle`), asset paths, fonts and button widget (`PressUnPressWidget`). Use the app's own name for the same thing, and list each replacement in the report.
   - A `-` line of a hunk is removed only where the app has that same line, and the line is named with `--slot-edits <file:line at base>`. For example, `fs: 70.sp` becomes the team's ternary, and `return Scaffold(` stays as it is.
   - Where the app's line is the same expression with its own value, the team's line goes in with the app's value in place of the team's old one. Example: the IPTV intro image had `width: sw * 0.9` (the team's base had `sw`), and it became `(… nativeIntroBig != "11" …) ? sw * 0.68 : sw * 0.9`. Left as `sw * 0.9`, the big native pushed the intro title under the image (device, 2026-10-30).
   - A team file the app has nothing for (no intro, no settings) is named with `--no-screen <team file>` and listed.
   - **Hosting a native or a banner.** The team shows a native as one item in home's vertical list (`after/lib/screens/home_screen.dart`) and a banner at the bottom of a screen's content. In the app's screen with the same job:
     - a native goes into the app's own scroll of content at the team's relative position (after the first row or item), in the team's frame with the app's item border, inside the list's content padding (section 8). When the body is not a scroll that takes an extra child (a `GridView.count`, a single widget), wrap it so the native sits above or below it inside a scroll, with the horizontal padding of the content around it — an ADAPTED host line (step 4);
     - a banner goes in as the last child of the screen's body `Column`, below the content and outside its padding (section 8);
     - when the native or banner needs ad lifecycle the app's widget does not have (`initState` reactor, `didChangeDependencies`, `setState`), convert the app's `StatelessWidget` to a `StatefulWidget` — an ADAPTED host line (step 4); the tree it returns is unchanged but for the ad slot;
     - a per-screen banner whose job lives inside another screen (the app has no separate screen for that job) goes on the screen that does that job when it has a scrollable body, otherwise `--no-screen`.
   - **One first-launch flag.** The team's `prefs` key `"isFirstTime"` (`AdsVariable.isFirstTimeVisited`, set when the intro finishes) is the app's "onboarding done": the app keeps no second flag for the same thing, and its launch decision reads that one (the app's own flag, if it has one, is replaced by it — a slot edit). Two flags disagreed in Mendwise (2026-11-04: the app's `settings.onboarding_done` and the team's `isFirstTime`). The launch flow test relaunches the app with its data kept and asserts that the intro does not show again.
   - **The intro.** Wire the intro's app open and native (`after/lib/screens/onboarding_screen.dart`) as the team has them. The team's button logic — Continue hidden while the native shows, Next / Done rebuilt when it loads (the F4 lines), and the `appText` `.sp` font ternaries — is for an intro built like the team's, with those two buttons. An intro with a single button (one Next / Continue / Get started) keeps its own button and its own page logic; you add only the native and the app-open calls, never the team's second button or its font ternaries. Note it in the report.
   - The team's `onTapInter`, `onTapRewardCall` and `checkPurchaseNormal` (`after/lib/service/app_constant.dart:75-152`) go, as written with their imports, into the app's file of app-wide functions, or into `lib/service/app_constant.dart` (the team's path) when the app has none. `UpsellScreen(…)` becomes the app's purchase screen, called the app's own way: its own constructor arguments, or none when it takes none — dropping the team's named arguments (`isNotFromSplash`, `isFromGenerate`, `showTester`, `screen`) and the transition for a screen that does not take them is an ADAPTED navigation swap (step 4), not an added line. A team function with no tap or action in the app (e.g. `checkPurchaseNormal` where the app limits no feature) still goes in as the team wrote it, noted "not called"; when the app has no purchase screen at all, `checkPurchaseNormal` is `--no-screen`.
   - A purchase: the team's `AdsVariable.resetAdIds();` goes next to the line where the app records a purchase — the line that sets the app's premium flag or stores it (`after/lib/AdsUtils/dialog.dart:86`, `after/lib/in_app_purchase/initPlatformState.dart:13`). When the app records nothing (a purchase screen that only returns a result), add the team's `AdsVariable.isPurchase.value = true;` where the purchase succeeds and put `resetAdIds()` next to it — an ADAPTED state line (step 4); without it the app's premium turns off no ad. Name both in the report.
4. **ADAPTED lines: the only lines that are not the team's.** Only these kinds, each written in the team's style:
   - **import** — an `import` of a file a team line uses;
   - **wrapper** — an `addPostFrameCallback` / `async` wrapper (and, where `main()` becomes `async`, `WidgetsFlutterBinding.ensureInitialized()` and a `SharedPreferences.getInstance()` the team's line reads from), a `State` member or a method parameter, where the team's line needs one that the app's code at that place lacks (the team's own form, from its file);
   - **navigation / state swap** — the app's own navigation or state call where the team's line calls its own (`Get.offAll(() => HomeScreen())` → the app's call that opens its home; `UpsellScreen(…)` → the app's purchase screen with the app's own arguments);
   - **GetMaterialApp wrap** — the team's `GetMaterialApp` inside `ScreenUtilInit(designSize: const Size(1242, 2688))` around the app's `MaterialApp`, for an app without GetX / ScreenUtil, as the team's app base has it. The team's `Obx`, `Get.*` and `.w` / `.sp` lines then work as written; they are never translated into the app's state management;
   - **host** — a `StatelessWidget` → `StatefulWidget` conversion, or a `Column` / `SingleChildScrollView` wrapper around a screen's body, where a team native or banner has no place in the app's widget as it is: the ad slot only, the rest of the tree unchanged; a `Padding` around the slot uses the app's own horizontal padding value of the content around it (its file:line);
   - **frame** — the team's frame `Container` around a native in a list (section 8, "The frame"), with the radius, border and gap of an item of that list, each with its file:line;
   - **state** — the team's `AdsVariable.isPurchase.value = true;` where the app's purchase succeeds but the app records no premium state of its own, so `resetAdIds()` has a line to sit next to.

   Each ADAPTED line goes into the plan with its kind, its team file:line and the fact about the app that needs it (for example "host — no vertical scroll on home: GridView wrapped in a Column, `lib/screens/home_screen.dart:22`"). 9b checks every one, and fails a line of any other kind or whose stated fact is not true in the app.
5. **Add no other line.** T3 fails on any ad call or condition that the team's code does not have.

Keep each file's line endings: an edit that turns a CRLF file into LF shows up as a whole-file diff.

## 3. Install

`node "<plugin>/scripts/ads-install.mjs" "$(pwd)"`, then `flutter pub get`. For each file of the team's change:
- **The app's file is the team's file before the ads** → it becomes the team's file after the ads, byte for byte.
- **The app has no such file:**
  - a new file of the change (`lib/ads/ads_load_util.dart`, `app_open_ad.dart`, `banner_widget.dart`, `life_cycle.dart`, `ads_collapsible_banner.dart`, the three native layouts with their Poppins fonts, `values-v35` / `values-night-v35` styles) is copied;
  - `lib/ads/ads_splash_utils.dart` and `ads_variable.dart` are copied whole;
  - another team-base Dart file or screen → NOT DONE (section 2).
- **A team-base file that differs elsewhere** → the team's change is merged in by `git merge-file`, and the app's other lines stay. When both touch the same lines:
  - a Dart file → NOT DONE (section 2);
  - Android, or an app that is not on the team's base (Kotlin Gradle, Flutter's default MainActivity) → the team's own lines are added. These are the `APPLICATION_ID`, `AdActivity`, Facebook provider and `<queries>` lines, `INTERNET`, the Gradle `dependencies` (multidex, desugaring, sdp, facebook-android-sdk, the Firebase BoM, analytics, crashlytics), the Firebase plugins when `google-services.json` exists, `adsStyle` / `RatingBar` and the team's `MainActivity.kt`. The selftest checks each one is in the team's files.
- **Helpers** that `lib/ads` imports (`checkConnectivity`, `Shimmer…`, `loadingScreen`, `StoreConfig`, `appleApiKey`, `showLog` / `showToast` / `appText`): when the app has its own file wherever it is, the imports point there. Otherwise the file is copied from `base/`:
  - `in_app_purchase/constant.dart` with the team's RevenueCat keys emptied, because the app's own keys go there;
  - `widgets/custom_widgets.dart` with only the team's `showLog` / `showToast` / `appText` and the font name `appText` uses.

  On a fresh `flutter create` app, `lib/ads` and these helpers analyze with 0 errors before any wiring (2026-11-04). If the app has a file at the team's path that lacks what `lib/ads` uses, a NOT DONE line names the declarations to copy from `base/`.
- **`config.json`** (section 1) and iOS (section 1).
- **`lib/main.dart`**: `AdsVariable.isFirstTimeVisited = prefs.getBool("isFirstTime");` becomes `… ?? false;`, as in the team's `main.dart:16`. Left null on a fresh install, `loadInterSplash` (`isFirstTimeVisited != null`) skips the splash interstitial. If `main.dart` never sets it → NOT DONE: the team's line reads its app-wide `prefs`; an app without one makes `main()` `async` and adds, before `runApp`, `WidgetsFlutterBinding.ensureInitialized(); final prefs = await SharedPreferences.getInstance(); AdsVariable.isFirstTimeVisited = prefs.getBool("isFirstTime") ?? false;` (ADAPTED wrapper, step 4).

A second run changes nothing. NOT DONE lines are done by hand, then it runs again.

## 4. Remote Config and the launch — the team's flow, as it is

`AdsSplashUtils().getOnlineIds(navigateScreen)` runs these steps in order:
1. RevenueCat `configureSDK(); premiumInit();`
2. Every value from SharedPreferences (the last online launch).
3. Online: Firebase, Analytics, Crashlytics, Remote Config `fetchAndActivate`, the app's parameter decoded, every value into `AdsVariable` and SharedPreferences.
4. `setupFbAdsId()` (the factories).
5. `initializeGDPR()`: UMP → ATT → `MobileAds.instance.initialize()`.
6. `fetchPurchaseN()`: Premium → `resetAdIds()`, which sets every ad id to `"11"`.

Offline, the stored values are used and the next screen opens after 4 s.

These are kept as the team has them, reported and not changed:
- A failure anywhere inside the Firebase `try` skips Facebook, consent and the purchase check for that launch.
- Banners still show for Premium (`resetAdIds` leaves `banner`).
- `restorePurchases()` runs on every launch, and Premium is decided by a `"week"` / `"year"` match in the product name (`ads_splash_utils.dart:326-335`; `release-check.mjs` O7).
- `loadingScreen` uses `Get.context` / the app's `scaffoldGlobalKey`.
- A second tap during `onTapInter`'s connectivity check runs it twice.
- The resume app open ad shows after a share or picker.
- Offline taps are blocked with "Please Start Your Internet."
- `addAdIds()` reads `"nativeBig"` and nothing calls it.

## 5. Checks — `ads-install.mjs changes <app> <base>` (ADS_CHANGES.md)

- **T1** The team's change is in the app:
  - every line it adds to `lib/ads/` and to each team-base file the app has;
  - in the screens, and in team-base files the app does elsewhere, every ad call and condition it adds;
  - minus the files named with `--no-screen`, which are listed.
- **T2** The app's own lines are all still there. The exceptions are lines the team's change itself replaces, `lib/main.dart`'s `isFirstTimeVisited = prefs.getBool("isFirstTime");` (the installer adds `?? false`, section 3), and `--slot-edits` lines, which are listed for the audit.
- **T3** No ad code of the app's own: every ad call and condition the work added is one the team's code has.
- **R3** Every ad line the app had commented out is live, unless the team's build has it commented too.
- **R4** The Remote Config parameter is the app's.
- **R5** The native ads in the app's colours: `config.json` has every colour key `lib/ads/ads_splash_utils.dart` reads, each `#RRGGBB` or `#AARRGGBB` (`Color.parseColor`), and they are not all still the template's (the PPT app's) values (section 8).
- **N1** The team's Android side: live factories, the three layouts, `adsStyle`, `APPLICATION_ID` / `AdActivity`, `facebook-android-sdk` + `sdp-android`.
- **I2 / I3** No old test changed, and every test that passed before still passes.

## 6. Every ad seen on screen — `placements`, `seen`, `proof`

`ads-install.mjs placements <app>` lists every ad site in the app's live code outside `lib/ads` as file:line and kind:
- `NativeAdsWidget(` → native;
- `BannerWidget(` / `CollapsibleBannerWidget(` → banner;
- `loadInterSplash`, `onTapInter`, `onTapRewardCall`, `showOpenAdIntroPremium`, `loadAppLifecycleReactor` → full-screen.

With each one's ad on the device screen, run `ads-install.mjs seen <app> <serial> <file:line>`. It checks the screen, not the log:
- **full-screen:** the resumed activity is `com.google.android.gms.ads.AdActivity`;
- **native:** an `ad_view` exactly as tall as `NativeAdsWidget` makes it (the app's own height expression × screen width ÷ its `designSize` width, ±3 px; shorter = cut off, so scroll it whole onto the screen), with `ad_attribution`, `ad_headline` and `ad_call_to_action` inside it and on the screen;
- **banner:** the AdView's WebView inside the screen and at least 50 dp tall;
- **alignment (native and banner):** the gaps from the ad to the left and right screen edges, in px and dp; FAIL when they differ by more than 2 px (the ad sits off to one side);
- **theme (native):** the most common colour inside `ad_view` outside its content views (`ad_media`, `ad_headline`, `ad_body`, `ad_call_to_action`, `ad_attribution`, `ad_advertiser`, `ad_stars`, `ad_icon`, `btn_card`), sampled from the screenshot on a 15 × 7 grid; FAIL when it is not `config.json`'s `nativeBGColor` within 8 per channel (the device runs other colours than `config.json`: the seeded values, or the Remote Config value published, are not the app's). A see-through `nativeBGColor` (`#AARRGGBB`, AA not FF) is printed, not compared. It also prints the app's colour just outside the ad.

`seen` saves the screenshot under `.dart_tool/ads_seen/` and the verdict in `.dart_tool/ads_seen.json`. Open each screenshot: nothing of the app may be drawn over the ad, which no check can see. `seen` reads the app's live window (`dumpsys activity top`, `dumpsys window windows`), not the screen-reader tree: on the emulator that tree still listed the intro's native on Home. A native or banner is also a FAIL when any window is over it (AdMob's validator box, a dialog, the keyboard, an expanded collapsible banner); a banner's own expanded panel counts as the banner. `ads-install.mjs proof <app>` exits 1 until every placement has a PASS and the three crash gates below have passed on the same code.
 
**The run must not crash — `launch`, `stress`, `health`:**
- `launch <app> <serial> <apk> [--keep-data]` installs the build, clears the data (unless `--keep-data`) and every log, starts the app and watches it 30 s. It records the app's process id.
- After a launch, every `seen` and `stress` read the device: the crash buffer (`logcat -b crash`), the process (same pid as the launch's: a changed pid means the app died and restarted), `ANR in <package>`, `FATAL EXCEPTION` of the package, an uncaught Dart exception (`Unhandled Exception`) whose stack has a frame in `lib/ads/` or in a file with an ad placement, and a framework-caught exception (an overflow, a build error) with a frame in `lib/ads/`. Any of them is a FAIL line `CRASH CHECK: …` with the log text.
- `stress <app> <serial> [events]` (default 600, on the build `launch` started last; `proof` accepts only a stress of a release build): `monkey -p <package> -s 1 --throttle 700 --pct-syskeys 0 --pct-appswitch 5` (touches, drags, app switches; system keys must be 0 or monkey exits with -5 on a device with no physical keys), with the same checks after it. It FAILS on `// CRASH:` or `// NOT RESPONDING:`, an abort, or fewer than 90 % of the events injected.
- `proof` requires `launch` of a debug build, `launch` of a release build and `stress`. Every record, placements included, carries a hash of `lib/**/*.dart` and is STALE when the code is edited afterwards.
- **An ANR is judged, not waved off.** `ANR in <package>` right after a start, with `Waited 5019ms for FocusEvent`, while the Mac is out of memory (`vm_stat`: little free, a large compressor) and another service of the same emulator stalls (`am_anr … com.google.android.gms … waited 2xxxx ms`), is the starved emulator: free RAM (`pgrep -f "GradleDaemon|kotlin-daemon"` — stop the daemons your builds left), `launch` again (it clears the logs) and walk again. The same ANR on the same step with the machine idle is the app's: report it with the log lines and the file:line the main thread was in (`/data/anr/traces.txt`, `dumpsys activity processes`) and do not call the run done.
- Not covered, and said so in the report: the app dying while nobody is looking (the logs are a ring buffer: a very long walk can lose early lines; the crash buffer is separate and is not lost), iOS.

An ad site inside a top-level function nothing calls is listed as NEVER CALLED and is not required, because no user can reach it (PPT: `template_preview_screen.dart:252` in `checkPurchaseWithAdDialog`). The only exception: a full-screen ad called by the same statement elsewhere in the same file (PPT's Continue and Done, `onboarding_screen.dart:119` / `:169`) is covered by that statement's PASS, and the proof says so.

## 7. The premium screen — the team's structure, the store's real offering

The app's paywall is built in the structure of the team's premium screen, `templates/flutter/ads/reference/lib/in_app_purchase/app.dart` (`UpsellScreen`; a reference, never installed), in the app's own theme and texts:
- **The plans come from `Purchases.getOfferings()`** — the team's own line, commented out in its build (`app.dart:81`). That build shows a hard-coded offering of another app (`:83-183`: "Rays AI Tanning", ₹699 / ₹2,999): never copy it, never show a price the store did not give.
- One card per package of the current offering. The weekly card shows only while `AdsVariable.showWeeklyPlan`, the yearly one only while `AdsVariable.showYearlyPlan` (Remote Config, `:374`). The price is `storeProduct.priceString`; the yearly card's "Save <n>%" is computed from the two prices, rounded to 5 (`:284-285`); the renewal line is under the button (`:518`).
- Subscribe → `Purchases.purchasePackage(<selected>)`; Restore → `Purchases.restorePurchases()` (`:570`). An active entitlement (`entitlementKey`) → `AdsVariable.resetAdIds()`, `prefs "isPurchase"` and `AdsVariable.isPurchase.value = true` (`:573-575`), then the screen closes with `true`. A failed or cancelled purchase shows its message and changes nothing.
- Privacy Policy and Terms of Use links; close (X).
- No RevenueCat key in the build: the screen is built in full, and shows "Subscriptions aren't available yet" in place of the cards (flutter-app L12). With a Test Store key: a flow test buys the weekly plan on the device and asserts Premium (no ad shows, `isPurchase` true) and that Restore finds it.

## 8. Theme and alignment — the look the team gives its ads, in each app

The team's two apps with ads are the reference for how an ad sits in an app's look: the AI PPT app (its build, `templates/flutter/ads/after/`) and IPTV_two (`/Users/mach/testing/IPTV_two`, code of 2026-10-07 to 10-10; its `config.json` of 10-26 is app-factory's, not the team's). Both do the same, and the rules below are what both do, with their lines. IPTV_two is cited only as the second example of these rules. No IPTV_two code is installed, and a run needs neither folder: the rules are written here.

| | AI PPT app | IPTV_two |
|---|---|---|
| Native in a list (home) | `home_screen.dart:225-234` | `bottom_bar/stream_now_iptv_screen.dart:94-105` |
| its frame: `Container(alignment: Alignment.center, width: sw, padding: EdgeInsets.all(30.w), decoration: BoxDecoration(borderRadius: …, border: Border.all(…)), child: NativeAdsWidget(…))`, no fill colour | border `Color(0xff343434)` = the topic item's border (`:262`); radius `35.w` = the item's (`:261`) | border `Color(0xFFE9EDF3), width: 1.5` = the channel card's border (`:178`); radius `20` (the card's: `15`, `:177`) |
| its bottom margin = the gap between the list's items | `.marginOnly(bottom: 40.w)` (`:234`) = the item's `.marginOnly(bottom: 40.w)` (`:270`) | `margin: EdgeInsets.only(bottom: 30.w)` (`:98`) = the `30.verticalSpace` between the items (`:66`, `:77`, `:86`) |
| it sits inside the screen's content padding | the list's `padding: EdgeInsets.symmetric(horizontal: 50.w, …)` (`:217`) | the screen's `padding: .symmetric(horizontal: 50.w)` (`:35`) |
| Native on the intro | no frame; the last child of the page's `Column`, after the Continue button and `50.verticalSpace` (`onboarding_screen.dart:146-151`) | the same (`intro_screen.dart:140-145`) |
| Banner | the last child of the screen's bottom `Column`, after the main button and `50.verticalSpace` (`home_screen.dart:295-297`, `select_template_screen.dart:169-170`, `template_preview_screen.dart:112-113`) | the last child of the body `Column`, below the `Expanded` content (`channel_list_screen.dart:122`, `bottom_bar/channels_screen.dart:135`, `playlist_group_screen.dart:82`) |
| the banner's width | outside the content padding: the padding is on the content (`playlist_group_screen.dart:39`), the banner has no wrapper, so it spans the screen | the same |
| `CollapsibleBannerWidget(backgroundColor:)` | never passed: the widget's default `Color(0xff060B12)` (`after/lib/ads/ads_collapsible_banner.dart:23`) | IPTV uses `BannerWidget` (transparent, `banner_widget.dart:75`) |
| The native colours | the same defaults in both apps (`lib/ads/ads_variable.dart:51-60`; IPTV `:52-61`: `nativeBGColor` `#342F38`, text `#FFFFFF`, buttons `#6F34FF` → `#C93EA2`), none of them a colour of either app's screens; the published values are only in each app's Firebase Remote Config, which neither folder has | the same |

### The frame — the team's `Container`, with the app's item border

A native in a list goes in the team's frame, as both apps write it:

```dart
Container(
  alignment: Alignment.center,
  width: sw,
  padding: EdgeInsets.all(30.w),
  decoration: BoxDecoration(
    borderRadius: BorderRadius.circular(<the app's item radius>),
    border: Border.all(color: <the app's item border colour>, width: <its width, when the item sets one>),
  ),
  child: NativeAdsWidget(showNativeAd: AdsVariable.nativeAdHome, isSmallNative: true, isFullNative: false),
).marginOnly(bottom: <the gap between the app's items>)
```

- The radius, border colour, border width and gap come from one item of the same list, each with its file:line: an ADAPTED frame line (section 2 step 4).
- No `color:` fill (neither app has one), and no inner padding other than the team's `30.w`.
- An app whose items have no border: neither team app shows this. The frame then has no `border:` (radius, padding and margin stay); this is written in the plan as decided.
- The frame is for a native in a list only. The intro native has none.

### Where natives and banners sit

- **Native in a list:** a child of the list, so the list's content padding applies to it; its left and right edges line up with the items'. A host wrapper (section 2 step 4) uses the screen's own horizontal content padding value, with its file:line.
- **Native on the intro:** the last child of the page's `Column`, after the main button and `50.verticalSpace`, no frame (section 2, the intro and the image size). Every page stays whole with it: text, image, page indicator and buttons on screen, none under the native or cut off.
- **Banner:** the last child of the screen's body `Column`, below the content (after an `Expanded` content area, or after the main button and `50.verticalSpace` when the screen ends in one). No wrapper and no padding: it spans the screen. The content's padding stays on the content. The app's last list item scrolls fully above it, and no floating button sits on it.
- `CollapsibleBannerWidget(` goes in as the team calls it, with no `backgroundColor:`.

### The native colours — eight Remote Config keys, in `config.json`

Read at `lib/ads/ads_splash_utils.dart:32-39` (the last online launch) and `:125-132` (online), sent to Android at `:364-377` (`setToast`), applied by the factories of `MainActivity.kt`. There is one set for every native: home, the intro and every other screen.

| Key | What it colours (the team's `MainActivity.kt`: full, big, small factory) |
|---|---|
| `nativeBGColor` | the whole native, `flNativeAds` (`:212`, `:399`, `:557`) |
| `headerTextColor` | the headline (`:236`, `:423`, `:579`) |
| `bodyTextColor` | the body text (`:247`, `:434`, `:589`) |
| `btnBgColor1`, `btnBgColor2` | the call-to-action button's gradient (`:296-297` and `:319-320`, `:482-483`, `:632-633`) and the "Ad" badge (`:259-260`, `:446-447`, `:601-602`) |
| `btnTextColor` | the call-to-action text (`:288` and `:314`, `:475`, `:628`) and the "Ad" badge text (`:277`, `:464`, `:619`) |
| `btnAdBgColor`, `btnAdTextColor` | nothing: sent (`ads_splash_utils.dart:372`, `:374`) and stored (`MainActivity.kt:88-91`), and no factory takes them |

**The team's apps give no example of choosing these values for an app** (the last row of the table above). This one rule is app-factory's, so that the native matches the frame and the screen it sits on:
- `nativeBGColor` = the fill of the item the native's frame copies (no fill → the screen's background: `Scaffold(backgroundColor:)`, else the theme's `scaffoldBackgroundColor`);
- `headerTextColor` = that item's title text colour; `bodyTextColor` = its second text line's colour (no second line → `headerTextColor`);
- `btnBgColor1`, `btnBgColor2` = the first and last colour of the app's main button's gradient (a one-colour button → that colour in both); `btnTextColor` = that button's text colour;
- `btnAdBgColor`, `btnAdTextColor` = `btnBgColor1`, `btnTextColor`.
- **Written** `#RRGGBB`, or `#AARRGGBB` for a colour with alpha: `Color.parseColor` takes nothing else, and the team's fallbacks (`"1A1A1A"`, `:32`, `:125`) have no `#`, so `config.json` carries every key. R5 checks it.
- **From** a literal in the app's `lib/`: `Color(0xAARRGGBB)` → `#RRGGBB` when AA is FF, else `#AARRGGBB`; a Material constant → its value (`Colors.white` `#FFFFFF`, `Colors.black` `#000000`, the rest from Flutter's `colors.dart`). A computed colour (`ColorScheme.fromSeed`, a Material default) → `ads-install.mjs pixel <png> <x> <y>` on the step-2 screenshot, at a point of that element with no text or image on it.
- **Light and dark:** one set. `themeMode: ThemeMode.dark` → the colours of `darkTheme`, otherwise of `theme`. An app with a `darkTheme` that follows the system gets the `theme` colours, and the report says: "In dark mode the natives keep the light colours: the team's factories take one colour set (`MainActivity.kt` `setToast`)."
- Each key is a THEME row of the plan: key | value | the app's file:line (or screenshot + x,y) | what it is in the app.

### Kept as the team has them, and listed in the report

- the `ad_advertiser` text `#E0DFDF` (`native_admob_small.xml:120`, `native_admob_big.xml:105`, `native_admob_full.xml:122`; the same in IPTV_two's layouts): light grey, faint on a light `nativeBGColor`;
- the natives' Poppins fonts (`res/font/poppins*.ttf`, the layouts' `fontFamily`);
- the collapsible banner's strip `#060B12` and its "Advertisements" label, white on `#1E293B` (`ads_collapsible_banner.dart:23`, `:201-205`): dark on a light app;
- the "Loading" dialog before an interstitial: white text in a 10 % white box on a 10 % black screen (`base/lib/AdsUtils/loading_screen.dart:21-43`);
- the loading shimmers: grey (`base/lib/AdsUtils/shimmer.dart:12`), and the banner's blue and grey one (`shimmer_banner.dart:16-21`);
- interstitial, app open and rewarded ads: Google's own full-screen activity, not the app's.

### Measured on the device by `seen` (section 6)

- Each native and banner: the gaps to the left and right screen edges. They must differ by 2 px at most. A native in a list must have gaps equal to the list's content padding (its dp from the code × the device's density ÷ 160); a banner's gaps must be 0.
- Each native: its background on the screenshot = `config.json`'s `nativeBGColor`.
- A different number is a FAIL of the wiring, written in the report with both numbers, then fixed and seen again.
