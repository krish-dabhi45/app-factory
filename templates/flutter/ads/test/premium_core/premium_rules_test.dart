import 'package:flutter_test/flutter_test.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:common_flow_demo/ads/ads_variable.dart';
import 'package:common_flow_demo/premium_core/free_use_gate.dart';
import 'package:common_flow_demo/premium_core/premium_values.dart';

Package _pkg(String id, PackageType type) => Package(
      id,
      type,
      StoreProduct(id, '', id, 1, '\$1', 'USD'),
      const PresentedOfferingContext('default', null, null),
    );

void main() {
  setUp(() {
    AdsVariable.isPurchase.value = false;
    AdsVariable.showWeeklyPlan = true;
    AdsVariable.showYearlyPlan = true;
    AdsVariable.premiumShow = "1";
    AdsVariable.useCount = 2;
    SharedPreferences.setMockInitialValues({});
  });

  test('IPTV showWeeklyPlan / showYearlyPlan hide those plans; other types have no IPTV key and show', () {
    AdsVariable.showWeeklyPlan = false;
    expect([PackageType.weekly, PackageType.annual, PackageType.lifetime, PackageType.monthly].map(PremiumValues.showPlan),
        [false, true, true, true]);
  });

  test('useCount is a whole number >= 0, else no limit; premiumShow "0" = no limit', () {
    expect(parseLimit('3'), 3);
    expect(parseLimit('0'), 0);
    expect(parseLimit(''), isNull);
    expect(parseLimit('-1'), isNull);
    expect(parseLimit('two'), isNull);
    AdsVariable.useCount = 3;
    expect(PremiumValues.freeUses('export'), 3);
    AdsVariable.premiumShow = "0";
    expect(PremiumValues.freeUses('export'), isNull, reason: 'IPTV checkPurchaseNormal: premiumShow "0" = no paywall');
  });

  test('the paywall shows the switched-on plans in the offering\'s order, never an empty list', () {
    final week = _pkg('w', PackageType.weekly), year = _pkg('y', PackageType.annual), life = _pkg('l', PackageType.lifetime);
    final all = [week, year, life];
    expect(visiblePlans(all, (t) => t != PackageType.weekly), [year, life]);
    expect(visiblePlans(all, (_) => true), all);
    expect(visiblePlans(all, (_) => false), all, reason: 'everything hidden must not empty the paywall');
  });

  test('free use: allowed under the limit, paywall at it, always for Premium or no limit', () {
    expect(freeUseAllowed(used: 1, limit: 2, isPremium: false), isTrue);
    expect(freeUseAllowed(used: 2, limit: 2, isPremium: false), isFalse);
    expect(freeUseAllowed(used: 0, limit: 0, isPremium: false), isFalse);
    expect(freeUseAllowed(used: 9, limit: 2, isPremium: true), isTrue);
    expect(freeUseAllowed(used: 9, limit: null, isPremium: false), isTrue);
  });

  test('FreeUseGate counts each free use and opens the paywall at the limit', () async {
    var runs = 0, paywalls = 0;
    Future<bool> use({bool buys = false}) => FreeUseGate.run('export', action: () async => runs++, openPaywall: () async {
          paywalls++;
          if (buys) AdsVariable.isPurchase.value = true;
        });

    expect(await use(), isTrue);
    expect(await use(), isTrue);
    expect(await FreeUseGate.used('export'), 2);
    expect(await use(), isFalse, reason: 'third use: paywall closed without buying');
    expect((runs, paywalls), (2, 1));
    expect(await use(buys: true), isTrue, reason: 'bought on the paywall: the feature runs');
    expect((runs, paywalls), (3, 2));
    expect(await use(), isTrue);
    expect(await FreeUseGate.used('export'), 2, reason: 'Premium uses are not counted');
  });

  test('FreeUseGate never limits when there is no useCount', () async {
    var runs = 0;
    for (var i = 0; i < 5; i++) {
      await FreeUseGate.run('share', action: () async => runs++, openPaywall: () async => fail('no paywall without a limit'));
    }
    expect(runs, 5);
  });
}
