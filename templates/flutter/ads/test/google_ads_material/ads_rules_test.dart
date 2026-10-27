import 'dart:ui' show AppLifecycleState;

import 'package:common_flow_demo/google_ads_material/ad_flags.dart';
import 'package:common_flow_demo/google_ads_material/ad_tap_helper.dart';
import 'package:common_flow_demo/google_ads_material/ads_id.dart';
import 'package:common_flow_demo/google_ads_material/app_open_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/interstitial_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/native_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/native_ad_widget.dart';
import 'package:common_flow_demo/google_ads_material/remote_config.dart';
import 'package:common_flow_demo/google_ads_material/rewarded_ad_manager.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

// Pure rules of the ads + Remote Config layer. No SDK call is made: every path tested here
// returns before google_mobile_ads is touched.
void main() {
  setUp(() {
    AdsId.resetForTest();
    AdsId.useTestIds = true;
    AdsId.setJson({});
    AdFlags.isPremium = false;
    AdFlags.isFullScreenAdShowing = false;
    AdFlags.adsReady = false;
    AdFlags.homeFlag = 0;
    AppResumeAdListener.resetForTest();
    debugDefaultTargetPlatformOverride = null;
  });
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('home tap rule (IPTV onTapInter): homeFlagOnline "0" = every tap, otherwise flag % 2 == 0', () {
    expect([0, 1, 2, 3].map((f) => AdTapHelper.homeTapShows(f, everyTap: true)), [true, true, true, true]);
    expect([0, 1, 2, 3].map((f) => AdTapHelper.homeTapShows(f, everyTap: false)), [true, false, true, false]);
    AdsId.setJson({'homeFlagOnline': '0'});
    expect(AdsId.homeAdEveryTap, isTrue);
    AdsId.setJson({'homeFlagOnline': '1'});
    expect(AdsId.homeAdEveryTap, isFalse);
    AdsId.setJson({});
    expect(AdsId.homeAdEveryTap, isFalse, reason: 'missing = every second tap');
  });

  test('home tap: coming back from the opened screen makes the next tap show an ad', () async {
    AdsId.setJson({'interPreLoad': '11'});
    AdFlags.homeFlag = 1; // e.g. a returning launch after the splash ad
    AdTapHelper.onReturn();
    expect(AdFlags.homeFlag, 2, reason: 'odd -> even on return');
    AdTapHelper.onReturn();
    expect(AdFlags.homeFlag, 2, reason: 'even stays');

    var opened = 0;
    AdTapHelper.onHomeTap(() => opened++); // interPreLoad "11": no ad, no count
    await Future<void>.delayed(Duration.zero);
    expect((opened, AdFlags.homeFlag), (1, 2));
  });

  test('gates: adShowHomeFlag switches off interPreLoad + nativeHome, adShowIntroFlag nativeIntroBig', () {
    final ids = {'interPreLoad': 'ca-app-pub-1/1', 'nativeHome': 'ca-app-pub-1/2', 'nativeIntroBig': 'ca-app-pub-1/3', 'banner': 'ca-app-pub-1/4'};
    AdsId.setJson({...ids, 'adShowHomeFlag': '1', 'adShowIntroFlag': '1'});
    expect(InterstitialAdManager.main.isOff || NativeAdManager.home.isOff || NativeAdManager.intro.isOff, isFalse);
    AdsId.setJson({...ids, 'adShowHomeFlag': '0', 'adShowIntroFlag': '1'});
    expect((InterstitialAdManager.main.isOff, NativeAdManager.home.isOff, NativeAdManager.intro.isOff), (true, true, false));
    AdsId.setJson({...ids, 'adShowHomeFlag': '1', 'adShowIntroFlag': '0'});
    expect((InterstitialAdManager.main.isOff, NativeAdManager.home.isOff, NativeAdManager.intro.isOff), (false, false, true));
    expect(AdsId.unit('banner'), isNot('11'), reason: 'banner has no gate');
    AdsId.setJson(ids);
    expect(NativeAdManager.home.isOff, isFalse, reason: 'missing gate flag = on');
  });

  test('splash: appOpenSplash set = app open, otherwise interSplash', () {
    AdsId.setJson({'appOpenSplash': '11', 'interSplash': 'ca-app-pub-1/1'});
    expect(AdsId.splashUsesAppOpen, isFalse);
    AdsId.setJson({'appOpenSplash': 'ca-app-pub-1/2', 'interSplash': 'ca-app-pub-1/1'});
    expect(AdsId.splashUsesAppOpen, isTrue);
  });

  test('debug ids: Google test id of the key\'s format and the running platform; "11" stays off', () {
    AdsId.setJson({'interPreLoad': 'ca-app-pub-1/1', 'nativeIntroBig': 'ca-app-pub-1/2', 'appOpenAds': 'x', 'banner': '11', 'nativeBGColor': '#FFFFFF'});
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(AdsId.unit('interPreLoad'), 'ca-app-pub-3940256099942544/1033173712');
    expect(AdsId.unit('nativeIntroBig'), 'ca-app-pub-3940256099942544/2247696110');
    expect(AdsId.unit('appOpenAds'), 'ca-app-pub-3940256099942544/9257395921');
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(AdsId.unit('interPreLoad'), 'ca-app-pub-3940256099942544/4411468910');
    expect(AdsId.unit('nativeIntroBig'), 'ca-app-pub-3940256099942544/3986624511');
    expect(AdsId.unit('appOpenAds'), 'ca-app-pub-3940256099942544/5575463023');
    expect(AdsId.unit('banner'), '11');
  });

  test('release ids: the owner id is used, a Google demo id is never served', () {
    AdsId.useTestIds = false;
    AdsId.setJson({
      'interPreLoad': 'ca-app-pub-123/456',
      'interSplash': 'ca-app-pub-3940256099942544/1033173712',
    });
    expect(AdsId.unit('interPreLoad'), 'ca-app-pub-123/456');
    expect(AdsId.unit('interSplash'), '11');
    expect(AdsId.unit('rewarded'), '11', reason: 'missing key = off');
  });

  test('premium: every ad id "11", also after a later setJson; flags, colours and Facebook untouched', () {
    final json = {
      'interPreLoad': 'ca-app-pub-x/1',
      'banner': 'ca-app-pub-x/2',
      'nativeHome': 'ca-app-pub-x/3',
      'appOpenPremium': 'ca-app-pub-x/4',
      'adShowHomeFlag': '1',
      'nativeBGColor': '#FFFFFF',
      'facebookId': '123',
    };
    AdsId.setJson(json);
    AdFlags.isPremium = true;
    AdsId.disableAllAds();
    AdsId.setJson(json); // e.g. Remote Config arrives after the purchase check
    for (final k in ['interPreLoad', 'banner', 'nativeHome', 'appOpenPremium']) {
      expect(AdsId.unit(k), '11', reason: k);
      expect(AdsId.get(k), '11', reason: k);
    }
    expect(AdsId.get('adShowHomeFlag'), '1');
    expect(AdsId.get('nativeBGColor'), '#FFFFFF', reason: 'a colour key is not an ad key');
    expect(AdsId.get('facebookId'), '123');
  });

  test('revenue: sendRevenueToAnalytics and sendRevenueToAnalyticsFor<Key>, true or "1"; missing = on', () {
    expect(AdsId.revenueOn('interPreLoad'), isTrue);
    AdsId.setJson({'sendRevenueToAnalytics': true, 'sendRevenueToAnalyticsForInterPreLoad': false});
    expect(AdsId.revenueOn('interPreLoad'), isFalse);
    expect(AdsId.revenueOn('banner'), isTrue);
    AdsId.setJson({'sendRevenueToAnalytics': '0'});
    expect(AdsId.revenueOn('banner'), isFalse);
  });

  test('wait times come from Remote Config, defaults 8 s / 2 s (IPTV tap loader: fixed 2 s)', () {
    expect(AdsId.splashAdWait, const Duration(seconds: 8));
    expect(AdsId.inAppAdWait, const Duration(seconds: 2));
    AdsId.setJson({'splashAdWaitSeconds': '3', 'inAppAdWaitSeconds': 'x'});
    expect(AdsId.splashAdWait, const Duration(seconds: 3));
    expect(AdsId.inAppAdWait, const Duration(seconds: 2), reason: 'invalid value keeps the default');
  });

  test('Remote Config merge: online wins, missing keys keep defaults, invalid JSON keeps defaults', () {
    final defaults = {'adShowHomeFlag': '1', 'banner': 'ca-app-pub-x/2'};
    expect(RemoteConfigLoader.merge(defaults, '{"adShowHomeFlag":"0","newKey":"1"}'),
        {'adShowHomeFlag': '0', 'banner': 'ca-app-pub-x/2', 'newKey': '1'});
    expect(RemoteConfigLoader.merge(defaults, '{not json'), defaults);
    expect(RemoteConfigLoader.merge(defaults, '[1,2]'), defaults);
  });

  test('resume app open: only after home, skip window, blocked screen, no double full-screen, premium, appOpenAds "11"', () {
    AdsId.setJson({'appOpenAds': 'ca-app-pub-x/1'});
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'before home');
    AppResumeAdListener.enabled = true;
    expect(AppResumeAdListener.shouldShowOnForeground(), isTrue);

    AppResumeAdListener.skipNextResume();
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'back from share / store / ad click');
    expect(AppResumeAdListener.shouldShowOnForeground(), isTrue, reason: 'skip is used once');

    // share sheet closed: the app was only inactive (no background / foreground event) -> the skip is dropped
    AppResumeAdListener.skipNextResume();
    AppResumeAdListener.lifecycle(AppLifecycleState.inactive);
    AppResumeAdListener.lifecycle(AppLifecycleState.resumed);
    expect(AppResumeAdListener.shouldShowOnForeground(), isTrue, reason: 'next Home -> return after a share sheet');
    // browser / store: the app was hidden, the skip stays for the foreground event
    AppResumeAdListener.skipNextResume();
    for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused, AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
      AppResumeAdListener.lifecycle(s);
    }
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'back from the browser');

    AppResumeAdListener.block();
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'premium screen open');
    AppResumeAdListener.unblock();
    AppResumeAdListener.unblock(); // extra unblock never goes negative
    AppResumeAdListener.block();
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse);
    AppResumeAdListener.unblock();
    expect(AppResumeAdListener.shouldShowOnForeground(), isTrue);

    AdFlags.isFullScreenAdShowing = true;
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'interstitial on screen');
    AdFlags.isFullScreenAdShowing = false;
    AdsId.setJson({'appOpenAds': '11'});
    expect(AppOpenAdManager.resume.isOff, isTrue, reason: 'appOpenAds "11" = no resume ad');
    AdFlags.isPremium = true;
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'premium');
  });

  test('without consent (adsReady false) no slot loads and show() goes straight on', () async {
    AdsId.setJson({
      'interPreLoad': 'ca-app-pub-x/1',
      'appOpenAds': 'ca-app-pub-x/2',
      'nativeIntroBig': 'ca-app-pub-x/3',
      'rewarded': 'ca-app-pub-x/4',
    });
    expect(await InterstitialAdManager.main.preload(), isFalse);
    expect(await AppOpenAdManager.resume.preload(), isFalse);
    expect(await NativeAdManager.intro.preload(), isNull);
    expect(await RewardedAdManager.preload(), isFalse);
    var done = 0;
    expect(await InterstitialAdManager.main.show(onDone: () => done++), isFalse);
    expect(done, 1);
  });

  test('an interstitial never opens over another full-screen ad', () async {
    AdFlags.adsReady = true;
    AdFlags.isFullScreenAdShowing = true;
    AdsId.setJson({'interPreLoad': 'ca-app-pub-x/1'});
    var done = 0;
    expect(await InterstitialAdManager.main.show(onDone: () => done++), isFalse);
    expect(done, 1);
  });

  test('intro ad: appOpenIntro only (no interstitial fallback); "11" or not loaded = go on at once', () {
    var done = 0;
    AdsId.setJson({'appOpenIntro': '11'});
    AppOpenAdManager.intro.show(onDone: () => done++, preloadAfter: false);
    expect(done, 1, reason: '"11": straight on');
    AdsId.setJson({'appOpenIntro': 'ca-app-pub-x/1'});
    AppOpenAdManager.intro.show(onDone: () => done++, preloadAfter: false);
    expect(done, 2, reason: 'not loaded: no wait, no loader');
  });

  test('a pinned native is drawn only when the screen keeps minSpaceLeft for its own content (intro: 240 next to the 310 big native)', () {
    bool fits(double screen) => NativeAdWidget.fitsScreen(screenHeight: screen, adHeight: 310, minSpaceLeft: 240);
    expect(fits(805), isTrue, reason: 'Samsung M04 portrait window');
    expect(fits(592), isTrue, reason: 'a 360x640 dp phone with its 48 dp navigation bar outside the window');
    expect(fits(549), isFalse);
    expect(fits(384), isFalse, reason: 'Samsung M04 landscape window');
  });

  test('full-screen callback: openBehind = next screen 1 s after the impression, onDone exactly once', () async {
    var done = 0, after = 0;
    final behind = fullScreenCallback<InterstitialAd>(onDone: () => done++, openBehind: true, after: () => after++);
    behind.onAdShowedFullScreenContent!(_FakeAd());
    expect(AdFlags.isFullScreenAdShowing, isTrue);
    behind.onAdImpression!(_FakeAd());
    expect(done, 0, reason: 'not yet: 1 s after the impression');
    await Future<void>.delayed(const Duration(milliseconds: 1100));
    expect(done, 1, reason: 'the next screen opens behind the ad');
    behind.onAdDismissedFullScreenContent!(_FakeAd());
    expect(done, 1, reason: 'closing the ad does not open it again');
    expect(after, 1);
    expect(AdFlags.isFullScreenAdShowing, isFalse);

    done = 0;
    final onClose = fullScreenCallback<InterstitialAd>(onDone: () => done++);
    onClose.onAdImpression!(_FakeAd());
    await Future<void>.delayed(const Duration(milliseconds: 1100));
    expect(done, 0, reason: 'without openBehind: only when closed');
    onClose.onAdDismissedFullScreenContent!(_FakeAd());
    expect(done, 1);

    done = 0;
    fullScreenCallback<InterstitialAd>(onDone: () => done++, openBehind: true)
        .onAdFailedToShowFullScreenContent!(_FakeAd(), AdError(0, 'd', 'm'));
    expect(done, 1, reason: 'failed to show: at once');
  });
}

class _FakeAd extends Fake implements InterstitialAd {
  @override
  Future<void> dispose() async {}
}
