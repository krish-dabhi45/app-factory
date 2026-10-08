---
name: flutter-ads
description: AdMob ads for a Flutter app built by app-factory — where to place them in THIS app (a placement audit that ranks screens and picks the format each screen allows), Google's test IDs, consent, and no ads at all once Premium is bought. Use when CONTRACT.md has an "Ads" section, or when asked to add, audit or move ads in a Flutter app.
---

# Flutter ads (google_mobile_ads)

Placement comes from an audit of the app, not from a fixed list. Every rule below is either Google's (source given) or a plugin default (marked **default**), which CONTRACT.md may override. `references/ADS_REFERENCE.md` and `references/flutter-admob-ads.md` are the source files this skill was built from; use them only for the two cases section 6 names, and never copy what section 7 corrects.

## 1. Verified facts (google_mobile_ads 9.1.0, checked 2026-10-05)

**Google's demo ad unit IDs** — used in every debug build ([Android](https://developers.google.com/admob/android/test-ads), [iOS](https://developers.google.com/admob/ios/test-ads)):

| Format | Android | iOS |
|---|---|---|
| App open | `ca-app-pub-3940256099942544/9257395921` | `ca-app-pub-3940256099942544/5575463023` |
| Adaptive banner (anchored and inline) | `ca-app-pub-3940256099942544/9214589741` | `ca-app-pub-3940256099942544/2435281174` |
| Interstitial | `ca-app-pub-3940256099942544/1033173712` | `ca-app-pub-3940256099942544/4411468910` |
| Rewarded | `ca-app-pub-3940256099942544/5224354917` | `ca-app-pub-3940256099942544/1712485313` |
| Native | `ca-app-pub-3940256099942544/2247696110` | `ca-app-pub-3940256099942544/3986624511` |

**Sample App IDs:** Android `ca-app-pub-3940256099942544~3347511713` in `AndroidManifest.xml` as meta-data `com.google.android.gms.ads.APPLICATION_ID` ([quick start](https://developers.google.com/admob/flutter/quick-start)); iOS `ca-app-pub-3940256099942544~1458002511` as `GADApplicationIdentifier` in `ios/Runner/Info.plist`, plus the `SKAdNetworkItems` key with Google's identifiers ([iOS quick start](https://developers.google.com/admob/ios/quick-start)).

**APIs in the package source:**
- Anchored adaptive banner: `AdSize.getLargeAnchoredAdaptiveBannerAdSize(width)`. `getCurrentOrientationAnchoredAdaptiveBannerAdSize` is `@Deprecated` (ad_containers.dart:492) — never use it.
- Inline adaptive banner (inside scrolling content): `AdSize.getCurrentOrientationInlineAdaptiveBannerAdSize(width)` (ad_containers.dart:539).
- Native: `NativeAd` needs `factoryId` OR `nativeTemplateStyle` (ad_containers.dart:1098). `NativeTemplateStyle(templateType: TemplateType.small | TemplateType.medium, …)` renders on iOS and Android with **no Kotlin, XML or Swift**.
- Consent (UMP): `ConsentInformation.instance.requestConsentInfoUpdate(…)`, `ConsentForm.loadAndShowConsentFormIfRequired(…)`, `ConsentInformation.instance.canRequestAds()`, `getPrivacyOptionsRequirementStatus()`, `ConsentForm.showPrivacyOptionsForm(…)`.
- `AppOpenAd`, `InterstitialAd`, `RewardedAd` each have `static load(…)`.

## 2. Placement audit — writes the "Ads" section of CONTRACT.md

An impression is counted when an ad is shown. More impressions therefore come from ads on the screens users open most and stay on longest — never from more ads on one screen. Do this from CONTRACT.md's criteria and, with a design, `design/FLOWS.md` and `design/SCREENS.md`:

1. **Rank the screens.** For each screen, count the criteria and flows that pass through it, and mark whether it is a tab root, the first screen after launch, or a list that can hold more than one screenful. Highest first. Ads go on the top-ranked screens that rule 2 allows; a screen ranked in the bottom half gets no ad unless rule 2 allows nothing above it.
2. **Allowed format per screen:**

| Screen | Allowed | Why |
|---|---|---|
| List or feed that can grow past one screenful | **Native, in the feed** (`TemplateType.medium`): after item 3, then after every 10th item (**default**) | seen while scrolling; one per screenful at most |
| Content screen with no bottom tab bar and no bottom action button (detail, results, reading) | **Anchored adaptive banner** at the bottom, in the `Scaffold`'s bottom area inside `SafeArea` | stays on screen for the whole visit |
| Screen with a bottom tab bar or a bottom action button | **No anchored banner** — Google discourages banners "immediately next to interactive elements" and "between interactive app content and the custom app navigation/menu buttons at the bottom" ([source](https://support.google.com/admob/answer/6275345)). Use the in-feed native if it has a list; otherwise an inline adaptive banner at the end of its content | |
| Screen the user interacts with continuously (map, camera, drawing, game, a form being filled) | **Nothing** — "On a game play screen where users are continuously interacting" ([source](https://support.google.com/admob/answer/6275345)) | |
| Never | splash and launch, onboarding, consent, paywall and any purchase or restore screen, settings and legal pages, error and empty states, permission prompts, dialogs and sheets | the user is deciding something, or there is no content |

3. **Interstitial** — only at a logical break in the app's most repeated flow: after a task completes (saved, exported, shared, a result shown) or when the user goes from a detail back to its list. Google disallows interstitials on app load or exit, "after every user action", back-to-back, blocking navigation, or launched unexpectedly ([source](https://support.google.com/admob/answer/6201362)), and recommends showing them before a break page and preloading them ([source](https://support.google.com/admob/answer/6201350)). Caps (**default**): at most one per 60 s, at most one per two qualifying actions, none in the app's first launch, none within 60 s of an app open ad. A pure function in `lib/domain/use_cases/ads_rules.dart` decides; the caller's action always continues after the ad closes or fails.
4. **App open ad** — only when the PRD says users open the app often (Google: apps opened "more than once every 4 hours" perform best), shown on the splash/loading screen when the app is opened or brought back, never right before or after another ad and never over a banner ([source](https://support.google.com/admob/answer/9341964)). Not on the first launch (**default**). Off unless CONTRACT.md lists it.
5. **Rewarded** — only when the PRD has something a free user can unlock for a while; never to unlock a whole feature Premium sells. Off unless CONTRACT.md lists it.
6. **One format per screen** (**default**): a screen has an anchored banner OR in-feed natives OR an inline banner — not two. No ad is ever drawn over content or controls (flutter-app U4), and every ad keeps 16 pt (**default**) of space from any tappable element.

Write the result to CONTRACT.md as section "Ads": one row per placement — id (`<screen><Format>AdUnitId`, e.g. `invoiceListNativeAdUnitId`), screen, format, exact position or trigger, cap, and the AC that tests it — then one line per screen ranked in the top half that gets no ad, with the rule that forbids it. Every placement is a criterion: "AC<n> <screen> shows <format> at <position> for non-Premium users; Premium users see none". With a design and no ad slot in it, an anchored banner takes the space below the content (never shrinking a designed element below its design size); a native ad uses the template, styled with the design's colours and fonts through `NativeTemplateStyle`.

## 3. Build

Files (flutter-app S1 layers):
- `lib/config/ad_ids.dart` — one constant per placement from the Ads table plus `interstitial`, `appOpen`, `rewarded`: `kDebugMode` → the demo ID for the running platform (section 1); release → the owner's ID, a placeholder `''` until they fill it. An empty ID means that placement shows nothing and makes no request. One variable per placement, so the owner can switch one off.
- `lib/domain/use_cases/ads_rules.dart` — pure functions: may an interstitial show now (caps of section 2.3); may an app open ad show now; which list indexes get a native (after 3, every 10th).
- `lib/data/services/ads_service.dart` — the only file that imports `google_mobile_ads`: consent, initialise, load and show each format, dispose.
- `lib/ui/core/ad_slots.dart` — `AnchoredBannerSlot`, `InlineBannerSlot`, `NativeAdSlot`: each returns `SizedBox.shrink()` while Premium, without consent, offline, with an empty ID, or until its ad has loaded (no empty grey box — the layout simply has no ad), and disposes its ad in `dispose()`.

Order at launch: (1) Premium status from the store — `in_app_purchase`'s purchase stream after `restorePurchases()` (iOS) or the past-purchases query (Android) — wait for the first answer, at most 3 s (**default**); until it is known, nothing ad-related runs. (2) Premium → stop: never initialise the SDK. (3) Not Premium → UMP: `requestConsentInfoUpdate`, then `loadAndShowConsentFormIfRequired`; only if `canRequestAds()` is true, `MobileAds.instance.initialize()`. (4) Preload the interstitial (and app open, if listed). If the UMP privacy options are required, Settings gets a "Privacy options" row that calls `ConsentForm.showPrivacyOptionsForm`. iOS App Tracking Transparency is asked only if CONTRACT.md says so.

Banner: get the size with `getLargeAnchoredAdaptiveBannerAdSize(MediaQuery.sizeOf(context).width.truncate())`, load once per screen visit, one retry on failure (**default**), nothing on screen until loaded. Native: `NativeAd(adUnitId: …, nativeTemplateStyle: NativeTemplateStyle(templateType: TemplateType.medium, mainBackgroundColor: <theme surface>, cornerRadius: <design radius>, …))`, loaded when its list position is about to be built, never more than one loaded ahead.

## 4. Premium removes every ad, at once

- Premium comes only from the store (purchase stream and restore), never from a stored flag — so a refunded or expired purchase brings ads back and a stored flag can't be faked.
- On the purchase or restore event that turns Premium on: `ads_service` disposes every loaded ad, drops the preloaded interstitial and app open ad, and stops all loading; every ad slot listens to the Premium state and collapses to `SizedBox.shrink()` in the same frame. No ad request is made after that point in this session or any later one while Premium holds.
- A paywall or "remove ads" entry is never itself an ad placement.

## 5. Tests (flutter-app T rules)

- Unit, `ads_rules`: interstitial blocked within 60 s, on the first launch, on every second qualifying action, and within 60 s of an app open ad; native indexes 3, 13, 23 for a 30-item list.
- Widget: each ad slot renders `SizedBox.shrink()` for Premium, for an empty ID, and before load; a screen with a bottom tab bar has no `AnchoredBannerSlot`.
- Device (flow tests, QA skill section 3): per placement, the debug build shows Google's labelled test ad at exactly its Ads-table position, not over content, the status bar or system navigation (U10) — asserted inside the flow that reaches that screen; one Premium journey: a test purchase, then every ad screen and a relaunch — no ad anywhere. Senior QA (by hand): with consent declined in the UMP debug geography the app still works, with no ads.

## 6. When to open the references

- **Remote Config for ad IDs** — only if the PRD asks to change IDs without an app update: follow `references/flutter-admob-ads.md` Phase 3 (GET from SharedPreferences → ASSIGN from Remote Config → SET), with the `ad_ids.dart` names as keys.
- **A native ad with a custom layout** the template cannot match — only if the design has one: the Android factory and XML in `references/flutter-admob-ads.md` (Examples H–J, with the `customOptions` parameter and `registerNativeAdFactory(flutterEngine, …)`). iOS then also needs a Swift `FLTNativeAdFactory`, which neither reference has — that is an upfront question, default: use the template.

## 7. What the references do that this skill does not, and why

| Reference (`ADS_REFERENCE.md`) | Problem | Here |
|---|---|---|
| Interstitial on the splash screen (`forceShow`), §13 | Google disallows interstitials on app load ([source](https://support.google.com/admob/answer/6201362)) | never on splash; app open ad instead, only if listed |
| Interstitial on every `navigateTo` and every back press, every 2nd click, §12 | "after every user action" is disallowed; blocks navigation | logical breaks of the main flow only, with caps |
| "Welcome back" screen with a native ad pushed on every resume, §14 | a full screen nobody asked for; an app open ad is Google's format for resume | app open ad, only if listed |
| Full-screen native pages inside onboarding, §11 rows 3–6 | onboarding is a never-screen here | none |
| `getCurrentOrientationAnchoredAdaptiveBannerAdSize` | `@Deprecated` in 9.1.0 | `getLargeAnchoredAdaptiveBannerAdSize` |
| Android XML + `NativeAdFactory` for every native ad | iOS needs its own Swift factory; templates need neither | `NativeTemplateStyle` |
| `visibility_detector`, `shimmer`, Firebase Remote Config always added | packages the app may not need (flutter-app L11) | only when section 6 applies |
| `"11"` written into every ID for Premium | Premium is a gate; IDs stay as configured | Premium gate (section 4); an empty ID disables one placement |
| `flutter-admob-ads.md` contains lines like `fileciteturn0file1L19-L35` | citation leftovers, not instructions | ignore them |
