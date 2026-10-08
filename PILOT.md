# Pilot test plan (written before the first run)

Goal: decide, on evidence, whether the plugin approach is good enough or whether a custom agent is justified.
App under test: `../pilot-tipcalc/PRD.md` (one-screen Tip Calculator, 3 exact acceptance examples). This folder is deleted — see Cleanup below.

## Tests and pass bars

| # | Test | Pass bar | How it's checked |
|---|---|---|---|
| T1 | Command appears in the VS Code panel | `/app-factory:build-app` shows in `/` autocomplete and starts | User, in a panel session opened on `pilot-tipcalc/` |
| T2 | Runs end to end without re-prompting | Reaches the Test phase with zero human messages (permission approvals counted separately) | Workflow result + /workflows view |
| T3 | Context moves through `.pipeline/`, not chat | Auditor findings appear in the next builder's `brief`; every phase wrote a handoff | `.pipeline/state.json` |
| T4 | The audit gate is real | Auditor re-ran the tests itself; a `fail` verdict caused a fix round; loop stopped on `pass` or the cap (3) | Workflow result (`reranTests`, rounds) |
| T5 | Simulator check | App installs and launches; at least one screenshot saved; mobile-mcp worked or its failure is recorded | Workflow result + `.pipeline/screenshots/` |
| T6 | Chat path routes to the tester | In a fresh panel chat, "take a screenshot of the tip calculator" is delegated to `app-factory:tester` (visible in the agent map) | User |
| T7 | Cost and time recorded | Wall time and tokens per phase noted from /workflows; Max usage before/after noted from /usage | User + result |

## Decision rule (fixed now, applied after the run)
- **Plugin approach is confirmed** if T1–T6 pass, or a failure is a prompt/script bug fixable in the plugin (fix, re-run once).
- **Custom agent is justified** only if a failure is a platform limit the plugin surface cannot work around (e.g. T1: workflow commands not invocable from the panel; T2: runs cannot complete unattended), or T7 shows cost you judge unacceptable.
- T7 has no baseline yet. For a fair efficiency comparison, run the same PRD once in a plain Claude Code chat ("Build the app in PRD.md") and compare time, tokens, and whether its result passes the same 3 acceptance examples.

## Results (2026-09-29, verified independently: unit tests re-run, code and state inspected, screenshot checked)

| # | Result | Evidence |
|---|---|---|
| T1 | PASS | `/app-factory:build-app` listed in the panel and launched a real run at 12:47:55 |
| T2 | PASS | Panel run and scripted run both finished with no human messages mid-run (permission prompts not counted) |
| T3 | PASS (run 2) | Auditor filed X1–X4 in `.pipeline/`; round-2 builder read them from its brief and fixed the root cause (Calculator.swift:26) |
| T4 | PASS (run 2) | Planted rounding defect (auditor not told) → audit failed (17/21 unit tests) → fix round → re-audit 21/21 + 4/4 UI, verdict pass |
| T5 | PASS, with setup | App installs/launches on a dedicated simulator; UI driven and screenshotted. mobile-mcp tools load only in a session where the plugin is enabled (worked in the panel run); `mobilecli agent install` needed once per simulator |
| T6 | open | needs the user |
| T7 | recorded | Run 1: 4 agents, 211k tokens, 32.5 min (slowed by a concurrent run on the same simulator). Run 2: 7 agents incl. the planted-defect agent, 305k tokens, 17.6 min, 2 rounds. No plain-chat baseline yet |

Bugs found and fixed in the plugin: concurrent runs collided (now `claim`/`release` lock + a dedicated simulator per run); ambiguous simulator name (now an exact id from the brief); mobile-mcp device agent (tester installs it); tester typing/screenshot gotchas.
Design gap found in the pilot: the contract agent made 16 "ASSUMED" product decisions with no human approval step. Since closed: with no args the command now writes CONTRACT.md and stops for approval; `{"stage":"build"}` builds only from the approved contract, and a re-run never overwrites it (both verified in `stage-test/`, now deleted — see Cleanup below).
Decision so far: no platform limit found — plugin approach confirmed; custom agent not justified by this evidence.

## Undo
- `claude plugin uninstall app-factory` (project scope), then `claude plugin marketplace remove app-factory-dev`.

## How runs are started (rule set by the user, 2026-09-30)
Every run is started from the Claude Code panel in VS Code, opened on the project folder, so the agent tree (`/workflows`), each agent's commands and the Simulator window are visible while it works. No headless or detached runs: no `claude -p`, no `nohup`, no queue scripts. Every agent prompt carries the same rule (foreground commands only, nothing left running).

- Contract: `/app-factory:build-app`
- Build after approving CONTRACT.md: `/app-factory:build-app {"stage":"build"}` (Flutter is the default stack; parallel build and testing are the default since 0.18.0)
- Live log: `.pipeline/PROGRESS.md` in the project folder.

History: three earlier pilot runs were started headless with `claude -p` (stage-test, invoice-maker run 1, invoice-maker-par). `claude -p` kills background work after 600 s unless `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` is set; that setting is no longer used.

## Cleanup (2026-09-30)
Deleted at the user's request: the pilot app folders `pilot-tipcalc/`, `stage-test/`, `weather-app/`, the two stopped runs `invoice-maker-par/` and `invoice-maker-skills/`, and their simulators. The results above are the record of those runs; their files no longer exist. Kept: `invoice-maker/` (serial run, 61/61 criteria, source + contract + screenshots + state) and its simulator.
