import 'package:common_flow_demo/google_ads_material/app_hud.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('AppHud shows over the app and blocks taps, dismiss removes it', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
      navigatorKey: AppHud.navigatorKey,
      home: Scaffold(body: Center(child: ElevatedButton(onPressed: () => taps++, child: const Text('tap')))),
    ));
    AppHud.show(status: 'Showing Ads...');
    await tester.pump();
    expect(find.text('Showing Ads...'), findsOneWidget);
    await tester.tap(find.text('tap'), warnIfMissed: false);
    expect(taps, 0, reason: 'barrier blocks the screen');
    AppHud.dismiss();
    await tester.pump();
    expect(find.text('Showing Ads...'), findsNothing);
    await tester.tap(find.text('tap'));
    expect(taps, 1);
  });

  testWidgets('show before the navigator exists appears on the next frame; dismiss in between cancels it', (tester) async {
    AppHud.show(status: 'No Internet');
    await tester.pumpWidget(MaterialApp(navigatorKey: AppHud.navigatorKey, home: const SizedBox()));
    await tester.pump();
    expect(find.text('No Internet'), findsOneWidget);
    AppHud.dismiss();
    await tester.pump();

    await tester.pumpWidget(const SizedBox()); // navigator gone
    AppHud.show(status: 'Late');
    AppHud.dismiss();
    await tester.pumpWidget(MaterialApp(navigatorKey: AppHud.navigatorKey, home: const SizedBox()));
    await tester.pump();
    expect(find.text('Late'), findsNothing);
  });
}
