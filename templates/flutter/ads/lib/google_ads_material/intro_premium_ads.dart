import 'package:flutter/foundation.dart';

import 'ad_flags.dart';
import 'app_open_ad_manager.dart';
import 'interstitial_ad_manager.dart';

/// Ek full screen ad jagah jaha app open id set ho to app open, warna interstitial
/// (IPTV app ka loadInterIntroPremium: appOpenIntro / interIntro, appOpenPremium / interPremium).
class AppOpenOrInterstitial {
  AppOpenOrInterstitial({required this.appOpen, required this.interstitial});

  final AppOpenSlot appOpen;
  final InterstitialSlot interstitial;

  bool get _useAppOpen => !appOpen.isOff;

  /// Screen khulte hi (intro initState, premium initState).
  void preload() => _useAppOpen ? appOpen.preload() : interstitial.preload();

  /// Ready ad ho to dikhao, [onDone] ad band hone par. Ready nahi -> bina wait seedha [onDone] (IPTV jaisa).
  void show({required VoidCallback onDone}) {
    if (AdFlags.isPremium) return onDone();
    if (_useAppOpen) {
      appOpen.show(onDone: onDone, preloadAfter: false);
    } else {
      interstitial.show(onDone: onDone, preloadAfter: false, loadIfMissing: false);
    }
  }
}

class IntroPremiumAds {
  IntroPremiumAds._();

  /// Intro ke last page ka Continue (ya Skip) — intro khatam.
  static final intro = AppOpenOrInterstitial(appOpen: AppOpenSlot('appOpenIntro'), interstitial: InterstitialSlot('interIntro'));

  /// App ke andar se khuli Premium screen band karna (splash / intro wali Premium par nahi).
  static final premium =
      AppOpenOrInterstitial(appOpen: AppOpenSlot('appOpenPremium'), interstitial: InterstitialSlot('interPremium'));
}
