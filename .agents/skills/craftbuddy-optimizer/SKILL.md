---
name: craftbuddy-optimizer
description: Use for optimizer mechanics, recommendation quality, scoring, transition goldens, replay regressions, or performance work.
---

# Optimizer work

Start with the relevant section of `docs/OPTIMIZER_DESIGN.md`; current contracts and gaps are in `docs/MECHANICS_PARITY.md`. A failing replay or focused test is usually more useful than another ranking constant.

## Easy-to-miss contracts

- Prefer fixing transition/scoring inputs over a parallel ordering heuristic: several compensating constants recreated the old heuristic soup.
- Keep game access in the adapter, so hypothetical states stay pure. Integration/UI use `src/optimizer/index.ts`; workers and tests may use internals.
- `src/optimizer/outcome.ts` owns bands, tiers and auto-finish; UI and search consume it instead of recomputing thresholds.
- Decree scores **each bar change** and can flip focus within a turn. Preserve the ordered fold and `needsBarContributions()` gate, which avoids allocations for other harmonies. The expected-event and intra-turn scaling approximations remain documented gaps.
- Preserve the 0.7.17 phases: toxicity/droplets/buff payment → chance capture → effect masteries → recomputed Qi/stability payment → success effects → pre-action-name buff ticks → harmony → cleanup. New buff names do not tick immediately.
- Returning Cycle accrues **reported** payment even on failure, drains before stabilize release, and grants ordinary Returned Precision. A flat harmony bonus cannot substitute for this transition.
- Carry `overcraftAmbition`, `perfectionBandGoal` and `completionBandCeiling` through every score, stale-settings and cache boundary: a changed goal changes score meaning.
- Prefer node budgets for reproducibility. TS also stops on `Date.now()`, so identical millisecond settings are not deterministic work. For neutral refactors, record then compare `bun run optimizer:digest -- --out tmp/baseline.json` / `bun run optimizer:digest -- --compare tmp/baseline.json`.
- `docs/ENGINE_DECISIONS.md` records measured dead ends and the experimental-prior retirement. Historical timings are workload-specific, not permanent performance guarantees.
- Keep benchmark contracts tied to runtime evidence; a green benchmark obtained by tuning a constant is not a model correction.

## Test selection

Run a named Jest file with `bun run jest src/__tests__/<file>.test.ts`.

| Change | Useful focused checks |
| --- | --- |
| Scoring, ordering, caches | `search.test.ts`; multi-turn cases in `craftSimulation.test.ts` |
| Bands, tiers, termination | `outcome.test.ts`, `outcomeProjection.test.ts` |
| Effects, costs, masteries | `skills.test.ts`, `runtime0717.test.ts`, `runtimeParity.test.ts`, `gameAccuracy.test.ts` |
| Harmony | `harmony.test.ts`, `harmonyRegistry.test.ts`, `returningCycle.test.ts`, simulations |
| Replay or worker wire | `replaySnapshotRetarget.test.ts`, `searchBackend.test.ts` |
| Any mechanics change | `bun run optimizer:transition-corpus`, inspect the diff, then `transitionCorpus.test.ts` |

The iteration/hand-off/release matrix is in `docs/DEVELOPMENT.md`. Recommendation and performance changes also benefit from the replay benchmark; run wall-clock measurements separately from CPU-heavy tests.
