import 'package:purchases_flutter/purchases_flutter.dart';

import '../ads/ads_variable.dart';

/// Premium switches, read by key from the app's Remote Config values (the generated `AdsVariable.valueOf`), so the
/// layer works with whichever of these keys the app has: `show<Plan>Plan` (IPTV `showWeeklyPlan` / `showYearlyPlan`,
/// false or "0" hides that plan), `premiumShow` ("0" = no paywall from usage) and `useCount` (free uses per feature;
/// IPTV `checkPurchaseNormal`, utils/app_variable.dart:93-110). A key the app does not have: plan shown, no limit.
class PremiumValues {
  PremiumValues._();

  /// The app's value of a Remote Config key, null when it has no such key. A test replaces it.
  static Object? Function(String key) value = AdsVariable.valueOf;

  static bool showPlan(PackageType type) => !const [false, "0"].contains(value(planKey(type)));

  static int? freeUses(String feature) {
    if (value('premiumShow')?.toString() == "0") return null;
    final n = value('useCount');
    return n is int && n >= 0 ? n : null;
  }
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
