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
    AdsId.setJson({...defaults, 'nativeHome': 'ca-app-pub-3940256099942544/2247696110', 'adShowHomeFlag': '1'}); // IPTV ships nativeHome "11"
    await tester.pumpWidget(app(
      Column(children: [const Spacer(), NativeAdWidget(slot: NativeAdManager.home, height: 150)]),
    ));
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 0, reason: 'nothing while loading (IPTV)');
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue, reason: 'native loaded');
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 150);
    await tester.pump(const Duration(seconds: 2)); // native view drawn, visible in the device window
  });

  testWidgets('home native is kept: switching tabs away and back shows the same ad, no reload (IPTV nativeAdHome)', (tester) async {
    AdsId.setJson({...defaults, 'nativeHome': 'ca-app-pub-3940256099942544/2247696110', 'adShowHomeFlag': '1'});
    var tab = 0;
    late StateSetter setTab;
    await tester.pumpWidget(app(StatefulBuilder(builder: (_, s) {
      setTab = s;
      return tab == 0
          ? Column(children: [const Spacer(), NativeAdWidget(slot: NativeAdManager.home, height: 150)])
          : const Center(child: Text('Other tab'));
    })));
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue, reason: 'native loaded');
    final first = tester.widget<AdWidget>(find.byType(AdWidget)).ad;
    for (var round = 0; round < 3; round++) {
      setTab(() => tab = 1);
      await tester.pump(const Duration(seconds: 1));
      expect(find.byType(AdWidget), findsNothing);
      setTab(() => tab = 0);
      await tester.pump();
      expect(tester.getSize(find.byType(NativeAdWidget)).height, 150, reason: 'round $round: shown in the first frame, no reload');
      expect(identical(tester.widget<AdWidget>(find.byType(AdWidget)).ad, first), isTrue, reason: 'round $round: same ad');
      await tester.pump(const Duration(seconds: 1));
    }
  });

  testWidgets('big native (factory bigNative, intro) loads with its media view', (tester) async {
    await tester.pumpWidget(app(
      Column(children: [const Spacer(), NativeAdWidget(slot: NativeAdManager.intro, height: 310)]),
    ));
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 0, reason: 'nothing while loading (IPTV)');
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue, reason: 'native loaded');
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 310);
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('big native with minSpaceLeft: not drawn while the screen is too short (landscape), the same ad back when there is room', (tester) async {
    var height = 800.0;
    late StateSetter setHeight;
    await tester.pumpWidget(app(StatefulBuilder(builder: (context, set) {
      setHeight = set;
      return MediaQuery(
        data: MediaQuery.of(context).copyWith(size: Size(MediaQuery.sizeOf(context).width, height)),
        child: Column(children: [const Spacer(), NativeAdWidget(slot: NativeAdManager.intro, height: 310, minSpaceLeft: 240)]),
      );
    })));
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue, reason: 'native loaded');
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 310);
    setHeight(() => height = 384); // the M04's landscape window: 384 - 310 < 240
    await tester.pump();
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 0);
    expect(find.byType(AdWidget), findsNothing);
    setHeight(() => height = 800);
    await tester.pump(const Duration(seconds: 1));
    expect(tester.getSize(find.byType(NativeAdWidget)).height, 310, reason: 'the same ad again, no reload');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('tap ad: "Loading..." for inAppAdWaitSeconds, an ad that did not load -> goes on, HUD removed', (tester) async {
    AdsId.useTestIds = false;
    AdsId.setJson({...defaults, 'interPreLoad': 'ca-app-pub-0000000000000000/0000000000', 'inAppAdWaitSeconds': '1'});
    await tester.pumpWidget(app(const SizedBox.expand()));
    final slot = InterstitialSlot('interPreLoad');
    var done = 0;
    final watch = Stopwatch()..start();
    final shown = slot.show(onDone: () => done++, preloadAfter: false, loader: true, openBehind: true);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Loading...'), findsOneWidget, reason: 'IPTV loader before the tap ad');
    expect(done, 0);
    expect(await shown, isFalse);
    watch.stop();
    await tester.pump();
    expect(done, 1);
    expect(watch.elapsed, greaterThanOrEqualTo(const Duration(seconds: 1)), reason: 'the loader stays the whole wait');
    expect(watch.elapsed, lessThan(const Duration(seconds: 3)));
    expect(AppHud.isShowing, isFalse);
  });
}
