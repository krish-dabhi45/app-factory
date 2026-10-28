---
name: flutter-ads
description: AdMob ads + Firebase Remote Config for a Flutter app built by app-factory — IPTV_two's ads implementation (/Users/mach/testing/IPTV_two lib/ads/: its files, classes, methods and flow, ported to plain Flutter in the guide app common_flow_demo) on the APP'S OWN variables: one Remote Config key per placement of the app, named by the app (its existing ad / Remote Config names kept), in remote_config.json (the value to publish; not bundled), from which lib/ads/ads_variable.dart is generated; the IPTV code takes those ids as parameters (splash interstitial, intro big native + intro app open, onTapInter interstitial with the odd-homeFlag back rule, natives, banners, resume app open, Premium = every id "11"). Installed by scripts/ads-install.mjs from templates/flutter/ads. Every app-factory Flutter app gets it unless its PRD says the app has no ads. Use when CONTRACT.md section 9 (Ads) lists placements, or when asked to add, audit or move ads or Remote Config in a Flutter app.
user-invocable: false
---

# Flutter ads + Remote Config — IPTV_two's implementation on the app's own variables

Two parts, kept apart:
- **The implementation = IPTV_two's**, as it is: `/Users/mach/testing/IPTV_two` `lib/ads/` (`ads_splash_utils.dart`, `ads_load_util.dart`, `app_open_ad.dart`, `life_cycle.dart`, `banner_widget.dart`), `onTapInter` (`lib/utils/app_variable.dart`), `AdsUtils/loading_screen.dart`, its Android `MainActivity.kt` + native ad factories + `native_admob_small/big/full.xml`, `proguard-rules.pro` — the same files, classes, methods, flow and style (static `AdsVariable` fields, the SharedPreferences copy, `"11"` = off), ported to plain Flutter in the guide app `/Users/mach/testing/common_flow_demo`: GetX `RxBool` → `RxFlag` (a `ValueNotifier<bool>` with `.value` / `.refresh()`), `Get.context` → the caller's `BuildContext` (no global navigator key), `Obx` → `ValueListenableBuilder`, `15.w` → `15 × width / 1242` (IPTV's ScreenUtil design width). `templates/flutter/ads/` is that code byte for byte (`ads-install.mjs selftest` compares every file).
- **The variables = the app's own.** IPTV's code read IPTV's own fields (`AdsVariable.interPreLoad`, `appOpenAds`, `appOpenSplash`, `appOpenIntro`, `adShowHomeFlag`, `homeFlagOnline`, …) inside its methods; here every such id or switch is a **parameter** the app passes (section 3), and the template reads no app variable (the selftest checks it). The app's keys and values live in its `remote_config.json` (section 4) — one key per placement, named by the app; `lib/ads/ads_variable.dart` is **generated** from it (`ads-install.mjs generate`). Nothing of IPTV's own variable list or values (its 51 keys, `testerEmail`, `showDiscountPrice`, its orange `#FF7236`, …) goes into an app.

Every behaviour change from IPTV is in section 8 with IPTV's file:line.

**0.42.0 (2026-10-28)** — the template is IPTV's implementation (the earlier `lib/google_ads_material/` layer — `AdsId`, `AdFlags`, `RemoteConfigLoader`, `AdTapHelper`, `SplashAds`, `AppHud`, `AdsConsent`, `remote_config_default.json`, `skipNextResume`, … — was app-factory's own design and is gone; `ads-install.mjs reset` removes it), on the app's own variables. Checked: `ads-install.mjs selftest` (the generator on an app's own names — Live Street View's `fullScreenInterstitialAdUnitId` / `landmarkInterstitialAdUnitId` — and no IPTV variable in the output; 25 template files = the guide app's; the guide app's `ads_variable.dart` = generate(its 33-key `remote_config.json`)). The guide app: `flutter analyze` clean; the 5 ad device tests and the 17 unit tests (`test/ads/`, `test/premium_core/`, run on the phone) pass on the Samsung M04 (Android 14); a walk on the phone (debug, the stored copy of a last online launch in SharedPreferences, no Firebase files): splash interstitial → intro big native (AdMob validator: "No implementation issues found") → intro app open → Home; two taps fired together on a feature card → one "Loading..." dialog, one interstitial request, the screen opened once (one Back = Home); the resume app open ad closed after 2 s → the same screen, nothing popped; its release build: the splash interstitial, no crash. A fresh `flutter create` app (plain `MaterialApp`, no navigator key) with its own `remote_config.json` (`interSplashScreen`, `interEditorTap`, `nativeGalleryScreen`, `bannerPhotoDetail`, `appOpenResume`, `editorTapEvery`): installer clean (no asset added), analyze clean, `ads-install.mjs changes`: every P check passes, 16/16 tests on the Samsung (5 device, 11 unit); on the phone: splash interstitial, a double tap on its editor row → one dialog, the editor once with its banner; the next tap → the interstitial; the resume app open ad → back on the editor. Not done: iOS (this Mac's `xcode-select` points at CommandLineTools: no iOS build; the iOS factories are unrun); host `flutter test` (the same cause: "Building native assets failed" — the unit tests were run on the phone instead, as `integration_test/` copies); an offline launch on the phone; the Premium purchase dialog (`loadingScreen` from `purchase_controller.dart`; the store is in demo mode); the app open ad closed within 1 s (its close button does not answer before about 2 s on the phone, and Back does not close it).

## 1. Verified facts

**Ad unit ids.** Debug and release serve the id they are given, as IPTV does: a Google demo id shows a Google test ad in release too and earns nothing. The app's own ids go into its Remote Config value before a store release (`release-check.mjs` O6 lists every demo unit left in `remote_config.json`; O3 the sample App IDs). Google's demo units per platform ([Android](https://developers.google.com/admob/android/test-ads), [iOS](https://developers.google.com/admob/ios/test-ads), fetched 2026-10-20):

| Format | Android | iOS |
|---|---|---|
| App open | `ca-app-pub-3940256099942544/9257395921` | `ca-app-pub-3940256099942544/5575463023` |
| Banner | `ca-app-pub-3940256099942544/6300978111` (adaptive: `…/9214589741`) | `ca-app-pub-3940256099942544/2934735716` (adaptive: `…/2435281174`) |
| Interstitial | `ca-app-pub-3940256099942544/1033173712` | `ca-app-pub-3940256099942544/4411468910` |
| Native | `ca-app-pub-3940256099942544/2247696110` | `ca-app-pub-3940256099942544/3986624511` |

A key holds one id for both platforms (IPTV's schema): an app on both platforms gives its iOS ids through a platform condition in the Firebase console. Sample **App IDs** (written by the installer, replaced by the owner): Android `ca-app-pub-3940256099942544~3347511713` (`AndroidManifest.xml` `com.google.android.gms.ads.APPLICATION_ID`), iOS `ca-app-pub-3940256099942544~1458002511` (`Info.plist` `GADApplicationIdentifier`).

**Build facts (each broke a build or a launch):**
- `native_admob_*.xml` use CardView and AppCompat attributes (`cardCornerRadius`, the `RatingBar` style on `Theme.AppCompat`). IPTV gets both through `com.facebook.android:facebook-android-sdk` (`latest.release`, resolved 2026-10-28 to 19.0.0); with only `facebook-core:18.0.0` the build failed "native_admob_big.xml:145: attribute cardCornerRadius not found". The installer adds `facebook-android-sdk:19.0.0` (pinned) and `com.intuit.sdp:sdp-android:1.0.6` (the layouts' `@dimen/_8sdp` sizes), as IPTV `android/app/build.gradle.kts:63-64`.
- **Release crashed at launch without IPTV's R8 rules:** "Unable to get provider androidx.startup.InitializationProvider … Failed to create an instance of androidx.work.impl.WorkDatabase" (Moto e22s, 2026-10-28) — R8 strips WorkManager's Room database, which facebook-android-sdk brings. IPTV's `proguard-rules.pro` (`-keep class androidx.work.** { *; }`, Room, Facebook, Play services) and its release block (`isMinifyEnabled = true`, `proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")`, `build.gradle.kts:41-45`) fixed it; the installer adds both (an app's own `proguard-rules.pro` gets IPTV's rules appended).
- Android natives need the factories registered: IPTV's `MainActivity.kt` registers `smallNativeAds` / `bigNativeAds` / `fullNativeAds` when Dart calls `nativeChannel` → `setToast` (`setupFbAdsId()`, from `getOnlineIds`), reading exactly these arguments with `!!`: `facebookId`, `facebookToken`, `nativeBGColor`, `btnBgColor1`, `btnBgColor2`, `btnTextColor`, `btnAdTextColor`, `btnAdBgColor`, `headerTextColor`, `bodyTextColor`. An app with a native ad therefore has these ten keys in its `remote_config.json` (the factories' inputs — section 4); a native loaded before that call fails.
- `google_mobile_ads`' `Package.swift` declares iOS 13; `webview_flutter_wkwebview` 3.27.1 declared iOS 15 → Swift Package Manager refused the pair; 3.27.2 declares 13 again. The installer pins it under `dependency_overrides:` and sets the iOS deployment target to 15.0.
- `firebase_core` 5.0.0 needs Xcode 26.2+ for an iOS build ("Firebase requires Swift 6.2.3 or higher").
- Host `flutter test` on this Mac fails in the `objective_c` package's native-assets hook (the CommandLineTools linker: "libSystem.B.tbd … unknown architecture"); `DEVELOPER_DIR` / `SDKROOT` did not change its sysroot. Until `sudo xcode-select -s /Applications/Xcode-<version>.app` is run, unit tests run on a device as `integration_test/` copies (`flutter test integration_test/<copy>.dart -d <id>`).
- A device test on a locked phone hangs: wake and unlock before `flutter test -d <phone>`.
- iOS consent: `initializeGDPR()` → UMP; when no form is required, `initializeWithOutGDPR()` asks iOS's tracking prompt (needs `NSUserTrackingUsageDescription`) and then starts MobileAds; the startup waits for the answer.
- **Package versions are exact** — the guide app's `pubspec.lock`: `google_mobile_ads` 9.2.0, `firebase_core` 5.0.0, `firebase_remote_config` 7.0.0, `firebase_analytics` 13.0.0, `firebase_crashlytics` 6.0.0, `shared_preferences` 2.5.6, `app_tracking_transparency` 2.0.7, `connectivity_plus` 7.3.2, `fluttertoast` 10.0.2, `flutter_spinkit` 5.2.2, and with the Premium layer `purchases_flutter` 10.16.0. The installer sets an app's existing line for one of them to that version (its comment kept); a git/path entry is left and named in its to-do list.

## 2. Where each ad goes — the "Ads" section of CONTRACT.md

IPTV's placements (IPTV paths under `lib/`; `screens/` and `screens/bottom_bar/` left out of the file names). Map every screen of the app to one row; a screen that matches no row gets no ad. Every placement becomes one criterion ("AC<n> <screen> shows <format> at <position> for non-Premium users") and **one key of the app's `config.json`** (section 4) — the "Call" column passes that key; `<key>` stands for the app's own name.

| Screen | Ad | When / how (IPTV file:line) | Call (the app's keys passed in) |
|---|---|---|---|
| Splash, every launch | Interstitial; app open instead when the app has a splash app open key that is not `"11"` (IPTV `ads_load_util.dart:243-245`) | After `getOnlineIds` (stored values → Firebase → Remote Config → Facebook + native factories → consent + MobileAds → purchase check), online only (`splash_screen.dart:30-50`). The next screen opens behind the ad 1 s after its impression (`ads_load_util.dart:265-269`); on a returning Android launch `homeFlag++` (first tap free, `splash_screen.dart:39-41`) and the home native preloads (`:55-66`) | `AdsLoadUtil().loadInterSplash(loadPreLoadAds, navigateScreen, AdsVariable.<interKey>, enable: AdsVariable.<revenueKey>, appOpenAdUnitId: AdsVariable.<appOpenKey>)` (`appOpenAdUnitId` only when the app has one) |
| Intro, first launch (until `"isFirstTime"` is stored) | Big native under the page, drawn only once loaded (`intro_screen.dart:145`) | Loaded before the intro opens (`splash_screen.dart:86-91`) | `AdsLoadUtil().loadNative(AdsVariable.<nativeKey>, false, false, enable: …)` → the app keeps the `NativeAd` (its own field; IPTV: `AdsVariable.nativeAdIntro`) → `ValueListenableBuilder(valueListenable: AdsLoadUtil.isNativeAdLoaded, …)` → `NativeAdsWidget(showNativeAd: <it>, isSmallNative: false, isFullNative: false)` |
| Intro finish (last Continue) | App open, only if loaded | Loaded in `initState` (`intro_screen.dart:41`); then `"isFirstTime"` stored (`:124`) → Premium (iOS, online, not purchased) or Home | `AppOpenAdManager().loadIntroPremiumAdOnly(AdsVariable.<key>)`; `showOpenAdIntroPremium(AdsVariable.<key>, finish)` |
| Home | Small native in the home content, one ad kept (loaded only while the app's holder is null, `home_screen.dart:95-99`) | | `loadNative(AdsVariable.<key>, true, false, enable: …)` → `NativeAdsWidget(showNativeAd: <it>, isSmallNative: true, isFullNative: false)` |
| Home feature buttons; the action after a feature's picker or sheet; a content tab item's main action | Interstitial | `onTapInter` (`utils/app_variable.dart:61-91`): offline → toast "Please Start Your Internet." and nothing opens; Premium or `isFirstTimeVisited == null` → opens, no ad; `everyTapFlag` `"0"` → every tap; else an ad when `homeFlag` is even — "Loading..." 2 s, then the ad, the screen 1 s after its impression; `homeFlag++` on every counted tap | `onTapInter(() => <push>, adUnitId: AdsVariable.<key>, showFlag: AdsVariable.<flag>, everyTapFlag: AdsVariable.<flag>, enable: AdsVariable.<revenueKey>)` (the two flags only when the app has such switches; default `"1"`) |
| Every screen such a tap opens | none — on Back an odd `homeFlag` is made even, so the next tap shows an ad (`playlist_group_screen.dart:25-29`) | | `PopScope(onPopInvokedWithResult: (didPop, _) { if (didPop && AdsVariable.homeFlag.isOdd) AdsVariable.homeFlag++; }, child: …)` |
| Inner list screens and a content tab root (IPTV Channels); a search field on a list is fine | Banner, the last child of the screen's `Column` (`channels_screen.dart:135`, `channel_list_screen.dart:122`, `playlist_group_screen.dart:82`) | Standard anchored adaptive size | `BannerWidget(adsId: AdsVariable.<key>, enable: AdsVariable.<revenueKey>)` |
| A screen with a text field, a media player, Home, Settings, Guide, legal pages | no banner | | |
| Premium / paywall | none; no resume ad while it is open (`in_app_purchase/app.dart:80`, cleared by the next `onTapInter`) | | `AdsVariable.isShowingAd.value = true;` in `initState` |
| App back from background | App open | Listener started on Home (`home_screen.dart:57`); loaded when the app goes to the background without one (`life_cycle.dart:28-31`), 4 h expiry | `AdsSplashUtils().loadAppLifecycleReactor(AdsVariable.<key>)` in Home's first build |
| Settings | "Privacy options" row when consent says so (`setting_screen.dart:127-141`) | | `if (AdsVariable.isPrivacyOptionsRequired.value) … showPrivacyOptionsForm((formError) {})` |
| **No ad, ever** (IPTV, each tap classified): a tab switch (`home_screen.dart:201` only sets the index), "How to", a recent item (`stream_now_iptv_screen.dart:169`), pro, settings, favourite / search / grid-list, more / edit / delete, help, any tap inside an inner screen, Back | none | | |

Native heights (`NativeAdsWidget`, IPTV's ScreenUtil values): small `(2688 × 140 / 690) × w`, big `(2688 × 250 / 690) × w`, with `w = screen width / 1242`. The Android look is IPTV's layouts with the app's colours (the ten factory keys, section 4); on iOS the template's `AppDelegate.swift` draws the same three factory ids from the same `setToast` values (section 8, A1).

## 3. Install and wire

**1. The app's `remote_config.json` first** (section 4): `remote_config.json` in the project root with one key per placement of the step-2 table, named by the app — an app that already has ad / Remote Config variables keeps their exact names and values (Live Street View: `fullScreenInterstitialAdUnitId`, `landmarkInterstitialAdUnitId`); a placement it does not have yet gets a name from its own screen in IPTV's style (`inter<Screen>`, `native<Screen>`, `banner<Screen>`, `appOpen<Screen>`); the switches and app values it actually has; with a native, the ten factory keys with the app's theme colours.

**2. Install** — once, in the interface step (or the first group); in an app that is already built, `/app-factory:ads-implementation` does all of this section: `node "<plugin>/scripts/ads-install.mjs" "$(pwd)"`, then `flutter pub get`. It refuses without a usable `remote_config.json` (it says what is wrong), then generates `lib/ads/ads_variable.dart` from it and adds the template's `lib/ads/` (8 files), `test/ads/ads_test.dart`, `integration_test/ads_device_test.dart`, `lib/premium_core/` + `test/premium_core/` (section 5; not with `--no-premium`), the packages at the tested versions; Android: IPTV's `MainActivity.kt` (when the app's is Flutter's default), `NativeAds.kt`, `res/layout/native_admob_small/big/full.xml`, `res/font/poppins*.ttf`, `res/values/ads_styles.xml`, `facebook-android-sdk` + `sdp-android`, `proguard-rules.pro` + the release R8 lines, permissions, App ID, Facebook meta-data, minSdk 24 when the app sets a lower number; iOS: `AppDelegate.swift` with the three factories, `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`, iOS 15. It writes `AdsSplashUtils.remoteConfigKey` = `<pubspec name>_v1`. It never overwrites a file (but the generated one); when `MainActivity.kt` or `AppDelegate.swift` is not Flutter's default it prints `NOT DONE` with the exact lines to add.

**A key added or changed later:** edit `remote_config.json`, then `node "<plugin>/scripts/ads-install.mjs" generate "$(pwd)"` (rewrites `ads_variable.dart`; never edit that file by hand — check P1).

**Set per app:** Firebase files (`google-services.json`, `GoogleService-Info.plist`) — without them Remote Config is never read, so every ad id stays `"11"` (no ads) as in IPTV — the app does not bundle `remote_config.json`; the Remote Config parameter `<pubspec name>_v1` = the app's `remote_config.json` with its real ids; the owner's App IDs; with Premium, the RevenueCat keys as build skill L12 keys and the entitlement id.

**Wire** — the guide app's code (IPTV's flow, `main.dart:22`, `screens/splash_screen.dart:28-96`), with the guide's own keys as the example:

```dart
// main(): IPTV main.dart:22 — onTapInter shows nothing while this is null
final prefs = await SharedPreferences.getInstance();
AdsVariable.isFirstTimeVisited = prefs.getBool("isFirstTime") ?? false;
// No navigator key: the "Loading..." dialog uses the tapped widget's context (onTapInter's first argument)

// Splash, after the first frame (the guide app: AppFlow.runSplash):
AdsSplashUtils.fetchPurchase = () async { /* the app's store check: sets AdsVariable.isPurchase (section 5) */ };
await AdsSplashUtils().getOnlineIds(navigateScreen);       // offline: navigateScreen after 4 s, nothing else
if (await checkConnectivity()) {
  await AdsLoadUtil().loadInterSplash(
    () {
      loadPreLoadAds();                                     // the home native, if the app has one
      if (AdsVariable.isFirstTimeVisited == true && Platform.isAndroid) AdsVariable.homeFlag++;
    },
    () => navigateScreen(),
    AdsVariable.interSplash,                                // the guide's own splash key
    enable: AdsVariable.sendRevenueToAnalyticsForInterSplash);
}
// navigateScreen (IPTV splash_screen.dart:68-96): returning user → online, not purchased, iOS ? Premium : Home;
//   first launch → the app's intro switch on ? (load the intro native, then Intro) : Home
// Intro: loadIntroPremiumAdOnly(AdsVariable.appOpenIntro) in initState; last Continue →
//   showOpenAdIntroPremium(AdsVariable.appOpenIntro, finish); finish stores "isFirstTime" true, then Premium (iOS) / Home
// Home, first build: AdsSplashUtils().loadAppLifecycleReactor(AdsVariable.appOpenAds); prefs.setBool("isFirstTime", true);
//   feature taps: onTapInter(context, () => push, adUnitId: AdsVariable.interPreLoad, showFlag: AdsVariable.adShowHomeFlag,
//                            everyTapFlag: AdsVariable.homeFlagOnline, enable: AdsVariable.sendRevenueToAnalyticsForInterPreLoad)
// Each screen a tap opens: the PopScope odd-homeFlag rule; inner list screens: BannerWidget(adsId: AdsVariable.banner, …)
// Premium initState: AdsVariable.isShowingAd.value = true;   Settings: the privacy options row
```

App shapes:
- **No splash screen:** run the splash code once the first frame is drawn, never inside a function widget tests call.
- **No onboarding:** no intro keys; `navigateScreen` goes straight to Home.
- **No paid tier:** installed with `--no-premium`; `AdsSplashUtils.fetchPurchase` stays null, `AdsVariable.isPurchase` stays false.
- **Tabs:** the tab bar only changes the tab — never `onTapInter` (check P16); a content tab's item action goes through `onTapInter` (one `homeFlag` for all tabs, as IPTV).

## 4. The app's `remote_config.json` and the generated `AdsVariable`

`remote_config.json` (project root) is the app's Remote Config value — one JSON object, published as parameter `AdsSplashUtils.remoteConfigKey` (`<pubspec name>_v1`; IPTV's is `iptv_n_v1`). It is not an asset: the app never reads it (IPTV has no bundled copy); the generator reads it. Each key:
- a lowerCamelCase Dart name, not one of the ads code's own state names (`isFirstTimeVisited`, `isFirstTimePurchased`, `appOpenAd`, `appOpenAdSplash`, `appOpenAdIntroPremium`, `isPurchase`, `isShowingAd`, `isPrivacyOptionsRequired`, `homeFlag`);
- a string, a boolean or a number (`2.5` for a decimal);
- **an ad id** = an AdMob ad unit (`ca-app-pub-…/…`) or `"11"` (off): it starts `"11"` in the code until a stored or online value arrives, and a purchase turns it `"11"`;
- with a native ad, all ten factory keys (section 1), the colours from the app's theme (`#RRGGBB`), `facebookId` / `facebookToken` `"11"` unless the app uses Facebook.

`ads-install.mjs generate` checks it and writes `lib/ads/ads_variable.dart` in IPTV's style: the ads code's state (above), then one `static` field per key (its type from the value; default `"11"` for an ad id, else the value), and the IPTV steps for these keys — `readStored(prefs)` (IPTV `getOnlineIds`' reads, `ads_splash_utils.dart:32-97`), `setOnlineIds(map, prefs)` (every key into its field and into SharedPreferences, `:116-271`), `resetAdIds()` (every ad id `"11"`, `ads_variable.dart:109-127`), `nativeChannelArgs()` (the `setToast` map; null with no native keys) and `valueOf(key)`.

`getOnlineIds` (IPTV `ads_splash_utils.dart:32-292`) on every launch: `readStored` (first launch: the defaults above); online only: Firebase, `fetchAndActivate` (1 min timeout, 5 min interval), the parameter → `setOnlineIds`; if that fails, the stored values stay (first launch: the defaults — every ad id `"11"`, no ads), as IPTV; then `setupFbAdsId()`, `initializeGDPR()`, `fetchPurchaseN()` (F4: whether Firebase worked or not); offline: the stored values, the next screen after 4 s.

The guide app's `remote_config.json` (33 keys, its own): `interSplash`, `nativeIntroBig`, `appOpenIntro`, `nativeHome`, `interPreLoad`, `banner`, `appOpenAds`, `adShowIntroFlag`, `adShowHomeFlag`, `homeFlagOnline`, `sendRevenueToAnalyticsFor<Key>` for its five revenue switches, the ten factory keys (its theme: card `#FFFFFF`, text `#111827` / `#6B7280`, CTA `#6366F1` → `#8B5CF6`), `showIntro`, `showShareBtn` / `showRateBtn` / `showPrivacyBtn`, `showWeeklyPlan` / `showYearlyPlan`, `premiumShow`, `useCount`.

## 5. Premium and consent

- **Premium = the store's active entitlement**, set into `AdsVariable.isPurchase` by the app's `AdsSplashUtils.fetchPurchase` hook (A5), which `fetchPurchaseN()` calls on every online launch; when true, `fetchPurchaseN` calls `AdsVariable.resetAdIds()` (IPTV `ads_splash_utils.dart:326-329`). On a purchase: `AdsVariable.isPurchase.value = true; AdsVariable.resetAdIds();` (IPTV `AdsUtils/dialog.dart:84-85`). Never a match on product or subscription id names (IPTV `ads_splash_utils.dart:321`; check P13).
- **The store: `PremiumStore.instance`** (`lib/premium_core/premium_store.dart`, RevenueCat). Its switches are read by key from the app's values (`PremiumValues.value` = `AdsVariable.valueOf`): `show<Plan>Plan` (false or `"0"` hides that plan), `premiumShow` (`"0"` = no limit), `useCount` (free uses per feature) — only when the app has those keys (a key it lacks: plan shown, no limit). Paywall: `loadPlans()`, the store's titles and prices, `buy`, **Restore** only from the user's tap, Terms + Privacy links (`release-check.mjs` C3, C4). `FreeUseGate.run('<feature>', …)` = IPTV's `checkPurchaseNormal`.
- **Consent:** `initializeGDPR()` → `requestConsentInfoUpdate` → the consent form when privacy options are required, else `initializeWithOutGDPR()` (tracking prompt, MobileAds); `AdsVariable.isPrivacyOptionsRequired` decides the Settings row, `showPrivacyOptionsForm` opens the form (check P17).

## 6. Tests

- `test/ads/ads_test.dart` (no SDK), on the app's own keys (read from `remote_config.json`): every key lands in its field and in SharedPreferences; the next launch reads the stored copy; `resetAdIds` turns every ad id `"11"` and keeps every other value; `onTapInter`'s rule (id `"11"`, odd / even `homeFlag`, `showFlag`, Premium, `isFirstTimeVisited` null, offline toast, a second tap while one runs ignored); `loadingScreen` shows one dialog however often `show` is called, and `hide` closes it; F1; `setupFbAdsId` sends the factory arguments when the app has native keys. `test/premium_core/premium_rules_test.dart`: plans, free uses, a missing key.
- `integration_test/ads_device_test.dart` on a phone or emulator with internet (unlocked), with Google's demo units of the platform (no app key needed): the interstitial through `loadInterCommon`; the small and big natives through `smallNativeAds` / `bigNativeAds` at IPTV's heights; the banner at the standard anchored adaptive size (< 100 dp); the app open through `AppOpenAdManager.loadAd`.
- Release: `flutter build apk --release`, install, launch — no crash (the R8 rules), the splash ad shown (step 8 of `/app-factory:ads-implementation`).
- Per placement in the Ads table, the app's flow test reaches the screen and checks the ad widget is there for a free user and absent for Premium.

## 7. How the template relates to the build rules

`lib/ads/**` (the generated `ads_variable.dart` included), `test/ads/**` and the installed native files are owned by the shared layer and exempt from flutter-app S3 (static fields and singletons, as IPTV), L11 (the installer lists the packages with their reasons) and `pipeline.mjs colors` (`lib/ads/` is skipped). Screens use only the calls of sections 2–3; a deep audit judges the template against this file. S2 (no `material.dart` under `lib/domain/` or `lib/data/`): code there may import only `ads/ads_variable.dart` and call only `AdsVariable.isPurchase.value = …` and `AdsVariable.resetAdIds()` (check I4).

## 8. From IPTV_two to the template — every change, with IPTV's file:line

The port (no behaviour change): GetX `RxBool` → `RxFlag`; `Get.context` → the caller's `BuildContext` (`onTapInter(context, …)`, `loadingScreen.show(context)`; an app has no global navigator key for the ads); `Get.width` → `MediaQuery` (the toast: the window size); `Obx` → `ValueListenableBuilder` / `ListenableBuilder`; ScreenUtil `.w` → `× width / 1242`; `debugPrint` → `showLog`; commented-out code not ported.

The app's own variables (the user's choice, 2026-10-28) — IPTV's code read IPTV's fields; here the caller passes the app's:
- `onTapInter(context, onTap, {adUnitId, showFlag, everyTapFlag, enable})` (IPTV read `interPreLoad`, `adShowHomeFlag`, `homeFlagOnline`, `sendRevenueToAnalyticsForInterPreLoad`, `utils/app_variable.dart:61-90`);
- `loadInterSplash(…, {enable, appOpenAdUnitId})` and `loadAppOpenSplash(adUnitId, …)` (IPTV read `appOpenSplash`, `ads_load_util.dart:58-59`, `238-245`);
- `AppLifecycleReactor(appOpenAdManager:, adUnitId:)`, `loadAppLifecycleReactor(adUnitId)`, `loadAppOpenAd(adUnitId)` (IPTV read `appOpenAds`, `life_cycle.dart:23-30`, `ads_splash_utils.dart:298-310`);
- `showOpenAdIntroPremium(addId, …)` (IPTV reloaded `appOpenIntro`);
- `sendRevenueToAnalytics(…, enabled)`: only the caller's switch (IPTV also checked its own `sendRevenueToAnalytics`, `ads_load_util.dart:24-55`; an app with an all-ads switch passes `all && thisAd`);
- `getOnlineIds` / `setOnlineIds` / `resetAdIds` / `setupFbAdsId` on the generated `AdsVariable` (IPTV wrote out each of its 51 keys, `ads_splash_utils.dart:32-97`, `116-271`, `ads_variable.dart:109-127`);
- the loaded natives are the app's own fields (IPTV: `AdsVariable.nativeAdHome` / `nativeAdIntro`; the guide: `AppFlow.nativeAdHome` / `nativeAdIntro`);
- `PremiumValues` reads by key (`AdsVariable.valueOf`); IPTV's settings-row switches are the app's own keys, read where the app uses them;
- not ported, no IPTV screen calls them: `loadAppOpenIntroPremium`, `loadInterIntroPremium`, `loadIntroPremiumAd`, `addAdIds` (F2 was its wrong key; `readStored` reads every key the app has).

Crash and wrong-key fixes (each marked in the code with its IPTV line):
- **F1** `showInterCommon` with no ad loaded called `navigateScreen()` and then `commonInterAd!` → a null-check crash (`ads/ads_load_util.dart:186-191`): now returns after `navigateScreen()`.
- **F2** `addAdIds` read `"nativeBig"`, a key nothing writes (`ads/ads_variable.dart:143`): `addAdIds` is replaced by the generated `readStored`.
- **F3** `showAdIfAvailable` read `_appOpenLoadTime!` on a manager that never loaded (`ads/app_open_ad.dart:118`) → crash on the first resume: now returns when it is null.
- **F4** Facebook, consent + MobileAds and the purchase check ran inside the Firebase `try` (`ads/ads_splash_utils.dart:99-288`): with no Firebase files the SDK never started. Now after it, online.
- **F5** a second tap that lands before the "Loading..." dialog (during `onTapInter`'s connectivity check, `utils/app_variable.dart:63`) runs too: two dialogs, two interstitial loads, the screen opened twice (`:71-76`). Now one `onTapInter` at a time; `LoadingScreen.show` adds no second dialog and `hide` pops only its own (IPTV `AdsUtils/loading_screen.dart:55-59` pops whatever route is on top).
- **Not ported: the black `EmptyScreen`** behind an app open ad (`Get.to` on show, `Get.back()` on close, `ads/app_open_ad.dart:69`, `:85`, `:128-130`, `:142`). Nothing in IPTV reads that route (no `RouteAware` / navigator observer), the ad covers the screen, and its `Get.back()` popped a real screen: the app's own when the ad closed within the 1 s before the push, and on the splash app open the screen `navigateScreen` had just opened (its `Get.offAll` runs after an `await`, so it removes the black screen first). It was also the only reason the ads code needed a navigator outside a tap.
- **Banner (analyzer, not a crash):** `_loadAd` reads `context` after an `await` (`ads/banner_widget.dart:34-35`; IPTV's `catch` takes the exception on a closed screen) — `if (!mounted) return;` first, for `flutter analyze`.

Additions: **A1** iOS factories `smallNativeAds` / `bigNativeAds` / `fullNativeAds` + the `nativeChannel` colours in `AppDelegate.swift` (IPTV has none; unrun here). **A3** `RxFlag`. **A4** `remoteConfigKey` = `<pubspec name>_v1`. **A5** `AdsSplashUtils.fetchPurchase` (IPTV's `configureSDK` / `premiumInit` / restore on every launch / product-name match are app code). **A6** `facebook-android-sdk` pinned to 19.0.0.

IPTV defects kept (the user chose "fix crashes only"):
- A splash interstitial that fails to show never navigates (`ads/ads_load_util.dart:272-278`).
- A new `AppLifecycleReactor` listener on every Home build and every background (`ads_splash_utils.dart:298-310`, `life_cycle.dart:30`).
- Nothing stops the resume ad on the way back from a picker, share, review or the store (IPTV `controllers/import_controllers.dart:151`, `:325`: no skip).
- Offline: an `onTapInter` tap shows a toast and opens nothing (`utils/app_variable.dart:88-90`); an offline launch skips Remote Config, consent and MobileAds (`ads_splash_utils.dart:99`, `289-292`).
- `BannerWidget` has no Premium check (IPTV draws banners for Premium users — its `resetAdIds` also left `banner`). With the generated `resetAdIds` every ad id of the app is `"11"` after a purchase, so a banner whose key is an ad id loads nothing for Premium.
- `banner_widget.dart:34` uses `getCurrentOrientationAnchoredAdaptiveBannerAdSize`, deprecated in google_mobile_ads 9.x.

## 9. Other patterns in `references/`

`references/ADS_REFERENCE.md` and `references/flutter-admob-ads.md`: other apps' patterns. Use them only when CONTRACT.md asks for one of those placements.
