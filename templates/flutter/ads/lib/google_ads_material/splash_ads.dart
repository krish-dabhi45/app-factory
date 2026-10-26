import 'dart:async';

import 'package:flutter/foundation.dart';

import 'ad_flags.dart';
import 'ads_consent.dart';
import 'ads_id.dart';
import 'app_open_ad_manager.dart';
import 'interstitial_ad_manager.dart';
import 'native_ad_manager.dart';

/// Splash ka ad step. `run` tab complete hota hai jab app ko splash se aage jaana chahiye
/// (ad band hua, fail hua, ya `splashAdWaitSeconds` (default 8) me load nahi hua).
///
/// Premium: kuch nahi (consent bhi nahi, SDK init bhi nahi).
/// `appOpenSplash` set ho to app open, warna `interSplash` interstitial (IPTV jaisa).
/// Interstitial dikha -> resume app open preload. App open dikha -> main interstitial preload.
class SplashAds {
  SplashAds._();

  /// Purchase status check ke BAAD call karo (premium ho to `AdFlags.isPremium` pehle set ho).
  /// [isFirstTime] = is launch par intro dikhega (first launch aur `showIntro` "1").
  /// [isReturning] = pehle bhi app khul chuki (intro ho chuka): splash ad home ka pehla ad maana jaata hai.
  static Future<void> run({required bool isFirstTime, bool isReturning = false}) async {
    if (AdFlags.isPremium) return;
    await AdsConsent.init();
    if (!AdFlags.adsReady) return;

    // Intro ka big native aur home ka small native splash me hi preload (IPTV loadPreLoadAds).
    if (isFirstTime) NativeAdManager.intro.preload();
    NativeAdManager.home.preload();
    if (isReturning) AdFlags.homeFlag = 1; // home ka pehla tap bina ad (AdTapHelper)

    final done = Completer<void>();
    final watch = Stopwatch()..start();
    if (!AdsId.splashUsesAppOpen) {
      final ok = await InterstitialAdManager.splash.preload().timeout(AdsId.splashAdWait, onTimeout: () => false);
      debugPrint('SplashAds: interstitial ${ok ? 'loaded' : 'not ready'} after ${watch.elapsedMilliseconds} ms');
      if (!ok) return;
      InterstitialAdManager.splash.show(
        preloadAfter: false,
        loadIfMissing: false,
        onShown: AppOpenAdManager.resume.preload,
        onDone: done.complete,
      );
    } else {
      final ok = await AppOpenAdManager.splash.preload().timeout(AdsId.splashAdWait, onTimeout: () => false);
      debugPrint('SplashAds: app open ${ok ? 'loaded' : 'not ready'} after ${watch.elapsedMilliseconds} ms');
      if (!ok) return;
      AppOpenAdManager.splash.show(
        preloadAfter: false,
        onShown: InterstitialAdManager.main.preload,
        onDone: done.complete,
      );
    }
    await done.future;
  }

  /// Splash ke baad (premium ho ya na ho): resume listener + home taps ke liye interstitial.
  static void afterSplash() {
    AppResumeAdListener.start();
    InterstitialAdManager.main.preload();
  }
}
