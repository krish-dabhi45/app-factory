import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ads_load_util.dart';
import 'app_variable.dart';

/// IPTV_two `lib/ads/banner_widget.dart`, as it is (only the imports changed): a standard anchored adaptive banner
/// (`getCurrentOrientationAnchoredAdaptiveBannerAdSize`), height / 13.5 kept free while it loads, reloaded on rotation.

class BannerWidget extends StatefulWidget {
  final String adsId;
  final bool enable;
  const BannerWidget({super.key,required this.adsId, required this.enable});

  @override
  State<BannerWidget> createState() => _BannerWidgetState();
}

class _BannerWidgetState extends State<BannerWidget> {

  final ValueNotifier<bool> _isLoaded = ValueNotifier<bool>(false);
  BannerAd? _anchoredAdaptiveAd;
  late Orientation _currentOrientation;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _currentOrientation = MediaQuery.of(context).orientation;
    _loadAd();
  }

  Future<void> _loadAd() async {
    try {
      await _anchoredAdaptiveAd?.dispose();
      _anchoredAdaptiveAd = null;
      _isLoaded.value = false;
      if (!mounted) return; // the screen closed during dispose(): no context to read (IPTV reads it anyway)
      // ignore: deprecated_member_use
      final size = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize( // IPTV's call (deprecated in 9.x for the large one)
        MediaQuery.of(context).size.width.truncate(),
      );
      if (size == null) {
        showLog('Unable to get height of anchored banner.');
        return;
      }
      _anchoredAdaptiveAd = BannerAd(
        adUnitId: widget.adsId,
        size: size,
        request: const AdRequest(),
        listener: BannerAdListener(
          onAdLoaded: (Ad ad) {
            showLog('$ad loaded: ${ad.responseInfo}');
            _anchoredAdaptiveAd = ad as BannerAd;
            _isLoaded.value = true;
          },
            onPaidEvent:
                (ad, valueMicros, precision, currencyCode) {
              AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, widget.enable);
            },
          onAdFailedToLoad: (Ad ad, LoadAdError error) {
            showLog('Anchored adaptive banner failedToLoad: $error');
            ad.dispose();
          },
        ),
      );

      await _anchoredAdaptiveAd!.load();
    } catch (e) {
      showLog('Error loading ad: $e');
    }
  }

  Widget _getAdWidget() {
    return OrientationBuilder(
      builder: (context, orientation) {
        if (_currentOrientation == orientation &&
            _anchoredAdaptiveAd != null &&
            _isLoaded.value) {
          return Container(
            color: Colors.transparent,
            width: _anchoredAdaptiveAd!.size.width.toDouble(),
            height: _anchoredAdaptiveAd!.size.height.toDouble(),
            child: AdWidget(ad: _anchoredAdaptiveAd!),
          );
        }
        if (_currentOrientation != orientation) {
          _currentOrientation = orientation;
          _loadAd();
        }
        return widget.adsId != '11'
            ? SizedBox(
          height: MediaQuery.of(context).size.height / 13.5,
          width: double.infinity,
        )
            : const SizedBox();
      },
    );
  }

  @override
  void dispose() {
    super.dispose();
    _anchoredAdaptiveAd?.dispose();
  }

  @override
  Widget build(BuildContext context) {
    showLog('==========================================calll================================================');
    return ValueListenableBuilder<bool>(
      builder: (BuildContext context, bool value, Widget? child) {
        return _getAdWidget();
      },
      valueListenable: _isLoaded,
    );
  }
}
