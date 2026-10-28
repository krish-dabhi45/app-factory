import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// IPTV_two `lib/ads/ads_variable.dart`, ported to plain Flutter: GetX `RxBool` → [RxFlag] (a ValueNotifier with
/// IPTV's `.value` and `.refresh()`), and [navigatorKey] for what IPTV did with `Get.context` / `Get.to` / `Get.back`.
/// Every field name, default and Remote Config key is IPTV's (its `config.json`).
/// Not ported (IPTV app features, not ads): `mapBoxKey`, `googleMapKey`, `isFirstInfo`.
class RxFlag extends ValueNotifier<bool> {
  RxFlag(super.value);

  /// GetX `RxBool.refresh()`: listeners rebuild even when the value did not change.
  void refresh() => notifyListeners();
}

class AdsVariable {
  /// MaterialApp / GetMaterialApp `navigatorKey:` — the "Loading..." dialog and the screen behind an app open ad.
  static final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

  static bool? isFirstTimeVisited;
  static bool? isFirstTimePurchased;

  static AppOpenAd? appOpenAd;
  static AppOpenAd? appOpenAdSplash;
  static AppOpenAd? appOpenAdIntroPremium;

  static RxFlag isPurchase = RxFlag(false);
  static RxFlag isShowingAd = RxFlag(false);
  static RxFlag isPrivacyOptionsRequired = RxFlag(false);

  /// Common Flag
  static int homeFlag = 0;

  static bool isSDKInitialized = false;

  ///
  static bool showIAMTester = true;
  static String testerPass = "0";
  static String testerEmail = "0";
  static RxFlag isLoggedIn = RxFlag(false);

  ///
  static bool showWeeklyPlan = true;
  static bool showYearlyPlan = true;
  static String showDiscountPrice = "0";
  static String premiumShow = "1";

  static String showIntro = "1";
  static String showRateScreen = "0";

  /// Setting Buttons
  static String showShareBtn = "1";
  static String showRateBtn = "1";
  static String showPrivacyBtn = "1";

  static int useCount = 2;

  /// Native Color
  static String nativeBGColor = "#342F38";
  static String btnTextColor = "#FFFFFF";
  static String headerTextColor = "#FFFFFF";
  static String bodyTextColor = "#FFFFFF";

  static String btnBgColor1 = "#6F34FF";
  static String btnBgColor2 = "#C93EA2";
  static String btnAdTextColor = "#1A1A2F";
  static String btnAdBgColor = "#FFFFFF";

  static String homeFlagOnline = "1"; // 0 = Ad show continue
  static String adShowHomeFlag = "1"; // 1 = show ads | 0 = not show ads
  static String adShowIntroFlag = "1"; // 1 = show ads | 0 = not show ads

  static NativeAd? nativeAdFullScreen;
  static NativeAd? nativeAdHome;
  static NativeAd? nativeAdIntro;

  /// Facebook
  static String facebookId = "11";
  static String facebookToken = "11";

  /// Ads - Android
  static bool sendRevenueToAnalytics = true;

  static String appOpenAds = "11";
  static bool sendRevenueToAnalyticsForAppOpenAds = true;
  static String appOpenSplash = "11";
  static bool sendRevenueToAnalyticsForAppOpenSplash = true;
  static String interSplash = "11";
  static bool sendRevenueToAnalyticsForInterSplash = true;
  static String interPreLoad = "11";
  static bool sendRevenueToAnalyticsForInterPreLoad = true;

  static String nativeHome = "11";
  static bool sendRevenueToAnalyticsForNativeHome = true;
  static String banner = "11";
  static bool sendRevenueToAnalyticsForBanner = true;
  static String nativeFull = "11";
  static bool sendRevenueToAnalyticsForNativeFull = true;

  static String nativeIntroBig = "11";
  static bool sendRevenueToAnalyticsForNativeIntroBig = true;

  static String appOpenIntro = "11";
  static bool sendRevenueToAnalyticsForAppOpenIntro = true;
  static String appOpenPremium = "11";
  static bool sendRevenueToAnalyticsForAppOpenPremium = true;
  static String interIntro = "11";
  static bool sendRevenueToAnalyticsForInterIntro = true;
  static String interPremium = "11";
  static bool sendRevenueToAnalyticsForInterPremium = true;

  static bool showPremiumAdFirstTime = true;
  static bool showPremiumAd = true;

  /// IPTV: called after a purchase. As in IPTV, `banner` is not reset (IPTV `ads_variable.dart:109-127`).
  static void resetAdIds() {
    AdsVariable.appOpenAds = "11";
    AdsVariable.appOpenSplash = "11";

    AdsVariable.appOpenIntro = "11";
    AdsVariable.appOpenPremium = "11";
    AdsVariable.interIntro = "11";
    AdsVariable.interPremium = "11";

    AdsVariable.interSplash = "11";
    AdsVariable.interPreLoad = "11";
    AdsVariable.nativeHome = "11";
    AdsVariable.nativeFull = "11";
    AdsVariable.nativeIntroBig = "11";

    AdsVariable.appOpenAd = null;
    AdsVariable.appOpenAdSplash = null;
    AdsVariable.appOpenAdIntroPremium = null;
  }

  static Future<void> addAdIds() async {
    var prefs = await SharedPreferences.getInstance();
    AdsVariable.appOpenAds = prefs.getString("appOpenAds") ?? "11";
    AdsVariable.appOpenSplash = prefs.getString("appOpenSplash") ?? "11";
    AdsVariable.interSplash = prefs.getString("interSplash") ?? "11";
    AdsVariable.interPreLoad = prefs.getString("interPreLoad") ?? "11";

    AdsVariable.appOpenIntro = prefs.getString("appOpenIntro") ?? "11";
    AdsVariable.appOpenPremium = prefs.getString("appOpenPremium") ?? "11";
    AdsVariable.interIntro = prefs.getString("interIntro") ?? "11";
    AdsVariable.interPremium = prefs.getString("interPremium") ?? "11";

    AdsVariable.nativeHome = prefs.getString("nativeHome") ?? "11";
    AdsVariable.nativeFull = prefs.getString("nativeFull") ?? "11";
    // F2: IPTV reads "nativeBig" here (ads_variable.dart:143), a key nothing writes; "nativeIntroBig" is the stored one.
    AdsVariable.nativeIntroBig = prefs.getString("nativeIntroBig") ?? "11";
  }
}
