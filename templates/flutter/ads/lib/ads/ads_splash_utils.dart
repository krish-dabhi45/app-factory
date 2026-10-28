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

/// IPTV_two `lib/ads/ads_splash_utils.dart`: the launch order (stored values, Firebase, Remote Config, Facebook +
/// native ad factories, GDPR / ATT, MobileAds, the purchase check) as IPTV runs it. Changed, each marked below:
///  - the values are the app's own keys (remote_config.json, the value published as [remoteConfigKey]), read and stored by the generated
///    [AdsVariable.readStored] / [AdsVariable.setOnlineIds] (IPTV wrote each of its own keys out here, `:32-97`, `:116-271`);
///  - the Remote Config parameter is [remoteConfigKey] (IPTV: "iptv_n_v1"); app-factory writes `<pubspec name>_v1`;
///  - F4: Facebook, consent + MobileAds and the purchase check run after the Firebase part, not inside its `try`
///    (IPTV `ads_splash_utils.dart:99-288`: with no Firebase files they never ran);
///  - the store check (IPTV `configureSDK`, `premiumInit`, `fetchPurchaseN`'s restore) is the app's, through [fetchPurchase];
///  - the app open id of [loadAppOpenAd] / [loadAppLifecycleReactor] is the app's (IPTV: `AdsVariable.appOpenAds`).
class AdsSplashUtils {
  static const remoteConfigKey = "common_flow_demo_v1";

  /// Sets [AdsVariable.isPurchase] from the store (IPTV `fetchPurchaseN`). null = the app has no paid tier.
  static Future<void> Function()? fetchPurchase;

  late SharedPreferences prefs;

  Future<void> getOnlineIds(Function() navigateScreen) async {
    prefs = await SharedPreferences.getInstance();

    /// The values the last online launch stored (IPTV read each of its keys here)
    AdsVariable.readStored(prefs);

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
      } catch (exception) {
        showLog(exception.toString());
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
    AdsVariable.setOnlineIds(mapValues1, prefs);
    showLog("log 7---");
  }

  late AppLifecycleReactor appLifecycleReactor;

  Future<void> loadAppOpenAd(String adUnitId) async {
    showLog("Load from BG...");
    AppOpenAdManager appOpenAdManager = AppOpenAdManager()..loadAd(adUnitId);
    appLifecycleReactor = AppLifecycleReactor(appOpenAdManager: appOpenAdManager, adUnitId: adUnitId);
    AppLifecycleReactor(appOpenAdManager: appOpenAdManager, adUnitId: adUnitId).listenToAppStateChanges();
  }

  /// [adUnitId]: the app's resume app open id.
  Future<void> loadAppLifecycleReactor(String adUnitId) async {
    showLog("Load from BG...");
    AppOpenAdManager appOpenAdManager = AppOpenAdManager();
    appLifecycleReactor = AppLifecycleReactor(appOpenAdManager: appOpenAdManager, adUnitId: adUnitId);
    AppLifecycleReactor(appOpenAdManager: appOpenAdManager, adUnitId: adUnitId).listenToAppStateChanges();
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

/// IPTV `setupFbAdsId`: the native ad factories' colours and Facebook's id/token to MainActivity ("nativeChannel" →
/// "setToast", which registers the factories). The values are the app's ([AdsVariable.nativeChannelArgs]); an app with
/// no native ad keys sends nothing.
void setupFbAdsId() {
  final args = AdsVariable.nativeChannelArgs();
  if (args == null) return;
  const platformMethodChannel = MethodChannel('nativeChannel');
  showLog("Call 2------>${args['btnBgColor1']}");
  platformMethodChannel.invokeMethod('setToast', args);
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
