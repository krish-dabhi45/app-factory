import 'dart:developer';
import 'package:ai_ppt_generater/AdsUtils/loading_screen.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

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
  loadAd(addId) async {
    await AppOpenAd.load(
      adUnitId: addId, //Platform.isAndroid ? AdsVariable.appOpenAds : AdsVariable.appOpenAdsIOS,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          _appOpenLoadTime = DateTime.now();
          AdsVariable.appOpenAd = ad;
          log('${AdsVariable.appOpenAd} appOpen loaded');
        },
        onAdFailedToLoad: (error) {
          print('AppOpenAd failed to load: $error');
        },
      ),
    );
  }

  loadSplashAd(addId, Function() navigateScreen) async {
    await AppOpenAd.load(
      adUnitId: addId, //Platform.isAndroid ? AdsVariable.appOpenAds : AdsVariable.appOpenAdsIOS,
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
          print('AppOpenAd failed to loadSplahsAd: $error');
        },
      ),
    );
  }

  showOpenAdSplash(Function() navigateScreen) async {
    if (AdsVariable.appOpenAdSplash == null) {
      navigateScreen();
      return;
    }
    AdsVariable.appOpenAdSplash!.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        // AdsVariable.isShowingAd = true;
        showLog('$ad onAdShowedFullScreenContent-==-');
        showLog("FullScreenContentCallback-=-");
        navigateScreen();
        Get.to(const EmptyScreen());
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        showLog('$ad onAdFailedToShowFullScreenContent===: $error');
        // AdsVariable.isShowingAd = false;
        ad.dispose();
        AdsVariable.appOpenAdSplash = null;
        // if (!AppOpenAdManager().isAdAvailable && (Platform.isAndroid ? AdsVariable.appOpenAds!="11" : AdsVariable.appOpenAdsIOS!="11")) {
        //   AdsSplashUtils().loadAppOpenAd();
        // }
        // loadOpenAds();
        navigateScreen();

        /// ad loaded function hear after testing
      },
      onAdDismissedFullScreenContent: (ad) {
        Get.back();
        showLog('$ad onAdDismissedFullScreenContent==');
        // AdsVariable.isShowingAd = false;
        ad.dispose();
        // if (!AppOpenAdManager().isAdAvailable && (Platform.isAndroid ? AdsVariable.appOpenAds!="11" : AdsVariable.appOpenAdsIOS!="11")) {
        //   AdsSplashUtils().loadAppOpenAd();
        // }
        AdsVariable.appOpenAdSplash = null;
        // loadOpenAds();
      },
    );
    await AdsVariable.appOpenAdSplash!.show();
    // Timer(const Duration(seconds: 1), () async {
    //   navigateScreen();
    // });
  }

  /// Shows the ad, if one exists and is not already being shown.
  /// If the previously cached ad has expired, this just loads and caches a
  /// new ad.
  void showAdIfAvailable(adId) async {
    if (AdsVariable.appOpenAd == null) {
      return;
    }
    if (!isAdAvailable) {
      loadAd(adId);
      print('Tried to show ad before available.');
      return;
    }
    if (AdsVariable.isShowingAd.value) {
      print('Tried to show ad while already showing an ad.');
      return;
    }
    if (DateTime.now().subtract(maxCacheDuration).isAfter(_appOpenLoadTime!)) {
      loadAd(adId);
      print('Maximum cache duration exceeded. Loading another ad.');
      return;
    }
    AdsVariable.appOpenAd!.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        AdsVariable.isShowingAd.value = true;
        print('$ad onAdShowedFullScreenContent');
        log("FullScreenContentCallback");
        Future.delayed(Duration(seconds: 1), () {
          Get.to(const EmptyScreen());
        });
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        print('$ad onAdFailedToShowFullScreenContent: $error');
        AdsVariable.isShowingAd.value = false;
        ad.dispose();
        AdsVariable.appOpenAd = null;
        loadAd(adId);

        /// ad loaded function hear after testing
      },
      onAdDismissedFullScreenContent: (ad) {
        Get.back();
        print('$ad onAdDismissedFullScreenContent');
        AdsVariable.isShowingAd.value = false;
        ad.dispose();
        AdsVariable.appOpenAd = null;
        loadAd(adId);
      },
    );
    await AdsVariable.appOpenAd!.show();
  }

  /// Load Intro Premium Ads
  loadIntroPremiumAd(addId, Function() navigateScreen) async {
    loadingScreen.show();
    await AppOpenAd.load(
      adUnitId: addId, //Platform.isAndroid ? AdsVariable.appOpenAds : AdsVariable.appOpenAdsIOS,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          _appOpenLoadTime = DateTime.now();
          AdsVariable.appOpenAdIntroPremium = ad;
          loadingScreen.hide();
          showOpenAdIntroPremium(() => navigateScreen());
          showLog('${AdsVariable.appOpenAdIntroPremium} appOpen loadSplahsAd');
        },
        onAdFailedToLoad: (error) {
          loadingScreen.hide();
          navigateScreen();
          showLog('AppOpenAd failed to loadSplahsAd: $error');
        },
      ),
    );
  }

  loadIntroPremiumAdOnly(addId) async {
    // loadingScreen.show();
    await AppOpenAd.load(
      adUnitId: addId, //Platform.isAndroid ? AdsVariable.appOpenAds : AdsVariable.appOpenAdsIOS,
      request: const AdRequest(),
      adLoadCallback: AppOpenAdLoadCallback(
        onAdLoaded: (ad) {
          _appOpenLoadTime = DateTime.now();
          AdsVariable.appOpenAdIntroPremium = ad;
          // loadingScreen.hide();
          // showOpenAdIntroPremium(() => navigateScreen());
          showLog('${AdsVariable.appOpenAdIntroPremium} appOpen loadSplahsAd');
        },
        onAdFailedToLoad: (error) {
          // loadingScreen.hide();
          // navigateScreen();
          showLog('AppOpenAd failed to loadSplahsAd: $error');
        },
      ),
    );
  }

  showOpenAdIntroPremium(Function() navigateScreen) async {
    if (AdsVariable.appOpenAdIntroPremium == null) {
      navigateScreen();
      return;
    }
    AdsVariable.appOpenAdIntroPremium!.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        // AdsVariable.isShowingAd = true;
        showLog('$ad onAdShowedFullScreenContent-==-');
        showLog("FullScreenContentCallback-=-");
        // Get.to(const EmptyScreen());
        // navigateScreen();
      },
      onAdFailedToShowFullScreenContent: (ad, error) {
        showLog('$ad onAdFailedToShowFullScreenContent===: $error');
        // AdsVariable.isShowingAd = false;
        ad.dispose();
        loadIntroPremiumAdOnly(AdsVariable.appOpenIntro);
        AdsVariable.appOpenAdIntroPremium = null;
        // if (!AppOpenAdManager().isAdAvailable && (AdsVariable.Afs_appOpenAds!="11")) {
        // AdsSplashUtils().loadAppOpenAd();
        // }
        // loadOpenAds();
        navigateScreen();

        /// ad loaded function hear after testing
      },
      onAdDismissedFullScreenContent: (ad) {
        showLog('$ad onAdDismissedFullScreenContent');

        ad.dispose();

        loadIntroPremiumAdOnly(AdsVariable.appOpenIntro);
        AdsVariable.appOpenAdIntroPremium = null;

        // NOW ad is completely closed
        // So navigate to Home
        navigateScreen();
      },

      /*onAdDismissedFullScreenContent: (ad) {
        Get.to(const EmptyScreen());
        Get.back();
        showLog('$ad onAdDismissedFullScreenContent==');
        // AdsVariable.isShowingAd = false;
        ad.dispose();
        loadIntroPremiumAdOnly(AdsVariable.appOpenIntro);
        // if (!AppOpenAdManager().isAdAvailable && (AdsVariable.Afs_appOpenAds!="11")) {
        // AdsSplashUtils().loadAppOpenAd();
        // }
        AdsVariable.appOpenAdIntroPremium = null;
        // loadOpenAds();
      },*/
    );
    await AdsVariable.appOpenAdIntroPremium!.show();
    // Timer(const Duration(seconds: 1), () async {
    // navigateScreen();
    // });
  }
}

class EmptyScreen extends StatelessWidget {
  const EmptyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const SafeArea(child: Scaffold(backgroundColor: Colors.black));
  }
}
