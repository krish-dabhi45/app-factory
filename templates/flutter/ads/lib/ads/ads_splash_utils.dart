import 'dart:async';
import 'dart:convert';

import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/services.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'ads_variable.dart';
import 'app_connectivity.dart';
import 'app_open_ad.dart';
import 'app_variable.dart';
import 'life_cycle.dart';

/// IPTV_two `lib/ads/ads_splash_utils.dart`. IPTV's own lines are kept as they are (the SharedPreferences read
/// at launch, every Remote Config key with its default and its SharedPreferences copy, Facebook, GDPR / ATT, MobileAds).
/// Changed, each marked below:
///  - the Remote Config parameter is [remoteConfigKey] (IPTV: "iptv_n_v1"); app-factory writes `<pubspec name>_v1`;
///  - F4: Facebook, consent + MobileAds and the purchase check run after the Firebase part, not inside its `try`
///    (IPTV `ads_splash_utils.dart:99-288`: with no Firebase files they never ran);
///  - A2: Remote Config not readable on a launch that never stored ids → [bundledConfig] (IPTV's `config.json`);
///  - RevenueCat (IPTV `configureSDK`, `premiumInit`, `fetchPurchaseN`'s restore) is the app's premium code, called
///    through [fetchPurchase];
///  - not ported (IPTV app features, not ads): `mapBoxKey`, `googleMapKey`.
class AdsSplashUtils {
  static const remoteConfigKey = "common_flow_demo_v1";

  /// IPTV's `config.json` in the app's assets: the value to publish as [remoteConfigKey], and what the app uses until
  /// Remote Config can be read (A2).
  static const bundledConfig = "assets/ads/config.json";

  /// Sets [AdsVariable.isPurchase] from the store (IPTV `fetchPurchaseN`). null = the app has no paid tier.
  static Future<void> Function()? fetchPurchase;

  late SharedPreferences prefs;

  Future<void> getOnlineIds(Function() navigateScreen) async {
    prefs = await SharedPreferences.getInstance();

    /// Ads Color and Flags
    AdsVariable.nativeBGColor = prefs.getString("nativeBGColor") ?? "1A1A1A";
    AdsVariable.btnTextColor = prefs.getString("btnTextColor") ?? "FFFFFF";
    AdsVariable.headerTextColor = prefs.getString("headerTextColor") ?? "FFFFFF";
    AdsVariable.bodyTextColor = prefs.getString("bodyTextColor") ?? "FFFFFF";
    AdsVariable.btnBgColor1 = prefs.getString("btnBgColor1") ?? "000000";
    AdsVariable.btnBgColor2 = prefs.getString("btnBgColor2") ?? "000000";
    AdsVariable.btnAdTextColor = prefs.getString("btnAdTextColor") ?? "000000";
    AdsVariable.btnAdBgColor = prefs.getString("btnAdBgColor") ?? "000000";

    AdsVariable.adShowHomeFlag = prefs.getString("adShowHomeFlag") ?? "1";
    AdsVariable.homeFlagOnline = prefs.getString("homeFlagOnline") ?? "1";
    AdsVariable.adShowIntroFlag = prefs.getString("adShowIntroFlag") ?? "1";

    AdsVariable.showWeeklyPlan = prefs.getBool("showWeeklyPlan") ?? true;
    AdsVariable.showYearlyPlan = prefs.getBool("showYearlyPlan") ?? true;
    AdsVariable.showDiscountPrice = prefs.getString("showDiscountPrice") ?? "1";
    AdsVariable.premiumShow = prefs.getString("premiumShow") ?? "0";

    AdsVariable.showIntro = prefs.getString("showIntro") ?? "1";
    // AdsVariable.showRateScreen = prefs.getString("showRateScreen") ?? "1";

    AdsVariable.showShareBtn = prefs.getString("showShareBtn") ?? "1";
    AdsVariable.showRateBtn = prefs.getString("showRateBtn") ?? "1";
    AdsVariable.showPrivacyBtn = prefs.getString("showPrivacyBtn") ?? "1";


    AdsVariable.useCount = prefs.getInt("useCount") ?? 1;

    AdsVariable.showIAMTester = prefs.getBool("showIAMTester") ?? false;
    AdsVariable.testerPass = prefs.getString("testerPass") ?? "0";
    AdsVariable.testerEmail = prefs.getString("testerEmail") ?? "0";

    /// Android
    AdsVariable.sendRevenueToAnalytics = prefs.getBool("sendRevenueToAnalytics") ?? true;

    AdsVariable.appOpenAds = prefs.getString("appOpenAds") ?? "11";
    AdsVariable.appOpenSplash = prefs.getString("appOpenSplash") ?? "11";
    AdsVariable.interSplash = prefs.getString("interSplash") ?? "11";
    AdsVariable.interPreLoad = prefs.getString("interPreLoad") ?? "11";

    AdsVariable.sendRevenueToAnalyticsForAppOpenAds = prefs.getBool("sendRevenueToAnalyticsForAppOpenAds") ?? true;
    AdsVariable.sendRevenueToAnalyticsForAppOpenSplash = prefs.getBool("sendRevenueToAnalyticsForAppOpenSplash") ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterSplash = prefs.getBool("sendRevenueToAnalyticsForInterSplash") ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterPreLoad = prefs.getBool("sendRevenueToAnalyticsForInterPreLoad") ?? true;

    AdsVariable.nativeHome = prefs.getString("nativeHome") ?? "11";
    AdsVariable.nativeFull = prefs.getString("nativeFull") ?? "11";
    AdsVariable.nativeIntroBig = prefs.getString("nativeIntroBig") ?? "11";
    AdsVariable.banner = prefs.getString("banner") ?? "11";

    AdsVariable.sendRevenueToAnalyticsForNativeHome = prefs.getBool("sendRevenueToAnalyticsForNativeHome") ?? true;
    AdsVariable.sendRevenueToAnalyticsForBanner = prefs.getBool("sendRevenueToAnalyticsForBanner") ?? true;
    AdsVariable.sendRevenueToAnalyticsForNativeFull = prefs.getBool("sendRevenueToAnalyticsForNativeFull") ?? true;
    AdsVariable.sendRevenueToAnalyticsForNativeIntroBig = prefs.getBool("sendRevenueToAnalyticsForNativeIntroBig") ?? true;

    AdsVariable.appOpenIntro = prefs.getString("appOpenIntro") ?? "11";
    AdsVariable.appOpenPremium = prefs.getString("appOpenPremium") ?? "11";
    AdsVariable.interIntro = prefs.getString("interIntro") ?? "11";
    AdsVariable.interPremium = prefs.getString("interPremium") ?? "11";

    AdsVariable.sendRevenueToAnalyticsForAppOpenIntro = prefs.getBool("sendRevenueToAnalyticsForAppOpenIntro") ?? true;
    AdsVariable.sendRevenueToAnalyticsForAppOpenPremium = prefs.getBool("sendRevenueToAnalyticsForAppOpenPremium") ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterIntro = prefs.getBool("sendRevenueToAnalyticsForInterIntro") ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterPremium = prefs.getBool("sendRevenueToAnalyticsForInterPremium") ?? true;

    if (await checkConnectivity()) {
      try {
        await Firebase.initializeApp().then((value) {
          showLog("Firebase Initialized");
        });

        await FirebaseAnalytics.instance.setAnalyticsCollectionEnabled(true);
        await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(true);

        final remoteConfig = FirebaseRemoteConfig.instance;
        await remoteConfig.setConfigSettings(RemoteConfigSettings(fetchTimeout: const Duration(minutes: 1), minimumFetchInterval: const Duration(minutes: 5)));
        await remoteConfig.fetchAndActivate();
        Map<String, dynamic> mapValues1 = jsonDecode(remoteConfig.getValue(remoteConfigKey).asString());
        showLog("-----call 1------");
        showLog(mapValues1.toString());
        showLog("-----call 2------");
        setOnlineIds(mapValues1);
      } on PlatformException catch (exception) {
        showLog(exception.toString());
        await _bundledIfNothingStored();
      } catch (exception) {
        showLog(exception.toString());
        await _bundledIfNothingStored();
      }

      /// Facebook id setup
      setupFbAdsId();
      showLog("log 8---");

      /// GDPR Consent form init
      await initializeGDPR();
      showLog("log 9---");

      await fetchPurchaseN();

      showLog("log 10---");
    } else {
      Future.delayed(const Duration(seconds: 4)).then((value) {
        navigateScreen();
      });
    }
  }

  /// IPTV `ads_splash_utils.dart:116-271`: every key into AdsVariable and into SharedPreferences.
  void setOnlineIds(Map<String, dynamic> mapValues1) {
    /// Facebook id setup
    AdsVariable.facebookId = mapValues1["facebookId"].toString();
    AdsVariable.facebookToken = mapValues1["facebookToken"].toString();

    /// Native color set from firebase
    AdsVariable.nativeBGColor = mapValues1["nativeBGColor"] ?? "1A1A1A";
    AdsVariable.btnTextColor = mapValues1["btnTextColor"] ?? "FFFFFF";
    AdsVariable.headerTextColor = mapValues1["headerTextColor"] ?? "FFFFFF";
    AdsVariable.bodyTextColor = mapValues1["bodyTextColor"] ?? "FFFFFF";
    AdsVariable.btnBgColor1 = mapValues1["btnBgColor1"] ?? "000000";
    AdsVariable.btnBgColor2 = mapValues1["btnBgColor2"] ?? "000000";
    AdsVariable.btnAdBgColor = mapValues1["btnAdBgColor"] ?? "000000";
    AdsVariable.btnAdTextColor = mapValues1["btnAdTextColor"] ?? "000000";

    AdsVariable.showWeeklyPlan = mapValues1["showWeeklyPlan"] ?? true;
    AdsVariable.showYearlyPlan = mapValues1["showYearlyPlan"] ?? true;
    AdsVariable.showDiscountPrice = mapValues1["showDiscountPrice"] ?? "1";
    AdsVariable.premiumShow = mapValues1["premiumShow"] ?? "0";

    AdsVariable.showIntro = mapValues1["showIntro"] ?? "1";
    // AdsVariable.showRateScreen = mapValues1["showRateScreen"] ?? "1";

    AdsVariable.showShareBtn = mapValues1["showShareBtn"] ?? "1";
    AdsVariable.showRateBtn = mapValues1["showRateBtn"] ?? "1";
    AdsVariable.showPrivacyBtn = mapValues1["showPrivacyBtn"] ?? "1";


    AdsVariable.useCount = mapValues1["useCount"] ?? 1;

    AdsVariable.showIAMTester = mapValues1["showIAMTester"] ?? false;
    AdsVariable.testerPass = mapValues1["testerPass"] ?? "0";
    AdsVariable.testerEmail = mapValues1["testerEmail"] ?? "0";

    showLog("log 1---");

    /// Ads flag
    ///  /// Ads flag
    AdsVariable.homeFlagOnline = mapValues1["homeFlagOnline"] ?? "1";
    AdsVariable.adShowHomeFlag = mapValues1["adShowHomeFlag"] ?? "1";
    AdsVariable.adShowIntroFlag = mapValues1["adShowIntroFlag"] ?? "1";
    showLog("log 2---");

    /// Ads id setup Android
    AdsVariable.sendRevenueToAnalytics = mapValues1["sendRevenueToAnalytics"] ?? true;

    AdsVariable.appOpenAds = mapValues1["appOpenAds"] ?? "11";
    AdsVariable.appOpenSplash = mapValues1["appOpenSplash"] ?? "11";
    AdsVariable.interSplash = mapValues1["interSplash"] ?? "11";
    AdsVariable.interPreLoad = mapValues1["interPreLoad"] ?? "11";

    AdsVariable.sendRevenueToAnalyticsForAppOpenAds = mapValues1["sendRevenueToAnalyticsForAppOpenAds"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForAppOpenSplash = mapValues1["sendRevenueToAnalyticsForAppOpenSplash"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterSplash = mapValues1["sendRevenueToAnalyticsForInterSplash"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterPreLoad = mapValues1["sendRevenueToAnalyticsForInterPreLoad"] ?? true;

    AdsVariable.nativeHome = mapValues1["nativeHome"] ?? "11";
    AdsVariable.nativeFull = mapValues1["nativeFull"] ?? "11";
    AdsVariable.nativeIntroBig = mapValues1["nativeIntroBig"] ?? "11";
    AdsVariable.banner = mapValues1["banner"] ?? "11";

    AdsVariable.sendRevenueToAnalyticsForNativeHome = mapValues1["sendRevenueToAnalyticsForNativeHome"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForBanner = mapValues1["sendRevenueToAnalyticsForBanner"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForNativeFull = mapValues1["sendRevenueToAnalyticsForNativeFull"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForNativeIntroBig = mapValues1["sendRevenueToAnalyticsForNativeIntroBig"] ?? true;

    AdsVariable.appOpenIntro = mapValues1["appOpenIntro"] ?? "11";
    AdsVariable.appOpenPremium = mapValues1["appOpenPremium"] ?? "11";
    AdsVariable.interIntro = mapValues1["interIntro"] ?? "11";
    AdsVariable.interPremium = mapValues1["interPremium"] ?? "11";

    AdsVariable.sendRevenueToAnalyticsForAppOpenIntro = mapValues1["sendRevenueToAnalyticsForAppOpenIntro"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForAppOpenPremium = mapValues1["sendRevenueToAnalyticsForAppOpenPremium"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterIntro = mapValues1["sendRevenueToAnalyticsForInterIntro"] ?? true;
    AdsVariable.sendRevenueToAnalyticsForInterPremium = mapValues1["sendRevenueToAnalyticsForInterPremium"] ?? true;

    showLog("===>${AdsVariable.nativeHome}");
    showLog("log 3---");

    /// Store firebase remote config data into shared preferences :
    prefs.setString("facebookId", mapValues1["facebookId"].toString());
    prefs.setString("facebookToken", mapValues1["facebookToken"].toString());
    showLog("log 4---");

    prefs.setString("nativeBGColor", mapValues1["nativeBGColor"].toString());
    prefs.setString("btnTextColor", mapValues1["btnTextColor"].toString());
    prefs.setString("headerTextColor", mapValues1["headerTextColor"].toString());
    prefs.setString("bodyTextColor", mapValues1["bodyTextColor"].toString());
    prefs.setString("btnBgColor1", mapValues1["btnBgColor1"].toString());
    prefs.setString("btnBgColor2", mapValues1["btnBgColor2"].toString());
    prefs.setString("btnAdBgColor", mapValues1["btnAdBgColor"].toString());
    prefs.setString("btnAdTextColor", mapValues1["btnAdTextColor"].toString());
    prefs.setString("discountShow", mapValues1["discountShow"].toString());
    showLog("log 4.1---");

    prefs.setBool("showIAMTester", mapValues1["showIAMTester"] ?? false);
    prefs.setString("testerPass", mapValues1["testerPass"].toString());
    prefs.setString("testerEmail", mapValues1["testerEmail"].toString());

    prefs.setBool("showWeeklyPlan", mapValues1["showWeeklyPlan"] ?? true);
    prefs.setBool("showYearlyPlan", mapValues1["showYearlyPlan"] ?? true);
    prefs.setString("showDiscountPrice", mapValues1["showDiscountPrice"] ?? "1");
    prefs.setString("premiumShow", mapValues1["premiumShow"].toString());
    showLog("log 4.2---");

    prefs.setString("showIntro", mapValues1["showIntro"] ?? "1");
    prefs.setString("showShareBtn", mapValues1["showShareBtn"] ?? "1");
    prefs.setString("showRateBtn", mapValues1["showRateBtn"] ?? "1");
    prefs.setString("showPrivacyBtn", mapValues1["showPrivacyBtn"] ?? "1");

    showLog("log 4.3---");

    prefs.setInt("useCount", mapValues1["useCount"] ?? 1);

    showLog("log 5---");

    prefs.setBool("sendRevenueToAnalytics", mapValues1["sendRevenueToAnalytics"] ?? true);

    prefs.setString("appOpenAds", mapValues1["appOpenAds"] ?? "11");
    prefs.setString("appOpenSplash", mapValues1["appOpenSplash"] ?? "11");
    prefs.setString("interSplash", mapValues1["interSplash"] ?? "11");
    prefs.setString("interPreLoad", mapValues1["interPreLoad"] ?? "11");

    prefs.setBool("sendRevenueToAnalyticsForAppOpenAds", mapValues1["sendRevenueToAnalyticsForAppOpenAds"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForAppOpenSplash", mapValues1["sendRevenueToAnalyticsForAppOpenSplash"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForInterSplash", mapValues1["sendRevenueToAnalyticsForInterSplash"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForInterPreLoad", mapValues1["sendRevenueToAnalyticsForInterPreLoad"] ?? true);

    prefs.setString("nativeHome", mapValues1["nativeHome"] ?? "11");
    prefs.setString("nativeFull", mapValues1["nativeFull"] ?? "11");
    prefs.setString("nativeIntroBig", mapValues1["nativeIntroBig"] ?? "11");
    prefs.setString("banner", mapValues1["banner"] ?? "11");

    prefs.setBool("sendRevenueToAnalyticsForNativeHome", mapValues1["sendRevenueToAnalyticsForNativeHome"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForBanner", mapValues1["sendRevenueToAnalyticsForBanner"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForNativeFull", mapValues1["sendRevenueToAnalyticsForNativeFull"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForNativeIntroBig", mapValues1["sendRevenueToAnalyticsForNativeIntroBig"] ?? true);

    prefs.setString("appOpenIntro", mapValues1["appOpenIntro"] ?? "11");
    prefs.setString("appOpenPremium", mapValues1["appOpenPremium"] ?? "11");
    prefs.setString("interIntro", mapValues1["interIntro"] ?? "11");
    prefs.setString("interPremium", mapValues1["interPremium"] ?? "11");

    prefs.setBool("sendRevenueToAnalyticsForAppOpenIntro", mapValues1["sendRevenueToAnalyticsForAppOpenIntro"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForAppOpenPremium", mapValues1["sendRevenueToAnalyticsForAppOpenPremium"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForInterIntro", mapValues1["sendRevenueToAnalyticsForInterIntro"] ?? true);
    prefs.setBool("sendRevenueToAnalyticsForInterPremium", mapValues1["sendRevenueToAnalyticsForInterPremium"] ?? true);

    prefs.setString("adShowHomeFlag", mapValues1["adShowHomeFlag"] ?? "1");
    prefs.setString("homeFlagOnline", mapValues1["homeFlagOnline"] ?? "1");
    prefs.setString("adShowIntroFlag", mapValues1["adShowIntroFlag"] ?? "1");

    showLog("log 7---");
  }

  /// A2: Remote Config could not be read (no Firebase files, the parameter not published) and no launch stored ids yet.
  Future<void> _bundledIfNothingStored() async {
    if (prefs.containsKey("appOpenAds")) return;
    showLog("Remote Config not available: $bundledConfig");
    setOnlineIds(jsonDecode(await rootBundle.loadString(bundledConfig)) as Map<String, dynamic>);
  }

  late AppLifecycleReactor appLifecycleReactor;

  Future<void> loadAppOpenAd() async {
    showLog("Load from BG...");
    AppOpenAdManager appOpenAdManager = AppOpenAdManager()..loadAd(AdsVariable.appOpenAds);
    appLifecycleReactor = AppLifecycleReactor(appOpenAdManager: appOpenAdManager);
    AppLifecycleReactor(appOpenAdManager: appOpenAdManager).listenToAppStateChanges();
  }

  Future<void> loadAppLifecycleReactor() async {
    showLog("Load from BG...");
    AppOpenAdManager appOpenAdManager = AppOpenAdManager();
    appLifecycleReactor = AppLifecycleReactor(appOpenAdManager: appOpenAdManager);
    AppLifecycleReactor(appOpenAdManager: appOpenAdManager).listenToAppStateChanges();
  }

  /// IPTV `fetchPurchaseN` (ads_splash_utils.dart:312-333): the store check is [fetchPurchase]; then as IPTV.
  Future<void> fetchPurchaseN() async {
    try {
      await fetchPurchase?.call();
      if (AdsVariable.isPurchase.value) {
        AdsVariable.resetAdIds();
        AdsVariable.isPurchase.value = true;
      }
    } catch (e) {
      showLog("PURCHASE_ERROR >> ${e.toString()}");
    }
  }
}

void setupFbAdsId() {
  showLog("Call 1");
  const platformMethodChannel = MethodChannel('nativeChannel');
  showLog("Call 2");
  showLog("Call 2------>${AdsVariable.btnBgColor1}");
  platformMethodChannel.invokeMethod('setToast', {
    'isPurchase': AdsVariable.isPurchase.toString(),
    'facebookId': AdsVariable.facebookId,
    'facebookToken': AdsVariable.facebookToken,
    'nativeBGColor': AdsVariable.nativeBGColor,
    'btnBgColor': AdsVariable.btnBgColor1,
    'btnBgColor1': AdsVariable.btnBgColor1,
    'btnBgColor2': AdsVariable.btnBgColor2,
    'btnAdBgColor': AdsVariable.btnAdBgColor,
    'btnTextColor': AdsVariable.btnTextColor,
    'btnAdTextColor': AdsVariable.btnAdTextColor,
    'headerTextColor': AdsVariable.headerTextColor,
    'bodyTextColor': AdsVariable.bodyTextColor,
  });
  showLog("Call 3");
}

/// GDPR Implementation methods : initializeGDPR, changePrivacyPreferences, loadConsentForm, initializeMobileAds
Future<FormError?> initializeGDPR() async {
  final completer = Completer<FormError?>();
  final params = ConsentRequestParameters(
    // consentDebugSettings: ConsentDebugSettings(debugGeography: DebugGeography.debugGeographyEea, testIdentifiers: ['1D1F38988F68A750C4E81465BAA4D7FB']),
  );
  ConsentInformation.instance.requestConsentInfoUpdate(
    params,
    () async {
      if (await isPrivacyOptionsStatus()) {
        await loadConsentForm();
      } else {
        await initializeWithOutGDPR();
      }
      completer.complete();
    },
    (error) {
      completer.complete(error);
    },
  );

  return completer.future;
}

Future<TrackingStatus> initializeWithOutGDPR() async {
  final completer = Completer<TrackingStatus>();
  AppTrackingTransparency.requestTrackingAuthorization().then((value) async {
    final status = await AppTrackingTransparency.trackingAuthorizationStatus;
    if (status == TrackingStatus.authorized) {
      showLog("GDPR: TrackingStatus.required");
      await initializeMobileAds();
      completer.complete(TrackingStatus.authorized);
    } else {
      showLog("GDPR: TrackingStatus Not Required");
      await initializeMobileAds();
      completer.complete(TrackingStatus.denied);
    }
  });
  return completer.future;
}

void showPrivacyOptionsForm(OnConsentFormDismissedListener onConsentFormDismissedListener) {
  ConsentForm.showPrivacyOptionsForm(onConsentFormDismissedListener);
}

Future<FormError?> loadConsentForm() async {
  final completer = Completer<FormError?>();

  ConsentForm.loadConsentForm(
    (consentForm) async {
      final status = await ConsentInformation.instance.getConsentStatus();
      if (status == ConsentStatus.required) {
        consentForm.show((formError) {
          completer.complete(loadConsentForm());
        });
      } else {
        await initializeMobileAds();
        completer.complete();
      }
    },
    (FormError? error) {
      completer.complete(error);
    },
  );

  return completer.future;
}

Future<void> initializeMobileAds() async {
  if (await isPrivacyOptionsStatus()) {
    AdsVariable.isPrivacyOptionsRequired.value = true;
  } else {
    AdsVariable.isPrivacyOptionsRequired.value = false;
  }
  await MobileAds.instance.initialize();
}

Future<bool> isPrivacyOptionsStatus() async {
  return await ConsentInformation.instance.getPrivacyOptionsRequirementStatus() == PrivacyOptionsRequirementStatus.required;
}
