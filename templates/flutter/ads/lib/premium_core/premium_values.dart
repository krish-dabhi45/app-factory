import 'package:purchases_flutter/purchases_flutter.dart';

import '../ads/ads_variable.dart';

/// Premium switches: IPTV's Remote Config keys, read into AdsVariable by AdsSplashUtils.getOnlineIds
/// (IPTV `ads_splash_utils.dart:45-55`, `:130-140`). Changed online, no app update needed.
class PremiumValues {
  PremiumValues._();

  /// IPTV: `showWeeklyPlan`, `showYearlyPlan` (false hides that plan). Other plan types have no IPTV key: shown.
  static bool showPlan(PackageType type) => switch (type) {
        PackageType.weekly => AdsVariable.showWeeklyPlan,
        PackageType.annual => AdsVariable.showYearlyPlan,
        _ => true,
      };

  /// IPTV `checkPurchaseNormal` (utils/app_variable.dart:93-110): `premiumShow` "0" = no paywall from usage;
  /// otherwise `useCount` free uses per feature.
  static int? freeUses(String feature) => AdsVariable.premiumShow != "0" ? AdsVariable.useCount : null;

  /// `showIntro` "1" = the intro on the first launch (IPTV splash_screen.dart:84).
  static bool get showIntro => AdsVariable.showIntro == "1";

  /// `showShareBtn` / `showRateBtn` / `showPrivacyBtn` "1" = that settings row (IPTV setting_screen.dart:72, 96, 117).
  /// Restore and Terms of Use are never switchable; the paywall always links Privacy Policy and Terms (store rules).
  static bool get showShareBtn => AdsVariable.showShareBtn == "1";
  static bool get showRateBtn => AdsVariable.showRateBtn == "1";
  static bool get showPrivacyBtn => AdsVariable.showPrivacyBtn == "1";
}

/// annual -> "showYearlyPlan" (IPTV name), weekly -> "showWeeklyPlan", sixMonth -> "showSixMonthPlan" ...
String planKey(PackageType type) =>
    'show${type == PackageType.annual ? 'Yearly' : type.name[0].toUpperCase() + type.name.substring(1)}Plan';

/// A whole number >= 0, else null (= no limit).
int? parseLimit(String raw) {
  final n = int.tryParse(raw.trim());
  return n != null && n >= 0 ? n : null;
}

/// The packages the paywall shows: [all] (the offering's order) without the hidden types.
/// Every type hidden (a mistake online) = [all], so the paywall is never empty.
List<Package> visiblePlans(List<Package> all, bool Function(PackageType) show) {
  final shown = all.where((p) => show(p.packageType)).toList();
  return shown.isEmpty ? all : shown;
}
