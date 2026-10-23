import 'package:purchases_flutter/purchases_flutter.dart';

import '../google_ads_material/ads_id.dart';

/// Premium switches, read from the same Remote Config JSON key as the ads
/// (RemoteConfigLoader.load -> AdsId). Changed online, no app update needed.
/// Defaults: assets/remote_config_default.json.
class PremiumValues {
  PremiumValues._();

  /// `paywall_plans`: the RevenueCat package types the paywall offers, in this
  /// order, e.g. "weekly,annual,lifetime". Empty = every package of the offering.
  static List<PackageType> get paywallPlans => parsePlans(AdsId.get('paywall_plans', ''));

  /// `free_uses_<feature>`: how many times a free user may use [feature] before
  /// the paywall opens ("0" = paywall at the first use). Missing = no limit.
  static int? freeUses(String feature) => parseLimit(AdsId.get('free_uses_$feature', ''));

  /// `show_intro`: "0" skips the intro on the first launch.
  static bool get showIntro => AdsId.isOn('show_intro', '1');

  /// `show_share_app` / `show_rate_app`: "0" hides that settings row.
  /// Restore, Terms of Use and Privacy Policy are never switchable (store rules).
  static bool get showShareApp => AdsId.isOn('show_share_app', '1');
  static bool get showRateApp => AdsId.isOn('show_rate_app', '1');
}

/// "weekly, annual" -> [weekly, annual]; unknown names are skipped, repeats kept once.
List<PackageType> parsePlans(String raw) => [
      ...{
        for (final name in raw.split(','))
          for (final t in PackageType.values)
            if (t != PackageType.unknown && t.name == name.trim()) t,
      },
    ];

/// A whole number >= 0, else null (= no limit).
int? parseLimit(String raw) {
  final n = int.tryParse(raw.trim());
  return n != null && n >= 0 ? n : null;
}

/// The packages the paywall shows: [all] in the order of [types]. No types, or
/// none of them in the offering (a typo online), = [all], so the paywall is never empty.
List<Package> visiblePlans(List<Package> all, List<PackageType> types) {
  final shown = [for (final t in types) ...all.where((p) => p.packageType == t)];
  return shown.isEmpty ? all : shown;
}
