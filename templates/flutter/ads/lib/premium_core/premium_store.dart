import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../google_ads_material/ad_flags.dart';
import '../google_ads_material/ads_id.dart';
import '../google_ads_material/app_open_ad_manager.dart';
import 'premium_values.dart';

enum BuyOutcome { bought, cancelled, failed }

enum RestoreOutcome { restored, nothingToRestore, failed }

/// RevenueCat with no state-management package. Premium = the store's active
/// entitlement, never a product-id match. Premium turns every ad off.
class PremiumStore extends ChangeNotifier {
  PremiumStore._();

  static final instance = PremiumStore._();

  static const _demoKey = 'demoPremium';

  String _entitlement = '';
  bool configured = false;
  String message = 'Not started';
  List<Package> plans = const [];
  bool loadingPlans = false;
  String? lastError;

  bool get isPremium => AdFlags.isPremium;

  /// Once at startup, before SplashAds.run. An empty key = demo mode: nothing is
  /// sold, [demoUnlock] tests the Premium flow (debug builds only). RevenueCat keeps
  /// the last customer info on the device, so Premium also holds offline.
  Future<void> configure({
    required String appleKey,
    required String googleKey,
    String amazonKey = '',
    required String entitlement,
  }) async {
    if (configured) return;
    _entitlement = entitlement;
    const amazon = bool.fromEnvironment('amazon');
    final key = Platform.isIOS || Platform.isMacOS ? appleKey : (amazon ? amazonKey : googleKey);
    if (key.isEmpty) {
      message = 'No RevenueCat key: demo mode.';
      if (kDebugMode && ((await SharedPreferences.getInstance()).getBool(_demoKey) ?? false)) _activate();
      return;
    }
    try {
      await Purchases.setLogLevel(kDebugMode ? LogLevel.debug : LogLevel.warn);
      final config = amazon ? AmazonConfiguration(key) : PurchasesConfiguration(key);
      config.entitlementVerificationMode = EntitlementVerificationMode.informational;
      await Purchases.configure(config);
      configured = true;
      message = 'RevenueCat live.';
      Purchases.addCustomerInfoUpdateListener(_apply);
      _apply(await Purchases.getCustomerInfo());
    } catch (e) {
      message = 'RevenueCat setup failed: $e';
    }
  }

  /// The paywall's plans: the current offering, filtered and ordered by `paywall_plans`.
  Future<void> loadPlans() async {
    if (!configured) return;
    loadingPlans = true;
    notifyListeners();
    try {
      final all = (await Purchases.getOfferings()).current?.availablePackages ?? const <Package>[];
      plans = visiblePlans(all, PremiumValues.paywallPlans);
    } catch (e) {
      lastError = '$e';
      plans = const [];
    }
    loadingPlans = false;
    notifyListeners();
  }

  /// [BuyOutcome.bought] = the store charged; [isPremium] says whether it unlocked Premium
  /// (a consumable such as a credit pack does not).
  Future<BuyOutcome> buy(Package package) async {
    try {
      AppResumeAdListener.skipNextResume(); // no app open ad on the way back from the store sheet
      final result = await Purchases.purchase(PurchaseParams.package(package));
      _apply(result.customerInfo);
      return BuyOutcome.bought;
    } on PlatformException catch (e) {
      if (PurchasesErrorHelper.getErrorCode(e) == PurchasesErrorCode.purchaseCancelledError) return BuyOutcome.cancelled;
      lastError = e.message;
      return BuyOutcome.failed;
    } catch (e) {
      lastError = '$e';
      return BuyOutcome.failed;
    }
  }

  /// Only from a user's tap: RevenueCat says restorePurchases "should not be triggered
  /// programmatically, since it may cause OS level sign-in prompts".
  Future<RestoreOutcome> restore() async {
    if (!configured) return RestoreOutcome.failed;
    try {
      AppResumeAdListener.skipNextResume();
      final info = await Purchases.restorePurchases();
      _apply(info);
      return _active(info) ? RestoreOutcome.restored : RestoreOutcome.nothingToRestore;
    } catch (e) {
      lastError = '$e';
      return RestoreOutcome.failed;
    }
  }

  /// DEMO ONLY (no RevenueCat key, debug build): Premium without a purchase, kept across
  /// launches. A release build never gives Premium away, whatever the app's code calls.
  Future<void> demoUnlock() async {
    if (configured || !kDebugMode) return;
    await (await SharedPreferences.getInstance()).setBool(_demoKey, true);
    _activate();
  }

  /// Removes the demo unlock; ads return after the next launch.
  Future<void> resetDemoUnlock() async => (await SharedPreferences.getInstance()).remove(_demoKey);

  bool _active(CustomerInfo info) => info.entitlements.all[_entitlement]?.isActive ?? false;

  void _apply(CustomerInfo info) {
    if (_active(info)) _activate();
  }

  void _activate() {
    if (!AdFlags.isPremium) {
      AdFlags.isPremium = true;
      AdsId.disableAllAds(); // every ad id becomes "11", also when Remote Config arrives later
    }
    notifyListeners();
  }
}
