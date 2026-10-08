# Where app-qa/SKILL.md comes from

Built 2026-10-01 from the user's design; restructured 2026-10-06 (0.18.x) to: explore → flow tests on parallel runners with fixers → senior QA → final audit (with the forced design check, section 7). No post-build audit and no verifier step (removed at the user's request after the v3 timing audit). Evidence below.

| Rule | Source |
|---|---|
| E1 expected result from the contract, not the app | A tester that copies observed behaviour turns an existing bug into the expected result |
| E2 fresh install before filing | invoice-maker run 1, round 2: three false paywall findings (AC32/AC35/AC36) caused by PRO left on by the tester's own AC37 step; disproved only in round 3 |
| F2 "rule correct in the logic but never called from its screen" | invoice-maker-par integrator: Export bypassed the share limit; logic was correct, the screen never called it |
| F1 break-it probe | app-factory auditors since the tip-calculator pilot; caught a test that could not fail (invoice-maker X2, AC45) |
| Section 3 techniques (equivalence class, boundary value, state transition, decision table, error guessing) | Standard black-box test-design techniques |
| Section 4 owner by cause; finding outside your scope is filed, not fixed | Kimi Code tower, `kimi-code-main/packages/agent-core-v2/src/features/tower/tools/finding/finding.md`: "fixing it directly would violate scope isolation" |
| Section 5 scope check before a change is accepted; parallel testers in separate worktrees | Kimi Code tower, `towerService.ts:297-302` (writes outside a worker's own worktree are denied); enforced here by `pipeline.mjs scope` and the merge step |
| Good and bad finding examples | invoice-maker X5 (real, fixed) and the false AC36 finding |
| Section 8 senior QA, real data volume | No app-factory run tested more than a handful of records |
| Lessons step (workflow) | Hermes background review (`hermes-agent-main/agent/agent_init.py:1311`, `agent/turn_finalizer.py:736-760`) — changed to a visible, end-of-run step that only proposes rules for the user to approve |
| Section 7 design check (screen-diff, component inventory, bars, buttons, transitions) | User's report of defects the audit did not catch against Figma (Live Street View v2); `scripts/screen-diff.swift`, `scripts/design-components.mjs`, `pipeline.mjs design-check` |
| Section 6 "Missing keys are not blocked" | User's rule (2026-10-06): a feature without its key uses a free service or shows "not available", and is tested in that behaviour (build skill L12) |
| E7 nothing finished runs again; `P affected` | v3 run audit (`scripts/run-report.mjs`): passed tests re-run in every round |
