import 'dart:io';

import 'package:common_flow_demo/ads/ads_load_util.dart';
import 'package:common_flow_demo/ads/ads_variable.dart';
import 'package:common_flow_demo/ads/app_open_ad.dart';
import 'package:common_flow_demo/ads/banner_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:integration_test/integration_test.dart';

// The IPTV_two ads layer (lib/ads/) with the real SDK and Google's demo ad units of this platform, on a device with
// internet: flutter test integration_test/ads_device_test.dart -d <device>
// It needs none of the app's own keys: the ids are Google's (developers.google.com/admob/{android,ios}/test-ads).
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  final ios = Platform.isIOS;
  final interstitial = ios ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712';
  final native = ios ? 'ca-app-pub-3940256099942544/3986624511' : 'ca-app-pub-3940256099942544/2247696110';
  final banner = ios ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111';
  final appOpen = ios ? 'ca-app-pub-3940256099942544/5575463023' : 'ca-app-pub-3940256099942544/9257395921';

  Future<bool> pumpUntil(WidgetTester tester, bool Function() done, {int seconds = 30}) async {
    for (var i = 0; i < seconds * 4; i++) {
      await tester.pump(const Duration(milliseconds: 250));
      if (done()) return true;
    }
    return false;
  }

  Widget app(Widget body) => MaterialApp(home: Scaffold(body: body));

  setUpAll(() async {
    // registers smallNativeAds / bigNativeAds / fullNativeAds (MainActivity "setToast"; iOS: the colours)
    await const MethodChannel('nativeChannel').invokeMethod('setToast', {
      'isPurchase': 'false', 'facebookId': '11', 'facebookToken': '11', 'nativeBGColor': '#FFFFFF', 'btnBgColor': '#1A73E8',
      'btnBgColor1': '#1A73E8', 'btnBgColor2': '#1A73E8', 'btnTextColor': '#FFFFFF', 'btnAdTextColor': '#FFFFFF',
      'btnAdBgColor': '#1A73E8', 'headerTextColor': '#000000', 'bodyTextColor': '#000000',
    });
    await MobileAds.instance.initialize();
  });

  testWidgets('interstitial loads through loadInterCommon', (tester) async {
    AdsLoadUtil.commonInterAd = null;
    await AdsLoadUtil().loadInterCommon(interstitial, enable: false);
    expect(await pumpUntil(tester, () => AdsLoadUtil.commonInterAd != null), isTrue);
  });

  testWidgets('small native (smallNativeAds) loads and is drawn (2688 × 140 / 690) / 1242 of the width tall', (tester) async {
    AdsLoadUtil.isNativeAdLoaded.value = false;
    AdsLoadUtil.isNativeAdFailed.value = false;
    final ad = await AdsLoadUtil().loadNative(native, true, false, enable: false);
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
    final ad = await AdsLoadUtil().loadNative(native, false, false, enable: false);
    expect(await pumpUntil(tester, () => AdsLoadUtil.isNativeAdLoaded.value), isTrue, reason: 'failed: ${AdsLoadUtil.isNativeAdFailed.value}');
    await tester.pumpWidget(app(ListView(children: [NativeAdsWidget(showNativeAd: ad, isSmallNative: false, isFullNative: false)])));
    await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty, seconds: 5);
    final width = tester.view.physicalSize.width / tester.view.devicePixelRatio;
    expect(tester.getSize(find.byType(AdWidget)).height, closeTo(width * (2688 * 250 / 690) / 1242, 0.5));
    await tester.pumpWidget(const SizedBox());
    ad.dispose();
  });

  testWidgets('banner (BannerWidget) loads at the standard anchored adaptive size', (tester) async {
    await tester.pumpWidget(app(Column(children: [const Expanded(child: SizedBox()), BannerWidget(adsId: banner, enable: false)])));
    expect(await pumpUntil(tester, () => find.byType(AdWidget).evaluate().isNotEmpty), isTrue);
    expect(tester.getSize(find.byType(AdWidget)).height, lessThan(100), reason: 'standard anchored adaptive (50–90 dp)');
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('app open loads through AppOpenAdManager.loadAd', (tester) async {
    AdsVariable.appOpenAd = null;
    await AppOpenAdManager().loadAd(appOpen);
    expect(await pumpUntil(tester, () => AdsVariable.appOpenAd != null), isTrue);
  });
}
