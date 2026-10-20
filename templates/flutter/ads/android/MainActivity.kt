package com.demo.common_flow_demo

import com.facebook.FacebookSdk
import com.facebook.appevents.AppEventsLogger
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugins.googlemobileads.GoogleMobileAdsPlugin

class MainActivity : FlutterActivity() {

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Native ad factories (Flutter NativeFactory ids se match)
        GoogleMobileAdsPlugin.registerNativeAdFactory(
            flutterEngine, "smallNative", SmallNativeAdFactory(layoutInflater)
        )

        // Facebook init: id + token Firebase Remote Config se (Flutter: FacebookInit.init())
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "nativeChannel")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "initFacebook" -> {
                        val id = call.argument<String>("facebookId").orEmpty()
                        val token = call.argument<String>("facebookToken").orEmpty()
                        if (id.isEmpty() || id == "11" || token.isEmpty() || token == "11") {
                            result.success(false)
                            return@setMethodCallHandler
                        }
                        try {
                            FacebookSdk.setApplicationId(id)
                            FacebookSdk.setClientToken(token)
                            FacebookSdk.setAutoInitEnabled(true)
                            FacebookSdk.setAutoLogAppEventsEnabled(true)
                            FacebookSdk.setAdvertiserIDCollectionEnabled(true)
                            @Suppress("DEPRECATION")
                            FacebookSdk.sdkInitialize(applicationContext)
                            AppEventsLogger.activateApp(application)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("FB_INIT", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        GoogleMobileAdsPlugin.unregisterNativeAdFactory(flutterEngine, "smallNative")
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
