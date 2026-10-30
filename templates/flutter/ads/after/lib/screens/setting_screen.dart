import 'dart:io';

import 'package:ai_ppt_generater/AdsUtils/app_constant.dart';
import 'package:ai_ppt_generater/AdsUtils/firebase_event_service.dart';
import 'package:ai_ppt_generater/ads/ads_splash_utils.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/screens/my_creation_screen.dart';
import 'package:ai_ppt_generater/screens/privacy_policy.dart';
import 'package:ai_ppt_generater/service/app_connectivity.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/service/press_unpress.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:share_plus/share_plus.dart';

class SettingScreen extends StatefulWidget {
  final String data;

  const SettingScreen({super.key, required this.data});

  @override
  State<SettingScreen> createState() => _SettingScreenState();
}

class _SettingScreenState extends State<SettingScreen> {
  RxBool isLoading = false.obs;

  @override
  void initState() {
    super.initState();
    FirebaseEventService.logEvent(eventName: 'setting_screen');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: appBackgroundColor,
      appBar: AppBar(
        backgroundColor: appBackgroundColor,
        toolbarHeight: 220.h,
        automaticallyImplyLeading: false,
        centerTitle: false,
        title: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            PressUnpress(
              onTap: () {
                Get.back();
              },
              width: 106.w,
              height: 106.w,
              imageAssetPress: 'assets/setting_screen/back_press.png',
              imageAssetUnPress: 'assets/setting_screen/back_unpress.png',
            ),
            Text(
              'App Settings',
              style: TextStyle(color: Colors.white, fontSize: 70.sp, fontFamily: fontFamilyMedium),
            ),
          ],
        ),
      ),
      body: PopScope(
        canPop: false,
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 70.w),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              50.verticalSpace,
              PressUnpress(
                onTap: () {
                  Get.to(MyCreationScreen());
                },
                width: 1120.w,
                height: 200.h,
                imageAssetPress: 'assets/setting_screen/my creation_unpress.png',
                imageAssetUnPress: 'assets/setting_screen/my creation_press.png',
              ).marginOnly(bottom: 40.w),
              if (AdsVariable.showShareBtn == "1")
                PressUnpress(
                  onTap: () async {
                    isLoading.value = true;

                    final result = await checkConnectivity();

                    if (result) {
                      await Share.share(Platform.isAndroid ? "https://play.google.com/store/apps/details?id=$androidAppId" : "https://itunes.apple.com/app/id$iOSAppId?ls=1&mt=8").then((value) {
                        if (value.status != ShareResultStatus.unavailable) {
                          isLoading.value = false;
                        }
                      });
                    } else {
                      isLoading.value = false;
                      showToast("Please Start Your Internet.");
                    }
                  },
                  width: 1120.w,
                  height: 200.h,
                  imageAssetPress: 'assets/setting_screen/share_unpress.png',
                  imageAssetUnPress: 'assets/setting_screen/share_press.png',
                ).marginOnly(bottom: 40.w),
              if (AdsVariable.showRateBtn == "1")
                PressUnpress(
                  onTap: () async {
                    final result = await checkConnectivity();

                    if (result) {
                      final inAppReview = InAppReview.instance;

                      if (await inAppReview.isAvailable()) {
                        inAppReview.openStoreListing(appStoreId: iOSAppId);
                      }
                    } else {
                      showToast("Please Start Your Internet.");
                    }
                  },
                  width: 1120.w,
                  height: 200.h,
                  imageAssetPress: 'assets/setting_screen/rate_unpress.png',
                  imageAssetUnPress: 'assets/setting_screen/rate_press.png',
                ).marginOnly(bottom: 40.w),
              if (AdsVariable.showPrivacyBtn == "1")
                PressUnpress(
                  onTap: () {
                    // AdsVariable.creationFlag = 0;
                    Get.to(const PrivacyPolicy());
                  },
                  width: 1120.w,
                  height: 200.h,
                  imageAssetPress: 'assets/setting_screen/privacy_unpress.png',
                  imageAssetUnPress: 'assets/setting_screen/privacy_press.png',
                ).marginOnly(bottom: 40.w),
              if (AdsVariable.isPrivacyOptionsRequired.value)
                PressUnpress(
                  onTap: () {
                    final scaffoldMessenger = ScaffoldMessenger.of(context);
                    showPrivacyOptionsForm((formError) {
                      if (formError != null) {
                        debugPrint("${formError.errorCode}: ${formError.message}");
                        scaffoldMessenger.showSnackBar(SnackBar(duration: const Duration(seconds: 1), content: Text('An error occurred while trying to change your privacy choices')));
                      }
                    });
                  },
                  width: 1120.w,
                  height: 200.h,
                  imageAssetPress: 'assets/setting_screen/gdpr_unpress.png',
                  imageAssetUnPress: 'assets/setting_screen/gdpr_press.png',
                ),
            ],
          ),
        ),
      ),
    );
  }
}
