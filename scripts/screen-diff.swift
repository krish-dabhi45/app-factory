// Compares an app screenshot with its design reference, pixel by pixel, and returns where they differ.
//   screen-diff <reference.png> <app.png> <out dir> [--mask x,y,w,h ...]   (mask rects in points)
// Both images are compared at the LOWER of their two resolutions (a 1x mockup enlarged to a 3x screenshot has soft
// edges that would all read as differences); the app must run on a simulator with the design frame's size in points,
// so both have the same aspect. Each pixel's difference is the largest of |ΔR|, |ΔG|, |ΔB|; a cell of
// 3×3 points differs when more than 15 % of its pixels differ by more than 40 (of 255) — enough to ignore anti-aliasing
// and compression, small enough to catch a 2-point shift of a text or an edge. Neighbouring differing cells form one
// region. Writes <out>/result.json, <out>/diff.png (the app with every region boxed in red) and, per region,
// <out>/region-<n>.png: the reference crop left, the app crop right, 6 points of context around it.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func fail(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }
func load(_ p: String) -> CGImage {
  guard let s = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil), let i = CGImageSourceCreateImageAtIndex(s, 0, nil) else { fail("cannot read \(p)") }
  return i
}
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!
func raster(_ img: CGImage, _ w: Int, _ h: Int) -> [UInt8] {
  var buf = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(colorSpace: sRGB, components: [1, 1, 1, 1])!); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h)) // transparency reads as white on both
  ctx.interpolationQuality = .high
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  return buf
}
func save(_ img: CGImage, _ p: String) {
  guard let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: p) as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("cannot write \(p)") }
  CGImageDestinationAddImage(d, img, nil); if !CGImageDestinationFinalize(d) { fail("cannot write \(p)") }
}

var a = Array(CommandLine.arguments.dropFirst())
guard a.count >= 3 else { fail("usage: screen-diff <reference.png> <app.png> <out dir> [--mask x,y,w,h ...]") }
let (refPath, appPath, out) = (a[0], a[1], a[2])
var masks: [CGRect] = []
if let i = a.firstIndex(of: "--mask") { for m in a[(i + 1)...] { let v = m.split(separator: ",").compactMap { Double($0) }; if v.count == 4 { masks.append(CGRect(x: v[0], y: v[1], width: v[2], height: v[3])) } } }
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

let app = load(appPath), ref = load(refPath)
let W = app.width, H = app.height
let scale = Double(W) / Double(ref.width) // reference pixels → app pixels
let ptScale = Double(W) >= 1000 ? 3.0 : 2.0 // simulator screenshots: @3x phones are ≥ 1000 px wide, @2x (SE) are 750
let refAspect = Double(ref.height) / Double(ref.width), appAspect = Double(H) / Double(W)
if abs(refAspect - appAspect) / appAspect > 0.01 {
  print("{\"error\":\"sizes differ: reference \(ref.width)×\(ref.height) px, app \(W)×\(H) px — run the app on a simulator with the design frame's size (pipeline.mjs design-device)\"}")
  exit(2)
}
let pointsW = Double(W) / ptScale
let CW = min(W, ref.width), CH = Int((Double(CW) * appAspect).rounded()) // comparison canvas
let cs = Double(CW) / pointsW // canvas pixels per point
let A = raster(app, CW, CH), R = raster(ref, CW, CH)
let cell = max(2, Int((3 * cs).rounded())) // 3 points
let cols = (CW + cell - 1) / cell, rows = (CH + cell - 1) / cell
var differs = [Bool](repeating: false, count: cols * rows)
var diffPixels = 0
for cy in 0..<rows {
  for cx in 0..<cols {
    let x0 = cx * cell, y0 = cy * cell, x1 = min(CW, x0 + cell), y1 = min(CH, y0 + cell)
    // a masked cell (status bar, live content) is never compared; mask rects are in points, top-left origin
    let cr = CGRect(x: Double(x0) / cs, y: Double(y0) / cs, width: Double(x1 - x0) / cs, height: Double(y1 - y0) / cs)
    if masks.contains(where: { $0.intersects(cr) }) { continue }
    var n = 0, bad = 0
    for y in y0..<y1 {
      var i = (y * CW + x0) * 4
      for _ in x0..<x1 {
        let d = max(abs(Int(A[i]) - Int(R[i])), abs(Int(A[i + 1]) - Int(R[i + 1])), abs(Int(A[i + 2]) - Int(R[i + 2])))
        if d > 40 { bad += 1 }
        n += 1; i += 4
      }
    }
    if bad * 100 > n * 15 { differs[cy * cols + cx] = true; diffPixels += bad }
  }
}
// regions: 8-connected differing cells
var seen = [Bool](repeating: false, count: cols * rows)
var regions: [(CGRect, Int)] = []
for s in 0..<(cols * rows) where differs[s] && !seen[s] {
  var stack = [s]; seen[s] = true
  var minx = cols, miny = rows, maxx = 0, maxy = 0, count = 0
  while let c = stack.popLast() {
    let cx = c % cols, cy = c / cols; count += 1
    minx = min(minx, cx); maxx = max(maxx, cx); miny = min(miny, cy); maxy = max(maxy, cy)
    for dy in -1...1 { for dx in -1...1 {
      let nx = cx + dx, ny = cy + dy
      if nx < 0 || ny < 0 || nx >= cols || ny >= rows { continue }
      let k = ny * cols + nx
      if differs[k] && !seen[k] { seen[k] = true; stack.append(k) }
    } }
  }
  let k = Double(W) / Double(CW) // canvas px → app px
  regions.append((CGRect(x: Double(minx * cell) * k, y: Double(miny * cell) * k, width: Double((maxx - minx + 1) * cell) * k, height: Double((maxy - miny + 1) * cell) * k), count))
}
regions.sort { $0.0.minY == $1.0.minY ? $0.0.minX < $1.0.minX : $0.0.minY < $1.0.minY } // top to bottom

// diff.png: the app screenshot with every region boxed in red (CG origin is bottom-left)
let dctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
dctx.draw(app, in: CGRect(x: 0, y: 0, width: W, height: H))
dctx.setStrokeColor(CGColor(colorSpace: sRGB, components: [1, 0, 0, 1])!); dctx.setLineWidth(CGFloat(ptScale * 1.5))
for (r, _) in regions { dctx.stroke(CGRect(x: r.minX, y: Double(H) - r.maxY, width: r.width, height: r.height)) }
save(dctx.makeImage()!, "\(out)/diff.png")

// per region: reference crop | app crop
let refScaled: CGImage = { // the reference at the app's pixel size, for the side-by-side crops
  let c = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  c.interpolationQuality = .high; c.draw(ref, in: CGRect(x: 0, y: 0, width: W, height: H)); return c.makeImage()!
}()
var json: [[String: Any]] = []
for (n, (r, count)) in regions.enumerated() {
  let pad = 6 * ptScale
  let c = r.insetBy(dx: -pad, dy: -pad).intersection(CGRect(x: 0, y: 0, width: W, height: H)).integral
  let gap = Int(4 * ptScale)
  let rc = CGContext(data: nil, width: Int(c.width) * 2 + gap, height: Int(c.height), bitsPerComponent: 8, bytesPerRow: 0, space: sRGB, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  rc.setFillColor(CGColor(colorSpace: sRGB, components: [1, 0, 1, 1])!); rc.fill(CGRect(x: 0, y: 0, width: Int(c.width) * 2 + gap, height: Int(c.height)))
  if let rcrop = refScaled.cropping(to: c), let acrop = app.cropping(to: c) {
    rc.draw(rcrop, in: CGRect(x: 0, y: 0, width: c.width, height: c.height))
    rc.draw(acrop, in: CGRect(x: c.width + Double(gap), y: 0, width: c.width, height: c.height))
  }
  save(rc.makeImage()!, "\(out)/region-\(n + 1).png")
  json.append(["n": n + 1, "x": r.minX / ptScale, "y": r.minY / ptScale, "w": r.width / ptScale, "h": r.height / ptScale, "cells": count, "image": "\(out)/region-\(n + 1).png"])
}
let total = cols * rows
let res: [String: Any] = ["reference": refPath, "app": appPath, "appPx": "\(W)x\(H)", "points": "\(Int(Double(W) / ptScale))x\(Int(Double(H) / ptScale))", "referenceScale": scale,
  "differentPercent": Double(differs.filter { $0 }.count * 1000 / max(1, total)) / 10, "regions": json, "diff": "\(out)/diff.png", "masks": masks.map { "\($0.minX),\($0.minY),\($0.width),\($0.height)" }]
let data = try! JSONSerialization.data(withJSONObject: res, options: [.prettyPrinted, .sortedKeys])
FileManager.default.createFile(atPath: "\(out)/result.json", contents: data)
print(String(data: data, encoding: .utf8)!)
