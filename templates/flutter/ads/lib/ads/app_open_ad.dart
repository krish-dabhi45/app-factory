import 'dart:developer';

import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ads_variable.dart';
import 'app_variable.dart';

/// IPTV_two `lib/ads/app_open_ad.dart`. Every ad id is the caller's (IPTV read `AdsVariable.appOpenIntro` in
/// [showOpenAdIntroPremium]). Not ported: commented-out code; `loadIntroPremiumAd`, which only IPTV's uncalled
/// `loadAppOpenIntroPremium` used; and IPTV's black `EmptyScreen` (`Get.to` when an app open ad shows, `Get.back()` when
/// it closes, app_open_ad.dart:69/85/129/142): nothing in IPTV reads that route, the ad covers the screen anyway, and
/// its `Get.back()` popped a real screen — the app's own when the ad closed within the 1 s before the push (:128-130),
/// the screen the splash had just opened (:68-69, the navigation is async, so `Get.offAll` removes the black screen
/// first).
/// Utility class that manages loading and showing app open ads.
class AppOpenAdManager {
  bool get isAdAvailable {
    return AdsVariable.appOpenAd != null;
  }

  /// Maximum duration allowed between loading and showing the ad.
  final Duration maxCacheDuration = const Duration(hours: 4);

  /// Keep track of load time so we don't show an expired ad.
  DateTime? _appOpenLoadTime;

  /// Load an AppOpenAd.
  Future<void> loadAd(String addId) async {
    await AppOpenAd.load(
      adUnitId: addId,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          _appOpenLoadTime = DateTime.now();
          AdsVariable.appOpenAd = ad;
          log('${AdsVariable.appOpenAd} appOpen loaded');
        },
        onAdFailedToLoad: (error) {
          showLog('AppOpenAd failed to load: $error');
        },
      ),
    );
  }

  Future<void> loadSplashAd(String addId, Function() navigateScreen) async {
    await AppOpenAd.load(
      adUnitId: addId,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          _appOpenLoadTime = DateTime.now();
          AdsVariable.appOpenAdSplash = ad;
          showOpenAdSplash(() => navigateScreen());
          log('${AdsVariable.appOpenAdSplash} appOpen loadSplahsAd');
        },
        onAdFailedToLoad: (error) {
          navigateScreen();
          showLog('AppOpenAd failed to loadSplahsAd: $error');
        },
      ),
    );
  }

  Future<void> showOpenAdSplash(Function() navigateScreen) async {
    if (AdsVariable.appOpenAdSplash == null) {
      navigateScreen();
      return;
    }
    AdsVariable.appOpenAdSplash!.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        showLog('$ad onAdShowedFullScreenContent-==-');
        showLog("FullScreenContentCallback-=-");
        navigateScreen();
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        showLog('$ad onAdFailedToShowFullScreenContent===: $error');
        ad.dispose();
        AdsVariable.appOpenAdSplash = null;
        navigateScreen();
      },
      onAdDismissedFullScreenContent: (ad) {
        showLog('$ad onAdDismissedFullScreenContent==');
        ad.dispose();
        AdsVariable.appOpenAdSplash = null;
      },
    );
    await AdsVariable.appOpenAdSplash!.show();
  }

  /// Shows the ad, if one exists and is not already being shown.
  /// If the previously cached ad has expired, this just loads and caches a
  /// new ad.
  void showAdIfAvailable(String adId) async {
    if (AdsVariable.appOpenAd == null) {
      return;
    }
    if (!isAdAvailable) {
      loadAd(adId);
      showLog('Tried to show ad before available.');
      return;
    }
    if (AdsVariable.isShowingAd.value) {
      showLog('Tried to show ad while already showing an ad.');
      return;
    }
    // F3: IPTV reads `_appOpenLoadTime!` (app_open_ad.dart:118). The listener started by loadAppLifecycleReactor
    // (ads_splash_utils.dart:305-310) has a manager that never loaded, so `_appOpenLoadTime!` throws there (null check) on each resume; the ad is
    // shown by the listener whose manager loaded it (life_cycle.dart:30 → loadAppOpenAd). That one still does.
    if (_appOpenLoadTime == null) {
      return;
    }
    if (DateTime.now().subtract(maxCacheDuration).isAfter(_appOpenLoadTime!)) {
      loadAd(adId);
      showLog('Maximum cache duration exceeded. Loading another ad.');
      return;
    }
    AdsVariable.appOpenAd!.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        AdsVariable.isShowingAd.value = true;
        showLog('$ad onAdShowedFullScreenContent');
        log("FullScreenContentCallback");
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        showLog('$ad onAdFailedToShowFullScreenContent: $error');
        AdsVariable.isShowingAd.value = false;
        ad.dispose();
        AdsVariable.appOpenAd = null;
        loadAd(adId);
      },
      onAdDismissedFullScreenContent: (ad) {
        showLog('$ad onAdDismissedFullScreenContent');
        AdsVariable.isShowingAd.value = false;
        ad.dispose();
        AdsVariable.appOpenAd = null;
        loadAd(adId);
      },
    );
    await AdsVariable.appOpenAd!.show();
  }

  Future<void> loadIntroPremiumAdOnly(String addId) async {
    await AppOpenAd.load(
      adUnitId: addId,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          _appOpenLoadTime = DateTime.now();
          AdsVariable.appOpenAdIntroPremium = ad;
          showLog('${AdsVariable.appOpenAdIntroPremium} appOpen loadSplahsAd');
        },
        onAdFailedToLoad: (error) {
          showLog('AppOpenAd failed to loadSplahsAd: $error');
        },
      ),
    );
  }

  /// [addId]: the same id [loadIntroPremiumAdOnly] loaded; loaded again after the ad (IPTV).
  Future<void> showOpenAdIntroPremium(String addId, Function() navigateScreen) async {
    if (AdsVariable.appOpenAdIntroPremium == null) {
      navigateScreen();
      return;
    }
    AdsVariable.appOpenAdIntroPremium!.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        showLog('$ad onAdShowedFullScreenContent-==-');
        showLog("FullScreenContentCallback-=-");
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        showLog('$ad onAdFailedToShowFullScreenContent===: $error');
        ad.dispose();
        loadIntroPremiumAdOnly(addId);
        AdsVariable.appOpenAdIntroPremium = null;
        navigateScreen();
      },
      onAdDismissedFullScreenContent: (ad) {
        showLog('$ad onAdDismissedFullScreenContent');

        ad.dispose();

        loadIntroPremiumAdOnly(addId);
        AdsVariable.appOpenAdIntroPremium = null;

        // NOW ad is completely closed
        // So navigate to Home
        navigateScreen();
      },
    );
    await AdsVariable.appOpenAdIntroPremium!.show();
  }
}
