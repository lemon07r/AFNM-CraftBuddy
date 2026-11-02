# Optimizer design

CraftBuddy searches hypothetical continuations of a live AFNM craft. The modelled build is the `afnm-types` dependency in `package.json`. [Mechanics parity](MECHANICS_PARITY.md) distinguishes runtime contracts from approximations; [Engine decisions](ENGINE_DECISIONS.md) keeps measured trade-offs.

## Boundaries and state

Integration/UI use `src/optimizer/index.ts`; workers and tests may import internals. The optimizer reads normalized inputs, not the game, DOM or settings storage. Module ownership is in [Development](DEVELOPMENT.md#module-map-and-boundaries).

- `CraftingState` is immutable, with normalized cache keys and defensively copied tracked buffs. Buffs carry definitions, stacks/duration and per-instance internal state. The legacy scalar control/intensity turn counters are compatibility fast paths, not a second representation for new generic effects.
- Techniques consume lookahead turn depth; supplied pill/reagent actions do not. Integration excludes items covered by native auto-use.
- Persist only canonical supplemental native variables; derive state/buff/harmony aliases at evaluation time so stale mirrors do not pollute keys.
- Transitions include the payment/mastery/buff phases in [Mechanics parity](MECHANICS_PARITY.md#execution-contract). Decree alone collects ordered bar-change contributions through the allocation gate; Returning Cycle is simulated state, not a flat score bonus.

## Outcome and goals

`src/optimizer/outcome.ts` owns band widths, tier requirements and `willAutoFinish`; UI and search consume that single implementation.

Band widths grow by 1.3×: cumulative boundaries are approximately 100%, 230%, 399%, 619%, 904% of the recipe target. Tiers require both bars: basic = one completion band, perfect = one completion and one perfection, sublime = two of each and a distinct sublime item. `deriveOutcomeBands` builds caps/thresholds; `classifyOutcome` reports guaranteed tier, bands, margins and binding bar.

An additive weighted sum cannot replace the conjunction: excess in one bar must not buy a tier whose other bar is missing. Basic is a real finished floor but is suppressed as a live checkpoint while targeting perfect/sublime.

`willAutoFinish` is stability <= 0 or **both actual bar caps**, not five completion bands. There is no manual Finish, and search has no finish pseudo-action: candidates are real techniques (and, under the item policy, items). A successor that auto-resolves is scored with `scoreFinishedOutcome`. `SearchResult.status` is classified in order: `autoResolved` (the predicate already holds), `blocked` (no legal action), otherwise `live`. Meeting the goals does not mean the craft has resolved; goal achievement stays separate metadata. `Wait` is an ordinary technique costing 10 stability.

### Ambition and bias

Defaults, ranges and preset tables belong in `src/settings/index.ts`, not another documentation copy.

- Goal-priority bias shifts completion/perfection weight within the same scoring function (balanced follows remaining-work need). It cannot override a tier gate.
- `overcraftAmbition` values extra bands independently per bar after the target tier is secured; off retains the legacy conjunctive extras term.
- `perfectionBandGoal` raises the effective perfection goal, bounded by the cap; it never lowers the tier requirement. `completionBandCeiling` stops rewarding completion beyond that band, never below the tier requirement. Zero means automatic.
- `buildOutcomeBands`, `deriveBandGoals` and `computeOvercraftExtras` carry these goals without changing thresholds, classification or auto-finish.
- Every terminal score and integration stale-settings/cache-scope boundary includes all three ambition settings (`src/modContent/recommendationContext.ts`). Budget fields affect recommendation freshness but not score meaning.

## Search and ordering

`findBestSkill` selects greedy or lookahead search. Lookahead combines iterative deepening, an adaptive beam, transposition reuse, condition branching and conservative stable-recommendation early exit.

- The per-call table maps normalized state keys to `{ score, bestMove }`. Only completed deeper passes replace shallower results; truncated passes do not publish partial scores.
- Node budgets count cache-miss expansions, not probes. Cached best moves promote the principal variation.
- `CrossStepSearchCache` is a second level scoped to targets/caps/stats/roster/settings. Completed passes merge back. Same-state redispatch reuses well; realized condition-queue context shifts across steps, so general step-advanced reuse is rare. Relaxing that key would mix different future conditions.
- `buildOrderedMoveCandidates` applies each legal move and ranks its post-state with `estimatePostMoveStateScore`, then tie-breaks by existing progress/survival rules. Fix inputs here rather than adding a recommendation-only lane or hard-filtering legal moves.
- The goal-unlock heuristic keeps enablers of gated techniques in the beam; `setupFor` explains that recommendation to the player.
- `findOptimalPath` follows cached `bestMove` entries; greedy fallback is only for cache misses, so the displayed rotation stays aligned with the searched tree.

### Probability and safety

Success and crit use expected gains, with progress expectation **`p * min(gain, headroom)`**, not `min(p * gain, headroom)`: only successful gains can hit the bar cap. The latter expression hides failure risk on overshooting techniques.

The visible condition queue is normalized to length three; beyond it search uses probability-weighted distributions. The runtime/native condition path and local fallback are not interchangeable for discordance yet (known gap).

Immediate survival is not flattened into EV. `calculateActionSurvivabilityFloor` estimates guaranteed stability, but has a known payment/mastery/cleanup divergence from the actual transition. Separately, a real forced-failure transition ending below target sets `requiresProbabilisticSurvival`. Safety precedence applies when a viable safe live alternative exists; a certain-failure line does not outrank a winnable gamble simply because it is “certain”. Worker merging preserves the same flags and score ordering.

Chance-conditioned payment buffs use transient independent branches for expected current payment; they do not create a probability-aware persistent future-buff model.

### Score layers

1. Conjunctive tier/gate score: tier rank, minimum bar margin, weighted balance, bonus-roll credit and residual shortfall.
2. Unilateral extra bands, gated on the secured tier and bounded by the real bar flats and completion refund ceiling.
3. Buff future return and resources as future productive turns.
4. Stability/runway penalties while the goal is unsecured.
5. Overshoot/hard-cap and finished-shortfall penalties; tiny resource tie-breakers after goals are met.

The constants' commensurability is documented beside them in `search.ts`: a tier step exceeds the within-tier stack; death exceeds a tier step. Scale matters across early/late crafts, so isolated fixed bonuses are dangerous.

Extra perfection bands scale stacks by 20% of base per band beyond the tier baseline; sublime also earns harmony-augment quality. Completion extras increase the sublime-capable material refund by 20% per band, capped at 80%. These are independent rewards, not a reason to abandon the binding tier gate.

Live horizon leaves bank **guaranteed** extras only: fractional noise was measured to displace real buff setup. Terminal scoring includes bonus-roll fractions because the craft has resolved; otherwise different craft-ending gains tie and a Qi tie-breaker can prefer a zero-gain ender. Keep the soft overshoot penalty in both modes to distinguish overshooting live lines.

Harmony earns value through future outcomes and subsystem quality (heat distance, inscription blocks, alchemical charge, resonance state), not an invented flat harmony reward. `buildScoringContext` samples productive usable moves for representative runway gains and keeps each move's (completion, perfection) rate, damped to the per-bar averages and reduced to the non-dominated set. Remaining turns are the smallest count that covers both bars' remaining work using at most two of those rates (the optimum of the fractional two-bar covering problem), so a dual-bar move counts once and two single-bar moves never run concurrently. Without per-move rates the estimate falls back to the larger of the per-bar and total-work bounds. Work, runway and shortfall use the effective goals (the target tier, raised by the perfection band goal), not raw targets; the completion band ceiling only bounds extras.

## Workers

The established TypeScript search is the only engine. The experimental prior was retired after the evaluation recorded in [Engine decisions](ENGINE_DECISIONS.md#experimental-prior-retirement-70).

Workers receive plain data and reconstruct local caches/abort hooks. Root keys partition by stride, then partials merge by survival precedence/score/key. Each worker has its own search/cache. Epoch cancellation drops stale replies; a once-per-session probe and runtime failures fall back to synchronous search. Worker code is bundled inline into a blob URL because `mod://` cannot load ordinary chunks.

## Result contract

`SearchResult.outcomeProjection` carries tier/target tier, each bar's value/bands/requirement/next threshold, binding bar and auto-finish. The optional field supports older snapshots without a projection; UI maps rows/tones instead of recomputing bands.

Published completion/perfection gains diff the simulated post-state (`calculateRecommendationGains`) so triggered procs are visible. Stability uses the direct readout rather than presenting a projected survival floor as a promise. Craft-ending reasoning says it ends the craft, not that a buff will help nonexistent future turns.

## Determinism and tuning

Equal state, config and **fixed node work** can reproduce a recommendation when the clock is nonbinding; ordinary millisecond budgets cannot guarantee it. TS explicitly checks `Date.now()` as well as max nodes, so the same presets can reach different completed frontiers across machines or under load. Worker partitioning also needs to be held fixed for a like-for-like comparison.

`bun run optimizer:digest` fixes node budgets and makes the clock nonbinding for neutral refactor comparisons.

Presets coordinate depth/time/nodes/beam. Raising only one can waste the budget or worsen frontier quality; wider beams previously displaced useful depth. The measurements are in [Engine decisions](ENGINE_DECISIONS.md), and should be remeasured when workload changes.
