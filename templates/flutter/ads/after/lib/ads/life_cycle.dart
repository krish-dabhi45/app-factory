import 'dart:io';
import 'package:ai_ppt_generater/ads/ads_splash_utils.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/ads/app_open_ad.dart';
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

/// Listens for app foreground events and shows app open ads.
class AppLifecycleReactor {
  final AppOpenAdManager appOpenAdManager;

  AppLifecycleReactor({required this.appOpenAdManager});

  void listenToAppStateChanges() {
    AppStateEventNotifier.startListening();
    AppStateEventNotifier.appStateStream
        .forEach((state) => onAppStateChanged(state));
  }

  void onAppStateChanged(AppState appState) {

    if (appState == AppState.foreground) {
      // if (!AppOpenAdManager().isAdAvailable && (Platform.isAndroid ? AdsVariable.Atg_appOpenAds!="11" : AdsVariable.Atg_appOpenAdsIOS!="11")) {
      //   AdsSplashUtils().loadAppOpenAd();
      // }
      appOpenAdManager.showAdIfAvailable(Platform.isAndroid ? AdsVariable.appOpenAds : AdsVariable.appOpenAds);
      debugPrint("App State :- $appState");
    }else if (appState == AppState.background) {
      if (!AppOpenAdManager().isAdAvailable && (Platform.isAndroid ? AdsVariable.appOpenAds!="11" : AdsVariable.appOpenAds!="11") && !AdsVariable.isPurchase.value && !AdsVariable.isShowingAd.value) {
        AdsSplashUtils().loadAppOpenAd();
      }
      // appOpenAdManager.showAdIfAvailable(Platform.isAndroid ? AdsVariable.Atg_appOpenAds : AdsVariable.Atg_appOpenAdsIOS);
      debugPrint("App State :- $appState");
    }
  }


// void onAppStateChanged(AppState appState) {
  //
  //   if (appState == AppState.foreground) {
  //     if (!AppOpenAdManager().isAdAvailable && (Platform.isAndroid ? AdsVariable.appOpenAds!="11" : AdsVariable.appOpenAdsIOS!="11")) {
  //       AdsSplashUtils().loadAppOpenAd();
  //     }
  //     appOpenAdManager.showAdIfAvailable(Platform.isAndroid ? AdsVariable.appOpenAds : AdsVariable.appOpenAdsIOS);
  //     debugPrint("App State :- $appState");
  //   }
  // }
}
