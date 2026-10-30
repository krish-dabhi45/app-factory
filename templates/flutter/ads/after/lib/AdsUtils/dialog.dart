import 'dart:io';

import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/screens/home_screen.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/service/press_unpress.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

class DialogService {
  static void showLoading(BuildContext context) {
    if (Platform.isIOS) {
      showCupertinoDialog(
        context: context,
        builder: (context) {
          return const CupertinoAlertDialog(title: Center(child: CupertinoActivityIndicator()));
        },
      );
    } else {
      showDialog(
        context: context,
        builder: (BuildContext context) {
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
            title: const Center(child: CircularProgressIndicator()),
          );
        },
      );
    }
  }

  static void restorePurchasesDialog(BuildContext context) {
    if (Platform.isIOS) {
      showCupertinoDialog(
        context: context,
        builder: (context) {
          return CupertinoAlertDialog(
            title: appText(title: "No Purchases Found", textAlign: TextAlign.center),
            content: appText(title: "You've no active subscriptions. Kindly purchase any of the given subscriptions.", family: fontFamilyRegular, textAlign: TextAlign.center),
            actions: [
              CupertinoDialogAction(
                child: const Text('Ok', style: TextStyle(
                    fontFamily: fontFamilyRegular
                ),),
                onPressed: () {
                  Navigator.of(context).pop();
                },
              ),
            ],
          );
        },
      );
    } else {
      showDialog(
        context: context,
        builder: (BuildContext context) {
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
            title: const Center(child: CircularProgressIndicator()),
          );
        },
      );
    }
  }

  static void successRestoreDialog(BuildContext context) {
    if (Platform.isIOS) {
      showCupertinoDialog(
        context: context,
        builder: (context) {
          return CupertinoAlertDialog(
            title: Text("Purchases Found").marginOnly(bottom: 5.w),
            content: Text("You've active subscriptions. Your plan has been restored."),
            actions: [
              CupertinoDialogAction(
                child: const Text('Ok'),
                onPressed: () async {
                  SharedPreferences? prefs = await SharedPreferences.getInstance();
                  prefs.setBool("isFirstTimePurchased", true);
                  AdsVariable.isFirstTimePurchased = true;
                  AdsVariable.isPurchase.value = true;
                  AdsVariable.resetAdIds();
                  Get.offAll(() => HomeScreen());
                },
              ),
            ],
          );
        },
      );
    } else {
      showDialog(
        context: context,
        builder: (BuildContext context) {
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
            title: const Center(child: CircularProgressIndicator()),
          );
        },
      );
    }
  }

  static void selectDialog(BuildContext context) {
    if (Platform.isIOS) {
      showCupertinoDialog(
        context: context,
        builder: (context) {
          return CupertinoAlertDialog(
            title: appText(title: "Oops", textAlign: TextAlign.center, fs: 50.sp),
            content: appText(title: "Please Upload Image", textAlign: TextAlign.center, family: fontFamilyRegular),
            actions: [
              CupertinoDialogAction(
                child: Text('Ok', style: TextStyle(
                    fontFamily: fontFamilyRegular
                ),),
                onPressed: () {
                  Navigator.of(context).pop();
                },
              ),
            ],
          );
        },
      );
    } else {
      showDialog(
        context: context,
        builder: (context) {
          return CupertinoAlertDialog(
            title: appText(title: "Oops", textAlign: TextAlign.center, fs: 50.sp),
            content: appText(title: "Please Upload Image", textAlign: TextAlign.center, family: fontFamilyRegular),
            actions: [
              CupertinoDialogAction(
                child: Text('Ok', style: TextStyle(
                    fontFamily: fontFamilyRegular
                ),),
                onPressed: () {
                  Navigator.of(context).pop();
                },
              ),
            ],
          );
        },
      );
    }
  }

  static void successPurchasesDialog(BuildContext context, bool value) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15.w)),
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.white,
          title: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: .center,
            children: [
              appText(title: "Purchases Successful", fs: 65.sp, color: Colors.black),
              appText(title: "Your plan subscribe successfully", fs: 55.sp, family: fontFamilyRegular, color: Colors.black),
              30.verticalSpace,
              PressUnpress(
                // unPressGradient: unPressGradient,
                // pressGradient: pressGradient,

                unPressColor: Colors.grey.shade600,
                pressColor: Colors.grey.shade600,

                height: 150.w,
                width: sw * 0.4,
                child: appText(title: "OK", fs: 65.sp),
                onTap: () async {
                  SharedPreferences? prefs = await SharedPreferences.getInstance();
                  prefs.setBool("isFirstTimePurchased", true);
                  AdsVariable.isFirstTimePurchased = true;
                  if (value) {
                    Get.back(result: false);
                    Get.back(result: false);
                  } else {
                    Get.offAll(() => HomeScreen());
                  }
                },
              ),
            ],
          ),
        );
      },
    );
  }

  /*static void showpermissiondialog(BuildContext context, String item) {
    if (Platform.isAndroid) {
      showCupertinoDialog(
        context: context,
        barrierDismissible: true,
        builder: (BuildContext context) {
          return CupertinoAlertDialog(
            content: appText(title: 'Allow access to $item in the Setting.', textAlign: TextAlign.center),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  openAppSettings();
                },
                child: const Text('Setting'),
              ),
            ],
          );
        },
      );
    } else {
      showDialog(
        barrierDismissible: false,
        context: context,
        builder: (BuildContext context) {
          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15.w)),
            backgroundColor: Colors.white,
            surfaceTintColor: Colors.white,
            title: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: .center,
              children: [
                appText(title: "Permission Access", fs: 65.sp, color: Colors.black),
                appText(title: "Allow this app to access $item for editing purpose", fs: 50.sp, family: regular, color: Colors.black, textAlign: TextAlign.center),
                30.verticalSpace,
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Expanded(
                      child: PressUnpress(
                        // unPressGradient: unPressGradient,
                        // pressGradient: pressGradient,
                        unPressColor: Colors.grey.shade600,
                        pressColor: Colors.grey.shade600,

                        height: 150.w,
                        child: appText(title: "Cancel", fs: 55.sp, family: semiBold),
                        onTap: () async {
                          Navigator.pop(context);
                        },
                      ).marginSymmetric(horizontal: 10.w),
                    ),
                    Expanded(
                      child: PressUnpress(
                        // unPressGradient: unPressGradient,
                        // pressGradient: pressGradient,

                        unPressColor: Colors.grey.shade600,
                        pressColor: Colors.grey.shade600,

                        height: 150.w,
                        child: appText(title: "Setting", fs: 55.sp, family: semiBold),
                        onTap: () async {
                          Navigator.pop(context);
                          openAppSettings();
                        },
                      ).marginSymmetric(horizontal: 10.w),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      );
    }
  }*/

/*static void deleteFile(BuildContext context, Function()? onTap) async {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return Scaffold(
          backgroundColor: const Color.fromRGBO(0, 0, 0, 0.1),
          body: LayoutBuilder(
            builder: (context, constraints) {
              return Container(
                width: constraints.maxWidth,
                decoration: BoxDecoration(color: AppColors.appBlack.withAlpha(100)),
                child: Center(
                  child: FittedBox(
                    child: Container(
                      width: constraints.maxWidth * 0.7,
                      decoration: BoxDecoration(
                        color: AppColors.appWhite,
                        // border: Border.all(color: AppColors.grad1),
                        // border: Border.all(color: AppColors.primaryColor1),
                        borderRadius: BorderRadius.circular(70.w),
                      ),
                      child: Stack(
                        alignment: Alignment.topRight,
                        children: [
                          Column(
                            children: [
                              appText(title: AppStrings.strAreYou.tr, fs: 2.4, textAlign: TextAlign.center, line: 1).marginOnly(top: 20.w, bottom: sw * 0.025),
                              appText(title: AppStrings.strRemoveText.tr, fs: ts * 2, line: 4).marginOnly(bottom: 20.w),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceAround,
                                children: [
                                  PressUnpress(
                                    pressColor: Colors.grey.shade600,
                                    unPressColor: Colors.grey.shade600,
                                    onTap: onTap,
                                    child: Container(
                                      width: Get.width * 0.22,
                                      height: Get.width * 0.09,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        // color: AppColors.grad1,
                                        // color: AppColors.primaryColor1,
                                        // border: Border.all(color: AppColors.gradiant2),
                                        borderRadius: BorderRadius.circular(70.w),
                                      ),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                                        children: [
                                          Expanded(
                                            child: appText(title: AppStrings.str_lbl_Delete.tr, fs: 2.2, line: 1).marginSymmetric(horizontal: 5.w),
                                          ),
                                        ],
                                      ).paddingSymmetric(horizontal: 10.w),
                                    ),

                                  ).marginSymmetric(horizontal: 10.w),
                                ],
                              ).marginOnly(bottom: 20.w),
                            ],
                          ).marginSymmetric(horizontal: 70.w, vertical: 50.w),
                          Align(
                            alignment: Alignment.topRight,
                            child: PressUnpress(
                              width: 80.w,
                              height: 80.w,
                              imageAssetUnPress: Assets.scanCloseUnpress,
                              imageAssetPress: Assets.scanClosePress,
                              onTap: () {
                                Navigator.pop(context);
                              },
                            ).marginAll(Get.width * 0.05),
                          ),
                        ],
                      ),
                    ),
                  ).marginSymmetric(horizontal: 70.w, vertical: 0.w),
                ),
              );
            },
          ),
        );
      },
    );
  }*/
}
