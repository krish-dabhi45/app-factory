import 'dart:io';

import 'package:ai_ppt_generater/AdsUtils/firebase_event_service.dart';
import 'package:ai_ppt_generater/ads/ads_load_util.dart';
import 'package:ai_ppt_generater/ads/ads_splash_utils.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/in_app_purchase/app.dart';
import 'package:ai_ppt_generater/screens/home_screen.dart';
import 'package:ai_ppt_generater/screens/onboarding_screen.dart';
import 'package:ai_ppt_generater/service/app_connectivity.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {

  void initState() {
    super.initState();
    FirebaseEventService.logEvent(eventName: "Splash Screen");
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) async {
      await AdsSplashUtils().getOnlineIds(navigateScreen);
      if (await checkConnectivity()) {
        showLog("Check Connectivity");
        await AdsLoadUtil().loadInterSplash(
          () {
            loadPreLoadAds();
            if (AdsVariable.isFirstTimeVisited == true && Platform.isAndroid) {
              AdsVariable.homeFlag++;
              showLog("AdsVariable.homeFlag--->${AdsVariable.homeFlag}");
            }
          },
          () {
            navigateScreen();
          },
          Platform.isAndroid ? AdsVariable.interSplash : AdsVariable.interSplash,
          enable: Platform.isAndroid ? AdsVariable.sendRevenueToAnalyticsForInterSplash : AdsVariable.sendRevenueToAnalyticsForInterSplash,
        );
      } else {
        showLog("=-=-=-=-=-No Internet-=-=-=-=-=");
      }
    });
  }

  void loadPreLoadAds() async {
    showLog("Call Method loadPreLoadAds");
    showLog("AdsVariable.isFirstTime---->${AdsVariable.isFirstTimeVisited}");
    showLog("AdsVariable.nativeHome---->${AdsVariable.nativeHome}");

    if (AdsVariable.adShowHomeFlag == "1" && AdsVariable.nativeHome != "11") {
      AdsVariable.nativeAdHome = await AdsLoadUtil().loadNative(Platform.isAndroid ? AdsVariable.nativeHome : AdsVariable.nativeHome, true, false, enable: Platform.isAndroid ? AdsVariable.sendRevenueToAnalyticsForNativeHome : AdsVariable.sendRevenueToAnalyticsForNativeHome);
      showLog("AdsVariable.nativeHome----> Add loaded on Splash");
    }

    setState(() {});
  }

  void navigateScreen() async {
    showLog("Call method navigation");
    showLog("AdsVariable.isFirstTimeVisited --->${AdsVariable.isFirstTimeVisited}");

    if (AdsVariable.isFirstTimeVisited == true) {
      if (await checkConnectivity()) {
        if (!AdsVariable.isPurchase.value && Platform.isIOS) {
          Get.offAll(() => const UpsellScreen(isNotFromSplash: false, isFromGenerate: false, showTester: false, screen: 'Splash_Screen'));
        } else {
          Get.offAll(() => HomeScreen());
        }
      } else {
        Get.offAll(() => HomeScreen());
      }
    } else {
      if (AdsVariable.showIntro == "1") {
        showLog("Going to Intro Screen");
        if (AdsVariable.adShowIntroFlag == "1" && AdsVariable.nativeIntroBig != "11") {
          showLog("AdsVariable.nativeIntroBig:  ${AdsVariable.nativeIntroBig}");
          AdsLoadUtil.isNativeAdFailed.value = false;
          AdsLoadUtil.isNativeAdLoaded.value = false;
          AdsVariable.nativeAdIntro = await AdsLoadUtil().loadNative(AdsVariable.nativeIntroBig, false, false, enable: AdsVariable.sendRevenueToAnalyticsForNativeIntroBig);
        }
        Get.offAll(() => IntroScreen());
      } else {
        Get.offAll(() => HomeScreen());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, c) {
          return Container(
            width: c.maxWidth,
            height: c.maxHeight,
            decoration: const BoxDecoration(
              image: DecorationImage(image: AssetImage('assets/splash_screen/bg.png'), fit: BoxFit.cover, alignment: Alignment.topCenter),
            ),
            child: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Spacer(),
                  Image.asset('assets/splash_screen/logo.png', width: 575.w, height: 599.h),
                  const Spacer(),
                  Text(
                    'PPT Maker & Editor',
                    style: TextStyle(color: Colors.white, fontSize: 70.sp, fontFamily: fontFamilyMedium),
                  ),
                  20.verticalSpace,
                  SlidingSegmentBar(trackColor: Colors.white.withOpacity(0.1)),
                  10.verticalSpace,
                  appText(title: "This action may contain ads...", fs: 40.sp, color: Colors.white70, family: fontFamilyLight),
                  50.verticalSpace,
                ],
              ),
            ),
          );
        }
      ),
    );
  }
}

class SlidingSegmentBar extends StatefulWidget {
  const SlidingSegmentBar({super.key, this.height = 8, required this.trackColor, this.segmentFraction = 0.50, this.duration = const Duration(seconds: 3)});

  final double height;
  final Color trackColor;
  final double segmentFraction;
  final Duration duration;

  @override
  State<SlidingSegmentBar> createState() => _SlidingSegmentBarState();
}

class _SlidingSegmentBarState extends State<SlidingSegmentBar> with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: widget.duration)..repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        final segW = w * widget.segmentFraction;

        final anim = Tween<double>(begin: -segW, end: w).animate(CurvedAnimation(parent: _c, curve: Curves.linear));

        return ClipRRect(
          borderRadius: BorderRadius.circular(widget.height / 2),
          child: Stack(
            children: [
              // Track
              Container(height: widget.height, color: widget.trackColor),
              // Moving pill
              AnimatedBuilder(
                animation: anim,
                builder: (_, __) {
                  return Transform.translate(
                    offset: Offset(anim.value, 0),
                    child: Container(
                      width: segW,
                      height: widget.height,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(widget.height / 2),
                        // boxShadow: [widget.shadow],
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ).marginSymmetric(horizontal: 80.w);
      },
    );
  }
}