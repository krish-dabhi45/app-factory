# Where flutter-app/SKILL.md comes from

One skill, built on 2026-09-30 from an audit of 29 skills. Parts adapted from
https://github.com/flutter/agent-plugins (commit 8da8c54, BSD-3-Clause — see LICENSE-flutter-agent-plugins).

| Source | Used | What was taken / why not |
|---|---|---|
| flutter-apply-architecture-best-practices (Flutter team) | Yes | Layer split, folder structure, MVVM with ChangeNotifier + ListenableBuilder, repositories/services → section 1, L1, L3. Dropped its "freezed or built_value" step (S4). |
| flutter-add-widget-test (Flutter team) | Yes | pump / pumpAndSettle / enterText / scrollUntilVisible rules → T2. |
| flutter-add-integration-test (Flutter team) | Partly | integration_test package and binding → T4. Dropped flutter_driver, `flutter drive`, chromedriver, Firebase Test Lab and the Dart MCP exploration steps: `flutter test integration_test -d <udid>` needs none of them (verified on this Mac: 1 test passed in 56 s). |
| flutter-build-responsive-layout (Flutter team) | Partly | Window-size rules, ConstrainedBox on wide screens → U8. Its "never lock orientation" was replaced on 2026-10-01 by "portrait-only unless CONTRACT.md mentions landscape or tablets": supporting landscape on every phone app is work no PRD asked for. |
| flutter-fix-layout-issues (Flutter team) | Yes | The five error → fix pairs → table in section 3. |
| flutter-implement-json-serialization (Flutter team) | Yes | Manual fromJson with pattern matching, throw on bad data → L5. |
| dart-add-unit-test, dart-run-static-analysis (Flutter team) | Yes | Test layout mirrors lib; strict analysis options, dart fix → T1, L7. |
| flutter-use-http-package (Flutter team) | Partly | Inject client, throw on non-2xx → L6. Only matters for apps with an API. |
| flutter-add-widget-preview (Flutter team) | No | Previews are for a person looking at the IDE or Chrome; no pipeline agent looks at them. Previewed widgets may not depend on dart:io or native plugins, which these apps use. T3 gives an automatic check instead. |
| flutter-setup-declarative-routing (go_router) | No | For deep links and web URLs. Add when a PRD asks for them; `Navigator` covers the rest. |
| flutter-setup-localization | No | Add when a PRD asks for more than one language. |
| dart-generate-test-mocks (mockito) | No | Needs build_runner (S4); hand-written fakes do the job. |
| rules/flutter-hot-reload, dart-fix-runtime-errors, Dart MCP server | No | Need a long-running debug session; pipeline agents build and test in batch. |
| 11 other dart-* skills (CLI apps, FFI, coverage, doc examples, checks migration, pattern matching, primary constructors, package conflicts, path, documentation) | No | Not about building or testing a mobile app. |
| flutter-ui-ux (pasted by the user) | Partly | Theme, const, ListView.builder, semantics → U1, U6, U8. Dropped: animation sections (no acceptance criterion needs them and endless animations break tests, U9), code that does not compile (`Icons.add_cart`, `colorScheme.contrast()`), links to reference files that were not supplied. |
| flutter-enterprise (pasted by the user) | Partly | Dependency rule, feature independence, test per layer → S2, T1. Dropped: its `features/x/data|domain|presentation` tree (conflicts with the Flutter team's structure; one had to win), four state-management options, GetIt, code generation. |
| Defects found in app-factory runs | Yes | U2, U3, U4, U6, U7, L1, L2, L4, T3, "a test must be able to fail": tip calculator X1/X2, weather X3, invoice-maker X2/X5. |

Verified on this Mac (Flutter 3.38.5): T3 detects an overflowing Row and passes on a fixed one; T4 command runs on an iOS simulator.

Added 2026-10-02 → 2026-10-06 (0.15–0.18.x), from the user's requests and run evidence: S1 ownership for parallel builders (interface / logic / UI / flow-test writer); L11 a reason for every package; L12 missing keys (free service or "not available", switched by `lib/config/api_keys.dart`); U12 motion (Material 3 durations, FLOWS.md transitions); U13 app icon only via `scripts/app-icon.mjs` (Apple HIG "App icons", developer.android.com "Adaptive icons"; v3 shipped a 360 px pre-rounded logo enlarged ×2.8); U14 provided assets at their stated size; T7 asset placement tests.

Changed 2026-10-01 to stop testing from widening scope: U1 no longer requires a dark theme (only when CONTRACT.md asks; otherwise the app must stay readable in system dark mode).
