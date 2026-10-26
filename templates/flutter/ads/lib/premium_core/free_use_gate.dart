import 'package:shared_preferences/shared_preferences.dart';

import '../google_ads_material/ad_flags.dart';
import 'premium_values.dart';

/// true = the feature runs now; false = the paywall opens first.
bool freeUseAllowed({required int used, required int? limit, required bool isPremium}) =>
    isPremium || limit == null || used < limit;

/// Free uses per feature before the paywall (`useCount`, `premiumShow` in Remote Config).
class FreeUseGate {
  FreeUseGate._();

  static String _key(String feature) => 'free_uses_used_$feature';

  static Future<int> used(String feature) async =>
      (await SharedPreferences.getInstance()).getInt(_key(feature)) ?? 0;

  /// Runs [action] when the user is Premium or has free uses of [feature] left.
  /// Otherwise awaits [openPaywall] and runs [action] only if the user is Premium
  /// after it (bought or restored). A free use is counted after [action] finishes.
  /// Returns whether [action] ran.
  static Future<bool> run(
    String feature, {
    required Future<void> Function() action,
    required Future<void> Function() openPaywall,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final used = prefs.getInt(_key(feature)) ?? 0;
    if (!freeUseAllowed(used: used, limit: PremiumValues.freeUses(feature), isPremium: AdFlags.isPremium)) {
      await openPaywall();
      if (!AdFlags.isPremium) return false;
    }
    await action();
    if (!AdFlags.isPremium) await prefs.setInt(_key(feature), used + 1);
    return true;
  }
}
