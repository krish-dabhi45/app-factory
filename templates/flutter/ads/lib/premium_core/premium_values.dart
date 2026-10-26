import 'package:purchases_flutter/purchases_flutter.dart';

import '../google_ads_material/ads_id.dart';

/// Premium switches, read from the same Remote Config JSON key as the ads
/// (RemoteConfigLoader.load -> AdsId). Changed online, no app update needed.
/// Defaults: assets/remote_config_default.json.
class PremiumValues {
  PremiumValues._();

  /// `show<Plan>Plan` (IPTV: showWeeklyPlan, showYearlyPlan): false / "0" hides that RevenueCat package
  /// type on the paywall. Missing = shown. Names: [planKey].
  static bool showPlan(PackageType type) => !const {'0', 'false'}.contains(AdsId.get(planKey(type), '1'));

  /// Free uses of a paid feature before the paywall (IPTV checkPurchaseNormal): `useCount` uses per feature,
  /// counted per feature. `premiumShow` "0" = no paywall from usage (no limit). Missing / invalid useCount = no limit.
  static int? freeUses(String feature) => AdsId.isOn('premiumShow', '1') ? parseLimit(AdsId.get('useCount', '')) : null;

  /// `showIntro`: "0" skips the intro on the first launch.
  static bool get showIntro => AdsId.isOn('showIntro', '1');

  /// `showShareBtn` / `showRateBtn` / `showPrivacyBtn`: "0" hides that settings row.
  /// Restore and Terms of Use are never switchable; the paywall always links Privacy Policy and Terms (store rules).
  static bool get showShareBtn => AdsId.isOn('showShareBtn', '1');
  static bool get showRateBtn => AdsId.isOn('showRateBtn', '1');
  static bool get showPrivacyBtn => AdsId.isOn('showPrivacyBtn', '1');
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
