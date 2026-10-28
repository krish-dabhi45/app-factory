import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

import 'ads_variable.dart';

/// IPTV_two `lib/AdsUtils/loading_screen.dart`, ported to plain Flutter: `Get.context` → [AdsVariable.navigatorKey],
/// `Get.width/height` → MediaQuery, `15.w` → 15 × width / 1242 (IPTV's ScreenUtil design width).
class LoadingScreen {
  bool _shown = false;

  void show([String? text]) {
    final context = AdsVariable.navigatorKey.currentContext;
    if (context == null) return;
    _shown = true;
    showDialog<String>(
      context: context,
      builder: (BuildContext context) {
        final size = MediaQuery.sizeOf(context);
        return PopScope(
          canPop: false,
          child: Scaffold(
            backgroundColor: const Color.fromRGBO(0, 0, 0, 0.1),
            body: Center(
              child: Container(
                height: size.height * 0.12,
                width: size.width * 0.35,
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(15 * size.width / 1242), color: Colors.white.withValues(alpha: 0.1)),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      Padding(
                        padding: EdgeInsets.only(bottom: size.width * 0.03),
                        child: SpinKitFadingCube(
                          itemBuilder: (_, int index) => const DecoratedBox(decoration: BoxDecoration(color: Colors.white)),
                          size: size.width * 0.08,
                        ),
                      ),
                      Center(child: Text(text ?? "Loading...", textAlign: TextAlign.center, style: const TextStyle(color: Colors.white))),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  void hide() {
    final navigator = AdsVariable.navigatorKey.currentState;
    // IPTV pops whatever is on top (Navigator.pop(Get.context!)); only our own dialog is popped here.
    if (navigator == null || !_shown) return;
    _shown = false;
    navigator.pop();
  }
}

var loadingScreen = LoadingScreen();
