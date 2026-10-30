import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AdsVariable {
  static bool? isFirstTimeVisited;
  static bool? isFirstTimePurchased;
  static bool? isFirstInfo;

  static AppOpenAd? appOpenAd;
  static AppOpenAd? appOpenAdSplash;
  static AppOpenAd? appOpenAdIntroPremium;

  static RxBool isPurchase = false.obs;
  static RxBool isShowingAd = false.obs;
  static RxBool isPrivacyOptionsRequired = false.obs;

  /// Common Flag
  static int homeFlag = 0;

  static bool isSDKInitialized = false;

  ///
  static bool showIAMTester = true;
  static String testerPass = "0";
  static String testerEmail = "0";
  static RxBool isLoggedIn = false.obs;

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

  static String apiCookie = "";

  /// APIs & Key

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
  static String adShowRewardFlag = "1"; // 1 = show ads | 0 = not show ads

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
  static String collapsibleBanner = "11";
  static bool sendRevenueToAnalyticsForCollapsibleBanner = true;
  static String nativeFull = "11";
  static bool sendRevenueToAnalyticsForNativeFull = true;

  static String rewardAdId = "11";
  static bool sendRevenueToAnalyticsForRewardAdId = true;

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
    AdsVariable.nativeIntroBig = prefs.getString("nativeBig") ?? "11";
  }
}
