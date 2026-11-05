import 'dart:developer';
import 'dart:io';

import 'package:ai_ppt_generater/screens/home_screen.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';
import 'package:ai_ppt_generater/AdsUtils/dialog.dart';
import 'package:ai_ppt_generater/AdsUtils/firebase_event_service.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/generated/assets.dart';
import 'package:ai_ppt_generater/in_app_purchase/constant.dart';
import 'package:ai_ppt_generater/in_app_purchase/iAmTester.dart';
import 'package:ai_ppt_generater/screens/privacy_policy.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../widgets/press_unpress_widget.dart';
import 'initPlatformState.dart';

class UpsellScreen extends StatefulWidget {
  final bool isNotFromSplash;
  final bool isFromGenerate;
  final String screen;
  final bool showTester;

  const UpsellScreen({super.key, required this.isNotFromSplash, required this.isFromGenerate, required this.screen, required this.showTester});

  @override
  State<StatefulWidget> createState() => _UpsellScreenState();
}

class _UpsellScreenState extends State<UpsellScreen> {
  Offerings? _offerings;

  // bool isClose = true;
  Map<String, Package>? availablePackages;

  // Map<String, Package>? packageEntry;
  Package? selectedPackage;
  Package? weeklyPackage;
  Package? yearPackage;

  // Package? threemonthPackage;
  int index = 0;

  // VideoPlayerController _controller = VideoPlayerController.asset(Assets.premiumPreVideo);

  @override
  void initState() {
    super.initState();
    // _controller.initialize().then((_) {
    //   setState(() {});
    //   _controller.play();
    //   _controller.setLooping(true);
    // });
    fetchData();
    setState(() {});
  }

  @override
  void dispose() {
    // TODO: implement dispose
    // _controller.pause();
    // _controller.removeListener(() {});
    // _controller.dispose();
    super.dispose();
  }

  bool trialEligible = false;

  ///
  Future<void> fetchData() async {
    AdsVariable.isShowingAd.value = true;
    Offerings? offerings;
    try {
      // offerings = await Purchases.getOfferings();

      /// Static Data
      offerings = Offerings(
        current: Offering("RayzAIProOffering", "Get Credit for video generation", {}, [
          Package("\$rc_weekly", PackageType.weekly, StoreProduct("rushi.rayzaisuntanningindex.com.oneweek", "Weekly Subscription (Rays AI Tanning)", "Get credit for video generation", 699.0, "₹699.00", "INR", productCategory: ProductCategory.subscription), PresentedOfferingContext("RayzAIProOffering", null, null)),
          Package("\$rc_annual", PackageType.annual, StoreProduct("rushi.rayzaisuntanningindex.com.oneyear", "Yearly Subscription (Rays AI Tanning)", "Get credit for video generation", 2999.0, "₹2,999.00", "INR", productCategory: ProductCategory.subscription), PresentedOfferingContext("RayzAIProOffering", null, null)),

          ///
          Package(
            "dezire_ai_99",
            PackageType.custom,
            StoreProduct(
              "dezire_ai_99",
              "Ai Credits 10 Coins (Rays AI Tanning)",
              "10 Coins",
              1.99,
              r'$'
                  "1.99",
              "USD",
              productCategory: ProductCategory.nonSubscription,
            ),
            PresentedOfferingContext("RayzAIProOffering", null, null),
          ),
          Package(
            "dezire_ai_299",
            PackageType.custom,
            StoreProduct(
              "dezire_ai_299",
              "Ai Credits 31 Coins (Rays AI Tanning)",
              "31 Coins",
              3.99,
              r'$'
                  "3.99",
              "USD",
              productCategory: ProductCategory.nonSubscription,
            ),
            PresentedOfferingContext("RayzAIProOffering", null, null),
          ),
          Package(
            "dezire_ai_699",
            PackageType.custom,
            StoreProduct(
              "dezire_ai_699",
              "Ai Credits 70 Coins (Rays AI Tanning)",
              "70 Coins",
              9.99,
              r'$'
                  "9.99",
              "USD",
              productCategory: ProductCategory.nonSubscription,
            ),
            PresentedOfferingContext("RayzAIProOffering", null, null),
          ),
          Package(
            "dezire_ai_1499",
            PackageType.custom,
            StoreProduct(
              "dezire_ai_1499",
              "Ai Credits 165 Coins (Rays AI Tanning)",
              "165 Coins",
              19.99,
              r'$'
                  "19.99",
              "USD",
              productCategory: ProductCategory.nonSubscription,
            ),
            PresentedOfferingContext("RayzAIProOffering", null, null),
          ),
          Package(
            "dezire_ai_3199",
            PackageType.custom,
            StoreProduct(
              "dezire_ai_3199",
              "Ai Credits 400 Coins (Rays AI Tanning)",
              "31 Coins",
              39.99,
              r'$'
                  "39.99",
              "USD",
              productCategory: ProductCategory.nonSubscription,
            ),
            PresentedOfferingContext("RayzAIProOffering", null, null),
          ),
          Package(
            "dezire_ai_6500",
            PackageType.custom,
            StoreProduct(
              "dezire_ai_6500",
              "Ai Credits 860 Coins (Rays AI Tanning)",
              "860 Coins",
              56.99,
              r'$'
                  "56.99",
              "USD",
              productCategory: ProductCategory.nonSubscription,
            ),
            PresentedOfferingContext("RayzAIProOffering", null, null),
          ),
        ]),
        {}, // Add more if needed
      );

      availablePackages = {for (var package in offerings.current?.availablePackages ?? []) package.identifier: package};
      log(availablePackages.toString());
      debugPrint("print call 1 -------------");
      showLog("----print call 1 -------------");
      // debugPrint(availablePackages.toString());
      debugPrint("print call 2 -------------");
      // log(offerings.toJson());

      if ((availablePackages?.entries ?? []).isNotEmpty) {
        selectedPackage = (availablePackages?.entries ?? []).where((e) => e.value.packageType == PackageType.weekly).first.value;
        weeklyPackage = (availablePackages?.entries ?? []).where((e) => e.value.packageType == PackageType.weekly).first.value;
        yearPackage = (availablePackages?.entries ?? []).where((e) => e.value.packageType == PackageType.annual).first.value;
        // threemonthPackage = (availablePackages?.entries ?? []).where((e) => e.value.packageType == PackageType.threeMonth).first.value;
      }

      if (selectedPackage!.storeProduct.identifier == weeklyPackage!.storeProduct.identifier) {
        index = 0;
      } else {
        index = 1;
      }
    } on PlatformException catch (e) {
      if (kDebugMode) {
        showLog("Premium: ----->");
        showLog(e.toString());
      }
    }
    if (!mounted) return;
    setState(() {
      _offerings = offerings;
    });
    FirebaseEventService.logEvent(eventName: "${widget.screen}_to_Premium");
  }

  Future<bool> isFreeTrialOnPackage(Package package) async {
    if (package.storeProduct.introductoryPrice != null) {
      showLog("CURRENT PLAN HAS FREE TRIAL");
      showLog("TRIAL PACKAGE IS $package");
    } else {
      showLog("NO FREE TRIAL FOUND");
    }
    final StoreProduct product = package.storeProduct;

    Map<String, IntroEligibility> eligibilityMap = await Purchases.checkTrialOrIntroductoryPriceEligibility([product.identifier]);

    IntroEligibility? eligibility = eligibilityMap[product.identifier];

    showLog("eligible status ${eligibility?.status}");

    if (eligibility?.status == IntroEligibilityStatus.introEligibilityStatusEligible) {
      showLog("User is eligible for a trial or introductory offer.");
      return true;
    } else if (eligibility?.status == IntroEligibilityStatus.introEligibilityStatusIneligible) {
      showLog("User is not eligible for a trial or introductory offer.");
    } else {
      showLog("Unknown eligibility for a trial or introductory offer.");
    }
    return false;
  }

  Future<String> getRegularPrice(Package package) async {
    return package.storeProduct.priceString;
  }

  Future<String> getIntroductoryPriceOnPackage(Package package) async {
    if (package.storeProduct.introductoryPrice != null) {
      showLog("CURRENT PLAN HAS FREE TRIAL");
      showLog("TRIAL PACKAGE IS $package");
    } else {
      showLog("NO FREE TRIAL FOUND");
    }
    final StoreProduct product = package.storeProduct;

    Map<String, IntroEligibility> eligibilityMap = await Purchases.checkTrialOrIntroductoryPriceEligibility([product.identifier]);

    IntroEligibility? eligibility = eligibilityMap[product.identifier];

    showLog("eligible status ${eligibility?.status}");

    if (eligibility?.status == IntroEligibilityStatus.introEligibilityStatusEligible) {
      showLog("User is eligible for a trial or introductory offer.");
      return package.storeProduct.introductoryPrice!.priceString;
    } else if (eligibility?.status == IntroEligibilityStatus.introEligibilityStatusIneligible) {
      showLog("User is not eligible for a trial or introductory offer.");
    } else {
      showLog("Unknown eligibility for a trial or introductory offer.");
    }
    return '';
  }

  String calculatePerWeek(double price) {
    return "${(price / 52).toInt() == 0 ? (price / 52).toDouble().toStringAsFixed(2) : (price / 52).toInt()}/week";
  }

  String calculatePerDay(double price) {
    return "${(price / 7).toInt() == 0 ? (price / 7).toDouble().toStringAsFixed(2) : (price / 7).toInt()}/day";
  }

  String calculateDiscount(double weekPrice, double yearPrice) {
    double weekFull = weekPrice * 52;
    double discountPercentage = (((weekFull - yearPrice) / weekFull) * 100);
    return "Save ${(discountPercentage / 5).round() * 5}%";
  }

  void showLogJson(Map<String, dynamic>? json, [int indentation = 0]) {
    json?.forEach((key, value) {
      showLog('${' ' * indentation}$key: $value');
      if (value is Map<String, dynamic>) {
        showLogJson(value, indentation + 2);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    Offering? offering;
    if (_offerings != null) {
      offering = _offerings!.current;
    }
    return Scaffold(
      backgroundColor: Colors.black,
      body: LayoutBuilder(
        builder: (_, constraints) {
          final ch = constraints.maxHeight;
          final cw = constraints.maxWidth;
          return Container(
            height: ch,
            width: cw,
            decoration: BoxDecoration(color: Colors.black),
            child: SafeArea(
              top: false,
              child: Stack(
                children: [
                  /// Logo
                  Positioned(
                    top: -30.w,
                    child: Image.asset("assets/premium_screen/logo.png", fit: .contain, width: sw),
                  ),

                  /// Close Button
                  Positioned(
                    top: 50.w,
                    right: 50.w,
                    child: SafeArea(
                      child: PressUnpress(
                        onTap: () {
                          if (widget.isNotFromSplash) {
                            Navigator.pop(context, false);
                          } else {
                            Get.offAll(() => HomeScreen());
                          }
                        },
                        imageAssetUnPress: 'assets/presentation_screen/close_unpress.png',
                        imageAssetPress: 'assets/presentation_screen/close_press.png',
                        height: 50.w,
                        width: 50.w,
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 0.w,
                    left: 0.w,
                    right: 0.w,
                    child: Container(
                      width: sw,
                      margin: EdgeInsets.only(left: 30.w, right: 30.w),
                      // color: Colors.white,
                      child: Column(
                        crossAxisAlignment: .center,
                        children: [
                          appText(title: "Unlock Everything", fs: 85.sp, family: fontFamilyBold, color: Colors.white),
                          0.verticalSpace,
                          appText(title: "Unlimited PPTs, Premium Templates & AI-Powered Slides", fs: 40.sp, family: fontFamilyRegular, color: Color(0xFF808080)),
                          // 50.verticalSpace,
                          offering != null
                              ? Align(
                                  alignment: .centerLeft,
                                  child: appText(title: "Choose Plan", fs: 50.sp, family: fontFamilyBold),
                                )
                              : SizedBox.shrink(),

                          ///Plans
                          offering != null
                              ? SizedBox(
                                  width: constraints.maxWidth,
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.center,
                                    children: (availablePackages?.entries ?? []).map((packageEntry) {
                                      final isSelected = selectedPackage == packageEntry.value;
                                      return ((packageEntry.value.storeProduct.identifier.contains("week") && AdsVariable.showWeeklyPlan) || (packageEntry.value.storeProduct.identifier.contains("year") && AdsVariable.showYearlyPlan))
                                          ? Stack(
                                              children: [
                                                InkWell(
                                                  onTap: () {
                                                    setState(() {
                                                      selectedPackage = packageEntry.value;
                                                    });
                                                  },
                                                  child: Container(
                                                    height: 320.w,
                                                    width: sw,
                                                    padding: EdgeInsets.only(left: 50.w, right: 50.w),
                                                    margin: EdgeInsets.only(top: packageEntry.value.packageType == PackageType.annual ? 70.w : 30.w),
                                                    decoration: BoxDecoration(
                                                      color: isSelected ? Colors.white : Colors.white.withOpacity(0.9),
                                                      borderRadius: .circular(20),
                                                      border: .all(color: isSelected ? pressColor : Colors.transparent, width: 2),
                                                    ),
                                                    child: Row(
                                                      children: [
                                                        Image.asset(isSelected ? "assets/premium_screen/select.png" : "assets/premium_screen/unselect.png", width: 90.w, height: 90.w),
                                                        50.horizontalSpace,
                                                        Column(
                                                          mainAxisAlignment: MainAxisAlignment.center,
                                                          crossAxisAlignment: CrossAxisAlignment.start,
                                                          children: [
                                                            appText(
                                                              title: (packageEntry.value.packageType == PackageType.weekly)
                                                                  ? "Weekly Access"
                                                                  : (packageEntry.value.packageType == PackageType.annual)
                                                                  ? "Yearly Access"
                                                                  : (packageEntry.value.packageType == PackageType.twoMonth)
                                                                  ? "2 Months Access"
                                                                  : (packageEntry.value.packageType == PackageType.threeMonth)
                                                                  ? "3 Months Access"
                                                                  : (packageEntry.value.packageType == PackageType.sixMonth)
                                                                  ? "6 Months Access"
                                                                  : (packageEntry.value.packageType == PackageType.lifetime)
                                                                  ? "Lifetime Access"
                                                                  : (packageEntry.value.packageType == PackageType.custom)
                                                                  ? packageEntry.value.identifier
                                                                  : "Monthly Access",
                                                              fs: 55.sp,
                                                              family: fontFamilyBold,
                                                            ),
                                                            (packageEntry.value.packageType != PackageType.weekly) ? appText(title: "${packageEntry.value.storeProduct.priceString.substring(0, 1)}${calculatePerWeek(packageEntry.value.storeProduct.price)}", family: fontFamilyRegular, color: isSelected ? Colors.black : Color(0xFF717171)) : SizedBox.shrink(),
                                                          ],
                                                        ),
                                                        Spacer(),
                                                        Column(
                                                          mainAxisAlignment: .center,
                                                          crossAxisAlignment: .end,
                                                          children: [
                                                            appText(title: (packageEntry.value.packageType == PackageType.weekly) ? packageEntry.value.storeProduct.priceString : packageEntry.value.storeProduct.priceString, fs: 60.sp, family: fontFamilyBold),
                                                            appText(title: (packageEntry.value.packageType == PackageType.weekly) ? "Week" : "Year", family: fontFamilyRegular, color: isSelected ? Colors.black : Color(0xFF747474), fs: 48.sp),
                                                          ],
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                ),

                                                /// Discount Tag
                                                ((packageEntry.value.packageType == PackageType.annual))
                                                    ? Positioned(
                                                        top: 25.w,
                                                        right: 100.w,
                                                        child: Container(
                                                          alignment: Alignment.center,
                                                          padding: .symmetric(horizontal: 30.w, vertical: 20.w),
                                                          decoration: BoxDecoration(
                                                            borderRadius: .circular(50),
                                                            image: DecorationImage(image: AssetImage("assets/premium_screen/% bg.png"), fit: .fill),
                                                          ),
                                                          child: Row(
                                                            crossAxisAlignment: .center,
                                                            children: [
                                                              // Image.asset(Assets.premium.offIc.path, fit: .contain, width: 65.w, height: 65.w),
                                                              20.horizontalSpace,
                                                              appText(title: calculateDiscount(weeklyPackage!.storeProduct.price, packageEntry.value.storeProduct.price), color: Colors.black),
                                                            ],
                                                          ),
                                                        ),
                                                      )
                                                    : Container(),
                                              ],
                                            )
                                          : SizedBox();
                                    }).toList(),
                                  ),
                                )
                              : SizedBox(height: constraints.maxWidth * 0.35, width: constraints.maxWidth),

                          40.verticalSpace,

                          /// Purchase Button
                          offering != null
                              ? PressUnpress(
                                  onTap: () async {
                                    DialogService.showLoading(context);
                                    try {
                                      final customerInfo = await Purchases.purchase(PurchaseParams.package(selectedPackage!));
                                      appData.entitlementIsActive = customerInfo.customerInfo.entitlements.all[entitlementKey]!.isActive;
                                      CheckPurchasesStatus.initPlatformState(selectedPackage!.storeProduct.identifier.toString()).then((value) {
                                        if (value) {
                                          FirebaseEventService.logEvent(eventName: "${widget.screen} ${selectedPackage!.identifier}");
                                          DialogService.successPurchasesDialog(context, widget.isNotFromSplash);
                                        } else {
                                          Fluttertoast.showToast(msg: 'Failed', backgroundColor: const Color(0xff9D6D6D), textColor: Colors.white);
                                        }
                                      });
                                      Get.back();
                                    } on PlatformException catch (e) {
                                      Get.back();
                                      final errorCode = PurchasesErrorHelper.getErrorCode(e);
                                      if (errorCode == PurchasesErrorCode.purchaseCancelledError) {
                                        if (kDebugMode) {
                                          showLog('User cancelled');
                                        }
                                      } else if (errorCode == PurchasesErrorCode.purchaseNotAllowedError) {
                                        if (kDebugMode) {
                                          showLog('User not allowed to purchase');
                                        }
                                      } else if (errorCode == PurchasesErrorCode.paymentPendingError) {
                                        if (kDebugMode) {
                                          showLog('Payment is pending');
                                        }
                                      }
                                    }
                                  },
                                  // pressGradient: pressG,
                                  // unPressGradient: unpressG,
                                  unPressColor: pressColor,
                                  pressColor: pressColor.withOpacity(0.5),
                                  buttonTitle: "Subscribe Now",
                                  width: null,
                                  height: null,
                                )
                              : SizedBox(width: constraints.maxWidth, height: constraints.maxWidth * 0.15),
                          20.verticalSpace,
                          offering != null
                              ? Align(
                                  alignment: Alignment.center,
                                  child: appText(title: (selectedPackage?.packageType == PackageType.weekly) ? 'Auto-Renewal after a week for ${selectedPackage!.storeProduct.priceString}/week' : 'Auto-Renewal after a year for ${selectedPackage!.storeProduct.priceString}/year', fs: 45.sp, color: Colors.white),
                                )
                              : SizedBox.shrink(),

                          /// I Am Tester Button
                          10.verticalSpace,
                          if (Platform.isAndroid && widget.showTester && AdsVariable.showIAMTester)
                            InkWell(
                              onTap: () {
                                Get.to(() => IamTester());
                              },
                              child: appText(title: "I Am Tester", fs: 50.sp, color: appColor, family: fontFamilySemiBold),
                            ),
                          10.verticalSpace,
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                            children: [
                              // /// Google play subscription
                              if (Platform.isAndroid)
                                customTextButton(
                                  onTap: () async {
                                    launchUrl(Uri.parse("http://play.google.com/store/account/subscriptions"));
                                  },
                                  bName: "Google Play Subscription",
                                ),
                              if (Platform.isAndroid)
                                Container(
                                  height: 50.w,
                                  width: 8.w,
                                  decoration: BoxDecoration(color: Color(0xFF878787), borderRadius: BorderRadius.circular(50.0)),
                                ),
                              customTextButton(
                                onTap: () async {
                                  Get.to(() => PrivacyPolicy());
                                },
                                bName: "Privacy Policy",
                              ),
                              if (Platform.isIOS)
                                customTextButton(
                                  onTap: () async {
                                    /*if (offering != null) {
                                        DialogService.showLoading(context);
                                        try {
                                          CustomerInfo customerInfo = await Purchases.getCustomerInfo();
                                          Get.back();
                                          bool isActive = false;
                                          if (customerInfo.activeSubscriptions.toString().contains("week") || customerInfo.activeSubscriptions.toString().contains("year")) {
                                            isActive = true;
                                          } else {
                                            isActive = false;
                                          }
                                          if (isActive) {
                                            CustomerInfo customerInfo = await Purchases.restorePurchases();
                                            if (customerInfo.entitlements.all[entitlementKey] != null && customerInfo.entitlements.all[entitlementKey]!.isActive == true) {
                                              setState(() {
                                                AdsVariable.resetAdIds();
                                                prefs.setBool("isPurchase", true);
                                                AdsVariable.isPurchase.value = true;
                                              });
                                              DialogService.successRestoreDialog(context);
                                            } else {
                                              DialogService.restorePurchasesDialog(context);
                                            }
                                          } else {
                                            DialogService.restorePurchasesDialog(context);
                                          }
                                        } on PlatformException catch (e) {
                                          Get.back();
                                          DialogService.restorePurchasesDialog(context);
                                          // Error restoring purchases
                                        } catch (e) {
                                          Get.back();
                                          DialogService.restorePurchasesDialog(context);
                                          showLog(e.toString());
                                        }
                                      }*/
                                  },
                                  bName: "Restore",
                                ),
                              if (Platform.isIOS)
                                customTextButton(
                                  onTap: () async {
                                    // Get.to(
                                    //     () => WebViewScreen(
                                    //   url: (Platform.isAndroid)
                                    //       ? termsOfUseAndroid
                                    //       : iOSTermsOfUse,
                                    //   terms: true,
                                    // ),
                                    // transition:
                                    // Transition.rightToLeft,
                                    // );
                                  },
                                  bName: "Terms of Use",
                                ),
                            ],
                          ),
                          20.verticalSpace,
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Row planBenefitsText(String title) {
    return Row(
      children: [
        Icon(Icons.check_circle_outline, size: 70.w).marginOnly(right: sw * 0.02),
        // Image.asset(Assets.imagesSelected, fit: BoxFit.contain, width: sw * 0.055,).marginOnly(right: sw * 0.02),
        appText(title: title, fs: 2.5, family: ""),
      ],
    );
  }
}

class AppData {
  static final AppData _appData = AppData._internal();

  bool entitlementIsActive = false;
  String appUserID = '';

  factory AppData() {
    return _appData;
  }

  AppData._internal();
}

final appData = AppData();
