import 'package:flutter/material.dart';

/// Full-screen loader ("Showing Ads...", "No Internet ..."), bina package.
/// (flutter_svprogresshud 1.1.0 ka Android build `jcenter()` use karta hai, jo Gradle 9 me nahi hai.)
///
/// MaterialApp / GetMaterialApp me `navigatorKey: AppHud.navigatorKey` lagao.
/// Navigator abhi bana na ho to agle frame par dikhata hai; key lagi hi na ho to HUD nahi, flow chalta rehta hai.
class AppHud {
  AppHud._();

  static final navigatorKey = GlobalKey<NavigatorState>();
  static OverlayEntry? _entry;
  static int _token = 0;

  static bool get isShowing => _entry != null;

  static void show({String? status}) {
    dismiss();
    final token = _token;
    void insert() {
      if (token != _token) return; // beech me dismiss ho gaya
      final overlay = navigatorKey.currentState?.overlay;
      if (overlay == null) return;
      _entry = OverlayEntry(builder: (_) => _Hud(status: status));
      overlay.insert(_entry!);
    }

    if (navigatorKey.currentState?.overlay != null) {
      insert();
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) => insert());
    }
  }

  static void dismiss() {
    _token++;
    _entry?.remove();
    _entry = null;
  }
}

class _Hud extends StatelessWidget {
  const _Hud({this.status});

  final String? status;

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      const ModalBarrier(dismissible: false, color: Color(0x8A000000)),
      Center(
        child: Material(
          color: const Color(0xE6222222),
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const CircularProgressIndicator(color: Colors.white),
              if (status != null && status!.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(status!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 14)),
              ],
            ]),
          ),
        ),
      ),
    ]);
  }
}
