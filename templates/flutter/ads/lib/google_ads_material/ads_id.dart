import 'package:flutter/foundation.dart';

/// Pure app ki ads ids + online flags.
/// Sab values Firebase Remote Config ki ek JSON key se aati hai (remote_config.dart -> RemoteConfigLoader.load).
/// Key names IPTV app (config.json) jaise: appOpenAds, interSplash, nativeHome ...
///
/// Convention: kisi bhi id ki value "11" (ya "") = wo ad OFF.
/// Ad key = format prefix + jagah: `appOpen<Place>`, `inter<Place>`, `native<Place>`, `banner<Place>`, `rewarded<Place>`
/// (rang wali keys jaise nativeBGColor ad key nahi). Nayi jagah = nayi key, isi naming se.
/// Debug build me Google test ids use hoti hai (jab tak id "11" na ho), format aur platform ke hisab se.
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
  static String _testId(String key) {
    final unit = switch (_format(key)) {
      'appOpen' => _ios ? '5575463023' : '9257395921',
      'inter' => _ios ? '4411468910' : '1033173712',
      'native' => _ios ? '3986624511' : '2247696110',
      'banner' => _ios ? '2435281174' : '9214589741',
      _ => _ios ? '1712485313' : '5224354917', // rewarded
    };
    return '$googleTestPublisher/$unit';
  }

  static final _adKey = RegExp(r'^(appOpen|inter|native|banner|rewarded)([A-Z]\w*)?$');
  static String? _format(String key) => key.endsWith('Color') ? null : _adKey.firstMatch(key)?.group(1);
  static bool _isAdKey(String key) => _format(key) != null;

  /// Screen flags jo ad ids ko band karte hai (IPTV: adShowHomeFlag home ka native + tap interstitial,
  /// adShowIntroFlag intro ka native). Flag "1" nahi -> wo ids "11".
  static const gates = {
    'interPreLoad': 'adShowHomeFlag',
    'nativeHome': 'adShowHomeFlag',
    'nativeIntroBig': 'adShowIntroFlag',
  };

  /// remote_config.dart Remote Config ka JSON yaha set karta hai.
  static void setJson(Map<String, dynamic> json) {
    _json = Map<String, dynamic>.from(json);
    if (_allOff) disableAllAds(); // premium user: online ids bhi "11"
  }

  /// Koi bhi key padho (default "11" = off).
  static String get(String key, [String def = off]) => (_json[key] ?? def).toString();

  /// "1" ya true = on (IPTV JSON me dono hai: "adShowHomeFlag": "1", "sendRevenueToAnalytics": true).
  static bool isOn(String key, [String def = '0']) => const {'1', 'true'}.contains(get(key, def));

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

  /// Ad id: remote se, debug me test id. Remote "11" ho, gate flag off ho, ya purchase ho gaya to "11" (ad off).
  static String unit(String key) {
    if (_allOff) return off;
    final gate = gates[key];
    if (gate != null && !isOn(gate, '1')) return off;
    final v = get(key);
    if (isOff(v)) return off;
    if (useTestIds) return _testId(key);
    return v.startsWith(googleTestPublisher) ? off : v; // release me demo id = off
  }

  /// `sendRevenueToAnalytics` (sab ads) aur `sendRevenueToAnalyticsFor<Key>` (ek ad), dono on hone chahiye.
  /// Key na ho = on.
  static bool revenueOn(String key) =>
      isOn('sendRevenueToAnalytics', '1') && isOn('sendRevenueToAnalyticsFor${key[0].toUpperCase()}${key.substring(1)}', '1');

  static Duration _seconds(String key, int def) => Duration(seconds: int.tryParse(get(key, '$def')) ?? def);

  // ---------- Splash ----------
  /// `appOpenSplash` set ho to splash par app open, warna `interSplash` interstitial (IPTV jaisa).
  static bool get splashUsesAppOpen => !isOff(unit('appOpenSplash'));

  /// Splash ad load ka max wait, phir app aage badhti hai.
  static Duration get splashAdWait => _seconds('splashAdWaitSeconds', 8);

  // ---------- Interstitial (app ke andar) ----------
  /// Tap par preloaded interstitial na ho to "Showing Ads..." ke saath max itna wait, phir bina ad aage.
  static Duration get inAppAdWait => _seconds('inAppAdWaitSeconds', 5);

  /// `homeFlagOnline` "0" = home ke har tap par ad; "1" = har dusre tap par (homeFlag % 2 == 0).
  static bool get homeAdEveryTap => get('homeFlagOnline', '1') == '0';

  /// Native design ke colors, native factory (Android NativeAdStyle.kt, iOS AppDelegate.swift) ko customOptions me jaate hai.
  /// "#RRGGBB", "RRGGBB" ya "AARRGGBB".
  static Map<String, Object> get nativeColors => {
        'nativeBGColor': get('nativeBGColor', '222222'),
        'btnBgColor1': get('btnBgColor1', 'FFFFFF'), // CTA gradient start
        'btnBgColor2': get('btnBgColor2', 'FFFFFF'), // CTA gradient end (1 = 2 -> solid)
        'btnGradientAngle': get('btnGradientAngle', '0'), // 0 = left->right, 90 = bottom->top
        'btnRadius': get('btnRadius', '30'), // dp / pt
        'btnTextColor': get('btnTextColor', '000000'),
        'headerTextColor': get('headerTextColor', 'FFFFFF'),
        'bodyTextColor': get('bodyTextColor', 'DDDDDD'),
        'btnAdBgColor': get('btnAdBgColor', 'FFB300'), // "Ad" badge
        'btnAdTextColor': get('btnAdTextColor', 'FFFFFF'),
      };

  // ---------- Flow ----------
  static bool get showRateScreen => isOn('showRateScreen');
  static bool get showPremiumFirstTime => isOn('showPremiumFirstTime');
  static bool get showPremiumAfterSplash => isOn('showPremiumAfterSplash');
}
