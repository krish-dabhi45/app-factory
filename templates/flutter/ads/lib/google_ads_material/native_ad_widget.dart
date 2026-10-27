import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'native_ad_manager.dart';

/// Native ad. Load hone tak kuch nahi dikhta (na shimmer, na jagah) — IPTV `stream_now_iptv_screen.dart:93`,
/// `intro_screen.dart:145`: ad tabhi dikhta hai jab load ho chuka ho. Fail / off / premium = kuch nahi.
/// Ad ke aas-paas ka frame (border, margin) [frame] me do, wo bhi ad ke saath hi dikhta hai.
///
/// Intro: PageView ke BAHAR, bottom me ek hi baar lagao
/// (ek NativeAd do AdWidget me nahi chal sakta, PageView pages ek saath build hote hai).
/// Big native height 310, small native height 150.
///
/// Screen ka apna content ad ke upar bachi jagah me fit hona chahiye: `Column` + `Expanded` (content us jagah me
/// chhota ho jaaye, jaise `FittedBox(fit: BoxFit.scaleDown)` ya `BoxFit.contain` image) — kabhi `Stack` me content
/// upar aur buttons neeche pin mat karo (choti screen par dono overlap karte hai).
/// Jo screen ad ko apni jagah pin karti hai (intro: neeche, scroll nahi) wo [minSpaceLeft] deti hai: ad ke baad screen ke
/// apne content (text, button) ke liye kam se kam itni height. Kam bache (jaise phone landscape me) to ad nahi dikhta,
/// jagah wapas aaye to wahi ad phir dikhta hai. Scroll list (home) me null — wahan fit ka sawaal nahi.
///
/// ```dart
/// Column(children: [
///   Expanded(child: PageView(...)),
///   NativeAdWidget(slot: NativeAdManager.intro, height: 310, minSpaceLeft: 240),
/// ])
/// ```
class NativeAdWidget extends StatefulWidget {
  const NativeAdWidget({
    super.key,
    required this.slot,
    required this.height,
    this.frame,
    this.enabled = true,
    this.minSpaceLeft,
  });

  final NativeSlot slot;
  final double height;

  /// Loaded ad ke bahar ka design (jaise border wala Container); null = sirf ad.
  final Widget Function(Widget ad)? frame;
  final bool enabled;

  /// Screen height minus [height] must be at least this, else the ad is not drawn (checked on every build). null = no check.
  final double? minSpaceLeft;

  @override
  State<NativeAdWidget> createState() => _NativeAdWidgetState();

  static bool fitsScreen({required double screenHeight, required double adHeight, required double minSpaceLeft}) =>
      screenHeight - adHeight >= minSpaceLeft;
}

class _NativeAdWidgetState extends State<NativeAdWidget> {
  NativeAd? _ad;
  bool _failed = false;

  bool get _on => widget.enabled && !AdFlags.isPremium && !widget.slot.isOff;

  @override
  void initState() {
    super.initState();
    if (!_on) return;
    if (widget.slot.keep) {
      if (widget.slot.shownBy != null) {
        _failed = true; // kept ad already on screen in another widget: show nothing here
        return;
      }
      widget.slot.shownBy = this;
      _ad = widget.slot.keptAd; // already loaded: shown in the first frame
      if (_ad != null) return;
    }
    _get();
  }

  Future<void> _get() async {
    final ad = await widget.slot.take();
    if (!mounted) {
      ad?.dispose();
      return;
    }
    setState(() {
      _ad = ad;
      _failed = ad == null;
    });
  }

  @override
  void dispose() {
    if (!widget.slot.keep) {
      _ad?.dispose();
    } else if (widget.slot.shownBy == this) {
      widget.slot.shownBy = null; // the kept ad stays loaded for the next build
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_on || _failed || _ad == null) return const SizedBox.shrink();
    // checked on every build: rotate to landscape → hidden, back to portrait → the same ad again
    final need = widget.minSpaceLeft;
    if (need != null && !NativeAdWidget.fitsScreen(screenHeight: MediaQuery.sizeOf(context).height, adHeight: widget.height, minSpaceLeft: need)) {
      return const SizedBox.shrink();
    }
    final ad = SizedBox(height: widget.height, width: double.infinity, child: AdWidget(ad: _ad!));
    return widget.frame?.call(ad) ?? ad;
  }
}
