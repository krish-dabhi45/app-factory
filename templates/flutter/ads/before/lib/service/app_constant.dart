
import 'dart:math';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:shared_preferences/shared_preferences.dart';

const appName = 'PPT Maker & Editor';
const rateID = '';
const privacyPolicyUrl = 'https://tejasshah1210.blogspot.com/2024/09/privacy-policy.html';
const termsOfUseUrl = 'https://tejasshah1210.blogspot.com/2024/09/term-of-use.html';

const appBackgroundColor = Color(0xff000000);
const appColor = Color(0xffFF6745);
const textColor = Colors.white;
const pressColor = Color(0xffFF6745);
const unPressColor = Color(0xff292929);

const fontFamilyBold = 'Bold';
const fontFamilyLight = 'Light';
const fontFamilyMedium = 'Medium';
const fontFamilyRegular = 'Regular';
const fontFamilySemiBold = 'SemiBold';

// final String cookie =
//     '_gcl_au=1.1.1115689914.1791874489; fp_ga=GA1.1.287369137.1791874491; OptanonAlertBoxClosed=2026-10-13T06:54:58.122Z; slidesgo_ff=16; _hjSessionUser_1330819=eyJpZCI6ImE0YTI4MmM5LTM1MjUtNTgwZS05MWRhLTYzMDc3MzYwMmJhMCIsImNyZWF0ZWQiOjE3OTE4NzQ0OTAxMDMsImV4aXN0aW5nIjp0cnVlfQ==; _pubcid=f7d6a943-a8b5-4c68-a1dd-a1ce9852ccd1; _cc_id=8a64f247ddd393f77bd31044a5123f0; _hjSession_1330819=eyJpZCI6IjVhOWE2NWQ1LTUwZGItNGQ0Mi1iODA1LTkyYzE5YjVjM2MzZiIsImMiOjE3OTE5NzU4MDY1NDQsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjowLCJzcCI6MH0=; panoramaId_expiry=1792062293029; panoramaId=839f4e33668ee583827af750300da9fb927a2c6dc4593396fe89c56a2b681421; panoramaIdType=panoDevice; cto_bundle=bMIEB196V0RRZlJnT1h0Qms3RGZRdTA4Mk80WkdBT3BsekklMkJkYXphRk05S0Fld0Jjb2lXanNqbXMlMkJEYWtLSkJzd3VKUU5WZ1FnTHNiQmxoVFZrakRnbGMxNXRLWGpOT3IwTmVRRzNrelNHUUt4amdHU2xkSEJ4VU4lMkJuZjZuMXBUZ01DQ2Y2ekQlMkZRcjFwZEJwcnNMOXR3eWhNQSUzRCUzRA; XSRF-TOKEN=UeRglFeyddwUzn5vzaGYt8DqIkJ42odmLMiE7Yp0; g_state={"i_l":0,"i_ll":1791976492489,"i_b":"Y8RS35hTwDvmY66AalupDybOfiy3UnJ3a3MGX61/eZA","i_e":{"enable_itp_optimization":24},"i_et":1791976492489}; GR_TOKEN=eyJhbGciOiJSUzI1NiIsImtpZCI6IjkwNGIwZjkxYmU2ZWIwODY3ZGFiYmFhYjU4N2RmYzJlMzNmMDBhMjQiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiU2FnYXIgUGF0ZWwiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSWZxR1YwcXdrUDhyU0x6TWs4ZVdGZ0NIajh6RjhROWFiNHhTLWl1M19sa3M5MHlBPXM5Ni1jIiwiYWNjb3VudHNfdXNlcl9pZCI6MjIyNDYwMTUwLCJzY29wZXMiOiJmcmVlcGlrL2ltYWdlcyBmcmVlcGlrL3ZpZGVvcyBmbGF0aWNvbi9wbmciLCJpbXBlcnNvbmF0ZWRfc2Vzc2lvbiI6ZmFsc2UsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9mYy1wcm9maWxlLXByby1yZXYxIiwiYXVkIjoiZmMtcHJvZmlsZS1wcm8tcmV2MSIsImF1dGhfdGltZSI6MTc5MTk3NjUwNiwidXNlcl9pZCI6IkxZQ2hhRjVwMjZNaEp4cHNpMzdsUUVVT0JIODMiLCJzdWIiOiJMWUNoYUY1cDI2TWhKeHBzaTM3bFFFVU9CSDgzIiwiaWF0IjoxNzkxOTc2NTA2LCJleHAiOjE3OTE5ODAxMDYsImVtYWlsIjoicGF0ZWxzYWdhci5iZWV0bm96QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTA5OTMxNzYyMzc4MDg2MjMwMDcxIl0sImVtYWlsIjpbInBhdGVsc2FnYXIuYmVldG5vekBnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJjdXN0b20ifX0.jzuaO1rd0_pFTFC1O8GUvrN5-TfhgCvILHyZNLHRWkh9JzMjIm1BvX2MwsBcQ7atITBkN3bXmSMkMFWiTFB3CsbeLRLGHpmxckRF_75yV0tRHqeYVr4kWrxzzGTL3BNzzSbckG2IccAZ_bDZBRmAHsBEbPzjj_Qy39pjoNXmm5gYGYL8uMd9GmggaKSKrovscq9xEOHMptw19DYnPcY11Pg3Hs4dEoCHsH3fPFor4DIPfezpoB4sE23YQ4IS9FIqIrYu3SZUGX5VBKsq0RuUrh_a3DyOjGKYruxfBG-OLgIx8vkcP_FYtSo3UBqEvVeiykvTTQY4AZ1DU0DA2CXwGQ; GR_REFRESH=AMf-vBzAzs5h2FypjWItYRqap_VVSo2lyPM7aVzMaXlcsyKGlg-kRmQz2KC65HTUOLA9CSgnu-DK1Z0t9tt6bzw7SXkLuP3MBZ7nV1jcx2ScivPjWzeEx7RWbHdSHYPz7GtZqjbd0FH-3AoWZ00BXeQyDcnFM_8B4tq3HvcEf8t1wR9xPvFjU-wZw5fB09vLxhIJMaQ1rhVH; remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d=87897972%7C1eJJKBwnj0uoMvKLTijxheskLDS8rKpBIZTDqBgvQ8buEhi5qLf9let4T0Dz%7C%242y%2405%241QsFe74XdEm%2FWEzIsY5flOrGW9c214vWLFBH9nzDe%2F96NQsnDmQGu; slidesgo_session=C4ksGRc1ODevzItR6mDt9DkpxDebUTkIw9GKRdxE; fp_au=1.1.943651316.1791976510; OptanonConsent=isGpcEnabled=0&datestamp=Wed+Oct+14+2026+16%3A45%3A14+GMT%2B0530+(India+Standard+Time)&version=202604.1.0&browserGpcFlag=0&isDntEnabled=0&isIABGlobal=false&hosts=&consentId=11dbb134-144e-46d9-a93d-6e646484cac5&interactionCount=1&isAnonUser=1&prevHadToken=0&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A0%2CC0004%3A0&intType=3&crTime=1791874498603&geolocation=IN%3BGJ&AwaitingReconsent=false; fp_ga_TKX201X3BN=GS2.1.s1791975806\$o3\$g1\$t1791976515\$j33\$l0\$h0; ab.storage.sessionId.a2d072d7-2602-4600-b75d-0ec0c57e425d=g%3Ac8622de8-a335-014f-eefe-d4e703c35496%7Ce%3A1792012515277%7Cc%3A1791976515278%7Cl%3A1791976515278; ab.storage.deviceId.a2d072d7-2602-4600-b75d-0ec0c57e425d=g%3A9e1a1849-03ad-9c34-4948-46ab1fe5ef1d%7Ce%3Aundefined%7Cc%3A1791874514152%7Cl%3A1791976515279; ab.storage.userId.a2d072d7-2602-4600-b75d-0ec0c57e425d=g%3A222460150%7Ce%3Aundefined%7Cc%3A1791976515275%7Cl%3A1791976515279; ph_phc_5DOEyS4AghYbrWdp3TpOFFCdAcFOWZbqrFUvhkGqgmz_posthog=%7B%22%24device_id%22%3A%2201a1340a-df56-799e-8c50-4cf2d4f3066e%22%2C%22distinct_id%22%3A%2287897972%22%2C%22%24sesid%22%3A%5B1791976533143%2C%2201a13a1f-a698-7edb-aebc-c1c97fe79e63%22%2C1791976515219%5D%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22https%3A%2F%2Fslidesgo.com%2F%3Flogout%3Dkh51g5eZFhxiYgow%22%2C%22u%22%3A%22https%3A%2F%2Fslidesgo.com%2F%3Flogout%3Dkh51g5eZFhxiYgow%22%7D%2C%22%24user_state%22%3A%22identified%22%7D';

const iosIndicator = Center(child: CupertinoActivityIndicator(radius: 15, color: appColor));

appToast(String msg) => Fluttertoast.showToast(msg: msg, backgroundColor: appColor, textColor: Colors.white);

late SharedPreferences prefs;

late bool isTab;
late double screenHeight;
late double screenWidth;
late double textSize;
late double scale;

/// Getters
double get sc => scale;

double get sw => screenWidth;

double get sh => screenHeight;

double get ts => textSize * 0.01;

/// Getters Method
double radius(num value) => value * scale;

double marginWidth(num value) => value * screenWidth * 0.01;

double marginHeight(num value) => value * screenHeight * 0.01;

void initializeUtils(BuildContext context) {
  screenHeight = MediaQuery.of(context).size.height.roundToDouble();
  screenWidth = MediaQuery.of(context).size.width.roundToDouble();
  textSize = ((MediaQuery.of(context).size.height + MediaQuery.of(context).size.width) / 2).roundToDouble();
  isTab = MediaQuery.of(context).size.shortestSide >= 600;
  final scaleW = sw / 1242;
  final scaleH = sh / 2688;
  scale = min(scaleW, scaleH);
}

/*Future<void> onTapInter(Function() onTap) async {
  AdsVariable.isShowingAd.value = false;
  if (await checkConnectivity()) {
    if (!AdsVariable.isPurchase.value && AdsVariable.isFirstTimeVisited != null) {
      print(Platform.isAndroid ? AdsVariable.interPreLoad : AdsVariable.interPreLoad);
      if (AdsVariable.adShowHomeFlag == "1" && (Platform.isAndroid ? AdsVariable.interPreLoad : AdsVariable.interPreLoad) != "11") {
        if (AdsVariable.homeFlagOnline == "0") {
          AdsVariable.homeFlag = 0;
        }
        if (AdsVariable.homeFlag % 2 == 0) {
          loadingScreen.show();
          await AdsLoadUtil().loadInterCommon((AdsVariable.interPreLoad), enable: AdsVariable.sendRevenueToAnalyticsForInterPreLoad).then((value) {
            Future.delayed(Duration(seconds: 2)).then((value) async {
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
}*/

/*Future<void> onTapRewardCall(Function() reward) async {
  AdsVariable.isShowingAd.value = false;
  if (await checkConnectivity()) {
    if (!AdsVariable.isPurchase.value && AdsVariable.isFirstTimeVisited != null) {
      showLog(Platform.isAndroid ? AdsVariable.rewardAdId : AdsVariable.rewardAdId);
      if (AdsVariable.adShowRewardFlag == "1" && AdsVariable.rewardAdId != "11") {
        loadingScreen.show();
        final util = AdsLoadUtil();
        final loaded = await util.loadRewardedAd(AdsVariable.rewardAdId, enable: AdsVariable.sendRevenueToAnalyticsForRewardAdId);
        loadingScreen.hide();

        if (loaded) {
          util.showRewardedAd(onRewarded: reward, onSkipped: () => showLog("Reward not earned"));
        } else {
          showToast("Reward Ad is not available right now!");
        }
      } else {
        showToast("Reward Ad in not available right now!");
      }
    } else {
      showToast("Please try again");
    }
  } else {
    showToast("Please Start Your Internet.");
  }
}*/

/*Future<void> checkPurchaseNormal(String prefText, int count, Function() onTap, String screenName) async {
  final prefs = await SharedPreferences.getInstance();

  int countGen = prefs.getInt(prefText) ?? 0;
  if (AdsVariable.isPurchase.value != true && AdsVariable.premiumShow != "0") {
    if (countGen < count) {
      await onTap();
      prefs.setInt(prefText, countGen + 1);
    } else {
      var result = await Get.to(() => UpsellScreen(isNotFromSplash: true, isFromGenerate: true, showTester: true, screen: screenName), transition: Transition.downToUp);
      if (result ?? false) {
        await onTap();
        prefs.setInt(prefText, countGen + 1);
      }
    }
  } else {
    await onTap();
  }
}*/
