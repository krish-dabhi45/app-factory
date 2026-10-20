import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';

/// GDPR / UMP consent, phir MobileAds initialize. Splash me ads load karne se pehle call karo.
/// (Demo app ke gdpr_initialized.dart wala hi flow, chhota kiya hua.)
/// `canRequestAds()` false ho (consent nahi mila / pata nahi) to SDK init nahi hota aur
/// `AdFlags.adsReady` false rehta hai: is session me koi ad request nahi.
class AdsConsent {
  AdsConsent._();

  static Future<void> init() async {
    final done = Completer<void>();
    ConsentInformation.instance.requestConsentInfoUpdate(
      ConsentRequestParameters(),
      () async {
        if (await ConsentInformation.instance.isConsentFormAvailable()) {
          ConsentForm.loadAndShowConsentFormIfRequired((_) => done.complete());
        } else {
          done.complete();
        }
      },
      (_) => done.complete(),
    );
    await done.future;
    if (!await ConsentInformation.instance.canRequestAds()) {
      debugPrint('AdsConsent: canRequestAds = false, no ads this session');
      return;
    }
    await MobileAds.instance.initialize();
    AdFlags.adsReady = true;
  }

  /// Settings screen me "Privacy options" button ke liye.
  static Future<bool> get isPrivacyOptionsRequired async =>
      await ConsentInformation.instance.getPrivacyOptionsRequirementStatus() ==
      PrivacyOptionsRequirementStatus.required;

  static void showPrivacyOptions() => ConsentForm.showPrivacyOptionsForm((_) {});
}
