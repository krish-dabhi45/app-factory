import 'package:ai_ppt_generater/AdsUtils/firebase_event_service.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/controller/home_controller.dart';
import 'package:ai_ppt_generater/in_app_purchase/app.dart';
import 'package:ai_ppt_generater/screens/setting_screen.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:http/http.dart' as http;
import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../widgets/press_unpress_widget.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  RxInt checkInt = 0.obs;

  @override
  void initState() {
    super.initState();
    FirebaseEventService.logEvent(eventName: "Home Screen");
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) async {
      checkHomeConnectivity();

      AdsVariable.isLoggedIn.value = false;
      // AdsSplashUtils().loadAppLifecycleReactor();

      if (AdsVariable.isFirstTimeVisited != null) {
        if (AdsVariable.isFirstTimeVisited!) {
          InAppReview inAppReview = InAppReview.instance;

          bool revCheck = await inAppReview.isAvailable();
          if (revCheck) {
            inAppReview.requestReview();
          }
        }
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool("isFirstTime", true);
    });
  }

  Future<void> checkHomeConnectivity() async {
    try {
      final response = await http.get(Uri.parse("https://www.google.com")).timeout(const Duration(seconds: 5));
      if (response.statusCode == 200) {
        checkInt.value = 2;
      } else {
        checkInt.value = 1;
      }
    } catch (e) {
      checkInt.value = 1;
    }
  }

  @override
  Widget build(BuildContext context) {
    HomeController homeController = Get.put(HomeController());
    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: LayoutBuilder(
        builder: (context, c) {
          return Container(
            height: c.maxHeight,
            width: c.maxWidth,
            color: appBackgroundColor,
            child: SafeArea(
              child: Center(
                child: Column(
                  children: [
                    20.verticalSpace,
                    Row(
                      children: [
                        50.horizontalSpace,
                        PressUnpress(
                          onTap: () {
                            Get.to(SettingScreen(data: homeController.data.value));
                          },
                          width: 158.w,
                          height: 158.w,
                          imageAssetPress: 'assets/home_screen/more_press.png',
                          imageAssetUnPress: 'assets/home_screen/more_unpress.png',
                        ),
                        Spacer(),
                        Obx(
                              () =>
                          AdsVariable.isPurchase.isFalse
                              ? PressUnpress(
                            onTap: () {
                              Get.to(() => UpsellScreen(isFromGenerate: false, isNotFromSplash: true, screen: "home_screen", showTester: false));
                            },
                            width: 158.w,
                            height: 158.w,
                            imageAssetPress: 'assets/home_screen/pro_press.png',
                            imageAssetUnPress: 'assets/home_screen/pro_unpress.png',
                          )
                              : SizedBox(),
                        ),
                        50.horizontalSpace,
                      ],
                    ),
                    20.verticalSpace,
                    RichText(
                      text: TextSpan(
                        children: [
                          TextSpan(
                            text: 'PPT Maker ',
                            style: TextStyle(color: appColor, fontSize: 90.sp, fontFamily: fontFamilyBold),
                          ),
                          TextSpan(
                            text: '& Editor',
                            style: TextStyle(color: Colors.white, fontSize: 90.sp, fontFamily: fontFamilySemiBold),
                          ),
                        ],
                      ),
                    ),
                    10.verticalSpace,
                    Text(
                      'Make a PPT and edit with powerful tools',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white.withOpacity(0.35), fontSize: 58.sp, fontFamily: fontFamilyRegular),
                    ),
                    50.verticalSpace,
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'PPT Topic',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white, fontSize: 65.sp, fontFamily: fontFamilyMedium),
                      ),
                    ).marginOnly(left: 50.w),
                    30.verticalSpace,
                    Container(
                      width: sw,
                      height: 220.w,
                      margin: .symmetric(horizontal: 50.w),
                      // constraints: BoxConstraints(minHeight: 250.h),
                      decoration: BoxDecoration(
                        color: Colors.white10,
                        border: Border.all(color: Color(0xff383838), width: 1),
                        borderRadius: BorderRadius.circular(50.w),
                      ),
                      alignment: Alignment.center,
                      padding: EdgeInsets.symmetric(horizontal: 50.w),
                      child: TextField(
                        controller: homeController.textEditingController,
                        focusNode: homeController.focusNode,
                        cursorColor: appColor,
                        onTapOutside: (event) async {
                          await Future.delayed(Duration(milliseconds: 150));
                          homeController.focusNode.unfocus();
                        },
                        onChanged: (value) {
                          homeController.isNotEmpty.value = value.isNotEmpty;
                        },
                        autocorrect: true,
                        textInputAction: TextInputAction.done,
                        maxLines: null,
                        style: TextStyle(color: Colors.white, fontSize: 55.sp, fontFamily: fontFamilyRegular),
                        decoration: InputDecoration(
                          border: InputBorder.none,
                          hintText: 'Please enter your slides topic',
                          hintStyle: TextStyle(color: Color(0xff6C6C6C), fontSize: 55.sp, fontFamily: fontFamilyRegular),
                          suffix: Obx(
                                () =>
                            homeController.isNotEmpty.value
                                ? PressUnpress(
                              onTap: () {
                                homeController.textEditingController.clear();
                                homeController.isNotEmpty.value = homeController.textEditingController.text.isNotEmpty;
                              },
                              width: 50.w,
                              height: 50.w,
                              imageAssetPress: 'assets/presentation_screen/close_press.png',
                              imageAssetUnPress: 'assets/presentation_screen/close_unpress.png',
                            )
                                : SizedBox(),
                          ),
                        ),
                      ),
                    ),
                    50.verticalSpace,
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Image.asset('assets/home_screen/topic ideas.png', width: 409.w, height: 80.h),
                    ).marginOnly(left: 50.w),
                    50.verticalSpace,
                    Expanded(
                      child: ListView.builder(
                        itemCount: homeController.topicList.length,
                        shrinkWrap: true,
                        padding: EdgeInsets.symmetric(horizontal: 50.w, vertical: 30.w),
                        itemBuilder: (context, index) {
                          /*if (index == 3) {
                            return Obx(() {
                              final isLoaded = AdsLoadUtil.isNativeAdLoaded.value;
                              final isPurchased = AdsVariable.isPurchase.value;

                              if (AdsVariable.nativeHome != "11" && isLoaded && !isPurchased) {
                                return Container(
                                  alignment: Alignment.center,
                                  width: sw,
                                  padding: EdgeInsets.all(30.w),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(35.w),
                                    border: Border.all(color: Color(0xff343434)),
                                  ),
                                  child: NativeAdsWidget(showNativeAd: AdsVariable.nativeAdHome, isSmallNative: true, isFullNative: false),
                                ).marginOnly(bottom: 40.w);
                              }
                              return const SizedBox.shrink();
                            });
                          }*/

                          /*// Skip ad index to get the correct topic index.
                          final topicIndex = index > 3 ? index - 1 : index;

                          // Safety check to prevent RangeError.
                          if (topicIndex >= homeController.topicList.length) {
                            return const SizedBox.shrink();
                          }*/

                          String text = homeController.topicList[index];
                          return GestureDetector(
                            onTap: () {
                              if (!homeController.focusNode.hasFocus) {
                                homeController.textEditingController.text = text;
                                homeController.isNotEmpty.value = homeController.textEditingController.text.isNotEmpty;
                              }
                            },
                            child: Container(
                              width: sw,
                              height: 150.h,
                              decoration: BoxDecoration(
                                color: Colors.black,
                                borderRadius: BorderRadius.circular(35.w),
                                border: .all(color: Color(0xff343434)),
                              ),
                              alignment: Alignment.centerLeft,
                              padding: EdgeInsets.symmetric(horizontal: 50.w),
                              child: Text(
                                text,
                                style: TextStyle(color: Color(0xff6D6D6D), fontSize: 45.sp, fontFamily: fontFamilyRegular),
                              ),
                            ).marginOnly(bottom: 40.w),
                          );
                        },
                      ),
                    ),
                    50.verticalSpace,
                    PressUnpress(
                      onTap: () async {
                        String inputText = homeController.textEditingController.value.text.trim();
                        int wordCount = inputText
                            .split(" ")
                            .where((word) => word.isNotEmpty)
                            .length;
                        if (wordCount >= 5) {
                          homeController.fetchId(inputText: inputText);
                        } else {
                          appToast("Please enter at least 5 words.");
                        }
                      },
                      pressColor: pressColor.withOpacity(0.5),
                      unPressColor: pressColor,
                      mRight: 50.w,
                      mLeft: 50.w,
                      child: appText(title: "Generate Outline", fs: 58.sp, family: fontFamilySemiBold, color: Colors.white),
                    ),
                    50.verticalSpace,

                    // if (!AdsVariable.isPurchase.value) (AdsVariable.collapsibleBanner != "11" && AdsVariable.collapsibleBanner.isNotEmpty) ? CollapsibleBannerWidget(adUnitId: AdsVariable.collapsibleBanner, enable: AdsVariable.sendRevenueToAnalyticsForCollapsibleBanner) : SizedBox.shrink(),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
