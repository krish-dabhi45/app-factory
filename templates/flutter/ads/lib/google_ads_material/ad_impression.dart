import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ads_id.dart';

/// Har ad ki paid event (revenue) Firebase Analytics me `ad_impression` event se bhejna.
/// COMPULSORY: sabhi ads (interstitial, app open, banner, native, rewarded) me laga hai.
/// Online flag `send_revenue_to_analytics` == "0" ho to nahi bhejta.
class AdImpression {
  AdImpression._();

  /// Full screen ads ke liye: load hote hi `AdImpression.attach(ad, 'interstitial')`.
  static void attach(dynamic ad, String format) {
    // InterstitialAd / AppOpenAd / RewardedAd sab me `onPaidEvent` setter hai.
    ad.onPaidEvent = (Ad a, double valueMicros, PrecisionType precision, String currency) =>
        log(a, valueMicros, precision, currency, format: format);
  }

  /// Banner / native listener me `onPaidEvent: AdImpression.listener('banner')`.
  static OnPaidEventCallback listener(String format) =>
      (Ad a, double valueMicros, PrecisionType precision, String currency) =>
          log(a, valueMicros, precision, currency, format: format);

  static Future<void> log(
    Ad ad,
    double valueMicros,
    PrecisionType precision,
    String? currency, {
    required String format,
  }) async {
    try {
      if (!AdsId.isOn('send_revenue_to_analytics', '1')) return;
      if (Firebase.apps.isEmpty) return; // Firebase configure nahi hai
      final revenue = valueMicros / 1000000.0;
      if (kDebugMode) debugPrint('ad_impression: $format $revenue ${currency ?? 'USD'}');
      await FirebaseAnalytics.instance.logEvent(
        name: 'ad_impression',
        parameters: {
          'ad_platform': 'Google AdMob',
          'ad_format': format,
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
