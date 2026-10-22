# app-factory setup guide

How to install the plugin into a project on this Mac and run it from a VS Code window.
Sections 1 and 2, and the per-project uninstall in section 8, were run on this machine. Anything that was not is marked **Not tested** — that includes the whole run flow of sections 4 and 5 in its current form (version 0.2.x).

## 1. Before you start

**Systems.** macOS builds and tests the iOS and the Android app. **Linux and Windows build and test the Android app only**: iOS builds and simulators need Xcode, which runs only on macOS. There, the run tells you so at the start and at the end (`iOS: not built or tested`), every device step (explore, flow tests, senior QA, the design check) runs on the Android emulator, and the SwiftUI stack stops at once. On Windows, Claude Code runs commands in Git Bash, so `install.sh` and the agents' commands run there; install Git for Windows if Claude Code asks for it.

| Needed off macOS | Notes |
|---|---|
| Node.js 18.15 or newer, npx, git | as on macOS |
| Flutter on PATH | `flutter.bat` on Windows is found too |
| Android SDK with `emulator`, `platform-tools` and `cmdline-tools/latest` | found from `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or Android Studio's default folder (`~/Android/Sdk` on Linux, `%LOCALAPPDATA%\Android\Sdk` on Windows) |
| Java 17 (`JAVA_HOME`) | `avdmanager` needs it |
| libwebp tools (`cwebp`, `gif2webp`, `webpmux`) on PATH | `apt install webp` on Debian/Ubuntu; Google's libwebp binaries on Windows |
| An x86_64 or arm64 Android system image | the installer picks the one matching the CPU |

`install.sh` runs `scripts/configure.mjs`, which writes what it found into the workflow and prints a WARNING for anything missing.

**Not tested on a real Linux or Windows machine yet:** the Node parts are checked on macOS (the self-tests run the Linux/Windows image code and compare it with Core Graphics; the workflow simulation runs the whole flow as a Linux and as a Windows machine). Starting `.bat` tools (`avdmanager.bat`, `flutter.bat`) from Git Bash and the emulator on those systems are not yet seen working.

### On macOS

| Needed | Check with | On this Mac |
|---|---|---|
| Claude Code extension in VS Code, signed in | Claude Code panel opens and answers | 2.1.283 |
| Xcode with an iOS Simulator runtime | `xcrun simctl list runtimes` | Xcode 27.0, iOS 26.1 |
| Node.js and npx | `node -v && npx -v` | 26.7.0, 11.19.0 |
| git | `git --version` | 2.50.1 |
| Flutter, for Flutter apps | `"/Users/mach/Flutter Workspace/flutter/bin/flutter" --version` | 3.38.5 |
| XcodeGen, for native iOS apps | `xcodegen --version` | 2.46.0 |
| WebP tools, for a Figma design (`brew install webp`) | `cwebp -version` | 1.6.0 |
| Internet, on the first run | — | `npx` downloads mobile-mcp 1.0.5 and mobilecli; with Android, `pipeline.mjs maestro-install` downloads Maestro 2.11.0 once (315 MB, SHA-256 checked) for the Android screen reader |

The install command stops if `node`, `npx`, `xcrun` or `git` is missing and warns if Flutter, XcodeGen or the WebP tools are missing. It does not install anything. It does not check that you are signed in.

## 2. Install into a project

Open the project folder in a VS Code window, open the Claude Code panel, and type:

```
/install-app-factory
```

Claude runs the installer for the folder that window has open and shows its output. Approve the command if the panel asks. When the last line starts with `installed.`, go to section 3.

Tested by running the command through the Claude Code binary in a fresh folder: it installed the plugin and printed the reload instruction. **Not tested:** typing it in the panel itself, so the panel's permission prompt for it has not been seen.

`/install-app-factory` is a personal command stored at `~/.claude/skills/install-app-factory/SKILL.md`, so it is available in every VS Code window on this Mac. If it is missing (first install on this machine, or it was deleted), the plugin's `SessionStart` hook writes it back the next time a session starts in any project with app-factory installed — no manual step. To force it back immediately instead of waiting for that:

```sh
mkdir -p ~/.claude/skills/install-app-factory && cp /Users/mach/testing/app-factory/setup/install-app-factory/SKILL.md ~/.claude/skills/install-app-factory/
```

The same installer can be run from a terminal instead: `/Users/mach/testing/app-factory/install.sh /path/to/your-project`.

What the installer does, in order:

1. Finds the Claude Code binary (on PATH, or the newest one inside the VS Code extension).
2. Checks that `ROOT` in `workflows/build-app.js` points at this plugin folder.
3. Checks `node`, `npx`, `xcrun`, `git`; warns if Flutter or XcodeGen is missing.
4. Registers this folder as the marketplace `app-factory-dev` (first time) or refreshes it.
5. Installs the plugin for that project only, and updates it if an older version was there.
6. Confirms `.claude/settings.json` in the project contains `"app-factory@app-factory-dev": true`.

Running it again is safe. Anything starting with `error:` means it stopped and nothing further was done.

## 2b. Install on a different machine (no git clone)

This repo is on GitHub (`krish-dabhi45/app-factory`, **private**), so another machine installs from there instead of from a local folder — there is no `install.sh` to run, because there is no local copy of the repo to run it from. Everything below happens inside the VS Code extension; no terminal and no `claude` command are needed (the extension carries its own copy of Claude Code, and `claude` is usually not on PATH — it isn't on this Mac).

**Before the first install** that machine needs git access to the private repo, because the extension fetches it with that machine's own git: an SSH key that authenticates to github.com, or `gh auth login` for HTTPS. On a brand-new machine, run `ssh -T git@github.com` once so github.com's host key is trusted.

**Once, on that machine**, with the project folder open in VS Code:

1. Open the Claude Code panel and type `/plugins`. The **Manage plugins** dialog opens.
2. **Marketplaces** tab → enter `krish-dabhi45/app-factory` → add it. It registers as `app-factory-dev` (the name inside `.claude-plugin/marketplace.json`).
3. **Plugins** tab → `app-factory` → **Install** → **Install for this project**.
4. Start a new chat.

Or, instead of steps 1–3, paste this into a browser's address bar on that machine and press Return; the browser asks to open VS Code, and the same dialog opens on app-factory, asking first to add the marketplace and then for the scope (pick **Install for this project**):

```text
vscode://anthropic.claude-code/install-plugin?plugin=app-factory&marketplace=krish-dabhi45/app-factory
```

(GitHub strips `vscode://` links from Markdown, which is why it's in a code block and has to be pasted.)

The extension fetches the repo itself, into its own plugin cache (`~/.claude/plugins/cache/app-factory-dev/app-factory/<version>/`) — nothing is cloned into a folder you can see or have to manage. On the first chat, the plugin's `SessionStart` hook (`scripts/self-configure.mjs`) runs once automatically, points `workflows/build-app.js` at that machine's own Flutter/Android SDK/Java (the same thing `configure.mjs` does for a local install, just run against the cache copy instead of a source checkout), and copies `setup/install-app-factory/SKILL.md` to `~/.claude/skills/install-app-factory/` — so `/install-app-factory` exists on that machine from then on, with no manual file copying.

**Every update after that**, on any machine: type `/install-app-factory` in the chat. It finds the extension's own Claude Code binary (PATH first, else the newest one under `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/`, the same lookup `install.sh` uses) and runs `plugin marketplace update app-factory-dev` + `plugin install app-factory@app-factory-dev --scope project` with it. The new version only reaches other machines once it is pushed to GitHub. Doing it by hand instead: `/plugins` → Marketplaces tab → refresh icon on `app-factory-dev`.

Verified 2026-10-22 on this Mac (`claude` not on PATH, shell zsh): `/install-app-factory`'s two commands, run exactly as written, found the extension's binary (2.1.283), listed `app-factory-dev`, and installed app-factory into a scratch project (`.claude/settings.json` got `"app-factory@app-factory-dev": true`; uninstalled afterwards); with no binary anywhere it stops with `error: no Claude Code binary on PATH or in ~/.vscode/extensions`. The `/plugins` dialog steps and the `vscode://` link come from the extension's docs (code.claude.com/docs/en/vs-code, "Manage plugins" and "Share a plugin install link") and were **not run here**: this Mac already has a directory-source marketplace named `app-factory-dev`, and the docs say the dialog then refuses a different source with the same name ("nothing installs").

Verified 2026-10-22: a renamed copy of this repo (so it wouldn't collide with the real `app-factory-dev` registration), with wrong machine paths deliberately baked into `workflows/build-app.js` (as a real GitHub clone from someone else's machine would have), installed under a `directory`-source marketplace the same way `plugin install` caches a GitHub source — `node self-configure.mjs` run directly against that cache corrected `ROOT` to the real cache path and `FLUTTER` to this machine's real Flutter, a second run changed nothing (idempotent), and `/install-app-factory`'s new content was copied byte-for-byte. **Not yet seen fire from an actual `SessionStart` hook on a real second machine** — the mechanics are proven, the end-to-end trigger is not.

**If the repo is made public** later, the same steps work without the SSH-key/`gh auth` requirement (`krish-dabhi45/app-factory` then resolves over plain HTTPS).

## 3. Reload the window

1. Cmd+Shift+P → "Developer: Reload Window".
2. Open the Claude Code panel and start a **new chat**. A chat that was open before the install does not have the plugin or the simulator tools (seen in the pilot; a new session had them).

**Not tested:** the reload itself. A new chat after the install was enough in the pilot.
3. Type `/` — `app-factory:build-app` must appear in the list. If it does not, see section 7.

## 4. Run it

app-factory has three commands; everything else in it (the flutter-app, flutter-ads and app-qa rule books) is read by its agents and is not in the `/` menu:

| Command | What it does |
|---|---|
| `/app-factory:build-app` | Builds the app from `PRD.md`: contract and questions first, then the build, tests, senior QA and the final audit. Ads + Remote Config are in every app unless the PRD says no ads. |
| `/app-factory:stop` | Stops a running build-app run from the chat that started it, frees its locks and devices, keeps all work. |
| `/app-factory:ads-implementation` | Adds ads + Remote Config to an app that is already built: explores the entire app, then places every ad by the pattern (section 9b). |

### Figma design (optional)

Put the Figma link (`https://www.figma.com/design/...`) in `PRD.md`, or pass it as `"figma"` in step 1. The import saves Figma's answers as they are, writes one small `design/import.json` (which PRD screen each frame shows, the PRD's colours), and `scripts/design-docs.mjs` writes every mapping document from them — no agent-written generator. On the first call, one agent imports the whole design as it is into `design/`, through the Figma MCP, before anything else happens:

- **Screens** (`SCREENS.md`): each page's layer structure with every position and size, and each screen's design data and Figma reference code — then **cross-checked against the PRD**: the number of screens the PRD states (state it in the PRD, e.g. "12 screens", or list them) against the Figma screens, matched by name and content, with every screen only in one of them, and every screen missing its design data, screenshot or inventory, listed. Totals appear in the run log: "PRD 12 · Figma 11 · matched 10".
- **Flows** (`FLOWS.md`): every prototype interaction — element, trigger, destination — read from the file with read-only `use_figma` calls. Also listed: elements that look interactive but lead nowhere, and screens nothing leads to.
- **Colours** (`COLORS.md`, `colors.json`): every variable, style and colour used on a screen, with where it is used. Every colour `PRD.md` names is mapped to a design colour or marked NO MATCH. Raw and near-duplicate colours are listed.
- **Images and icons** (`ASSETS.md`): every one, downloaded and mapped to its file (or MISSING), with its exact size, position, horizontal alignment and top-to-bottom order on each screen. Builders place each asset that way, and an automated test per screen fails if an asset's size or alignment is off by more than 2 px or its order differs (verified: it catches all three); the design comparison checks the exact vertical position against the reference screenshot.
- **Fonts** (`FONTS.md`): every family and style. The Figma MCP cannot download font files, so every custom font is MISSING until you supply it.

**The upfront audit reads the whole imported design** — every file listed above and every screen's design data — and proves it: the run stops if it read fewer screens than were imported, and also stops if the import failed or was partial, so no contract is ever written without the design. It goes through every screen and every feature (inputs, rules, outputs, stored data, errors, limits, and everything outside the app a feature needs) and turns every gap into a question; every question, asked or not, its options and the selected one are kept in `DECISIONS.md` — no separate audit file. Everything in `MISSING.md` becomes a question the chat asks you, with a recommended answer — a grey placeholder box for a missing image, the platform font for a missing font, "does nothing" for an element without a destination, the nearest design colour for an unmatched PRD colour. To supply a file, put it under `design/provided/` and type its path as your answer under "Other"; the build puts it in place. Nothing is built from screenshots: one reference screenshot per screen is kept only for the test runners' design comparison. No later agent calls Figma. During the build, the `colors` check fails on any colour in the code that is not in `colors.json`.

**Images are compressed once, right after the import, before any code is written** (`scripts/assets.mjs`, about a minute, no model involved). Every image becomes lossless WebP — the encoder decodes its own output and must report identical pixels (PSNR 99), or the image is kept as it was; GIFs become animated WebP with the same total frame time. An image is also scaled down, but only to what the sharpest phone can show at the largest size the design draws it (3× for iOS-only apps, 4× when Android is in scope, plus room for the widest phone, 440 pt); an image whose drawn size can't be worked out is not scaled, and with tablets in scope nothing is scaled. The builders, the runners' comparison with Figma and every tester all use these final files, so nothing changes after testing. Originals stay in `design/originals/` (not in the app); `design/COMPRESSION.md` lists every image before and after. Measured on Live Street View: 72 images, 124,669 KB → 45,609 KB in 73 s; every image the app draws still has at least the pixels the largest iPhone shows at 3×.

A Figma account allows only so many calls (Pro, Full seat: 200 a day, 10 a minute), so the import makes as few as it can. Measured on a real run (Live Street View, 31 screens, version 0.8.0): the import made 77 calls in its first 23 minutes and was heading for about 130, because (1) the screen inventory came back over Figma's ~20 KB reply limit and had to be split into 22 calls, (2) one screen that returned a server error was re-fetched part by part (15+ calls), and (3) every screen got its own reference screenshot (31 calls). Since 0.9.1: the inventory is compact and splits itself only at whole screens, a server error is retried once and then listed as missing, and reference screenshots come from one screenshot per page, cut into screens on the Mac (`scripts/crop.swift`, exact — checked, including screens at the page's edge). Worked out from those changes, not yet measured: about 40 calls for the same 31-screen file — 2 for the structure, 1 for the tokens, a few for the inventory, 31 for the design data, 1 for the screenshots, plus image downloads. No agent after the import calls Figma.

- The design decides appearance; `PRD.md` decides behaviour. Conflicts are listed as ASSUMED in `CONTRACT.md` for you to check.
- The design changed? Run step 3 with `"refreshDesign":true` added.
- **Not tested:** the import has not run against a real Figma file yet. Checked: the connector (signed in, Pro plan, Full seat); the tools it calls and their parameters; Figma's design-to-code and figma-use guidance; and, in Figma's Plugin API index, the names it reads — `reactions`, local variables, paint and text styles, image fills. Not used: the page's prototype starting point (not in that index) — if the flows don't make the first screen obvious, it is asked upfront.

**Not tested:** this flow (version 0.2.x) has not run on a real app yet. It is checked by the state script's self-test, a simulation of every path of the workflow with fake agent results, and a read-through of every prompt. The previous, shorter flow did run (Invoice Maker, 61/61 criteria).

Put the requirements in the project folder as `PRD.md`, or any one file whose name contains "PRD" (e.g. `street view - PRD.md`; `pipeline.mjs prd` shows which file is used; two such files → the run asks you to rename one to `PRD.md`). Text you type after the command (`/app-factory:build-app no extra scope`) is passed to every agent as your note for the run; it is never read as a stage. Then, in the panel:

| Step | Type this | What happens |
|---|---|---|
| 1 | `/app-factory:build-app` | Looks for a Figma link in PRD.md. **None → it stops at once and the chat asks you for it** (paste the figma.com/design link under Other, or choose "No Figma design" to build from the PRD and its mockups) — before any contract work, so you never wait for a run that has no design. Then imports the Figma design. Audits the PRD and design for every gap — design (missing screens, states, images, icons, fonts, flows; colours the PRD names), logic (formulas, rounding, limits, field rules, dates, currency), functionality (each feature's inputs, rules, outputs, errors, limits), data and backend (where data lives, accounts, offline, backup, payments), **dependencies** (every key, endpoint or account a feature needs that the PRD doesn't give: the run searches for a free service that does the same job without a key and calls it once to prove it; then asks you — "free service for now" (recommended when one works: the feature works, with a short "free version for now" note and the provider's attribution), "not available until the key is added" (a banner on its screen or a short message when tapped), or type the key; in every case the key is read from one place, `lib/config/api_keys.dart`, so adding it later — `flutter run --dart-define=<NAME>=…` — switches to the real service with no code change; only behaviour that truly needs the real service is blocked), platform (versions, tablet, orientation, languages, dark mode) and scope. Writes a draft `CONTRACT.md` (with its user flows and Blocked sections; the questions go to `DECISIONS.md`) using the recommended answers. No code is written. |
| 2 | — | **The chat asks you only the most important questions** (at most 4) in one message: reply with an option number (the recommended one is first) or your own answer — e.g. the path of a file you put in `design/provided/`. **No reply in 5 minutes → the recommended options are used** (a `sleep 300` timer runs in the background; its end, not you, restarts the chat). The other questions use their recommended option without being asked. `DECISIONS.md` lists every question with its options, the selected one, and how it was chosen (you / no reply / not asked). This is the only time you are asked anything. |
| 3 | — (the chat starts it) | Right after your last answer, the chat runs `/app-factory:build-app` again with `"stage":"build"` and your answers. It applies them to the contract once, then runs everything below without stopping and without asking. If an agent must make a choice nothing covered, it decides, carries on, and records a `DECIDED` note you see at the end. The app is built with Flutter, for iOS and Android; for a native-iOS-only app add `"stack":"swiftui"` to step 1. |

What step 3 does, in order:

| Phase | Agents | Output |
|---|---|---|
| Design import | One agent, only when there is a Figma link and no import yet | `design/` |
| Build | **Interface** (one agent): the shared layer in Dart — models, every logic function as a typed stub, routes, `AppKeys` (every widget key), packages. Then **per feature group, three agents at once**: the logic builder (rules + unit tests), the UI builder (screens + widget tests, including every size, largest text, locale and dark mode — never walked on a device), and the **flow-test writer** (one device test per user flow, from the contract, while the app is being built). Each checks and commits only its own folders. Then the **integrator** wires what they left for each other, and the **gate** — scripts only, no audit: analyze, unit and widget tests, iOS and Android debug builds, `coverage`, `deps`, `colors`, `stray`. Up to `maxRounds` gate rounds; if it never passes, testing is skipped and the run ends `done: false`. Motion follows build rule U12 | Code, unit/widget tests, `integration_test/<group>_flow_test.dart` |
| App icon | Made in the interface step by `scripts/app-icon.mjs` from the icon file the contract names — never by hand. Upfront, the contract step inspects that file: not square, under 1024 px, or with transparent (pre-rounded) corners → a question, recommended answer "provide a 1024×1024 square, full-bleed icon". The gate and the final audit run `pipeline.mjs assets` | iOS `AppIcon.appiconset` (every size, opaque), Android `mipmap-*` + adaptive icon |
| Explore | One agent visits every screen once (by element, not coordinates) | What is missing or extra becomes a finding; no file |
| Test | Each round: **up to 3 iOS runners at once**, each in its own git worktree on its own simulator (`app-factory-iphone-17`, `-b`, `-c`; the count follows free memory), running their share of the flow tests; a runner fixes a wrong test, files an app bug to its owner, blocks what needs a missing key or platform API, and — round 1, with a Figma design — compares its share of the screens with the Figma references as its last step. Then the **Android runner** (one emulator) tests a snapshot **while** the logic, UI and shared fixers fix the iOS findings (fixers need no device). Fixers reproduce each bug with a unit or widget test first; a fix only a device can prove is marked pending and the next round's runner resolves it. **Rounds 2+ re-run only the tests whose code changed** (`pipeline.mjs affected`); a round with no code change is not run. No verify or re-check step | Findings, fixes, screenshots only where needed |
| Senior QA | Real-user journeys (first use, mistakes, 50+ records, every limit then upgrade, back navigation, this screen size and the largest text, interruptions, refused permissions, dark mode) **split across the iOS simulators**, then on Android what it does differently (first use, system back, font size 200%, interruptions, permissions, dark mode, no connection). Each scenario is recorded when done (`pipeline.mjs scenario`), so a tester restarted after a stall does only what is left. They file; the fixers fix; the next round re-runs only what changed | Findings |
| Final | **First, the forced design check** (QA skill section 7): every screen with a reference — a Figma frame, or a mockup the PRD gives — is run on a simulator of the frame's exact size with the status bar set to 9:41, screenshotted and compared pixel by pixel (`scripts/screen-diff.mjs`: every differing region in points, with a design-vs-app crop); **every component of the design is checked present one by one** — `scripts/design-components.mjs` lists the frame's texts (exact strings), images, icons, buttons, fields and bars, the app's element list matches the texts, and the auditor records each remaining one as present (with evidence), missing (with its finding) or excluded (with the contract line); every bar (status, navigation, tab), every button (text, icon, size within 2 pt, colours, radius, states) and every FLOWS.md transition (kind and duration, in the code) is checked; each difference is a finding the audit fixes and re-checks on that screen only; `pipeline.mjs design-check` must pass — and after the final audit **a separate agent runs `design-check` and `assets` again; the run is not done unless both pass**, so this audit cannot be skipped. Then **one final audit that fixes** (there was no audit after the build): weak tests (break-it probes), every build-skill rule, anything missing, code no criterion accounts for — each change with a test that failed before it; then — Flutter, only when testing passed — the optimisation (unused and heavy packages, dead code, unused assets, slow logic; behaviour unchanged), only the affected device tests, the gate once, statuses, size. Then lessons, the run report and cleanup | Sections of `PROGRESS.md`: size, lessons, run report, cleanup |

Optional arguments for step 3: `"parallel":false` (one builder per group instead of three agents at once; testing stays parallel), `"maxRounds":N`, `"maxTestRounds":N` (default 3).

**Not tested:** the chat asking the questions, its 5-minute timer and starting the build from a real run (a background command's end notice reaching the chat was checked in this editor), and typing the `{…}` arguments in the panel. Until now they were passed inside a sentence, which works: `Run /app-factory:build-app with args {"stage":"build"}`. Use that form if the direct one is rejected.

## 5. Watch it

- **Agent tree:** type `/workflows` in the panel.
- **Run time:** the top of `.pipeline/PROGRESS.md` shows the timeline — when the run started, when it paused for your questions and when it resumed, any interruption (a call that died, then a new one; counted when nothing was logged for 30 minutes), and when it ended — with the totals: elapsed, working (elapsed minus the pause and interruptions), paused for questions, interrupted. Below it, a table of every phase's first and last activity and its time spent (the time spent adds up to the working time; first and last activity span several rounds because rounds reuse the phase names). The same totals line is in the run log at the end and in the result (`runTime`). `node /Users/mach/testing/app-factory/scripts/pipeline.mjs timing` prints it at any time from the project folder.
- **Live log:** open `.pipeline/PROGRESS.md` in the project. It is rewritten at every step and shows the activity, the criteria passing, the open findings and the latest screenshots.
- **The app:** Simulator windows open when exploring starts; during the test rounds and senior QA up to three iOS simulators run at once, and the Android emulator opens as its own window during the Android runner.
- **Project files:** only the app, its tests, `CONTRACT.md` and `design/`; `git log --oneline` shows one commit per step (per agent and group while building — `pipeline.mjs affected` uses them).
- **Measure it:** at the end the run report is saved into `PROGRESS.md` (per-agent times, how much ran in parallel, where the time went, tokens). Any time: `node /Users/mach/testing/app-factory/scripts/run-report.mjs <project folder>`.
- **Permission prompts:** the panel asks before running commands, depending on your permission mode. The run waits until you answer.

The run is finished when the workflow result says `done: true`: the gate passed, senior QA ran, the final audit passed, the separate re-run of `design-check` and `assets` passed, no critical or major finding is open, and Android ran when the contract includes it. Blocked criteria are listed, not failed. If it says `done: false`, it hit a round limit, a step failed, or a round would have re-run nothing; the open findings are in `PROGRESS.md`.

For scale: Live Street View v3 (54 criteria, Flutter, iOS + Android) took 17 h 13 min on 0.16 with everything run one agent at a time — 69% of it in testing (the audit of that run is the basis of 0.18.0). The 0.18.0 flow has not been timed yet; its run report will show it.

### Stop a run in the middle

Type `/app-factory:stop` **in the chat that started the run** (a workflow can only be stopped from the session that started it). It:

1. stops the workflow (Claude Code also signals its agents' running processes);
2. runs `pipeline.mjs stop`: records the stop in the run's timing ("stopped by the user", counted apart from questions), shuts down the plugin's own simulators and emulators if this run held them — deleting none, touching no other device — and releases the shared device lock and the project's run lock, so neither another project nor a new run here waits on a dead run;
3. keeps the code and its git history, `.pipeline/` state, test worktrees and branches, and screenshots.

To continue later, say "continue the app-factory run" in the same chat: `pipeline.mjs resume` takes the locks back, then the workflow is relaunched with its run ID — finished steps return their saved results and only the steps that were running start over. A run stopped in a chat that has since been closed cannot be continued; `/app-factory:build-app` starts over. If you stop a run with `/workflows` → `x` instead, also type `/app-factory:stop` afterwards, or its locks stay held.

## 6. After you change the plugin

1. Check it: `node scripts/pipeline.mjs selftest`, `node scripts/firewall.mjs selftest`, `node scripts/run-report.mjs selftest`, `node scripts/assets.mjs selftest`, `node scripts/app-icon.mjs selftest`, `node scripts/screen-diff.mjs selftest`, `node scripts/design-components.mjs selftest`, and — after changing the workflow — `node scripts/simulate.mjs` (it compiles the workflow the way Claude Code does and runs every path with fake agents; it must print no FAIL). `node --check` is not a check here: it passes this file even with a syntax error in it.
2. Raise `version` in `.claude-plugin/plugin.json`. An unchanged version number is skipped.
3. Type `/install-app-factory` again in each project's window.
4. Reload that window and start a new chat.

## 7. Problems seen on this machine, and the fix

| Symptom | Cause | Fix |
|---|---|---|
| `/app-factory:build-app` not in the `/` list | The chat was opened before the install | Start a new chat, or reload the window (Cmd+Shift+P → "Developer: Reload Window") |
| Plugin change has no effect | Version number was not raised | Section 6 |
| Tester reports mobile-mcp tools missing | Same as the first row: the session started before the plugin was enabled | New chat |
| `Agent is not installed on the device` | First use of a new simulator | The tester runs `npx -y mobilecli agent install --device <udid>` itself; no action needed |
| A custom font shows as MISSING | The Figma MCP cannot download font files | Put the font files in `design/provided/fonts/` and answer the font question with that path; otherwise the platform font is used |
| Design import fails at once with "tool call limit on the Starter plan" | The file belongs to a Starter team (20 Figma calls a month for the whole team), and that allowance is used up — waiting a minute does not help | Use a copy of the file on a team where your account has a Full or Dev seat, and pass its link: `{"figma":"https://www.figma.com/design/…"}` (or replace the link in `PRD.md`) |
| Design import returns "failed" with a rate-limit error | The Figma account's per-minute or daily limit was reached | Wait (a minute, or until the next day for the daily limit) and run again with `"refreshDesign":true` |
| Build stops at once: "the shared test devices are in use by <project>" | Another project's build run holds the device lock — or that run died | Wait for it to finish. If it is dead: `node /Users/mach/testing/app-factory/scripts/pipeline.mjs devices status`, then delete `~/.app-factory/devices.lock` |
| Run aborts at once with "another run holds …RUN.lock" | An earlier run in this project was killed | Delete `your-project/.pipeline/RUN.lock`, then start again |
| Tester files bugs that do not reproduce | Data left in the app from an earlier test step | Fixed in the plugin: testers start from a fresh install and must reproduce on one before filing |
| UI tests fail at random | Two runs on this Mac at once (load reached 75–130) | Run one project at a time |
| A folder `<project>.worktrees/` stays next to the project | A run was stopped before its final step (the final step's cleanup removes it) | In the project: `git worktree prune`, then delete that folder |
| Merge step reports a branch "not merged" | A tester changed files outside its folders | Nothing to do: the change was rejected and filed as a finding; the next round fixes it properly |

## 8. Remove

`claude` is not on PATH on this Mac. Use its full path (also printed by `install.sh` on its `claude :` line):

```sh
CLAUDE=~/.vscode/extensions/anthropic.claude-code-2.1.283-darwin-arm64/resources/native-binary/claude
cd /path/to/your-project
$CLAUDE plugin uninstall app-factory@app-factory-dev --scope project   # each project
$CLAUDE plugin marketplace remove app-factory-dev                      # once, after the last project
rm -r ~/.claude/skills/install-app-factory                             # the personal install command
```

The per-project uninstall was run on 5 folders during a cleanup. **Not tested:** `marketplace remove` and the `rm` line.

## 9. Devices used for testing

All projects share **one set of devices**; no project gets its own. A run creates the devices it needs and **deletes them when it ends** (see section 9c), so they take no disk space between runs; the next run creates them again (measured: an iPhone 17 simulator, created and booted for the first time, 58 s and 598 MB; an Android emulator's first boot, 23 s). Each per-project simulator cost about 2–2.5 GB (six of them, from runs before 0.10.0, used 13 GB on this Mac, which has 29 GB free). Only one project's build-and-test run can use the set at a time: a machine-wide lock (`pipeline.mjs devices claim/release/status`, file `~/.app-factory/devices.lock`) is taken at the start of a build run and released at its end. A second project's build waits with a message naming the holder; contract-only runs don't need the lock. The 8 GB of memory makes one run at a time necessary anyway.

| Size | iOS simulator (name) | Android emulator (name, profile) |
|---|---|---|
| standard (automated tests run here) | `app-factory-iphone-17` — iPhone 17 | `af-standard` — `medium_phone` |
| smallest and largest iPhone (parallel runners, senior QA) | `app-factory-iphone-se` — iPhone SE (3rd generation), 375×667, home button; `app-factory-iphone-17-pro-max` — iPhone 17 Pro Max, 440×956 | — |

**A connected phone is used, beside the simulators.** At the devices step `pipeline.mjs devices real` lists the phones connected right now (adb: a real serial in state "device"; iOS: `devicectl` tunnel "connected", Developer Mode on; an iPad only when the contract has tablets). A connected iPhone takes one share of the iOS flow tests while the simulators run the rest; a connected Android phone runs the Android flow tests in the same batch, at the same time (the emulator then is not started), and the Android senior QA tester works on it at the same time as the iOS testers, on an APK built once. The simulator count leaves room for the phone builds (4.2 GB for an Android build — measured peak 4,166 MB; 1.2 GB for an iPhone test build — an estimate), and Gradle's daemons (about 3.7 GB idle) are stopped after each Android build. A phone is the user's: never reset or wiped; an Android phone's own settings (font size, dark mode, Wi-Fi, mobile data, rotation) are saved first and put back at release or stop (`pipeline.mjs phone save|restore`). A phone that cannot be used (locked with a code, unplugged, unauthorized) runs nothing: its tests move to a simulator (iPhone) or the emulator (Android). The iPhone is signed with the team `flutter create` wrote into the project (checked on this Mac: a device build signed by team W878B329PR, whose profile includes the paired iPhone XR and iPhone 11). Senior QA by hand stays on simulators for iOS.

So the flow tests and senior QA run on the smallest, a standard and the largest iPhone the installed iOS 26.1 runtime supports (checked with `pipeline.mjs design-device`). How many runners run depends on free memory: 3 → all three sizes, 2 → iPhone 17 and SE, 1 → iPhone 17 only. Every other size, the largest text, the keyboard, locales and dark mode are covered by the layout tests (build rules U15, T3).

Every step that uses a device — exploring, the test runners on both platforms, senior QA — runs as the plugin's tester sub-agent (`agents/tester.md`), so the same device rules apply to all of them and lessons about devices go into its memory. If that agent type can't be loaded, the step runs as a plain agent with the same instructions and logs that. The plugin never touches a simulator or emulator outside the set.

Checked on this Mac: all four iOS types run on iOS 26.1; an emulator on the `medium_phone` profile was created and booted in 28 s and Flutter saw it. With it running, free memory fell to about 57 MB — so the iOS pass runs first, then the Android pass with one emulator at a time, each stopped when its tester is done.

**Android runs whenever the contract includes it, and the run cannot finish as done without it.** If the emulator can't be set up, doesn't boot, or its tester runs no cases, the result is `done: false` with the reason in the log — Android is never skipped silently. When the PRD itself rules Android out (for example an app built on Apple-only features), the contract says iOS only and there is no Android pass; that is not a failure. Before an emulator starts, the tester makes room, only with the plugin's own devices: for **memory** it shuts down every booted `app-factory-…` simulator and every running `af-…` emulator. That frees RAM only — **nothing is deleted from disk**: every simulator and emulator stays installed and boots again later. For **disk** it only checks that 6 GB is free; if not, the run reports it as a critical finding and you free the space yourself. It never shuts down or deletes your own simulators and emulators. An emulator that still won't boot after one retry is a critical finding.

Without a simulator, every screen also has layout tests (build rule T3, helper `test/ui/fits_screen.dart`) at 320×568, 375×667, 402×874, 411×914, 440×956 and the design frame's own size (a tablet and landscape only when the contract has them): at normal text nothing overflows, every keyed element scrolls into view inside the screen, every tappable one sits inside the safe area, and no text is cut off; at the largest text of each phone (×3 on iPhones, ×2 on Android — its largest font size is 200%) nothing overflows and everything is reachable; with the keyboard open on the iPhone SE every field scrolls above it (only the fields are checked then). Two tap targets count as overlapping only when one Row, Column, Stack or Wrap places them, and text is checked only where it is on screen. Checked with Flutter 3.47.7 in a scratch app (2026-10-20): a correct form passes on every size and with the keyboard; a FAB over a list, a Save button under the open keyboard, a long text on a hidden tab and a button padded by the bottom inset now pass (the previous helper failed all four); two buttons a Stack draws over each other, a button under the home indicator and an ellipsis fail. Every failure starts with `<case> text ×<scale>:`.

## 9b. Ads

Every Flutter app gets ads + Remote Config by default, whether or not the PRD mentions ads; only a PRD (or a run note) that says the app has no ads leaves them out, and CONTRACT.md section 9 then quotes that line. The contract maps the app's screens to the placement table of `skills/flutter-ads/SKILL.md` and writes CONTRACT.md's "Ads" section, one criterion per placement. Every app gets the same pattern — the team's common flow, tested in the guide app `common_flow_demo`:

- **Where:** splash — interstitial (or app open, by a Remote Config flag), waiting at most 8 s; onboarding — one small native at the bottom; home feature taps — interstitial on every tap or every second tap (Remote Config); inner screens without a text field — a bottom banner (adaptive or collapsible); closing Premium from inside the app — interstitial; coming back to the app — app open (not after share, review, store or purchase, not on Premium); rewarded where the PRD has a reward. Nothing on rating, settings, legal pages, Premium itself or home's buttons and tab bar.
- **Remote Config:** one JSON parameter (`<app>_v1`) holds every ad id (HIGH and NORMAL), every on/off flag, the waits, the native ad colours and Facebook's id/token; `assets/remote_config_default.json` is used until it arrives or when Firebase is not set up. Any id set to `"11"` switches that ad off.
- **Install:** `scripts/ads-install.mjs` copies `lib/google_ads_material/` and its tests and patches Android and iOS (native-ad factories, App IDs, Facebook); the app only calls its API.
- **An app that is already built** (or was built without ads): type `/app-factory:ads-implementation` in its window. It stops unless the git tree is clean and a device (a connected phone, unlocked, or the plugin's own emulator or simulator) is there; explores the entire app — every screen and tap from the code, then every screen on the device — and places each ad by the pattern's table (no questions); installs and wires it, adds the criteria and their tests in an app-factory project, runs analyze, every test, the builds, the device tests and a walk through every placement on the device, then commits locally (never pushes) and reports the app map, the placements and what was and was not verified.
- **IDs:** debug builds always use Google's demo ad units for the running platform; a release build never serves a demo unit — the owner puts the real ids in Remote Config (and the defaults JSON) and replaces the sample App IDs.
- **Premium:** the moment it is on (purchase, restore, or the store's answer at launch) every ad id becomes `"11"`: nothing loads or shows, and at launch consent and the ad SDK are skipped.
- **Tested:** the template's unit tests and device tests (real SDK, Google test ads), plus each placement and one Premium journey in the app's flow tests.
- **iOS builds** with this pattern need Xcode 26.2+ (Firebase's Swift package requires Swift 6.2.3); built and tested with Xcode 27.0. After an Xcode update, its license must be accepted (`sudo xcodebuild -license accept`, by you) — until then `git`, `xcrun` and Flutter refuse to run.

## 9c. Cleanup at the end of a run

The run's last step runs `pipeline.mjs cleanup` (a script, not an agent); its report — everything deleted, its size and why, plus anything it left — is the Cleanup section of `PROGRESS.md`. It deletes only this list:

| Deleted | Why it is safe |
|---|---|
| Test worktrees `<project>.worktrees/*` | their changes were merged, or filed as findings |
| `build/`, `.dart_tool/`, `coverage/`, `ios/build/`, `ios/Pods/`, `android/.gradle/`, `android/build/`, `android/app/build/` | build output and caches, every one git-ignored; the next `flutter` command makes them again (on Live Street View they were 14.7 GB; `ios/Pods/`, kept until 0.29.1, was another 169 MB there). `ios/Pods/` comes back on the next iOS build: Flutter runs `pod install` when `Pods/Manifest.lock` is missing |
| `.pipeline/probe-backup/` | copies made by the audit's break-it probes |
| Untracked `*.bak`, `*.orig`, `*.rej`, `*.tmp`, `*.swp`, `*~`; `.pipeline/tool-output/` | backup and temp files, and command outputs the firewall cut; any other untracked file is listed, not deleted |
| Only when the run is done: `.pipeline/screenshots/` and the `qa-r*` branches | a run that is not done keeps them as evidence for its open findings |
| API keys **in the coding agents' context only**: every stored value (and Flutter's base64 copy of it) is overwritten with `*` (same length, in place) in this project's Claude Code transcripts and temp output — the chat, every agent, every test worktree — and in the run's `.pipeline/` records (`secret forget`) | the run is over, so no agent needs to see a key again. **The app keeps its keys**: the secrets file `~/.app-factory/secrets/<id>.json`, `android/local.properties`, `ios/Flutter/Secrets.xcconfig` and the code are not touched — build and run it with `flutter run $(node "<plugin>/scripts/pipeline.mjs" secret define)` |
| The `app-factory-*` simulators and `af-*` emulators (stopped first) | only while this project holds the device lock; no other simulator or emulator is ever touched |

It keeps the app's source and tests, PRD.md, CONTRACT.md, `design/` (with the originals), git history, and `.pipeline/` state and PROGRESS.md (with its size, lessons, run report and cleanup sections). During testing, devices are never deleted to make room — only shut down (section 9).

## 9d. API keys

- **Give a key without the chat seeing it:** in a terminal in the project directory, `node "<plugin>/scripts/pipeline.mjs" secret set MAPS_API_KEY`, paste the key, Return, Ctrl-D; then answer the key question with "provided". Pasted in the chat instead, the chat stores it the same way and passes only "provided" on; an answer that looks like a key stops the run before any agent starts.
- **Where it lives:** one file outside the project, `~/.app-factory/secrets/<id>.json` (mode 600). Builds and device tests read it with `--dart-define-from-file`; a native SDK key is written by `secret native` into the git-ignored `android/local.properties` and `ios/Flutter/Secrets.xcconfig`. No command prints a value (`secret names` shows names and lengths).
- **A key written in PRD.md** is imported before any agent reads PRD.md (`secret import`, which finds the PRD file by name): it is stored in the secrets file under a name from its line ("Google Maps API key: AIza…" → `GOOGLE_MAPS_API_KEY`), used like any stored key, and every read of PRD.md shows `‹GOOGLE_MAPS_API_KEY›` instead of the value. PRD.md itself is left as you wrote it and added to `.gitignore` (if git already tracks it, the run warns: the key is in history — replace it). The end-of-run cleanup masks every other copy but leaves PRD.md, so the next run imports it again. Found: Google, OpenAI/Anthropic, Stripe, AWS, GitHub, Slack and Mapbox key formats, and any "API key / secret / token: <value>" line with a value of 20+ letters and digits; a key in another form is not found — store it with `secret set` instead.
- **A key found while coding** (in code, a config file, or a ‹NAME› an agent copied) is put in its proper place by `secret move` in the gate: stored, and the file rewired — Dart reads `ApiKeys.<name>` (`lib/config/api_keys.dart`), `AndroidManifest.xml` gets `${NAME}` filled from the git-ignored `local.properties` (a line added to `build.gradle.kts`), `Info.plist` gets `$(NAME)` and Swift reads it from Info.plist, filled from the git-ignored `ios/Flutter/Secrets.xcconfig`. Firebase's `google-services.json` / `GoogleService-Info.plist` are left as they are ("API keys for Firebase services are OK to include in code or checked-in config files" — firebase.google.com/docs/projects/api-keys). Any other file type gets `‹NAME›` and the gate fails until the code reads the key properly. Checked in a Flutter 3.38.5 app with a key in Dart, the manifest and AppDelegate.swift: after the move, `flutter analyze` is clean, the debug APK's merged manifest and the simulator app's Info.plist carry the key, and at the end `forget` masks it in the agents' transcripts and `.pipeline/` while the app keeps it in `local.properties`, `Secrets.xcconfig` and `DART_DEFINES`.
- **No agent sees it:** the hook replaces a stored value or a known key format with `‹NAME›` in every Bash, Read and Grep output in the project (the chat and the agents); `secret scan` (gate and final checks) fails on a key in any file.
- **After the run:** the keys are removed from the coding agents' context only (table above); the app keeps them and builds with them as before. The chat you ran it in still holds a pasted key in its memory until it ends: start a new chat for the next work.
- **Fewer paid calls** (build skill L13, T8): CONTRACT.md's "API calls" table gives each user action one request with exactly the fields the screens use (a field mask where the API has one), a cache for as long as the API's terms allow, debounced typing with a session token where the API bills per session, retries only on 429/5xx; each row has a test that counts the requests. Tests use recorded fixtures, never the paid API.

## 9e. Notifications

The plugin's own hook (`hooks/hooks.json` → `scripts/notify.mjs`, in the background) sends a desktop notification in every project the plugin is installed in:

| When | Message |
|---|---|
| A permission prompt, a question dialog, or an agent needs your input | Claude Code's message |
| A question dialog opens | the question |
| app-factory asks its questions in the chat | "app-factory: questions are waiting — no reply in 5 minutes uses the recommended options" |
| Claude finishes | "Finished — ready for your review" |

macOS: alerter if installed (`brew install vjeantet/tap/alerter`; clicking it brings VS Code forward), otherwise the built-in notification; nothing is sent while VS Code or a terminal is the front window. Linux: `notify-send`. Windows: a PowerShell balloon. Without any of these, nothing is sent and nothing fails.

It stays quiet while your own `~/.claude/settings.json` runs a notification hook (`attention.sh` or `notify.mjs`), because Claude Code runs plugin and settings hooks side by side and you would get each notification twice. On this Mac the old `attention.sh` entries were removed from `~/.claude/settings.json` on 2026-10-09, so the plugin's hook is the one that runs — in projects with the plugin only; other projects no longer get notifications. `scripts/attention.sh` is no longer used by anything.

## 9f. Safety guard: no system-level commands

The plugin's `PreToolUse` hook (`hooks/hooks.json` → `scripts/guard.mjs`) checks every Bash command in an app-factory project — the chat and every agent — before it runs, and refuses the ones that can freeze or crash the computer, or kill and delete what is yours:

| Kind | Refused |
|---|---|
| Root | `sudo`, `doas`, `pkexec`, `su` |
| Power | `reboot`, `shutdown`, `poweroff`, `halt`, `init 0/6`, `systemctl` (except `status`/`show`/`is-active`/`list-units`), `loginctl terminate…`, `launchctl reboot`, System Events restart |
| Kernel memory | `drop_caches`, `sysrq`, any write into `/proc` or `/sys`, `sysctl -w`, `swapoff`, `swapon`, `mkswap`, `purge` |
| Processes | `pkill`, `killall`, `xargs kill`, `kill` of -1, 0, 1, a process group or a computed list (`$(pgrep …)`). Allowed: `kill` of a literal pid, one variable (`$!`, `$PID`) or a job (`%1`) — an agent's own background process |
| Disks | `rm -r` of `/`, `~` or `$HOME`, `--no-preserve-root`, `mkfs`, `fdisk`, `dd of=/dev/…`, `chmod/chown -R /`, a fork bomb |
| Devices | `simctl delete/erase`, `simctl shutdown all`, `avdmanager delete`, and `rm` of `~/Library/Developer/CoreSimulator` or `~/.android` (every simulator's and emulator's files) — only `pipeline.mjs cleanup` and `device-reset` delete devices, and only the plugin's own |

What the agents do instead: free memory only by stopping the plugin's own devices (`app-factory-…` simulators, `af-…` emulators); a stuck app or device → `pipeline.mjs app-restart`, then `device-reset`, which stop only `flutter test` processes for that device (matched by its exact id and the flutter tool, never the agent's own shell). Before an emulator starts, `pipeline.mjs freemem --need 2500` fails on Linux and Windows when less memory is available (the emulator alone takes 2 GB: `hw.ramSize=2G`) — nothing is started and a critical finding is filed. On macOS it only reports, because macOS compresses memory (v4 ran the emulator at 1,839 MB free). Unit and widget tests run with `-j 4`: without it `flutter test` starts one test process per two CPU cores, and up to three agents test at once.

Other projects and your own chats outside app-factory projects are not checked. `node scripts/guard.mjs selftest` tests it.

## 10. Why a simple app is big

Measured on this Mac: a brand-new Flutter app's release APK for current phones (arm64) is **14.8 MB**. Of that, 11.1 MB is the Flutter engine and 2 MB the Flutter framework, which every Flutter app carries; the app's own code was 2 KB. Removing the default `cupertino_icons` package (an icon font the app did not use) saved about 114 KB. A **debug** build is far bigger (172 MB for the Invoice Maker pilot) because it carries the debugging compiler and code for three processor types — it is never the size users download. The optimisation in the final audit can only shrink what is not fixed: packages, assets and fonts, and the app's own code.

## 11. Limits

- Simulators and emulators only, no physical phones.
- **Not yet run on a real app:** the 0.18.0 flow. It is checked by `scripts/simulate.mjs` (every path with fake agents) and the self-tests. Not measured yet: three simulators running while three Xcode builds compile on 8 GB (the runner count follows free memory), and whether the output firewall saves more than the extra targeted reads it causes — the first run report shows both.
- Android: one emulator at a time, never alongside the iOS simulators (8 GB: with one emulator running, free memory fell to about 57 MB). It runs alongside the fixers instead.
- Parallel building and testing need the Flutter stack. With the native iOS stack: one builder, one runner, one fixer.
- The plugin folder must stay at `/Users/mach/testing/app-factory`, or `ROOT` in `workflows/build-app.js` must be changed to match; `install.sh` refuses to run if they differ.
- No Figma check.
- Testing never adds scope. A tester's idea that no criterion, field-table row, PRD line or skill rule backs (better wording, an extra confirmation, a feature) is filed as a minor `PROPOSAL`: it doesn't block the run and isn't built. Read them in `.pipeline/PROGRESS.md` after the run.
- No dark theme and no landscape layout unless `CONTRACT.md` asks for them: by default the app is light-only (readable in system dark mode) and portrait-only.
- **Not tested:** what happens when the Max plan usage limit is reached during a run.
