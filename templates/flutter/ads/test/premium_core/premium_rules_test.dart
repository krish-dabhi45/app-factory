import 'package:flutter_test/flutter_test.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:common_flow_demo/google_ads_material/ad_flags.dart';
import 'package:common_flow_demo/google_ads_material/ads_id.dart';
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
    AdFlags.isPremium = false;
    AdsId.setJson({});
    SharedPreferences.setMockInitialValues({});
  });

  test('show<Plan>Plan: IPTV names, false or "0" hides, missing shows', () {
    expect(planKey(PackageType.annual), 'showYearlyPlan');
    expect(planKey(PackageType.weekly), 'showWeeklyPlan');
    expect(planKey(PackageType.sixMonth), 'showSixMonthPlan');
    AdsId.setJson({'showWeeklyPlan': false, 'showYearlyPlan': true, 'showLifetimePlan': '0'});
    expect([PackageType.weekly, PackageType.annual, PackageType.lifetime, PackageType.monthly].map(PremiumValues.showPlan),
        [false, true, false, true]);
  });

  test('useCount is a whole number >= 0, else no limit; premiumShow "0" = no limit', () {
    expect(parseLimit('3'), 3);
    expect(parseLimit('0'), 0);
    expect(parseLimit(''), isNull);
    expect(parseLimit('-1'), isNull);
    expect(parseLimit('two'), isNull);
    AdsId.setJson({'useCount': 3, 'premiumShow': '1'});
    expect(PremiumValues.freeUses('export'), 3);
    AdsId.setJson({'useCount': 3, 'premiumShow': '0'});
    expect(PremiumValues.freeUses('export'), isNull);
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
    AdsId.setJson({'useCount': 2, 'premiumShow': '1'});
    var runs = 0, paywalls = 0;
    Future<bool> use({bool buys = false}) => FreeUseGate.run('export', action: () async => runs++, openPaywall: () async {
          paywalls++;
          if (buys) AdFlags.isPremium = true;
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
