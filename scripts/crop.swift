// Cuts one screen out of a whole-page Figma screenshot, exactly (sips ignores a 0 offset and centre-crops instead).
// usage: swift crop.swift <page.png> <scale> <out.png> <x> <y> <w> <h>
//   x, y, w, h: the screen's position and size in Figma points, relative to the page image's top-left;
//   scale: PNG pixels per Figma point (width / original_width from get_screenshot). Fails rather than crop outside the image.
import Foundation
import ImageIO
import UniformTypeIdentifiers
let a = CommandLine.arguments
guard a.count == 8, let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil), let s = Double(a[2]),
      let x = Double(a[4]), let y = Double(a[5]), let w = Double(a[6]), let h = Double(a[7]) else { fputs("bad arguments\n", stderr); exit(2) }
let r = CGRect(x: (x * s).rounded(), y: (y * s).rounded(), width: (w * s).rounded(), height: (h * s).rounded())
guard r.minX >= 0, r.minY >= 0, r.maxX <= Double(img.width), r.maxY <= Double(img.height), let part = img.cropping(to: r),
      let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[3]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { fputs("crop outside the image\n", stderr); exit(1) }
CGImageDestinationAddImage(dst, part, nil)
exit(CGImageDestinationFinalize(dst) ? 0 : 1)
