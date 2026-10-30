import 'package:ai_ppt_generater/AdsUtils/firebase_event_service.dart';
import 'package:ai_ppt_generater/ads/ads_collapsible_banner.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/in_app_purchase/app.dart';
import 'package:ai_ppt_generater/model/template_model.dart';
import 'package:ai_ppt_generater/screens/ppt_loading_screen.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../widgets/press_unpress_widget.dart';

class TemplatePreviewScreen extends StatelessWidget {
  final String prompt, searchQuery;
  final TemplateModel template;

  List<String> get mediaList => template.media;

  const TemplatePreviewScreen({super.key, required this.prompt, required this.searchQuery, required this.template});

  @override
  Widget build(BuildContext context) {
    showLog("Slug = ${template.slug}");
    FirebaseEventService.logEvent(eventName: 'template_preview_screen');
    return Scaffold(
      body: LayoutBuilder(
        builder: (context, c) {
          return Container(
            height: c.maxHeight,
            width: c.maxWidth,
            color: appBackgroundColor,
            child: SafeArea(
              child: Column(
                children: [
                  /// App Bar
                  SizedBox(
                    height: 200.w,
                    width: sw,
                    child: Row(
                      children: [
                        50.horizontalSpace,
                        PressUnpress(
                          onTap: () {
                            Get.back();
                          },
                          width: 100.w,
                          height: 100.w,
                          imageAssetPress: 'assets/setting_screen/back_press.png',
                          imageAssetUnPress: 'assets/setting_screen/back_unpress.png',
                        ),
                        Spacer(),
                        appText(title: "Preview Template", fs: 60.sp, family: fontFamilySemiBold, color: Colors.white),
                        Spacer(),
                        SizedBox(height: 100.w, width: 100.w),
                        50.horizontalSpace,
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView.builder(
                      padding: EdgeInsets.symmetric(horizontal: 50.w),
                      itemCount: mediaList.length,
                      itemBuilder: (context, index) {
                        var templateImage = mediaList[index];
                        return Container(
                          width: sw,
                          height: 650.w,
                          decoration: BoxDecoration(borderRadius: BorderRadius.circular(20)),
                          margin: EdgeInsets.only(bottom: index == mediaList.length - 1 ? 0.w : 30.w),
                          alignment: Alignment.center,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(20),
                            child: Image.network(
                              templateImage,
                              fit: BoxFit.cover,
                              loadingBuilder: (context, child, loadingProgress) {
                                if (loadingProgress == null) return child;
                                return Center(child: CupertinoActivityIndicator(color: appColor));
                              },
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      50.verticalSpace,
                      PressUnpress(
                        onTap: () async {
                          checkPurchaseNormalAndRewardAd(
                            "ppt_generate",
                            AdsVariable.useCount,
                            () {
                              Get.to(() => PptLoadingScreen(prompt: prompt, searchQuery: searchQuery, template: template));
                            },
                            "preview_template_screen",
                            withAdOption: true,
                          );
                        },
                        pressColor: pressColor.withOpacity(0.5),
                        unPressColor: pressColor,
                        mRight: 50.w,
                        mLeft: 50.w,
                        child: appText(title: "Generate PPT", fs: 58.sp, family: fontFamilySemiBold, color: Colors.white),
                      ),
                      50.verticalSpace,
                      if (!AdsVariable.isPurchase.value) (AdsVariable.collapsibleBanner != "11" && AdsVariable.collapsibleBanner.isNotEmpty) ? CollapsibleBannerWidget(adUnitId: AdsVariable.collapsibleBanner, enable: AdsVariable.sendRevenueToAnalyticsForCollapsibleBanner) : SizedBox.shrink(),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

enum LimitDialogResult { purchase, watchAd }

class LimitReachedDialog extends StatelessWidget {
  const LimitReachedDialog({super.key});

  static Future<LimitDialogResult?> show() {
    return Get.dialog<LimitDialogResult>(const LimitReachedDialog(), barrierDismissible: true, barrierColor: Colors.black.withOpacity(0.7));
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: EdgeInsets.symmetric(horizontal: 60.w),
      child: Container(
        padding: EdgeInsets.fromLTRB(50.w, 40.w, 50.w, 50.w),
        decoration: BoxDecoration(
          color: appBackgroundColor,
          borderRadius: BorderRadius.circular(30.w),
          border: Border.all(color: appColor.withOpacity(0.4), width: 2),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            /// Close
            Align(
              alignment: Alignment.centerRight,
              child: GestureDetector(
                onTap: () => Get.back(),
                child: Icon(Icons.close_rounded, color: Colors.white54, size: 70.w),
              ),
            ),

            /// Icon
            Container(
              height: 220.w,
              width: 220.w,
              decoration: BoxDecoration(shape: BoxShape.circle, color: appColor.withOpacity(0.15)),
              child: Icon(Icons.workspace_premium_rounded, color: appColor, size: 130.w),
            ),
            40.verticalSpace,

            /// Title + message
            appText(title: "Free Limit Reached", fs: 64.sp, family: fontFamilySemiBold, color: Colors.white),
            20.verticalSpace,
            Text(
              "You have used all your free generations.\nUpgrade to premium for unlimited PPTs or watch a short ad to generate this one.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white70, fontSize: 40.sp, height: 1.4),
            ),
            50.verticalSpace,

            /// Purchase button
            PressUnpress(
              onTap: () => Get.back(result: LimitDialogResult.purchase),
              pressColor: pressColor.withOpacity(0.5),
              unPressColor: pressColor,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.workspace_premium_rounded, color: Colors.white, size: 64.w),
                  20.horizontalSpace,
                  appText(title: "Get Premium", fs: 52.sp, family: fontFamilySemiBold, color: Colors.white),
                ],
              ),
            ),
            30.verticalSpace,

            /// Watch ad button
            GestureDetector(
              onTap: () => Get.back(result: LimitDialogResult.watchAd),
              child: Container(
                width: double.infinity,
                height: 150.w,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20.w),
                  border: Border.all(color: appColor, width: 2),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.play_circle_fill_rounded, color: appColor, size: 64.w),
                    20.horizontalSpace,
                    appText(title: "Watch Ad to Generate", fs: 52.sp, family: fontFamilySemiBold, color: appColor),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> checkPurchaseWithAdDialog(String prefText, int count, Function() onTap, String screenName) async {
  final prefs = await SharedPreferences.getInstance();
  int countGen = prefs.getInt(prefText) ?? 0;

  final isPremiumUser = AdsVariable.isPurchase.value == true;
  final premiumDisabled = AdsVariable.premiumShow == "0";

  // Premium user ya premium off hoy to direct
  if (isPremiumUser || premiumDisabled) {
    await onTap();
    return;
  }

  // Free use baki chhe
  if (countGen < count) {
    await onTap();
    prefs.setInt(prefText, countGen + 1);
    return;
  }

  // Free use khatam -> dialog
  final choice = await LimitReachedDialog.show();

  if (choice == LimitDialogResult.purchase) {
    final result = await Get.to(() => UpsellScreen(isNotFromSplash: true, isFromGenerate: true, showTester: true, screen: screenName), transition: Transition.downToUp);
    if (result ?? false) {
      await onTap();
    }
  } else if (choice == LimitDialogResult.watchAd) {
    // Tamaro rewarded ad function ahiya jodo
    onTapRewardCall(onTap);
  }
}

Future<void> checkPurchaseNormalAndRewardAd(String prefText, int count, Function() onTap, String screenName, {bool withAdOption = false}) async {
  final prefs = await SharedPreferences.getInstance();

  int countGen = prefs.getInt(prefText) ?? 0;
  if (AdsVariable.isPurchase.value != true && AdsVariable.premiumShow != "0" && !AdsVariable.isLoggedIn.value) {
    if (countGen < count) {
      await onTap();
      prefs.setInt(prefText, countGen + 1);
      return;
    }

    // ---- Free limit khatam ----
    bool goToUpsell = true;

    if (withAdOption) {
      final choice = await LimitReachedDialog.show();

      if (choice == LimitDialogResult.watchAd) {
        await onTapRewardCall(() async {
          await onTap();
        });
        return;
      }
      if (choice != LimitDialogResult.purchase) return;
    }

    if (goToUpsell) {
      var result = await Get.to(() => UpsellScreen(isNotFromSplash: true, isFromGenerate: true, showTester: true, screen: screenName), transition: Transition.downToUp);
      if (result ?? false) {
        await onTap();
        prefs.setInt(prefText, countGen + 1);
      }
    }
  } else {
    await onTap();
  }
}
