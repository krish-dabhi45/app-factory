import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ads_id.dart';

/// Har ad ki paid event (revenue) Firebase Analytics me `ad_impression` event se bhejna.
/// COMPULSORY: sabhi ads (interstitial, app open, banner, native, rewarded) me laga hai.
/// [key] = ad ki Remote Config key (jaise "interPreLoad"). Nahi bhejta jab `sendRevenueToAnalytics`
/// ya `sendRevenueToAnalyticsFor<Key>` (jaise sendRevenueToAnalyticsForInterPreLoad) false / "0" ho.
class AdImpression {
  AdImpression._();

  /// Full screen ads ke liye: load hote hi `AdImpression.attach(ad, 'interPreLoad')`.
  static void attach(dynamic ad, String key) {
    // InterstitialAd / AppOpenAd / RewardedAd sab me `onPaidEvent` setter hai.
    ad.onPaidEvent = (Ad a, double valueMicros, PrecisionType precision, String currency) =>
        log(a, valueMicros, precision, currency, key: key);
  }

  /// Banner / native listener me `onPaidEvent: AdImpression.listener('banner')`.
  static OnPaidEventCallback listener(String key) =>
      (Ad a, double valueMicros, PrecisionType precision, String currency) =>
          log(a, valueMicros, precision, currency, key: key);

  static Future<void> log(
    Ad ad,
    double valueMicros,
    PrecisionType precision,
    String? currency, {
    required String key,
  }) async {
    try {
      if (!AdsId.revenueOn(key)) return;
      if (Firebase.apps.isEmpty) return; // Firebase configure nahi hai
      final revenue = valueMicros / 1000000.0;
      if (kDebugMode) debugPrint('ad_impression: $key $revenue ${currency ?? 'USD'}');
      await FirebaseAnalytics.instance.logEvent(
        name: 'ad_impression',
        parameters: {
          'ad_platform': 'Google AdMob',
          'ad_placement': key, // Remote Config key, jaise interPreLoad
          'ad_unit_name': ad.adUnitId,
          'value': revenue,
          'currency': currency ?? 'USD',
          'precision_type': precision.name,
        },
      );
    } catch (e) {
      debugPrint('ad_impression failed: $e');
    }
  }
}
