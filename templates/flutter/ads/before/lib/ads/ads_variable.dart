import 'package:get/get.dart';

class AdsVariable {
  static bool? isFirstTimeVisited;
  static bool? isFirstTimePurchased;
  static bool? isFirstInfo;

  static RxBool isPurchase = false.obs;
  static RxBool isShowingAd = false.obs;
  static RxBool isPrivacyOptionsRequired = false.obs;

  /// Common Flag
  static int homeFlag = 0;

  static bool isSDKInitialized = false;

  ///
  static bool showIAMTester = true;
  static String testerPass = "0";
  static String testerEmail = "0";
  static RxBool isLoggedIn = false.obs;

  ///
  static bool showWeeklyPlan = true;
  static bool showYearlyPlan = true;
  static String showDiscountPrice = "0";
  static String premiumShow = "1";

  static String showIntro = "1";
  static String showRateScreen = "0";

  /// Setting Buttons
  static String showShareBtn = "1";
  static String showRateBtn = "1";
  static String showPrivacyBtn = "1";

  static int useCount = 2;

  static String apiCookie = "";
}
