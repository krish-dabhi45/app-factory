import 'dart:convert';

import 'package:common_flow_demo/google_ads_material/ad_flags.dart';
import 'package:common_flow_demo/google_ads_material/ads_consent.dart';
import 'package:common_flow_demo/google_ads_material/ads_id.dart';
import 'package:common_flow_demo/google_ads_material/app_hud.dart';
import 'package:common_flow_demo/google_ads_material/banner_ad_widget.dart';
import 'package:common_flow_demo/google_ads_material/interstitial_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/native_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/native_ad_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:integration_test/integration_test.dart';

// Real SDK, real Google test ads, on a device. Needs internet.
// flutter test integration_test/ads_device_test.dart -d <device>
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  late Map<String, dynamic> defaults;

  Future<bool> pumpUntil(WidgetTester tester, bool Function() done, {int seconds = 30}) async {
    for (var i = 0; i < seconds * 4; i++) {
      await tester.pump(const Duration(milliseconds: 250));
      if (done()) return true;
    }
    return false;
  }

  Widget app(Widget body, {Widget? bottom}) => MaterialApp(
        navigatorKey: AppHud.navigatorKey,
        home: Scaffold(body: body, bottomNavigationBar: bottom),
      );

  setUpAll(() async {
    defaults = jsonDecode(await rootBundle.loadString('assets/remote_config_default.json')) as Map<String, dynamic>;
    AdsId.setJson(defaults);
    await AdsConsent.init();
  });

  setUp(() {
    AdsId.useTestIds = true;
    AdsId.setJson(defaults);
  });

  testWidgets('consent: canRequestAds true here, so MobileAds initialised and adsReady', (tester) async {
    expect(await ConsentInformation.instance.canRequestAds(), isTrue);
    expect(AdFlags.adsReady, isTrue);
  });

  testWidgets('adaptive banner loads a Google test ad at the bottom, full width', (tester) async {
    await tester.pumpWidget(app(const SizedBox.expand(), bottom: const BannerAdWidget()));
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue, reason: 'banner loaded');
    final box = tester.getSize(find.byType(BannerAdWidget));
    final screen = tester.view.physicalSize / tester.view.devicePixelRatio;
    expect(box.width, screen.width);
    expect(box.height, greaterThan(40));
  });

  testWidgets('banner that fails to load gives its space back (no blank gap)', (tester) async {
    final logs = <String>[];
    final print = debugPrint;
    debugPrint = (m, {wrapWidth}) {
      logs.add(m ?? '');
      print(m, wrapWidth: wrapWidth);
    };
    addTearDown(() => debugPrint = print);
    AdsId.useTestIds = false;
    AdsId.setJson({...defaults, 'banner': 'ca-app-pub-0000000000000000/0000000000'});
    await tester.pumpWidget(app(const SizedBox.expand(), bottom: const BannerAdWidget()));
    expect(await pumpUntil(tester, () => logs.any((l) => l.startsWith('Banner fail'))), isTrue, reason: 'load failed');
    await tester.pump(const Duration(seconds: 1));
    expect(tester.getSize(find.byType(BannerAdWidget)).height, 0, reason: 'collapsed after onAdFailedToLoad');
    expect(find.byType(AdWidget), findsNothing);
  });

  testWidgets('small native (factory smallNative, home) loads with the Remote Config colours', (tester) async {
    await tester.pumpWidget(app(
      Column(children: [const Spacer(), NativeAdWidget(slot: NativeAdManager.home, height: 90)]),
    ));
    expect(find.byType(SmallNativeShimmer), findsOneWidget, reason: 'shimmer while loading');
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue, reason: 'native loaded');
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 90);
    await tester.pump(const Duration(seconds: 2)); // native view drawn, visible in the device window
  });

  testWidgets('big native (factory bigNative, intro) loads with its media view', (tester) async {
    await tester.pumpWidget(app(
      Column(children: [const Spacer(), NativeAdWidget(slot: NativeAdManager.intro, height: 300)]),
    ));
    expect(find.byType(BigNativeShimmer), findsOneWidget, reason: 'shimmer while loading');
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue, reason: 'native loaded');
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 300);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('in-app interstitial: no preloaded ad and wait "0" -> goes on at once, HUD removed', (tester) async {
    AdsId.setJson({...defaults, 'inAppAdWaitSeconds': '0'});
    await tester.pumpWidget(app(const SizedBox.expand()));
    final slot = InterstitialSlot('interPreLoad');
    var done = 0;
    final watch = Stopwatch()..start();
    final shown = await slot.show(onDone: () => done++, preloadAfter: false);
    watch.stop();
    await tester.pump();
    expect(shown, isFalse);
    expect(done, 1);
    expect(watch.elapsed, lessThan(const Duration(seconds: 2)));
    expect(AppHud.isShowing, isFalse);
  });
}
