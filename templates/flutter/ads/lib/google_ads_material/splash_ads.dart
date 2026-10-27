import 'dart:async';

import 'package:flutter/foundation.dart';

import 'ad_flags.dart';
import 'ads_consent.dart';
import 'ads_id.dart';
import 'app_open_ad_manager.dart';
import 'interstitial_ad_manager.dart';
import 'native_ad_manager.dart';

/// Splash ka ad step. `run` tab complete hota hai jab app ko splash se aage jaana chahiye:
/// ad ke impression ke 1 s baad (agli screen ad ke peeche khulti hai, IPTV `ads_load_util.dart:265-269`,
/// `app_open_ad.dart:64-69`), ad fail hone par, ya `splashAdWaitSeconds` (default 8) me load na hone par.
///
/// Premium: kuch nahi (consent bhi nahi, SDK init bhi nahi).
/// `appOpenSplash` set ho to app open, warna `interSplash` interstitial (IPTV `ads_load_util.dart:243-252`).
class SplashAds {
  SplashAds._();

  /// Purchase status check ke BAAD call karo (premium ho to `AdFlags.isPremium` pehle set ho).
  /// [isFirstTime] = is launch par intro dikhega (first launch aur `showIntro` "1").
  /// [homeFollows] = splash ke turant baad Home khulega (returning launch, paywall nahi): splash ad home ka
  /// pehla ad maana jaata hai, `homeFlag` = 1 (IPTV `splash_screen.dart:39-41`).
  static Future<void> run({required bool isFirstTime, bool homeFollows = false}) async {
    if (AdFlags.isPremium) return;
    await AdsConsent.init();
    if (!AdFlags.adsReady) return;

    // Intro ka big native aur home ka small native splash me hi preload (IPTV loadPreLoadAds).
    if (isFirstTime) NativeAdManager.intro.preload();
    NativeAdManager.home.preload();
    if (homeFollows) AdFlags.homeFlag = 1; // home ka pehla tap bina ad (AdTapHelper)

    final done = Completer<void>();
    final watch = Stopwatch()..start();
    if (!AdsId.splashUsesAppOpen) {
      final ok = await InterstitialAdManager.splash.preload().timeout(AdsId.splashAdWait, onTimeout: () => false);
      debugPrint('SplashAds: interstitial ${ok ? 'loaded' : 'not ready'} after ${watch.elapsedMilliseconds} ms');
      if (!ok) return;
      InterstitialAdManager.splash.show(preloadAfter: false, openBehind: true, onDone: done.complete);
    } else {
      final ok = await AppOpenAdManager.splash.preload().timeout(AdsId.splashAdWait, onTimeout: () => false);
      debugPrint('SplashAds: app open ${ok ? 'loaded' : 'not ready'} after ${watch.elapsedMilliseconds} ms');
      if (!ok) return;
      AppOpenAdManager.splash.show(preloadAfter: false, openBehind: true, onDone: done.complete);
    }
    await done.future;
  }

  /// Splash ke baad (premium ho ya na ho): resume listener (load background me) + home taps ke liye interstitial preload.
  static void afterSplash() {
    AppResumeAdListener.start();
    InterstitialAdManager.main.preload();
  }
}
