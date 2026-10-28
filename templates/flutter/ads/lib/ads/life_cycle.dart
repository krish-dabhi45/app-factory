import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ads_splash_utils.dart';
import 'ads_variable.dart';
import 'app_open_ad.dart';
import 'app_variable.dart';

/// IPTV_two `lib/ads/life_cycle.dart`: only the imports, `debugPrint` → showLog, the identical-branch
/// `Platform.isAndroid ? x : x` → x, and the commented-out code dropped; the app open id is the app's [adUnitId]
/// (IPTV read `AdsVariable.appOpenAds`).
/// Listens for app foreground events and shows app open ads.
class AppLifecycleReactor {
  final AppOpenAdManager appOpenAdManager;
  final String adUnitId;

  AppLifecycleReactor({required this.appOpenAdManager, required this.adUnitId});

  void listenToAppStateChanges() {
    AppStateEventNotifier.startListening();
    AppStateEventNotifier.appStateStream.forEach((state) => onAppStateChanged(state));
  }

  void onAppStateChanged(AppState appState) {
    if (appState == AppState.foreground) {
      appOpenAdManager.showAdIfAvailable(adUnitId);
      showLog("App State :- $appState");
    } else if (appState == AppState.background) {
      if (!AppOpenAdManager().isAdAvailable && adUnitId != "11" && !AdsVariable.isPurchase.value && !AdsVariable.isShowingAd.value) {
        AdsSplashUtils().loadAppOpenAd(adUnitId);
      }
      showLog("App State :- $appState");
    }
  }
}
