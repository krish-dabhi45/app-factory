import 'package:flutter/foundation.dart';

/// Pure app ki ads ids + online flags.
/// Sab values Firebase Remote Config ki ek JSON key se aati hai (remote_config.dart -> RemoteConfigLoader.load).
///
/// Convention (demo app jaisa): kisi bhi id ki value "11" = wo ad OFF.
/// Debug build me Google test ids use hoti hai (jab tak id "11" na ho), platform ke hisab se.
/// Release build me Google ki demo id (ca-app-pub-3940256099942544/...) kabhi serve nahi hoti: wo "11" maani jaati hai.
class AdsId {
  AdsId._();

  static Map<String, dynamic> _json = {};

  static const off = '11';
  static bool isOff(String id) => id.isEmpty || id == off;

  /// Debug me test ids. Tests release path check karne ke liye false kar sakte hai.
  @visibleForTesting
  static bool useTestIds = kDebugMode;

  // ---------- Google test ids (debug only) ----------
  // Source: developers.google.com/admob/android/test-ads, developers.google.com/admob/ios/test-ads
  static const googleTestPublisher = 'ca-app-pub-3940256099942544';
  static bool get _ios => defaultTargetPlatform == TargetPlatform.iOS;
  static String get _testInterstitial => '$googleTestPublisher/${_ios ? '4411468910' : '1033173712'}';
  static String get _testAppOpen => '$googleTestPublisher/${_ios ? '5575463023' : '9257395921'}';
  static String get _testBanner => '$googleTestPublisher/${_ios ? '2435281174' : '9214589741'}';
  static String get _testNative => '$googleTestPublisher/${_ios ? '3986624511' : '2247696110'}';
  static String get _testRewarded => '$googleTestPublisher/${_ios ? '1712485313' : '5224354917'}';

  /// remote_config.dart Remote Config ka JSON yaha set karta hai.
  static void setJson(Map<String, dynamic> json) {
    _json = Map<String, dynamic>.from(json);
    if (_allOff) disableAllAds(); // premium user: online ids bhi "11"
  }

  /// Koi bhi key padho (default "11" = off).
  static String get(String key, [String def = off]) => (_json[key] ?? def).toString();
  static bool isOn(String key, [String def = '0']) => get(key, def) == '1';

  static bool _allOff = false;

  /// Purchase ke baad (aur premium user ke splash par) call karo:
  /// sabhi ad ids "11" ho jaati hai, isliye koi ad load ya show nahi hoga.
  static void disableAllAds() {
    _allOff = true;
    for (final key in _json.keys.toList()) {
      if (_isAdKey(key)) _json[key] = off;
    }
  }

  /// Sirf tests ke liye: premium state hatao.
  @visibleForTesting
  static void resetForTest() => _allOff = false;

  static bool _isAdKey(String key) =>
      (key.startsWith('fullscreen_') && key != 'fullscreen_on_in_splash_screen') ||
      (key.startsWith('appopen_') && key != 'appopen_on_resume') ||
      key.startsWith('banner_') ||
      key.startsWith('native_') ||
      key.startsWith('rewarded_');

  /// Ad id: remote se, debug me test id. Remote "11" ho (ya purchase ho gaya) to "11" (ad off).
  static String _id(String key, String testId) {
    if (_allOff) return off;
    final v = get(key);
    if (isOff(v)) return off;
    if (useTestIds) return testId;
    return v.startsWith(googleTestPublisher) ? off : v; // release me demo id = off
  }

  static Duration _seconds(String key, int def) => Duration(seconds: int.tryParse(get(key, '$def')) ?? def);

  // ---------- Splash ----------
  static bool get fullscreenOnInSplash => isOn('fullscreen_on_in_splash_screen');
  static String get splashInterstitialHigh => _id('fullscreen_splash_adsId_high', _testInterstitial);
  static String get splashInterstitialNormal => _id('fullscreen_splash_adsId_normal', _testInterstitial);
  static String get splashAppOpenHigh => _id('appopen_splash_high', _testAppOpen);
  static String get splashAppOpenNormal => _id('appopen_splash_normal', _testAppOpen);

  /// Splash ad load ka max wait, phir app aage badhti hai.
  static Duration get splashAdWait => _seconds('splash_ad_wait_seconds', 8);

  // ---------- Interstitial (app ke andar) ----------
  static String get interstitialHigh => _id('fullscreen_preload_high_adsId', _testInterstitial);
  static String get interstitialNormal => _id('fullscreen_preload_normal_adsId', _testInterstitial);

  /// Tap par preloaded interstitial na ho to "Showing Ads..." ke saath max itna wait, phir bina ad aage.
  static Duration get inAppAdWait => _seconds('inapp_ad_wait_seconds', 5);

  /// Screen wise on/off: "fullscreen_home", "fullscreen_gallery" ... "11", "0" ya "" = off.
  static bool screenOn(String screenKey) {
    final v = get(screenKey);
    return !_allOff && !isOff(v) && v != '0';
  }

  /// `<screen>_ad_continue_ads_online`, jaise "home_screen_ad_continue_ads_online".
  static bool screenContinue(String continueKey) => isOn(continueKey);

  static bool get premiumCloseOn => screenOn('fullscreen_premium_close');

  // ---------- App open ----------
  static bool get appOpenOnResume => isOn('appopen_on_resume', '1');
  static String get appOpenHigh => _id('appopen_high', _testAppOpen);
  static String get appOpenNormal => _id('appopen_normal', _testAppOpen);

  // ---------- Banner ----------
  // Collapsible bhi adaptive test id use karta hai (Google ki test-ads table me alag collapsible id nahi hai).
  static String get bannerAdaptive => _id('banner_adaptive', _testBanner);
  static String get bannerCollapsible => _id('banner_collapsible', _testBanner);

  // ---------- Native ----------
  static String get nativeOnboardingHigh => _id('native_onboarding_high', _testNative);
  static String get nativeOnboardingNormal => _id('native_onboarding_normal', _testNative);

  /// Native design ke colors, native factory (Android NativeAdStyle.kt, iOS AppDelegate.swift) ko customOptions me jaate hai.
  static Map<String, Object> get nativeColors => {
        'nativeBGColor': get('nativeBGColor', '222222'),
        'btnBgColor_start': get('btnBgColor_start', 'FFFFFF'),
        'btnBgColor_center': get('btnBgColor_center', ''), // optional, "" = sirf start -> end
        'btnBgColor_end': get('btnBgColor_end', 'FFFFFF'),
        'btnGradientAngle': get('btnGradientAngle', '0'), // 0 = left->right, 90 = bottom->top
        'btnRadius': get('btnRadius', '30'), // dp / pt
        'btnTextColor': get('btnTextColor', '000000'),
        'headerTextColor': get('headerTextColor', 'FFFFFF'),
        'bodyTextColor': get('bodyTextColor', 'DDDDDD'),
      };

  // ---------- Rewarded ----------
  static String get rewardedHigh => _id('rewarded_high', _testRewarded);
  static String get rewardedNormal => _id('rewarded_normal', _testRewarded);

  // ---------- Flow ----------
  static bool get showRatingScreen => isOn('show_rating_screen');
  static bool get showPremiumFirstTime => isOn('show_premium_first_time');
  static bool get showPremiumAfterSplash => isOn('show_premium_after_splash');
}
