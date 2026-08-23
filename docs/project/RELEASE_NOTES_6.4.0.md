---
title: Release Notes 6.4.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.8-24a8210
last_verified: 2026-08-23
source_of_truth: git history on main, package.json, src/modContent/autoCraftController.ts, src/modContent/autoCraftExecutor.ts, src/optimizer/outcome.ts, src/optimizer/search.ts, src/settings/index.ts, crates/craftbuddy-engine/src/lib.rs, crates/craftbuddy-engine/src/outcome.rs
review_cycle_days: 90
related_files:
  - docs/project/RELEASE_NOTES_6.3.1.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/ARCHITECTURE.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/RELEASE_PROCESS.md
---

# Release Notes 6.4.0

CraftBuddy 6.4.0 does two things: it stops auto mode from dying when the game
quietly ignores a technique, and it lets you say how ambitious a craft should
be instead of always playing to the tier's bare requirement.

## Fixed

### Auto mode survives a technique the game never registered

- Auto mode dispatches one action and then waits for the live craft to move.
  When no snapshot carrying that action arrived in time, the wait timer treated
  the silence as proof of failure and ended the run with
  "Controlled Forging did not change the live craft state in time. Auto mode
  stopped to avoid duplicate inputs." A buff-only support technique routinely
  triggers this: the live craft has already advanced while CraftBuddy is still
  holding the pre-action snapshot.
- The timeout now decides what the silence actually means. It re-reads the live
  craft signature through `verifySnapshotState()` and branches three ways:
  - the signature already moved → the action landed, so the run resumes
    (`resumeAfterLateStateAdvance`). The executed fingerprint stays marked as
    scheduled, so a lagging snapshot cannot re-dispatch the action that just
    succeeded.
  - the signature is unchanged → nothing landed, so the action is resent
    exactly once (`MAX_STATE_ADVANCE_RETRIES = 1`).
  - the signature is unreadable → it proves nothing and must never be retried.
- If the resend is also ignored, or the state was unverifiable, auto mode now
  degrades to a **recoverable armed pause** (`pauseAfterRejectedAction`) instead
  of a dead error state. It stays armed but idle on the fingerprint it could not
  move, so the player can act manually, stop, or simply let the next real craft
  change resume the run — no restart required.
- The dispatch-time rule is unchanged: the live signature is still re-read
  immediately before acting, `StaleCraftStateError` still recalculates and
  `UnverifiableCraftStateError` still pauses. The retry only ever runs with a
  `match` verification in hand, so it cannot double up on an accepted action.

### The DOM fallback finds renamed techniques

- `buildSearchAliases` in `autoCraftExecutor.ts` now also indexes the
  player-facing label from `techniqueDisplayName()`. The game renames some
  techniques for display — internal `False Fusion` renders as
  "Strive for Completion" — and the fallback only knew the internal spelling,
  so it could not find the button it was meant to click. Keys and lookups still
  run on `name`; only the search aliases gained the display spelling.

## Added

### Ambition targets: how far past the tier should the craft go

Two new settings, both integers in `0..8` where **`0` is Auto** — the exact
pre-6.4 behaviour:

- **Perfection Band Goal** ("stars"). When the requested band count exceeds the
  target tier's requirement, `deriveBandGoals` raises the effective perfection
  goal to `bandThreshold(targetPerfection, goal)`, still clamped by the recipe
  cap. The setting only ever *raises* the goal the search works toward.
- **Completion Band Ceiling**. Folded into `computeOvercraftExtras` in
  `src/optimizer/outcome.ts` as
  `Math.max(completionRequired, Math.min(capBandCount, sublime ? 5 : required, userCeiling))`,
  so extra completion past the chosen band stops earning score and leftover
  effort goes into perfection instead.

What did **not** change is the point: tier classification, `TIER_REQUIREMENTS`,
the band thresholds and `willAutoFinish` are untouched, and the ceiling can
never sink below the target tier's own requirement. These settings move the
goal the search aims at, not the game's outcome tiers, and
`src/optimizer/outcome.ts` remains the single authority for every threshold.
No scoring constant was changed.

## Notes for players

Band boundaries are not linear and never were: widths compound by
`BAND_GROWTH_RATIO` 1.3, so the bands sit at roughly **100% / 230% / 399% /
619% / 904%** of the recipe target. Sublime needs two bands on *both* bars,
which is ~230% — that is the "it stops around 200%" players kept reporting.
Nothing was broken there; the craft had simply met its gate. If you want more,
Perfection Band Goal now says so explicitly, and Completion Band Ceiling stops
the optimizer from spending the rest of the craft on completion you cannot
bank.

## Engine parity

`EngineConfig` in `crates/craftbuddy-engine/src/lib.rs` gained
`perfection_band_goal` and `completion_band_ceiling` with serde defaults,
mirrored in `outcome.rs` (`build_outcome_bands`, `compute_overcraft_extras`)
and in `goals()`. The wire format is snake_case via
`src/optimizer/nativeMcts.ts`, and the differential corpus was regenerated
(137 scenarios / 1,471 transitions).

## Validation

| Check | Result |
| --- | --- |
| `bun run typecheck` | clean |
| `bun run test` | 910 passed, 33 suites |
| `bun run wasm:test` | 70 passed |
| `bun run wasm:build` | OK |
