---
name: flutter-admob-ads
description: Implement, extend, or audit a complete AdMob ad system in a Flutter app (google_mobile_ads) - banner, native (small/big/full), interstitial, rewarded - with central ad-ID storage (AdsVariable), SharedPreferences fallback, Firebase Remote Config, per-screen load-if-null guarantees, screen-based preloading, and the Android native ad XML layouts plus MainActivity factory registration. Use this skill whenever the user mentions ads, AdMob, google_mobile_ads, native ads, banner/interstitial ads, ad unit IDs, remote-config ad IDs, preloading ads, big_native_ad / small_native_ad XML, NativeAdFactory, or "add ads to my Flutter app", even if they don't say "skill" or "AdMob" explicitly.
---

# Flutter AdMob Ads

Builds the ad system described in `references/ADS_REFERENCE.md` (the `Ads` singleton, `BannerAdController`, native cache, kill switch `"11"`, click throttling) and adds four guarantees on top:

1. **Load-if-null on every ad screen** - the screen that shows an ad makes sure that ad exists.
2. **User-chosen preloading** - ask which ads to preload and on which screen.
3. **Central ad IDs with GET -> ASSIGN -> SET** - SharedPreferences first, then Remote Config, then save.
4. **Android native-ad files verified** - XML layouts, drawables, `NativeAdFactoryImpl`, `MainActivity`.

Read `references/ADS_REFERENCE.md` for the underlying `Ads` service internals. Where it conflicts with this file, this file wins (see "Corrections to the reference" at the end).

## Bundled files

| File | Destination in the user's project |
|------|-----------------------------------|
| `assets/dart/ads_variable.dart` | `lib/services/ads_variable.dart` |
| `assets/dart/ads_bootstrap.dart` | `lib/services/ads_bootstrap.dart` |
| `assets/dart/ads_preloader.dart` | `lib/services/ads_preloader.dart` |
| `assets/dart/ad_with_fallback.dart` | `lib/features/ads/presentation/ad_with_fallback.dart` |
| `assets/dart/ad_screen_mixin.dart` | `lib/features/ads/presentation/ad_screen_mixin.dart` (also holds the `Ads` additions to paste) |
| `assets/android/kotlin/MainActivity.kt` | `android/app/src/main/kotlin/<package path>/MainActivity.kt` |
| `assets/android/kotlin/NativeAdFactoryImpl.kt` | same folder as `MainActivity.kt` |
| `assets/android/res/layout/*.xml` | `android/app/src/main/res/layout/` |
| `assets/android/res/drawable/*.xml` | `android/app/src/main/res/drawable/` |

## Ad ID rules (non-negotiable)

**One ad ID variable per placement.** Every ad, on every screen, gets its own variable in `AdsVariable` and its own Remote Config key with its own AdMob unit ID. Never reuse one variable for two placements. This is what lets the owner set any single ad to `"11"` and disable it on that page only.

**Only two shared IDs:**

| Variable | Why shared |
|----------|------------|
| `interstitialAdUnitId` | One interstitial loaded once, shown from many places (navigation, back button, splash, VPN connect, ...) |
| `appOpenAdUnitId` | One app-open ad for the whole app |

Everything else (banner, native small/big/full, and rewarded unless the user says otherwise) is per-placement. To skip an interstitial at one call site, use `skipAd: true` / `showAd(...)` guards at that site; do not add a second interstitial ID unless the user asks.

**Naming:** `<screen><Purpose><Format>AdUnitId`, e.g. `languageNativeAdUnitId`, `languageBannerAdUnitId`, `vpnSelectSmallNativeAdUnitId`. The same name is used as the Remote Config key (add it to `AdsVariable._fields`).

**Fallback pairs:** a page may have a primary ad and a fallback ad with separate IDs, e.g. Language: `languageNativeAdUnitId` (primary) and `languageBannerAdUnitId`. If the primary is `"11"`, the page shows the fallback; if both are `"11"`, nothing shows. Use `AdWithFallback` (`assets/dart/ad_with_fallback.dart`) and only load the side that will actually show.

Native preload cache keys are `adUnitId + type`, so per-placement IDs also stop two screens from consuming each other's cached ad.

## Workflow

Follow the phases in order. Never overwrite an existing file without showing the user a diff or asking first.

### Phase 0 - Discover (no questions yet)

Scan the project and note what already exists, so you only ask about gaps:

- `pubspec.yaml`: `google_mobile_ads`, `shared_preferences`, `firebase_core`, `firebase_remote_config`, `visibility_detector`, `shimmer`
- `lib/services/`: `ads.dart`, `ads_variable.dart`, `remote_config_service.dart`, `purchase_service.dart`
- `lib/main.dart` and the splash screen
- `android/app/src/main/res/layout/`: the 3 native XMLs
- `android/app/src/main/res/drawable/`: `ad_cta_bg.xml`, `ad_badge_bg.xml`
- `MainActivity.kt` and `NativeAdFactoryImpl.kt` (package name and the `registerNativeAdFactory` calls)
- Every screen that already uses `BannerAdController`, `NativeAdWidget`, `Ads.showAd`

### Phase 1 - Ask the user

Ask only what Phase 0 could not answer. If the ask-user-input tool is available, use tappable options; otherwise ask in plain text. Keep it to a few questions per turn.

**Q1 - Ad inventory.** Which formats and which screens show ads? (Default: the table in reference section 11.) Skip if the user already listed them.

**Q1b - Placements and fallbacks (always ask).** For every screen with an ad, confirm one dedicated ID per placement (only interstitial and app-open are shared). Then ask: "Which screens should show a fallback ad when the primary is `"11"`?" (e.g. Language: native -> banner). Create the extra variable + RC key for each fallback. Also ask whether rewarded should stay a single shared ID.

**Q2 - Preloading (always ask).**
- "Which ads should be preloaded in advance?" Offer the ads from the inventory as a multi-select (e.g. interstitial, language big native, home small native, reels natives, ...).
- "On which screen should each one start preloading?" Typical answers: Splash, Intro, Home, Settings.
- "On Splash, should the app wait for the preload to finish before moving on, or load in the background?" (waiting adds up to ~8 s; background never blocks).

Record the answers as a table and generate `AdsPreloader.plan` from it:

| Ad | Format / size | Preload on screen | Wait? |
|----|---------------|-------------------|-------|

**Q3 - Native layouts (only if Phase 0 found any missing).** See Phase 2.

**Q4 - Remote Config.** Confirm the RC parameter name that holds the JSON blob (the reference uses `com_swmbhtya_prbrwsr_app_AndroidV1`) and whether the JSON keys match the names in `AdsVariable._fields`. Ask for any different key names and map them in the registry.

### Phase 2 - Android native-ad preflight

Check `android/app/src/main/res/layout/` for `small_native_ad.xml`, `big_native_ad.xml`, `native_admob_full.xml`, and `res/drawable/` for `ad_cta_bg.xml`, `ad_badge_bg.xml`.

For each missing file, ask:

> "I don't see `big_native_ad.xml` (etc.) in your layout folder. Do you already have these files? Send me their location or upload them and I'll place them in `android/app/src/main/res/layout/`. Otherwise I'll add ready-made versions."

- User supplies files -> copy them into `res/layout/` (and drawables into `res/drawable/`). Then verify each file has the contract below; if not, tell the user exactly what is missing.
- User has none -> copy the bundled templates from `assets/android/res/`.

**XML contract** (the factory crashes or shows blank ads without it):
- Root element is `com.google.android.gms.ads.nativead.NativeAdView`
- IDs: `ad_headline`, `ad_body`, `ad_cta`, `ad_icon` in all three; `ad_media` (a `MediaView`) in big and full
- Heights must fit the Dart containers: small <= 130dp, big <= 270dp, full = match_parent

Then write `NativeAdFactoryImpl.kt` (if absent) and update `MainActivity.kt` from `assets/android/kotlin/`. Keep the project's existing `package` line. If `MainActivity` already has other code, merge the `configureFlutterEngine` / `cleanUpFlutterEngine` bodies rather than replacing the file. Factory IDs `smallNativeAd`, `bigNativeAd`, `fullNativeAd` must match the Dart side exactly.

Add `implementation("com.google.android.gms:play-services-ads:23.0.0")` to `build.gradle.kts` if missing, and remind the user that `AndroidManifest.xml` needs the `com.google.android.gms.ads.APPLICATION_ID` meta-data.

### Phase 3 - Central IDs: GET -> ASSIGN -> SET

Copy `ads_variable.dart` and `ads_bootstrap.dart`. Then:

1. Move all ad unit ID fields out of `Ads` into `AdsVariable` (one registry, `_fields`, drives everything).
2. Find/replace `Ads.<x>AdUnitId` -> `AdsVariable.<x>AdUnitId` and `Ads.click` -> `AdsVariable.clickInterval` across the project.
3. Expose `isFetched` and `config` on `RemoteConfigService`; delete `updateAdUnitIds()`.
4. Replace the body of `PurchaseService.suppressAds()` with `if (isPurchase) AdsVariable.suppressAll();`.
5. Wire the startup order:

```dart
// main()
WidgetsFlutterBinding.ensureInitialized();
await Ads.initialize();
await AdsBootstrap.restoreCached();          // 1. GET  from SharedPreferences

// splash, before ANY ad load
await AdsBootstrap.refreshFromRemote();      // 2. ASSIGN from RC, 3. SET to SharedPreferences
```

Rules that must hold:
- RC failure or timeout must leave the cached values untouched.
- Blank or missing RC keys never overwrite a stored ID.
- `saveToPrefs()` runs **before** premium suppression, and never while `suppressed` is true.
- Every new ad ID is added to `_fields` only; get/assign/set/suppress pick it up automatically.

### Phase 4 - Load-if-null on every ad screen

Copy the `Ads` additions (`isDisabled`, `ensureInterstitialLoaded`, `ensureRewardedLoaded`, `ensureNativeLoaded`) from the comment block in `ad_screen_mixin.dart` into `ads.dart`, apply the two `NativeAdWidget` patches from the same file, and add `AdScreenMixin`.

Contract for **every** screen in the inventory:

| Ad on the screen | Required in `initState` / post-frame |
|------------------|--------------------------------------|
| Banner | `ensureBanner(AdsVariable.xBannerAdUnitId)`; render with `buildBannerAd()`; `disposeAds()` in `dispose` |
| Native | `NativeAdWidget` (loads-if-null in `didChangeDependencies`); optionally `ensureNative(...)` early |
| Interstitial (screen later calls `Ads.showAd`) | `ensureInterstitial()` so the ad is ready on tap |
| Rewarded | `Ads.ensureRewardedLoaded()` |

Every `ensure*` call skips silently when the ID is empty/`"11"`, the user is premium, or the ad is already loaded/loading. Retry on reconnect (the mixin's `watchConnectivity()`).

**ID audit:** list every `AdsVariable.*` use per screen. Flag any variable used for ads on two different screens (except `interstitialAdUnitId` / `appOpenAdUnitId`) and offer to split it into one variable per placement. Wire fallback pairs with `AdWithFallback`.

**Audit step:** grep for `BannerAdController(`, `NativeAdWidget(`, `ReelsNativeAdWidget(`, `Ads.showAd(`, `Ads.showRewardedAd(`. For each hit, confirm the owning screen has the matching `ensure*` call. Produce a table and fix every miss:

| Screen | Ad type | Ensure present? | Fixed |
|--------|---------|-----------------|-------|

### Phase 5 - Preloading

Copy `ads_preloader.dart`, fill `plan` from the Q2 answers, and call it:

```dart
// splash (after refreshFromRemote)
await AdsPreloader.run('splash', wait: true);   // or wait:false per the user's answer

// other screens' initState
AdsPreloader.run('intro');                      // fire-and-forget
```

Use screen keys that match the user's answers. Because every load goes through `ensure*`, repeated calls are harmless.

### Phase 6 - Verify

- [ ] `flutter pub get`; `flutter analyze` clean
- [ ] All 3 XMLs + 2 drawables exist; `R.layout.*` resolves in `MainActivity`
- [ ] Kill test: set an ID to `"11"` and confirm the ad collapses and no request is made
- [ ] Per-page kill test: set ONE placement's ID to `"11"`; only that page's ad disappears (or switches to its fallback)
- [ ] Offline test: airplane mode on first launch after one online run -> ads still load from cached IDs when back online
- [ ] Log `AdsVariable.snapshot()` after splash; confirm values were written (relaunch offline and compare)
- [ ] Every screen in the audit table has its `ensure*` call
- [ ] Premium user: no ad requests, and prefs still hold the real IDs
- [ ] Use Google's test ad unit IDs while developing; never click live ads


## Self-contained examples for new projects

Use this section when the target project does **not** already contain the ad files referenced above. Do not assume `assets/`, `lib/services/ads.dart`, native-ad XMLs, `NativeAdFactoryImpl.kt`, or any other reference file exists. Create the required pieces from the patterns below, adapting package names, screen names, dependencies, and existing architecture.

The source reference for these examples is `ADS_REFERENCE.md`. The examples intentionally preserve its terminology and implementation patterns while applying the corrections in this skill.

### Example A - Minimal Flutter AdMob setup

If a new Flutter project has no ad infrastructure:

```yaml
# pubspec.yaml
dependencies:
  google_mobile_ads: ^9.0.0
  visibility_detector: ^0.4.0+2
  shimmer: ^3.0.0
```

Android app dependency:

```kotlin
// android/app/build.gradle.kts
dependencies {
    implementation("com.google.android.gms:play-services-ads:23.0.0")
}
```

Initialize the SDK before loading ads:

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Ads.initialize();
  runApp(const MyApp());
}
```

The reference uses `google_mobile_ads` for Banner, Native, and Interstitial ads, with `"11"` as the universal ad-disable value. fileciteturn0file1L19-L35

### Example B - Start a new `Ads` service

When `ads.dart` does not exist, create a central service instead of putting ad state directly inside individual screens:

```dart
import 'dart:async';

import 'package:google_mobile_ads/google_mobile_ads.dart';

enum RewardedAdResult {
  rewardGranted,
  dismissedWithoutReward,
  failed,
}

enum NativeAdType {
  small,
  big,
  full,
}

class NativeAdState {
  final bool isLoaded;
  final bool isFailed;
  final int attempt;

  NativeAdState({
    this.isLoaded = false,
    this.isFailed = false,
    this.attempt = 0,
  });
}

class Ads {
  Ads._();

  static String interstitialAdUnitId = '';
  static String rewardedAdUnitId = '';
  static String appOpenAdUnitId = '';

  static String homeBannerAdUnitId = '';
  static String homeSmallNativeAdUnitId = '';
  static String languageBigNativeAdUnitId = '';

  static bool _isInitialized = false;
  static bool get isInitialized => _isInitialized;

  static Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      await MobileAds.instance.initialize();
      _isInitialized = true;
    } catch (_) {
      // Keep the app usable even if the ad SDK initialization fails.
    }
  }
}
```

The reference separates ad formats into shared interstitial/rewarded/app-open IDs and placement-specific banner/native IDs. fileciteturn0file1L135-L170

### Example C - Interstitial preload and show pattern

For a new project, implement an awaitable preload so screens can wait for an in-flight load rather than starting duplicate requests:

```dart
static InterstitialAd? _interstitialAd;
static bool _isAdLoading = false;
static bool _isAdReady = false;
static Completer<void>? _interstitialLoadCompleter;

static Future<void> preloadInterstitialAd() async {
  if (PurchaseService.isPurchase) return;
  if (interstitialAdUnitId.isEmpty || interstitialAdUnitId == '11') return;
  if (_isAdReady) return;

  if (_isAdLoading && _interstitialLoadCompleter != null) {
    await _interstitialLoadCompleter!.future;
    return;
  }

  _isAdLoading = true;
  _isAdReady = false;
  _interstitialLoadCompleter = Completer<void>();

  InterstitialAd.load(
    adUnitId: interstitialAdUnitId,
    request: const AdRequest(),
    adLoadCallback: InterstitialAdLoadCallback(
      onAdLoaded: (ad) {
        _interstitialAd = ad;
        _isAdLoading = false;
        _isAdReady = true;
        _interstitialLoadCompleter?.complete();
      },
      onAdFailedToLoad: (error) {
        _interstitialAd = null;
        _isAdLoading = false;
        _isAdReady = false;
        _interstitialLoadCompleter?.complete();
      },
    ),
  );

  await _interstitialLoadCompleter!.future;
}
```

A show method should gate premium users, optionally throttle impressions, show the ad, dispose it after dismissal/failure, preload the next one, and always call the caller's dismissal callback:

```dart
static int click = 2;
static int clickCount = 0;

static Future<void> showAd({
  required BuildContext context,
  required VoidCallback onDismiss,
  bool forceShow = false,
  String? screenName,
}) async {
  if (PurchaseService.isPurchase) {
    onDismiss();
    return;
  }

  if (!forceShow) {
    clickCount++;
    if (clickCount % click != 0) {
      onDismiss();
      return;
    }
  }

  await preloadInterstitialAd();

  final ad = _interstitialAd;
  if (ad == null) {
    onDismiss();
    return;
  }

  _interstitialAd = null;
  _isAdReady = false;

  ad.fullScreenContentCallback = FullScreenContentCallback(
    onAdDismissedFullScreenContent: (ad) {
      ad.dispose();
      preloadInterstitialAd();
      onDismiss();
    },
    onAdFailedToShowFullScreenContent: (ad, error) {
      ad.dispose();
      preloadInterstitialAd();
      onDismiss();
    },
  );

  ad.show();
}
```

The reference uses a `Completer`, click throttling, `forceShow`, premium gating, and disposal/re-preload after the full-screen ad ends. fileciteturn0file1L191-L200 fileciteturn0file1L203-L245 fileciteturn0file1L252-L275

### Example D - Rewarded ad contract

If the project needs rewarded ads, expose an explicit result instead of treating every dismissal as a successful reward:

```dart
static Future<RewardedAdResult> showRewardedAd(
  BuildContext context, {
  String? screenName,
}) async {
  if (PurchaseService.isPurchase) {
    return RewardedAdResult.dismissedWithoutReward;
  }

  // Load if necessary using the same completer-driven pattern.
  // Attach onUserEarnedReward.
  // Complete the Future with:
  //   rewardGranted
  //   dismissedWithoutReward
  //   failed

  return RewardedAdResult.failed;
}
```

This mirrors the reference contract. fileciteturn0file1L281-L290

### Example E - Native ad cache

When no native cache exists, use an ad-unit + native-type key so different placements cannot consume each other's cached ad:

```dart
static final Map<String, NativeAd?> _preloadedNativeAds = {};
static final Map<String, bool> _loadingNativeAds = {};
static final Map<String, NativeAdState> _nativeAdStates = {};
static final Map<String, int> _nativeAdRetryCount = {};
static final Map<String, Completer<void>> _nativeAdCompleters = {};

static String _getAdKey(
  String adUnitId,
  NativeAdType type, {
  String? customKey,
}) {
  if (customKey != null) return '${customKey}_${type.name}';
  return '${adUnitId}_${type.name}';
}
```

Preload:

```dart
static Future<void> preloadNativeAd(
  String adUnitId,
  NativeAdType type, {
  String? screenName,
  String? customKey,
}) async {
  if (PurchaseService.isPurchase) return;

  if (adUnitId.isEmpty || adUnitId == '11') {
    _nativeAdStates[_getAdKey(adUnitId, type, customKey: customKey)] =
        NativeAdState(isFailed: true);
    return;
  }

  final key = _getAdKey(adUnitId, type, customKey: customKey);

  if (_preloadedNativeAds[key] != null) return;

  if (_loadingNativeAds[key] == true) {
    await _nativeAdCompleters[key]?.future;
    return;
  }

  _loadingNativeAds[key] = true;
  _nativeAdCompleters[key] = Completer<void>();

  final factoryId = type == NativeAdType.small
      ? 'smallNativeAd'
      : type == NativeAdType.big
          ? 'bigNativeAd'
          : 'fullNativeAd';

  final ad = NativeAd(
    adUnitId: adUnitId,
    factoryId: factoryId,
    request: const AdRequest(),
    listener: NativeAdListener(
      onAdLoaded: (loadedAd) {
        _preloadedNativeAds[key] = loadedAd as NativeAd;
        _loadingNativeAds[key] = false;
        _nativeAdRetryCount[key] = 0;
        _complete(key);
      },
      onAdFailedToLoad: (loadedAd, error) {
        loadedAd.dispose();
        _preloadedNativeAds[key] = null;
        _loadingNativeAds[key] = false;

        final retries = _nativeAdRetryCount[key] ?? 0;
        if (retries < 1) {
          _nativeAdRetryCount[key] = retries + 1;
          _complete(key);

          Future.delayed(const Duration(seconds: 1), () {
            preloadNativeAd(
              adUnitId,
              type,
              screenName: screenName,
              customKey: customKey,
            );
          });
        } else {
          _nativeAdRetryCount[key] = 0;
          _complete(key);
        }
      },
    ),
  );

  ad.load();
  await _nativeAdCompleters[key]?.future;
}
```

Consume the cached ad and immediately warm the cache again:

```dart
static NativeAd? getPreloadedAd(
  String adUnitId,
  NativeAdType type, {
  String? screenName,
  String? customKey,
}) {
  final key = _getAdKey(adUnitId, type, customKey: customKey);
  final ad = _preloadedNativeAds[key];

  if (ad != null) {
    _preloadedNativeAds[key] = null;

    preloadNativeAd(
      adUnitId,
      type,
      screenName: screenName,
      customKey: customKey,
    );

    return ad;
  }

  return null;
}
```

The reference uses separate loading/state/completer maps, one retry, and consume-then-reload behavior. fileciteturn0file1L308-L327 fileciteturn0file1L330-L392 fileciteturn0file1L397-L414

### Example F - Banner controller

If the project has no banner controller, create one that supports adaptive width and one retry:

```dart
class BannerAdController {
  BannerAd? _ad;
  bool isLoading = false;
  bool isLoaded = false;
  bool hasFailed = false;
  int _retryCount = 0;

  final String adUnitId;
  AdSize size;
  final String screenName;
  VoidCallback? _onStateChanged;

  BannerAdController({
    required this.adUnitId,
    this.size = AdSize.banner,
    this.screenName = 'BannerAd',
  });

  BannerAd? get ad => _ad;

  Future<void> load({
    VoidCallback? onStateChanged,
    double? anchorWidth,
  }) async {
    if (PurchaseService.isPurchase) {
      hasFailed = true;
      return;
    }

    _onStateChanged = onStateChanged;
    _retryCount = 0;

    if (anchorWidth != null) {
      final adaptiveSize =
          await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(
        anchorWidth.truncate(),
      );

      if (adaptiveSize != null) {
        size = adaptiveSize;
      }
    }

    _startLoad();
  }

  void _startLoad() {
    if (adUnitId.isEmpty || adUnitId == '11') {
      hasFailed = true;
      _onStateChanged?.call();
      return;
    }

    isLoading = true;
    isLoaded = false;
    hasFailed = false;
    _onStateChanged?.call();

    _ad = BannerAd(
      adUnitId: adUnitId,
      size: size,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (ad) {
          isLoading = false;
          isLoaded = true;
          hasFailed = false;
          _retryCount = 0;
          _onStateChanged?.call();
        },
        onAdFailedToLoad: (ad, error) {
          ad.dispose();
          _ad = null;

          if (_retryCount < 1) {
            _retryCount++;
            _startLoad();
          } else {
            isLoading = false;
            hasFailed = true;
            _retryCount = 0;
            _onStateChanged?.call();
          }
        },
      ),
    )..load();
  }

  void dispose() {
    _ad?.dispose();
    _ad = null;
    isLoading = false;
    isLoaded = false;
    hasFailed = false;
  }
}
```

The reference's controller supports adaptive banner sizing, connectivity/kill-switch checks, one retry, state callbacks, and disposal. fileciteturn0file1L599-L683

### Example G - Native ad widget when no widget exists

A minimal widget can consume the preloaded cache and render the correct height:

```dart
class NativeAdWidget extends StatefulWidget {
  final String adUnitId;
  final NativeAdType type;
  final String? screenName;
  final String? customKey;

  const NativeAdWidget({
    super.key,
    required this.adUnitId,
    required this.type,
    this.screenName,
    this.customKey,
  });

  @override
  State<NativeAdWidget> createState() => _NativeAdWidgetState();
}

class _NativeAdWidgetState extends State<NativeAdWidget> {
  NativeAd? _nativeAd;
  bool _isLoading = false;
  bool _isFailed = false;

  bool get _isFull => widget.type == NativeAdType.full;
  bool get _isBig => widget.type == NativeAdType.big;

  @override
  void initState() {
    super.initState();
    _tryLoadingAd();
  }

  Future<void> _tryLoadingAd() async {
    if (!mounted) return;
    if (PurchaseService.isPurchase) return;
    if (widget.adUnitId.isEmpty || widget.adUnitId == '11') return;

    final cached = Ads.getPreloadedAd(
      widget.adUnitId,
      widget.type,
      screenName: widget.screenName,
      customKey: widget.customKey,
    );

    if (cached != null) {
      if (!mounted) {
        cached.dispose();
        return;
      }

      setState(() {
        _nativeAd = cached;
        _isLoading = false;
      });
      return;
    }

    setState(() => _isLoading = true);

    await Ads.preloadNativeAd(
      widget.adUnitId,
      widget.type,
      screenName: widget.screenName,
      customKey: widget.customKey,
    );

    final loaded = Ads.getPreloadedAd(
      widget.adUnitId,
      widget.type,
      screenName: widget.screenName,
      customKey: widget.customKey,
    );

    if (!mounted) {
      loaded?.dispose();
      return;
    }

    setState(() {
      _nativeAd = loaded;
      _isLoading = false;
      _isFailed = loaded == null;
    });
  }

  @override
  void dispose() {
    _nativeAd?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.adUnitId.isEmpty || widget.adUnitId == '11') {
      return const SizedBox.shrink();
    }

    if (_nativeAd != null) {
      return SizedBox(
        height: _isFull ? double.infinity : (_isBig ? 270 : 130),
        width: double.infinity,
        child: AdWidget(ad: _nativeAd!),
      );
    }

    if (_isLoading && !_isFailed) {
      return NativeAdShimmer(type: widget.type);
    }

    return const SizedBox.shrink();
  }
}
```

The reference uses the same load order: premium/kill-switch/connectivity gate, cache lookup, wait for cached state when applicable, then on-demand preload; small/big/full containers are approximately 130/270/full height. fileciteturn0file1L690-L725

### Example H - Android native ad XML from scratch

If a new Flutter project has no native ad XMLs, create all three under:

`android/app/src/main/res/layout/`

All layouts must use the `NativeAdView` root and the IDs expected by `NativeAdFactoryImpl`.

Small:

```xml
<com.google.android.gms.ads.nativead.NativeAdView
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="wrap_content">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical">

        <ImageView
            android:id="@+id/ad_icon"
            android:layout_width="48dp"
            android:layout_height="48dp"
            android:scaleType="centerCrop" />

        <TextView
            android:id="@+id/ad_headline"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:maxLines="2" />

        <TextView
            android:id="@+id/ad_body"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:maxLines="2" />

        <TextView
            android:id="@+id/ad_cta"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content" />
    </LinearLayout>
</com.google.android.gms.ads.nativead.NativeAdView>
```

Big/full layouts additionally need:

```xml
<com.google.android.gms.ads.nativead.MediaView
    android:id="@+id/ad_media"
    android:layout_width="match_parent"
    android:layout_height="140dp" />
```

For the full layout, make the root `match_parent` and allow the media section to expand according to the design. The reference requires `ad_headline`, `ad_body`, `ad_cta`, `ad_icon` in all three layouts and `ad_media` in big/full. fileciteturn0file1L65-L68

### Example I - `NativeAdFactoryImpl.kt` from scratch

When the factory does not exist, create it beside `MainActivity.kt`:

```kotlin
import android.view.LayoutInflater
import android.view.View
import android.widget.ImageView
import android.widget.TextView
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import io.flutter.plugins.googlemobileads.GoogleMobileAdsPlugin

class NativeAdFactoryImpl(
    private val layoutInflater: LayoutInflater,
    private val layoutId: Int
) : GoogleMobileAdsPlugin.NativeAdFactory {

    override fun createNativeAd(
        nativeAd: NativeAd,
        customOptions: Map<String, Any>?
    ): NativeAdView {
        val adView =
            layoutInflater.inflate(layoutId, null) as NativeAdView

        adView.headlineView = adView.findViewById(R.id.ad_headline)
        (adView.headlineView as TextView).text = nativeAd.headline

        adView.bodyView = adView.findViewById(R.id.ad_body)
        nativeAd.body?.let {
            (adView.bodyView as TextView).text = it
        } ?: run {
            adView.bodyView?.visibility = View.GONE
        }

        adView.callToActionView = adView.findViewById(R.id.ad_cta)
        nativeAd.callToAction?.let {
            (adView.callToActionView as TextView).text = it
        } ?: run {
            adView.callToActionView?.visibility = View.GONE
        }

        adView.iconView = adView.findViewById(R.id.ad_icon)
        nativeAd.icon?.let {
            (adView.iconView as ImageView).setImageDrawable(it.drawable)
        } ?: run {
            adView.iconView?.visibility = View.GONE
        }

        adView.mediaView = adView.findViewById<MediaView?>(R.id.ad_media)
        nativeAd.mediaContent?.let {
            adView.mediaView?.setMediaContent(it)
        }

        adView.setNativeAd(nativeAd)
        return adView
    }
}
```

For the current plugin API, use the `FlutterEngine` when registering the factory and include the `customOptions` parameter in `createNativeAd`; do not blindly copy the older snippets from the reference. This is one of the explicit corrections already defined in this skill. The reference documents the older factory shape and bindings here. fileciteturn0file1L70-L108

### Example J - `MainActivity.kt` registration for a new project

If the project has no factory registration, merge this into its existing `configureFlutterEngine` instead of replacing unrelated code:

```kotlin
override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)

    GoogleMobileAdsPlugin.registerNativeAdFactory(
        flutterEngine,
        "smallNativeAd",
        NativeAdFactoryImpl(
            layoutInflater,
            R.layout.small_native_ad
        )
    )

    GoogleMobileAdsPlugin.registerNativeAdFactory(
        flutterEngine,
        "bigNativeAd",
        NativeAdFactoryImpl(
            layoutInflater,
            R.layout.big_native_ad
        )
    )

    GoogleMobileAdsPlugin.registerNativeAdFactory(
        flutterEngine,
        "fullNativeAd",
        NativeAdFactoryImpl(
            layoutInflater,
            R.layout.native_admob_full
        )
    )
}

override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
    GoogleMobileAdsPlugin.unregisterNativeAdFactory(
        flutterEngine,
        "smallNativeAd"
    )
    GoogleMobileAdsPlugin.unregisterNativeAdFactory(
        flutterEngine,
        "bigNativeAd"
    )
    GoogleMobileAdsPlugin.unregisterNativeAdFactory(
        flutterEngine,
        "fullNativeAd"
    )

    super.cleanUpFlutterEngine(flutterEngine)
}
```

The three factory IDs must exactly match the Dart `NativeAd.factoryId` values. The reference uses `smallNativeAd`, `bigNativeAd`, and `fullNativeAd`. fileciteturn0file1L41-L63

### Example K - Remote Config ad-ID registry

For a new project, create a central registry rather than scattering Remote Config assignments across screens.

Example JSON:

```json
{
  "interstitialAdUnitId": "ca-app-pub-xxx/111",
  "rewardedAdUnitId": "ca-app-pub-xxx/222",
  "appOpenAdUnitId": "ca-app-pub-xxx/333",
  "homeBannerAdUnitId": "ca-app-pub-xxx/444",
  "homeSmallNativeAdUnitId": "ca-app-pub-xxx/555",
  "languageBigNativeAdUnitId": "ca-app-pub-xxx/666",
  "click_count": 2
}
```

Fetch the JSON blob:

```dart
static const String _configKey =
    'com_swmbhtya_prbrwsr_app_AndroidV1';

Future<void> fetchAndActivate() async {
  _remoteConfig = FirebaseRemoteConfig.instance;

  await _remoteConfig!.setConfigSettings(
    RemoteConfigSettings(
      fetchTimeout: const Duration(seconds: 10),
      minimumFetchInterval: Duration.zero,
    ),
  );

  await _remoteConfig!.fetchAndActivate();

  final jsonString = _remoteConfig!.getString(_configKey);
  _config = jsonDecode(jsonString) as Map<String, dynamic>;
  _isFetched = true;
}
```

The reference uses a JSON Remote Config parameter and maps individual JSON keys to ad IDs plus `click_count`. fileciteturn0file1L452-L511

### Example L - New-project-safe ID loading with SharedPreferences

For projects with no existing ad-ID persistence, prefer this sequence:

```text
GET cached IDs from SharedPreferences
        ↓
ASSIGN fresh values from Remote Config when valid
        ↓
SET the resulting values back to SharedPreferences
```

Example:

```dart
static Future<void> restoreCached() async {
  final prefs = await SharedPreferences.getInstance();

  for (final field in AdsVariable.fields) {
    final cached = prefs.getString(field);
    if (cached != null && cached.isNotEmpty) {
      AdsVariable.setField(field, cached);
    }
  }
}

static Future<void> refreshFromRemote() async {
  if (!RemoteConfigService.instance.isFetched) return;

  for (final field in AdsVariable.fields) {
    final remote = RemoteConfigService.instance.optionalString(field);

    if (remote != null && remote.isNotEmpty) {
      AdsVariable.setField(field, remote);
    }
  }

  await AdsVariable.saveToPrefs();
}
```

Important rules for a new implementation:

- A failed/timeout Remote Config fetch must not erase valid cached IDs.
- Blank/missing RC values must not overwrite cached IDs.
- Every newly added ad ID must be added to the central registry.
- Premium suppression must not overwrite the real persisted IDs.
- `"11"` is a runtime disable value, not a reason to permanently destroy the stored production ID.

These rules are the reason this skill's GET → ASSIGN → SET workflow takes precedence over the older reference's splash safety-net implementation.

### Example M - Universal `"11"` kill switch

Every load entry point should reject `"11"` before making an SDK request:

```dart
bool isDisabled(String adUnitId) {
  return adUnitId.isEmpty || adUnitId == '11';
}
```

Banner:

```dart
if (isDisabled(adUnitId) || !isConnected) {
  hasFailed = true;
  return;
}
```

Native:

```dart
if (isDisabled(widget.adUnitId) || !isConnected) {
  return;
}
```

Build:

```dart
if (isDisabled(widget.adUnitId)) {
  return const SizedBox.shrink();
}
```

The reference explicitly applies the `"11"` check at banner loading, native loading, native build, and reels-native paths. fileciteturn0file1L517-L530

### Example N - Premium ad suppression

Do not duplicate dozens of assignments if the new project uses the centralized `AdsVariable` registry from this skill:

```dart
static void suppressAll() {
  if (!PurchaseService.isPurchase) return;

  for (final field in AdsVariable.fields) {
    AdsVariable.setField(field, '11');
  }
}
```

Call it when the purchase state becomes active:

```dart
void updatePurchaseState(CustomerInfo customerInfo) {
  final active =
      customerInfo.entitlements.all[entitlementKey]?.isActive == true;

  if (active && !isPurchase) {
    suppressAll();
  }

  isPurchase = active;
}
```

The reference uses `"11"` suppression on purchase activation and gates ad loading with `isPurchase`. fileciteturn0file1L533-L595

### Example O - Screen-level load-if-null

For every screen that displays an ad, do not assume a previous screen successfully preloaded it.

Example banner:

```dart
late final BannerAdController bannerController;

@override
void initState() {
  super.initState();

  WidgetsBinding.instance.addPostFrameCallback((_) {
    bannerController = BannerAdController(
      adUnitId: AdsVariable.homeBannerAdUnitId,
      screenName: 'Home',
    );

    bannerController.load(
      anchorWidth: MediaQuery.sizeOf(context).width,
      onStateChanged: () {
        if (mounted) setState(() {});
      },
    );
  });
}

@override
void dispose() {
  bannerController.dispose();
  super.dispose();
}
```

Example native:

```dart
NativeAdWidget(
  adUnitId: AdsVariable.homeSmallNativeAdUnitId,
  type: NativeAdType.small,
  screenName: 'Home',
)
```

Example interstitial:

```dart
@override
void initState() {
  super.initState();
  Ads.ensureInterstitialLoaded();
}
```

The skill requires this screen-level guarantee because preloading is an optimization, not a correctness dependency. The reference's screen inventory demonstrates the different banner/native/interstitial placements. fileciteturn0file1L745-L766

### Example P - Navigation interstitial

If a new project has no ad-aware navigation helper:

```dart
static Future<dynamic> navigateTo(
  BuildContext context,
  String route, {
  bool skipAd = false,
  Object? arguments,
}) {
  if (skipAd) {
    return Navigator.pushNamed(
      context,
      route,
      arguments: arguments,
    );
  }

  final completer = Completer<dynamic>();

  Ads.showAd(
    context: context,
    screenName: 'RoutingTo($route)',
    onDismiss: () {
      final result = Navigator.pushNamed(
        context,
        route,
        arguments: arguments,
      );
      completer.complete(result);
    },
  );

  return completer.future;
}
```

For back:

```dart
if (!skipAd) {
  Ads.showAd(
    context: context,
    screenName: 'RoutingBack',
    onDismiss: () => Navigator.pop(context),
  );
} else {
  Navigator.pop(context);
}
```

The reference uses this pattern for route navigation and the custom app-bar back button. fileciteturn0file1L771-L810

### Example Q - Splash orchestration

A new project can use this sequence as a starting point, then adapt it to its own onboarding:

```dart
Future<void> startAdSequence() async {
  // 1. Restore cached IDs before any ad load.
  await AdsBootstrap.restoreCached();

  // 2. Fetch and apply Remote Config.
  await AdsBootstrap.refreshFromRemote();

  // 3. Preload the splash banner/interstitial as required.
  await AdsPreloader.run('splash', wait: true);

  // 4. Continue only after the app's splash conditions are satisfied.
  if (!mounted) return;

  Ads.showAd(
    context: context,
    forceShow: true,
    showLoader: false,
    onDismiss: _navigateToNext,
  );
}
```

The original reference's splash sequence is RC → banner → interstitial → navigation and also preloads native ads needed by following screens. This skill intentionally changes the ID startup order to restore SharedPreferences first and use Remote Config as an update source. fileciteturn0file1L817-L842

### Example R - Connectivity-aware reload

If the project has a connectivity service, ads should retry after the connection returns:

```dart
void onConnectivityChanged(bool connected) {
  if (!mounted) return;

  setState(() {});

  if (connected) {
    _tryLoadingAd();
  }
}
```

Also keep the connectivity guard in the actual load method; do not rely only on widget state:

```dart
if (!isConnected) {
  hasFailed = true;
  return;
}
```

The reference checks connectivity in native widgets and banner loading and retries native loading after reconnection. fileciteturn0file1L880-L894

### Example S - Reels/scroll-aware native ad

When ads appear inside a scrolling feed, use visibility-aware loading rather than eagerly loading every ad block:

```dart
VisibilityDetector(
  key: Key('native_$customKey'),
  onVisibilityChanged: (info) {
    if (info.visibleFraction >= 0.10) {
      _tryLoadingAd();
    }
  },
  child: NativeAdWidget(
    adUnitId: adUnitId,
    type: NativeAdType.small,
    customKey: customKey,
  ),
)
```

Keep the `"11"` check in the visibility/build/load layers. The reference's `ReelsNativeAdWidget` uses `VisibilityDetector` and a 10% visibility threshold. fileciteturn0file1L730-L735

### Example T - Shimmer fallback

If the project has no native ad loading placeholder, create separate placeholders for small, big, and full formats instead of a single arbitrary-height block:

```dart
class NativeAdShimmer extends StatelessWidget {
  final NativeAdType type;

  const NativeAdShimmer({
    super.key,
    required this.type,
  });

  @override
  Widget build(BuildContext context) {
    if (PurchaseService.isPurchase) {
      return const SizedBox.shrink();
    }

    final height = switch (type) {
      NativeAdType.small => 130.0,
      NativeAdType.big => 270.0,
      NativeAdType.full => double.infinity,
    };

    return SizedBox(
      height: height,
      width: double.infinity,
      child: Shimmer.fromColors(
        baseColor: Colors.grey.shade300,
        highlightColor: Colors.grey.shade100,
        child: Container(
          width: double.infinity,
          height: double.infinity,
        ),
      ),
    );
  }
}
```

The reference has separate shimmer behavior for all three native sizes and skips it for premium users. fileciteturn0file1L737-L740

### Example U - App lifecycle / welcome-back ad

If a new project wants a native ad when the app returns to the foreground:

```dart
class AppLifecycleWatcher extends StatefulWidget {
  final Widget child;

  const AppLifecycleWatcher({
    super.key,
    required this.child,
  });

  @override
  State<AppLifecycleWatcher> createState() =>
      _AppLifecycleWatcherState();
}

class _AppLifecycleWatcherState
    extends State<AppLifecycleWatcher>
    with WidgetsBindingObserver {

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      Ads.clearTempDisable();
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => const WelcomeBackScreen(),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
```

The reference uses `AppLifecycleWatcher` to react to `resumed` and route to a Welcome Back screen containing a native ad. fileciteturn0file1L849-L872

### Example V - Example ad inventory for a brand-new project

If the user has not yet supplied an inventory, start by documenting placements explicitly rather than inventing IDs:

| Placement | Format | Dedicated variable |
|---|---|---|
| Splash | Adaptive Banner | `splashBannerAdUnitId` |
| Splash | Interstitial | `interstitialAdUnitId` |
| Home | Small Native | `homeSmallNativeAdUnitId` |
| Browser | Adaptive Banner | `browserBannerAdUnitId` |
| Search | Adaptive Banner | `searchBannerAdUnitId` |
| Language | Big Native | `languageBigNativeAdUnitId` |
| Settings | Big Native preload | `languageBigNativeAdUnitId` |
| Reels | Small Native | `reelsSmallNativeAdUnitId` |
| VPN | Adaptive Banner | `vpnBannerAdUnitId` |
| VPN server list | Small Native | `vpnSelectSmallNativeAdUnitId` |

Do not copy this inventory into a real project without confirming the actual screens. It is an example of how to document placements. The reference's complete inventory contains screen-by-screen banner/native/interstitial usage. fileciteturn0file1L745-L766

### Example W - Verification checklist for a project built from zero

After creating the ad system from scratch, verify:

```text
[ ] google_mobile_ads dependency exists
[ ] play-services-ads dependency exists
[ ] Ads.initialize() runs before ad loading
[ ] Central ad-ID registry exists
[ ] SharedPreferences restore runs before Remote Config update
[ ] Blank RC values do not overwrite valid IDs
[ ] "11" skips network requests and collapses ad UI
[ ] Premium users make no ad requests
[ ] Banner controller supports adaptive sizing
[ ] Banner has one retry
[ ] Native cache key includes ad unit + type
[ ] Native load has one retry
[ ] Consuming a cached native starts background preload
[ ] NativeAdWidget disposes its consumed ad
[ ] small_native_ad.xml exists
[ ] big_native_ad.xml exists
[ ] native_admob_full.xml exists
[ ] all native XML IDs match NativeAdFactoryImpl
[ ] NativeAdFactoryImpl exists
[ ] MainActivity registers smallNativeAd/bigNativeAd/fullNativeAd
[ ] MainActivity unregisters factories during cleanup
[ ] AndroidManifest has the AdMob APPLICATION_ID metadata
[ ] every ad screen has a load-if-null path
[ ] navigation/back interstitial behavior is explicitly configured
[ ] connectivity recovery retries ads
[ ] Flutter analyze passes
[ ] test ad IDs are used during development
```

The reference's own quick-start and design-pattern sections emphasize the same core building blocks: central service, completer-driven loading, one retry, native preloading, consume/re-preload, click throttling, `"11"` kill switch, premium gating, connectivity checks, and adaptive banners. fileciteturn0file1L944-L980 fileciteturn0file1L984-L1000

### Important source/correction rule

`ADS_REFERENCE.md` is a source of implementation examples, not a requirement to copy every historical behavior literally.

In particular:

1. The reference shows an older `registerNativeAdFactory(this, ...)` form; this skill's current `MainActivity` example uses the current Flutter engine registration form.
2. The reference shows `createNativeAd(nativeAd)`; this skill's example includes the current `customOptions` parameter.
3. The reference's old splash safety-net description says `suppressAds()` can leave IDs at `"11"` if Remote Config fails. This skill does **not** rely on that behavior. SharedPreferences restore is the actual offline safety mechanism.
4. If the target project already has an ad architecture, merge into it rather than blindly creating duplicate services.
5. Never invent production AdMob IDs. Use the user's IDs, Remote Config, or Google's official test IDs during development.


## Corrections to the reference

The reference document contains three things that should not be copied as written:

1. **`registerNativeAdFactory(this, ...)`** - the current plugin API takes the `FlutterEngine` (`registerNativeAdFactory(flutterEngine, id, factory)`) and pairs it with `unregisterNativeAdFactory` in `cleanUpFlutterEngine`. The bundled `MainActivity.kt` does this.
2. **`createNativeAd(nativeAd)`** - the `NativeAdFactory` interface passes a second `customOptions` map parameter. The bundled `NativeAdFactoryImpl.kt` uses it.
3. **"Splash safety net"** - `suppressAds()` returns early unless `isPurchase` is true, so it does **not** keep IDs at `"11"` when Remote Config fails. The real safety net is now the SharedPreferences restore in Phase 3.
