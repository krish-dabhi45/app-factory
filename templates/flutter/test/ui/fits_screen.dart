// test/ui/fits_screen.dart — T3: every screen size the app must fit, and what "fits" means.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

class ScreenCase {
  const ScreenCase(this.name, this.size, this.top, this.bottom);
  final String name;
  final Size size; // logical points
  final double top, bottom; // example system insets: status bar (+ notch/island), home indicator or navigation bar
}

// Smallest to largest phone; add the design frame's size, and a tablet (and landscape) only when CONTRACT.md has them.
const screenCases = [
  ScreenCase('compact 320x568', Size(320, 568), 24, 0), // smallest Android phones
  ScreenCase('iPhone SE 375x667', Size(375, 667), 20, 0), // home button: no notch, no home indicator
  ScreenCase('iPhone 17 Pro 402x874', Size(402, 874), 62, 34),
  ScreenCase('Android 411x914', Size(411, 914), 24, 48), // three-button navigation bar
  ScreenCase('iPhone 17 Pro Max 440x956', Size(440, 956), 62, 34),
];

Future<void> pumpScreen(WidgetTester tester, ScreenCase c, Widget app, {double textScale = 1, double keyboard = 0}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = c.size;
  tester.view.padding = FakeViewPadding(top: c.top, bottom: c.bottom);
  tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

/// The screen fits [c]: no overflow; every keyed element (AppKeys) can be scrolled into view and is then inside the
/// screen; every key in [tappable] is inside the safe area (above the keyboard when one is open); with [fullText],
/// no text is cut off — by maxLines, an ellipsis, a box too small for it, or a line too long — except [mayTruncate].
Future<void> expectFitsScreen(WidgetTester tester, ScreenCase c,
    {List<Key> tappable = const [], bool fullText = true, List<String> mayTruncate = const []}) async {
  expect(tester.takeException(), isNull, reason: '${c.name}: overflow or layout error');
  final screen = (Offset.zero & c.size).inflate(0.5);
  final safe = Rect.fromLTRB(0, c.top, c.size.width, c.size.height - c.bottom - tester.view.viewInsets.bottom).inflate(0.5);
  final keys = find
      .byWidgetPredicate((w) => w.key is ValueKey<String>, skipOffstage: false)
      .evaluate()
      .map((e) => e.widget.key!)
      .toSet();
  for (final k in keys) {
    final f = find.byKey(k, skipOffstage: false);
    if (f.evaluate().length != 1) continue; // repeated keys (list rows) are covered by their list's test
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    final r = tester.getRect(f);
    if (r.height > c.size.height || r.width > c.size.width) continue; // a container larger than the screen
    expect(screen.contains(r.topLeft) && screen.contains(r.bottomRight), isTrue,
        reason: '${c.name}: $k is outside the screen at $r');
    if (tappable.contains(k)) {
      expect(safe.contains(r.topLeft) && safe.contains(r.bottomRight), isTrue,
          reason: '${c.name}: $k is under a system bar or the keyboard at $r (safe area $safe)');
    }
  }
  if (!fullText) return;
  for (final p in tester.renderObjectList<RenderParagraph>(find.byType(RichText, skipOffstage: false))) {
    final text = p.text.toPlainText();
    if (text.trim().isEmpty || mayTruncate.contains(text)) continue;
    final cut = p.didExceedMaxLines ||
        p.getMinIntrinsicHeight(p.size.width) > p.size.height + 0.5 ||
        (!p.softWrap && p.getMaxIntrinsicWidth(double.infinity) > p.size.width + 0.5);
    expect(cut, isFalse, reason: '${c.name}: "$text" is cut off');
  }
}
