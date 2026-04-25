---
name: craftbuddy-optimizer
description: CraftBuddy optimizer/search/MCTS workflow. Activate for changes to src/optimizer, crates/craftbuddy-engine, recommendation quality, scoring, move ordering, simulation tests, replay snapshots, or optimizer performance.
---

# CraftBuddy Optimizer

Use this before touching recommendation behavior. `docs/project/OPTIMIZER_DESIGN.md` remains the detailed source of truth; this skill is the action checklist.

## Activate When

- Editing `src/optimizer/*` or `crates/craftbuddy-engine/*`
- Changing scoring, move ordering, condition branching, finish policy, harmony, or MCTS behavior
- Investigating a bad recommendation, replay snapshot, or long-craft performance issue

## Architecture Boundaries

1. `src/optimizer/*` is pure simulation/search. It must not read the game runtime, DOM, Redux, or settings storage directly.
2. `src/modContent/*` converts live game objects into optimizer config/state/actions.
3. Rust/WASM MCTS is a root-policy prior only. TypeScript owns exact legality, transition mechanics, terminal scoring, cache entries, and returned recommendations.

## Safe Change Workflow

1. Read the relevant section of `docs/project/OPTIMIZER_DESIGN.md`.
2. Reproduce the issue with a focused unit, simulation, or replay test before changing logic.
3. Fix the underlying scoring/transition/order layer; do not add a parallel heuristic lane.
4. Run targeted tests while iterating, then `bun run test` before completion.
5. Run `bun run build` if TypeScript/Rust/WASM source or generated WASM changes.
6. If mechanics/parity docs change, update docs and run `bun run docs:check`.

## Scoring Rules

- Scale bonuses and penalties with craft target magnitude; avoid hardcoded constants that only fit one craft size.
- If base targets are met, survivability penalties must not apply.
- Step efficiency matters: shorter paths beat longer equivalent-goal paths.
- Resource tie-breakers after targets are met must stay tiny (`0.001` class), never large enough to justify extra turns.
- Death must be worse than any progress path; runway gap penalties are proportional and uncapped.

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
| Transition, buffs, masteries, action costs | `skills.test.ts` |
| Formula or runtime parity | `gameAccuracy.test.ts` |
| Harmony subsystem | `harmony.test.ts` plus simulations |
| Replay export/import fidelity | replay snapshot fixtures/helpers |
| Rust MCTS | `bun run wasm:test`; `bun run build` for inline WASM bundle |

## Gotchas

1. **Heuristic soup compounds**: if a fix needs 3+ tuned constants or a heuristic to counter another heuristic, step back and fix the model.
2. **Condition effects affect ordering**: order by actual condition-modified gains, not raw base gains.
3. **Finish Craft is a modeled branch**: compare exact craft-end EV against continuing lines; do not special-case it outside search.
4. **Wall-clock budget is not deterministic**: prefer node-budget or completed-frontier assertions for regressions.
5. **Native MCTS cannot override clear TypeScript scores**: it may only help with near-tie root ordering inside the configured score window.

## References

- `docs/project/OPTIMIZER_DESIGN.md`
- `docs/project/TESTING.md`
- `docs/project/MECHANICS_PARITY.md`
- `src/__tests__/craftSimulation.test.ts`
- `src/__tests__/search.test.ts`
