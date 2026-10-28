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
    // Native ad factories with IPTV's ids (Flutter AdsLoadUtil.loadNative; Android: NativeAds.kt). IPTV has none on
    // iOS, so its natives never show there: this is app-factory's one addition. Their colours come from the same
    // "nativeChannel" → "setToast" call as on Android (AdsSplashUtils.setupFbAdsId); Facebook is Android-only, as in IPTV.
    let registry = engineBridge.pluginRegistry
    for (id, kind) in [("smallNativeAds", NativeKind.small), ("bigNativeAds", .big), ("fullNativeAds", .full)] {
      FLTGoogleMobileAdsPlugin.registerNativeAdFactory(registry, factoryId: id, nativeAdFactory: TemplateNativeAdFactory(kind: kind))
    }
    if let registrar = registry.registrar(forPlugin: "nativeChannel") {
      FlutterMethodChannel(name: "nativeChannel", binaryMessenger: registrar.messenger()).setMethodCallHandler { call, result in
        if call.method == "setToast", let args = call.arguments as? [String: Any] { NativeAdStyle.options = args }
        result(true)
      }
    }
  }
}

// MARK: - Native ads (lib/ads/ads_load_util.dart loadNative)

enum NativeKind { small, big, full }

/// The colours of the last "setToast" (IPTV's keys; values "#RRGGBB" as Android's Color.parseColor takes them).
enum NativeAdStyle {
  static var options: [String: Any] = [:]

  private static func str(_ key: String, _ def: String) -> String {
    let v = ((options[key] as? String) ?? "").trimmingCharacters(in: .whitespaces)
    return v.isEmpty ? def : v
  }

  static func color(_ key: String, _ def: String) -> UIColor { parse(str(key, def)) ?? parse(def)! }

  static func parse(_ raw: String) -> UIColor? {
    let hex = raw.hasPrefix("#") ? String(raw.dropFirst()) : raw
    guard hex.count == 6 || hex.count == 8, let v = UInt64(hex, radix: 16) else { return nil }
    let a = hex.count == 8 ? CGFloat((v >> 24) & 0xFF) / 255 : 1
    return UIColor(
      red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
      blue: CGFloat(v & 0xFF) / 255, alpha: a)
  }

  // defaults = IPTV AdsVariable's (lib/ads/ads_variable.dart)
  static var background: UIColor { color("nativeBGColor", "#342F38") }
  static var header: UIColor { color("headerTextColor", "#FFFFFF") }
  static var body: UIColor { color("bodyTextColor", "#FFFFFF") }
  static var buttonText: UIColor { color("btnTextColor", "#FFFFFF") }
  static var badgeBackground: UIColor { color("btnAdBgColor", "#FFFFFF") }
  static var badgeText: UIColor { color("btnAdTextColor", "#1A1A2F") }
  /// CTA gradient as IPTV's factories: top-right btnBgColor2 → bottom-left btnBgColor1, corner 10.
  static var buttonColors: [CGColor] { [color("btnBgColor2", "#C93EA2").cgColor, color("btnBgColor1", "#6F34FF").cgColor] }
}

final class GradientButton: UIButton {
  override class var layerClass: AnyClass { CAGradientLayer.self }
  var gradient: CAGradientLayer { layer as! CAGradientLayer }
}

/// "smallNativeAds": icon | "Ad" badge + headline, advertiser + stars, body; CTA full width (IPTV native_admob_small.xml).
/// "bigNativeAds" / "fullNativeAds": media on top, then the same row and CTA (IPTV native_admob_big / full.xml).
final class TemplateNativeAdFactory: NSObject, FLTNativeAdFactory {
  let kind: NativeKind
  init(kind: NativeKind) { self.kind = kind }
  private var big: Bool { kind != .small }

  func createNativeAd(_ nativeAd: NativeAd, customOptions: [AnyHashable: Any]? = nil) -> NativeAdView? {
    let style = NativeAdStyle.self
    let view = NativeAdView()
    view.backgroundColor = style.background
    let iconSize: CGFloat = 48

    let icon = UIImageView()
    icon.contentMode = .scaleAspectFit
    icon.image = nativeAd.icon?.image
    icon.isHidden = nativeAd.icon == nil

    let badge = UILabel()
    badge.text = " Ad "
    badge.font = .systemFont(ofSize: 10)
    badge.textColor = style.badgeText
    badge.backgroundColor = style.badgeBackground
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

    let advertiser = UILabel()
    advertiser.text = nativeAd.advertiser
    advertiser.font = .systemFont(ofSize: 11)
    advertiser.textColor = style.body
    advertiser.isHidden = nativeAd.advertiser == nil

    let stars = UILabel()
    let full = min(5, max(0, Int((nativeAd.starRating?.doubleValue ?? 0).rounded())))
    stars.text = String(repeating: "★", count: full) + String(repeating: "☆", count: 5 - full)
    stars.font = .systemFont(ofSize: 11)
    stars.textColor = .systemOrange
    stars.isHidden = nativeAd.starRating == nil

    let cta = GradientButton(type: .custom)
    cta.setTitle(nativeAd.callToAction, for: .normal)
    cta.setTitleColor(style.buttonText, for: .normal)
    cta.titleLabel?.font = .systemFont(ofSize: 14, weight: .medium)
    cta.gradient.colors = style.buttonColors
    (cta.gradient.startPoint, cta.gradient.endPoint) = (CGPoint(x: 1, y: 0), CGPoint(x: 0, y: 1))
    cta.layer.cornerRadius = 10
    cta.clipsToBounds = true
    cta.isUserInteractionEnabled = false  // click SDK handle karta hai
    cta.isHidden = nativeAd.callToAction == nil

    let titleRow = UIStackView(arrangedSubviews: [badge, headline])
    titleRow.spacing = 6
    titleRow.alignment = .center
    let starRow = UIStackView(arrangedSubviews: [advertiser, stars])
    starRow.spacing = 6
    let texts = UIStackView(arrangedSubviews: [titleRow, starRow, body])
    texts.axis = .vertical
    texts.spacing = 2
    let row = UIStackView(arrangedSubviews: [icon, texts])
    row.spacing = 10
    row.alignment = .center

    var constraints = [
      icon.widthAnchor.constraint(equalToConstant: iconSize),
      icon.heightAnchor.constraint(equalToConstant: iconSize),
      cta.heightAnchor.constraint(equalToConstant: big ? 44 : 40),
    ]
    var parts: [UIView] = [row, cta]
    if big {
      let media = MediaView()
      media.mediaContent = nativeAd.mediaContent
      view.mediaView = media
      parts.insert(media, at: 0)
      constraints.append(media.heightAnchor.constraint(equalToConstant: 150))
    }
    let content = UIStackView(arrangedSubviews: parts)
    content.axis = .vertical
    content.spacing = 8
    content.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(content)
    NSLayoutConstraint.activate(constraints + [
      content.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 10),
      content.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -10),
      content.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      content.topAnchor.constraint(greaterThanOrEqualTo: view.topAnchor, constant: 10),
    ])

    view.iconView = icon
    view.headlineView = headline
    view.bodyView = body
    view.advertiserView = advertiser
    view.starRatingView = stars
    view.callToActionView = cta
    view.nativeAd = nativeAd
    return view
  }
}
