import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ad_flags.dart';
import 'ad_impression.dart';
import 'ads_id.dart';
import 'app_open_ad_manager.dart';

enum BannerType { adaptive, collapsible }

/// Reusable banner. Screen ke bottom me `bottomNavigationBar` ya Column ke last me lagao.
///
/// Rules:
///  - Home / tab se khuli screens aur list wale tab par; TextField, player, home tab, settings par nahi (flutter-ads section 2).
///  - SafeArea ke andar (bottom inset respect karta hai).
///  - Left / right padding 0.
///  - Load hone tak banner ki height ki jagah reserve (layout jump nahi), load fail ho to poori jagah hat jaati hai.
///
/// ```dart
/// Scaffold(
///   body: ...,
///   bottomNavigationBar: const BannerAdWidget(type: BannerType.adaptive),
/// )
/// ```
class BannerAdWidget extends StatefulWidget {
  const BannerAdWidget({super.key, this.type = BannerType.adaptive});

  final BannerType type;

  @override
  State<BannerAdWidget> createState() => _BannerAdWidgetState();
}

class _BannerAdWidgetState extends State<BannerAdWidget> {
  BannerAd? _ad;
  bool _loaded = false;
  bool _failed = false;
  AdSize? _size;

  bool get _enabled => !AdFlags.isPremium && AdFlags.adsReady && !AdsId.isOff(_unitId);

  String get _key => widget.type == BannerType.collapsible ? 'bannerCollapsible' : 'banner';
  String get _unitId => AdsId.unit(_key);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ad == null && _enabled) _load();
  }

  Future<void> _load() async {
    final width = MediaQuery.sizeOf(context).width.truncate();
    final size = await AdSize.getLargeAnchoredAdaptiveBannerAdSize(width);
    if (!mounted || size == null) return;
    _size = size;
    final collapsible = widget.type == BannerType.collapsible;
    _ad = BannerAd(
      adUnitId: _unitId,
      size: size,
      request: AdRequest(extras: collapsible ? const {'collapsible': 'bottom'} : null),
      listener: BannerAdListener(
        onPaidEvent: AdImpression.listener(_key),
        onAdLoaded: (_) => mounted ? setState(() => _loaded = true) : null,
        onAdClicked: (_) => AppResumeAdListener.skipNextResume(),
        onAdFailedToLoad: (ad, e) {
          debugPrint('Banner fail ($_unitId): $e');
          ad.dispose();
          _ad = null;
          if (mounted) setState(() => _failed = true);
        },
      ),
    )..load();
  }

  @override
  void dispose() {
    _ad?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_enabled || _failed || _size == null) return const SizedBox.shrink();
    return SafeArea(
      top: false,
      left: false,
      right: false,
      child: SizedBox(
        width: double.infinity, // left/right 0 padding
        height: _size!.height.toDouble(),
        child: _loaded && _ad != null ? AdWidget(ad: _ad!) : const SizedBox.shrink(),
      ),
    );
  }
}
