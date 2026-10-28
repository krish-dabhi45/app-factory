import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';

/// IPTV_two `lib/AdsUtils/loading_screen.dart`, ported to plain Flutter: `Get.context` → the caller's [BuildContext],
/// `Get.width/height` → MediaQuery, `15.w` → 15 × width / 1242 (IPTV's ScreenUtil design width).
/// One dialog at a time: a [show] while it is up does nothing, and [hide] pops only that dialog (IPTV pops whatever
/// route is on top).
class LoadingScreen {
  NavigatorState? _navigator;

  void show(BuildContext context, [String? text]) {
    if (_navigator != null) return;
    _navigator = Navigator.of(context, rootNavigator: true);
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
    _navigator?.pop();
    _navigator = null;
  }
}

var loadingScreen = LoadingScreen();
