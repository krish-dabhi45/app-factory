import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'ads_id.dart';

/// Remote Config live hai ya default values par app chal rahi hai (settings / debug ke liye).
class RemoteConfigState {
  RemoteConfigState._();

  static bool firebaseReady = false;
  static bool usingRemoteValues = false;
  static String message = 'Not started';
}

/// Remote Config JSON (ek string key, jaise "my_app_v1") -> AdsId.
///
/// 1. `assets/remote_config_default.json` hamesha pehle lagta hai (offline / Firebase na ho tab bhi values).
/// 2. Firebase init. google-services.json / GoogleService-Info.plist na ho to app band nahi hoti.
/// 3. fetchAndActivate (timeout 10 s; minimum interval debug 0, release 5 min).
/// 4. Online JSON defaults ke upar merge: jo key online nahi hai uski default rahti hai.
///    Fetch fail (offline, timeout) ho to Firebase ki pichli activated value (device par saved) — IPTV ki tarah
///    pichle online ids chalte hai (IPTV SharedPreferences me rakhta hai, `ads_splash_utils.dart:32-97`, `197-269`).
class RemoteConfigLoader {
  RemoteConfigLoader._();

  static const defaultsAsset = 'assets/remote_config_default.json';

  static Future<void> load(String remoteConfigKey) async {
    final defaults = jsonDecode(await rootBundle.loadString(defaultsAsset)) as Map<String, dynamic>;
    AdsId.setJson(defaults);

    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
      RemoteConfigState.firebaseReady = true;
    } catch (e) {
      RemoteConfigState.message = 'Firebase not configured. Using default values.';
      debugPrint('RemoteConfigLoader: $e');
      return;
    }

    final remoteConfig = FirebaseRemoteConfig.instance;
    var fetched = true;
    try {
      await remoteConfig.setConfigSettings(RemoteConfigSettings(
        fetchTimeout: const Duration(seconds: 10),
        minimumFetchInterval: kDebugMode ? Duration.zero : const Duration(minutes: 5),
      ));
      await remoteConfig.fetchAndActivate();
    } catch (e) {
      fetched = false;
      debugPrint('RemoteConfigLoader: fetch failed ($e), using the last activated values');
    }
    try {
      final raw = remoteConfig.getString(remoteConfigKey);
      if (raw.isEmpty) {
        RemoteConfigState.message = fetched
            ? 'Remote Config key "$remoteConfigKey" is empty. Using default values.'
            : 'Remote Config fetch failed and nothing was fetched before. Using default values.';
        return;
      }
      AdsId.setJson(merge(defaults, raw));
      RemoteConfigState.usingRemoteValues = true;
      RemoteConfigState.message =
          fetched ? 'Remote Config ($remoteConfigKey) is live.' : 'Remote Config fetch failed. Using the last fetched values.';
    } catch (e) {
      RemoteConfigState.message = 'Remote Config read failed: $e. Using default values.';
    }
  }

  /// Online JSON defaults ke upar. Galat JSON ho to defaults hi rehte hai.
  static Map<String, dynamic> merge(Map<String, dynamic> defaults, String raw) {
    try {
      return {...defaults, ...jsonDecode(raw) as Map<String, dynamic>};
    } catch (e) {
      debugPrint('RemoteConfigLoader: online JSON invalid ($e), using defaults');
      return defaults;
    }
  }
}
