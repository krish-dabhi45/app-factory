import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'ad_impression.dart';
import 'ads_id.dart';

/// App open ad: HIGH -> NORMAL fallback, close ke baad preload.
class AppOpenSlot {
  AppOpenSlot({required this.highId, required this.normalId});

  final String Function() highId;
  final String Function() normalId;

  AppOpenAd? _ad;
  DateTime? _loadedAt;
  bool _loading = false;

  /// Dono ids "11" -> ye ad off: na load, na show.
  bool get isOff => AdsId.isOff(highId()) && AdsId.isOff(normalId());

  /// AdMob app open ad 4 ghante baad expire hota hai.
  bool get isReady =>
      !isOff &&
      _ad != null && _loadedAt != null && DateTime.now().difference(_loadedAt!) < const Duration(hours: 4);

  Future<bool> preload() async {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady) return false;
    if (isReady || _loading) return isReady;
    _loading = true;
    _ad?.dispose();
    _ad = await _load(highId()) ?? await _load(normalId());
    _loadedAt = _ad == null ? null : DateTime.now();
    _loading = false;
    return _ad != null;
  }

  Future<AppOpenAd?> _load(String id) {
    if (AdsId.isOff(id)) return Future.value(null);
    final c = Completer<AppOpenAd?>();
    AppOpenAd.load(
      adUnitId: id,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          AdImpression.attach(ad, 'app_open');
          c.complete(ad);
        },
        onAdFailedToLoad: (e) {
          debugPrint('AppOpen fail ($id): $e');
          c.complete(null);
        },
      ),
    );
    return c.future;
  }

  bool show({required VoidCallback onDone, VoidCallback? onShown, bool preloadAfter = true}) {
    if (!isReady || AdFlags.isPremium || AdFlags.isFullScreenAdShowing) {
      onDone();
      if (preloadAfter) preload();
      return false;
    }
    final ad = _ad!;
    _ad = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (_) {
        AdFlags.isFullScreenAdShowing = true;
        onShown?.call();
      },
      onAdDismissedFullScreenContent: (ad) {
        AdFlags.isFullScreenAdShowing = false;
        ad.dispose();
        onDone();
        if (preloadAfter) preload();
      },
      onAdFailedToShowFullScreenContent: (ad, e) {
        AdFlags.isFullScreenAdShowing = false;
        ad.dispose();
        onDone();
        if (preloadAfter) preload();
      },
    );
    ad.show();
    return true;
  }
}

class AppOpenAdManager {
  AppOpenAdManager._();

  static final splash = AppOpenSlot(highId: () => AdsId.splashAppOpenHigh, normalId: () => AdsId.splashAppOpenNormal);
  static final resume = AppOpenSlot(highId: () => AdsId.appOpenHigh, normalId: () => AdsId.appOpenNormal);
}

/// App background -> foreground aane par app open ad.
/// main() ya splash ke baad ek baar `AppResumeAdListener.start()` call karo.
class AppResumeAdListener {
  AppResumeAdListener._();

  static StreamSubscription<AppState>? _sub;

  /// Splash / onboarding par resume ad nahi chahiye: home pahunchne par `AppFlow.goHome` true karta hai.
  static bool enabled = false;

  static DateTime? _skipUntil;
  static int _blocked = 0;

  /// App se jaan-bujh kar bahar jaane se pehle call karo (share sheet, store review/page, purchase sheet,
  /// browser, banner/native ad click). Agla foreground (5 min ke andar) resume ad nahi dikhayega.
  static void skipNextResume() => _skipUntil = DateTime.now().add(const Duration(minutes: 5));

  /// Jis screen par resume ad kabhi nahi (jaise PremiumScreen): initState me block(), dispose me unblock().
  static void block() => _blocked++;
  static void unblock() => _blocked = _blocked > 0 ? _blocked - 1 : 0;

  /// Foreground event par: ad dikhana hai ya nahi. Skip window yahi consume hota hai.
  static bool shouldShowOnForeground() {
    final skip = _skipUntil != null && DateTime.now().isBefore(_skipUntil!);
    _skipUntil = null;
    if (skip) return false;
    return enabled && _blocked == 0 && AdsId.appOpenOnResume && !AdFlags.isPremium && !AdFlags.isFullScreenAdShowing;
  }

  @visibleForTesting
  static void resetForTest() {
    enabled = false;
    _skipUntil = null;
    _blocked = 0;
  }

  static void start() {
    if (_sub != null) return;
    AppStateEventNotifier.startListening();
    _sub = AppStateEventNotifier.appStateStream.listen((state) {
      if (state != AppState.foreground) return;
      if (shouldShowOnForeground()) AppOpenAdManager.resume.show(onDone: () {});
    });
    AppOpenAdManager.resume.preload();
  }
}
