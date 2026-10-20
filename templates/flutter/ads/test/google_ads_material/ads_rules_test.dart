import 'package:common_flow_demo/google_ads_material/ad_flags.dart';
import 'package:common_flow_demo/google_ads_material/ad_tap_helper.dart';
import 'package:common_flow_demo/google_ads_material/ads_id.dart';
import 'package:common_flow_demo/google_ads_material/app_open_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/interstitial_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/native_ad_manager.dart';
import 'package:common_flow_demo/google_ads_material/remote_config.dart';
import 'package:common_flow_demo/google_ads_material/rewarded_ad_manager.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

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
    AppResumeAdListener.resetForTest();
    debugDefaultTargetPlatformOverride = null;
  });
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  const home = (screenKey: 'fullscreen_home', continueKey: 'home_screen_ad_continue_ads_online');
  bool homeShows(int flag) => AdTapHelper.shouldShow(screenKey: home.screenKey, continueKey: home.continueKey, flag: flag);

  test('home tap rule: continue "1" = every tap, "0" = flag % 2 == 0', () {
    AdsId.setJson({'fullscreen_home': '1', 'home_screen_ad_continue_ads_online': '1'});
    expect([0, 1, 2, 3].map(homeShows), [true, true, true, true]);
    AdsId.setJson({'fullscreen_home': '1', 'home_screen_ad_continue_ads_online': '0'});
    expect([0, 1, 2, 3].map(homeShows), [true, false, true, false]);
  });

  test('screen gate: "11", "0", "" and a missing key are off; "1" is on', () {
    for (final v in ['11', '0', '']) {
      AdsId.setJson({'fullscreen_home': v, 'home_screen_ad_continue_ads_online': '1'});
      expect(homeShows(0), isFalse, reason: 'fullscreen_home = "$v"');
    }
    AdsId.setJson({'home_screen_ad_continue_ads_online': '1'});
    expect(homeShows(0), isFalse, reason: 'missing key');
    AdsId.setJson({'fullscreen_home': '1', 'fullscreen_premium_close': '0'});
    expect(AdsId.screenOn('fullscreen_home'), isTrue);
    expect(AdsId.premiumCloseOn, isFalse);
  });

  test('debug ids: Google test id of the running platform; "11" stays off', () {
    AdsId.setJson({'fullscreen_preload_high_adsId': 'ca-app-pub-1/1', 'native_onboarding_high': 'ca-app-pub-1/2', 'banner_adaptive': '11'});
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(AdsId.interstitialHigh, 'ca-app-pub-3940256099942544/1033173712');
    expect(AdsId.nativeOnboardingHigh, 'ca-app-pub-3940256099942544/2247696110');
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(AdsId.interstitialHigh, 'ca-app-pub-3940256099942544/4411468910');
    expect(AdsId.nativeOnboardingHigh, 'ca-app-pub-3940256099942544/3986624511');
    expect(AdsId.bannerAdaptive, '11');
  });

  test('release ids: the owner id is used, a Google demo id is never served', () {
    AdsId.useTestIds = false;
    AdsId.setJson({
      'fullscreen_preload_high_adsId': 'ca-app-pub-123/456',
      'fullscreen_preload_normal_adsId': 'ca-app-pub-3940256099942544/1033173712',
    });
    expect(AdsId.interstitialHigh, 'ca-app-pub-123/456');
    expect(AdsId.interstitialNormal, '11');
    expect(AdsId.rewardedHigh, '11', reason: 'missing key = off');
  });

  test('premium: every ad id "11", also after a later setJson; flags and Facebook untouched', () {
    final json = {
      'fullscreen_preload_high_adsId': 'ca-app-pub-x/1',
      'banner_adaptive': 'ca-app-pub-x/2',
      'fullscreen_home': '1',
      'fullscreen_on_in_splash_screen': '1',
      'appopen_on_resume': '1',
      'facebookId': '123',
    };
    AdsId.setJson(json);
    AdFlags.isPremium = true;
    AdsId.disableAllAds();
    AdsId.setJson(json); // e.g. Remote Config arrives after the purchase check
    expect(AdsId.interstitialHigh, '11');
    expect(AdsId.bannerAdaptive, '11');
    expect(AdsId.screenOn('fullscreen_home'), isFalse);
    expect(AdsId.fullscreenOnInSplash, isTrue);
    expect(AdsId.get('facebookId'), '123');
  });

  test('wait times come from Remote Config, defaults 8 s / 5 s', () {
    expect(AdsId.splashAdWait, const Duration(seconds: 8));
    expect(AdsId.inAppAdWait, const Duration(seconds: 5));
    AdsId.setJson({'splash_ad_wait_seconds': '3', 'inapp_ad_wait_seconds': 'x'});
    expect(AdsId.splashAdWait, const Duration(seconds: 3));
    expect(AdsId.inAppAdWait, const Duration(seconds: 5), reason: 'invalid value keeps the default');
  });

  test('Remote Config merge: online wins, missing keys keep defaults, invalid JSON keeps defaults', () {
    final defaults = {'fullscreen_home': '1', 'banner_adaptive': 'ca-app-pub-x/2'};
    expect(RemoteConfigLoader.merge(defaults, '{"fullscreen_home":"11","new_key":"1"}'),
        {'fullscreen_home': '11', 'banner_adaptive': 'ca-app-pub-x/2', 'new_key': '1'});
    expect(RemoteConfigLoader.merge(defaults, '{not json'), defaults);
    expect(RemoteConfigLoader.merge(defaults, '[1,2]'), defaults);
  });

  test('resume app open: only after home, skip window, blocked screen, no double full-screen, premium', () {
    AdsId.setJson({'appopen_on_resume': '1'});
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'before home');
    AppResumeAdListener.enabled = true;
    expect(AppResumeAdListener.shouldShowOnForeground(), isTrue);

    AppResumeAdListener.skipNextResume();
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'back from share / store / ad click');
    expect(AppResumeAdListener.shouldShowOnForeground(), isTrue, reason: 'skip is used once');

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
    AdsId.setJson({'appopen_on_resume': '0'});
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'remote toggle off');
    AdsId.setJson({'appopen_on_resume': '1'});
    AdFlags.isPremium = true;
    expect(AppResumeAdListener.shouldShowOnForeground(), isFalse, reason: 'premium');
  });

  test('without consent (adsReady false) no slot loads and show() goes straight on', () async {
    AdsId.setJson({
      'fullscreen_preload_high_adsId': 'ca-app-pub-x/1',
      'appopen_high': 'ca-app-pub-x/2',
      'native_onboarding_high': 'ca-app-pub-x/3',
      'rewarded_high': 'ca-app-pub-x/4',
    });
    expect(await InterstitialAdManager.main.preload(), isFalse);
    expect(await AppOpenAdManager.resume.preload(), isFalse);
    expect(await NativeAdManager.onboarding.preload(), isNull);
    expect(await RewardedAdManager.preload(), isFalse);
    var done = 0;
    expect(await InterstitialAdManager.main.show(onDone: () => done++), isFalse);
    expect(done, 1);
  });

  test('an interstitial never opens over another full-screen ad', () async {
    AdFlags.adsReady = true;
    AdFlags.isFullScreenAdShowing = true;
    AdsId.setJson({'fullscreen_preload_high_adsId': 'ca-app-pub-x/1'});
    var done = 0;
    expect(await InterstitialAdManager.main.show(onDone: () => done++), isFalse);
    expect(done, 1);
  });
}
