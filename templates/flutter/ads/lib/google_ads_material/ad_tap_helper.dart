import 'package:flutter/foundation.dart';

import 'ad_flags.dart';
import 'ads_id.dart';
import 'interstitial_ad_manager.dart';

/// Screen ke button tap par interstitial ka rule (home aur dusri screens dono ke liye).
///
/// Home par kaha use karna hai: sabhi feature buttons.
/// Kaha NAHI: settings button, premium button, bottom navigation.
///
/// Rule:
///  - screen id (jaise "fullscreen_home") == "11" -> kabhi ad nahi.
///  - continue (jaise "home_screen_ad_continue_ads_online") == "1" -> har tap par ad.
///  - continue == "0" -> sirf jab flag % 2 == 0.
///  - Har tap par flag++ (ad dikhe ya na dikhe, demo app jaisa).
///  - Next (inner) screen ke kisi feature tap par `AdTapHelper.resetHome()` (back button par nahi).
///    User feature use karke home aaye to agla tap ad dikhayega, sirf back karke aaye to nahi.
class AdTapHelper {
  AdTapHelper._();

  /// Home screen ke feature buttons.
  static void onHomeTap(VoidCallback goNext) {
    final show = shouldShow(
      screenKey: 'fullscreen_home',
      continueKey: 'home_screen_ad_continue_ads_online',
      flag: AdFlags.homeFlag,
    );
    AdFlags.homeFlag++;
    show ? InterstitialAdManager.main.show(onDone: goNext) : goNext();
  }

  /// Inner screen ke feature button tap par call karo (back button par nahi).
  static void resetHome() => AdFlags.homeFlag = 0;

  /// Kisi aur screen ke liye apna flag rakho (AdFlags me) aur ye use karo.
  static bool shouldShow({required String screenKey, required String continueKey, required int flag}) {
    if (AdFlags.isPremium) return false;
    if (!AdsId.screenOn(screenKey)) return false;
    if (AdsId.screenContinue(continueKey)) return true;
    return flag % 2 == 0;
  }
}
