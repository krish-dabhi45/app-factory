import 'dart:convert';
import 'dart:io';

import 'package:common_flow_demo/ads/ads_load_util.dart';
import 'package:common_flow_demo/ads/ads_splash_utils.dart';
import 'package:common_flow_demo/ads/ads_variable.dart';
import 'package:common_flow_demo/ads/app_variable.dart';
import 'package:common_flow_demo/ads/loading_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The IPTV_two ads layer (lib/ads/) without the ads SDK, on this app's own keys (remote_config.json, from which
/// lib/ads/ads_variable.dart is generated): IPTV's store / read / reset rules, onTapInter's rule, the loading dialog, F1.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late Map<String, dynamic> config;
  setUpAll(() => config = jsonDecode(File('remote_config.json').readAsStringSync()) as Map<String, dynamic>);
  // an ad id: an AdMob ad unit or "11" (off); facebookId / facebookToken are the native factories' inputs, not ad ids
  bool isAdId(String k, Object? v) => v is String && (RegExp(r'^ca-app-pub-\d+/\d+$').hasMatch(v) || v == '11') && !k.startsWith('facebook');
  const unit = 'ca-app-pub-3940256099942544/1033173712';
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

  test('remote_config.json (the Remote Config value): every key lands in its AdsVariable field and in SharedPreferences', () async {
    final splash = AdsSplashUtils()..prefs = await SharedPreferences.getInstance();
    splash.setOnlineIds(config);
    final prefs = await SharedPreferences.getInstance();
    for (final k in config.keys) {
      expect(AdsVariable.valueOf(k), config[k], reason: k);
      expect(prefs.get(k), config[k], reason: '$k stored for the next launch');
    }
  });

  test('the next launch reads the stored copy (IPTV getOnlineIds)', () async {
    SharedPreferences.setMockInitialValues(config.map((k, v) => MapEntry(k, v as Object)));
    AdsVariable.readStored(await SharedPreferences.getInstance());
    for (final k in config.keys) {
      expect(AdsVariable.valueOf(k), config[k], reason: k);
    }
  });

  test('resetAdIds (a purchase): every ad id "11", every other value kept', () async {
    final splash = AdsSplashUtils()..prefs = await SharedPreferences.getInstance();
    splash.setOnlineIds(config);
    AdsVariable.resetAdIds();
    for (final k in config.keys) {
      expect(AdsVariable.valueOf(k), isAdId(k, config[k]) ? '11' : config[k], reason: k);
    }
  });

  group('onTapInter (IPTV utils/app_variable.dart:61-90)', () {
    late BuildContext context;
    Future<void> pumpApp(WidgetTester tester) => tester.pumpWidget(MaterialApp(home: Builder(builder: (c) {
          context = c;
          return const SizedBox();
        })));
    Future<int> tap({String adUnitId = unit, String showFlag = "1", String everyTapFlag = "1"}) async {
      var opened = 0;
      await onTapInter(context, () => opened++, adUnitId: adUnitId, showFlag: showFlag, everyTapFlag: everyTapFlag, enable: false);
      return opened;
    }

    testWidgets('id "11": the screen opens, homeFlag unchanged', (tester) async {
      await pumpApp(tester);
      expect((await tap(adUnitId: '11'), AdsVariable.homeFlag), (1, 0));
    });

    testWidgets('an odd homeFlag: the screen opens at once, homeFlag + 1', (tester) async {
      await pumpApp(tester);
      AdsVariable.homeFlag = 1;
      expect((await tap(), AdsVariable.homeFlag), (1, 2));
    });

    testWidgets('a second tap while the first runs is ignored: the screen opens once', (tester) async {
      await pumpApp(tester);
      AdsVariable.homeFlag = 1;
      final both = await Future.wait([tap(), tap()]);
      expect((both[0] + both[1], AdsVariable.homeFlag), (1, 2));
    });

    testWidgets('showFlag not "1", purchased, or isFirstTimeVisited null: no ad and no count', (tester) async {
      await pumpApp(tester);
      final opened = await tap(showFlag: "0");
      AdsVariable.isPurchase.value = true;
      final opened2 = await tap();
      AdsVariable.isPurchase.value = false;
      AdsVariable.isFirstTimeVisited = null;
      final opened3 = await tap();
      expect((opened + opened2 + opened3, AdsVariable.homeFlag), (3, 0));
    });

    testWidgets('offline: "Please Start Your Internet." and nothing opens', (tester) async {
      await pumpApp(tester);
      online = false;
      expect(await tap(), 0);
      expect(toasts, ['Please Start Your Internet.']);
    });
  });

  testWidgets('loadingScreen: a second show while it is up adds no dialog; hide closes it', (tester) async {
    late BuildContext context;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (c) {
      context = c;
      return const SizedBox();
    })));
    loadingScreen.show(context);
    loadingScreen.show(context);
    await tester.pump();
    expect(find.text('Loading...'), findsOneWidget);
    loadingScreen.hide();
    loadingScreen.hide();
    await tester.pumpAndSettle();
    expect(find.text('Loading...'), findsNothing);
    expect(find.byType(SizedBox), findsWidgets, reason: 'the screen under the dialog is still there');
  });

  test('F1: showInterCommon with no ad loaded opens the screen once and does not throw', () async {
    AdsLoadUtil.commonInterAd = null;
    var opened = 0;
    await AdsLoadUtil().showInterCommon(() {}, () => opened++);
    expect(opened, 1);
  });

  test('setupFbAdsId sends the native factories\' "setToast" arguments when the app has native ad colours', () async {
    setupFbAdsId();
    await Future<void>.delayed(Duration.zero);
    final args = AdsVariable.nativeChannelArgs();
    if (args == null) {
      expect(setToast, isEmpty, reason: 'no native ad keys in remote_config.json: nothing sent');
    } else {
      expect(setToast.single.keys.toSet(), containsAll(['facebookId', 'facebookToken', 'nativeBGColor', 'btnBgColor1', 'btnBgColor2',
          'btnTextColor', 'btnAdTextColor', 'btnAdBgColor', 'headerTextColor', 'bodyTextColor']));
    }
  });
}
