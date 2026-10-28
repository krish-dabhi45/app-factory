---
name: flutter-ads
description: AdMob ads + Firebase Remote Config for a Flutter app built by app-factory — IPTV_two's ads implementation (/Users/mach/testing/IPTV_two lib/ads/) with its file, class, method, variable and Remote Config key names, ported to plain Flutter in the guide app common_flow_demo (splash interstitial, intro big native + intro app open, home onTapInter interstitial with the odd-homeFlag back rule, home small native, inner-screen banners, resume app open, Premium = every id "11"), every value from one Remote Config JSON parameter. Installed by scripts/ads-install.mjs from templates/flutter/ads. Every app-factory Flutter app gets it unless its PRD says the app has no ads. Use when CONTRACT.md section 9 (Ads) lists placements, or when asked to add, audit or move ads or Remote Config in a Flutter app.
user-invocable: false
---

# Flutter ads + Remote Config — IPTV_two's implementation

The reference is IPTV_two (`/Users/mach/testing/IPTV_two`): its `lib/ads/` (`ads_variable.dart`, `ads_splash_utils.dart`, `ads_load_util.dart`, `app_open_ad.dart`, `life_cycle.dart`, `banner_widget.dart`), `onTapInter` (`lib/utils/app_variable.dart`), `AdsUtils/loading_screen.dart`, its Android `MainActivity.kt` + native ad factories + `native_admob_small/big/full.xml`, `proguard-rules.pro`, and its `config.json` (the Remote Config value). The guide app `/Users/mach/testing/common_flow_demo` runs that code with the same files, classes, methods, variables, keys, SharedPreferences copies and flow, ported to plain Flutter: GetX's `RxBool` → `RxFlag` (a `ValueNotifier<bool>` with IPTV's `.value` / `.refresh()`), `Get.to` / `Get.back` / `Get.context` → `AdsVariable.navigatorKey`, `Obx` → `ValueListenableBuilder`, `15.w` → `15 × width / 1242` (IPTV's ScreenUtil design width). `templates/flutter/ads/` is that guide app's ads code byte for byte (`ads-install.mjs selftest` compares every file); `scripts/ads-install.mjs` puts it into an app. Nothing in it is re-derived per app: an app only calls its API (section 3). Every change from IPTV is in section 8 with IPTV's file:line — crash fixes and wrong-key reads only, plus the additions listed there.

**0.41.0 (2026-10-28): the template replaced by IPTV's implementation** — the earlier `lib/google_ads_material/` layer (`AdsId`, `AdFlags`, `RemoteConfigLoader`, `AdTapHelper`, `SplashAds`, `AppHud`, `AdsConsent`, `FacebookInit`, `remote_config_default.json`, `skipNextResume`, `block`/`unblock`, rewarded, collapsible, …) was app-factory's own design and is gone; `ads-install.mjs reset` also removes it from an app. Checked: the guide app `flutter analyze` clean; its 5 ad device tests on the Moto e22s (Android 12) — interstitial through `loadInterCommon`, small and big native through IPTV's `smallNativeAds` / `bigNativeAds` factories at IPTV's heights, banner < 100 dp, app open; its `flutter build apk --release` on that phone: splash interstitial, then the intro big native drawn by `native_admob_big.xml` (AdMob validator: "No implementation issues found"). A fresh `flutter create` app after `ads-install.mjs` (no NOT DONE): analyze clean, the same 5 device tests pass on the phone, its release APK launches with no crash. `ads-install.mjs selftest`: 27 template files = the guide app's, 12 package versions, the Android libraries and R8 setup. Not done: iOS (this Mac's `xcode-select` points at CommandLineTools, so no iOS build; the iOS factories are unrun), host `flutter test` (fails "Building native assets failed" for the same reason — the unit tests in `test/` were not run), and a full hand walk of the guide app after the port (home taps, resume ad, offline launch).

## 1. Verified facts

**Ad unit ids.** `assets/ads/config.json` is IPTV's `config.json` as it is: its ids are Google's **Android** demo units (`appOpenAds` `…/9257395921`, `interSplash` / `interPreLoad` `…/1033173712`, `nativeIntroBig` / `nativeFull` `…/2247696110`, `banner` `…/6300978111`; `nativeHome`, `appOpenSplash`, `facebookId` `"11"` = off). A release build serves the id it is given, exactly as IPTV does — a demo id shows a Google test ad in release too and earns nothing; the owner's ids go into the Remote Config value before a store release (`release-check.mjs` O6 lists every demo unit left in `assets/ads/config.json`; O3 the sample App IDs). Google's demo units per platform ([Android](https://developers.google.com/admob/android/test-ads), [iOS](https://developers.google.com/admob/ios/test-ads), fetched 2026-10-20):

| Format | Android | iOS |
|---|---|---|
| App open | `ca-app-pub-3940256099942544/9257395921` | `ca-app-pub-3940256099942544/5575463023` |
| Banner | `ca-app-pub-3940256099942544/6300978111` (adaptive: `…/9214589741`) | `ca-app-pub-3940256099942544/2934735716` (adaptive: `…/2435281174`) |
| Interstitial | `ca-app-pub-3940256099942544/1033173712` | `ca-app-pub-3940256099942544/4411468910` |
| Native | `ca-app-pub-3940256099942544/2247696110` | `ca-app-pub-3940256099942544/3986624511` |

The ids are one set for both platforms (IPTV's schema): an iOS build needs iOS ids in its Remote Config value (a platform condition in the Firebase console). Sample **App IDs** (written by the installer, replaced by the owner): Android `ca-app-pub-3940256099942544~3347511713` (`AndroidManifest.xml` `com.google.android.gms.ads.APPLICATION_ID`), iOS `ca-app-pub-3940256099942544~1458002511` (`Info.plist` `GADApplicationIdentifier`).

**Build facts (each broke a build or a launch):**
- `native_admob_*.xml` use CardView and AppCompat attributes (`cardCornerRadius`, the `RatingBar` style on `Theme.AppCompat`). IPTV gets both through `com.facebook.android:facebook-android-sdk` (`latest.release`, resolved 2026-10-28 to 19.0.0); with only `facebook-core:18.0.0` the build failed "native_admob_big.xml:145: attribute cardCornerRadius not found". The installer adds `facebook-android-sdk:19.0.0` (pinned) and `com.intuit.sdp:sdp-android:1.0.6` (the layouts' `@dimen/_8sdp` sizes), as IPTV `android/app/build.gradle.kts:63-64`.
- **Release crashed at launch without IPTV's R8 rules:** "Unable to get provider androidx.startup.InitializationProvider … Failed to create an instance of androidx.work.impl.WorkDatabase" (Moto e22s, 2026-10-28) — R8 strips WorkManager's Room database, which facebook-android-sdk brings. IPTV's `proguard-rules.pro` (`-keep class androidx.work.** { *; }`, Room, Facebook, Play services) and its release block (`isMinifyEnabled = true`, `proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")`, `build.gradle.kts:41-45`) fixed it; the installer adds both (an app's own `proguard-rules.pro` gets IPTV's rules appended).
- Android native ads need the factories registered: IPTV's `MainActivity.kt` registers `smallNativeAds` / `bigNativeAds` / `fullNativeAds` when Dart calls `nativeChannel` → `setToast` (`setupFbAdsId()`, from `getOnlineIds`), with the colours of that call. A native loaded before that call fails.
- `google_mobile_ads`' `Package.swift` declares iOS 13; `webview_flutter_wkwebview` 3.27.1 declared iOS 15 → Swift Package Manager refused the pair; 3.27.2 declares 13 again. The installer pins it under `dependency_overrides:` and sets the iOS deployment target to 15.0.
- `firebase_core` 5.0.0 needs Xcode 26.2+ for an iOS build ("Firebase requires Swift 6.2.3 or higher").
- A device test on a locked phone hangs: wake and unlock before `flutter test -d <phone>`.
- iOS consent: `initializeGDPR()` → UMP; when no form is required, `initializeWithOutGDPR()` asks iOS's tracking prompt (`AppTrackingTransparency.requestTrackingAuthorization`, needs `NSUserTrackingUsageDescription`) and then starts MobileAds; the startup waits for the answer.
- **Package versions are exact** — the guide app's `pubspec.lock`: `google_mobile_ads` 9.2.0, `firebase_core` 5.0.0, `firebase_remote_config` 7.0.0, `firebase_analytics` 13.0.0, `firebase_crashlytics` 6.0.0, `shared_preferences` 2.5.6, `app_tracking_transparency` 2.0.7, `connectivity_plus` 7.3.2, `fluttertoast` 10.0.2, `flutter_spinkit` 5.2.2, and with the Premium layer `purchases_flutter` 10.16.0. The installer sets an app's existing line for one of them to that version (its comment kept); a git/path entry is left and named in its to-do list. A newer version = the guide app first (its device tests), then the pins.

## 2. Where each ad goes — the "Ads" section of CONTRACT.md

IPTV's placements (IPTV paths are under `lib/`; `screens/` and `screens/bottom_bar/` are left out of the file names). Map every screen of the app to one row; a screen that matches no row gets no ad. Every placement becomes one criterion: "AC<n> <screen> shows <format> at <position> for non-Premium users".

| Screen | Ad | When / how (IPTV file:line) | Remote Config keys | Call |
|---|---|---|---|---|
| Splash, every launch | Interstitial `interSplash`; app open instead when `appOpenSplash` is not `"11"` (`ads_load_util.dart:243-245`) | After `getOnlineIds` (stored ids → Firebase → Remote Config → Facebook → consent + MobileAds → purchase check), only online (`splash_screen.dart:30-50`). The next screen opens behind the ad 1 s after its impression (`ads_load_util.dart:265-269`); on a returning Android launch `homeFlag++` (first home tap free, `splash_screen.dart:39-41`) and the home native preloads (`:55-66`) | `interSplash`, `appOpenSplash` | `AdsLoadUtil().loadInterSplash(loadPreLoadAds, navigateScreen, AdsVariable.interSplash, enable: AdsVariable.sendRevenueToAnalyticsForInterSplash)` |
| Intro, first launch (`showIntro` `"1"`, until `"isFirstTime"` is stored) | Big native `nativeIntroBig` under the page, drawn only once loaded (`intro_screen.dart:145`) | Loaded in `navigateScreen` before the intro opens (`splash_screen.dart:86-91`), gate `adShowIntroFlag` | `nativeIntroBig`, `adShowIntroFlag` | `ValueListenableBuilder(valueListenable: AdsLoadUtil.isNativeAdLoaded, …)` → `NativeAdsWidget(showNativeAd: AdsVariable.nativeAdIntro, isSmallNative: false, isFullNative: false)` |
| Intro finish (last Continue) | App open `appOpenIntro`, only if loaded | Loaded in `initState` (`intro_screen.dart:41`); then `"isFirstTime"` stored (`:124`) → Premium (iOS, online, not purchased) or Home | `appOpenIntro` | `AppOpenAdManager().loadIntroPremiumAdOnly(AdsVariable.appOpenIntro)`; `showOpenAdIntroPremium(finish)` |
| Home | Small native `nativeHome` (IPTV ships it `"11"`) in the home content, one ad kept (loaded only while `AdsVariable.nativeAdHome` is null, `home_screen.dart:95-99`) | Gate `adShowHomeFlag` | `nativeHome`, `adShowHomeFlag` | `NativeAdsWidget(showNativeAd: AdsVariable.nativeAdHome, isSmallNative: true, isFullNative: false)` |
| Home feature buttons; the action after a feature's picker or sheet; a content tab item's main action | Interstitial `interPreLoad` | `onTapInter` (`utils/app_variable.dart:61-91`): offline → toast "Please Start Your Internet." and nothing opens; Premium or `isFirstTimeVisited == null` → opens, no ad; `homeFlagOnline` `"0"` → every tap; else an ad when `homeFlag` is even — "Loading..." 2 s, then the ad, the screen 1 s after its impression; `homeFlag++` on every counted tap | `interPreLoad`, `adShowHomeFlag`, `homeFlagOnline` | `onTapInter(() => <push>)` |
| Every screen such a tap opens | none — on Back an odd `homeFlag` is made even, so the next tap shows an ad (`playlist_group_screen.dart:25-29`, the same in each screen a tap opens) | | | `PopScope(onPopInvokedWithResult: (didPop, _) { if (didPop && AdsVariable.homeFlag.isOdd) AdsVariable.homeFlag++; }, child: …)` |
| Inner list screens and a content tab root (IPTV Channels); a search field on a list is fine | Banner, the last child of the screen's `Column` (`channels_screen.dart:135`, `channel_list_screen.dart:122`, `playlist_group_screen.dart:82`) | Standard anchored adaptive size | `banner` | `BannerWidget(adsId: AdsVariable.banner, enable: AdsVariable.sendRevenueToAnalyticsForBanner)` |
| A screen with a text field (IPTV import screens), a media player, Home, Settings, Guide, legal pages | no banner | | | |
| Premium / paywall | none; no resume ad while it is open | `isShowingAd` set in `initState` (`in_app_purchase/app.dart:80`), cleared by the next `onTapInter` (`app_variable.dart:62`) | | `AdsVariable.isShowingAd.value = true;` |
| App back from background | App open `appOpenAds` | Listener started on Home (`home_screen.dart:57`); loaded when the app goes to the background without one (`life_cycle.dart:28-31`), 4 h expiry | `appOpenAds` | `AdsSplashUtils().loadAppLifecycleReactor()` in Home's first build |
| Settings | "Privacy options" row when consent says so (`setting_screen.dart:127-141`) | | | `if (AdsVariable.isPrivacyOptionsRequired.value) … showPrivacyOptionsForm((formError) {})` |
| **No ad, ever** (IPTV, each tap classified): a tab switch (`home_screen.dart:201` only sets the index), "How to", a recent item (`stream_now_iptv_screen.dart:169`), pro, settings, favourite / search / grid-list, more / edit / delete, help, any tap inside an inner screen, Back | none | | | |

Native heights (`NativeAdsWidget`, IPTV's ScreenUtil values): small `(2688 × 140 / 690) × w`, big `(2688 × 250 / 690) × w`, full `2688 × w`, with `w = screen width / 1242` (the device test checks small and big). The Android look is IPTV's layouts and colours (`nativeBGColor`, `headerTextColor`, `bodyTextColor`, `btnTextColor`, CTA gradient `btnBgColor2` → `btnBgColor1`); on iOS the template's `AppDelegate.swift` draws the same three ids from the same `setToast` colours (section 8, A1).

**A new placement or key:** use IPTV's naming (`appOpen<Place>`, `inter<Place>`, `native<Place>`, `banner<Place>`, its `sendRevenueToAnalyticsFor<Key>`), and add it the IPTV way: a `static String` in `AdsVariable` (default `"11"`), its read in `getOnlineIds` (`prefs.getString("<key>") ?? "11"`) and its line in `setOnlineIds` (`AdsVariable.<key> = mapValues1["<key>"] ?? "11"; prefs.setString("<key>", …)`), the key in `assets/ads/config.json` and in the Remote Config value. These three files are the only ones an app may grow (check P1); every other installed file stays as installed.

## 3. Install and wire

**Install** — once, in the interface step (or the first group); in an app that is already built, `/app-factory:ads-implementation` does this section: `node "<plugin>/scripts/ads-install.mjs" "$(pwd)"`, then `flutter pub get`. It adds `lib/ads/` (9 files), `test/ads/ads_test.dart`, `integration_test/ads_device_test.dart`, `assets/ads/config.json`, `lib/premium_core/` + `test/premium_core/` (section 5; not with `--no-premium`), the packages at the tested versions; Android: IPTV's `MainActivity.kt` (when the app's is Flutter's default), `NativeAds.kt`, `res/layout/native_admob_small/big/full.xml`, `res/font/poppins*.ttf`, `res/values/ads_styles.xml`, `facebook-android-sdk` + `sdp-android`, `proguard-rules.pro` + the release R8 lines, permissions, App ID, Facebook meta-data and placeholders, minSdk 24 when the app sets a lower number; iOS: `AppDelegate.swift` with the three factories, `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`, iOS 15. It writes the app's Remote Config parameter name into `AdsSplashUtils.remoteConfigKey` = `<pubspec name>_v1`. It never overwrites a file; when `MainActivity.kt` or `AppDelegate.swift` is not Flutter's default it prints `NOT DONE` with the exact lines to add — add them, run it again.

**Set per app:** Firebase files (`google-services.json`, `GoogleService-Info.plist`) — without them `getOnlineIds` falls back to `assets/ads/config.json` on a launch that never stored ids (A2); the Remote Config parameter `<pubspec name>_v1` with the app's JSON (section 4); the owner's App IDs and ad unit ids before release; with Premium, the RevenueCat keys as build skill L12 keys (`ApiKeys.revenuecatAppleKey` / `revenuecatGoogleKey`) and the entitlement id.

**Wire** — the guide app's code, which is IPTV's (`main.dart:22`, `screens/splash_screen.dart:28-96`):

```dart
// main(): IPTV main.dart:22 — onTapInter shows nothing while this is null
final prefs = await SharedPreferences.getInstance();
AdsVariable.isFirstTimeVisited = prefs.getBool("isFirstTime") ?? false;
// MaterialApp(navigatorKey: AdsVariable.navigatorKey, …)   ← "Loading..." and the app open ad's screen use it
//   (GetMaterialApp too; go_router: GoRouter(navigatorKey: AdsVariable.navigatorKey, …))

// Splash, after the first frame (the guide app: AppFlow.runSplash):
AdsSplashUtils.fetchPurchase = () async { /* the store check: sets AdsVariable.isPurchase (section 5) */ };
await AdsSplashUtils().getOnlineIds(navigateScreen);      // offline: navigateScreen after 4 s, nothing else
if (await checkConnectivity()) {
  await AdsLoadUtil().loadInterSplash(
    () {
      loadPreLoadAds();                                    // the home native (adShowHomeFlag "1", nativeHome not "11")
      if (AdsVariable.isFirstTimeVisited == true && Platform.isAndroid) AdsVariable.homeFlag++;
    },
    () => navigateScreen(),
    AdsVariable.interSplash,
    enable: AdsVariable.sendRevenueToAnalyticsForInterSplash);
}

// navigateScreen (IPTV splash_screen.dart:68-96):
//   returning user → online, not purchased, iOS ? Premium : Home
//   first launch → showIntro "1" ? (load the intro native, then Intro) : Home
// Intro: loadIntroPremiumAdOnly(appOpenIntro) in initState; last Continue → showOpenAdIntroPremium(finish);
//   finish: load the home native, prefs.setBool("isFirstTime", true), then Premium (iOS, online, not purchased) or Home
// Home, first build: AdsSplashUtils().loadAppLifecycleReactor(); prefs.setBool("isFirstTime", true);
//   the home native (if still null); feature taps: onTapInter(() => Navigator.push(…));
// Each screen a tap opens: the PopScope odd-homeFlag rule; inner list screens: BannerWidget as the last child
// Premium initState: AdsVariable.isShowingAd.value = true;   Settings: the privacy options row
```

App shapes:
- **No splash screen:** run the splash code in `main()` after `runApp` once the first frame is drawn, never inside a function widget tests call.
- **No onboarding:** `showIntro` `"0"` in the config — `navigateScreen` goes straight to Home on the first launch.
- **No paid tier:** installed with `--no-premium`; `AdsSplashUtils.fetchPurchase` stays null, `AdsVariable.isPurchase` stays false, no Premium screen rows.
- **Tabs:** the tab bar only changes the tab — never `onTapInter` (check P16); a content tab's item action goes through `onTapInter` (one `homeFlag` for all tabs, as IPTV).

## 4. Remote Config

One Firebase Remote Config parameter, `AdsSplashUtils.remoteConfigKey` (`<pubspec name>_v1`; IPTV's is `iptv_n_v1`), whose value is the whole JSON — `assets/ads/config.json` with the app's ids. `getOnlineIds` (IPTV `ads_splash_utils.dart:32-292`):
1. reads every value from SharedPreferences (the copy the last online launch stored; first launch → the defaults in the code, ids `"11"`);
2. online only: `Firebase.initializeApp`, `fetchAndActivate` (fetch timeout 1 min, minimum interval 5 min), `jsonDecode` of the parameter → `setOnlineIds(map)` sets every `AdsVariable` field and stores it in SharedPreferences — so a value applies on this launch;
3. if that fails (no Firebase files, parameter missing, bad JSON) and nothing was ever stored → `setOnlineIds(assets/ads/config.json)` (A2); if something was stored, the stored values stay;
4. then `setupFbAdsId()` (Android: native factories + Facebook), `initializeGDPR()` (consent, iOS tracking prompt, `MobileAds.instance.initialize()`), `fetchPurchaseN()` (F4: these run whether step 2 worked or not).

Keys (IPTV's `config.json`; values are strings unless shown):

| Key | Meaning |
|---|---|
| `appOpenSplash` / `interSplash` | splash ad (app open wins when not `"11"`) |
| `appOpenAds` | app open on return from background |
| `interPreLoad` | the `onTapInter` interstitial |
| `nativeHome` / `nativeIntroBig` / `nativeFull` | small home native / big intro native / full native (IPTV loads none of `nativeFull`) |
| `banner` | inner-screen banners |
| `appOpenIntro` | intro finish app open |
| `appOpenPremium`, `interIntro`, `interPremium` | read and stored as IPTV does; no screen of IPTV shows them |
| `adShowHomeFlag` / `adShowIntroFlag` | `"1"` = home ads / intro native on |
| `homeFlagOnline` | `"0"` = an ad on every `onTapInter` tap; `"1"` = every second tap |
| `sendRevenueToAnalytics`, `sendRevenueToAnalyticsFor<Key>` (booleans) | paid events to Firebase Analytics (`AdsLoadUtil.sendRevenueToAnalytics`) |
| `facebookId`, `facebookToken` | Facebook SDK (Android, `MainActivity` `setToast`) |
| `nativeBGColor`, `btnTextColor`, `headerTextColor`, `bodyTextColor`, `btnBgColor1`, `btnBgColor2`, `btnAdTextColor`, `btnAdBgColor` | native ad colours, sent by `setupFbAdsId` |
| `showIntro` | `"1"` = the intro on the first launch |
| `showWeeklyPlan`, `showYearlyPlan` (booleans), `showDiscountPrice` | paywall plans (`premium_core`) |
| `premiumShow`, `useCount` (number) | free uses per feature before the paywall (`premium_core`) |
| `showShareBtn`, `showRateBtn`, `showPrivacyBtn` | settings rows |
| `showRateScreen` | not read (IPTV's reads are commented out) |
| `testerEmail`, `testerPass`, `showIAMTester` | stored as IPTV does; the template has no tester screen |

Any id set to `"11"` is off. Premium (`resetAdIds()`) sets every id to `"11"` except `banner` (IPTV `ads_variable.dart:109-127`; section 8).

## 5. Premium and consent

- **Premium = the store's active entitlement**, set into `AdsVariable.isPurchase` by the app's `AdsSplashUtils.fetchPurchase` hook (A5), which `fetchPurchaseN()` calls on every online launch; when it is true, `fetchPurchaseN` calls `AdsVariable.resetAdIds()` (IPTV `ads_splash_utils.dart:326-329`). On a purchase: `AdsVariable.isPurchase.value = true; AdsVariable.resetAdIds();` (IPTV `AdsUtils/dialog.dart:84-85`). Never a match on product or subscription id names (IPTV `ads_splash_utils.dart:321` — replaced by the hook; check P13).
- **The store: `PremiumStore.instance`** (`lib/premium_core/premium_store.dart`, RevenueCat, no state package). The guide app's hook configures it and checks the entitlement; on an active entitlement it sets `AdsVariable.isFirstTimePurchased`, `isPurchase` and `resetAdIds()`. An empty key = demo mode (nothing sold; `demoUnlock()` only in debug). Paywall: `loadPlans()`, one row per `plans` with the store's title and price, `buy`, **Restore** only from the user's tap, Terms + Privacy links (`release-check.mjs` C3, C4). `FreeUseGate.run('<feature>', …)` = IPTV's `checkPurchaseNormal` with `useCount` / `premiumShow`.
- **Consent:** `initializeGDPR()` → `ConsentInformation.requestConsentInfoUpdate` → `loadConsentForm()` when privacy options are required, else `initializeWithOutGDPR()` (tracking prompt, MobileAds); `AdsVariable.isPrivacyOptionsRequired` decides the Settings row, `showPrivacyOptionsForm` opens the form (check P17).

## 6. Tests

- `test/ads/ads_test.dart` (no SDK): `config.json` → every key in `AdsVariable` and SharedPreferences; `resetAdIds` (banner stays, as IPTV); F2 (`addAdIds` reads `nativeIntroBig`); `onTapInter`'s rule (`"11"`, odd/even `homeFlag`, gates, Premium, `isFirstTimeVisited` null, offline toast); F1 (`showInterCommon` with no ad opens the screen once); `setupFbAdsId` sends IPTV's 12 `setToast` keys. `test/premium_core/premium_rules_test.dart`: plans, free uses.
- `integration_test/ads_device_test.dart` on a phone or emulator with internet (unlocked): the interstitial loads through `loadInterCommon`; the small and big natives load through `smallNativeAds` / `bigNativeAds` and are drawn at IPTV's heights; the banner loads at the standard anchored adaptive size (< 100 dp); the app open ad loads through `AppOpenAdManager.loadAd`. Run it once per platform the contract has.
- Release: `flutter build apk --release`, install, launch — no crash (the R8 rules), splash interstitial shown (step 8 of `/app-factory:ads-implementation`).
- Per placement in the Ads table, the app's flow test reaches the screen and checks the ad widget is there for a free user and absent for Premium.

## 7. How the template relates to the build rules

`lib/ads/**`, `test/ads/**` and the installed native files are owned by the shared layer and exempt from flutter-app S3 (static fields and singletons, as IPTV), L11 (the installer lists the packages with their reasons) and `pipeline.mjs colors` (`lib/ads/` is skipped: the loader and native colours are IPTV's). Screens use only the calls in section 2–3; a deep audit judges the template against this file. S2 (no `material.dart` under `lib/domain/` or `lib/data/`): code there may import only `ads/ads_variable.dart` and call only `AdsVariable.isPurchase.value = …` and `AdsVariable.resetAdIds()` (check I4).

## 8. From IPTV_two to the template — every change, with IPTV's file:line

The port (no behaviour change): GetX `RxBool` → `RxFlag`; `Get.to` / `Get.back` / `Get.context` / `Get.width` → `AdsVariable.navigatorKey` / `MediaQuery`; `Obx` → `ValueListenableBuilder` / `ListenableBuilder`; ScreenUtil `.w` → `× width / 1242`; `debugPrint` → `showLog`; commented-out code not ported; `mapBoxKey` / `googleMapKey` (IPTV app features, not ads) not ported.

Crash and wrong-key fixes (the only behaviour changes, each marked in the code with its IPTV line):
- **F1** `showInterCommon` with no ad loaded called `navigateScreen()` and then `commonInterAd!` → a null-check crash (`ads/ads_load_util.dart:186-191`): now returns after `navigateScreen()`.
- **F2** `addAdIds` read `prefs.getString("nativeBig")`, a key nothing writes (`ads/ads_variable.dart:143`): now `"nativeIntroBig"`.
- **F3** `showAdIfAvailable` read `_appOpenLoadTime!` on a manager that never loaded (`ads/app_open_ad.dart:118`; `loadAppLifecycleReactor` creates one, `ads_splash_utils.dart:305-310`) → crash on the first resume: now returns when it is null.
- **F4** Facebook (`setupFbAdsId`), consent + MobileAds (`initializeGDPR`) and the purchase check (`fetchPurchaseN`) ran inside the Firebase `try` (`ads/ads_splash_utils.dart:99-288`): with no Firebase files, or any Remote Config error, the SDK never started and no native factory was registered. Now they run after it, online.
- **Banner (analyzer, not a crash):** `_loadAd` reads `context` after an `await` (`ads/banner_widget.dart:34-35`) — `flutter analyze` reports `use_build_context_synchronously`, and on a closed screen IPTV's surrounding `catch` takes the exception. Now `if (!mounted) return;` before it; the deprecated size call keeps `// ignore: deprecated_member_use`.

Additions (app-factory's, so the pattern works in any app):
- **A1** iOS native factories `smallNativeAds` / `bigNativeAds` / `fullNativeAds` and the `nativeChannel` colours in `AppDelegate.swift` — IPTV has none, so its natives never show on iOS. Unrun (no iOS build on this Mac).
- **A2** `assets/ads/config.json` (IPTV's `config.json`) used by `getOnlineIds` when Remote Config cannot be read and nothing was stored.
- **A3** `RxFlag` and `AdsVariable.navigatorKey` (for GetX).
- **A4** `AdsSplashUtils.remoteConfigKey` = `<pubspec name>_v1` (IPTV: `"iptv_n_v1"` in the code).
- **A5** `AdsSplashUtils.fetchPurchase`: the app's store check (IPTV's `configureSDK` / `premiumInit` / `restorePurchases` on every launch / product-name match, `ads_splash_utils.dart:312-333`, are app code).
- **A6** `facebook-android-sdk` pinned to 19.0.0 (IPTV: `latest.release`).

IPTV defects kept as they are (the user chose "fix crashes only"; each is IPTV's behaviour):
- Banners show for Premium users: `BannerWidget` has no `isPurchase` check and `resetAdIds()` leaves `banner` (`ads/ads_variable.dart:109-127`).
- An app open ad closed within 1 s of showing pops a real screen: the `EmptyScreen` is pushed 1 s after the show and popped on dismiss (`ads/app_open_ad.dart:128-142`; the same at `:69` / `:85` for the splash app open).
- A splash interstitial that fails to show never navigates (`ads/ads_load_util.dart:272-278`): the app stays on the splash.
- A new `AppLifecycleReactor` listener on every Home build and every background (`ads_splash_utils.dart:298-310`, `life_cycle.dart:30`): listeners accumulate.
- Nothing stops the resume app open ad on the way back from something the app opened itself — a file picker (`controllers/import_controllers.dart:151`, `:325`), share, review, the store: IPTV has no skip; the ad shows when one is loaded.
- Offline: an `onTapInter` tap shows a toast and opens nothing (`utils/app_variable.dart:88-90`); an offline launch skips Remote Config, consent and MobileAds (`ads_splash_utils.dart:99`, `289-292`).
- `banner_widget.dart:34` uses `getCurrentOrientationAnchoredAdaptiveBannerAdSize`, deprecated in google_mobile_ads 9.x.

## 9. Other patterns in `references/`

`references/ADS_REFERENCE.md` (another app: central `Ads` service, native cache, welcome-back native on resume, an interstitial on navigation and back press every second click) and `references/flutter-admob-ads.md` (a step-by-step skill with Android XML examples). Use them only when CONTRACT.md asks for one of those placements; the API corrections at the end of `flutter-admob-ads.md` still apply.
