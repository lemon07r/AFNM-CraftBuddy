---
title: Testing Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-04-25
source_of_truth: src/__tests__/*, crates/craftbuddy-engine/*, package.json, scripts/docs/*, scripts/installed-game-runtime.js
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/OPTIMIZER_DESIGN.md
---

# Testing Guide

## Commands

See `AGENTS.md` for the compact command list. Key commands:

- `bun run test` — full suite
- `bun run wasm:test` — Rust unit tests for the native MCTS engine
- `bun run wasm:build` — compile the Rust engine and generate the inline WASM module
- `bun run test:watch` — watch mode
- `bun run jest src/__tests__/<file>.test.ts` — focused file

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
| `overlayLayout.test.ts` | Safe-lane overlay sizing and occupied-rect geometry helpers |
| `state.test.ts` | State invariants, cache key behavior |
| `gameTypes.test.ts` | Expression evaluation, helper behavior |
| `largeNumbers.test.ts` | Numeric safety |
| `configStats.test.ts` | Config statistics calculation |
| `settings.test.ts` | Settings persistence |
| `techniqueResolution.test.ts` | Canonical live-technique name matching and `craftingTechniqueFromKnown` fallback behavior |
| `autoCraftController.test.ts` | Auto-mode controller policy gating, auto-finish completion latch, stop/reset behavior, and state-advance waits |
| `modContentHarmonyState.test.ts` | Harmony hydration, replay snapshot parity, integration regressions |
| `crates/craftbuddy-engine/src/lib.rs` Rust tests | Native MCTS rollout policy, harmony subset simulation, craft-end bonus helpers |

## Simulation tests (`craftSimulation.test.ts`)

`simulateCraft()` runs a complete multi-turn craft using the optimizer's `findBestSkill()` to choose each action. These catch bugs that per-turn unit tests miss:

- neutral conditions: basic crafts complete within turn budgets
- condition exploitation: positive conditions steer toward the right skills
- buff utilization: buff setup -> payoff sequences preferred over raw progress
- survivability: stabilize when critical, skip when a finisher is available
- finish policy: impossible-craft or no-action-alive scenarios can end with `Finish Craft`; goal-priority bias tests should prove balanced mode stays neutral while completion/perfection bias steers the chosen line in the expected direction
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

## Native MCTS testing

Native MCTS is disabled under Jest unless `CRAFTBUDDY_ENABLE_WASM_MCTS_TESTS=1` is set. Use `bun run wasm:test` for Rust behavior and `bun run build` to verify the inline generated WASM package.

## Chance-based survivability testing

Cover both layers:

- `skills.test.ts`: unit-test the guaranteed survivability floor (`calculateActionSurvivabilityFloor(...)`)
- `search.test.ts` / `craftSimulation.test.ts`: replay or simulation regressions proving the optimizer chooses the guaranteed-safe line when one exists
- For sublime/overcraft regressions, pair with replay fixtures confirming base-success continuation still values heat/harmony recovery

## Community-guide parity testing

- add `gameAccuracy.test.ts` coverage for runtime-shaped stat math before changing formulas
- add `skills.test.ts` coverage for multi-turn buff/effect behavior before changing transition logic
- document the outcome in `docs/project/MECHANICS_PARITY.md`
