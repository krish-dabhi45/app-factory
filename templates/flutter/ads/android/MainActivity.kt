package com.demo.common_flow_demo

// IPTV_two android/.../MainActivity.kt, the MainActivity class as it is: "nativeChannel" → "setToast" takes the
// Remote Config colours and Facebook id/token from Dart (AdsSplashUtils.setupFbAdsId), starts Facebook and registers
// the three native factories (NativeAds.kt) with those colours.

import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.RatingBar
import android.widget.TextView
import com.google.android.gms.ads.nativead.NativeAd
import io.flutter.embedding.android.FlutterActivity
import com.google.android.gms.ads.nativead.NativeAdView
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugins.googlemobileads.GoogleMobileAdsPlugin
import com.facebook.FacebookSdk
import com.facebook.LoggingBehavior
import com.facebook.appevents.AppEventsLogger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import android.widget.Toast
import io.flutter.plugins.GeneratedPluginRegistrant
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.widget.FrameLayout
import io.flutter.plugins.googlemobileads.NativeAdFactory

class MainActivity : FlutterActivity() {


    private var nativeBGColor: String = ""
//    private var nativeBGColor: String = "#f2eded"

//    private var btnBgColor: String = ""
//    private var btnBgColor: String = "#000000"

    private var btnBgColor1: String = ""
//    private var btnBgColor1: String = "#000000"

    private var btnBgColor2: String = ""
//    private var btnBgColor2: String = "#000000"

    private var btnTextColor: String = ""
//    private var btnTextColor: String = "#FFFFFF"

    private var btnAdTextColor: String = ""
//    private var btnAdTextColor: String = "#FFFFFF"

    private var btnAdBgColor: String = ""
//    private var btnAdBgColor: String = "#FFFFFF"

    private var headerTextColor: String = ""
//    private var headerTextColor: String = "#000000"

    private var bodyTextColor: String = ""

    //    private var bodyTextColor: String = "#000000"
    private var facebookId: String = ""
    private var facebookToken: String = ""

    private fun setText(myText: String) {
        Toast.makeText(this, myText, Toast.LENGTH_SHORT).show()
    }

    private val CHANNEL = "nativeChannel"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        GeneratedPluginRegistrant.registerWith(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            CHANNEL
        )
            .setMethodCallHandler { call: MethodCall, result ->
                when (call.method) {
                    "setToast" -> {
                        try {
                            val fb_appid =
                                call.argument<String>("facebookId")!!
                            val fb_token =
                                call.argument<String>("facebookToken")!!
                            nativeBGColor =
                                call.argument<String>("nativeBGColor")!!
//                            btnBgColor = call.argument<String>("btnBgColor")!!
                            btnBgColor1 =
                                call.argument<String>("btnBgColor1")!!
                            btnBgColor2 =
                                call.argument<String>("btnBgColor2")!!
                            btnTextColor =
                                call.argument<String>("btnTextColor")!!
                            btnAdTextColor =
                                call.argument<String>("btnAdTextColor")!!
                            btnAdBgColor =
                                call.argument<String>("btnAdBgColor")!!
                            headerTextColor =
                                call.argument<String>("headerTextColor")!!
                            bodyTextColor =
                                call.argument<String>("bodyTextColor")!!

                            android.util.Log.d(
                                "TAG",
                                "configureFlutterEngine: "
                            )
//                            android.util.Log.d("btnBgColor-->", btnBgColor)
                            /// Commet below line before submission of project for stop toast message
//                            setText("nativeBGColor : " + nativeBGColor)
                            FacebookSdk.setApplicationId(fb_appid)
                            FacebookSdk.setClientToken(fb_token)
                            FacebookSdk.sdkInitialize(this@MainActivity)
                            FacebookSdk.setAutoInitEnabled(true)
                            FacebookSdk.fullyInitialize()
                            FacebookSdk.setAutoLogAppEventsEnabled(
                                true
                            )
                            FacebookSdk.addLoggingBehavior(
                                LoggingBehavior.APP_EVENTS
                            )
                            AppEventsLogger.newLogger(this@MainActivity).applicationId
                            GoogleMobileAdsPlugin.registerNativeAdFactory(
                                flutterEngine,
                                "fullNativeAds",
                                NativeAdFull(
                                    layoutInflater,
                                    nativeBGColor,
//                                    btnBgColor,
                                    btnBgColor1,
                                    btnBgColor2,
                                    btnTextColor,
                                    headerTextColor,
                                    bodyTextColor
                                )
                            )
                            GoogleMobileAdsPlugin.registerNativeAdFactory(
                                flutterEngine,
                                "bigNativeAds",
                                NativeAdBig(
                                    layoutInflater,
                                    nativeBGColor,
//                                    btnBgColor,
                                    btnBgColor1,
                                    btnBgColor2,
                                    btnTextColor,
                                    headerTextColor,
                                    bodyTextColor
                                )
                            )
                            GoogleMobileAdsPlugin.registerNativeAdFactory(
                                flutterEngine,
                                "smallNativeAds",
                                NativeAdSmall(
                                    layoutInflater,
                                    nativeBGColor,
//                                    btnBgColor,
                                    btnBgColor1,
                                    btnBgColor2,
                                    btnTextColor,
                                    headerTextColor,
                                    bodyTextColor
                                )
                            )
                        } catch (e: Exception) {
                        }
                        result.success(true)
                    }
                }

            }
        flutterEngine.plugins.add(GoogleMobileAdsPlugin())
        super.configureFlutterEngine(flutterEngine)
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        GoogleMobileAdsPlugin.unregisterNativeAdFactory(
            flutterEngine,
            "fullNativeAds"
        )
        GoogleMobileAdsPlugin.unregisterNativeAdFactory(
            flutterEngine,
            "bigNativeAds"
        )
        GoogleMobileAdsPlugin.unregisterNativeAdFactory(
            flutterEngine,
            "smallNativeAds"
        )
    }

}
