import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/in_app_purchase/constant.dart';
import 'package:ai_ppt_generater/in_app_purchase/store_config.dart';
import 'package:ai_ppt_generater/service/app_connectivity.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AdsSplashUtils {
  late SharedPreferences prefs;

  getOnlineIds(Function() navigateScreen) async {
    prefs = await SharedPreferences.getInstance();

    configureSDK(); //----change----
    premiumInit(); //----change----

    /// Facebook id setup

    /// Ads Color and Flags

    AdsVariable.showWeeklyPlan = prefs.getBool("showWeeklyPlan") ?? true;
    AdsVariable.showYearlyPlan = prefs.getBool("showYearlyPlan") ?? true;
    AdsVariable.showDiscountPrice = prefs.getString("showDiscountPrice") ?? "1";
    AdsVariable.premiumShow = prefs.getString("premiumShow") ?? "0";

    AdsVariable.showIntro = prefs.getString("showIntro") ?? "1";

    AdsVariable.showShareBtn = prefs.getString("showShareBtn") ?? "1";
    AdsVariable.showRateBtn = prefs.getString("showRateBtn") ?? "1";
    AdsVariable.showPrivacyBtn = prefs.getString("showPrivacyBtn") ?? "1";

    AdsVariable.apiCookie = prefs.getString("apiCookie") ?? "";

    AdsVariable.useCount = prefs.getInt("useCount") ?? 1;

    AdsVariable.showIAMTester = prefs.getBool("showIAMTester") ?? false;
    AdsVariable.testerPass = prefs.getString("testerPass") ?? "0";
    AdsVariable.testerEmail = prefs.getString("testerEmail") ?? "0";

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
        Map<String, dynamic> mapValues1 = jsonDecode(remoteConfig.getValue("ai_ppt_maker_v1").asString());
        showLog("-----call 1------");
        showLog(mapValues1.toString());
        showLog("-----call 2------");

        /// Facebook id setup

        /// Native color set from firebase

        AdsVariable.showWeeklyPlan = mapValues1["showWeeklyPlan"] ?? true;
        AdsVariable.showYearlyPlan = mapValues1["showYearlyPlan"] ?? true;
        AdsVariable.showDiscountPrice = mapValues1["showDiscountPrice"] ?? "1";
        AdsVariable.premiumShow = mapValues1["premiumShow"] ?? "0";

        AdsVariable.showIntro = mapValues1["showIntro"] ?? "1";
        // AdsVariable.showRateScreen = mapValues1["showRateScreen"] ?? "1";

        AdsVariable.showShareBtn = mapValues1["showShareBtn"] ?? "1";
        AdsVariable.showRateBtn = mapValues1["showRateBtn"] ?? "1";
        AdsVariable.showPrivacyBtn = mapValues1["showPrivacyBtn"] ?? "1";

        AdsVariable.apiCookie = mapValues1["apiCookie"] ?? "";

        AdsVariable.useCount = mapValues1["useCount"] ?? 1;

        AdsVariable.showIAMTester = mapValues1["showIAMTester"] ?? false;
        AdsVariable.testerPass = mapValues1["testerPass"] ?? "0";
        AdsVariable.testerEmail = mapValues1["testerEmail"] ?? "0";

        showLog("log 1---");

        /// Ads flag
        showLog("log 2---");

        showLog("log 3---");

        /// Store firebase remote config data into shared preferences :

        showLog("log 4---");

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

        prefs.setString("apiCookie", mapValues1["apiCookie"] ?? "");
        showLog("log 4.3---");

        prefs.setInt("useCount", mapValues1["useCount"] ?? 1);

        showLog("log 5---");

        showLog("log 7---");

        /// Facebook id setup

        showLog("log 8---");

        /// GDPR Consent form init
        showLog("log 9---");

        await fetchPurchaseN(); //---change-----

        showLog("log 10---");
      } on PlatformException catch (exception) {
        showLog(exception.toString());
      } catch (exception) {
        showLog(exception.toString());
      }
    } else {
      Future.delayed(const Duration(seconds: 4)).then((value) {
        navigateScreen();
      });
    }
  }

  fetchPurchaseN() async {
    try {
      final customerInfo1 = await Purchases.restorePurchases();
      if (customerInfo1.entitlements.active.isNotEmpty) {
        showLog("--****----${customerInfo1.entitlements.active}--");
      } else {
        showLog("--****--false----");
      }
      CustomerInfo customerInfo = await Purchases.getCustomerInfo();
      if (customerInfo.activeSubscriptions.toString().contains("week") || customerInfo.activeSubscriptions.toString().contains("year")) {
        AdsVariable.isPurchase.value = true;
      } else {
        AdsVariable.isPurchase.value = false;
      }
      if (AdsVariable.isPurchase.value) {
        AdsVariable.isPurchase.value = true;
      }
    } catch (e) {
      showLog("PURCHASE_ERROR >> ${e.toString()}");
    }
  }
}

premiumInit() {
  showLog('==========Premium INIT =============IN');
  if (Platform.isIOS || Platform.isMacOS) {
    StoreConfig(store: Store.appStore, apiKey: appleApiKey);
  } else if (Platform.isAndroid) {
    const useAmazon = bool.fromEnvironment("amazon");
    StoreConfig(store: useAmazon ? Store.amazon : Store.playStore, apiKey: useAmazon ? amazonApiKey : googleApiKey);
  }
  showLog('==========Premium INIT =============OUT');
}

Future<void> configureSDK() async {
  await Purchases.setLogLevel(LogLevel.debug);
  showLog('==========setLogLevel=============');
  PurchasesConfiguration configuration;
  if (StoreConfig.isForAmazonAppstore()) {
    configuration = AmazonConfiguration(StoreConfig.instance.apiKey);
  } else {
    configuration = PurchasesConfiguration(StoreConfig.instance.apiKey);
  }
  configuration.entitlementVerificationMode = EntitlementVerificationMode.informational;
  await Purchases.configure(configuration).then((value) {
    AdsVariable.isSDKInitialized = true;
  });
  await Purchases.enableAdServicesAttributionTokenCollection();
  showLog('==========setLogLevel=============OUT');
}

/// GDPR Implementation methods : initializeGDPR, changePrivacyPreferences, loadConsentForm, initializeMobileAds
