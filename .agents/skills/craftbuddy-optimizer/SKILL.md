---
name: craftbuddy-optimizer
description: CraftBuddy optimizer/search/MCTS workflow. Activate for changes to src/optimizer, crates/craftbuddy-engine, recommendation quality, scoring, move ordering, simulation tests, replay snapshots, or optimizer performance.
---

# CraftBuddy Optimizer

Use this before touching recommendation behavior. `docs/project/OPTIMIZER_DESIGN.md` remains the detailed source of truth; this skill is the action checklist. Modelled game version: AFNM **0.7.6**.

## Activate When

- Editing `src/optimizer/*` or `crates/craftbuddy-engine/*`
- Changing scoring, move ordering, condition branching, finish policy, harmony, or MCTS behavior
- Investigating a bad recommendation, replay snapshot, or long-craft performance issue

## Architecture Boundaries

1. `src/optimizer/*` is pure simulation/search. It must not read the game runtime, DOM, Redux, or settings storage directly.
2. `src/modContent/*` converts live game objects into optimizer config/state/actions, and reaches the optimizer only through `src/optimizer/index.ts`. Add to the barrel instead of importing a submodule.
3. `src/optimizer/outcome.ts` is the **only** authority for band thresholds, tier requirements and the auto-finish predicate. Search, the Rust engine (`outcome.rs`) and the panel all consume it; recomputing a threshold anywhere else is a defect.
4. The Rust engine models the same mechanics and the same action space as TypeScript (proven by the differential corpus), but its search output is a root **policy prior**. TypeScript owns final ranking, cache entries and the returned recommendation.

## Safe Change Workflow

1. Read the relevant section of `docs/project/OPTIMIZER_DESIGN.md`.
2. Reproduce the issue with a focused unit, simulation, or replay test before changing logic.
3. Fix the underlying scoring/transition/order layer; do not add a parallel heuristic lane.
4. Run targeted tests while iterating, then `bun run test` before completion.
5. Run `bun run build` if TypeScript/Rust/WASM source or generated WASM changes.
6. If mechanics/parity docs change, update docs and run `bun run docs:check`.
7. If you notice stale or inaccurate optimizer docs/skills while working, correct them in the same pass; do not leave known bad guidance for future agents.

## Scoring Rules

- **Goals are conjunctive.** Tier value comes from `classifyOutcome`, gated by `Math.min(completionMargin, perfectionMargin)`. No weight may be able to raise the effective tier by piling points onto one bar — that failure mode is exactly what the 0.7.5 rework removed.
- Keep the documented commensurability: a tier step (`TIER_VALUE_SCALE`, `2x` magnitude) strictly exceeds the whole within-tier stack, and death (`3x`) exceeds a tier step.
- Scale bonuses and penalties with craft target magnitude; avoid hardcoded constants that only fit one craft size.
- If the active goal is met, survivability penalties must not apply.
- Step efficiency matters: shorter paths beat longer equivalent-goal paths.
- Resource tie-breakers after targets are met must stay tiny (`0.001` class), never large enough to justify extra turns.
- Death must be worse than any progress path; runway gap penalties are proportional and uncapped.
- Harmony and condition quality earn value through their effect on the reachable tier, not as flat additive bonuses.

## Move Ordering Rules

- `buildOrderedMoveCandidates()` is the authoritative beam-ordering path.
- Rank moves from post-action state via `estimatePostMoveStateScore()` and existing tie-breakers.
- Do not hard-filter legal skills before evaluation.
- Do not add separate first-move or recommendation-only heuristics that can disagree with recursive search.
- If a move class is under-ranked, fix transition/scoring inputs that feed the live ordering path.

## Rotation Display Rules

- `findOptimalPath()` should reconstruct from transposition-table `{ score, bestMove }` entries.
- Greedy fallback is only for cache misses.
- Do not re-evaluate every skill at every follow-up step; that diverges from the tree search at shallow remaining depth.

## Test Selection

| Change | Tests |
| --- | --- |
| Multi-turn recommendation behavior | `craftSimulation.test.ts` |
| Search scoring/order/cache edge | `search.test.ts` |
| Bands, tiers, auto-finish | `outcome.test.ts`, `outcomeProjection.test.ts` |
| Transition, buffs, masteries, action costs | `skills.test.ts` |
| Formula or runtime parity | `gameAccuracy.test.ts`, `runtimeParity.test.ts` |
| Harmony subsystem | `harmony.test.ts`, `harmonyRegistry.test.ts`, plus simulations |
| Eccentric Decree / bar-change ordering | `harmony.test.ts`, plus the Rust fold in `crates/craftbuddy-engine/src/lib.rs` via `bun run wasm:test` |
| Replay export/import fidelity | replay snapshot fixtures/helpers |
| Any mechanics change | regenerate with `bun run optimizer:differential-corpus`, then `engineDifferential.test.ts` **and** `bun run wasm:test` |
| Rust engine | `bun run wasm:test`; `bun run build` for the inline WASM bundle |

## Gotchas

1. **Heuristic soup compounds**: if a fix needs 3+ tuned constants or a heuristic to counter another heuristic, step back and fix the model.
2. **Condition effects affect ordering**: order by actual condition-modified gains, not raw base gains.
3. **There is no manual finish**: since 0.7.5 the craft resolves itself when `willAutoFinish` holds, which makes that state terminal. The internal `Finish Craft` pseudo-action exists only to price craft-end EV inside search; never treat it as an action a player or automation presses, and never let further stat spam "improve" an already-resolved state.
4. **Wall-clock budget is not deterministic**: prefer node-budget or completed-frontier assertions for regressions.
5. **Native MCTS cannot override clear TypeScript scores**: it may only help with near-tie root ordering inside the configured score window.
6. **Never send an explicit `null` across the Rust bridge**: one `null` on a non-optional field fails the whole payload and silently disables the prior. `nativeMcts.test.ts` guards this.
7. **Do not re-attempt measured dead ends**: compact Rust state with mutate/undo (clone is 4.7% of a transition) and the packed numeric cache key (1.0-1.4% of the budget) were both rejected with data. See `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`.
8. **Never tune a constant to make a benchmark contract pass.** Contracts change only with recorded runtime-oracle evidence.
9. **Eccentric Decree scores per bar change, not once per turn**: 0.7.6 moved its state machine out of end-of-turn `processEffect` into an `onBarChange` hook fired inside every `applyCompletion`/`applyPerfection`, so one turn can award several `+5`/`-5` harmony steps and flip the focused bar part-way through. `processEccentricDecree` in `src/optimizer/harmony.ts` is an ordered fold over `BarChangeEvent[]`, mirrored over `BarChange` in the Rust engine; event order is part of the mechanic, so keep both folds identical and regenerate the differential corpus after any change.
10. **`needsBarContributions()` is a live gate, not dead code**: bar-change events are collected only when the craft's harmony is `eccentricDecree`. Leave the gate in `src/optimizer/skills.ts` and `needs_bar_contributions()` in `crates/craftbuddy-engine/src/effects.rs` alone; it keeps every other harmony allocation-free.
11. **Internal names and display names differ**: key `false_fusion` / internal `name` `False Fusion` displays as "Strive for Completion". Search, caches, tests and fixtures key on `name`; only user-facing strings go through `techniqueDisplayName()` (exported from `src/optimizer/index.ts`).

## References

- `docs/project/OPTIMIZER_DESIGN.md`
- `docs/project/MECHANICS_PARITY.md`
- `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`
- `docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md`
- `docs/project/TESTING.md`
- `src/optimizer/outcome.ts`
- `src/__tests__/craftSimulation.test.ts`
- `src/__tests__/search.test.ts`
