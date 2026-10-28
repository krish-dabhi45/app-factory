import 'dart:convert';
import 'dart:io';

import 'package:common_flow_demo/ads/ads_load_util.dart';
import 'package:common_flow_demo/ads/ads_splash_utils.dart';
import 'package:common_flow_demo/ads/ads_variable.dart';
import 'package:common_flow_demo/ads/app_variable.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The IPTV_two ads layer (lib/ads/) without the ads SDK: IPTV's rules, and the fixes F1 / F2 (ads_load_util.dart,
/// ads_variable.dart headers).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  final config = jsonDecode(File('assets/ads/config.json').readAsStringSync()) as Map<String, dynamic>;
  var online = true;
  final toasts = <String>[];
  final setToast = <Map>[];

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    online = true;
    toasts.clear();
    setToast.clear();
    AdsVariable.isPurchase.value = false;
    AdsVariable.isFirstTimeVisited = false;
    AdsVariable.homeFlag = 0;
    AdsVariable.adShowHomeFlag = "1";
    AdsVariable.homeFlagOnline = "1";
    AdsVariable.interPreLoad = "11";
    messenger.setMockMethodCallHandler(const MethodChannel('dev.fluttercommunity.plus/connectivity'),
        (call) async => online ? ['wifi'] : ['none']);
    messenger.setMockMethodCallHandler(const MethodChannel('PonnamKarthik/fluttertoast'), (call) async {
      toasts.add(call.arguments['msg'] as String);
      return true;
    });
    messenger.setMockMethodCallHandler(const MethodChannel('nativeChannel'), (call) async {
      if (call.method == 'setToast') setToast.add(call.arguments as Map);
      return true;
    });
  });

  test('config.json (IPTV\'s, the Remote Config value): every key lands in AdsVariable and in SharedPreferences', () async {
    final splash = AdsSplashUtils()..prefs = await SharedPreferences.getInstance();
    splash.setOnlineIds(config);
    expect(AdsVariable.interSplash, config['interSplash']);
    expect(AdsVariable.appOpenAds, config['appOpenAds']);
    expect(AdsVariable.nativeIntroBig, config['nativeIntroBig']);
    expect(AdsVariable.nativeHome, config['nativeHome']);
    expect(AdsVariable.banner, config['banner']);
    expect(AdsVariable.homeFlagOnline, config['homeFlagOnline']);
    expect(AdsVariable.btnBgColor1, config['btnBgColor1']);
    expect(AdsVariable.useCount, config['useCount']);
    expect(AdsVariable.showIAMTester, config['showIAMTester']);
    final prefs = await SharedPreferences.getInstance();
    // every key of config.json is stored for the next launch (IPTV ads_splash_utils.dart:197-269), except
    // showRateScreen, which IPTV never reads
    const notStored = {'showRateScreen'};
    for (final k in config.keys.where((k) => !notStored.contains(k))) {
      expect(prefs.get(k)?.toString(), config[k].toString(), reason: k);
    }
  });

  test('resetAdIds: every id "11" and the loaded app open ads dropped; banner stays, as in IPTV', () {
    AdsVariable.banner = 'ca-app-pub-x/banner';
    AdsVariable.interPreLoad = 'ca-app-pub-x/inter';
    AdsVariable.nativeHome = 'ca-app-pub-x/native';
    AdsVariable.resetAdIds();
    expect([AdsVariable.interPreLoad, AdsVariable.nativeHome, AdsVariable.appOpenAds, AdsVariable.nativeIntroBig], everyElement('11'));
    expect(AdsVariable.banner, 'ca-app-pub-x/banner', reason: 'IPTV ads_variable.dart:109-127 does not reset banner');
  });

  test('F2: addAdIds reads the stored "nativeIntroBig" (IPTV read "nativeBig", which nothing writes)', () async {
    SharedPreferences.setMockInitialValues({'nativeIntroBig': 'ca-app-pub-x/big', 'nativeBig': 'wrong'});
    await AdsVariable.addAdIds();
    expect(AdsVariable.nativeIntroBig, 'ca-app-pub-x/big');
  });

  group('onTapInter (IPTV utils/app_variable.dart:61-90)', () {
    test('interPreLoad "11": the screen opens, homeFlag unchanged', () async {
      var opened = 0;
      await onTapInter(() => opened++);
      expect((opened, AdsVariable.homeFlag), (1, 0));
    });

    test('an odd homeFlag: the screen opens at once, homeFlag + 1', () async {
      AdsVariable.interPreLoad = 'ca-app-pub-x/inter';
      AdsVariable.homeFlag = 1;
      var opened = 0;
      await onTapInter(() => opened++);
      expect((opened, AdsVariable.homeFlag), (1, 2));
    });

    test('adShowHomeFlag not "1", purchased, or isFirstTimeVisited null: no ad and no count', () async {
      AdsVariable.interPreLoad = 'ca-app-pub-x/inter';
      var opened = 0;
      AdsVariable.adShowHomeFlag = "0";
      await onTapInter(() => opened++);
      AdsVariable.adShowHomeFlag = "1";
      AdsVariable.isPurchase.value = true;
      await onTapInter(() => opened++);
      AdsVariable.isPurchase.value = false;
      AdsVariable.isFirstTimeVisited = null;
      await onTapInter(() => opened++);
      expect((opened, AdsVariable.homeFlag), (3, 0));
    });

    test('offline: "Please Start Your Internet." and nothing opens', () async {
      online = false;
      var opened = 0;
      await onTapInter(() => opened++);
      expect(opened, 0);
      expect(toasts, ['Please Start Your Internet.']);
    });
  });

  test('F1: showInterCommon with no ad loaded opens the screen once and does not throw', () async {
    AdsLoadUtil.commonInterAd = null;
    var opened = 0;
    await AdsLoadUtil().showInterCommon(() {}, () => opened++);
    expect(opened, 1);
  });

  test('setupFbAdsId sends IPTV\'s "setToast" keys on "nativeChannel" (Android registers the native factories there)', () async {
    setupFbAdsId();
    await Future<void>.delayed(Duration.zero);
    expect(setToast.single.keys.toSet(), {
      'isPurchase', 'facebookId', 'facebookToken', 'nativeBGColor', 'btnBgColor', 'btnBgColor1', 'btnBgColor2',
      'btnAdBgColor', 'btnTextColor', 'btnAdTextColor', 'headerTextColor', 'bodyTextColor',
    });
  });
}
