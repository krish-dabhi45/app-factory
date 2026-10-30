import 'dart:async';
import 'dart:developer';
import 'dart:io';

import 'package:ai_ppt_generater/service/app_connectivity.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:ai_ppt_generater/AdsUtils/loading_screen.dart';
import 'package:ai_ppt_generater/AdsUtils/shimmer.dart';
import 'package:ai_ppt_generater/AdsUtils/shimmer_banner.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/ads/app_open_ad.dart';
import 'package:ai_ppt_generater/ads/life_cycle.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AdsLoadUtil extends GetxController {
  late SharedPreferences prefs;
  late AppLifecycleReactor appLifecycleReactor;

  /// Send Revenue Event to Firebase Function --------------------------------------
  static Future<void> sendRevenueToAnalytics(double valueMicros, String? currency, PrecisionType precision, bool enabled) async {
    try {
      print("analytics===========");
      print("Enabled value : $enabled");
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

      print(
        'AdRevenue: sendRevenueToAnalytics -> '
        'revenue: $revenue, '
        'currency: ${currency ?? 'USD'}, '
        'precision: ${precision.name}',
      );

      await FirebaseAnalytics.instance.logEvent(name: 'ad_impression', parameters: {'ad_platform': 'Google AdMob Manager', 'value': revenue, 'currency': currency ?? 'USD', 'precision_type': precision.name});

      print('analaytics ====== event ends');
    } catch (e, stackTrace) {
      debugPrint('AdRevenue: Failed to send revenue to Firebase Analytics: $e');
      debugPrint('----------stackTrace--------$stackTrace');
    }
  }

  /// --------- load open ads -----------------------------------------------------
  loadAppOpenSplash(Function() navigateScreen) async {
    AppOpenAdManager appOpenAdManager = AppOpenAdManager()..loadSplashAd(Platform.isAndroid ? AdsVariable.appOpenSplash : AdsVariable.appOpenSplash, () => navigateScreen());
    appLifecycleReactor = AppLifecycleReactor(appOpenAdManager: appOpenAdManager);
    AppLifecycleReactor(appOpenAdManager: appOpenAdManager).listenToAppStateChanges();
  }

 /* static RewardedAd? rewardedAd;

  /// ------ Reward Ad Load & Show --------------------------------------------
  loadRewardedAd(String adUnitId, {required bool enable}) async {
    prefs = await SharedPreferences.getInstance();
    showLog('>>> LOAD REWARDS AD <<<');
    if (adUnitId != '11') {
      await RewardedAd.load(
        adUnitId: adUnitId,
        request: const AdRequest(),
        rewardedAdLoadCallback: RewardedAdLoadCallback(
          onAdLoaded: (ad) {
            showLog("$ad loaded_____");
            rewardedAd = ad;
            showLog("reward AD load------>$rewardedAd");
            ad.onPaidEvent = (Ad ad, double valueMicros, PrecisionType precision, String currencyCode) {
              AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
            };
          },
          onAdFailedToLoad: (error) {
            showLog('Reward Ad failed to load loadRewardAd: $error');
          },
        ),
      );
    } else {
      showLog("--- ELSE ---");
      showLog(" Ad is not available $adUnitId");
    }
  }*/

  static RewardedAd? rewardedAd;

  Future<bool> loadRewardedAd(String adUnitId, {required bool enable}) async {
    showLog('>>> LOAD REWARDS AD <<<');
    if (adUnitId == '11') {
      showLog("Ad is not available $adUnitId");
      return false;
    }

    rewardedAd?.dispose();
    rewardedAd = null;

    final completer = Completer<bool>();

    RewardedAd.load(
      adUnitId: adUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          showLog("reward AD loaded------>$ad");
          rewardedAd = ad;
          ad.onPaidEvent = (Ad ad, double valueMicros, PrecisionType precision, String currencyCode) {
            AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
          };
          if (!completer.isCompleted) completer.complete(true);
        },
        onAdFailedToLoad: (error) {
          showLog('Reward Ad failed to load: $error');
          rewardedAd = null;
          if (!completer.isCompleted) completer.complete(false);
        },
      ),
    );

    // Max 10 sec wait, pachhi false
    return completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        showLog("Reward ad load timeout");
        return false;
      },
    );
  }

  showRewardedAd({required Function() onRewarded, required Function() onSkipped}) async {
    showLog("rewardedAd------>$rewardedAd");
    final ad = rewardedAd;
    if (ad == null) {
      onSkipped();
      return;
    }
    rewardedAd = null;
    bool earned = false;
    AdsVariable.isShowingAd.value = true;
    ad.setImmersiveMode(true);
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdShowedFullScreenContent: (ad) {
        showLog("onAdShowedFullScreenContent Reward Ad showRewardAd");
      },
      onAdFailedToShowFullScreenContent: (ad, error) async {
        ad.dispose();
        AdsVariable.isShowingAd.value = false;
        showLog("Reward ad failed to show: $error");
        onSkipped();
      },

      onAdDismissedFullScreenContent: (ad) async {
        ad.dispose();
        AdsVariable.isShowingAd.value = false;
        if (earned) {
          onRewarded();
        } else {
          onSkipped();
        }
      },
      onAdClicked: (ad) {
        showLog("Reward Ad Clicked");
      },
    );
    ad.show(
      onUserEarnedReward: (ad, reward) {
        earned = true;
      },
    );
  }

  /// --------- load common inter -----------------------------------------------------
  static InterstitialAd? commonInterAd;
  RxInt adLoad = 0.obs;

  Future<void> loadInterCommon(String adUnitId, {required bool enable}) async {
    prefs = await SharedPreferences.getInstance();
    showLog('>> LOAD INTER CALL <<');
    if (adUnitId != "11") {
      final loaded = Completer<void>(); // app-factory F1: wait for the ad, as loadRewardedAd does
      await InterstitialAd.load(
        adUnitId: adUnitId,
        request: const AdRequest(),
        adLoadCallback: InterstitialAdLoadCallback(
          // Called when an ad is successfully received.
          onAdLoaded: (ad) {
            showLog('$ad loaded......');
            // Keep a reference to the ad so you can show it later.
            commonInterAd = ad;
            adLoad.value = 0;
            if (!loaded.isCompleted) loaded.complete();
            showLog("commonInterAd load------>$commonInterAd");
            ad.onPaidEvent = (Ad ad, double valueMicros, PrecisionType precision, String currencyCode) {
              AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
            };
          },

          // Called when an ad request failed.
          onAdFailedToLoad: (LoadAdError error) {
            showLog('InterstitialAd failed to load loadInter: $error');
            if (!loaded.isCompleted) loaded.complete();
            // adLoad.value += 1;
            // if (adLoad.value < 2) {
            //   await loadInterCommon(adUnitId);
            // }
          },
        ),
      );
      await loaded.future.timeout(const Duration(seconds: 10), onTimeout: () {});
    } else {
      showLog("ELSE -----");
    }
  }

  showInterCommon(Function() loadPreLoadAds, Function() navigateScreen) async {
    showLog("commonInterAd------>$commonInterAd");
    if (commonInterAd == null) {
      // await loadInterCommon((AdsVariable.interPreLoad));
      navigateScreen();
      return; // app-factory F2
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
        // await loadInterCommon((AdsVariable.interPreLoad));
        navigateScreen();
        AdsVariable.isShowingAd.value = false;
        showLog("onAdFailedToShowFullScreenContent common showInter");
      },
      // Called when the ad dismissed full screen content.
      onAdDismissedFullScreenContent: (ad) async {
        // Dispose the ad here to free resources.
        ad.dispose();
        // await loadInterCommon((AdsVariable.interPreLoad));
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
  loadInterSplash(Function() loadPreLoadAds, Function() navigateScreen, String adUnitId, {required bool enable}) async {
    prefs = await SharedPreferences.getInstance();
    showLog('>> SHOW INTER CALL <<');
    showLog('AdsVariable.appOpenSplash >>${AdsVariable.appOpenSplash}');
    showLog('AdsVariable.appOpenAds >>${AdsVariable.appOpenAds}');

    if (!AdsVariable.isPurchase.value && AdsVariable.isFirstTimeVisited != null) {
      // await loadPreLoadAds();
      if (Platform.isAndroid ? AdsVariable.appOpenSplash != "11" : AdsVariable.appOpenSplash != "11") {
        await loadPreLoadAds();
        await loadAppOpenSplash(() => navigateScreen());
      } else {
        await loadPreLoadAds();
        if (!AppOpenAdManager().isAdAvailable && (Platform.isAndroid ? AdsVariable.appOpenAds != "11" : AdsVariable.appOpenAds != "11")) {
          // AdsSplashUtils().loadAppOpenAd();
        }
        InterstitialAd.load(
          adUnitId: adUnitId,
          request: const AdRequest(),
          adLoadCallback: InterstitialAdLoadCallback(
            // Called when an ad is successfully received.
            onAdLoaded: (ad) {
              ad.fullScreenContentCallback = FullScreenContentCallback(
                // Called when the ad showed the full pages content.
                onAdShowedFullScreenContent: (ad) async {
                  // await loadPreLoadAds();

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
                  // await loadPreLoadAds();

                  showLog("onAdFailedToShowFullScreenContent loadInterSplash");
                },
                // Called when the ad dismissed full pages content.
                onAdDismissedFullScreenContent: (ad) async {
                  // Dispose the ad here to free resources.
                  ad.dispose();
                  // loadAd(Platform.isAndroid ? AdsVariable.interPreLoad : AdsVariable.interPreLoadIOS);
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

              // loadingScreen.show();
              Future.delayed(const Duration(seconds: 0)).then((value) {
                splashInterAd!.show();
                // loadingScreen.hide();
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
  static RxBool isNativeAdLoaded = false.obs;
  static RxBool isNativeAdFailed = false.obs;
  // app-factory F3: each native's own state (the flags above stay for the screens' conditions)
  static final Set<Ad> loadedNatives = {}, failedNatives = {};
  static RxInt nativeEvents = 0.obs;

  Future<NativeAd> loadNative(String adUnitId, bool isSmallNative, bool isFullNative, {required bool enable}) async {
    showLog("isSmallNative--->$isSmallNative");
    showLog("isFullNative--->$isFullNative");
    showLog("Pass ad Id for Native Ad --->$adUnitId");
    final NativeAd thisAd = NativeAd( // app-factory F3
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
          loadedNatives.add(ad);
          nativeEvents.value++;
        },
        onPaidEvent: (ad, valueMicros, precision, currencyCode) {
          AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
        },

        onAdFailedToLoad: (ad, error) {
          showLog('onAdFailedToLoad loadNative $error');
          ad.dispose();
          failedNatives.add(ad);
          nativeEvents.value++;
          isNativeAdLoaded.value = false;
          isNativeAdFailed.value = true;
        },
      ),
      request: const AdRequest(),
    );
    nativeAd = thisAd;
    await thisAd.load();
    return thisAd;
  }

  /// -------------------- banner ads load -----------------------------
  static BannerAd? bannerAd;
  static RxBool isLoaded = false.obs;
  static RxBool isFailed = false.obs;

  /// Load another ad, disposing of the current ad if there is one.
  Future<void> loadBanner(String adId, {required bool enable}) async {
    showLog("Load banner start");
    final AnchoredAdaptiveBannerAdSize? size = await AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(MediaQuery.of(Get.context!).size.width.truncate());

    if (size == null) {
      showLog('Unable to get height of anchored banner.');
      return;
    }
    bannerAd = null;
    bannerAd = BannerAd(
      adUnitId: adId,
      size: size,
      request: const AdRequest(),
      listener: BannerAdListener(
        onAdLoaded: (Ad ad) {
          showLog('$ad loaded: ${ad.responseInfo}');
          // setState(() {
          bannerAd = ad as BannerAd;
          isLoaded.value = true;
          showLog('Banner Load');
          // });
        },
        onPaidEvent: (ad, valueMicros, precision, currencyCode) {
          AdsLoadUtil.sendRevenueToAnalytics(valueMicros, currencyCode, precision, enable);
        },
        onAdFailedToLoad: (Ad ad, LoadAdError error) {
          showLog('Anchored adaptive banner failedToLoad: $error');
          isLoaded.value = false;
          isFailed.value = true;
          ad.dispose();
        },
      ),
    );
    return bannerAd!.load();
  }

  /// -------------------- AppOPen ads load -----------------------------
  InterstitialAd? IntroPremiumInterAd;

  /// -------------------- IntroPremium OpenAds loading ------------------------
  Future<void> loadAppOpenIntroPremium(Function() navigateScreen, bool isIntro) async {
    AppOpenAdManager appOpenAdManager = AppOpenAdManager()..loadIntroPremiumAd(isIntro ? AdsVariable.appOpenIntro : AdsVariable.appOpenPremium, () => navigateScreen());
    // appLifecycleReactor = AppLifecycleReactor(appOpenAdManager: appOpenAdManager);
    // AppLifecycleReactor(appOpenAdManager: appOpenAdManager).listenToAppStateChanges();
  }

  /// -------------------- IntroPremium inter loading ------------------------
  Future<void> loadInterIntroPremium(Function() navigateScreen, String adUnitId, bool isIntro, {required bool enable}) async {
    prefs = await SharedPreferences.getInstance();
    showLog('>> SHOW INTER CALL <<');
    // showLog('AdsVariable.appOpenSplashIOS >>${AdsVariable.Afs_appOpenSplashIOS}');
    showLog('AdsVariable.appOpenSplash >>${AdsVariable.appOpenSplash}');

    if (!AdsVariable.isPurchase.value) {
      // await loadPreLoadAds();
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
                    // await loadPreLoadAds();

                    showLog("onAdShowedFullScreenContent loadInterIntroPremium");
                  },
                  // Called when an impression occurs on the ad.
                  onAdImpression: (ad) async {
                    showLog("onAdImpression loadInterIntroPremium");
                    // if (!AppOpenAdManager().isAdAvailable &&
                    //     (AdsVariable.Afs_appOpenAds != "11")) {
                    //   AdsSplashUtils().loadAppOpenAd();
                    // }
                    Future.delayed(const Duration(seconds: 1)).then((value) {
                      navigateScreen();
                    });
                  },
                  // Called when the ad failed to show full screen content.
                  onAdFailedToShowFullScreenContent: (ad, err) async {
                    // Dispose the ad here to free resources.
                    ad.dispose();
                    // await loadPreLoadAds();

                    showLog("onAdFailedToShowFullScreenContent loadInterIntroPremium");
                  },
                  // Called when the ad dismissed full screen content.
                  onAdDismissedFullScreenContent: (ad) async {
                    // Dispose the ad here to free resources.
                    ad.dispose();
                    IntroPremiumInterAd = null;
                    // loadAd(Platform.isAndroid ? AdsVariable.interPreLoad : AdsVariable.interPreLoadIOS);
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
                // await loadPreLoadAds();
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

  Future<void> loadOpenAdCommon(String adUnitId) async {
    prefs = await SharedPreferences.getInstance();
    showLog('>> LOAD AD CALL <<');
    if (adUnitId != "11") {
    } else {
      showLog("There are no Ad ID Found!");
    }
  }
}

/// Banner ads
class BannerAdsWidget extends StatefulWidget {
  const BannerAdsWidget({super.key});

  @override
  State<BannerAdsWidget> createState() => _BannerAdsWidgetState();
}

/// Banner ads
class _BannerAdsWidgetState extends State<BannerAdsWidget> {
  RxBool isConnection = false.obs;

  @override
  void initState() {
    // TODO: implement initState
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) {
      setState(() {
        showLog("AdsLoadUtil.isLoaded------->${AdsLoadUtil.isLoaded.value}");
        if (AdsLoadUtil.bannerAd != null) {
          showLog("AdsLoadUtil.bannerAd!.value if ------->${AdsLoadUtil.bannerAd}");
        } else {
          showLog("AdsLoadUtil.bannerAd!.value else------>");
        }
      });
    });
  }

  @override
  void didChangeDependencies() {
    // TODO: implement didChangeDependencies
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
    return Obx(
      () => !AdsLoadUtil.isFailed.value
          ? AdsLoadUtil.isLoaded.value
                ? Container(
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(5.w), color: Colors.black),
                    // margin: EdgeInsets.symmetric(vertical: 5.w, horizontal: 5.w),
                    width: AdsLoadUtil.bannerAd!.size.width.toDouble(),
                    height: AdsLoadUtil.bannerAd!.size.height.toDouble(),
                    child: AdWidget(ad: AdsLoadUtil.bannerAd!),
                  )
                : isConnection.value
                ? BannerShimmerWidget()
                : Container(
                    width: Get.width,
                    height: MediaQuery.of(context).size.height / 13.5,
                    // margin: EdgeInsets.symmetric(vertical: 5.w, horizontal: 5.w),
                  )
          : Container(
              width: Get.width,
              height: MediaQuery.of(context).size.height / 13.5,
              // margin: EdgeInsets.symmetric(vertical: 5.w, horizontal: 5.w),
            ),
    );
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
  RxBool isConnection = false.obs;

  @override
  void initState() {
    // TODO: implement initState
    super.initState();
  }

  @override
  void didChangeDependencies() {
    // TODO: implement didChangeDependencies
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
    return Obx(
      () => isConnection.value
          ? AdsLoadUtil.nativeEvents.value >= 0 && widget.showNativeAd != null && !AdsLoadUtil.failedNatives.contains(widget.showNativeAd) // app-factory F3
                ? Obx(
                    () => AdsLoadUtil.nativeEvents.value >= 0 && AdsLoadUtil.loadedNatives.contains(widget.showNativeAd)
                        ? Container(
                            padding: EdgeInsets.all(00.w),
                            width: Get.width,
                            height: widget.isSmallNative ? ((2688 * 140) / 690).w : ((2688 * 250) / 690).w,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(20),
                              // color: Colors.white.withOpacity(0.3),
                            ),
                            child: AdWidget(ad: widget.showNativeAd!),
                          )
                        : widget.isSmallNative
                        ? const ShimmerSmallNative()
                        : widget.isFullNative
                        ? const ShimmerFullNative()
                        : const ShimmerBigNative(),
                  )
                : Container()
          : Container(),
    );
  }

  double getHeight() {
    if (Platform.isIOS) {
      return widget.isSmallNative ? 140.h : 250.h;
    } else {
      log("Device Height  --> ${Get.height}");
      if (Get.height <= 650)
        return widget.isSmallNative ? 130.h : 270.h;
      else
        return widget.isSmallNative ? 130.h : 270.h;
    }
  }
}
