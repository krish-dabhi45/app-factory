import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'ad_impression.dart';
import 'ads_id.dart';
import 'interstitial_ad_manager.dart';

/// App open ad, Remote Config key [key] (jaise "appOpenAds") ki id se. Close ke baad preload.
class AppOpenSlot {
  AppOpenSlot(this.key);

  final String key;

  AppOpenAd? _ad;
  DateTime? _loadedAt;
  bool _loading = false;

  /// Id "11" -> ye ad off: na load, na show.
  bool get isOff => AdsId.isOff(AdsId.unit(key));

  /// AdMob app open ad 4 ghante baad expire hota hai.
  bool get isReady =>
      !isOff &&
      _ad != null && _loadedAt != null && DateTime.now().difference(_loadedAt!) < const Duration(hours: 4);

  Future<bool> preload() async {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady) return false;
    if (isReady || _loading) return isReady;
    _loading = true;
    _ad?.dispose();
    _ad = await _load(AdsId.unit(key));
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
          AdImpression.attach(ad, key);
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

  /// [openBehind]: [onDone] impression ke 1 s baad (splash, IPTV `app_open_ad.dart:64-69`); warna ad band hone par.
  bool show({required VoidCallback onDone, VoidCallback? onShown, bool preloadAfter = true, bool openBehind = false}) {
    if (!isReady || AdFlags.isPremium || AdFlags.isFullScreenAdShowing) {
      onDone();
      if (preloadAfter) preload();
      return false;
    }
    final ad = _ad!;
    _ad = null;
    ad.fullScreenContentCallback =
        fullScreenCallback(onDone: onDone, onShown: onShown, openBehind: openBehind, after: preloadAfter ? preload : null);
    ad.show();
    return true;
  }
}

class AppOpenAdManager {
  AppOpenAdManager._();

  static final splash = AppOpenSlot('appOpenSplash');

  /// Intro ka last Continue (IPTV `intro_screen.dart:41`, `:113`): intro khulte hi preload, ready ho tabhi dikhe.
  static final intro = AppOpenSlot('appOpenIntro');

  /// App background -> foreground (AppResumeAdListener).
  static final resume = AppOpenSlot('appOpenAds');
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
  static bool _hidden = false;

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
    return enabled && _blocked == 0 && !AdFlags.isPremium && !AdFlags.isFullScreenAdShowing;
  }

  /// Share sheet, purchase sheet, review dialog translucent hote hai: app sirf pause hota hai (background /
  /// foreground event nahi aata), to skip agle asli resume ad ko kha jaata. Hidden hue bina wapas resumed -> skip hatao.
  /// Asli bahar jaana (browser, store) hidden se guzarta hai: wahan skip foreground event hi consume karta hai.
  @visibleForTesting
  static void lifecycle(AppLifecycleState state) {
    if (state == AppLifecycleState.hidden) _hidden = true;
    if (state != AppLifecycleState.resumed) return;
    if (!_hidden) _skipUntil = null;
    _hidden = false;
  }

  @visibleForTesting
  static void resetForTest() {
    enabled = false;
    _skipUntil = null;
    _blocked = 0;
    _hidden = false;
  }

  static void start() {
    if (_sub != null) return;
    AppLifecycleListener(onStateChange: lifecycle); // app ke saath hamesha zinda
    AppStateEventNotifier.startListening();
    _sub = AppStateEventNotifier.appStateStream.listen((state) {
      // Sirf background me jaate hi load (IPTV `life_cycle.dart:28-31`): app start par nahi.
      if (state == AppState.background) {
        AppOpenAdManager.resume.preload();
        return;
      }
      if (shouldShowOnForeground()) AppOpenAdManager.resume.show(onDone: () {});
    });
  }
}
