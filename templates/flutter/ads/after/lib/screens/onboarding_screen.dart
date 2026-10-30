import 'dart:io';

import 'package:ai_ppt_generater/AdsUtils/firebase_event_service.dart';
import 'package:ai_ppt_generater/ads/ads_load_util.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/ads/app_open_ad.dart';
import 'package:ai_ppt_generater/in_app_purchase/app.dart';
import 'package:ai_ppt_generater/screens/home_screen.dart';
import 'package:ai_ppt_generater/service/app_connectivity.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../widgets/press_unpress_widget.dart';

class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  AppOpenAdManager appOpenAdManager = AppOpenAdManager();
  final PageController _pageController = PageController();

  final RxInt _activePage = 0.obs;

  final List<Widget> _pages = [OnboardingPage(imageAssets: 'assets/onboarding_screen/logo_first.png'), OnboardingPage(imageAssets: 'assets/onboarding_screen/logo_second.png'), OnboardingPage(imageAssets: 'assets/onboarding_screen/logo_third.png')];

  final mTitle = ["Create with AI", "Choose Templates", "Generated PPT"];
  final subTitles = ["Create PPT outline by AI-Powered\nwith just one click", "Here plenty of templates, choose perfect\ntemplate for your presentation", "Make professional quality presentation\nin a seconds"];

  @override
  void initState() {
    super.initState();
    FirebaseEventService.logEvent(eventName: "INTRO_SCREEN");
    appOpenAdManager.loadIntroPremiumAdOnly(AdsVariable.appOpenIntro);
  }

  @override
  void dispose() {
    super.dispose();
    _pageController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LayoutBuilder(
        builder: (_, constraints) {
          return Container(
            height: constraints.maxHeight,
            width: constraints.maxWidth,
            decoration: BoxDecoration(
              image: DecorationImage(image: AssetImage('assets/onboarding_screen/bg.png'), fit: .fill),
            ),
            child: Stack(
              children: [
                PageView.builder(
                  controller: _pageController,
                  itemCount: _pages.length,
                  itemBuilder: (context, index) {
                    return _pages[index];
                  },
                  onPageChanged: (int page) {
                    _activePage.value = page;
                  },
                ),
                Obx(
                  () => SafeArea(
                    child: Column(
                      crossAxisAlignment: .center,
                      mainAxisAlignment: .end,
                      children: [
                        Row(
                          mainAxisAlignment: .center,
                          children: [
                            for (int i = 0; i < _pages.length; i++)
                              Padding(
                                padding: EdgeInsets.symmetric(horizontal: 10.w),
                                child: _activePage.value == i
                                    ? Container(
                                        height: 30.w,
                                        width: 60.w,
                                        decoration: BoxDecoration(color: pressColor, borderRadius: BorderRadius.circular(50)),
                                      )
                                    : Container(
                                        height: 30.w,
                                        width: 40.w,
                                        decoration: BoxDecoration(color: unPressColor, borderRadius: BorderRadius.circular(50)),
                                      ),
                              ),
                          ],
                        ),
                        20.verticalSpace,

                        /// Title
                        IgnorePointer(
                          child: appText(title: mTitle[_activePage.value], family: fontFamilyBold, fs: (AdsVariable.nativeIntroBig != "11"/* && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value*/) ? 55.sp : 70.sp, textAlign: TextAlign.center, color: Colors.white),
                        ),

                        /// SubTitle
                        IgnorePointer(
                          child: appText(title: subTitles[_activePage.value], fs: (AdsVariable.nativeIntroBig != "11"/* && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value*/) ? 42.sp : 50.sp, color: Color(0xFF595959), family: fontFamilySemiBold, textAlign: TextAlign.center),
                        ),
                        50.verticalSpace,
                        if (!(AdsVariable.nativeIntroBig != "11" && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value)) // app-factory F4: Continue whenever Next / Done is not shown
                        PressUnpress(
                          onTap: () async {
                            if (_activePage.value == 0) {
                              _pageController.animateToPage(1, duration: const Duration(milliseconds: 300), curve: Curves.easeIn);
                            } else if (_activePage.value == 1) {
                              _pageController.animateToPage(2, duration: const Duration(milliseconds: 300), curve: Curves.easeIn);
                            } else {
                              appOpenAdManager.showOpenAdIntroPremium(() async {
                                AdsLoadUtil.isNativeAdLoaded.value = false;
                                AdsLoadUtil.isNativeAdFailed.value = false;
                                if (AdsVariable.adShowHomeFlag == "1" && AdsVariable.nativeHome != "11") {
                                  AdsVariable.nativeAdHome = await AdsLoadUtil().loadNative(AdsVariable.nativeHome, true, false, enable: AdsVariable.sendRevenueToAnalyticsForNativeHome);
                                  showLog("AdsLoadUtil.isNativeAdFailed.value ${AdsLoadUtil.isNativeAdFailed.value}");
                                  showLog("AdsLoadUtil.isNativeAdLoaded.value ${AdsLoadUtil.isNativeAdLoaded.value}");
                                  showLog("Native home loaded on intro");
                                }

                                SharedPreferences prefs = await SharedPreferences.getInstance();
                                await prefs.setBool("isFirstTime", true);

                                final isConnected = await checkConnectivity();

                                if (isConnected && Platform.isIOS && !AdsVariable.isPurchase.value) {
                                  Get.offAll(() => UpsellScreen(isNotFromSplash: false, isFromGenerate: false, showTester: false, screen: "Intro_Screen"));
                                  return;
                                }
                                Get.offAll(() => HomeScreen());
                              });
                            }
                          },
                          unPressColor: pressColor,
                          pressColor: pressColor.withOpacity(0.5),
                          mLeft: 50.w,
                          mRight: 50.w,
                          buttonTitle: "Continue",
                        ),
                        50.verticalSpace,

                        /// Native Ad
                        if (AdsVariable.nativeIntroBig != "11" && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value) NativeAdsWidget(showNativeAd: AdsVariable.nativeAdIntro, isSmallNative: false, isFullNative: false),
                      ],
                    ),
                  ),
                ),
                Positioned.fill( // app-factory F4: built again when the native loads
                  child: Obx(() => (AdsVariable.nativeIntroBig != "11" && AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value)
                    ? Align(
                        alignment: Alignment.topRight,
                        child: Padding(
                          padding: EdgeInsets.only(top: 50.w, right: 50.w),
                          child: Obx(() => PressUnPressWidget(child: appText(title: _activePage.value == 2 ? "Done" : "Next", fs: 60.sp, color: pressColor),
                      onTap: () async {
                        if (_activePage.value == 0) {
                          _pageController.animateToPage(1, duration: const Duration(milliseconds: 300), curve: Curves.easeIn);
                        } else if (_activePage.value == 1) {
                          _pageController.animateToPage(2, duration: const Duration(milliseconds: 300), curve: Curves.easeIn);
                        } else {
                          appOpenAdManager.showOpenAdIntroPremium(() async {
                            AdsLoadUtil.isNativeAdLoaded.value = false;
                            AdsLoadUtil.isNativeAdFailed.value = false;
                            if (AdsVariable.adShowHomeFlag == "1" && AdsVariable.nativeHome != "11") {
                              AdsVariable.nativeAdHome = await AdsLoadUtil().loadNative(AdsVariable.nativeHome, true, false, enable: AdsVariable.sendRevenueToAnalyticsForNativeHome);
                              showLog("AdsLoadUtil.isNativeAdFailed.value ${AdsLoadUtil.isNativeAdFailed.value}");
                              showLog("AdsLoadUtil.isNativeAdLoaded.value ${AdsLoadUtil.isNativeAdLoaded.value}");
                              showLog("Native home loaded on intro");
                            }

                            SharedPreferences prefs = await SharedPreferences.getInstance();
                            await prefs.setBool("isFirstTime", true);

                            final isConnected = await checkConnectivity();

                            if (isConnected && Platform.isIOS && !AdsVariable.isPurchase.value) {
                              Get.offAll(() => UpsellScreen(isNotFromSplash: false, isFromGenerate: false, showTester: false, screen: "Intro_Screen"));
                              return;
                            }
                            Get.offAll(() => HomeScreen());
                          });
                        }
                      },
                    ),
                    ),
                        ),
                      )
                    : const SizedBox.shrink()),
                )
              ],
            ),
          );
        },
      ),
    );
  }
}

class OnboardingPage extends StatelessWidget {
  final String imageAssets;
  final double? mTop;

  const OnboardingPage({required this.imageAssets, this.mTop, super.key});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: .topCenter,
      child: Image.asset(imageAssets, fit: BoxFit.contain, width: (AdsVariable.adShowIntroFlag == "1" && AdsVariable.nativeIntroBig != "11"/* &&  AdsLoadUtil.isNativeAdLoaded.value == true && !AdsVariable.isPurchase.value*/) ? sw * 0.68 : sw),
    );
  }
}
