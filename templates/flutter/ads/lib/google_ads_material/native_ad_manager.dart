import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'ad_impression.dart';
import 'ads_id.dart';
import 'app_open_ad_manager.dart';

/// Native factory ids. Native side me isi naam se register karna hai:
/// Android MainActivity.kt (LayoutNativeAdFactory.kt + native_small.xml / native_big.xml),
/// iOS AppDelegate.swift (TemplateNativeAdFactory).
class NativeFactory {
  static const small = 'smallNative'; // icon | headline + body | CTA, height 90 (home)
  static const big = 'bigNative'; // icon + headline + body, media 150, CTA full width, height 300 (intro)
}

/// Ek native slot, Remote Config key [key] ki id se: preload, aur jo widget le jaye usko de do.
class NativeSlot {
  NativeSlot(this.key, {required this.factoryId});

  final String key;
  final String factoryId;

  NativeAd? _ad;
  Future<NativeAd?>? _pending;

  /// Id "11" (ya gate flag off) -> ye ad off: na load, na show.
  bool get isOff => AdsId.isOff(AdsId.unit(key));

  bool get isReady => !isOff && _ad != null;

  /// Splash me call karo taaki intro / home tak ad ready ho.
  Future<NativeAd?> preload() {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady) return Future.value(null);
    if (_ad != null) return Future.value(_ad);
    return _pending ??= () async {
      final ad = await _load(AdsId.unit(key));
      _ad = ad;
      _pending = null;
      return ad;
    }();
  }

  /// Ready ad le lo, ya load hone ka wait karo (preload na hua ho to yahi load).
  Future<NativeAd?> take() async {
    final ad = _ad ?? await preload();
    _ad = null; // ek NativeAd ek hi AdWidget me dikh sakta hai
    return ad;
  }

  Future<NativeAd?> _load(String id) {
    if (AdsId.isOff(id)) return Future.value(null);
    final c = Completer<NativeAd?>();
    NativeAd(
      adUnitId: id,
      factoryId: factoryId,
      request: const AdRequest(),
      customOptions: AdsId.nativeColors, // native design ke colors online se
      listener: NativeAdListener(
        onPaidEvent: AdImpression.listener(key),
        onAdClicked: (_) => AppResumeAdListener.skipNextResume(),
        onAdLoaded: (ad) => c.complete(ad as NativeAd),
        onAdFailedToLoad: (ad, e) {
          debugPrint('Native fail ($id): $e');
          ad.dispose();
          c.complete(null);
        },
      ),
    ).load();
    return c.future;
  }
}

class NativeAdManager {
  NativeAdManager._();

  /// Intro (first launch): sab pages ke neeche ek big native. Gate: adShowIntroFlag.
  static final intro = NativeSlot('nativeIntroBig', factoryId: NativeFactory.big);

  /// Home ke content me ek small native. Gate: adShowHomeFlag.
  static final home = NativeSlot('nativeHome', factoryId: NativeFactory.small);
}
