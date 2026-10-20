---
name: flutter-ads
description: AdMob ads + Firebase Remote Config for a Flutter app built by app-factory — the team's common-flow pattern (splash interstitial/app open, onboarding native, home-tap interstitial rule, inner-screen banners, resume app open, rewarded, Premium = every id "11"), every value changeable from one Remote Config JSON key. Installed by scripts/ads-install.mjs from templates/flutter/ads. Use when CONTRACT.md has an "Ads" section, or when asked to add, audit or move ads or Remote Config in a Flutter app.
---

# Flutter ads + Remote Config — the common-flow pattern

One pattern for every app. Its code is `templates/flutter/ads/` — a copy of the guide app `/Users/mach/testing/common_flow_demo` (`lib/google_ads_material/`, its tests, the Android and iOS native-ad factories, `assets/remote_config_default.json`). `scripts/ads-install.mjs` puts it into an app; this file says where each ad goes, how it is wired, which Remote Config key controls it, and how it is tested. The pattern is **not** re-derived per app and its files are **not** rewritten: an app only calls their API.

Tested 2026-10-20 (Flutter 3.47.7, google_mobile_ads 9.1.0): 12 unit/widget tests; 5 device tests with the real SDK and Google test ads on a Moto e22s (Android 12) — in the guide app and in a fresh `flutter create` app after `ads-install.mjs`; the guide app walked by hand on that phone (splash interstitial, onboarding native, home tap rule, banners, resume app open, no resume ad after share or on Premium, Premium → 0 ad requests); the iOS native factory on the iPhone 17 simulator (AdMob native ad validator: "No implementation issues found").

## 1. Verified facts

**Google's demo ad unit IDs** — used automatically in every debug build (`AdsId.useTestIds = kDebugMode`), per platform ([Android](https://developers.google.com/admob/android/test-ads), [iOS](https://developers.google.com/admob/ios/test-ads), fetched 2026-10-20):

| Format | Android | iOS |
|---|---|---|
| App open | `ca-app-pub-3940256099942544/9257395921` | `ca-app-pub-3940256099942544/5575463023` |
| Adaptive banner (also used for collapsible — Google's table has no separate collapsible id) | `ca-app-pub-3940256099942544/9214589741` | `ca-app-pub-3940256099942544/2435281174` |
| Interstitial | `ca-app-pub-3940256099942544/1033173712` | `ca-app-pub-3940256099942544/4411468910` |
| Rewarded | `ca-app-pub-3940256099942544/5224354917` | `ca-app-pub-3940256099942544/1712485313` |
| Native | `ca-app-pub-3940256099942544/2247696110` | `ca-app-pub-3940256099942544/3986624511` |

A release build never serves an id that starts with `ca-app-pub-3940256099942544` (it counts as `"11"`), so the defaults JSON can hold Google's ids until the owner's real ones are added. Sample **App IDs** (written by the installer, replaced by the owner before release): Android `ca-app-pub-3940256099942544~3347511713` (`AndroidManifest.xml` meta-data `com.google.android.gms.ads.APPLICATION_ID`), iOS `ca-app-pub-3940256099942544~1458002511` (`Info.plist` `GADApplicationIdentifier`).

**Build facts found while testing (each one broke a build):**
- `flutter_svprogresshud` (latest 1.1.0, 2024-11-05) calls `jcenter()` in its `build.gradle`; Gradle 9 removed it → Android build fails. The template's loader is `AppHud` (an `OverlayEntry`, no package). Never add svprogresshud.
- `google_mobile_ads` 9.1.0's `Package.swift` declares iOS 13; `webview_flutter_wkwebview` 3.27.1+ declares iOS 15 → Swift Package Manager: "requires minimum platform version 15.0". The installer pins it under `dependency_overrides:` (`webview_flutter_wkwebview: ">=3.23.0 <3.27.1"`; 3.27.0 is the last that declares iOS 13) — not under `dependencies:`, where `pipeline.mjs deps` would call it unused and the optimise step would remove it — and sets the iOS deployment target to 15.0.
- `firebase_core` 5.0.0 resolves a firebase-ios-sdk whose `Package.swift` stops with "Firebase requires Swift 6.2.3 or higher. Please upgrade to Xcode 26.2 or later." → an iOS build of an app with this pattern needs **Xcode 26.2+**. (This Mac had 26.1.1, so no full-app iOS build was run here; the iOS factory was tested in an app without Firebase.)
- Facebook is initialised on Android only: `MainActivity.kt` handles the `nativeChannel` → `initFacebook` call; iOS has no handler, so `FacebookInit.init()` logs the `MissingPluginException` and goes on (no crash). An app that needs Facebook on iOS adds the Facebook iOS SDK and a handler in `AppDelegate.swift` — not part of this pattern yet.
- A device test on a locked phone hangs (no frames behind the keyguard): wake and unlock before `flutter test -d <phone>`.

## 2. Where each ad goes — the "Ads" section of CONTRACT.md

Map every screen of the app to one row of this table. A screen that matches no row gets no ad. Every placement becomes one criterion: "AC<n> <screen> shows <format> at <position> for non-Premium users; Premium users see none".

| Screen (in this app) | Ad | Trigger / position | Remote Config keys | Code |
|---|---|---|---|---|
| Splash | Interstitial when `fullscreen_on_in_splash_screen` = "1", otherwise app open | Once per launch, after Remote Config + store check + consent; waits at most `splash_ad_wait_seconds`, then goes on without an ad | `fullscreen_splash_adsId_high/_normal`, `appopen_splash_high/_normal`, `fullscreen_on_in_splash_screen`, `splash_ad_wait_seconds` | `SplashAds.run(isFirstTime:)` |
| Onboarding (first launch only) | One small native at the bottom, outside the `PageView`, height 90, shimmer while loading | Preloaded during splash | `native_onboarding_high/_normal`, native colour keys | `NativeAdWidget(slot: NativeAdManager.onboarding, height: 90)` |
| Rating, Settings, Privacy, Terms, dialogs | none | — | — | — |
| Premium / paywall | none on the screen; closing it shows the interstitial only when it was opened from inside the app (not from splash or onboarding) | Close button and system back | `fullscreen_premium_close` | opened from inside the app: `AdsId.premiumCloseOn ? InterstitialAdManager.main.show(onDone: close) : close()`; from splash/onboarding: `close()` (guide app: `AppFlow.onPremiumClose`) |
| Home — each feature entry (card, tile, list item that opens a feature) | Interstitial | Before opening the feature: `continue` = "1" → every tap; otherwise when `homeFlag % 2 == 0` (taps 1, 3, 5 … after a reset). `homeFlag++` on every tap | `fullscreen_home`, `home_screen_ad_continue_ads_online`, `fullscreen_preload_high_adsId/_normal_adsId`, `inapp_ad_wait_seconds` | `AdTapHelper.onHomeTap(() => <open feature>)` |
| Home — settings, premium, credits buttons, bottom navigation | none; no banner on home | — | — | — |
| Inner feature screen (opened from home) with no text field | Bottom banner: adaptive or collapsible | `Scaffold.bottomNavigationBar`, inside `SafeArea`, 0 left/right padding; space reserved while loading, removed if it fails | `banner_adaptive`, `banner_collapsible` | `bottomNavigationBar: const BannerAdWidget(type: BannerType.adaptive)` |
| Inner screen with a text field | no banner | — | — | — |
| Inner screen action buttons (not back) | no ad; resets the home counter so the next home tap shows an ad | — | — | `AdTapHelper.resetHome()` |
| App back from background | App open | Only after home was reached once; not after share / review / store page / purchase sheet / ad click; not while a Premium screen is open; not over another full-screen ad | `appopen_on_resume`, `appopen_high/_normal` | `AppResumeAdListener` (section 3) |
| A reward the PRD offers (credits, an unlock for a while) | Rewarded | Button the user taps; `onReward` only when earned | `rewarded_high/_normal` | `RewardedAdManager.show(onReward: …)` |
| Premium user | none anywhere, nothing loaded | — | every ad key → "11" | section 5 |

**A new placement** (a screen group the table has no row for) follows the same naming, so Remote Config stays readable:
- Interstitial on a second tap group: keys `fullscreen_<screen>` + `<screen>_screen_ad_continue_ads_online`, a counter `static int <screen>Flag = 0;` in `AdFlags`, and `AdTapHelper.shouldShow(screenKey: 'fullscreen_<screen>', continueKey: '<screen>_screen_ad_continue_ads_online', flag: AdFlags.<screen>Flag)` — then `flag++` and `InterstitialAdManager.main.show(onDone: …)`, exactly like `onHomeTap`.
- Another native: keys `native_<place>_high/_normal`, getters in `AdsId` like `nativeOnboardingHigh`, a `NativeSlot` in `NativeAdManager` (factory `NativeFactory.small`, or a new factory registered on both platforms).
- Add every new key to `assets/remote_config_default.json` and to the Remote Config JSON.

These are the only additions an app makes inside `lib/google_ads_material/` (new keys/slots/flags); the existing code stays as installed.

## 3. Install and wire

**Install** — once, in the interface step (or the first group): `node "<plugin>/scripts/ads-install.mjs" "$(pwd)"`, then `flutter pub get`. It adds `lib/google_ads_material/` (15 files), `test/google_ads_material/` (unit + widget tests), `integration_test/ads_device_test.dart`, `assets/remote_config_default.json`, the packages (each with its reason), the Android factory (`NativeAdStyle.kt`, `SmallNativeAdFactory.kt`, `res/layout/native_small.xml`, `MainActivity.kt` registration + Facebook channel, `facebook-core`, permissions, App ID, Facebook meta-data) and the iOS factory (in `AppDelegate.swift`, so no Xcode project edit; `GADApplicationIdentifier`; iOS 15). It never overwrites a file; when `MainActivity.kt` or `AppDelegate.swift` is not Flutter's default it prints `NOT DONE` with the exact lines to add — add them, run it again.

**Set per app:** the Remote Config key name (`<app>_v1`, unique per app) passed to `RemoteConfigLoader.load`; Firebase files (`google-services.json`, `GoogleService-Info.plist`) — without them the app runs on the defaults JSON; an app set up with the FlutterFire CLI (`firebase_options.dart`) calls `await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` before `RemoteConfigLoader.load` (the loader initialises Firebase only when no app exists, `remote_config.dart`); the owner's App IDs and ad unit ids before release.

**Wire** (the app's own splash / startup code — a view model in an MVVM app, `AppFlow` in the guide app):

```dart
// MaterialApp(navigatorKey: AppHud.navigatorKey, …)   ← "Showing Ads..." loader needs it
await RemoteConfigLoader.load('<app>_v1');      // 1. defaults JSON, then Remote Config (10 s fetch timeout)
await FacebookInit.init();                       // 2. Facebook, id/token from Remote Config ("11" = skip)
// 3. the store's purchase check; Premium → AdFlags.isPremium = true; AdsId.disableAllAds();
await SplashAds.run(isFirstTime: isFirstTime);   // 4. consent → MobileAds init → onboarding native preload → splash ad
SplashAds.afterSplash();                         // 5. resume listener + main interstitial preload
// navigate: first launch → onboarding → (rating, premium per show_* flags) → home; later → (premium) → home
AppResumeAdListener.enabled = true;              // 6. when home is shown
```

Rules the app's code keeps:
- Before anything that leaves the app on purpose — share sheet, store page or in-app review, purchase or restore, opening a browser — call `AppResumeAdListener.skipNextResume()` (the next return within 5 min shows no app open ad). Banner and native clicks already do it.
- A Premium / paywall screen calls `AppResumeAdListener.block()` in `initState` and `unblock()` in `dispose`.
- Every full-screen ad continues the user's action in `onDone` (navigation goes there, never before the ad).
- Flow flags `show_rating_screen`, `show_premium_first_time`, `show_premium_after_splash` ("1" = show) decide the startup screens; Premium never sees a premium screen.

## 4. Remote Config

All values are one Firebase Remote Config parameter named `<app>_v1` whose value is the whole JSON (paste `assets/remote_config_default.json` with the real ids). The app reads the bundled defaults first, then merges the online JSON over them (a key missing online keeps its default; invalid JSON keeps the defaults). Minimum fetch interval: 0 in debug, 5 min in release. Every getter reads the merged map at the moment it is used, so a value applies from the next launch.

| Kind | Read with | On | Off |
|---|---|---|---|
| Ad unit id | `AdsId._id` | the id (debug: Google's test id) | `"11"` or `""`; in release also any Google demo id |
| Screen gate (`fullscreen_home`, `fullscreen_premium_close`, `fullscreen_<screen>`) | `AdsId.screenOn` | any other value, e.g. `"1"` | `"11"`, `"0"`, `""`, key missing |
| Toggle (`fullscreen_on_in_splash_screen`, `appopen_on_resume`, `*_continue_ads_online`, `show_*`, `send_revenue_to_analytics`) | `AdsId.isOn` | exactly `"1"` | anything else |
| Seconds (`splash_ad_wait_seconds` 8, `inapp_ad_wait_seconds` 5) | `AdsId._seconds` | integer | invalid → default |
| Native colours | `AdsId.nativeColors` → factory `customOptions` | hex `RRGGBB` or `AARRGGBB`, no `#` | invalid → default |
| Facebook (`facebookId`, `facebookToken`) | `FacebookInit` | the id / token | `"11"` = skip |

Changing the app from the console, for example: switch an ad off → its id(s) `"11"`; more home ads → `home_screen_ad_continue_ads_online` `"1"`; splash app open instead of interstitial → `fullscreen_on_in_splash_screen` `"0"`; a slow network market → raise `splash_ad_wait_seconds`; native look → `nativeBGColor`, `btnBgColor_start/_center/_end`, `btnGradientAngle` (0, 45, 90, 135, 180, 270), `btnRadius`, `btnTextColor`, `headerTextColor`, `bodyTextColor` (Android `NativeAdStyle.kt` and iOS `AppDelegate.swift` read the same keys). App-specific values (credits, limits) live in the same JSON and are read with `AdsId.get(key, default)` from the app's own class (the guide app's `RemoteValues`).

Each ad has a HIGH and a NORMAL id: HIGH is loaded first, NORMAL only when HIGH fails to load. Full-screen ads preload again after they close. Every paid event goes to Firebase Analytics as `ad_impression` (value, currency, format, ad unit) unless `send_revenue_to_analytics` is not `"1"`.

## 5. Premium and consent

- On a purchase or restore that makes the user Premium, and on launch when the store says Premium: `AdFlags.isPremium = true; AdsId.disableAllAds();` — every ad key becomes `"11"` (also when Remote Config arrives later), no slot loads or shows, consent and `MobileAds.initialize()` are skipped at launch. Toggles and Facebook keys are untouched.
- Consent (UMP): `requestConsentInfoUpdate` → `loadAndShowConsentFormIfRequired` → only if `canRequestAds()` is true, `MobileAds.instance.initialize()` and `AdFlags.adsReady = true`. Until then no ad is requested. Settings shows "Privacy options" when `AdsConsent.isPrivacyOptionsRequired`, calling `AdsConsent.showPrivacyOptions()`.

## 6. Tests

- Installed with the template and run as they are: `test/google_ads_material/ads_rules_test.dart` (home tap rule, screen gates, platform test ids, release demo-id guard, Premium, wait times, Remote Config merge, resume rules, consent gate, no double full-screen ad) and `app_hud_test.dart`. Checked 2026-10-20 to fail when the rule is removed: screen gate "0", release demo-id guard, iOS test ids, resume skip, Premium-screen block, consent gate, double full-screen, invalid JSON; the banner collapse (device test) likewise on the phone.
- `integration_test/ads_device_test.dart` on a phone or emulator with internet (unlocked): consent → SDK ready; adaptive banner loads full width; a failing banner gives its space back; the small native loads through the native factory; the in-app interstitial wait. Run it once per platform the contract has.
- Per placement in the Ads table, the app's flow test reaches the screen and checks the ad widget is there for a free user and absent for Premium; one Premium journey (test purchase, every ad screen, relaunch: no ad widget).

## 7. How the template relates to the build rules

`lib/google_ads_material/**` and `test/google_ads_material/**` are installed files owned by the shared layer. They are exempt from flutter-app S3 (static managers, not constructor injection — every ad call site in the app is one line), L11 (its packages are listed with their reasons by the installer) and `pipeline.mjs colors` (HUD and shimmer colours; native-ad colours come from Remote Config). Screens use only the API above; a deep audit judges the template against this file, not against S3/L11/U rules. S2 (no `material.dart` under `lib/domain/` or `lib/data/`): code there — e.g. the purchase service's Premium hook and `skipNextResume` — may import only `ad_flags.dart`, `ads_id.dart` and `app_open_ad_manager.dart`, which do not import Material; `SplashAds`, the interstitial and every widget are called from view models and views in `lib/ui/`.

## 8. Other patterns in `references/`

`references/ADS_REFERENCE.md` (another app: central `Ads` service, native cache, welcome-back native on resume, an interstitial on navigation and back press every second click, reels native, connectivity-aware reload) and `references/flutter-admob-ads.md` (the same as a step-by-step skill with Android XML examples). Use them when CONTRACT.md asks for one of those placements; the API corrections at the end of `flutter-admob-ads.md` (current `registerNativeAdFactory(flutterEngine, …)` and `customOptions` signatures) still apply.
