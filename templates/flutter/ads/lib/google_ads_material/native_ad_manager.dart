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
  // IPTV native_admob_small.xml: row (icon | "Ad" + headline, advertiser + stars, body), CTA full width below, height 150 (home)
  static const small = 'smallNative';
  // IPTV intro order: media 150, row (icon | "Ad" + headline, advertiser + stars, body), CTA full width, height 310 (intro)
  static const big = 'bigNative';
}

/// Ek native slot, Remote Config key [key] ki id se: preload, aur jo widget le jaye usko de do.
/// [keep] true (home): ek hi ad rakha jaata hai aur har baar wahi dikhta hai — tab switch / home rebuild par
/// naya ad load nahi hota (IPTV: static AdsVariable.nativeAdHome). false (intro): widget ad le jaata hai aur dispose karta hai.
class NativeSlot {
  NativeSlot(this.key, {required this.factoryId, this.keep = false});

  final String key;
  final String factoryId;
  final bool keep;

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
    if (!keep) _ad = null; // ek NativeAd ek hi AdWidget me dikh sakta hai
    return ad;
  }

  /// [keep] slot ka loaded ad (widget pehle hi frame me dikhata hai, shimmer nahi).
  NativeAd? get keptAd => keep && !isOff ? _ad : null;

  /// [keep] slot ka ad abhi kisi widget me dikh raha hai (ek NativeAd do AdWidget me ek saath nahi chal sakta).
  Object? shownBy;

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
  static final home = NativeSlot('nativeHome', factoryId: NativeFactory.small, keep: true);
}
