import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'package:get/get.dart';

@protected
final scaffoldGlobalKey = GlobalKey<ScaffoldState>();

class LoadingScreen {
  final GlobalKey globalKey;

  LoadingScreen(this.globalKey);

  show([String? text]) {
    showDialog<String>(
      context: Get.context!,
      builder: (BuildContext context) => PopScope(
        canPop: false,
        child: Scaffold(
          backgroundColor: const Color.fromRGBO(0, 0, 0, 0.1),
          body: Center(
            child: Container(
              height: Get.height * 0.12,
              width: Get.width * 0.35,
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(15.w), color: Colors.white.withValues(alpha: 0.1)),
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: <Widget>[
                    SpinKitFadingCube(
                      itemBuilder: (_, int index) {
                        return DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.white,
                          ),
                        );
                      },
                      size: Get.width * 0.08,
                    ).marginOnly(bottom: Get.width * 0.03),
                    Center(
                      child: appText(title: text ?? "Loading...", textAlign: TextAlign.center, color: Colors.white),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  hide() {
    if (Get.context == null) return;

    Navigator.pop(Get.context!);
  }
}

@protected
var loadingScreen = LoadingScreen(scaffoldGlobalKey);
