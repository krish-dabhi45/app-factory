import 'dart:convert';

import 'package:common_flow_demo/ads/ads_load_util.dart';
import 'package:common_flow_demo/ads/ads_splash_utils.dart';
import 'package:common_flow_demo/ads/ads_variable.dart';
import 'package:common_flow_demo/ads/app_open_ad.dart';
import 'package:common_flow_demo/ads/banner_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

// The IPTV_two ads layer (lib/ads/) with the real SDK and Google's test ads, on a device with internet:
// flutter test integration_test/ads_device_test.dart -d <device>
// The ids are the bundled config.json's (IPTV's): Google's test units for Android.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  Future<bool> pumpUntil(WidgetTester tester, bool Function() done, {int seconds = 30}) async {
    for (var i = 0; i < seconds * 4; i++) {
      await tester.pump(const Duration(milliseconds: 250));
      if (done()) return true;
    }
    return false;
  }

  Widget app(Widget body) => MaterialApp(navigatorKey: AdsVariable.navigatorKey, home: Scaffold(body: body));

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    final splash = AdsSplashUtils()..prefs = await SharedPreferences.getInstance();
    splash.setOnlineIds(jsonDecode(await rootBundle.loadString(AdsSplashUtils.bundledConfig)) as Map<String, dynamic>);
    setupFbAdsId(); // Android: registers smallNativeAds / bigNativeAds / fullNativeAds with the config's colours
    await MobileAds.instance.initialize();
  });

  testWidgets('interstitial (interPreLoad) loads through loadInterCommon', (tester) async {
    AdsLoadUtil.commonInterAd = null;
    await AdsLoadUtil().loadInterCommon(AdsVariable.interPreLoad, enable: true);
    expect(await pumpUntil(tester, () => AdsLoadUtil.commonInterAd != null), isTrue);
  });

  testWidgets('small native (smallNativeAds) loads and is drawn (2688 × 140 / 690) / 1242 of the width tall', (tester) async {
    AdsLoadUtil.isNativeAdLoaded.value = false;
    AdsLoadUtil.isNativeAdFailed.value = false;
    final ad = await AdsLoadUtil().loadNative(AdsVariable.nativeIntroBig, true, false, enable: true);
    expect(await pumpUntil(tester, () => AdsLoadUtil.isNativeAdLoaded.value), isTrue, reason: 'failed: ${AdsLoadUtil.isNativeAdFailed.value}');
    await tester.pumpWidget(app(ListView(children: [NativeAdsWidget(showNativeAd: ad, isSmallNative: true, isFullNative: false)])));
    await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty, seconds: 5);
    final width = tester.view.physicalSize.width / tester.view.devicePixelRatio;
    expect(tester.getSize(find.byType(AdWidget)).height, closeTo(width * (2688 * 140 / 690) / 1242, 0.5));
    await tester.pumpWidget(const SizedBox());
    ad.dispose();
  });

  testWidgets('big native (bigNativeAds) loads and is drawn (2688 × 250 / 690) / 1242 of the width tall', (tester) async {
    AdsLoadUtil.isNativeAdLoaded.value = false;
    AdsLoadUtil.isNativeAdFailed.value = false;
    final ad = await AdsLoadUtil().loadNative(AdsVariable.nativeIntroBig, false, false, enable: true);
    expect(await pumpUntil(tester, () => AdsLoadUtil.isNativeAdLoaded.value), isTrue, reason: 'failed: ${AdsLoadUtil.isNativeAdFailed.value}');
    await tester.pumpWidget(app(ListView(children: [NativeAdsWidget(showNativeAd: ad, isSmallNative: false, isFullNative: false)])));
    await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty, seconds: 5);
    final width = tester.view.physicalSize.width / tester.view.devicePixelRatio;
    expect(tester.getSize(find.byType(AdWidget)).height, closeTo(width * (2688 * 250 / 690) / 1242, 0.5));
    await tester.pumpWidget(const SizedBox());
    ad.dispose();
  });

  testWidgets('banner (BannerWidget, banner id) loads at the standard anchored adaptive size', (tester) async {
    await tester.pumpWidget(app(Column(children: [const Expanded(child: SizedBox()), BannerWidget(adsId: AdsVariable.banner, enable: true)])));
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue);
    final size = tester.getSize(find.byType(AdWidget));
    expect(size.height, lessThan(100), reason: 'standard anchored adaptive (50–90 dp), not the large one');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('app open (appOpenAds) loads through AppOpenAdManager.loadAd', (tester) async {
    AdsVariable.appOpenAd = null;
    await AppOpenAdManager().loadAd(AdsVariable.appOpenAds);
    expect(await pumpUntil(tester, () => AdsVariable.appOpenAd != null), isTrue);
  });
}
