import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'ad_impression.dart';
import 'app_hud.dart';
import 'ads_id.dart';

/// Ek reusable interstitial loader, Remote Config key [key] (jaise "interPreLoad") ki id se.
/// Close hote hi apne aap next ad preload karta hai.
class InterstitialSlot {
  InterstitialSlot(this.key);

  final String key;

  InterstitialAd? _ad;
  bool _loading = false;

  /// Id "11" -> ye ad off: na load, na show.
  bool get isOff => AdsId.isOff(AdsId.unit(key));

  bool get isReady => !isOff && _ad != null;

  Future<bool> preload() async {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady) return false;
    if (_ad != null || _loading) return _ad != null;
    _loading = true;
    _ad = await _load(AdsId.unit(key));
    _loading = false;
    return _ad != null;
  }

  Future<InterstitialAd?> _load(String id) {
    if (AdsId.isOff(id)) return Future.value(null);
    final c = Completer<InterstitialAd?>();
    InterstitialAd.load(
      adUnitId: id,
      request: const AdRequest(),
      adLoadCallback: InterstitialAdLoadCallback(
        onAdLoaded: (ad) {
          debugPrint('Interstitial loaded ($id)');
          AdImpression.attach(ad, key);
          c.complete(ad);
        },
        onAdFailedToLoad: (e) {
          debugPrint('Interstitial fail ($id): $e');
          c.complete(null);
        },
      ),
    );
    return c.future;
  }

  /// Ad dikhao. Ad close / fail hone par [onDone] call hota hai (navigation yahi karo).
  /// Preloaded ad na ho to "Showing Ads..." loader ke saath abhi load karke dikhata hai
  /// (demo app jaisa), max `AdsId.inAppAdWait` (online `inapp_ad_wait_seconds`, default 5) tak;
  /// usse zyada lage to bina ad [onDone]. [loadIfMissing] false ho to seedha [onDone].
  Future<bool> show({
    required VoidCallback onDone,
    VoidCallback? onShown,
    bool preloadAfter = true,
    bool loadIfMissing = true,
  }) async {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady || AdFlags.isFullScreenAdShowing) {
      onDone();
      return false;
    }
    if (_ad == null && loadIfMissing) {
      AppHud.show(status: 'Showing Ads...');
      await preload().timeout(AdsId.inAppAdWait, onTimeout: () => false);
      AppHud.dismiss();
    }
    final ad = _ad;
    if (ad == null || isOff) {
      onDone();
      if (preloadAfter) preload();
      return false;
    }
    _ad = null;
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (_) {
        AdFlags.isFullScreenAdShowing = true;
        onShown?.call();
      },
      onAdDismissedFullScreenContent: (ad) {
        AdFlags.isFullScreenAdShowing = false;
        ad.dispose();
        onDone();
        if (preloadAfter) preload();
      },
      onAdFailedToShowFullScreenContent: (ad, e) {
        AdFlags.isFullScreenAdShowing = false;
        ad.dispose();
        onDone();
        if (preloadAfter) preload();
      },
    );
    ad.show();
    return true;
  }
}

/// App bhar ke interstitial slots.
class InterstitialAdManager {
  InterstitialAdManager._();

  static final splash = InterstitialSlot('interSplash');

  /// Home / tab taps (AdTapHelper.onHomeTap).
  static final main = InterstitialSlot('interPreLoad');
}
