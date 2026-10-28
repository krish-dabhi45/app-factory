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
  final view = WidgetsBinding.instance.platformDispatcher.views.first;
  final fontSize = 45 * view.physicalSize.width / view.devicePixelRatio / 1242;
  Fluttertoast.showToast(msg: msg, textColor: isShowBlack ? Colors.white : Colors.black, backgroundColor: isShowBlack ? Colors.black : Colors.white, fontSize: fontSize, toastLength: Toast.LENGTH_SHORT);
}

bool _tapRunning = false;

/// IPTV `onTapInter` (utils/app_variable.dart:61-90). [context]: the tapped widget's, for the "Loading..." dialog
/// (IPTV used `Get.context`). The interstitial id and the two switches are the app's own, passed in (IPTV read
/// `AdsVariable.interPreLoad`, `adShowHomeFlag`, `homeFlagOnline`, `sendRevenueToAnalyticsForInterPreLoad`):
/// - [adUnitId] "11" = no ad, the screen opens;
/// - [showFlag] not "1" = no ad (IPTV's `adShowHomeFlag`);
/// - [everyTapFlag] "0" = an ad on every tap, otherwise on every second tap — [AdsVariable.homeFlag] even (IPTV's
///   `homeFlagOnline`); a screen this opened makes an odd homeFlag even on Back;
/// - [enable]: this ad's revenue event.
/// An ad tap shows "Loading..." for 2 s, then the interstitial; the screen opens 1 s after its impression.
/// Offline: a toast and nothing opens (IPTV).
/// One tap at a time: IPTV lets a second tap that lands before the dialog (during the connectivity check) run too —
/// two "Loading..." dialogs, two interstitial loads, the screen opened twice. Here it is ignored.
Future<void> onTapInter(BuildContext context, Function() onTap, {required String adUnitId, String showFlag = "1", String everyTapFlag = "1", required bool enable}) async {
  if (_tapRunning) return;
  _tapRunning = true;
  try {
    AdsVariable.isShowingAd.value = false;
    if (await checkConnectivity()) {
      if (!AdsVariable.isPurchase.value && AdsVariable.isFirstTimeVisited != null) {
        showLog(adUnitId);
        if (showFlag == "1" && adUnitId != "11") {
          if (everyTapFlag == "0") {
            AdsVariable.homeFlag = 0;
          }
          if (AdsVariable.homeFlag % 2 == 0) {
            if (!context.mounted) return; // the tapped screen closed during the connectivity check
            loadingScreen.show(context);
            await AdsLoadUtil().loadInterCommon(adUnitId, enable: enable);
            AdsVariable.homeFlag++;
            await Future.delayed(const Duration(seconds: 2));
            loadingScreen.hide();
            AdsLoadUtil().showInterCommon(() {}, onTap);
            return;
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
  } finally {
    _tapRunning = false;
  }
}
