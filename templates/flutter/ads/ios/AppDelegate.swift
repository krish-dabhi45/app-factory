import Flutter
import GoogleMobileAds
import UIKit
import google_mobile_ads

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // Native ad factory (Flutter NativeFactory.small = "smallNative", Android: MainActivity.kt)
    FLTGoogleMobileAdsPlugin.registerNativeAdFactory(
      engineBridge.pluginRegistry, factoryId: "smallNative", nativeAdFactory: SmallNativeAdFactory())
  }
}

// MARK: - Native ads (google_ads_material/native_ad_manager.dart)

/// Native ad ke colors Firebase Remote Config se (Flutter: AdsId.nativeColors -> customOptions).
/// Keys aur defaults Android NativeAdStyle.kt jaise hi.
struct NativeAdStyle {
  let options: [AnyHashable: Any]

  private func str(_ key: String, _ def: String) -> String {
    let v = ((options[key] as? String) ?? "").trimmingCharacters(in: .whitespaces)
    return v.isEmpty ? def : v
  }

  /// "RRGGBB" ya "AARRGGBB" (Android Color.parseColor jaisa). Galat value -> default.
  func color(_ key: String, _ def: String) -> UIColor {
    NativeAdStyle.parse(str(key, def)) ?? NativeAdStyle.parse(def)!
  }

  static func parse(_ hex: String) -> UIColor? {
    guard hex.count == 6 || hex.count == 8, let v = UInt64(hex, radix: 16) else { return nil }
    let a = hex.count == 8 ? CGFloat((v >> 24) & 0xFF) / 255 : 1
    return UIColor(
      red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
      blue: CGFloat(v & 0xFF) / 255, alpha: a)
  }

  var background: UIColor { color("nativeBGColor", "222222") }
  var header: UIColor { color("headerTextColor", "FFFFFF") }
  var body: UIColor { color("bodyTextColor", "DDDDDD") }
  var buttonText: UIColor { color("btnTextColor", "000000") }
  var radius: CGFloat { CGFloat(Double(str("btnRadius", "30")) ?? 30) }

  /// CTA gradient: start -> (center optional) -> end.
  var buttonColors: [CGColor] {
    let start = color("btnBgColor_start", "FFFFFF").cgColor
    let end = color("btnBgColor_end", "FFFFFF").cgColor
    if str("btnBgColor_center", "").isEmpty { return [start, end] }
    return [start, color("btnBgColor_center", "FFFFFF").cgColor, end]
  }

  /// Angle -> start/end point, Android GradientDrawable.Orientation jaisa (0 = left->right, 90 = bottom->top).
  var buttonPoints: (CGPoint, CGPoint) {
    switch Int(str("btnGradientAngle", "0")) ?? 0 {
    case 45: return (CGPoint(x: 0, y: 1), CGPoint(x: 1, y: 0))
    case 90: return (CGPoint(x: 0.5, y: 1), CGPoint(x: 0.5, y: 0))
    case 135: return (CGPoint(x: 1, y: 1), CGPoint(x: 0, y: 0))
    case 180: return (CGPoint(x: 1, y: 0.5), CGPoint(x: 0, y: 0.5))
    case 270: return (CGPoint(x: 0.5, y: 0), CGPoint(x: 0.5, y: 1))
    default: return (CGPoint(x: 0, y: 0.5), CGPoint(x: 1, y: 0.5))
    }
  }
}

final class GradientButton: UIButton {
  override class var layerClass: AnyClass { CAGradientLayer.self }
  var gradient: CAGradientLayer { layer as! CAGradientLayer }
}

/// Flutter factoryId: "smallNative". Layout Android native_small.xml jaisa:
/// icon 56 | "Ad" badge + headline, body (2 lines) | CTA button (min 80 x 40).
final class SmallNativeAdFactory: NSObject, FLTNativeAdFactory {
  func createNativeAd(_ nativeAd: NativeAd, customOptions: [AnyHashable: Any]? = nil) -> NativeAdView? {
    let style = NativeAdStyle(options: customOptions ?? [:])
    let view = NativeAdView()
    view.backgroundColor = style.background

    let icon = UIImageView()
    icon.contentMode = .scaleAspectFit
    icon.image = nativeAd.icon?.image
    icon.isHidden = nativeAd.icon == nil

    let badge = UILabel()
    badge.text = " Ad "
    badge.font = .systemFont(ofSize: 10)
    badge.textColor = .white
    badge.backgroundColor = UIColor(red: 1, green: 0.702, blue: 0, alpha: 1)  // #FFB300
    badge.setContentHuggingPriority(.required, for: .horizontal)

    let headline = UILabel()
    headline.text = nativeAd.headline
    headline.font = .boldSystemFont(ofSize: 14)
    headline.textColor = style.header
    headline.lineBreakMode = .byTruncatingTail

    let body = UILabel()
    body.text = nativeAd.body
    body.font = .systemFont(ofSize: 12)
    body.textColor = style.body
    body.numberOfLines = 2
    body.isHidden = nativeAd.body == nil

    let cta = GradientButton(type: .custom)
    cta.setTitle(nativeAd.callToAction, for: .normal)
    cta.setTitleColor(style.buttonText, for: .normal)
    cta.titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
    cta.gradient.colors = style.buttonColors
    (cta.gradient.startPoint, cta.gradient.endPoint) = style.buttonPoints
    cta.layer.cornerRadius = style.radius
    cta.clipsToBounds = true
    cta.isUserInteractionEnabled = false  // click SDK handle karta hai
    cta.isHidden = nativeAd.callToAction == nil
    cta.setContentCompressionResistancePriority(.required, for: .horizontal)

    let titleRow = UIStackView(arrangedSubviews: [badge, headline])
    titleRow.spacing = 6
    titleRow.alignment = .center
    let texts = UIStackView(arrangedSubviews: [titleRow, body])
    texts.axis = .vertical
    texts.spacing = 4
    let row = UIStackView(arrangedSubviews: [icon, texts, cta])
    row.spacing = 10
    row.alignment = .center
    row.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(row)

    NSLayoutConstraint.activate([
      row.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 10),
      row.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -10),
      row.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      row.topAnchor.constraint(greaterThanOrEqualTo: view.topAnchor, constant: 10),
      icon.widthAnchor.constraint(equalToConstant: 56),
      icon.heightAnchor.constraint(equalToConstant: 56),
      cta.heightAnchor.constraint(equalToConstant: 40),
      cta.widthAnchor.constraint(greaterThanOrEqualToConstant: 80),
      cta.widthAnchor.constraint(greaterThanOrEqualTo: cta.titleLabel!.widthAnchor, constant: 24),  // 12 pt padding each side
    ])

    view.iconView = icon
    view.headlineView = headline
    view.bodyView = body
    view.callToActionView = cta
    view.nativeAd = nativeAd
    return view
  }
}
