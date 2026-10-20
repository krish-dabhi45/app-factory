import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'ad_impression.dart';
import 'ads_id.dart';
import 'app_open_ad_manager.dart';

/// Native factory ids. Native side me isi naam se register karna hai:
/// Android MainActivity.kt (SmallNativeAdFactory.kt), iOS AppDelegate.swift (SmallNativeAdFactory).
class NativeFactory {
  static const small = 'smallNative'; // onboarding bottom small native
  static const medium = 'mediumNative'; // jarurat ke hisab se aur add karo
}

/// Ek native slot: preload (HIGH -> NORMAL), aur jo widget le jaye usko de do.
class NativeSlot {
  NativeSlot({required this.factoryId, required this.highId, required this.normalId});

  final String factoryId;
  final String Function() highId;
  final String Function() normalId;

  NativeAd? _ad;
  Future<NativeAd?>? _pending;

  /// Dono ids "11" -> ye ad off: na load, na show.
  bool get isOff => AdsId.isOff(highId()) && AdsId.isOff(normalId());

  bool get isReady => !isOff && _ad != null;

  /// Splash me call karo taaki onboarding tak ad ready ho.
  Future<NativeAd?> preload() {
    if (AdFlags.isPremium || isOff || !AdFlags.adsReady) return Future.value(null);
    if (_ad != null) return Future.value(_ad);
    return _pending ??= () async {
      final ad = await _load(highId()) ?? await _load(normalId());
      _ad = ad;
      _pending = null;
      return ad;
    }();
  }

  /// Ready ad le lo, ya load hone ka wait karo (onboarding me fallback load).
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
        onPaidEvent: AdImpression.listener('native'),
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

  static final onboarding = NativeSlot(
    factoryId: NativeFactory.small,
    highId: () => AdsId.nativeOnboardingHigh,
    normalId: () => AdsId.nativeOnboardingNormal,
  );
}
