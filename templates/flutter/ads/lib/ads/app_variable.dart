import 'package:flutter/material.dart';
import 'package:fluttertoast/fluttertoast.dart';

import 'ads_load_util.dart';
import 'ads_variable.dart';
import 'app_connectivity.dart';
import 'loading_screen.dart';

/// IPTV_two `lib/widget/custom_widgets.dart:7-15` (showLog, showToast) and `lib/utils/app_variable.dart:61-90`
/// (onTapInter): only the ads part of those files. `45.sp` → 45 × width / 1242 (IPTV's ScreenUtil design width).
void showLog(String msg) {
  if (msg != "") {
    debugPrint(msg);
  }
}

void showToast(String msg, {bool isShowBlack = false}) {
  final context = AdsVariable.navigatorKey.currentContext;
  final fontSize = context == null ? 14.0 : 45 * MediaQuery.sizeOf(context).width / 1242;
  Fluttertoast.showToast(msg: msg, textColor: isShowBlack ? Colors.white : Colors.black, backgroundColor: isShowBlack ? Colors.black : Colors.white, fontSize: fontSize, toastLength: Toast.LENGTH_SHORT);
}

/// Every home feature tap (IPTV: the import buttons, play, a channel, a playlist). On every second tap (homeFlag even)
/// "Loading..." for 2 s, then the interstitial; the screen opens 1 s after its impression. `homeFlagOnline` "0" = every tap.
/// Offline: a toast and nothing opens (IPTV).
Future<void> onTapInter(Function() onTap) async {
  AdsVariable.isShowingAd.value = false;
  if (await checkConnectivity()) {
    if (!AdsVariable.isPurchase.value && AdsVariable.isFirstTimeVisited != null) {
      showLog(AdsVariable.interPreLoad);
      if (AdsVariable.adShowHomeFlag == "1" && AdsVariable.interPreLoad != "11") {
        if (AdsVariable.homeFlagOnline == "0") {
          AdsVariable.homeFlag = 0;
        }
        if (AdsVariable.homeFlag % 2 == 0) {
          loadingScreen.show();
          await AdsLoadUtil().loadInterCommon((AdsVariable.interPreLoad), enable: AdsVariable.sendRevenueToAnalyticsForInterPreLoad).then((value) {
            Future.delayed(const Duration(seconds: 2)).then((value) async {
              loadingScreen.hide();
              AdsLoadUtil().showInterCommon(() {}, onTap);
            });
          });
        } else {
          onTap();
        }
        AdsVariable.homeFlag++;
      } else {
        onTap();
      }
    } else {
      onTap();
    }
  } else {
    showToast("Please Start Your Internet.");
  }
}

