---
title: Release Notes 6.3.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.8-24a8210
last_verified: 2026-08-09
source_of_truth: git history on main, package.json, src/optimizer/skills.ts, src/optimizer/search.ts, src/modContent/craftStateExtraction.ts, crates/craftbuddy-engine/*
review_cycle_days: 90
related_files:
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/RELEASE_NOTES_6.2.0.md
  - docs/project/RELEASE_PROCESS.md
  - docs/project/WORKSHOP_DESCRIPTION.md
---

# Release Notes 6.3.0

CraftBuddy 6.3.0 retargets the mod to AFNM **0.7.8** and teaches both engines
the 0.7.7/0.7.8 buff mechanics: stateful buffs with triggered effects, the
Illume Crucible seal, discordant conditions, and the Eccentric Decree
rebalance. It also fixes the buff-gating bug behind the Focused Fusion
report. The 6.x outcome architecture and every scoring constant are
unchanged.

## Changed

### Updated for game version 0.7.8

- `afnm-types` bumped to 0.7.8; every mechanic below was verified against the
  installed 0.7.8 bundle before implementation (evidence in
  `docs/project/RUNTIME_EVIDENCE.md` section 14).
- The live `getNextCondition` provider now receives the crafting entity,
  matching the 0.7.8 signature, so native condition forecasts stay
  authoritative.

### Stateful buffs: `internalState`, `triggeredEffects`, `setState` (0.7.7)

- Buffs can now carry per-instance internal state, seeded from the
  definition's `initialState` equations at creation and readable by all of
  the buff's own equations. The state is cloned on every transition and is
  part of cache keys, state signatures and the WASM bridge.
- The six crafting triggers (`completionGained`, `perfectionGained`,
  `poolSpent`, `poolRestored`, `stabilitySpent`, `stabilityRestored`) fire
  the buff's effect block with `amount` — and `percentGained` for the bar
  triggers — in scope. `percentGained` uses the runtime's tier formula
  (`100 × (tier(after) − tier(before))` over the 1.3×-inflated thresholds).
- `setState` effects write the state (`set` / `add`); later effects in the
  same block read earlier writes. Dispatch runs after costs and technique
  applications and before the per-turn buff fold, so the fold sees what the
  triggers wrote.
- This is all definition-driven: **True Bifang Flame** (blaze =
  `max(blaze, floor(percentGained))`, +0.03 control per blaze) and **Flame of
  the Azure Depths** (one stored Qi per 1% of max pool spent, charge
  remainder carried, stored decaying by 1 per action) flow through it with no
  per-buff code, in both engines.

### Illume Crucible: `sealedMaxStability` (0.7.8)

- While a sealing buff is held, max stability falls by 1 every action even
  when the technique prevents decay, and **no** max-stability restoration
  applies — full restores, positive `maxStabilityChange`, and technique/buff
  deltas are all dropped, matching the runtime's `E7o`/`D7o` checks.
  Reductions still apply.
- Enforced in the action fold, the survivability floor, and the display
  frame, in both engines.

### Discordant conditions (0.7.7)

- Buffs like Uncontrollable Flames carry `discordantConditions: 0.7`: at the
  stay-neutral decision the runtime only keeps the neutral outcome `1 − d` of
  the time, and the rest falls through to the harmony roll.
- The generated-condition distribution now applies
  `effectiveChange = change + (1 − change) × d` at exactly that decision
  point, with `d` taken as the strongest across held buffs — in search, in
  the forecast queue normalization, and in the live-condition fallback.

### Eccentric Decree rebalance (0.7.8)

- Stray bar changes now cost **−15 harmony and −15 Qi Pool** (was −5/−5); the
  focused bar still awards +5. Constants updated in both engines; tests and
  the differential corpus regenerated.

### Fixed: buff-gated techniques recommended without their buff

- The optimizer recommended Focused Fusion with no Focus buff active:
  technique extraction only read CraftBuddy's own buff-gate fields and
  missed the game's native top-level `buffCost` / `buffRequirement`.
- `convertGameTechniques` now reads the native fields. Regression coverage:
  unit tests on the extraction seam plus a replay-snapshot fixture
  reproducing the exact user-reported state.

### Fixed: native engine prior silently disabled on crafts with buffs

- The new `internal_state` bridge field was sent as a present-but-undefined
  key when a buff carried no state. `serde_wasm_bindgen` rejects that for a
  non-`Option` map field, so the whole MCTS input failed deserialization and
  the search silently fell back to TypeScript-only whenever any buff was
  active. Caught by the replay benchmark's warning path.
- The bridge now omits the key entirely when there is no state, with a
  regression test asserting the omission and the stateful round-trip.

## Verification

- 889 Jest tests across 33 suites, including 11 new mechanics tests (seal,
  Bifang/Azure triggers, `setState` ordering, `initialState` seeding,
  discordance), the Focused Fusion regression tests, and the WASM-bridge
  omission guard.
- 69 passing Rust tests, including the 5 mirror mechanics tests; the
  differential corpus is now schema v3 with **137 scenarios / 1,471
  transitions** and digests each buff's `internalState`, so trigger-state
  drift between the engines fails a test.
- Replay benchmark: **98 of 98 contracts passing**, with the native WASM
  prior confirmed active on every replay payload.
- `bun run typecheck` clean; runtime oracle confirms the installed build
  `0.7.8-24a8210`.
- No scoring constant was tuned for this release.

## Known limitations

The 6.2.0 limitations still stand — `harmonyAugment` item effects and
craft-result material returns are unmodelled beyond the sublime scoring
path, hidden RNG is expected values rather than predicted rolls, and the
panel is English-only. New with this release:

- **The Rust engine scores `perfectionGained` triggers with
  `percentGained = 0`.** No 0.7.8 buff consumes `perfectionGained`, so this
  cannot diverge today; the TypeScript engine threads the real target
  perfection for future buffs.
- **Discordance is modelled as a distribution shift, not a roll stream.**
  Search already reasons in expected conditions, so this matches how every
  other condition probability is treated.

## Upgrading

No user action is required. Settings and presets are preserved, and there
are no new toggles. The game target is now AFNM **0.7.8**.
