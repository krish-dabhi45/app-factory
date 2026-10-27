package com.demo.common_flow_demo

import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.RatingBar
import android.widget.TextView
import com.google.android.gms.ads.nativead.MediaView
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import io.flutter.plugins.googlemobileads.NativeAdFactory

/// Ek factory, layout ke hisab se: "smallNative" = native_small.xml, "bigNative" = native_big.xml (MainActivity.kt).
/// Layout me ad_media (MediaView), ad_advertiser, ad_stars ho to wo bhi bharta hai. Design har app ke hisab se XML me change karo.
class LayoutNativeAdFactory(private val inflater: LayoutInflater, private val layout: Int) : NativeAdFactory {
    override fun createNativeAd(nativeAd: NativeAd, customOptions: MutableMap<String, Any>?): NativeAdView {
        val view = inflater.inflate(layout, null) as NativeAdView

        val headline = view.findViewById<TextView>(R.id.ad_headline)
        val body = view.findViewById<TextView>(R.id.ad_body)
        val icon = view.findViewById<ImageView>(R.id.ad_icon)
        val cta = view.findViewById<Button>(R.id.ad_call_to_action)
        val badge = view.findViewById<TextView>(R.id.ad_badge)
        val media = view.findViewById<MediaView?>(R.id.ad_media)
        val advertiser = view.findViewById<TextView?>(R.id.ad_advertiser)
        val stars = view.findViewById<RatingBar?>(R.id.ad_stars)

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

        // Advertiser + stars (IPTV MainActivity.kt:347-361): na ho to GONE
        advertiser?.let {
            it.text = nativeAd.advertiser ?: ""
            it.visibility = if (nativeAd.advertiser == null) View.GONE else View.VISIBLE
            view.advertiserView = it
        }
        stars?.let {
            nativeAd.starRating?.let { r -> it.rating = r.toFloat() }
            it.visibility = if (nativeAd.starRating == null) View.GONE else View.VISIBLE
            view.starRatingView = it
        }

        media?.let {
            it.mediaContent = nativeAd.mediaContent
            view.mediaView = it
        }

        // Colors + gradient button + "Ad" badge Remote Config se (NativeAdStyle.kt)
        val style = NativeAdStyle(customOptions, view)
        view.setBackgroundColor(style.background)
        style.applyText(headline, body, cta, badge, advertiser)

        view.setNativeAd(nativeAd)
        return view
    }
}

// Register: MainActivity.kt dekho.
