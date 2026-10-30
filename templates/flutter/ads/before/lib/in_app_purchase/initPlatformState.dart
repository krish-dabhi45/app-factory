import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/in_app_purchase/constant.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CheckPurchasesStatus {
  static Future<bool> initPlatformState(String package) async {
    try {
      SharedPreferences prefs = await SharedPreferences.getInstance();
      final customerInfo = await Purchases.getCustomerInfo();
      if (customerInfo.entitlements.all[entitlementKey] != null && customerInfo.entitlements.all[entitlementKey]!.isActive == true) {
        prefs.setBool("isPurchase", true);
        AdsVariable.isPurchase.value = true;
        // addcredits(package);

        return true;
      } else {
        return false;
      }
    } catch (e) {
      showLog("ERROR :: $e");
      return false;
    }
  }
}
