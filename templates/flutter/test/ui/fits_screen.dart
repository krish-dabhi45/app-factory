// test/ui/fits_screen.dart — T3: every screen size the app must fit, and what "fits" means.
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

class ScreenCase {
  const ScreenCase(this.name, this.size, this.top, this.bottom, {this.android = false});
  final String name;
  final Size size; // logical points
  final double top, bottom; // example system insets: status bar (+ notch/island), home indicator or navigation bar
  final bool android; // Android's largest font size is ×2 (200%), iOS's accessibility sizes go further
}

// Smallest to largest phone; add the design frame's size, and a tablet (and landscape) only when CONTRACT.md has them.
const screenCases = [
  ScreenCase('compact 320x568', Size(320, 568), 24, 0, android: true), // smallest Android phones
  ScreenCase('iPhone SE 375x667', Size(375, 667), 20, 0), // home button: no notch, no home indicator
  ScreenCase('iPhone 17 Pro 402x874', Size(402, 874), 62, 34),
  ScreenCase('Android 411x914', Size(411, 914), 24, 48, android: true), // three-button navigation bar
  ScreenCase('iPhone 17 Pro Max 440x956', Size(440, 956), 62, 34),
];

// The text sizes a phone of this case has: ×3 only on iPhone cases — Android's largest font size is ×2.
List<double> textScales(ScreenCase c) => c.android ? const [1, 2] : const [1, 2, 3];

// Every failure names the case and the text size: "<case> text ×<scale>: …".
double _scale = 1;
String _at(ScreenCase c) => '${c.name} text ×${_scale == _scale.roundToDouble() ? _scale.toInt() : _scale}';

// The view as a device reports it: viewPadding = the system bars; padding = what is left of them above the keyboard
// (Flutter: padding = max(0, viewPadding − viewInsets)); viewInsets = the keyboard. Scaffold, SafeArea, AppBar and the
// bottom bars each read the one they read on a device.
Future<void> pumpScreen(WidgetTester tester, ScreenCase c, Widget app, {double textScale = 1, double keyboard = 0}) async {
  _scale = textScale;
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = c.size;
  tester.view.viewPadding = FakeViewPadding(top: c.top, bottom: c.bottom);
  tester.view.padding = FakeViewPadding(top: c.top, bottom: (c.bottom - keyboard).clamp(0, c.bottom).toDouble());
  tester.view.viewInsets = FakeViewPadding(bottom: keyboard);
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(app);
  await tester.pumpAndSettle();
}

// The render object that lays out both [a] and [b] (their nearest common ancestor), or null.
RenderObject? _commonLayout(RenderObject a, RenderObject b) {
  final up = <RenderObject>{};
  for (RenderObject? x = a; x != null; x = x.parent) {
    up.add(x);
  }
  for (RenderObject? y = b; y != null; y = y.parent) {
    if (up.contains(y)) return y;
  }
  return null;
}

/// The screen fits [c]: no overflow; every keyed element (AppKeys) can be scrolled into view and is then inside the
/// screen; every key in [tappable] is inside the safe area; no two keys in [tappable] that one Row, Column, Stack or
/// Wrap lays out side by side partly overlap (one inside the other, a button on a card, is fine; a FAB or a bar
/// floating over scrolling content is not that); with [fullText], no text on screen is cut off — by maxLines, an
/// ellipsis, a box too small for it, or a line too long — except [mayTruncate].
/// With the keyboard open ([pumpScreen] keyboard > 0) only the text fields in [tappable] are checked, against the
/// keyboard: a button the keyboard covers is where it should be.
Future<void> expectFitsScreen(WidgetTester tester, ScreenCase c,
    {List<Key> tappable = const [], bool fullText = true, List<String> mayTruncate = const []}) async {
  expect(tester.takeException(), isNull, reason: '${_at(c)}: overflow or layout error');
  final keyboard = tester.view.viewInsets.bottom;
  final screen = (Offset.zero & c.size).inflate(0.5);
  // the keyboard covers the bottom bar: the safe area ends at whichever is higher, never at their sum
  final safe = Rect.fromLTRB(0, c.top, c.size.width, c.size.height - (keyboard > c.bottom ? keyboard : c.bottom)).inflate(0.5);
  bool isField(Key k) => find.descendant(of: find.byKey(k, skipOffstage: false), matching: find.byType(EditableText), matchRoot: true).evaluate().isNotEmpty;
  final keys = find
      .byWidgetPredicate((w) => w.key is ValueKey<String>, skipOffstage: false)
      .evaluate()
      .map((e) => e.widget.key!)
      .toSet();
  for (final k in keys) {
    if (keyboard > 0 && !(tappable.contains(k) && isField(k))) continue;
    final f = find.byKey(k, skipOffstage: false);
    if (f.evaluate().length != 1) continue; // repeated keys (list rows) are covered by their list's test
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    final r = tester.getRect(f);
    if (r.height > c.size.height || r.width > c.size.width) continue; // a container larger than the screen
    expect(screen.contains(r.topLeft) && screen.contains(r.bottomRight), isTrue,
        reason: '${_at(c)}: $k is outside the screen at $r');
    if (tappable.contains(k)) {
      expect(safe.contains(r.topLeft) && safe.contains(r.bottomRight), isTrue,
          reason: '${_at(c)}: $k is under ${keyboard > 0 ? 'the keyboard' : 'a system bar'} at $r (safe area $safe)');
    }
  }
  // tap targets that one layout widget places side by side and that partly cover each other: a tap meant for one lands
  // on the other (v4: tab items 110 pt wide in a Row, overlapping by 11 pt)
  final boxes = <Key, RenderBox>{
    for (final k in tappable)
      if (find.byKey(k).evaluate().length == 1 && tester.renderObject(find.byKey(k)) is RenderBox) k: tester.renderObject<RenderBox>(find.byKey(k)),
  };
  final ks = boxes.keys.toList();
  for (var i = 0; i < ks.length; i++) {
    for (var j = i + 1; j < ks.length; j++) {
      final a = tester.getRect(find.byKey(ks[i])), b = tester.getRect(find.byKey(ks[j])), o = a.intersect(b);
      if (o.width <= 0.5 || o.height <= 0.5 || a.expandToInclude(b) == a || a.expandToInclude(b) == b) continue;
      final layout = _commonLayout(boxes[ks[i]]!, boxes[ks[j]]!);
      if (layout is! RenderFlex && layout is! RenderStack && layout is! RenderWrap) continue;
      fail('${_at(c)}: ${ks[i]} and ${ks[j]} overlap by ${o.width.toStringAsFixed(1)}×${o.height.toStringAsFixed(1)} pt in one ${layout.runtimeType}');
    }
  }
  if (!fullText || keyboard > 0) return;
  // on screen only: a hidden tab (IndexedStack, Offstage) is not cut off for the user
  for (final p in tester.renderObjectList<RenderParagraph>(find.byType(RichText))) {
    final text = p.text.toPlainText();
    if (text.trim().isEmpty || mayTruncate.contains(text)) continue;
    final cut = p.didExceedMaxLines ||
        p.getMinIntrinsicHeight(p.size.width) > p.size.height + 0.5 ||
        (!p.softWrap && p.getMaxIntrinsicWidth(double.infinity) > p.size.width + 0.5);
    expect(cut, isFalse, reason: '${_at(c)}: "$text" is cut off');
  }
}
