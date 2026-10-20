package com.demo.common_flow_demo

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.View
import android.widget.TextView

/// Native ad ke colors Firebase Remote Config se (Flutter: AdsId.nativeColors -> customOptions).
/// Har native factory me `NativeAdStyle(customOptions, context)` use karo.
class NativeAdStyle(private val options: Map<String, Any>?, private val view: View) {

    private fun hex(key: String, def: String): Int {
        val v = (options?.get(key) as? String)?.trim().orEmpty()
        return try {
            Color.parseColor("#" + v.ifEmpty { def })
        } catch (e: Exception) {
            Color.parseColor("#$def")
        }
    }

    private fun str(key: String, def: String) = (options?.get(key) as? String)?.ifEmpty { null } ?: def

    private fun dp(v: Float) =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, view.resources.displayMetrics)

    val background get() = hex("nativeBGColor", "222222")
    val header get() = hex("headerTextColor", "FFFFFF")
    val body get() = hex("bodyTextColor", "DDDDDD")
    val buttonText get() = hex("btnTextColor", "000000")

    /// CTA button ka gradient: start -> (center optional) -> end, angle aur radius bhi online.
    fun buttonBackground(): GradientDrawable {
        val start = hex("btnBgColor_start", "FFFFFF")
        val end = hex("btnBgColor_end", "FFFFFF")
        val centerRaw = str("btnBgColor_center", "")
        val colors = if (centerRaw.isEmpty()) intArrayOf(start, end)
        else intArrayOf(start, hex("btnBgColor_center", "FFFFFF"), end)

        val orientation = when (str("btnGradientAngle", "0").toIntOrNull() ?: 0) {
            45 -> GradientDrawable.Orientation.BL_TR
            90 -> GradientDrawable.Orientation.BOTTOM_TOP
            135 -> GradientDrawable.Orientation.BR_TL
            180 -> GradientDrawable.Orientation.RIGHT_LEFT
            270 -> GradientDrawable.Orientation.TOP_BOTTOM
            else -> GradientDrawable.Orientation.LEFT_RIGHT
        }
        return GradientDrawable(orientation, colors).apply {
            cornerRadius = dp(str("btnRadius", "30").toFloatOrNull() ?: 30f)
        }
    }

    fun applyText(headline: TextView?, bodyView: TextView?, cta: TextView?) {
        headline?.setTextColor(header)
        bodyView?.setTextColor(body)
        cta?.setTextColor(buttonText)
        cta?.background = buttonBackground()
    }
}
