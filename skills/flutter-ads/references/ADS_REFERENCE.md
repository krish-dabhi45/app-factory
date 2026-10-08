# Ad Implementation Reference — Private Browser (Quiely)

> Complete reference for replicating the ad system. Based on `google_mobile_ads: ^9.0.0`.

---

## Architecture Overview

```
Firebase Remote Config  ──>  Ads (static singleton)  ──>  Widgets / Screens
       │                           │
       │                    PurchaseService.suppressAds()
       │                    (sets all IDs → "11")
       ▼
  23 ad unit IDs
  + click_count
```

**3 ad formats**: Banner, Native (small/big/full), Interstitial  
**Ad ID `"11"`** = universal kill switch (bypasses load, collapses widget to `SizedBox.shrink()`)

---

## 1. Project Setup

### pubspec.yaml
```yaml
google_mobile_ads: ^9.0.0
visibility_detector: ^0.4.0+2   # scroll-aware native ads
shimmer: ^3.0.0                 # loading placeholders
```

### Android: build.gradle.kts (app level)
```kotlin
implementation("com.google.android.gms:play-services-ads:23.0.0")
implementation("com.facebook.android:facebook-android-sdk:latest.release")  // optional
```

### Android: Native Ad Factory Registration

**File**: `MainActivity.kt`
```kotlin
import com.google.android.gms.ads.nativead.NativeAd
import io.flutter.plugins.googlemobileads.GoogleMobileAdsPlugin

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        GoogleMobileAdsPlugin.registerNativeAdFactory(
            this, "smallNativeAd",
            NativeAdFactoryImpl(layoutInflater, R.layout.small_native_ad)
        )
        GoogleMobileAdsPlugin.registerNativeAdFactory(
            this, "bigNativeAd",
            NativeAdFactoryImpl(layoutInflater, R.layout.big_native_ad)
        )
        GoogleMobileAdsPlugin.registerNativeAdFactory(
            this, "fullNativeAd",
            NativeAdFactoryImpl(layoutInflater, R.layout.native_admob_full)
        )
    }
}
```

3 XML layouts required under `android/app/src/main/res/layout/`:
- `small_native_ad.xml` — wrap_content, icon+headline+body+CTA, no MediaView
- `big_native_ad.xml` — wrap_content, icon+headline+body+CTA, MediaView 140dp
- `native_admob_full.xml` — match_parent, icon+headline+body+CTA, expanded MediaView

### Android: NativeAdFactoryImpl

**File**: `NativeAdFactoryImpl.kt`
```kotlin
import android.view.LayoutInflater
import android.widget.TextView
import android.widget.ImageView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import com.google.android.gms.ads.nativead.MediaView
import io.flutter.plugins.googlemobileads.GoogleMobileAdsPlugin.NativeAdFactory

class NativeAdFactoryImpl(
    private val layoutInflater: LayoutInflater,
    private val layoutId: Int
) : NativeAdFactory {
    override fun createNativeAd(nativeAd: NativeAd): NativeAdView {
        val adView = layoutInflater.inflate(layoutId, null) as NativeAdView

        adView.headlineView = adView.findViewById(R.id.ad_headline)
        (adView.headlineView as TextView).text = nativeAd.headline

        adView.bodyView = adView.findViewById(R.id.ad_body)
        nativeAd.body?.let { (adView.bodyView as TextView).text = it }
            ?: run { adView.bodyView?.visibility = android.view.View.GONE }

        adView.callToActionView = adView.findViewById(R.id.ad_cta)
        nativeAd.callToAction?.let { (adView.callToActionView as TextView).text = it }
            ?: run { adView.callToActionView?.visibility = android.view.View.GONE }

        adView.iconView = adView.findViewById(R.id.ad_icon)
        nativeAd.icon?.let { (adView.iconView as ImageView).setImageDrawable(it.drawable) }
            ?: run { adView.iconView?.visibility = android.view.View.GONE }

        adView.mediaView = adView.findViewById(R.id.ad_media)
        nativeAd.mediaContent?.let { adView.mediaView?.setMediaContent(it) }

        // Set native ad
        adView.setNativeAd(nativeAd)
        return adView
    }
}
```

---

## 2. Core Ad Service (`Ads`)

**Path**: `lib/services/ads.dart` (853 lines)

### State Enums

```dart
enum RewardedAdResult { rewardGranted, dismissedWithoutReward, failed }

enum NativeAdType { small, big, full }

class NativeAdState {
  final bool isLoaded;
  final bool isFailed;
  final int attempt;
  NativeAdState({this.isLoaded = false, this.isFailed = false, this.attempt = 0});
}
```

### Ad Unit ID Fields (static strings, start empty)

```dart
class Ads {
  Ads._();  // singleton

  // Interstitial / Rewarded / AppOpen
  static String interstitialAdUnitId = '';
  static String rewardedAdUnitId = '';
  static String appOpenAdUnitId = '';

  // Banners (8)
  static String vpnBannerAdUnitId = '';
  static String tabsBannerAdUnitId = '';
  static String searchBannerAdUnitId = '';
  static String splashBannerAdUnitId = '';
  static String downloadsBannerAdUnitId = '';  // defined but UNUSED in any screen
  static String browserBannerAdUnitId = '';
  static String bookmarksBannerAdUnitId = '';
  static String historyBannerAdUnitId = '';

  // Native (12)
  static String homeSmallNativeAdUnitId = '';
  static String vpnSelectSmallNativeAdUnitId = '';
  static String vpnConnectionStatusSmallNativeAdUnitId = '';
  static String adBlockStatusSmallNativeAdUnitId = '';
  static String languageBigNativeAdOneUnitId = '';
  static String languageBigNativeAdTwoUnitId = '';
  static String introBigNativeAdUnitIdPageThree = '';
  static String introFullNativeAdOneUnitId = '';
  static String introFullNativeAdTwoUnitId = '';
  static String reelsSmallNativeAdOneUnitId = '';
  static String reelsSmallNativeAdTwoUnitId = '';
  static String welcomeBackSmallNativeAdUnitId = '';

  static bool _isInitialized = false;
  static bool get isInitialized => _isInitialized;
}
```

### SDK Initialization

```dart
static Future<void> initialize() async {
  if (_isInitialized) return;
  try {
    await MobileAds.instance.initialize();
    _isInitialized = true;
  } catch (e) {
    // log error
  }
}
```

---

## 3. Interstitial Ad — Full Lifecycle

### Click Throttling (line 56-57)

```dart
static int click = 2;       // from Remote Config key "click_count"
static int clickCount = 0;
```

Every `click`-th call to `showAd()` actually shows the ad; others skip immediately.  
`forceShow: true` bypasses throttling.

### Preload (awaitable, competer-driven)

```dart
static Future<void> preloadInterstitialAd() async {
  if (PurchaseService.isPurchase) return;          // premium user — skip
  if (_isAdReady) return;                           // already loaded
  if (_isAdLoading && _interstitialLoadCompleter != null) {
    await _interstitialLoadCompleter!.future;       // await in-flight load
    return;
  }
  await _loadInterstitialAdInternal();
}
```

### Internal Load (line 88-137)

```dart
static Future<void> _loadInterstitialAdInternal() async {
  if (interstitialAdUnitId.isEmpty) {
    _isAdLoading = false;
    _isAdReady = false;
    _interstitialLoadCompleter?.complete();
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
        _isAdLoading = false;
        _isAdReady = false;
        _interstitialAd = null;
        _interstitialLoadCompleter?.complete();
      },
    ),
  );
}
```

### Show (line 152-298)

```dart
static Future<void> showAd({
  required BuildContext context,
  required VoidCallback onDismiss,
  bool forceShow = false,
  bool showLoader = true,
  String? screenName,
}) async {
  if (PurchaseService.isPurchase) { onDismiss(); return; }

  // click throttling
  if (!forceShow) {
    clickCount++;
    if (clickCount % click != 0) { onDismiss(); return; }
  }

  // show loading dialog
  // ...
  // await ad load (10s timeout)
  // ...
  // show ad with FullScreenContentCallback
  // on dismissed/failed: dispose → preload next → onDismiss()
}
```

---

## 4. Rewarded Ad (line 347-517)

```dart
static Future<RewardedAdResult> showRewardedAd(
  BuildContext context, {String? screenName}
) async {
  if (PurchaseService.isPurchase) return RewardedAdResult.dismissedWithoutReward;

  // load if not ready (completer pattern)
  // show with onUserEarnedReward callback
  // return Completer<RewardedAdResult>
}
```

---

## 5. App Open Ad (DISABLED — line 301-344)

Stubbed out — both `preloadAppOpenAd()` and `showAppOpenAd()` are no-ops:

```dart
static Future<void> preloadAppOpenAd() async { return; }
static void showAppOpenAd({required VoidCallback onDismiss}) { onDismiss(); }
```

---

## 6. Native Ad Caching System (line 523-739)

### Internal Maps

```dart
static final Map<String, NativeAd?> _preloadedNativeAds = {};
static final Map<String, bool> _loadingNativeAds = {};
static final Map<String, ValueNotifier<NativeAdState>> _nativeAdNotifiers = {};
static final Map<String, NativeAdState> _nativeAdStates = {};
static final Map<String, int> _nativeAdRetryCount = {};
static final Map<String, Completer<void>> _nativeAdCompleters = {};
```

### Key Generation

```dart
static String _getAdKey(String adUnitId, NativeAdType type, {String? customKey}) {
  if (customKey != null) return '${customKey}_${type.name}';
  return '${adUnitId}_${type.name}';
}
```

### Preload (1 retry on failure)

```dart
static Future<void> preloadNativeAd(
  String adUnitId,
  NativeAdType type, {
  String? screenName,
  String? customKey,
}) async {
  if (PurchaseService.isPurchase) return;
  if (adUnitId.isEmpty) {
    _updateAdState(adUnitId, type, isLoaded: false, isFailed: true);
    return;
  }

  final key = _getAdKey(adUnitId, type, customKey: customKey);

  if (_preloadedNativeAds[key] != null) return;         // already cached
  if (_loadingNativeAds[key] == true) {                  // already loading
    await _nativeAdCompleters[key]?.future;
    return;
  }

  _loadingNativeAds[key] = true;
  _nativeAdCompleters[key] = Completer<void>();

  final factoryId = type == NativeAdType.small
      ? 'smallNativeAd'
      : type == NativeAdType.big ? 'bigNativeAd' : 'fullNativeAd';

  final ad = NativeAd(
    adUnitId: adUnitId,
    factoryId: factoryId,
    request: const AdRequest(),
    listener: NativeAdListener(
      onAdLoaded: (loadedAd) {
        _preloadedNativeAds[key] = loadedAd as NativeAd;
        _loadingNativeAds[key] = false;
        _nativeAdRetryCount[key] = 0;
        _updateAdState(adUnitId, type, isLoaded: true, isFailed: false);
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
          Future.delayed(Duration(seconds: 1), () {
            preloadNativeAd(adUnitId, type, screenName: screenName, customKey: customKey);
          });
        } else {
          _nativeAdRetryCount[key] = 0;
          _updateAdState(adUnitId, type, isLoaded: false, isFailed: true);
          _complete(key);
        }
      },
    ),
  );
  ad.load();
  await _nativeAdCompleters[key]?.future;
}
```

### Get from Cache (consumes + triggers background preload)

```dart
static NativeAd? getPreloadedAd(
  String adUnitId, NativeAdType type, {
  String? screenName,
  String? customKey,
}) {
  final key = _getAdKey(adUnitId, type, customKey: customKey);
  final ad = _preloadedNativeAds[key];
  if (ad != null) {
    _preloadedNativeAds[key] = null;
    _updateAdState(adUnitId, type, isLoaded: false, isFailed: false);
    // Preload a fresh one in background for next time
    preloadNativeAd(adUnitId, type, screenName: screenName, customKey: customKey);
    return ad;
  }
  return null;
}
```

### Dispose

```dart
static void disposePreloadedAd(String adUnitId, NativeAdType type, {String? screenName, String? customKey}) {
  final key = _getAdKey(adUnitId, type, customKey: customKey);
  _preloadedNativeAds[key]?.dispose();
  _preloadedNativeAds[key] = null;
  _loadingNativeAds[key] = false;
  _nativeAdRetryCount[key] = 0;
  _complete(key);
  _updateAdState(adUnitId, type, isLoaded: false, isFailed: false);
}
```

### Bulk Cleanup by Prefix

```dart
static void clearNativeAdCacheByPrefix(String prefix) {
  for (final key in [..._preloadedNativeAds.keys, ..._nativeAdStates.keys]) {
    if (key.startsWith(prefix)) {
      _preloadedNativeAds[key]?.dispose();
      _preloadedNativeAds.remove(key);
      _loadingNativeAds.remove(key);
      _nativeAdStates.remove(key);
      _nativeAdRetryCount.remove(key);
      _complete(key);
      _nativeAdNotifiers[key]?.value = NativeAdState();
    }
  }
}
```

---

## 7. Remote Config Population

**Path**: `lib/services/remote_config_service.dart`

### Fetch

```dart
static const String _configKey = 'com_swmbhtya_prbrwsr_app_AndroidV1';

Future<void> fetchAndActivate() async {
  _remoteConfig = FirebaseRemoteConfig.instance;
  await _remoteConfig!.setConfigSettings(RemoteConfigSettings(
    fetchTimeout: Duration(seconds: 10),
    minimumFetchInterval: Duration.zero,
  ));
  await _remoteConfig!.fetchAndActivate();
  final jsonString = _remoteConfig!.getString(_configKey);
  _config = jsonDecode(jsonString) as Map<String, dynamic>;
  _isFetched = true;
}
```

### Populate All 23 Ad IDs

```dart
void updateAdUnitIds() {
  if (!_isFetched || _config.isEmpty) return;

  final adKeys = <String, void Function(String)>{
    'interstitialAdUnitId': (v) => Ads.interstitialAdUnitId = v,
    'rewardedAdUnitId': (v) => Ads.rewardedAdUnitId = v,
    'appOpenAdUnitId': (v) => Ads.appOpenAdUnitId = v,
    // Banners
    'vpnBannerAdUnitId': (v) => Ads.vpnBannerAdUnitId = v,
    'tabsBannerAdUnitId': (v) => Ads.tabsBannerAdUnitId = v,
    'searchBannerAdUnitId': (v) => Ads.searchBannerAdUnitId = v,
    'splashBannerAdUnitId': (v) => Ads.splashBannerAdUnitId = v,
    'downloadsBannerAdUnitId': (v) => Ads.downloadsBannerAdUnitId = v,
    'browserBannerAdUnitId': (v) => Ads.browserBannerAdUnitId = v,
    'bookmarksBannerAdUnitId': (v) => Ads.bookmarksBannerAdUnitId = v,
    'historyBannerAdUnitId': (v) => Ads.historyBannerAdUnitId = v,
    // Natives
    'homeSmallNativeAdUnitId': (v) => Ads.homeSmallNativeAdUnitId = v,
    'vpnSelectSmallNativeAdUnitId': (v) => Ads.vpnSelectSmallNativeAdUnitId = v,
    'vpnHomeSmallNativeAdUnitId': (v) => Ads.vpnConnectionStatusSmallNativeAdUnitId = v,
    'adBlockStatusSmallNativeAdUnitId': (v) => Ads.adBlockStatusSmallNativeAdUnitId = v,
    'languageBigNativeAdOneUnitId': (v) => Ads.languageBigNativeAdOneUnitId = v,
    'languageBigNativeAdTwoUnitId': (v) => Ads.languageBigNativeAdTwoUnitId = v,
    'introBigNativeAdUnitIdPageThree': (v) => Ads.introBigNativeAdUnitIdPageThree = v,
    'introFullNativeAdOneUnitId': (v) => Ads.introFullNativeAdOneUnitId = v,
    'introFullNativeAdTwoUnitId': (v) => Ads.introFullNativeAdTwoUnitId = v,
    'reelsSmallNativeAdOneUnitId': (v) => Ads.reelsSmallNativeAdOneUnitId = v,
    'reelsSmallNativeAdTwoUnitId': (v) => Ads.reelsSmallNativeAdTwoUnitId = v,
    'welcomeBackSmallNativeAdUnitId': (v) => Ads.welcomeBackSmallNativeAdUnitId = v,
  };

  for (final entry in adKeys.entries) {
    entry.value(getString(entry.key));
  }
  Ads.click = getInt('click_count', 2);
}
```

---

## 8. Ad ID "11" — Universal Kill Switch

### What it is
When any ad unit ID equals the string `"11"`, the ad is **silently skipped** — no network request, no display, collapses to `SizedBox.shrink()`.

### Where checked

| Location | File | Line | Code |
|----------|------|------|------|
| `BannerAdController._startLoad()` | `ads.dart` | 799 | `if (adUnitId == '11' \|\| !isConnected) { hasFailed = true; return; }` |
| `NativeAdWidget._tryLoadingAd()` | `native_ad_widget.dart` | 268 | `if (widget.adUnitId == '11' \|\| !isConnected) return;` |
| `NativeAdWidget.build()` | `native_ad_widget.dart` | 372 | `if (widget.adUnitId == '11' \|\| !isConnected) return SizedBox.shrink();` |
| `ReelsNativeAdWidget._tryLoadingAd()` | `native_ad_widget.dart` | 464 | Same check |
| `ReelsNativeAdWidget._buildAdVisibilityState()` | `native_ad_widget.dart` | 560 | Same check |
| `ReelsNativeAdWidget._buildAdLoadState()` | `native_ad_widget.dart` | 571 | Same check |

### PurchaseService.suppressAds()

**Path**: `lib/services/purchase_service.dart`

```dart
static void suppressAds() {
  if (!isPurchase) return;
  Ads.interstitialAdUnitId = '11';
  Ads.rewardedAdUnitId = '11';
  Ads.appOpenAdUnitId = '11';
  Ads.vpnBannerAdUnitId = '11';
  Ads.tabsBannerAdUnitId = '11';
  Ads.searchBannerAdUnitId = '11';
  Ads.splashBannerAdUnitId = '11';
  Ads.downloadsBannerAdUnitId = '11';
  Ads.browserBannerAdUnitId = '11';
  Ads.bookmarksBannerAdUnitId = '11';
  Ads.historyBannerAdUnitId = '11';
  Ads.homeSmallNativeAdUnitId = '11';
  Ads.vpnSelectSmallNativeAdUnitId = '11';
  Ads.vpnConnectionStatusSmallNativeAdUnitId = '11';
  Ads.adBlockStatusSmallNativeAdUnitId = '11';
  Ads.languageBigNativeAdOneUnitId = '11';
  Ads.languageBigNativeAdTwoUnitId = '11';
  Ads.introBigNativeAdUnitIdPageThree = '11';
  Ads.introFullNativeAdOneUnitId = '11';
  Ads.introFullNativeAdTwoUnitId = '11';
  Ads.reelsSmallNativeAdOneUnitId = '11';
  Ads.reelsSmallNativeAdTwoUnitId = '11';
  Ads.welcomeBackSmallNativeAdUnitId = '11';
}
```

### Auto-trigger on purchase detection

```dart
void _updatePurchaseState(CustomerInfo customerInfo) {
  final active = customerInfo.entitlements.all[entitlementKey]?.isActive == true;
  if (active && !isPurchase) {
    suppressAds();
  }
  isPurchase = active;
}
```

### Called on splash as safety net

In `splash_screen.dart` line 48:
```dart
PurchaseService.suppressAds();
```
Called before Remote Config populates real IDs. If RC fails, all IDs stay `"11"` → no ads load.

### PurchaseService.isPurchase Checks (gate before loading)

| Method | Line | Code |
|--------|------|------|
| `Ads.preloadInterstitialAd()` | 143 | `if (PurchaseService.isPurchase) return;` |
| `Ads.preloadRewardedAd()` | 408 | `if (PurchaseService.isPurchase) return;` |
| `BannerAdController.load()` | 769 | `if (PurchaseService.isPurchase) { hasFailed = true; return; }` |
| `Ads.preloadNativeAd()` | 556 | `if (PurchaseService.isPurchase) return;` |
| `NativeAdWidget._tryLoadingAd()` | 267 | `if (PurchaseService.isPurchase) return;` |
| `NativeAdShimmer.build()` | 20 | `if (PurchaseService.isPurchase) return SizedBox.shrink();` |

---

## 9. Banner Ad Controller

**Path**: `ads.dart` lines 746-853

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

  Future<void> load({VoidCallback? onStateChanged, double? anchorWidth}) async {
    if (PurchaseService.isPurchase) {
      hasFailed = true; _onStateChanged?.call(); return;
    }
    _onStateChanged = onStateChanged;
    _retryCount = 0;

    if (anchorWidth != null) {
      final adaptiveSize = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(
        anchorWidth.truncate(),
      );
      if (adaptiveSize != null) size = adaptiveSize;
    }
    _startLoad();
  }

  void _startLoad() {
    if (adUnitId.isEmpty) { hasFailed = true; _onStateChanged?.call(); return; }
    if (adUnitId == '11' || !isConnected) { hasFailed = true; _onStateChanged?.call(); return; }

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
            _startLoad();  // 1 retry
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

---

## 10. Native Ad Widget

**Path**: `lib/features/ads/presentation/widgets/native_ad_widget.dart`

### NativeAdWidget (line 221-409)

```dart
class NativeAdWidget extends StatefulWidget {
  final String adUnitId;
  final NativeAdType type;     // small(130h), big(270h), full(double.infinity)
  final String? screenName;
  final String? customKey;     // optional dedup key
}
```

**Loading strategy** (`_tryLoadingAd`):
1. Skip if `PurchaseService.isPurchase` or `adUnitId == '11'` or no connectivity
2. Try `Ads.getPreloadedAd()` from cache
3. If cached, consume immediately and show
4. If not cached but `hasPreloadedAd()`, listen for state change → `_fetchCachedAd()`
5. If not cached at all, call `Ads.preloadNativeAd()` on-demand

**Build states**:
```dart
Widget build(BuildContext context) {
  if (widget.adUnitId == '11' || !isConnected) return SizedBox.shrink();

  if (!isFailed && _nativeAd != null) {
    return Container(
      height: isFull ? double.infinity : (isBig ? 270 : 130),
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      child: AdWidget(ad: _nativeAd!),
    );
  }
  if (isLoading) return NativeAdShimmer(type: widget.type);
  return SizedBox.shrink();
}
```

### ReelsNativeAdWidget (line 414-597)

Scroll-aware variant with `VisibilityDetector`:
- When `<10%` visible: shows shimmer (collapses to `SizedBox.shrink()` if ID is "11")
- When visible: same loading logic as `NativeAdWidget`
- Same `adUnitId == '11'` checks at 3 build layers (visibility, load state, and load trigger)

### NativeAdShimmer

Custom shimmer placeholders for all 3 sizes using `shimmer` package.  
Full type has dark background (`Color(0xFF1C1C1E)`).  
All types skip to `SizedBox.shrink()` if `PurchaseService.isPurchase`.

---

## 11. Screen-by-Screen Ad Inventory

| # | Screen | File Path | Banner | Native | Interstitial | Special Notes |
|---|--------|-----------|--------|--------|-------------|---------------|
| 1 | **Splash** | `lib/features/onboarding/presentation/splash_screen.dart` | `splashBannerAdUnitId` (adaptive) | — | `interstitialAdUnitId` (forceShow) | Sequential: RC → banner → interstitial → navigate. Also preloads language native ads + home native ads for following screens. |
| 2 | **Language** | `lib/features/onboarding/presentation/language_screen.dart` | — | `languageBigNativeAdOneUnitId` / `languageBigNativeAdTwoUnitId` (big) | — | Switches between ad 1 (before selection) and ad 2 (after). Disposes on exit. |
| 3 | **Intro** | `lib/features/onboarding/presentation/intro_screen.dart` | — | `introBigNativeAdUnitIdPageThree` (big, page 3) + `introFullNativeAdOneUnitId` + `introFullNativeAdTwoUnitId` (full) | — | Full-page ads conditionally added to PageView. Removed on load failure. Preloads home native ad. |
| 4 | **PageOne (Full)** | `lib/features/onboarding/presentation/widgets/page_full_native_ad_one.dart` | — | `introFullNativeAdOneUnitId` (full) | — | Full-bleed screen with skip button |
| 5 | **PageTwo (Full)** | `lib/features/onboarding/presentation/widgets/page_full_native_ad_two.dart` | — | `introFullNativeAdTwoUnitId` (full) | — | Full-bleed screen with skip button |
| 6 | **PageThree** | `lib/features/onboarding/presentation/widgets/page_three.dart` | — | `introBigNativeAdUnitIdPageThree` (big) | — | Ad + illustration if loaded; falls back to full illustration |
| 7 | **Browser Home** | `lib/features/browser/presentation/widgets/browser_home_screen.dart` | — | `homeSmallNativeAdUnitId` (small) | ✅ on Ad Block tap (if disabled) | Preloads reels natives when tapping Reels/Settings |
| 8 | **Browser (WebView)** | `lib/features/browser/presentation/browser_screen.dart` | `browserBannerAdUnitId` (adaptive) | — | — | Reloads when active tab changes |
| 9 | **Search** | `lib/features/search/presentation/search_screen.dart` | `searchBannerAdUnitId` (adaptive) | — | — | Below search bar |
| 10 | **Tabs** | `lib/features/tabs/presentation/tabs_screen.dart` | `tabsBannerAdUnitId` (adaptive) | — | ✅ on AppBar back button | Banner as `bottomNavigationBar` |
| 11 | **History** | `lib/features/history/presentation/history_screen.dart` | `historyBannerAdUnitId` (adaptive) | — | — | Banner as `bottomNavigationBar` |
| 12 | **Bookmarks** | `lib/features/bookmarks/presentation/bookmarks_screen.dart` | `bookmarksBannerAdUnitId` (adaptive) | — | — | Banner as `bottomNavigationBar` |
| 13 | **VPN Home** | `lib/features/vpn/presentation/vpn_home_screen.dart` | `vpnBannerAdUnitId` (adaptive) | `vpnSelectSmallNativeAdUnitId` + `vpnConnectionStatusSmallNativeAdUnitId` (small) | ✅ on VPN connect | Banner below connect button. Native in server list + status area |
| 14 | **Ad Block Status** | `lib/features/ads/presentation/ad_block_status_screen.dart` | — | `adBlockStatusSmallNativeAdUnitId` (small) | — | At bottom of SafeArea |
| 15 | **Welcome Back** | `lib/features/browser/presentation/welcome_back_screen.dart` | — | `welcomeBackSmallNativeAdUnitId` (small) | — | Below "Continue" button, shown on app resume |
| 16 | **Reels / Shorts** | `lib/features/reels/presentation/widgets/trending_shorts_grid.dart` | — | `reelsSmallNativeAdOneUnitId` + `reelsSmallNativeAdTwoUnitId` (small) | ✅ on short card tap | 2 ad blocks after every 4 shorts. Uses `ReelsNativeAdWidget` with scroll-aware visibility |
| 17 | **Settings** | `lib/features/settings/presentation/settings_screen.dart` | — | Preloads `languageBigNativeAdOneUnitId` (big) | — | Preloads for next LanguageScreen visit |
| 18 | **Navigation (all)** | `lib/core/routing/app_routes.dart` | — | — | `interstitialAdUnitId` | Every `navigateTo()` shows interstitial unless `skipAd:true` or settings route |
| 19 | **Back Button** | `lib/core/widgets/custom_app_bar.dart` | — | — | `interstitialAdUnitId` | Back button shows interstitial before popping |

---

## 12. Navigation Interstitial Pattern

**Path**: `lib/core/routing/app_routes.dart`

```dart
static Future<dynamic> navigateTo(
  BuildContext context, String route, {
  bool skipAd = false,
  Object? arguments,
}) {
  if (skipAd || _isSettingsRoute(route)) {
    return Navigator.pushNamed(context, route, arguments: arguments);
  } else {
    final completer = Completer<dynamic>();
    Ads.showAd(
      context: context,
      screenName: 'RoutingTo($route)',
      onDismiss: () {
        final res = Navigator.pushNamed(context, route, arguments: arguments);
        completer.complete(res);
      },
    );
    return completer.future;
  }
}
```

Same pattern for `navigateToReplacement()` and `navigateToAndRemoveUntil()`.  
Settings routes (`/settings`, `/privacy_policy`) always skip ads.

### CustomAppBar Back Button

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

---

## 13. Splash Screen — Ad Orchestration Sequence

**Path**: `lib/features/onboarding/presentation/splash_screen.dart`

```dart
Future<void> _startAdSequence() async {
  // Step 0: Fetch Remote Config → populate all ad IDs
  await RemoteConfigService.instance.fetchAndActivate();
  RemoteConfigService.instance.updateAdUnitIds();
  PurchaseService.suppressAds();  // safety net — if RC fails, all IDs stay "11"

  // Step 1: Load banner, await completion (5s timeout)
  await _loadBannerAdAndWait();

  // Step 2: Preload interstitial
  await Ads.preloadInterstitialAd();

  // Step 3-4 (if intro not seen): Preload language native ads 1 & 2
  // Step 3 (if intro seen): 2s delay

  // Final: Show interstitial (forceShow) → navigate
  Ads.showAd(
    context: context,
    forceShow: true,
    showLoader: false,
    onDismiss: _navigateToNext,
  );
}
```

---

## 14. App Lifecycle & Welcome Back

**Path**: `lib/main.dart` — `AppLifecycleWatcher`

```dart
class AppLifecycleWatcher extends StatefulWidget {
  final Widget child;
  final bool hasSeenIntro;
}

class _AppLifecycleWatcherState extends State<AppLifecycleWatcher>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      Ads.clearTempDisable();
      // push WelcomeBackScreen (which shows native ad)
      Navigator.of(context).push(...);
    }
  }
}
```

---

## 15. Connectivity-Aware Ad Reloading

Both `NativeAdWidget` and `ReelsNativeAdWidget` listen to `InternetConnectivityService.instance.isConnected`:

```dart
void _onConnectivityChanged() {
  if (!mounted) return;
  setState(() {});
  if (InternetConnectivityService.instance.isConnected.value) {
    _tryLoadingAd();   // retry ad load on reconnection
  }
}
```

The connectivity check is also at the top of `_startLoad()` in `BannerAdController`.

---

## 16. Complete File Inventory

### Dart Files

| File | Lines | Role |
|------|-------|------|
| `lib/services/ads.dart` | 853 | **Core ad service** — all ad types, caching, BannerAdController |
| `lib/services/remote_config_service.dart` | 206 | Firebase RC fetch + populates 23 ad IDs + click_count |
| `lib/services/purchase_service.dart` | 203 | RevenueCat IAP + `suppressAds()` → sets all IDs to "11" |
| `lib/services/internet_connectivity_service.dart` | — | Connectivity state for ad reload |
| `lib/features/ads/presentation/widgets/native_ad_widget.dart` | 597 | NativeAdWidget, ReelsNativeAdWidget, NativeAdShimmer |
| `lib/features/onboarding/presentation/splash_screen.dart` | 336 | Splash ad orchestration sequence |
| `lib/features/onboarding/presentation/intro_screen.dart` | — | Onboarding full + big native ads |
| `lib/features/onboarding/presentation/language_screen.dart` | — | Big native ad, switches on selection |
| `lib/features/onboarding/presentation/widgets/page_full_native_ad_one.dart` | — | Full native ad page |
| `lib/features/onboarding/presentation/widgets/page_full_native_ad_two.dart` | — | Full native ad page |
| `lib/features/onboarding/presentation/widgets/page_three.dart` | — | Big native + illustration |
| `lib/features/browser/presentation/browser_screen.dart` | — | Banner below WebView |
| `lib/features/browser/presentation/widgets/browser_home_screen.dart` | — | Home native + interstitial |
| `lib/features/browser/presentation/welcome_back_screen.dart` | — | Resume native ad |
| `lib/features/search/presentation/search_screen.dart` | — | Search banner |
| `lib/features/tabs/presentation/tabs_screen.dart` | — | Tabs banner + interstitial |
| `lib/features/history/presentation/history_screen.dart` | — | History banner |
| `lib/features/bookmarks/presentation/bookmarks_screen.dart` | — | Bookmarks banner |
| `lib/features/vpn/presentation/vpn_home_screen.dart` | — | VPN banner + 2 natives + interstitial |
| `lib/features/ads/presentation/ad_block_status_screen.dart` | — | Native ad |
| `lib/features/reels/presentation/widgets/trending_shorts_grid.dart` | — | 2 reels natives + interstitial |
| `lib/features/settings/presentation/settings_screen.dart` | — | Preloads language native |
| `lib/core/routing/app_routes.dart` | 222 | Interstitial on navigation |
| `lib/core/widgets/custom_app_bar.dart` | — | Interstitial on back |
| `lib/main.dart` | 214 | AppLifecycleWatcher |

### Android Native Files

| File | Role |
|------|------|
| `android/app/src/main/kotlin/.../MainActivity.kt` | Registers 3 native ad factories |
| `android/app/src/main/kotlin/.../NativeAdFactoryImpl.kt` | Binds native ad components to XML |
| `android/app/src/main/res/layout/small_native_ad.xml` | Small native ad layout |
| `android/app/src/main/res/layout/big_native_ad.xml` | Big native ad layout |
| `android/app/src/main/res/layout/native_admob_full.xml` | Full native ad layout |
| `android/app/src/main/res/drawable/ad_cta_bg.xml` | Blue (#0095FF) rounded CTA button bg |
| `android/app/src/main/res/drawable/ad_badge_bg.xml` | Grey translucent "Ad" badge bg |

---

## 17. Quick-Start Implementation Checklist

1. **Add deps** to `pubspec.yaml`: `google_mobile_ads: ^9.0.0`, `visibility_detector: ^0.4.0+2`, `shimmer: ^3.0.0`

2. **Copy core services**:
   - `lib/services/ads.dart` — the entire ad singleton
   - `lib/services/remote_config_service.dart` — config fetch
   - `lib/services/purchase_service.dart` — IAP + ad suppression
   - `lib/services/internet_connectivity_service.dart` — connectivity checks

3. **Copy native ad widget**:
   - `lib/features/ads/presentation/widgets/native_ad_widget.dart`

4. **Create Android native layouts** (3 XMLs under `res/layout/`):
   - `small_native_ad.xml`
   - `big_native_ad.xml`
   - `native_admob_full.xml`

5. **Register factories** in `MainActivity.kt`:
   - `"smallNativeAd"`, `"bigNativeAd"`, `"fullNativeAd"`

6. **Initialize Ads** in `main()`:
   ```dart
   WidgetsFlutterBinding.ensureInitialized();
   await Ads.initialize();
   ```

7. **Populate ad IDs** from your config source (Remote Config / API / hardcoded)

8. **Set up PurchaseService** with `suppressAds()` for the `"11"` kill switch

9. **Copy navigation pattern** from `app_routes.dart` to show interstitials on route

10. **For each screen**:
    - Banner: create `BannerAdController` in `didChangeDependencies()`, call `.load()`, use `_buildBannerAd()` pattern
    - Native: insert `NativeAdWidget(adUnitId: Ads.xxxNativeAdUnitId, type: NativeAdType.small)`
    - Interstitial: call `Ads.showAd()` or use `AppRoutes.navigateTo()` wrapper

---

## 18. Key Design Patterns Summary

| Pattern | Where | Why |
|---------|-------|-----|
| **Static singleton** | `Ads` class | Global state accessible from anywhere without DI |
| **Completer-driven loading** | Interstitial, rewarded, native | Awaitable without polling — callback resolves the Future |
| **1 retry on failure** | Banner, native | Resilience against transient network errors |
| **Preload caching** | Native ads only | Preload in background before screen opens, consume instantly |
| **Consume + re-preload** | `getPreloadedAd()` | Automatic warm cache for next impression |
| **ValueNotifier state** | Native ads | Widgets reactively listen to load/fail transitions |
| **Click throttling** | Interstitial | Every Nth call shows ad (configurable from server) |
| **forceShow** | Interstitial `showAd()` | Bypasses throttle — used on splash |
| **Ad ID "11"** | All ad paths | Universal kill switch for premium users |
| **isPurchase gate** | Load entry points + widget build | Prevents unnecessary ad SDK calls for premium users |
| **Connectivity check** | Load entry points + widget build | Skips ads when offline, retries on reconnection |
| **Adaptive banner sizing** | `BannerAdController.load(anchorWidth:)` | Full-width banners that respect device orientation |
| **Splash safety net** | `suppressAds()` before RC populates | If RC fails, all IDs stay "11" → no ads |
