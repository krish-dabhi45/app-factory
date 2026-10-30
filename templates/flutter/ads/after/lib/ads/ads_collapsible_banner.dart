import 'package:ai_ppt_generater/ads/ads_load_util.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';



class CollapsibleBannerWidget extends StatefulWidget {
  final String adUnitId;
  final bool enable;

  /// Background painted behind the ad + the system-nav gutter.
  final Color backgroundColor;

  /// Set false if this widget already sits above the system nav bar
  /// (e.g. a parent already consumed the inset correctly).
  final bool applyBottomInset;

  const CollapsibleBannerWidget({
    Key? key,
    required this.adUnitId,
    this.backgroundColor = const Color(0xff060B12),
    this.applyBottomInset = true,
    required this.enable,
  }) : super(key: key);

  @override
  State<CollapsibleBannerWidget> createState() =>
      _CollapsibleBannerWidgetState();
}

class _CollapsibleBannerWidgetState extends State<CollapsibleBannerWidget>
    with WidgetsBindingObserver {
  BannerAd? _bannerAd;
  AdSize? _adSize;
  bool _isAdLoaded = false;
  bool _isLoading = false;
  int _lastRequestedWidth = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAd());
  }

  @override
  void didChangeMetrics() {
    // Rotation / window resize -> the adaptive size changed, reload.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final int w = MediaQuery.of(context).size.width.truncate();
      if (w != _lastRequestedWidth) {
        _loadAd();
      } else {
        setState(() {}); // nav-bar mode can change at runtime too
      }
    });
  }

  Future<void> _loadAd() async {
    if (_isLoading || !mounted) return;
    if (AdsVariable.isPurchase.value) return;
    _isLoading = true;

    final int width = MediaQuery.of(context).size.width.truncate();
    _lastRequestedWidth = width;

    final AdSize? size =
    await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(width);

    if (size == null || !mounted) {
      _isLoading = false;
      return;
    }

    // Drop the previous ad before creating a new one.
    final BannerAd? oldAd = _bannerAd;
    _bannerAd = null;
    _isAdLoaded = false;
    oldAd?.dispose();

    final BannerAd banner = BannerAd(
      adUnitId: widget.adUnitId,
      size: size,
      request: const AdRequest(
        extras: {'collapsible': 'bottom'},
      ),
      listener: BannerAdListener(
        onAdLoaded: (Ad ad) {
          _isLoading = false;
          if (!mounted) {
            ad.dispose();
            return;
          }
          setState(() {
            _bannerAd = ad as BannerAd;
            _adSize = size;
            _isAdLoaded = true;
          });
        },
        onPaidEvent:
            (ad, valueMicros, precision, currencyCode) {
          AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, widget.enable);
        },
        onAdFailedToLoad: (Ad ad, LoadAdError error) {
          ad.dispose();
          _isLoading = false;
          if (!mounted) return;
          setState(() {
            _bannerAd = null;
            _isAdLoaded = false;
          });
        },
      ),
    );

    await banner.load();
  }


  double _bottomInset(BuildContext context) {
    if (!widget.applyBottomInset) return 0;
    final MediaQueryData mq = MediaQuery.of(context);

    // Keyboard is up: it already covers the nav-bar strip, don't double-pad.
    if (mq.viewInsets.bottom > 0) return 0;

    final double v = mq.viewPadding.bottom;
    final double p = mq.padding.bottom;
    return v > p ? v : p;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _bannerAd?.dispose();
    _bannerAd = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (AdsVariable.isPurchase.value) return const SizedBox.shrink();

      final double bottom = _bottomInset(context);

      if (!_isAdLoaded || _bannerAd == null || _adSize == null) {
        return DarkBannerShimmerWidget(
          bottomInset: bottom,
          backgroundColor: widget.backgroundColor,
        );
      }

      return Container(
        width: double.infinity,
        color: widget.backgroundColor,
        padding: EdgeInsets.only(bottom: bottom),
        alignment: Alignment.bottomCenter,
        child: SizedBox(
          // Must match the loaded AdSize EXACTLY. A collapsible banner expands
          // in a native overlay window above this box, not inside it, so no
          // extra height / maxHeight is needed here.
          width: _adSize!.width.toDouble(),
          height: _adSize!.height.toDouble(),
          child: AdWidget(ad: _bannerAd!),
        ),
      );
    });
  }
}

class DarkBannerShimmerWidget extends StatelessWidget {
  final double bottomInset;
  final Color backgroundColor;

  const DarkBannerShimmerWidget({
    super.key,
    this.bottomInset = 0,
    this.backgroundColor = const Color(0xff060B12),
  });

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;

    return Container(
      width: width,
      color: backgroundColor,
      padding: EdgeInsets.only(
        left: width * 0.04,
        right: width * 0.04,
        top: width * 0.02,
        bottom: bottomInset + (width * 0.02),
      ),
      child: Container(
        height: width * 0.14,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Text("Advertisements", style: TextStyle(color: Colors.white)),
        ),
      ),
    );
  }
}


///splash load banner
/*
class CollapsibleBannerWidget extends StatefulWidget {
  final Color backgroundColor;
  final bool applyBottomInset;

  const CollapsibleBannerWidget({
    Key? key,
    this.backgroundColor = const Color(0xff060B12),
    this.applyBottomInset = true,
  }) : super(key: key);

  @override
  State<CollapsibleBannerWidget> createState() =>
      _CollapsibleBannerWidgetState();
}

class _CollapsibleBannerWidgetState extends State<CollapsibleBannerWidget> {
  @override
  Widget build(BuildContext context) {
    return Obx(() {
      if (AdsVariable.isPurchase.value) {
        return const SizedBox.shrink();
      }

      final BannerAd? bannerAd = AdsVariable.collapsibleHomeAds;

      // Ad is still loading
      if (AdsVariable.isCollapsibleBannerLoading.value) {
        return const DarkBannerShimmerWidget();
      }

      // Ad failed / not available
      if (bannerAd == null) {
        return const SizedBox.shrink();
      }

      final MediaQueryData mq = MediaQuery.of(context);

      double bottomInset = 0;

      if (widget.applyBottomInset && mq.viewInsets.bottom <= 0) {
        final double v = mq.viewPadding.bottom;
        final double p = mq.padding.bottom;

        bottomInset = v > p ? v : p;
      }

      return Container(
        width: double.infinity,
        color: widget.backgroundColor,
        padding: EdgeInsets.only(
          bottom: bottomInset,
        ),
        alignment: Alignment.bottomCenter,
        child: SizedBox(
          width: bannerAd.size.width.toDouble(),
          height: bannerAd.size.height.toDouble(),
          child: AdWidget(
            ad: bannerAd,
          ),
        ),
      );
    });
  }
}
class DarkBannerShimmerWidget extends StatelessWidget {
  final double bottomInset;
  final Color backgroundColor;

  const DarkBannerShimmerWidget({
    super.key,
    this.bottomInset = 0,
    this.backgroundColor = const Color(0xff060B12),
  });

  @override
  Widget build(BuildContext context) {
    final double width = MediaQuery.of(context).size.width;

    return Container(
      width: width,
      color: backgroundColor,
      padding: EdgeInsets.only(
        left: width * 0.04,
        right: width * 0.04,
        top: width * 0.02,
        bottom: bottomInset + (width * 0.02),
      ),
      child: Container(
        height: width * 0.14,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Center(
          child: Text("Advertisements", style: TextStyle(color: Colors.white)),
        ),
      ),
    );
  }
}*/
