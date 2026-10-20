import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'ads_id.dart';

/// Facebook SDK init (COMPULSORY har app me).
/// Id aur client token Firebase Remote Config se aate hai: `facebookId`, `facebookToken`.
/// Native side (MainActivity.kt) me `nativeChannel` -> `initFacebook` handle hota hai.
/// Purchase ho ya na ho, Facebook hamesha init hota hai (ye ad nahi, analytics/attribution hai).
class FacebookInit {
  FacebookInit._();

  static const _channel = MethodChannel('nativeChannel');

  /// Splash me `RemoteConfigLoader.load()` ke baad call karo.
  static Future<void> init() async {
    final id = AdsId.get('facebookId');
    final token = AdsId.get('facebookToken');
    if (AdsId.isOff(id) || AdsId.isOff(token)) {
      debugPrint('FacebookInit: id/token "11", skip');
      return;
    }
    try {
      await _channel.invokeMethod('initFacebook', {'facebookId': id, 'facebookToken': token});
    } catch (e) {
      debugPrint('FacebookInit failed: $e');
    }
  }
}
