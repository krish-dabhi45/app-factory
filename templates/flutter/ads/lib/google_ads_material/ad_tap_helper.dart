import 'dart:async';

import 'ad_flags.dart';
import 'ads_id.dart';
import 'interstitial_ad_manager.dart';

/// Home (aur har tab root) par screen kholne wale tap ka interstitial rule — IPTV app ka `onTapInter`.
///
/// Kaha use karna hai: home / tab root ka har tap jo nayi screen kholta hai (card, tile, list row, play, open).
/// Kaha NAHI: tab switch / bottom navigation, settings, premium, credits, bottom sheet ya dialog kholna, toggle.
///
/// Rule:
///  - Premium, `adShowHomeFlag` "1" nahi, ya `interPreLoad` "11" -> kabhi ad nahi (flag bhi nahi badhta).
///  - `homeFlagOnline` "0" -> har tap par ad.
///  - Warna ad sirf jab `homeFlag % 2 == 0`. Har tap par `homeFlag++`.
///  - Khuli screen se wapas aane par (pop) `homeFlag` odd ho to `homeFlag++` -> agla tap phir ad dikhata hai.
///    Isliye [open] ko route ka Future return karna hai: `() => Get.to(...)`, `() => Navigator.push(...)`,
///    `() => context.push(...)` (go_router `go` nahi — wo wapas aane ka pata nahi deta).
///  - Ad wale tap par "Loading..." loader 2 s (`inAppAdWaitSeconds`), phir ad; screen ad ke impression ke 1 s baad
///    ad ke peeche khulti hai (IPTV `app_variable.dart:71-76`, `ads_load_util.dart:199-203`).
///  - Returning launch me splash ad ke baad Home aaye to `homeFlag` = 1 (SplashAds.run homeFollows): home ka pehla tap bina ad.
class AdTapHelper {
  AdTapHelper._();

  static void onHomeTap(FutureOr<Object?> Function() open) {
    Future<void> go() async {
      await open();
      onReturn();
    }

    if (AdFlags.isPremium || InterstitialAdManager.main.isOff) {
      go();
      return;
    }
    final show = homeTapShows(AdFlags.homeFlag, everyTap: AdsId.homeAdEveryTap);
    AdFlags.homeFlag++;
    show ? InterstitialAdManager.main.show(onDone: go, loader: true, openBehind: true) : go();
  }

  /// Pure rule (tests): is tap par ad?
  static bool homeTapShows(int flag, {required bool everyTap}) => everyTap || flag.isEven;

  /// Khuli screen band hone par (onHomeTap khud call karta hai).
  static void onReturn() {
    if (AdFlags.homeFlag.isOdd) AdFlags.homeFlag++;
  }
}
