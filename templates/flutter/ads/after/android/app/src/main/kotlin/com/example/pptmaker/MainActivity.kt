package com.example.pptmaker

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
import io.flutter.plugins.googlemobileads.GoogleMobileAdsPlugin.NativeAdFactory

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


//Full Native
class NativeAdFull(
    private val layoutInflater: LayoutInflater,
    private val nativeBGColor: String,
//    private val btnBgColor: String,
    private val btnBgColor1: String,
    private val btnBgColor2: String,
    private val btnTextColor: String,
    private val headerTextColor: String,
    private val bodyTextColor: String
) : NativeAdFactory {

    override fun createNativeAd(
        nativeAd: NativeAd?,
        customOptions: MutableMap<String, Any>?
    ): NativeAdView {
        val adView = layoutInflater.inflate(
            R.layout.native_admob_full,
            null
        ) as NativeAdView

        val circularLayoutBackground: FrameLayout =
            adView.findViewById(R.id.flNativeAds)
        val backgroundGradientDrawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(Color.parseColor(nativeBGColor))
//            setColor(Color.parseColor("#" + nativeBGColor))
//            this.cornerRadius = cornerRadius
        }
        circularLayoutBackground.background =
            backgroundGradientDrawable
        // Set views

        adView.mediaView = adView.findViewById(R.id.ad_media)

        adView.headlineView = adView.findViewById(R.id.ad_headline)
        adView.bodyView = adView.findViewById(R.id.ad_body)
        adView.callToActionView =
            adView.findViewById(R.id.ad_call_to_action)
        adView.iconView = adView.findViewById(R.id.ad_icon)
        adView.advertiserView =
            adView.findViewById(R.id.ad_advertiser)
        adView.starRatingView = adView.findViewById(R.id.ad_stars)
        adView.priceView = adView.findViewById(R.id.ad_attribution)

        // Headline
        nativeAd?.headline?.let {
            (adView.headlineView as TextView).text = it
            (adView.headlineView as TextView).setTextColor(
                Color.parseColor(
                    headerTextColor
                )
            )
        }

        adView.mediaView?.mediaContent = nativeAd?.mediaContent
        // Body
        if (nativeAd?.body != null) {
            (adView.bodyView as TextView).text = nativeAd.body
            (adView.bodyView as TextView).setTextColor(
                Color.parseColor(
                    bodyTextColor
                )
            )
            adView.bodyView?.visibility = View.VISIBLE
        } else {
            adView.bodyView?.visibility = View.GONE
        }

        val priceGradientDrawable = GradientDrawable(
            GradientDrawable.Orientation.TR_BL, // 135 degrees
            intArrayOf(
                Color.parseColor(btnBgColor1),
                Color.parseColor(btnBgColor2),
//                Color.parseColor(btnBgColor)
            )
        ).apply {
            cornerRadii = floatArrayOf(
                0f * adView.context.resources.displayMetrics.density,
                0f * adView.context.resources.displayMetrics.density, // top-left radius
                0f,
                0f, // top-right radius
                0f,
                0f, // bottom-right radius
                0f * adView.context.resources.displayMetrics.density,
                0f * adView.context.resources.displayMetrics.density  // bottom-left radius
            )
        }
        adView.priceView?.background = priceGradientDrawable
        (adView.priceView as? TextView)?.setTextColor(
            Color.parseColor(
                btnTextColor
            )
        )


        // Call to action button
        /*if (nativeAd?.callToAction != null) {
            (adView.callToActionView as Button).text =
                nativeAd.callToAction
            (adView.callToActionView as Button).setTextColor(
                Color.parseColor(
                    btnTextColor
                )
            )
            val gradient = GradientDrawable(
                GradientDrawable.Orientation.TR_BL,
                intArrayOf(
//                    Color.parseColor(btnBgColor),
                    Color.parseColor(btnBgColor2),
                    Color.parseColor(btnBgColor1),
                )
            )
            gradient.cornerRadius =
                14f * adView.context.resources.displayMetrics.density
            adView.callToActionView?.background = gradient
            adView.callToActionView?.visibility = View.VISIBLE
        } else {
            adView.callToActionView?.visibility = View.GONE
        }*/

        // Call to action button
        if (nativeAd?.callToAction != null) {

            val ctaButton = adView.callToActionView as Button

            ctaButton.text = nativeAd.callToAction
            ctaButton.setTextColor(Color.parseColor(btnTextColor))

            val ctaGradientDrawable = GradientDrawable(
                GradientDrawable.Orientation.TR_BL,
                intArrayOf(
                    Color.parseColor(btnBgColor2),
                    Color.parseColor(btnBgColor1)
                )
            ).apply {

                shape = GradientDrawable.RECTANGLE

                cornerRadius =
                    10f * adView.context.resources.displayMetrics.density
            }

            ctaButton.background = ctaGradientDrawable

            ctaButton.visibility = View.VISIBLE

        } else {
            adView.callToActionView?.visibility = View.GONE
        }

        // Icon
        if (nativeAd?.icon != null) {
            (adView.iconView as ImageView).setImageDrawable(nativeAd.icon?.drawable)
            adView.iconView?.visibility = View.VISIBLE
        } else {
            adView.iconView?.visibility = View.GONE
        }

        // Advertiser
        if (nativeAd?.advertiser != null) {
            (adView.advertiserView as TextView).text =
                nativeAd.advertiser
            adView.advertiserView?.visibility = View.VISIBLE
        } else {
            adView.advertiserView?.visibility = View.GONE
        }

        // Star rating
        if (nativeAd?.starRating != null) {
            (adView.starRatingView as RatingBar).rating =
                nativeAd.starRating!!.toFloat()
            adView.starRatingView?.visibility = View.VISIBLE
        } else {
            adView.starRatingView?.visibility = View.GONE
        }

        // Bind ad to view
        nativeAd?.let {
            adView.setNativeAd(it)
        }

        return adView
    }
}


//Big Native
class NativeAdBig(
    private val layoutInflater: LayoutInflater,
    private val nativeBGColor: String,
//    private val btnBgColor: String,
    private val btnBgColor1: String,
    private val btnBgColor2: String,
    private val btnTextColor: String,
    private val headerTextColor: String,
    private val bodyTextColor: String
) : NativeAdFactory {

    override fun createNativeAd(
        nativeAd: NativeAd?,
        customOptions: MutableMap<String, Any>?
    ): NativeAdView {
        val adView = layoutInflater.inflate(
            R.layout.native_admob_big,
            null
        ) as NativeAdView

        val circularLayoutBackground: FrameLayout =
            adView.findViewById(R.id.flNativeAds)
        val backgroundGradientDrawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(Color.parseColor(nativeBGColor))
//            setColor(Color.parseColor("#" + nativeBGColor))
//            this.cornerRadius = cornerRadius
        }
        circularLayoutBackground.background =
            backgroundGradientDrawable
        // Set views

        adView.mediaView = adView.findViewById(R.id.ad_media)

        adView.headlineView = adView.findViewById(R.id.ad_headline)
        adView.bodyView = adView.findViewById(R.id.ad_body)
        adView.callToActionView =
            adView.findViewById(R.id.ad_call_to_action)
        adView.iconView = adView.findViewById(R.id.ad_icon)
        adView.advertiserView =
            adView.findViewById(R.id.ad_advertiser)
        adView.starRatingView = adView.findViewById(R.id.ad_stars)
        adView.priceView = adView.findViewById(R.id.ad_attribution)

        // Headline
        nativeAd?.headline?.let {
            (adView.headlineView as TextView).text = it
            (adView.headlineView as TextView).setTextColor(
                Color.parseColor(
                    headerTextColor
                )
            )
        }

        adView.mediaView?.mediaContent = nativeAd?.mediaContent
        // Body
        if (nativeAd?.body != null) {
            (adView.bodyView as TextView).text = nativeAd.body
            (adView.bodyView as TextView).setTextColor(
                Color.parseColor(
                    bodyTextColor
                )
            )
            adView.bodyView?.visibility = View.VISIBLE
        } else {
            adView.bodyView?.visibility = View.GONE
        }

        val priceGradientDrawable = GradientDrawable(
            GradientDrawable.Orientation.TR_BL, // 135 degrees
            intArrayOf(
                Color.parseColor(btnBgColor2),
                Color.parseColor(btnBgColor1),
//                Color.parseColor(btnBgColor)
            )
        ).apply {
            cornerRadii = floatArrayOf(
                0f * adView.context.resources.displayMetrics.density,
                0f * adView.context.resources.displayMetrics.density, // top-left radius
                0f,
                0f, // top-right radius
                0f,
                0f, // bottom-right radius
                0f * adView.context.resources.displayMetrics.density,
                0f * adView.context.resources.displayMetrics.density  // bottom-left radius
            )
        }
        adView.priceView?.background = priceGradientDrawable
        (adView.priceView as? TextView)?.setTextColor(
            Color.parseColor(
                btnTextColor
            )
        )


        // Call to action button
        if (nativeAd?.callToAction != null) {
            (adView.callToActionView as Button).text =
                nativeAd.callToAction
            (adView.callToActionView as Button).setTextColor(
                Color.parseColor(
                    btnTextColor
                )
            )
            val gradient = GradientDrawable(
                GradientDrawable.Orientation.TR_BL,
                intArrayOf(
                    Color.parseColor(btnBgColor2),
                    Color.parseColor(btnBgColor1),
//                    Color.parseColor(btnBgColor)
                )
            )
            gradient.cornerRadius =
                14f * adView.context.resources.displayMetrics.density
            adView.callToActionView?.background = gradient
            adView.callToActionView?.visibility = View.VISIBLE
        } else {
            adView.callToActionView?.visibility = View.GONE
        }

        // Icon
        if (nativeAd?.icon != null) {
            (adView.iconView as ImageView).setImageDrawable(nativeAd.icon?.drawable)
            adView.iconView?.visibility = View.VISIBLE
        } else {
            adView.iconView?.visibility = View.GONE
        }

        // Advertiser
        if (nativeAd?.advertiser != null) {
            (adView.advertiserView as TextView).text =
                nativeAd.advertiser
            adView.advertiserView?.visibility = View.VISIBLE
        } else {
            adView.advertiserView?.visibility = View.GONE
        }

        // Star rating
        if (nativeAd?.starRating != null) {
            (adView.starRatingView as RatingBar).rating =
                nativeAd.starRating!!.toFloat()
            adView.starRatingView?.visibility = View.VISIBLE
        } else {
            adView.starRatingView?.visibility = View.GONE
        }

        // Bind ad to view
        nativeAd?.let {
            adView.setNativeAd(it)
        }

        return adView
    }
}


//Small Native
class NativeAdSmall(
    private val layoutInflater: LayoutInflater,
    private val nativeBGColor: String,
//    private val btnBgColor: String,
    private val btnBgColor1: String,
    private val btnBgColor2: String,
    private val btnTextColor: String,
    private val headerTextColor: String,
    private val bodyTextColor: String
) : NativeAdFactory {

    override fun createNativeAd(
        nativeAd: NativeAd?,
        customOptions: MutableMap<String, Any>?
    ): NativeAdView {
        val adView = layoutInflater.inflate(
            R.layout.native_admob_small,
            null
        ) as NativeAdView

        val circularLayoutBackground: FrameLayout =
            adView.findViewById(R.id.flNativeAds)
//        val cornerRadius = 20f * adView.context.resources.displayMetrics.density
        val backgroundGradientDrawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(Color.parseColor(nativeBGColor))
//            setColor(Color.parseColor("#" + nativeBGColor))
//            this.cornerRadius = cornerRadius
        }
        circularLayoutBackground.background =
            backgroundGradientDrawable
        // Set views
        adView.headlineView = adView.findViewById(R.id.ad_headline)
        adView.bodyView = adView.findViewById(R.id.ad_body)
        adView.callToActionView =
            adView.findViewById(R.id.ad_call_to_action)
//        adView.iconView = adView.findViewById(R.id.ad_icon)
        adView.mediaView = adView.findViewById(R.id.ad_media)
        adView.advertiserView =
            adView.findViewById(R.id.ad_advertiser)
        adView.starRatingView = adView.findViewById(R.id.ad_stars)
        adView.priceView = adView.findViewById(R.id.ad_attribution)

        // Headline
        nativeAd?.headline?.let {
            (adView.headlineView as TextView).text = it
            (adView.headlineView as TextView).setTextColor(
                Color.parseColor(
                    headerTextColor
                )
            )
        }

        // Body
        if (nativeAd?.body != null) {
            (adView.bodyView as TextView).text = nativeAd.body
            (adView.bodyView as TextView).setTextColor(
                Color.parseColor(
                    bodyTextColor
                )
            )
            adView.bodyView?.visibility = View.VISIBLE
        } else {
            adView.bodyView?.visibility = View.GONE
        }

        val priceGradientDrawable = GradientDrawable(
            GradientDrawable.Orientation.TR_BL, // 135 degrees
            intArrayOf(
                Color.parseColor(btnBgColor2),
                Color.parseColor(btnBgColor1),
//                Color.parseColor(btnBgColor)
            )
        ).apply {
            cornerRadii = floatArrayOf(
                0f * adView.context.resources.displayMetrics.density,
                0f * adView.context.resources.displayMetrics.density, // top-left radius
                0f,
                0f, // top-right radius
                0f,
                0f, // bottom-right radius
                0f * adView.context.resources.displayMetrics.density,
                0f * adView.context.resources.displayMetrics.density  // bottom-left radius
            )
        }
        adView.priceView?.background = priceGradientDrawable
        (adView.priceView as? TextView)?.setTextColor(
            Color.parseColor(
                btnTextColor
            )
        )


        // Call to action button
        if (nativeAd?.callToAction != null) {
            (adView.callToActionView as Button).text = nativeAd.callToAction
            (adView.callToActionView as Button).setTextColor(Color.parseColor(btnTextColor))
            val gradient = GradientDrawable(
                GradientDrawable.Orientation.TR_BL,
                intArrayOf(
                    Color.parseColor(btnBgColor2),
                    Color.parseColor(btnBgColor1),
                )
            )
            gradient.cornerRadius = 10f * adView.context.resources.displayMetrics.density
            adView.callToActionView?.background = gradient
            adView.callToActionView?.visibility = View.VISIBLE
        } else {
            adView.callToActionView?.visibility = View.GONE
        }

        // Icon
        /*if (nativeAd?.icon != null) {
            (adView.iconView as ImageView).setImageDrawable(nativeAd.icon?.drawable)
            adView.iconView?.visibility = View.VISIBLE
        } else {
            adView.iconView?.visibility = View.GONE
        }*/

        // Advertiser
        if (nativeAd?.advertiser != null) {
            (adView.advertiserView as TextView).text =
                nativeAd.advertiser
            adView.advertiserView?.visibility = View.VISIBLE
        } else {
            adView.advertiserView?.visibility = View.GONE
        }

        // Star rating
        if (nativeAd?.starRating != null) {
            (adView.starRatingView as RatingBar).rating =
                nativeAd.starRating!!.toFloat()
            adView.starRatingView?.visibility = View.VISIBLE
        } else {
            adView.starRatingView?.visibility = View.GONE
        }

        // Bind ad to view
        nativeAd?.let {
            adView.setNativeAd(it)
        }

        return adView
    }
}