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

  test('paywall_plans parses known package types in order, once each', () {
    expect(parsePlans('weekly, annual,lifetime'), [PackageType.weekly, PackageType.annual, PackageType.lifetime]);
    expect(parsePlans('annual,anual,weekly,annual'), [PackageType.annual, PackageType.weekly]);
    expect(parsePlans(''), isEmpty);
    expect(parsePlans('unknown'), isEmpty);
  });

  test('free_uses_<feature> is a whole number >= 0, else no limit', () {
    expect(parseLimit('3'), 3);
    expect(parseLimit('0'), 0);
    expect(parseLimit(''), isNull);
    expect(parseLimit('-1'), isNull);
    expect(parseLimit('two'), isNull);
  });

  test('the paywall shows the switched-on plans in their order, never an empty list', () {
    final week = _pkg('w', PackageType.weekly), year = _pkg('y', PackageType.annual), life = _pkg('l', PackageType.lifetime);
    final all = [week, year, life];
    expect(visiblePlans(all, [PackageType.annual, PackageType.weekly]), [year, week]);
    expect(visiblePlans(all, []), all);
    expect(visiblePlans(all, [PackageType.monthly]), all, reason: 'a type the offering lacks must not empty the paywall');
  });

  test('free use: allowed under the limit, paywall at it, always for Premium or no limit', () {
    expect(freeUseAllowed(used: 1, limit: 2, isPremium: false), isTrue);
    expect(freeUseAllowed(used: 2, limit: 2, isPremium: false), isFalse);
    expect(freeUseAllowed(used: 0, limit: 0, isPremium: false), isFalse);
    expect(freeUseAllowed(used: 9, limit: 2, isPremium: true), isTrue);
    expect(freeUseAllowed(used: 9, limit: null, isPremium: false), isTrue);
  });

  test('FreeUseGate counts each free use and opens the paywall at the limit', () async {
    AdsId.setJson({'free_uses_export': '2'});
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

  test('FreeUseGate never limits a feature with no free_uses key', () async {
    var runs = 0;
    for (var i = 0; i < 5; i++) {
      await FreeUseGate.run('share', action: () async => runs++, openPaywall: () async => fail('no paywall without a limit'));
    }
    expect(runs, 5);
  });
}
