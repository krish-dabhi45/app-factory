---
name: flutter-app
description: How app-factory builds, audits and tests a Flutter app — project structure and file ownership, logic and data rules, UI rules, and the three kinds of tests. Use when building, fixing, reviewing or testing any Flutter app in an app-factory project (pubspec.yaml plus CONTRACT.md present), or when asked to structure a Flutter app or fix a Flutter layout error.
---

# Building a Flutter app in app-factory

Every rule here is a requirement. The final audit checks every rule in the code and fixes what breaks one; the flow tests and the design comparison check section 3 on the device. A broken rule found earlier is filed as a major finding with its number (for example "U2").

## 1. Structure and ownership

```text
lib/
├── main.dart                  # shared: main() and buildApp({required storage}) — tests call buildApp with empty storage
├── data/
│   ├── models/                # raw storage/API shapes, fromJson/toJson
│   ├── repositories/          # single source of truth; return domain models
│   └── services/              # stateless wrappers around plugins, storage, HTTP
├── domain/
│   ├── models/                # immutable domain models
│   └── use_cases/             # rules: calculation, validation, limits, numbering
└── ui/
    ├── core/                  # theme, shared widgets, app_keys.dart (AppKeys: every widget and asset key)
    └── features/<feature>/
        ├── view_models/       # ChangeNotifier per screen
        └── views/             # widgets only
test/          mirrors lib/ (test/domain/..., test/data/..., test/ui/...)
integration_test/<group>_flow_test.dart   # one device test per user flow (T4)
dart_test.yaml                 # declares the tags ios and android
```

- **S1. Ownership when three agents build a group at once.** The interface step writes the shared layer — `lib/main.dart`, `pubspec.yaml`, `analysis_options.yaml`, `dart_test.yaml`, the models, every logic function as a typed stub, routes, and `lib/ui/core/app_keys.dart` — in Dart; there is no interface document. Logic builder: `lib/data/**`, `lib/domain/**`, `test/data/**`, `test/domain/**`. UI builder: `lib/ui/**`, `test/ui/**`. Flow-test writer: `integration_test/**`. Shared files change only through the integrator. Each agent checks and commits only its own folders. In the test phase, runners change only `integration_test/`; fixers change only their owner's folders (`@logic`, `@ui`, `@shared`).
- **S2. Dependencies point one way:** views → view models → use cases / repositories → services. Nothing under `lib/domain/` or `lib/data/` imports `package:flutter/material.dart` or anything under `lib/ui/`.
- **S3. One state approach: MVVM with `ChangeNotifier`.** A view model takes its repositories and use cases through its constructor, exposes read-only state, and calls `notifyListeners()`. A view listens with `ListenableBuilder`. No Bloc, Riverpod, GetX or service locator: constructor injection needs no package and keeps every class testable with a fake.
- **S4. No code generation.** Plain immutable classes with `final` fields, a `copyWith`, and hand-written `fromJson`/`toJson`. `freezed`, `json_serializable`, `mockito` and `build_runner` add a generation step to every build and test run.
- **S5. Keep simple things simple.** Build the shortest code that fully meets the contract and these rules. A simple feature stays simple: no extra layers, base classes, interfaces with one implementation, wrappers, configuration options, packages (L11), files or screens that nothing in CONTRACT.md requires, and no rewriting code that already works. If one function does the job, it is one function. The final audit removes what no source accounts for (L9); the optimisation inside the final audit removes what can be simpler.

## 2. Logic and data rules

- **L0. Think before code — in your reasoning, not in a file.** Before writing logic for a feature group, answer every question below. Write nothing down except, on a function whose choice is not obvious from the code (a formula, a rounding, an order), one comment line saying why.
  1. **Each rule:** inputs with types, exact output, and the criterion it serves (`AC9`).
  2. **Invariants:** what must always hold (a total equals the sum of its rows; a saved document never changes when its client is edited; a number is never reused).
  3. **Every edge:** for each input, take each edge from L8 and say what the rule returns. Also: empty collection, single item, zero, the largest value the field allows, rounding exactly at .5, a month or year boundary for dates.
  4. **Failure modes:** what happens when the app is killed mid-save, Save is tapped twice, a record another record uses is deleted, stored data is from an older version or unreadable, or a plugin call fails or is denied.
  5. **Two designs:** consider two ways to implement the hardest rule in the group; pick the one with fewer moving parts that still meets every answer above.
  6. **Cost at the largest realistic data** (for example 200 items, 50 clients, 1,000 documents): how many reads, writes and loops one user action triggers. Nothing does work in proportion to all stored records when the action only concerns one.
  7. **Tests:** the list of unit tests this section requires, one or more per answer in 1–4.

- **L1. Every rule is a use case or pure function under `lib/domain/use_cases/`** — calculations, validation messages, limits and paywall checks, numbering. The view model calls it and the view shows the result. A rule written inside a widget or view model is a defect, and so is a rule that exists but is never called from the screen.
- **L2. Money is exact.** `Decimal` (package `decimal`) or integer minor units, never `double`. One rounding function, used everywhere.
- **L3. Only repositories touch storage; only services touch plugins** (shared_preferences, files, contacts, share, HTTP). View models never call a plugin directly, so tests can pass a fake.
- **L4. Saved records keep their own copy** of what they were created from (a saved document stores its client and item details). Editing or deleting the source must not change or break them.
- **L5. `fromJson` validates shape and throws `FormatException` on bad data**; never return a half-filled object.
  ```dart
  factory Client.fromJson(Map<String, dynamic> json) => switch (json) {
        {'id': String id, 'name': String name} => Client(id: id, name: name, phone: json['phone'] as String?),
        _ => throw const FormatException('Bad Client'),
      };
  ```
- **L6. HTTP, when the app has an API:** inject `http.Client`, treat any non-2xx status as an error (throw, never return null), and test with a fake client and recorded responses — no test may reach the network.
- **L7. Static analysis is clean.** `analysis_options.yaml` includes `package:flutter_lints/flutter.yaml` with `strict-casts`, `strict-inference` and `strict-raw-types` set to `true`. `flutter analyze` reports no issues; use `dart fix --apply` and `dart format .` for mechanical ones. No `// ignore` without a reason on the same line.
- **L8. Every input field has a validator.** For each field in CONTRACT.md's field table there is one pure function in `lib/domain/use_cases/` (for example `validateItemPrice(String raw) → String?`) that returns `null` when valid and otherwise the exact error message from the table. The screen calls it on save, and when the user leaves the field, and shows its message next to the field; a view never checks input itself. Each validator has a unit test per edge: empty, spaces only, the maximum length and one over, the minimum and maximum value and one beyond each, the wrong type (letters in a number, a second decimal point), and a valid value. Text is trimmed before it is checked and before it is saved.

- **L9. Build only what CONTRACT.md lists.** That includes every quality basic in this skill (validation, empty/loading/error states, confirm before delete, data surviving a restart) — those are never optional. A new behaviour that is not in CONTRACT.md (search, sort, a new screen, a new setting) is not built, even when it seems obvious: file it with `finding add <ACn or -> minor "PROPOSAL: <what, why>"` instead. The final audit deletes code that no criterion, field, approved proposal or rule in this skill accounts for.
- **L10. No wasted work at runtime.** Derived values (totals, filtered lists) are computed in the view model when their inputs change, never inside `build()`. A save writes the one changed record, not the whole store, unless the storage only supports whole-file writes — then one write per user action. Lists use `ListView.builder` (U8).
- **L11. Every package must earn its place.** Before adding one, in this order: (1) the Dart or Flutter SDK does it → use the SDK; (2) it is under about 30 lines of your own code → write them; (3) otherwise the smallest maintained package that does exactly that one job, never a large one used for a single function. Write the reason as a comment on the package's line in pubspec.yaml. Keep packages that do what the SDK cannot: platform access (share sheet, contacts, file picker, storage), exact money (L2), PDF output. Remove `cupertino_icons` unless the code uses `CupertinoIcons` — it ships a 258 KB font in every release build.

- **L12. A feature whose API key (endpoint, account) is not provided works now and switches by itself when the key is added** — exactly as CONTRACT.md's "Missing keys" section says for it:
  1. **One place for keys:** `lib/config/api_keys.dart` — `abstract final class ApiKeys` with one pair per key, named in camelCase from the key's name: `static const mapsApiKey = String.fromEnvironment('MAPS_API_KEY');` and `static bool get hasMapsApiKey => mapsApiKey.isNotEmpty;` (the same names `P secret move` writes). No key value is ever written in Dart code, a test, a fixture, a log, a commit or any project file, and no agent ever sees one: the values are stored outside the project (`P secret set <NAME>`), builds read them with `$(P secret define)` (`--dart-define-from-file`), and a native SDK's key is written only by `P secret native <NAME> android:<placeholder> ios:<variable>` into the git-ignored `android/local.properties` (→ `manifestPlaceholders` in `android/app/build.gradle` → the manifest) and `ios/Flutter/Secrets.xcconfig` (`#include? "Secrets.xcconfig"` in `Debug.xcconfig`/`Release.xcconfig` → `Info.plist` → read at startup). Tool output shows a stored key as ‹NAME›. A key found in the project while coding is put in its proper place by `P secret move` — never by hand: stored, and the file rewired (Dart literal → `ApiKeys.<name>`, inside a string → `${ApiKeys.<name>}`, plus the pair in `api_keys.dart` and the import; `AndroidManifest.xml` → `${NAME}` with the `manifestPlaceholders` line in `build.gradle.kts`; `Info.plist` → `$(NAME)`; Swift → `Bundle.main.object(forInfoDictionaryKey: "NAME")`; Firebase's `google-services.json` and `GoogleService-Info.plist` are already their keys' proper place and are left alone — verified in a Flutter 3.38.5 app: analyze clean, the APK's merged manifest and the iOS app's Info.plist carry the key). `P secret scan` fails on a key, or a leftover ‹NAME›, in any other file. At the end of the run the keys leave the coding agents' context — masked in the transcripts, temp output and `.pipeline/` records (`P cleanup` → `P secret forget`) — and stay in the app: the secrets file, `local.properties`, `Secrets.xcconfig` and the code are untouched, so the app builds and works with them (`flutter run $(P secret define)`). An empty key means "not configured".
  2. **One service, two implementations, chosen once at startup** by `hasXKey`: the real service with the key; without it, either the **free service** the contract names (the no-key provider it verified — its base URL, its usage limits, e.g. at most one request per second, and the attribution text its terms require, shown where its data is shown) or the **unavailable** implementation (every call returns a typed "not available" result, never throws, never calls the network).
  3. **On screen:** with the free service, the feature works and shows the contract's note in one short line where the feature is (default "<Feature>: free version for now"), plus the provider's required attribution. Unavailable: the feature's screen shows the contract's banner (default "<Feature> isn't available yet") or, when its entry point is tapped, a short `SnackBar` with that text — never a crash, a blank area or an endless spinner.
  4. **Adding the key later changes nothing in the code:** build with the key and the real service is used, the note disappears. A unit test passes a fake key value to the selector and checks the real implementation is chosen; another passes none and checks the free (or unavailable) one is.
  5. Only behaviour that truly needs the real service (data the free one does not give) is a blocked criterion, `"needs <KEY>"`; everything else of the feature is built and tested.
- **L13. A paid API is called as few times as the feature allows — each call fetches everything the screen needs, and nothing is fetched twice.** Every paid or rate-limited API has one client class (`lib/data/services/<api>_client.dart`) that all calls go through, built from CONTRACT.md's "API calls" table:
  1. **One request per user action, with exactly the fields the screens use:** list every field the screens and logic read from that response and request all of them in that one call, and no others — a field mask or `fields=` parameter where the API has one (Google Places: "you must specify which fields you want returned… Include only the fields that you require… don't use the wildcard (*) response field mask in production. The cost may be higher than expected" — developers.google.com/maps/documentation/places/web-service/choose-fields). Never a second call for a detail the first could have returned; where the API has a batch or multi-item endpoint, one call for the whole list, not one per item.
  2. **Cache:** an identical request is answered from memory for the rest of the session, and from disk for as long as the API's terms allow (CONTRACT.md quotes them; terms silent → session only). Identical requests in flight at the same time share one `Future`.
  3. **Typed input:** search and autocomplete wait until typing pauses (300 ms) and the text has its minimum length; a session token where the API bills per session (Google Autocomplete: with a token "all of the requests made during the search are bundled and counted as a single request"; without one "each request is billed separately"; a new token per session — developers.google.com/maps/documentation/places/web-service/session-tokens).
  4. **Never from `build()`** or a rebuild: a call starts from a user action or a screen's first load, in the view model.
  5. **Pages:** the largest page size the API allows that the screen can show; the next page only when the user scrolls to it.
  6. **Retries:** only on 429 and 5xx, at most 2, waiting `Retry-After` or 1 s then 2 s; never on 4xx.
  7. **During development:** the response shape comes from the API's documentation (its sample response); only where it has none, at most one real call per endpoint, made with \`P secret run '<curl … using $NAME>'\` (the key is in the command's environment; its output shows ‹NAME›). That response, with every key and personal value removed, becomes the fixture `test/fixtures/<api>_<endpoint>.json` that every unit and widget test uses (L6). No test calls a paid API.

## 3. UI rules

- **U0. The imported design, as it is.** When `design/` exists it holds the whole Figma design, imported once through the Figma MCP. Never call a Figma tool, and never invent what is not in these files — every gap was asked about upfront in the chat (every question and the option selected are in DECISIONS.md):
  - **Screens:** every screen in `SCREENS.md` that CONTRACT.md keeps is built — none left out, none added. Build each from `screens/<slug>.context.md` translated to this project's widgets and layout (no absolute positioning unless the design can only be expressed that way), with sizes and spacing from `pages/<page>.metadata.xml`. Never take layout, sizes, colours or text from a screenshot: `reference/<slug>.png` exists only so testers can compare.
  - **Flows:** every row of `FLOWS.md` is implemented exactly — that element, that trigger, that destination, that kind of transition (push, overlay/sheet, replace, back). No navigation that FLOWS.md or CONTRACT.md does not have.
  - **Bars:** every bar the frame has, as the frame has it — the status bar's light or dark content (`systemOverlayStyle`), the navigation/app bar (height, background, title text and alignment, the back icon from ASSETS.md, trailing actions in order), the tab or bottom bar (items in order, icons from ASSETS.md, labels, selected and unselected colours, height and the gap above the home indicator), and any search bar, segmented control or toolbar. No bar the frame does not have.
  - **Buttons:** every button, chip, link and tappable icon of the frame, with its text exactly, its icon from ASSETS.md, its width and height (within 2 points of the layer), position, fill/text/border colours, corner radius, and the disabled or selected states the design shows. No button the frame does not have.
  - **Every component:** every text (exactly, case included), image, icon, button, field, control and bar the frame has is on the screen — `design-components.mjs` lists them from the frame and the final audit checks each one by one.
  - The end-of-testing design check (QA skill section 7) compares every screen with its frame pixel by pixel and checks each component, bar, button and FLOWS.md transition — build so it finds nothing.
  - **Colours:** the theme (U1) is built from `colors.json` only — each design colour once, under its design name; screens use the theme. `P colors` fails on any other colour in lib/.
  - **Images and icons:** each comes from the file `ASSETS.md` maps it to, declared in pubspec.yaml — never redrawn, substituted or swapped for a Material icon — and is placed as `ASSETS.md` says: at its width and height, with its horizontal alignment (left, centre, right) and in its top-to-bottom order on that screen. Give each one `key: ValueKey('asset:<name>')` so its placement test (T7) finds it. A row still MISSING after the answers uses the default the answer gave (a grey box of the same size, labelled with the asset's name), never a made-up image.
  - **Images are already compressed.** The import turned every image into lossless WebP and scaled each one only to what the sharpest phone shows at the largest size the design draws it (`COMPRESSION.md` lists the pixels kept). Use those `.webp` files as they are: never convert, recompress or rescale an image, and never use `design/originals/` — except when CONTRACT.md requires an image drawn larger than the design draws it: then that one image comes from `design/originals/`, with a one-line comment where it is used.
  - **Fonts:** a custom font from `FONTS.md` is bundled from `design/assets/fonts/` and declared in pubspec.yaml; one still MISSING uses the platform font (the default answer). Never a font the design does not use.
  - Where the design and CONTRACT.md disagree, the contract decides behaviour and the design decides appearance.
- **U1. One theme.** `theme:` on `MaterialApp` from a `ColorScheme` in `lib/ui/core/` — with a design, every colour comes from `design/colors.json` (U0); without one, from CONTRACT.md. Add `darkTheme:` only if CONTRACT.md asks for dark mode; without it the app stays light when the phone is in dark mode and must remain fully readable. Views take colours, text styles and spacing from the theme; no `Color(0x…)` or literal font sizes in `views/`.
- **U2. Largest text size must not clip.** No fixed heights around text; rows wrap or use `Expanded`/`Flexible`; forms scroll; labels in a button row use `FittedBox(fit: BoxFit.scaleDown)`.
- **U3. The keyboard can always be dismissed and never covers the focused field or the primary button.** Forms sit in a scroll view; tapping outside unfocuses; numeric keyboards get a Done action.
- **U4. Nothing is drawn over content.** Fixed footers go in `bottomNavigationBar` or a `Column` with `Expanded` content, never a `Stack` over a list.
- **U5. Every list and form has empty, loading and error states** with the exact text from CONTRACT.md.
- **U6. Every interactive widget has a stable `ValueKey` and a semantics label.** Several `Text` widgets that read as one value are wrapped in `MergeSemantics`. Keys are constants of `AppKeys` in `lib/ui/core/app_keys.dart`, written in the interface step; the flow tests find widgets by them, never by coordinates.
- **U7. A document preview looks like a document:** header block, items table with aligned columns, totals block.
- **U8. Layout follows available space, not device type.** Use `LayoutBuilder` or `MediaQuery.sizeOf(context)`; never branch on orientation or "phone vs tablet"; if CONTRACT.md mentions neither landscape nor tablets, lock the app to portrait (`SystemChrome.setPreferredOrientations` in `main.dart`, plus the iOS and Android project settings) instead of building landscape layouts; on wide windows wrap forms and lists in `Center` + `ConstrainedBox(maxWidth: 600)`. Use `ListView.builder` for lists of unknown length.
- **U9. No endless animation on a screen a test waits on.** `pumpAndSettle()` never returns while one runs; show progress indicators only while loading.
- **U10. Respect the system bars.** Content never sits under the status bar, the notch or Dynamic Island, the home indicator, or Android's navigation bar. Every screen is a `Scaffold`; wrap its body in `SafeArea` (under an `AppBar`, which already handles the top: `SafeArea(top: false, …)`); a button pinned to the bottom goes in `bottomNavigationBar`, wrapped in `SafeArea`; the last item of a scrolling list stays reachable above the home indicator. On Android 15 and later, apps that target API level 35 or higher are drawn edge to edge, so this matters on Android as much as on iOS. Status-bar icons stay readable against the top of the screen (the `AppBar` sets this; a screen without one uses `AnnotatedRegion<SystemUiOverlayStyle>`).
- **U11. Every text field shows its example.** `InputDecoration(labelText: <the field's name>, hintText: <the Example column of the field table, character for character>)`. The example is a placeholder only: it never replaces the label, is never filled in as a value, and is never invented — a field without an example in the table is a contract gap to report, not something to make up.
- **U12. Motion is short, native, and only where it tells the user something.** Every effect below is in the Flutter SDK; add no animation package (`animations`, `flutter_animate`, `lottie`…) unless `design/` or CONTRACT.md names one (L11).
  - **Screen changes:** `MaterialPageRoute` (or the router's default page). Flutter's default `PageTransitionsTheme` already gives each platform its own transition — Android's predictive back, iOS's slide with swipe-back — so never replace it with a `PageRouteBuilder` of your own. The one exception is a `design/FLOWS.md` row whose transition (copied from the Figma reaction) is a different kind: build that one, with its duration capped at 400 ms. Overlay rows open with `showModalBottomSheet` or `showDialog`, which animate themselves; replace rows (login done, onboarding done) use `pushReplacement` or the router's `go`, with the same default transition.
  - **Taps:** every tappable element shows the press — Material buttons, `ListTile`, `IconButton`, or `InkWell` with a `Material` ancestor (without one there is no ripple and debug builds assert). Never a bare `GestureDetector` on something that looks tappable: it gives no visual feedback and no platform click. Haptics come from the built-in widgets (`InkWell` calls `Feedback.forTap`/`forLongPress`, `CupertinoSwitch` and the date pickers vibrate) — add no `HapticFeedback` calls of your own unless CONTRACT.md asks.
  - **Busy buttons:** a button that starts async work (save, export, sign in) is disabled (`onPressed: null`) and shows a small `CircularProgressIndicator` in place of its label until the work ends — no double submit, no frozen-looking tap. The indicator exists only while busy (U9).
  - **Changes inside a screen:** loading → content → empty → error switch through an `AnimatedSwitcher` (`Durations.short4`, 200 ms; each child with its own `ValueKey`, or the switch does not animate). A section that expands or collapses uses `AnimatedSize` (`Durations.medium1`, 250 ms). A `Hero` only when the same image continues onto the next screen (a thumbnail opening its detail) — never for text, buttons or whole cards. Typed values, totals and list rows update without animation: the user must read them at once.
  - **Durations and curves:** from the SDK's `Durations` and `Easing` (exported by `material.dart`), never a literal `Duration(milliseconds: …)` in `lib/ui/`. Ceilings: built-in tap feedback as it is, changes inside a screen 200–250 ms, screen changes the platform default; nothing the app adds exceeds 400 ms (`Durations.medium4`) — a longer effect makes the app feel slow. Entering content uses `Easing.standardDecelerate` (or `emphasizedDecelerate` for something entering the screen), leaving uses `Easing.standardAccelerate`.
  - **Cost:** implicit widgets (`AnimatedSwitcher`, `AnimatedSize`, `AnimatedOpacity`) before an `AnimationController`; a controller you do create is made in `initState` and disposed in `dispose`. Animate opacity and transform (fade, slide, scale), not the layout of a whole list each frame. No animation on app start (unless the design has one), on scroll, or on list entrance (no staggered items); nothing loops except a loading indicator (U9).
  - **Reduce motion:** one helper in `lib/ui/core/` — `Duration motion(BuildContext c, Duration d) => MediaQuery.disableAnimationsOf(c) ? Duration.zero : d;` — wraps every duration the app sets, so a user who turned animations off gets the change at once. Its widget test (in `test/ui/`): with `MediaQueryData(disableAnimations: true)` an `AnimatedSwitcher` swap is complete after one `pump()`; without it, the old child is still there at 100 ms and gone after 201 ms with `tester.binding.hasScheduledFrame` false (nothing left running).
- **U13. The app icon is made only by `scripts/app-icon.mjs`, from the one file CONTRACT.md's "App icon" line names** — never drawn, resized or copied into the icon folders by hand, and never left as Flutter's default. The script follows the platform rules: iOS icons are square and opaque at every size of `AppIcon.appiconset/Contents.json` (1024×1024 for the store), and "the system applies masking to produce rounded corners" (Apple HIG), so the source must not have its own rounded corners; Android gets the legacy `mipmap-*/ic_launcher.png` (48–192 px) and an adaptive icon (`mipmap-anydpi-v26/ic_launcher.xml`: a 108 dp background colour and a foreground with the logo inside the centred 66 dp safe zone — developer.android.com, "Adaptive icons"). It refuses a source that is not square, is under 1024 px, or has transparent corners, unless the contract records the user's choice (`--allow-upscale`, `--fill`). When no usable icon was given, the contract records `--none <Q id>`: the script touches no icon, Flutter's default stays, `P assets` accepts it, and the final report lists it — the only way the default icon may ship. `P assets` checks every size, the opacity, the adaptive icon, and that each icon file is still exactly what the script made (v3 shipped a 360 px pre-rounded logo enlarged ×2.8 onto white, and no adaptive icon).
  - **Launch screen:** the native screen shown before Flutter starts has the splash's background colour — iOS `LaunchScreen.storyboard`'s view background; Android `res/drawable/launch_background.xml` and, from Android 12, `android:windowSplashScreenBackground` in `values-v31/styles.xml` (whose icon is the adaptive launcher icon) — so there is no flash of another colour before the app's own splash.
- **U14. Every provided image and icon is used as given** (from `design/` or the PRD's asset pack):
- **U15. One design frame, every screen size.** Figma gives each screen at one frame size (e.g. 393×852) with absolute positions; the app shows that screen, complete, on every phone from 320×568 to 440×956 (tablets and landscape only when CONTRACT.md has them). Translate the positions — never copy them:
  1. **Across:** the design's side margins and gaps stay in points; an element that spans the frame between its margins stretches with the screen; an element with its own width (icon, avatar, chip, a button narrower than the content) keeps it; centred stays centred, right-aligned stays right-aligned; a row of equal items shares the width (`Expanded`).
  2. **Down:** everything between the top bar and what the frame pins to the bottom scrolls whenever it can be taller than the screen — on the smallest phone it scrolls, never clips or squeezes. What the frame pins to the bottom (a main button, a tab bar) stays pinned above the home indicator (U10). Where the design fills the frame's height (a button pushed down by empty space): `LayoutBuilder` → `SingleChildScrollView` → `ConstrainedBox(minHeight: constraints.maxHeight)` → `IntrinsicHeight` → `Column` with a `Spacer` — it fills tall screens and scrolls on short ones.
  3. **Sizes are the design's points, never scaled by the screen** (no `width * 0.12`, no screenutil or sizer package): scaled by width, a 16 pt text from a 393 pt frame becomes 33 pt on an 820 pt tablet and 13 pt on a 320 pt phone. A bigger screen shows more content; text grows only with the user's text-size setting.
  4. **Images** keep their aspect ratio (`AspectRatio` = the design's width ÷ height; `BoxFit.cover` for a full-width photo) — never stretched.
  5. **Text** never sits in a box with a fixed height; it wraps (`Flexible`/`Expanded` inside a `Row`). `maxLines` or an ellipsis only where the design itself shows a truncated text.
  6. **`Stack` + `Positioned`** only for what floats over content in the design (a badge, a floating button, an overlay), placed from its nearest edge — never a top offset copied from the frame.
  7. **System bars, notch, home indicator:** from `SafeArea` / `MediaQuery.paddingOf` at run time (U10) — never the frame's status-bar height; the status bar and home indicator drawn in the Figma frame are the system's, not built.
  8. **Fields:** the focused field scrolls above the keyboard (the `Scaffold`'s default `resizeToAvoidBottomInset` and a scrolling body).
  9. **Nothing overlaps that the design keeps apart:** two tap targets never partly cover each other (a button inside a tappable card is fine); a row of items shares its width with `Expanded`, never fixed widths that only add up on the design's frame (v4: tab items 110 pt wide, 99 pt apart, overlapped by 11 pt on every phone).
  10. **Which widget for what:** `Flexible`/`Expanded` for anything in a `Row` or `Column` that must give way (text first); `LayoutBuilder` where a layout changes with the space it gets (a two-column grid on a tablet); `MediaQuery.paddingOf`/`viewInsetsOf` for the system bars and the keyboard, and `MediaQuery.sizeOf` only to choose a layout — never to scale a size; `AspectRatio` for images and media; `SafeArea` on every screen body (U10). `P layout-lint` (in the gate) fails on a width over 320 pt, a height over 568 pt, a size scaled by the screen, or a `Positioned` top offset over 200 pt — unless the line says `// layout-ok: <why>`.
  T3 checks this on every size; the flow tests and senior QA run on the iPhone SE, the iPhone 17 and the iPhone 17 Pro Max (T4).
  - **Its file:** the exact file the source maps to that place — never a substitute, a Material icon, a redrawn copy or another asset that looks alike. An SVG stays SVG (`flutter_svg`), never rasterised; a Lottie file plays through `lottie`.
  - **Its size, in points:** every `Image.asset` / `SvgPicture.asset` gets the `width` and `height` the design or the PRD gives (an image drawn without them takes its pixel size and is too big), and its fit (`BoxFit`) is the design's.
  - **Its resolutions:** a file provided as @2x/@3x goes in a `2.0x/` or `3.0x/` folder beside the 1x path, and the code loads the 1x path — Flutter picks the variant for the screen. Loading an `@3x` file by name draws it three times too big; `P assets` fails on it.
  - **Its place:** where the design or PRD puts it — alignment, order, padding — with its `AppKeys` key and a placement test (T7) whenever the design or the PRD gives its size.
  - **Every one of them:** an asset the sources assign to a screen and that the code does not use is a missing piece, fixed by the final audit — never deleted.

Layout errors and their fix:

| Error | Fix |
|---|---|
| `RenderFlex overflowed` | Wrap the child in `Expanded`/`Flexible`, or make the parent scroll |
| `Vertical viewport was given unbounded height` | `ListView` inside `Column` → wrap it in `Expanded` |
| `InputDecorator … unbounded width` | `TextField` inside `Row` → wrap it in `Expanded` |
| `Incorrect use of ParentData widget` | `Expanded` must be a direct child of `Row`/`Column`; `Positioned` of `Stack` |
| `RenderBox was not laid out` | A side effect — fix the first error above it in the log |

## 4. Tests

Every acceptance criterion in CONTRACT.md has at least one test named after it (`'AC12 due date is created-on plus terms'`). A test must call real code and must fail when the rule is broken; the final audit breaks the rule and re-runs it (QA skill F1).

- **T1. Unit tests** (`test/domain/`, `test/data/`) cover every use case and repository. Use hand-written fakes for services.
- **T2. Widget tests** (`test/ui/`) cover what a screen shows and how it reacts. Wrap the widget in `MaterialApp`; after `tap` call `pump()`, or `pumpAndSettle()` when a route or animation follows; use `enterText` for input and `scrollUntilVisible` before touching off-screen rows.
- **T3. Every screen fits every screen size — a layout test per screen, per size** (U8, U15; `expectFitsScreen` also fails when two tap targets in `tappable` that one Row, Column, Stack or Wrap lays out partly overlap — U15.9). The interface step copies the plugin's `templates/flutter/test/ui/fits_screen.dart` to `test/ui/fits_screen.dart` — never retyped or edited (verified with Flutter 3.47.7: it passes a correct form on every size and with the keyboard open, a FAB floating over a list, a Save button the open keyboard covers, a long text on a hidden tab and a bottom button padded by the system inset — each of which the previous helper failed — and fails two buttons a Stack draws over each other, a button under the home indicator and an ellipsis). Every failure starts with `<case> text ×<scale>:`. Each screen's test pumps the screen in the state the design shows, on every `screenCases` size plus the design frame's own size (and a tablet and landscape only when CONTRACT.md has them), and calls `expectFitsScreen` with the screen's tappable `AppKeys`:
  - **at normal text size, with `fullText`:** no overflow; every keyed element can be scrolled into view and is then fully inside the screen; every tappable one is inside the safe area; no text is cut off (by `maxLines`, an ellipsis, a box too small for it, or a line too long) except a text the design itself shows truncated, listed in `mayTruncate` with the reason in a comment;
  - **at the largest text of that case (`textScales(c).last`: ×3 on the iPhone cases, ×2 on the Android ones — Android's largest font size is 200%), `fullText: false`:** no overflow, and everything still reachable and inside the screen;
  - **a screen with text fields, on the iPhone SE with `keyboard: 260`:** every field can be scrolled above the keyboard — only the fields in `tappable` are checked then (a button the keyboard covers is where it should be);
  - in each language and in dark mode the contract has. Overflow and cut-off text are found without a simulator; the device runs (T4) then confirm the real insets and fonts.
  ```dart
  // test/ui/fits_screen.dart (copied from the plugin) gives: ScreenCase(name, size, top, bottom, {android}); screenCases
  // (320×568, iPhone SE 375×667, iPhone 17 Pro 402×874, Android 411×914, iPhone 17 Pro Max 440×956); textScales(case);
  // pumpScreen(tester, case, app, {textScale, keyboard}); expectFitsScreen(tester, case, {tappable, fullText, mayTruncate}).

  // test/ui/item_form_layout_test.dart
  void main() {
    for (final c in [...screenCases, const ScreenCase('design 393x852', Size(393, 852), 62, 34)]) {
      testWidgets('T3 item form fits ${c.name}', (t) async {
        await pumpScreen(t, c, const MaterialApp(home: ItemFormView(/* fakes */)));
        await expectFitsScreen(t, c, tappable: [AppKeys.itemName, AppKeys.itemPrice, AppKeys.save]);
      });
      testWidgets('T3 item form at the largest text ${c.name}', (t) async {
        await pumpScreen(t, c, const MaterialApp(home: ItemFormView(/* fakes */)), textScale: textScales(c).last);
        await expectFitsScreen(t, c, tappable: [AppKeys.save], fullText: false);
      });
    }
    testWidgets('T3 item form with the keyboard on the iPhone SE', (t) async {
      await pumpScreen(t, screenCases[1], const MaterialApp(home: ItemFormView(/* fakes */)), keyboard: 260);
      await expectFitsScreen(t, screenCases[1], tappable: [AppKeys.itemName, AppKeys.itemPrice]);
    });
  }
  ```
  The insets in `screenCases` are examples of each kind of phone (status bar with or without a notch or Dynamic Island; home indicator; Android's three-button bar), not measured values; the keyboard height is an example too.
- **T4. Flow tests run the real app on a device** — one test per user flow in CONTRACT.md's "User flows" section, written by the flow-test writer (QA skill section 3), not by the builders. Each starts from empty storage, drives the screens by `AppKeys`, asserts every criterion on the way (data and UI), is named `"<flow> AC.. AC.."`, and is tagged `ios` or `android` when it applies to one platform only. The same test runs on the iPhone SE, the iPhone 17 and the iPhone 17 Pro Max (whichever runner gets it): before every `tap` and `enterText`, bring the widget into view with `await tester.ensureVisible(finder)` (or `scrollUntilVisible` in a lazy list) — never rely on where it sits on one screen size.
  ```dart
  // integration_test/app_test.dart — dev dependency: integration_test (sdk: flutter)
  void main() {
    IntegrationTestWidgetsFlutterBinding.ensureInitialized();
    testWidgets('AC32 fourth document in a month opens Plans', (tester) async {
      await tester.pumpWidget(await buildApp(storage: InMemoryStorage()));
      // … drive the flow with find.byKey(const ValueKey('save')) …
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('plans_screen')), findsOneWidget);
    });
  }
  ```
  Run with `set -o pipefail; flutter test integration_test/<file> -d <udid> -x android -r expanded --no-pub 2>&1 | tee <scratchpad>/flow-<udid>.log` (on Android: `-x ios`): a line per test, so a stuck run can be told from a slow one (QA rule E10).
- **T5. The gate, before testing (scripts only):** `flutter analyze`, `flutter test -j 4 -r failures-only --no-pub`, `flutter build ios --simulator --debug`, `flutter build apk --debug` (when Android is in scope), and the pipeline's `coverage`, `deps`, `colors` and `stray`. The device flow tests are run by the test runners, not in the gate.
- **T6. Fast iteration, full check once.** While changing code, run only the tests for what you changed (`flutter test <file> -j 4 -r failures-only --no-pub`, `flutter test <file> --plain-name "<name>"`); run the full T5 list once, at the end, before reporting. Build the iOS app once and rebuild only after a code change. A step that only needs to read code does not build.
- **T7. Every screen with sized assets has an asset-placement test** — with a design (sizes from `design/ASSETS.md`) or with the PRD's asset table (its sizes in points). At the design frame's size (or the iPhone 17's 402×874 without a design), every asset `ASSETS.md` puts on the screen must be found by its key, match the design's width and height within 2 px, sit at its alignment (left edge, centre or right edge) within 2 px, and appear in the design's top-to-bottom order. Exact vertical position is not asserted here — text metrics move it legitimately — the design comparison (QA skill section 7) checks it against the reference screenshot. Verified on this Mac: the test passes on a correct layout and catches a wrong size, a wrong alignment and a wrong order.
  ```dart
  // From design/ASSETS.md for this screen: the frame size, then each asset in top-to-bottom order.
  const frame = Size(393, 852);
  const homeAssets = [
    (name: 'logo', x: 136.5, width: 120.0, height: 40.0, align: 'centre'),
    (name: 'hero', x: 16.0, width: 361.0, height: 200.0, align: 'left'),
  ];

  Future<void> expectAssetsMatchDesign(WidgetTester tester, List<({String name, double x, double width, double height, String align})> assets) async {
    double lastTop = double.negativeInfinity;
    for (final a in assets) {
      final f = find.byKey(ValueKey('asset:${a.name}'));
      expect(f, findsOneWidget, reason: '${a.name} is on the screen');
      final r = tester.getRect(f);
      expect(r.width, closeTo(a.width, 2), reason: '${a.name} width');
      expect(r.height, closeTo(a.height, 2), reason: '${a.name} height');
      if (a.align == 'left') expect(r.left, closeTo(a.x, 2), reason: '${a.name} left edge');
      if (a.align == 'centre') expect(r.center.dx, closeTo(frame.width / 2, 2), reason: '${a.name} centred');
      if (a.align == 'right') expect(frame.width - r.right, closeTo(frame.width - a.x - a.width, 2), reason: '${a.name} right edge');
      expect(r.top, greaterThanOrEqualTo(lastTop), reason: '${a.name} is below the asset before it');
      lastTop = r.top;
    }
  }

  testWidgets('T7 home: assets match the design', (tester) async {
    await pumpScreen(tester, const ScreenCase('design', frame, 62, 34), const MaterialApp(home: HomeView(/* fakes */))); // test/ui/fits_screen.dart
    await expectAssetsMatchDesign(tester, homeAssets);
  });
  ```
- **T8. Every row of CONTRACT.md's "API calls" table has a call-budget test** (L13): a counting fake client (`package:http/testing.dart` `MockClient` with a counter, answering from the fixture) drives the action and asserts the exact number of requests and the requested fields — e.g. opening the same place twice → 1 request whose field mask is the table's list; typing "london" quickly → 1 autocomplete request, with one session token; a failed 503 → at most 3 requests. Named `"T8 <api> <action> AC.."`.
