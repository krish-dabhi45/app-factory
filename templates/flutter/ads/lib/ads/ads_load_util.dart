import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'ads_variable.dart';
import 'app_connectivity.dart';
import 'app_open_ad.dart';
import 'app_variable.dart';
import 'life_cycle.dart';
import 'loading_screen.dart';

/// IPTV_two `lib/ads/ads_load_util.dart`, ported to plain Flutter (GetxController → a plain class, RxBool → RxFlag,
/// Obx → ListenableBuilder, `x.w` → x × width / 1242). Not ported: the commented-out code, and `loadBanner`,
/// `BannerAdsWidget`, `loadOpenAdCommon` and the `adLoad` counter, which no IPTV screen uses (banners are
/// [BannerWidget]); the shimmer placeholders of [NativeAdsWidget], which IPTV never reaches (both its call sites
/// render the widget only once `isNativeAdLoaded` is true).
class AdsLoadUtil {
  late AppLifecycleReactor appLifecycleReactor;

  /// Send Revenue Event to Firebase Function --------------------------------------
  static Future<void> sendRevenueToAnalytics(double valueMicros, String? currency, PrecisionType precision, bool enabled) async {
    try {
      showLog("analytics===========");
      showLog("Enabled value : $enabled");
      if (!AdsVariable.sendRevenueToAnalytics) return;
      if (!enabled) {
        return;
      }
      final double revenue = valueMicros / 1000000.0;

      debugPrint(
        'AdRevenue: sendRevenueToAnalytics -> '
        'revenue: $revenue, '
        'currency: ${currency ?? 'USD'}, '
        'precision: ${precision.name}',
      );

      await FirebaseAnalytics.instance.logEvent(name: 'ad_impression', parameters: {'ad_platform': 'Google AdMob Manager', 'value': revenue, 'currency': currency ?? 'USD', 'precision_type': precision.name});

      showLog('analaytics ====== event ends');
    } catch (e, stackTrace) {
      debugPrint('AdRevenue: Failed to send revenue to Firebase Analytics: $e');
      debugPrint('----------stackTrace--------$stackTrace');
    }
  }

  /// --------- load open ads -----------------------------------------------------
  Future<void> loadAppOpenSplash(Function() navigateScreen) async {
    AppOpenAdManager appOpenAdManager = AppOpenAdManager()..loadSplashAd(AdsVariable.appOpenSplash, () => navigateScreen());
    appLifecycleReactor = AppLifecycleReactor(appOpenAdManager: appOpenAdManager);
    AppLifecycleReactor(appOpenAdManager: appOpenAdManager).listenToAppStateChanges();
  }

  /// --------- load common inter -----------------------------------------------------
  static InterstitialAd? commonInterAd;

  Future<void> loadInterCommon(String adUnitId, {required bool enable}) async {
    showLog('>> LOAD INTER CALL <<');
    if (adUnitId != "11") {
      await InterstitialAd.load(
        adUnitId: adUnitId,
        request: const AdRequest(),
        adLoadCallback: InterstitialAdLoadCallback(
          // Called when an ad is successfully received.
          onAdLoaded: (ad) {
            showLog('$ad loaded......');
            // Keep a reference to the ad so you can show it later.
            commonInterAd = ad;
            showLog("commonInterAd load------>$commonInterAd");
            ad.onPaidEvent = (Ad ad, double valueMicros, PrecisionType precision, String currencyCode) {
              AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
            };
          },

          // Called when an ad request failed.
          onAdFailedToLoad: (LoadAdError error) {
            showLog('InterstitialAd failed to load loadInter: $error');
          },
        ),
      );
    } else {
      showLog("ELSE -----");
    }
  }

  Future<void> showInterCommon(Function() loadPreLoadAds, Function() navigateScreen) async {
    showLog("commonInterAd------>$commonInterAd");
    if (commonInterAd == null) {
      navigateScreen();
      // F1: IPTV goes on to `commonInterAd!` here (ads_load_util.dart:186-191) and throws when no ad loaded.
      return;
    }
    AdsVariable.isShowingAd.value = true;
    commonInterAd!.setImmersiveMode(true);
    commonInterAd!.fullScreenContentCallback = FullScreenContentCallback(
      // Called when the ad showed the full screen content.
      onAdShowedFullScreenContent: (ad) async {
        await loadPreLoadAds();
        showLog("onAdShowedFullScreenContent common showInter");
      },
      // Called when an impression occurs on the ad.
      onAdImpression: (ad) async {
        showLog("onAdImpression");
        Future.delayed(const Duration(seconds: 1)).then((value) {
          navigateScreen();
        });
      },
      // Called when the ad failed to show full screen content.
      onAdFailedToShowFullScreenContent: (ad, err) async {
        // Dispose the ad here to free resources.
        ad.dispose();
        navigateScreen();
        AdsVariable.isShowingAd.value = false;
        showLog("onAdFailedToShowFullScreenContent common showInter");
      },
      // Called when the ad dismissed full screen content.
      onAdDismissedFullScreenContent: (ad) async {
        // Dispose the ad here to free resources.
        ad.dispose();
        AdsVariable.isShowingAd.value = false;
        showLog("onAdDismissedFullScreenContent click common showInter");
      },
      // Called when a click is recorded for an ad.
      onAdClicked: (ad) {
        showLog("onAdClicked common showInter");
      },
    );
    commonInterAd!.show();
    commonInterAd = null;
  }

  /// ------ Splash pages inter load & show --------------------------------------------
  InterstitialAd? splashInterAd;

  /// -------------------- Splash inter loading ------------------------
  Future<void> loadInterSplash(Function() loadPreLoadAds, Function() navigateScreen, String adUnitId, {required bool enable}) async {
    showLog('>> SHOW INTER CALL <<');
    showLog('AdsVariable.appOpenSplash >>${AdsVariable.appOpenSplash}');
    showLog('AdsVariable.appOpenAds >>${AdsVariable.appOpenAds}');

    if (!AdsVariable.isPurchase.value && AdsVariable.isFirstTimeVisited != null) {
      if (AdsVariable.appOpenSplash != "11") {
        await loadPreLoadAds();
        await loadAppOpenSplash(() => navigateScreen());
      } else {
        await loadPreLoadAds();
        InterstitialAd.load(
          adUnitId: adUnitId,
          request: const AdRequest(),
          adLoadCallback: InterstitialAdLoadCallback(
            // Called when an ad is successfully received.
            onAdLoaded: (ad) {
              ad.fullScreenContentCallback = FullScreenContentCallback(
                // Called when the ad showed the full pages content.
                onAdShowedFullScreenContent: (ad) async {
                  showLog("onAdShowedFullScreenContent loadInterSplash");
                },
                // Called when an impression occurs on the ad.
                onAdImpression: (ad) async {
                  showLog("onAdImpression loadInterSplash");
                  Future.delayed(const Duration(seconds: 1)).then((value) {
                    navigateScreen();
                  });
                },
                // Called when the ad failed to show full pages content.
                onAdFailedToShowFullScreenContent: (ad, err) async {
                  // Dispose the ad here to free resources.
                  ad.dispose();
                  showLog("onAdFailedToShowFullScreenContent loadInterSplash");
                },
                // Called when the ad dismissed full pages content.
                onAdDismissedFullScreenContent: (ad) async {
                  // Dispose the ad here to free resources.
                  ad.dispose();
                  showLog("onAdDismissedFullScreenContent loadInterSplash");
                },
                // Called when a click is recorded for an ad.
                onAdClicked: (ad) {
                  showLog("onAdClicked loadInterSplash");
                },
              );

              showLog('$ad loaded.loadInterSplash ');
              // Keep a reference to the ad so you can show it later.

              splashInterAd = ad;

              ad.onPaidEvent = (Ad ad, double valueMicros, PrecisionType precision, String currencyCode) {
                AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
              };

              Future.delayed(const Duration(seconds: 0)).then((value) {
                splashInterAd!.show();
              });
            },

            // Called when an ad request failed.
            onAdFailedToLoad: (LoadAdError error) async {
              showLog('InterstitialAd failed to load loadInterSplash: $error');
              await loadPreLoadAds();
              navigateScreen();
            },
          ),
        );
      }
    } else {
      navigateScreen();
    }
  }

  /// --------------------- Native ads load ------------------------------
  static NativeAd? nativeAd;
  static RxFlag isNativeAdLoaded = RxFlag(false);
  static RxFlag isNativeAdFailed = RxFlag(false);

  Future<NativeAd> loadNative(String adUnitId, bool isSmallNative, bool isFullNative, {required bool enable}) async {
    showLog("isSmallNative--->$isSmallNative");
    showLog("isFullNative--->$isFullNative");
    showLog("Pass ad Id for Native Ad --->$adUnitId");
    nativeAd = NativeAd(
      adUnitId: adUnitId.toString(),
      factoryId: !isFullNative
          ? isSmallNative
                ? 'smallNativeAds'
                : 'bigNativeAds'
          : 'fullNativeAds',
      listener: NativeAdListener(
        onAdLoaded: (ad) {
          nativeAd = ad as NativeAd?;
          isNativeAdLoaded.value = true;
          isNativeAdLoaded.refresh();
          showLog('isLoaded loadNative ${isNativeAdLoaded.value}');
        },
        onPaidEvent: (ad, valueMicros, precision, currencyCode) {
          AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
        },

        onAdFailedToLoad: (ad, error) {
          showLog('onAdFailedToLoad loadNative');
          nativeAd!.dispose();
          isNativeAdLoaded.value = false;
          isNativeAdFailed.value = true;
        },
      ),
      request: const AdRequest(),
    );
    await nativeAd!.load();
    return nativeAd!;
  }

  /// -------------------- AppOPen ads load -----------------------------
  // ignore: non_constant_identifier_names
  InterstitialAd? IntroPremiumInterAd;

  /// -------------------- IntroPremium OpenAds loading ------------------------
  Future<void> loadAppOpenIntroPremium(Function() navigateScreen, bool isIntro) async {
    AppOpenAdManager().loadIntroPremiumAd(isIntro ? AdsVariable.appOpenIntro : AdsVariable.appOpenPremium, () => navigateScreen());
  }

  /// -------------------- IntroPremium inter loading ------------------------
  Future<void> loadInterIntroPremium(Function() navigateScreen, String adUnitId, bool isIntro, {required bool enable}) async {
    showLog('>> SHOW INTER CALL <<');
    showLog('AdsVariable.appOpenSplash >>${AdsVariable.appOpenSplash}');

    if (!AdsVariable.isPurchase.value) {
      if ((isIntro ? AdsVariable.appOpenIntro : AdsVariable.appOpenPremium) != "11") {
        await loadAppOpenIntroPremium(() => navigateScreen(), isIntro);
      } else {
        if (adUnitId != "11") {
          loadingScreen.show();
          InterstitialAd.load(
            adUnitId: adUnitId,
            request: const AdRequest(),
            adLoadCallback: InterstitialAdLoadCallback(
              // Called when an ad is successfully received.
              onAdLoaded: (ad) {
                ad.setImmersiveMode(true);
                ad.fullScreenContentCallback = FullScreenContentCallback(
                  // Called when the ad showed the full screen content.
                  onAdShowedFullScreenContent: (ad) async {
                    showLog("onAdShowedFullScreenContent loadInterIntroPremium");
                  },
                  // Called when an impression occurs on the ad.
                  onAdImpression: (ad) async {
                    showLog("onAdImpression loadInterIntroPremium");
                    Future.delayed(const Duration(seconds: 1)).then((value) {
                      navigateScreen();
                    });
                  },
                  // Called when the ad failed to show full screen content.
                  onAdFailedToShowFullScreenContent: (ad, err) async {
                    // Dispose the ad here to free resources.
                    ad.dispose();
                    showLog("onAdFailedToShowFullScreenContent loadInterIntroPremium");
                  },
                  // Called when the ad dismissed full screen content.
                  onAdDismissedFullScreenContent: (ad) async {
                    // Dispose the ad here to free resources.
                    ad.dispose();
                    IntroPremiumInterAd = null;
                    showLog("onAdDismissedFullScreenContent loadInterIntroPremium");
                  },
                  // Called when a click is recorded for an ad.
                  onAdClicked: (ad) {
                    showLog("onAdClicked loadInterIntroPremium");
                  },
                );

                showLog('$ad loaded.loadInterIntroPremium ');
                // Keep a reference to the ad so you can show it later.

                IntroPremiumInterAd = ad;
                ad.onPaidEvent = (Ad ad, double valueMicros, PrecisionType precision, String currencyCode) {
                  AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
                };
                loadingScreen.hide();
                Future.delayed(const Duration(seconds: 0)).then((value) {
                  IntroPremiumInterAd!.show();
                });
              },

              // Called when an ad request failed.
              onAdFailedToLoad: (LoadAdError error) async {
                showLog('InterstitialAd failed to load loadInterIntroPremium: $error');
                loadingScreen.hide();
                navigateScreen();
              },
            ),
          );
        } else {
          Future.delayed(const Duration(seconds: 2)).then((value) {
            navigateScreen();
          });
        }
      }
    } else {
      Future.delayed(const Duration(seconds: 4)).then((value) {
        navigateScreen();
      });
    }
  }
}

/// Native ads
class NativeAdsWidget extends StatefulWidget {
  final bool isSmallNative;
  final bool isFullNative;
  final NativeAd? showNativeAd;
  final String? nativeId;

  const NativeAdsWidget({super.key, required this.showNativeAd, required this.isSmallNative, required this.isFullNative, this.nativeId});

  @override
  State<NativeAdsWidget> createState() => _NativeAdsWidgetState();
}

/// Native ads
class _NativeAdsWidgetState extends State<NativeAdsWidget> {
  RxFlag isConnection = RxFlag(false);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) async {
      if (await checkConnectivity()) {
        isConnection.value = true;
      } else {
        isConnection.value = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    showLog("CHECK NULL >> ${AdsLoadUtil.isNativeAdLoaded.value} ${widget.showNativeAd} ${widget.nativeId}");
    final w = MediaQuery.sizeOf(context).width / 1242; // IPTV `1.w` (ScreenUtil design width 1242)
    return ListenableBuilder(
      listenable: Listenable.merge([isConnection, AdsLoadUtil.isNativeAdFailed, AdsLoadUtil.isNativeAdLoaded]),
      builder: (context, _) => isConnection.value && !AdsLoadUtil.isNativeAdFailed.value && widget.showNativeAd != null && AdsLoadUtil.isNativeAdLoaded.value
          ? Container(
              padding: EdgeInsets.zero,
              width: MediaQuery.sizeOf(context).width,
              height: widget.isSmallNative ? ((2688 * 140) / 690) * w : ((2688 * 250) / 690) * w,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(20)),
              child: AdWidget(ad: widget.showNativeAd!),
            )
          : Container(),
    );
  }
}
