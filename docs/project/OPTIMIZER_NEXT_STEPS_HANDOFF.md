---
title: Optimizer Next Steps Handoff
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-26
source_of_truth: src/optimizer/*, crates/craftbuddy-engine/*, src/__tests__/*, scripts/optimizer/benchmark-engines.ts
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/TESTING.md
---

# Optimizer Next Steps Handoff

Baseline for the next agent working on recommendation accuracy or speed. It records what the 0.7.5 rework settled, so no one re-derives it, and what is genuinely still open.

## Start here

1. Load `afnm-modding`, then `craftbuddy-optimizer`; add `rust-skills` for `crates/craftbuddy-engine/*` and `pre-commit-validation` before committing.
2. Read `docs/project/OPTIMIZER_DESIGN.md` (how it works) and `docs/project/OPTIMIZER_ENGINE_FINDINGS.md` (what has been measured).
3. Keep the boundaries: pure search in `src/optimizer/*`, game access in `src/modContent/*`, one facade at `src/optimizer/index.ts`.

## Settled — do not re-open without new evidence

| Decision | Why |
| --- | --- |
| Outcome tiers are conjunctive; `outcome.ts` owns every threshold | The additive weighted scorer is what mis-played sublime crafts. Re-introducing a weight that can raise a tier is a regression, not a tuning choice. |
| There is no manual finish action in 0.7.5 | Runtime-verified. `Wait` is a normal technique costing 10 stability. |
| Harmony is player-selected, seven types, each with a complexity multiplier | Runtime-verified; item-kind inference no longer exists in the game. |
| Rust models the same action space, but TypeScript owns final ranking | Parity is proven by the corpus; split authority over ranking is not worth the divergence risk. |
| Compact Rust state with mutate/undo | Measured: clone is 4.70% of a transition, so the ceiling was under 5%. Rejected. |
| Packed numeric transposition key | Measured at 1.0-1.4% of the budget. Dropped. |
| Expected progress is `p * min(gain, headroom)` | Runtime-verified: the completion/perfection appliers run only in the success branch, so the headroom clamp must sit **inside** the success weighting. Clamping first credits an overshooting technique with its whole headroom and hides its failure risk. |
| MCTS iterations stay at `250`, beam stays at `5` | Both measured; more of either costs more frontier than it buys. |

## Genuinely open

1. **Replay corpus size.** 14 curated fixtures is enough for regression, not enough to prove broad high-realm accuracy. This is the highest-value work available and it needs player snapshots, not more constants.
2. **Per-harmony item effects (`harmonyAugment`).** Unmodelled by choice: they change what the finished item does, not which action is best. If the game ever makes them affect in-craft state, this becomes real work.
3. **Native cost-preview helpers.** Still internally modelled; see `docs/dev-requests/STATUS.md` Q3.

`user-report-resonance-regression` used to head this list. It is closed: the cause was the success-weighted-progress bug in the table above, not the contract and not resonance. `bun run optimizer:bench` reports 98 of 98 contracts passing. See `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`.

## Where new fixtures come from

```js
window.craftBuddyDebug.exportOptimizerReplaySnapshot();
```

Store curated exports in `src/__tests__/__fixtures__/replay-snapshots/`, add a flexible benchmark contract, then run `bun run optimizer:bench`. Prefer a full export over a hand-shaped fixture. Categories still thin:

- late high-realm crafts with 50+ available techniques
- sublime crafts after base success but before both bars hold two bands
- the three 0.7.5 harmonies (`formless`, `enhancingEcho`, `eccentricDecree`)
- alchemical charge sequences and inscription partial blocks
- low-stability crafts with a proc-dependent recovery temptation
- states where auto-finish is one action away

## Working rules

- **Reproduce before changing.** A focused unit, simulation, or replay test that fails first; then the fix.
- **Fix the model, not the ranking.** If a move class is mis-ordered, the transition or post-move scoring input is wrong. Adding a second ordering lane or a skill-key exception is how the pre-0.7.5 heuristic soup happened.
- **Never tune a constant to make a benchmark green.** Contracts change only with recorded runtime-oracle evidence.
- **Protect the praised behaviour.** The Qi/stability juggling and low-stability survivability replays are regression assets. If a change makes them fail, the change is wrong until proven otherwise.
- **Assert node budgets, not wall clock.** Wall-clock depth differs per machine.

## Diagnostics

`searchMetrics` already exposes `depthReached`, `nodesExplored`, `cacheHits`, `timeTakenMs`, `earlyExit`, and the native policy summary; `SearchResult` exposes `outcomeProjection` (tier, per-bar bands, binding bar, auto-finish) and `setupFor` on a gated-technique enabler. Between them, "why this action" is usually answerable without instrumenting `search.ts`.

Still missing, if someone wants it: a debug-only per-layer score breakdown (`window.craftBuddyDebug.explainLastRecommendation()`). Keep it out of the normal UI.

## Validation

```bash
# iterating
bun run jest src/__tests__/search.test.ts
bun run jest src/__tests__/outcome.test.ts src/__tests__/outcomeProjection.test.ts
bun run jest src/__tests__/craftSimulation.test.ts       # slowest suite, ~290 s

# before claiming done
bun run typecheck && bun run test

# Rust / engine
bun run wasm:test && bun run wasm:build && bun run build
bun run optimizer:differential-corpus                    # after any mechanics change

# docs
bun run docs:inventory && bun run docs:check
```
