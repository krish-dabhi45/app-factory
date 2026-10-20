import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:shimmer/shimmer.dart';

import 'ad_flags.dart';
import 'native_ad_manager.dart';

/// Native ad + loading time par usi design ka shimmer.
///
/// Onboarding: PageView ke BAHAR, bottom me ek hi baar lagao
/// (ek NativeAd do AdWidget me nahi chal sakta, PageView pages ek saath build hote hai).
///
/// ```dart
/// Column(children: [
///   Expanded(child: PageView(...)),
///   NativeAdWidget(slot: NativeAdManager.onboarding, height: 120),
/// ])
/// ```
class NativeAdWidget extends StatefulWidget {
  const NativeAdWidget({
    super.key,
    required this.slot,
    required this.height,
    this.shimmer,
    this.enabled = true,
  });

  final NativeSlot slot;
  final double height;

  /// Screen ke design ke hisab se custom shimmer. Null ho to default small-native shimmer.
  final Widget? shimmer;
  final bool enabled;

  @override
  State<NativeAdWidget> createState() => _NativeAdWidgetState();
}

class _NativeAdWidgetState extends State<NativeAdWidget> {
  NativeAd? _ad;
  bool _failed = false;

  bool get _on => widget.enabled && !AdFlags.isPremium && !widget.slot.isOff;

  @override
  void initState() {
    super.initState();
    if (_on) _get();
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
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_on || _failed) return const SizedBox.shrink();
    return SizedBox(
      height: widget.height,
      width: double.infinity,
      child: _ad == null ? (widget.shimmer ?? SmallNativeShimmer(height: widget.height)) : AdWidget(ad: _ad!),
    );
  }
}

/// Small native layout jaisa hi shimmer: icon | title + body | CTA button.
class SmallNativeShimmer extends StatelessWidget {
  const SmallNativeShimmer({super.key, required this.height});

  final double height;

  @override
  Widget build(BuildContext context) {
    Widget box(double w, double h, [double r = 6]) => Container(
          width: w,
          height: h,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(r)),
        );
    return Shimmer.fromColors(
      baseColor: Colors.grey.shade300,
      highlightColor: Colors.grey.shade100,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(children: [
          box(56, 56, 10),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [box(140, 14), const SizedBox(height: 8), box(double.infinity, 12)],
            ),
          ),
          const SizedBox(width: 10),
          box(80, 36, 18),
        ]),
      ),
    );
  }
}
