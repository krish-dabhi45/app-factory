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

  /// Ad dikhao. [onDone] ek hi baar call hota hai (navigation yahi karo).
  /// [loader] (home / tab tap, IPTV `onTapInter`): "Loading..." loader fixed `AdsId.inAppAdWait` (default 2 s) tak,
  /// ad preload na ho to isi beech load hota hai; phir ready ho to ad, warna bina ad [onDone].
  /// [loader] false: sirf ready ad (splash, intro).
  /// [openBehind]: [onDone] ad ke impression ke 1 s baad (agli screen ad ke peeche khulti hai, ad band karte hi wahi dikhti hai).
  Future<bool> show({
    required VoidCallback onDone,
    VoidCallback? onShown,
    bool preloadAfter = true,
    bool loader = false,
    bool openBehind = false,
  }) async {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady || AdFlags.isFullScreenAdShowing) {
      onDone();
      return false;
    }
    if (loader) {
      AppHud.show(status: 'Loading...');
      preload();
      await Future<void>.delayed(AdsId.inAppAdWait);
      AppHud.dismiss();
    }
    final ad = _ad;
    if (ad == null || isOff) {
      onDone();
      if (preloadAfter) preload();
      return false;
    }
    _ad = null;
    ad.fullScreenContentCallback =
        fullScreenCallback(onDone: onDone, onShown: onShown, openBehind: openBehind, after: preloadAfter ? preload : null);
    ad.show();
    return true;
  }
}

/// Interstitial / app open ke callbacks. [onDone] exactly ek baar: [openBehind] ho to impression ke 1 s baad
/// (IPTV `ads_load_util.dart` onAdImpression), warna ad band hone par; show fail -> turant.
/// [after] ad band / fail hone par (agla preload).
FullScreenContentCallback<T> fullScreenCallback<T extends Ad>({
  required VoidCallback onDone,
  VoidCallback? onShown,
  bool openBehind = false,
  VoidCallback? after,
}) {
  var done = false;
  void finish() {
    if (done) return;
    done = true;
    onDone();
  }

  return FullScreenContentCallback<T>(
    onAdShowedFullScreenContent: (_) {
      AdFlags.isFullScreenAdShowing = true;
      onShown?.call();
    },
    onAdImpression: (_) {
      if (openBehind) Future<void>.delayed(const Duration(seconds: 1), finish);
    },
    onAdDismissedFullScreenContent: (ad) {
      AdFlags.isFullScreenAdShowing = false;
      ad.dispose();
      finish();
      after?.call();
    },
    onAdFailedToShowFullScreenContent: (ad, e) {
      AdFlags.isFullScreenAdShowing = false;
      ad.dispose();
      finish();
      after?.call();
    },
  );
}

/// App bhar ke interstitial slots.
class InterstitialAdManager {
  InterstitialAdManager._();

  static final splash = InterstitialSlot('interSplash');

  /// Home / tab taps (AdTapHelper.onHomeTap).
  static final main = InterstitialSlot('interPreLoad');
}
