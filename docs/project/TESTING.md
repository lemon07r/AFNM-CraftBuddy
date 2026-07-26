---
title: Testing Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-26
source_of_truth: src/__tests__/*, crates/craftbuddy-engine/*, package.json, scripts/docs/*, scripts/installed-game-runtime.js
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
---

# Testing Guide

## Commands

See `AGENTS.md` for the compact command list. Key commands:

- `bun run test` — full suite (slow: `craftSimulation.test.ts` alone is ~290 s)
- `bun run wasm:test` — Rust unit, effect-parity, and differential-corpus tests
- `bun run wasm:build` — compile the Rust engine and generate the inline WASM module
- `bun run optimizer:differential-corpus` — regenerate the cross-engine corpus
- `bun run optimizer:bench` — replay-contract and trend comparison
- `bun run test:watch` — watch mode
- `bun run jest src/__tests__/<file>.test.ts` — focused file

Jest runs in the `node` environment and only matches `**/__tests__/**/*.test.ts`. There is no React Testing Library and `.tsx` is not matched, so presentation logic that needs coverage belongs in a pure `src/utils/*` module (the `overlayLayout.ts` / `outcomeSummary.ts` pattern).

For validation workflow and which checks to run per change area, load the `pre-commit-validation` skill. For UI harness workflow, load `craftbuddy-ui-validation`. For runtime oracle usage, load `runtime-oracle`. For live game testing, load `live-game-testing`.

## Test ownership by area

| Test file | Covers |
| --- | --- |
| `craftSimulation.test.ts` | End-to-end multi-turn craft simulations |
| `search.test.ts` | Recommendation/search behavior, scoring, move ordering |
| `nativeMcts.test.ts` | TypeScript-to-Rust MCTS input serialization and bridge shaping |
| `skills.test.ts` | Transition logic, buffs, masteries, effects |
| `gameAccuracy.test.ts` | Formula/mechanics parity |
| `harmony.test.ts` | Harmony subsystem |
| `outcome.test.ts` | Band widths, tier conjunction, `willAutoFinish` |
| `outcomeProjection.test.ts` | The `OutcomeProjection` attached to every `SearchResult` |
| `outcomeSummary.test.ts` | Display-row derivation from a projection, including the legacy no-projection path |
| `harmonyRegistry.test.ts` | Seven harmony definitions, complexity multipliers, normalization |
| `runtimeParity.test.ts` | Runtime-verified behaviours such as Fallen Soulflame fragment triggers |
| `engineDifferential.test.ts` | TypeScript side of the cross-engine differential corpus |
| `nativeAutoUse.test.ts` | Loadout status reading, covered items, slot projection, toxicity ceiling, training mode |
| `craftStateSignature.test.ts` | Signature coverage/diffing and `craftStateRevision` derivation |
| `autoCraftExecutor.test.ts` | Dispatch-time verification, typed errors, execution-path selection |
| `overlayLayout.test.ts` | Safe-lane overlay sizing and occupied-rect geometry helpers |
| `state.test.ts` | State invariants, cache key behavior |
| `gameTypes.test.ts` | Expression evaluation, helper behavior |
| `largeNumbers.test.ts` | Numeric safety |
| `configStats.test.ts` | Config statistics calculation |
| `settings.test.ts` | Settings persistence |
| `techniqueResolution.test.ts` | Canonical live-technique name matching and `craftingTechniqueFromKnown` fallback behavior |
| `autoCraftController.test.ts` | Auto-mode policy gating and native-auto-use downgrade, revision guard, stale → recalculate, unverifiable → pause, settle phase, stop/reset |
| `modContentHarmonyState.test.ts` | Harmony hydration, replay snapshot parity, integration regressions |
| `crates/craftbuddy-engine/src/effects_tests.rs` | Rust effect trees, mastery, Soulflame, toxicity, item actions |
| `crates/craftbuddy-engine/src/differential_tests.rs` | Corpus replay plus `mcts_search_is_deterministic` |

## Simulation tests (`craftSimulation.test.ts`)

`simulateCraft()` runs a complete multi-turn craft using the optimizer's `findBestSkill()` to choose each action. These catch bugs that per-turn unit tests miss:

- neutral conditions: basic crafts complete within turn budgets
- condition exploitation: positive conditions steer toward the right skills
- buff utilization: buff setup -> payoff sequences preferred over raw progress
- survivability: stabilize when critical, skip when a finisher is available
- terminal policy: a state satisfying `willAutoFinish` is terminal and must not be "improved" by further stat spam; goal-priority bias tests should prove balanced mode stays neutral while completion/perfection bias steers the chosen line in the expected direction
- probabilistic survivability: when chance-based stability recovery exists, the optimizer should still prefer a guaranteed stabilize over a proc-dependent line if both keep goals alive
- mixed conditions: varied/all-negative sequences don't cause craft death
- harmony sub-systems: forge works crafts use fusion to raise heat before refining, complete without wasting turns on zero-gain skills

**Add a simulation test when:** a scoring/ordering change affects multi-turn behavior, or a bug describes "optimizer does X instead of Y over several turns."

**Use a unit test when:** single-turn scoring, specific function I/O, or helper edge cases.

## Replay-parity regressions

Exported optimizer snapshots are only useful for bug reproduction if they preserve search-relevant state. Snapshot regressions should cover:

- runtime-shaped config fields that affect gains/search (`mastery`, `masteryEntries`, granted buff payloads)
- active buff definitions when current-state buffs change stats/costs
- craft-context provenance (`craftingTypeSource`, sublime-detection signals, raw recipe/recipeStats fields) when a bug may be caused by hydration/integration drift
- compact HUD target regressions should prove `K/M/...` display strings round-trip to the intended numeric progress values, and that non-overcraft crafts still preserve exact completion/perfection targets when caps are available
- replay parity: round-tripped snapshot input should be exercised through the canonical replay helpers in `src/modContent/replaySnapshot.ts` so tests share the same serializer/reviver contract as production
- result snapshots should preserve `actionKind` and `projectedSuccessChance` for finish recommendations so bug reports stay explainable
- snapshot bundles should keep the current turn and newest previous turns under the configured turn/byte caps, dropping the oldest turns first when trimming is required
- auto-mode debug context in snapshot bundles should preserve the per-turn auto state summary so stalled/executed transitions can be reconstructed from bug reports
- real-user regressions should prefer full exported snapshots checked into `src/__tests__/__fixtures__/replay-snapshots/`; use reduced hand-shaped fixtures only when the raw export is unavailable

Because search is wall-clock-budgeted, CI/browser/live runs can reach different frontiers before cutoff. Real-user regressions should use exported snapshot fixtures or explicit constrained budgets instead of assuming one machine's timing behavior generalizes. For search-budget regressions, prefer deterministic node-budget cutoffs over wall-clock-only assertions.

## Cross-engine differential testing

The corpus (`src/__tests__/fixtures/differentialCorpus.ts` → `crates/craftbuddy-engine/tests/differential_corpus.json`) is the parity contract between the TypeScript simulator and the Rust engine: schema v2, **129 scenarios / 1,222 transitions**, asserting scalar state plus the active-buff set, `items`, `consumedPillsThisTurn`, and a `harmonyData` digest.

Rules:

- Any mechanics change means regenerating with `bun run optimizer:differential-corpus` and running **both** sides (`bun run jest src/__tests__/engineDifferential.test.ts` and `bun run wasm:test`).
- Never hand-edit the JSON; it is generated.
- Add a scenario per newly modelled mechanic before porting it, not after.
- Parity is only claimed when the whole corpus passes on both sides.

## Native MCTS testing

Native MCTS is disabled under Jest unless `CRAFTBUDDY_ENABLE_WASM_MCTS_TESTS=1` is set. Use `bun run wasm:test` for Rust behavior and `bun run build` to verify the inline generated WASM package.

`nativeMcts.test.ts` also asserts that no explicit `null` survives into the Rust payload. Do not relax that: a single `null` on a non-optional field fails the whole deserialization and silently disables the prior (see `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`).

## Auto-mode testing

Auto mode can act on the live game, so its tests cover refusal as much as action:

- a native loadout is detected with the correct covered items, `pillsPerRound` and toxicity headroom; an all-empty or unstocked loadout counts as inactive
- with a loadout active, `fullActionSpace` is downgraded and no covered item is ever dispatched
- live state moving between recommendation and dispatch produces `stale` with the changed fields, and the controller recalculates
- unreadable state produces `unverifiable`, and automation pauses with an explanation and dispatches nothing
- changing only harmony value, only `harmonyData`, or only the available-technique set each yields a new `craftStateRevision`
- `trainingMode` applying items without removing them is not a mismatch

## Chance-based survivability testing

Cover both layers:

- `skills.test.ts`: unit-test the guaranteed survivability floor (`calculateActionSurvivabilityFloor(...)`)
- `search.test.ts` / `craftSimulation.test.ts`: replay or simulation regressions proving the optimizer chooses the guaranteed-safe line when one exists
- For sublime/overcraft regressions, pair with replay fixtures confirming base-success continuation still values heat/harmony recovery

## Community-guide parity testing

- add `gameAccuracy.test.ts` coverage for runtime-shaped stat math before changing formulas
- add `skills.test.ts` coverage for multi-turn buff/effect behavior before changing transition logic
- document the outcome in `docs/project/MECHANICS_PARITY.md`
