import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'ad_impression.dart';
import 'ads_id.dart';

/// Optional. Sirf jis app me zarurat ho (unlock feature, extra credits, etc).
class RewardedAdManager {
  RewardedAdManager._();

  static RewardedAd? _ad;
  static bool _loading = false;

  static const key = 'rewarded';

  static bool get isOff => AdsId.isOff(AdsId.unit(key));

  static bool get isReady => !isOff && _ad != null;

  static Future<bool> preload() async {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady || _ad != null || _loading) return _ad != null;
    _loading = true;
    _ad = await _load(AdsId.unit(key));
    _loading = false;
    return _ad != null;
  }

  static Future<RewardedAd?> _load(String id) {
    if (AdsId.isOff(id)) return Future.value(null);
    final c = Completer<RewardedAd?>();
    RewardedAd.load(
      adUnitId: id,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          AdImpression.attach(ad, key);
          c.complete(ad);
        },
        onAdFailedToLoad: (e) {
          debugPrint('Rewarded fail ($id): $e');
          c.complete(null);
        },
      ),
    );
    return c.future;
  }

  /// [onReward] sirf tab call hota hai jab user ne poora ad dekha.
  /// [onClosed] hamesha call hota hai.
  static Future<void> show({required VoidCallback onReward, VoidCallback? onClosed}) async {
    if (_ad == null) await preload();
    final ad = _ad;
    if (ad == null || isOff) {
      onClosed?.call();
      return;
    }
    _ad = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (_) => AdFlags.isFullScreenAdShowing = true,
      onAdDismissedFullScreenContent: (ad) {
        AdFlags.isFullScreenAdShowing = false;
        ad.dispose();
        onClosed?.call();
        preload();
      },
      onAdFailedToShowFullScreenContent: (ad, e) {
        AdFlags.isFullScreenAdShowing = false;
        ad.dispose();
        onClosed?.call();
        preload();
      },
    );
    ad.show(onUserEarnedReward: (_, _) => onReward());
  }
}
