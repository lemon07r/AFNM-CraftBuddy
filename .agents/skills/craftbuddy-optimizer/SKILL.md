---
name: craftbuddy-optimizer
description: CraftBuddy optimizer/search/MCTS workflow. Activate for changes to src/optimizer, crates/craftbuddy-engine, recommendation quality, scoring, move ordering, simulation tests, replay snapshots, or optimizer performance.
---

# CraftBuddy Optimizer

Use this before touching recommendation behavior. `docs/project/OPTIMIZER_DESIGN.md` is the detailed reference. Historical mechanics evidence targets **0.7.17-d8ae6ce**; the October audit inspected **0.7.18-97c093b**. Do not claim exhaustive new-version parity from old release tests.

## Activate When

- Editing `src/optimizer/*` or `crates/craftbuddy-engine/*`
- Changing scoring, move ordering, condition branching, finish policy, harmony, or MCTS behavior
- Investigating a bad recommendation, replay snapshot, or long-craft performance issue

## Architecture Boundaries

1. `src/optimizer/*` is pure simulation/search. It must not read the game runtime, DOM, Redux, or settings storage directly.
2. `src/modContent/*` converts live game objects into optimizer config/state/actions, and reaches the optimizer only through `src/optimizer/index.ts`. Add to the barrel instead of importing a submodule.
3. `src/optimizer/outcome.ts` is the **only** authority for band thresholds, tier requirements and the auto-finish predicate. Search, the Rust engine (`outcome.rs`) and the panel all consume it; recomputing a threshold anywhere else is a defect.
4. Production `findBestSkill` routes to `constrainedSearch` in `constrainedPlanner.ts`. Legacy `greedySearch`/`lookaheadSearch` and the Rust MCTS prior remain reference APIs; they are not the production safety authority.
5. `resolvePlanningGoals` in `outcome.ts` owns requested goals. Explicit values request both bars up to actual caps. Auto uses caps with ambition enabled, ordinary tier requirements otherwise. Item tiers and auto-finish remain separate.

## Safe Change Workflow

1. Read the relevant section of `docs/project/OPTIMIZER_DESIGN.md`.
2. Reproduce the issue with a focused unit, simulation, or replay test before changing logic.
3. Fix the underlying scoring/transition/order layer; do not add a parallel heuristic lane.
4. Run targeted tests while iterating, then `bun run test` before completion.
5. Run `bun run build` if TypeScript/Rust/WASM source or generated WASM changes.
6. If mechanics/parity docs change, update docs and run `bun run docs:check`.
7. If you notice stale or inaccurate optimizer docs/skills while working, correct them in the same pass; do not leave known bad guidance for future agents.

## Planning Rules

- **Requested goals are conjunctive.** Ordinary tier success does not satisfy a higher goal; a lower request does not redefine the actual item tier.
- Use one transitive lexicographic order: premature-ending risk, goal-probability lower bound, normalized frontier progress, expected turns, then resource reserve. For fully resolved policies with exact probabilities, goal and failure probabilities are complements. Hidden PRD probabilities remain bounds and their uncertainty propagates through deterministic ancestors. With unresolved frontiers this conservative order is not a feasibility proof. Prevent inert/dominated restore loops from exploiting it.
- Use discrete success, crit and supported effect-chance branches. Never apply nonlinear goal or terminal checks to an averaged state as proof of success.
- Retain unresolved probability mass at bounded frontiers. Never renormalize explored branches into certainty or present unexpanded continuation as verified. Hidden-PRD omitted outcomes contribute zero goal lower bound; nominal enumeration weights cannot prove positive probability. Do not publish a success percentage when any descendant has hidden-probability uncertainty.
- Reuse authoritative payment, mastery, buff and harmony phases for planning and survival checks. Do not maintain a divergent handwritten survival simulator.
- Full-bar restoration requires another real modeled benefit to justify its resource and turn cost.
- Exact per-call cache identity covers every state field affecting future decisions. Do not use legacy cross-step scores for production planning.
- Do not retune legacy scoring constants to reproduce benchmarks. Legacy scores are estimates, not general survival guarantees.

## Search and Merge Rules

- Production uses a bounded sparse AND/OR graph with chance-aware Bellman backups. Action coverage and unresolved branches must remain explicit.
- Worker merge uses the same `recommendation.planning` fields as local selection, never raw-score sorting that discards safety precedence.
- Apply root partitions before expansion work; keep the full roster for continuations and never cache a restricted root as a full continuation. Preserve incomplete `rootEvaluation` coverage across worker merge and replay diagnostics. A partial root ranking cannot become executable merely because another worker returned a candidate.
- First-action validation must agree with the selected policy; do not add contradictory recommendation-only heuristics.
- `buildOrderedMoveCandidates` and beam heuristics are legacy code. Tests of that path do not establish production planner correctness.

## Rotation Display Rules

- Displayed rotations are conditional projections, not promises that every random branch follows them.
- Preserve goal attainment, premature-ending risk and unresolved coverage separately from actual item-tier projection.
- Legacy `findOptimalPath` reconstructs from accepted cache entries; do not call that a certified production plan.

## Test Selection

| Change | Tests |
| --- | --- |
| Multi-turn recommendation behavior | `craftSimulation.test.ts` |
| Search scoring/order/cache edge | `search.test.ts` |
| Bands, tiers, auto-finish | `outcome.test.ts`, `outcomeProjection.test.ts` |
| Requested goals and propagation | `planningGoals.test.ts`, goal/terminal cases in `auditSearch.test.ts` |
| Stochastic decisions and constrained planning | `stochasticTransitions.test.ts`, `constrainedPlanner.test.ts`, `planningComparator.test.ts`, `nativeAutoUsePlan.test.ts`, `prReviewRegressions.test.ts`, `prReviewRound2.test.ts`, `sublimeRecovery.test.ts`, `certificationBoundaries.test.ts` |
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
5. **Native MCTS is legacy-only**: historical near-tie priors and Rust parity do not certify production planning.
6. **Never send an explicit `null` across the Rust bridge**: one `null` on a non-optional field fails the whole payload and silently disables the prior. `nativeMcts.test.ts` guards this.
7. **Do not re-attempt measured dead ends**: compact Rust state with mutate/undo (clone is 4.7% of a transition) and the packed numeric cache key (1.0-1.4% of the budget) were both rejected with data. See `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`.
8. **Never tune a constant to make a benchmark contract pass.** Contracts change only with recorded runtime-oracle evidence.
9. **Eccentric Decree scores per bar change, not once per turn**: 0.7.6 moved its state machine out of end-of-turn `processEffect` into an `onBarChange` hook fired inside every `applyCompletion`/`applyPerfection`, so one turn can award several harmony steps (+5 focused, -15 stray since 0.7.8) and flip the focused bar part-way through. `processEccentricDecree` in `src/optimizer/harmony.ts` is an ordered fold over `BarChangeEvent[]`, mirrored over `BarChange` in the Rust engine; event order is part of the mechanic, so keep both folds identical and regenerate the differential corpus after any change.
10. **`needsBarContributions()` is a live gate, not dead code**: bar-change events are collected only when the craft's harmony is `eccentricDecree`. Leave the gate in `src/optimizer/skills.ts` and `needs_bar_contributions()` in `crates/craftbuddy-engine/src/effects.rs` alone; it keeps every other harmony allocation-free.
11. **Internal names and display names differ**: key `false_fusion` / internal `name` `False Fusion` displays as "Strive for Completion". Search, caches, tests and fixtures key on `name`; only user-facing strings go through `techniqueDisplayName()` (exported from `src/optimizer/index.ts`).
12. **Band requests are not tier gates**: `perfectionBandGoal` and legacy-named `completionBandCeiling` are explicit per-bar goals from 1-8. Auto with ambition on targets actual caps; Auto with it off targets ordinary requirements. Explicit lower goals are allowed without redefining item tiers. Use `resolvePlanningGoals`; never silently drop either setting at deeper or terminal nodes.

13. **Preserve phases across branches**: pay toxicity/droplets/buff costs, capture success chance, apply effect masteries, recompute/pay Qi and stability, then success effects. Tick pre-action buff names, then resolve harmony. Supported chance decisions remain separate future states; exhausted branch budgets remain unresolved.
14. **Returning Cycle is a transition, not a scoring heuristic**: fixed starting charge size, accrual from reported payment even on failure, drain before stabilize release, ordinary Returned Precision stacks ticking on later actions. Mirror TS/Rust and preserve the payload through replay/bridge. `runtime0717.test.ts` and `returningCycle.test.ts` cover the edge cases.

## References

- `docs/project/OPTIMIZER_DESIGN.md`
- `docs/project/MECHANICS_PARITY.md`
- `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`
- `docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md`
- `docs/project/TESTING.md`
- `src/optimizer/outcome.ts`
- `src/__tests__/craftSimulation.test.ts`
- `src/__tests__/search.test.ts`

15. **Certificate preflight is strict.** Unsupported technique/buff/mastery/trigger/condition/scaling payloads and unresolved active buff definitions remain unresolved through `transitionValidation.ts` and `applySkillOutcomes`; never promote a permissive EV fallback into a verified transition. Formula certification accepts only numeric/boolean grammar. `nativeAvailability.ts` enforces the inspected raw technique gates even in workers, and unknown native fields pause certification. Native item payloads are checked after provable selection; unknown selection still pauses. Keep tier requirements separate from the optional requested-goal projection. `certificationFollowup.test.ts` covers these boundaries.
16. **Identity and observation matter.** Only root CraftingState bookkeeping may be omitted from exact planner keys; nested `history`/`_cacheKey` counters affect mechanics. Sublime certificates require an established, known harmony, including its active stateful subsystem after step zero. Presentation hydration defaults marked missing are not evidence. `reviewSafetyIdentity.test.ts` covers the branch-collision, missing-harmony and malformed-native-buff cases.
17. **Guaranteed success is not necessarily a PRD trial.** The native map is unchanged when stated chance is already one; preserve known/unknown carry-over. A real trial whose adjusted probability reaches one still resets on success. `prdGuaranteedCarry.test.ts` covers this distinction. Final-state previews are limited to fully resolved deterministic terminal routes; never treat the most-likely stochastic rotation as a final-state expectation.
18. **Native mechanics fields cannot silently default after malformed input.** Present success chances, costs, cooldowns and minimum-stability requirements (`minStability`) must be finite numbers; the four native mechanics flags, including `noMaxStabilityLoss`, must be actual booleans. Explicit null is not omission because JSON uses null for NaN/Infinity. Preserve valid zero/false values and reject malformed raw payloads before extraction defaults can become certificates. `nativeNumericCertification.test.ts` and `nativeBooleanCertification.test.ts` exercise extraction, replay and worker transport.
19. **Celadon is an event transition, not a scoring bonus.** Emit its four verified stack-gain events after accepted additions, capture fresh native-case aliases for the payout block, consume all four non-stacking embers, and retain actual capped Qi deltas and stability overdraft. Do not broadly allow unknown stack triggers: certification checks the verified Celadon block shape. `celadonCycle.test.ts` covers full cycles and safety boundaries; runtime evidence records the native-function comparison.
20. **Resource boundaries require native evidence.** Qi spending floors at zero, restoration caps per operation, and stability retains debt through the action. Preserve captured mastery resource fields, fresh payment/buff/event frames, raw operation sign, actual event deltas and item-versus-turn cleanup. Run `qiPhaseSafety.test.ts` and `progressOrderCertification.test.ts`; the hash-verified native oracle is independent of the optimizer. Unsupported progress-dependent sequencing must remain unresolved, not a probability-one route.
21. **Agreement is not game correctness.** The historical Rust corpus is generated from TypeScript and can preserve a shared defect. Distinguish native-derived expectations, implementation parity, replay trends and in-game acceptance. Keep origin evidence for regressions and inherited gaps; do not infer broad safety from a large passing test count.
