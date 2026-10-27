package com.demo.common_flow_demo

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.View
import android.widget.TextView

/// Native ad ke colors Firebase Remote Config se (Flutter: AdsId.nativeColors -> customOptions).
/// Har native factory me `NativeAdStyle(customOptions, context)` use karo.
class NativeAdStyle(private val options: Map<String, Any>?, private val view: View) {

    /// "#RRGGBB", "RRGGBB" ya "AARRGGBB" (IPTV config "#" ke saath bhejta hai).
    private fun hex(key: String, def: String): Int {
        val v = (options?.get(key) as? String)?.trim()?.removePrefix("#").orEmpty()
        return try {
            Color.parseColor("#" + v.ifEmpty { def })
        } catch (e: Exception) {
            Color.parseColor("#$def")
        }
    }

    private fun dp(v: Float) =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, view.resources.displayMetrics)

    val background get() = hex("nativeBGColor", "222222")
    val header get() = hex("headerTextColor", "FFFFFF")
    val body get() = hex("bodyTextColor", "DDDDDD")
    val buttonText get() = hex("btnTextColor", "000000")
    val badgeBackground get() = hex("btnAdBgColor", "FFB300")
    val badgeText get() = hex("btnAdTextColor", "FFFFFF")

    /// CTA button: IPTV MainActivity.kt:316-328 — gradient top-right btnBgColor2 -> bottom-left btnBgColor1
    /// (dono same = solid), corner 10 dp.
    fun buttonBackground() = GradientDrawable(
        GradientDrawable.Orientation.TR_BL, intArrayOf(hex("btnBgColor2", "FFFFFF"), hex("btnBgColor1", "FFFFFF"))
    ).apply { cornerRadius = dp(10f) }

    fun applyText(headline: TextView?, bodyView: TextView?, cta: TextView?, badge: TextView?, advertiser: TextView? = null) {
        headline?.setTextColor(header)
        bodyView?.setTextColor(body)
        advertiser?.setTextColor(body)
        cta?.setTextColor(buttonText)
        cta?.background = buttonBackground()
        badge?.setTextColor(badgeText)
        badge?.setBackgroundColor(badgeBackground)
    }
}
