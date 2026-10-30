
import 'package:ai_ppt_generater/ads/ads_load_util.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

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
      final size = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(
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
