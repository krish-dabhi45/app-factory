// Renders app icons with Core Graphics (no package, no network). Called by app-icon.mjs.
//   swift app-icon.swift inspect <image>          → {"w","h","alpha","transparentCorners","corner"}
//   swift app-icon.swift render <jobs.json>       → each job: {src, out, size, fraction, fill ("#RRGGBB" or null), opaque, dx?, dy? (px, right/down)}
// A job draws src scaled to size×fraction, centred on a size×size canvas filled with `fill` (or transparent);
// `opaque` writes an image without an alpha channel (iOS app icons must be opaque).
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fail(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }
func load(_ p: String) -> CGImage {
  guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil), let i = CGImageSourceCreateImageAtIndex(s, 0, nil) else { fail("cannot read \(p)") }
  return i
}
func rgb(_ hex: String) -> (CGFloat, CGFloat, CGFloat) {
  let h = hex.replacingOccurrences(of: "#", with: ""); let v = UInt32(h, radix: 16) ?? 0xFFFFFF
  return (CGFloat((v >> 16) & 0xFF) / 255, CGFloat((v >> 8) & 0xFF) / 255, CGFloat(v & 0xFF) / 255)
}
// Reads one pixel as RGBA by drawing the image into a 1-pixel window.
func pixel(_ img: CGImage, _ x: Int, _ y: Int) -> [UInt8] {
  var p = [UInt8](repeating: 0, count: 4)
  let ctx = CGContext(data: &p, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)! // same space as render, so a colour reads back unchanged
  ctx.draw(img, in: CGRect(x: -x, y: -(img.height - 1 - y), width: img.width, height: img.height))
  return p
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: app-icon.swift inspect <image> | render <jobs.json>") }
if args[1] == "inspect" {
  let img = load(args[2])
  let a = img.alphaInfo
  let alpha = !(a == .none || a == .noneSkipLast || a == .noneSkipFirst)
  let corners = [(0, 0), (img.width - 1, 0), (0, img.height - 1), (img.width - 1, img.height - 1)].map { pixel(img, $0.0, $0.1) }
  let c = corners[0]
  print("{\"w\":\(img.width),\"h\":\(img.height),\"alpha\":\(alpha),\"transparentCorners\":\(corners.contains { $0[3] < 255 }),\"corner\":\"#\(String(format: "%02X%02X%02X", c[0], c[1], c[2]))\"}")
} else if args[1] == "render" {
  guard let data = FileManager.default.contents(atPath: args[2]), let jobs = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { fail("bad jobs file") }
  var cache: [String: CGImage] = [:]
  for j in jobs {
    let src = j["src"] as! String, out = j["out"] as! String, size = j["size"] as! Int
    let fraction = (j["fraction"] as? Double) ?? 1, opaque = (j["opaque"] as? Bool) ?? false, fill = j["fill"] as? String
    let img = cache[src] ?? load(src); cache[src] = img
    let info = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
    guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info) else { fail("no context") }
    ctx.interpolationQuality = .high
    // the fill colour is defined in sRGB, the canvas's space, so #RRGGBB is stored exactly (a generic-RGB colour shifted #336699 to #407AAA)
    if let f = fill { let (r, g, b) = rgb(f); ctx.setFillColor(CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [r, g, b, 1])!); ctx.fill(CGRect(x: 0, y: 0, width: size, height: size)) }
    else if opaque { ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: size, height: size)) }
    let d = CGFloat(size) * CGFloat(fraction), o = (CGFloat(size) - d) / 2
    let dx = CGFloat((j["dx"] as? Double) ?? 0), dy = CGFloat((j["dy"] as? Double) ?? 0)
    ctx.draw(img, in: CGRect(x: o + dx, y: o - dy, width: d, height: d))
    try? FileManager.default.createDirectory(atPath: (out as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    guard let res = ctx.makeImage(), let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("cannot write \(out)") }
    CGImageDestinationAddImage(dst, res, nil)
    if !CGImageDestinationFinalize(dst) { fail("cannot write \(out)") }
  }
  print("rendered \(jobs.count)")
} else { fail("unknown mode \(args[1])") }
