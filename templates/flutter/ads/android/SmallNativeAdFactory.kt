package com.demo.common_flow_demo

import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import io.flutter.plugins.googlemobileads.NativeAdFactory

/// Flutter factoryId: "smallNative". Design har app ke hisab se native_small.xml me change karo.
class SmallNativeAdFactory(private val inflater: LayoutInflater) : NativeAdFactory {
    override fun createNativeAd(nativeAd: NativeAd, customOptions: MutableMap<String, Any>?): NativeAdView {
        val view = inflater.inflate(R.layout.native_small, null) as NativeAdView

        val headline = view.findViewById<TextView>(R.id.ad_headline)
        val body = view.findViewById<TextView>(R.id.ad_body)
        val icon = view.findViewById<ImageView>(R.id.ad_icon)
        val cta = view.findViewById<Button>(R.id.ad_call_to_action)

        headline.text = nativeAd.headline
        view.headlineView = headline

        body.text = nativeAd.body ?: ""
        body.visibility = if (nativeAd.body == null) View.INVISIBLE else View.VISIBLE
        view.bodyView = body

        nativeAd.icon?.drawable?.let { icon.setImageDrawable(it); icon.visibility = View.VISIBLE }
            ?: run { icon.visibility = View.GONE }
        view.iconView = icon

        cta.text = nativeAd.callToAction ?: ""
        cta.visibility = if (nativeAd.callToAction == null) View.INVISIBLE else View.VISIBLE
        view.callToActionView = cta

        // Colors + gradient button Remote Config se (NativeAdStyle.kt)
        val style = NativeAdStyle(customOptions, view)
        view.setBackgroundColor(style.background)
        style.applyText(headline, body, cta)

        view.setNativeAd(nativeAd)
        return view
    }
}

// Register: MainActivity.kt dekho.
