---
title: Optimizer Design
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.19-ac29603
last_verified: 2026-10-22
source_of_truth: src/optimizer/outcome.ts, src/optimizer/search.ts, src/optimizer/skills.ts, src/optimizer/state.ts, src/optimizer/harmony.ts, src/optimizer/index.ts, src/optimizer/nativeMcts.ts, crates/craftbuddy-engine/*, src/settings/index.ts
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/project/TESTING.md
  - scripts/optimizer/benchmark-engines.ts
---

# Optimizer Design

How CraftBuddy decides what to do next in AFNM **0.7.19**. Use `.agents/skills/craftbuddy-optimizer/SKILL.md` for the action checklist; this is the reference.

## Module boundary

`src/optimizer/index.ts` is the **only** entry point for everything outside `src/optimizer/*`. `src/modContent/*` and `src/ui/*` import from `../optimizer`, never from a submodule, so there is one authority per rule and no consumer can depend on internal layout. Anything the integration layer legitimately needs is added to the barrel (for example `clampForgeHeat`, `getForgeRecommendedTechniqueTypes`, `preloadNativeMctsPolicyEngine`, `buildCanonicalNativeVariables`) rather than reached for directly.

| Module | Owns |
| --- | --- |
| `outcome.ts` | band widths, tier requirements, `willAutoFinish`. The single authority for every threshold. |
| `state.ts` | immutable `CraftingState`, generic `TrackedBuff` set, cache-key generation |
| `gameTypes.ts` | game-aligned types and shared formulas (`evaluateScaling`, expression evaluator, condition parsing, crit EV, `getBonusAndChance`) |
| `skills.ts` | transition engine (`calculateSkillGains`, `applySkill`, `canApplySkill`), masteries, buffs, harmony application |
| `costStats.ts` | independent zero-based cost-channel composition and cost flooring |
| `harmony.ts` + `harmonyRegistry.ts` | the nine harmony subsystems and their static data, including per-bar Decree, Captivating Cadence and Returning Cycle |
| `search.ts` | move ordering, bounded lookahead, scoring, `OutcomeProjection` |
| `nativeMcts.ts` | the bridge to the Rust engine |

## The conjunctive outcome model

This is the core of the 0.7.5 rework, unchanged in 0.7.6, and the reason the old additive scorer was deleted.

The game resolves a craft by counting **bands** on each bar independently, then requiring a conjunction:

```text
band widths grow by 1.3x each (runtime qIa)
basic   = 1 completion band
perfect = 1 completion band AND 1 perfection band
sublime = 2 completion bands AND 2 perfection bands   (recipe must have a sublime item)
```

`deriveOutcomeBands(config)` derives the widths, the auto-finish flats and the recipe's reachable `targetTier`; `classifyOutcome(state, bands)` returns the guaranteed tier, per-bar band counts and margins, and which bar is blocking.

Because widths compound by `BAND_GROWTH_RATIO` (`1.3`), the band boundaries land at roughly **100% / 230% / 399% / 619% / 904%** of the recipe target. Sublime's two-band gate is the ~230% mark players read as the optimizer "stopping around 200%".

Consequences that must not be re-litigated with weights:

- Pouring points into one bar cannot raise the tier once that bar's requirement is met. An additive weighted sum could, which is exactly why sublime crafts were mis-played before 0.7.5 (over-completion, or Perfection spam that never banked completion).
- `basic` is a real floor for a finished craft, but as a _live_ checkpoint it is suppressed while aiming at perfect/sublime, so banking completion alone cannot outrank progress on the binding bar.

## Terminal states: there is no manual finish

AFNM has no `Finish Craft` action. The craft resolves itself when stability <= 0 or both actual bar caps are reached. `willAutoFinish(state, bands)` mirrors this rule; 6.9.0 removes the stale five-band overcraft shortcut. See `docs/project/RUNTIME_EVIDENCE.md` §18.4 (superseding §12.5) and section 2 for `Wait`, a normal technique costing 10 stability, not a finish button.

Search therefore:

- treats an auto-finishing state as **terminal** and scores it by its resolved tier, so nothing "improves" a state the game has already ended;
- keeps an internal, non-turn-consuming `Finish Craft` pseudo-action (`actionKind: 'finish'`) purely to price craft-end EV against continuing lines at the search frontier;
- never lets automation dispatch a finish once `willAutoFinish` holds, because the craft has already resolved. The auto-mode policy name `techniquesAndFinish` predates 0.7.5 and now means "may act on a craft-resolving recommendation", not "may press a finish button".

UI wording is "will auto-finish", never "you can finish crafting now".

## State and actions

- Immutable `CraftingState` with a deterministic cache key; tracked buffs are cloned defensively at the boundary.
- Buffs are a generic set of `TrackedBuff { key, stacks, duration, definition, internalState }`. The two legacy scalar `control/intensityBuffTurns` counters remain only as a fast path for simple turn-based buffs; **new effects must not use them**, or they double-apply against the definition-driven path.
- Actions: crafting techniques plus item (pill/reagent) actions supplied by the integration layer. Item actions do not consume lookahead turn depth.
- Integration seeds only canonical supplemental `nativeVariables`; state, buff and harmony mirrors are re-derived on demand instead of being persisted into cache keys.
- When the native crafting auto-use loadout covers an item, that item is removed from the action space by the integration layer, so search never proposes a consumption the game is about to perform itself.
- For a **sublime Eccentric Decree** craft only, a turn's transition also carries the ordered per-application bar changes that harmony's `onBarChange` hook scores. `needsBarContributions()` gates this, so no event list is allocated for the other eight harmonies (`docs/project/MECHANICS_PARITY.md` for the model and its known limits).

### 0.7.17 transition order

Pay toxicity, droplets and buff costs; capture success chance; execute effect masteries; recompute/pay Qi and stability; apply successful technique effects. Then tick type-specific and ordinary effects only for buff names present before the action, resolve harmony with reported payment, advance the condition and perform normal decay/cap/floor cleanup. New buff names survive without an immediate tick; an existing name refreshed by the action still ticks. Cost reductions and penalties are independent zero-based multiplicative channels, not generic stat additions (`costStats.ts`).

Chance-conditioned payment effects use transient, independent payment branches to get the current-action expected payment right. They do not add recursive search branches or a probability-aware future-buff model. The existing survivability guard remains separate from EV.

Returning Cycle holds a fixed starting `chargeSize`, accrues reported Qi payment even on failure, drains charges before stabilization releases them, and adds ordinary Returned Precision (+1 crit point/stack, decaying on later actions). It earns value through simulated future outcomes, with no new flat score or forced Stabilize recommendation. Details and remaining approximations are in `MECHANICS_PARITY.md`.

## Search

- `greedySearch(...)` — one-step selection.
- `lookaheadSearch(...)` — the main recommendation mode.
- `findBestSkill(...)` — public entry point choosing the strategy.

Characteristics:

- transposition table `Map<string, { score, bestMove }>` on normalized state keys with adaptive bucket sizing near targets. The key stays a string: profiling put key construction at **1.0-1.4%** of the search budget, so a packed numeric key was dropped rather than accept its collision risk
- iterative deepening over one shared table; only fully completed deeper passes replace shallower results
- beam-limited exploration with adaptive width at depth, and cached `bestMove` promotion so a deeper pass continues from the validated principal variation
- node budget counts cache-miss frontier expansions, not cache probes
- optional **cross-step table** (`CrossStepSearchCache` in `crossStepCache.ts`): `modContent` hands one table per craft scope (targets/caps/stats/roster/settings signature, including all three ambition settings; budget fields excluded) and the search treats it as a second level under its per-call table. Exact-depth hits copy through, truncated-frontier fallbacks and PV promotion may consult it, and only completed passes merge back at search end, so a truncated search never publishes a partial frontier. Reuse is exact for unchanged-state redispatches within the same scope and structurally rare for step-advanced states: the key carries the realized condition-queue context (visible window + stochastic tail draws), which shifts every step — relaxing it would mix scoring contexts that genuinely differ. Hits are reported as `searchMetrics.crossStepHits`; measurements in `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`
- conservative stable-recommendation early exit, reported as `searchMetrics.earlyExit`
- optional **worker-pool backend** (`searchBackend.ts` + `src/worker/searchWorker.ts` + `src/modContent/searchBackendClient.ts`): the search input crosses to blob-URL workers in a plain-data wire format (transposition table and abort hook are stripped and reinstalled per worker), root candidates partition by stride (`key i % N`) when `searchThreads > 1`, and ranked partials merge by survival precedence, then score with a key tiebreak (except that a synthetic finish cannot displace a better live line solely on safety grounds). Deep scores are absolute. The native MCTS prior is root-parallel with `seed = baseSeed + i`. A once-per-session smoke probe gates the pool; on failure the caller runs the synchronous engine unchanged. Cancellation is epoch-based: a newer dispatch posts cooperative cancels (polled via `SearchConfig.shouldAbort` at budget checks) and drops stale replies. Measurements in `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`
- `findOptimalPath()` reconstructs the displayed rotation from the table's `bestMove` chain, with greedy evaluation only on a cache miss
- optional Rust/WASM MCTS **root policy prior** for large or sublime searches when the Experimental engine is selected (see below)

### Probability handling

- Success and crit are expected values inside gains.
- Immediate survival is _not_ flattened into EV: `calculateActionSurvivabilityFloor(...)` estimates a guaranteed post-action stability floor, and a proc-dependent line is treated as unsafe while a guaranteed-safe alternative exists and goals are unsecured. Hard-stop branches (floor `<= 0`) are collapsed before ranking; sublime continuation lines may stay probabilistic while their floor is non-terminal. **Known gap:** this helper pays before buff consumption and omits effect masteries, so it can disagree with the actual transition; see `MECHANICS_PARITY.md` known limitations.
- Since 6.9.0, a technique whose real failure transition ends the craft below target carries `requiresProbabilisticSurvival`, so EV progress cannot outrank a guaranteed route. This check uses `applySkill` with failure forced; it does not repair the separate floor helper.
- The condition queue is normalized to the game's visible length `3`; beyond it, transitions are probability-weighted (`enableConditionBranchingAfterForecast`, `conditionBranchLimit`, `conditionBranchMinProbability`).
- Condition transitions come from `modAPI.utils.getNextCondition` with a legacy fallback.

### Scoring

`scoreState()` layers, in evaluation order:

1. **Conjunctive goal score** — the whole point is `Math.min` on the two margins:

   ```text
   totalTargetMagnitude * ( TIER_VALUE_SCALE * tierRank
                          + GATE_WEIGHT      * min(completionMargin, perfectionMargin)
                          + BALANCE_WEIGHT   * weightedMarginAverage
                          + BONUS_ROLL_WEIGHT* bonusCreditWhenOneBandShort
                          + IN_TIER_PROGRESS_WEIGHT * residualShortfall )
   + ( EXTRA_BAND_WEIGHT            * extraPerfectionBands
     + COMPLETION_EXTRA_BAND_WEIGHT * extraCompletionBands ) * baseTargetMagnitude
   ```

   The extras term counts each bar's banked bands past the target tier
   **unilaterally** (`computeOvercraftExtras` in `outcome.ts`), because the
   runtime pays them independently: every extra perfection band scales the
   result (`stacks * (1 + (bands - baseline) * 0.2)`, plus +1 harmony-augment
   quality on the sublime path), and every extra completion band grows the
   material refund (20% of recipe cost each, capped at 80%, so only the first
   five bands pay and only on sublime-capable crafts). Evidence:
   `docs/project/RUNTIME_EVIDENCE.md` section 12. The pre-6.2 behavior counted
   extras conjunctively (`min` of the two bars), which plateaued at the target
   tier: one-sided perfection pushes earned nothing. Extras are gated on the
   target tier being secured (both margins `>= 1`), so they can never raise
   the effective tier or trade off the binding bar, and they are bounded by
   the finish flat: the runtime clamps both bars at the flat, so
   `buildOutcomeBands` derives the extras ceiling from the flat's band count
   even when the game exposes no explicit cap — overshoot the game could
   never bank earns nothing. The two scoring horizons disagree on fractions
   **on purpose**. Live (horizon) leaves bank **guaranteed bands only**:
   fractional bonus-roll EV at the horizon let band-fraction noise override
   real strategy (buff setup vs immediate progress). Terminal scoring prices
   the fraction (`fractionalExtras: true` in `scoreFinishedOutcome`): once the
   craft has actually resolved, each bar's bonus-roll chance is the runtime's
   expected band count, so craft-ending lines that bank different partial
   bands no longer collapse onto one identical score — before this, every
   craft-ending action past the secured tier scored bit-identically and the
   qi-spent tie-breaker could prefer a zero-gain ender over a refine banking
   most of the next band. The soft overshoot penalty stays active in both
   modes: it is the only ranking signal between two overshooting live lines.
   This is the `overcraftAmbition` search setting below; when off, the legacy
   conjunctive `min` term runs bit-identically. The user
   `completionBandCeiling` folds in here as one more bound on the completion
   ceiling (see *Ambition targets*), never below the tier's own requirement.

2. **Buff valuation** — expected future return while the target tier is unmet.
3. **Resource value** — qi and stability as future turns of progress; tiny tie-breakers only once goals are met.
4. **Survivability** — guarded stability/runway penalties, skipped entirely once the active goal is met.
5. **Overshoot / hard-cap and finished-shortfall penalties.**

Commensurability is deliberate and documented next to the constants in `search.ts`: one tier step (`2x` magnitude) strictly exceeds the maximum within-tier stack (`<= ~1.6x`), and death (`3x`) exceeds a tier step, so banking a tier always beats margin polish and dying never beats progress.

Harmony value is routed through its effect on the reachable tier plus a subsystem-quality term (forge heat distance, inscription stack/block progress, alchemical charge progress, resonance target/strength/pending-switch), not as a flat additive bonus.

`buildScoringContext()` samples the top three productive currently-usable moves so runway estimates use representative live gains instead of base stats.

### Move ordering

`buildOrderedMoveCandidates()` is the only beam-ordering path. It applies every legal move, scores the resulting state with `estimatePostMoveStateScore(...)`, and tie-breaks with `compareMoveCandidatesForTie(...)`, immediate progress, and the guaranteed survivability floor.

A **goal-unlock heuristic** promotes actions that unlock a gated high-value technique (for example rushing completion to `100%` to enable False Fusion), so completion-rush lines survive beam pruning at limited depth. When such an action is recommended, the result carries a `setupFor: { techniqueKey, reason }` hint so the panel can explain it instead of the turn looking wasted.

No legal skill is hard-filtered before evaluation. If a move class is mis-ordered, fix the transition or post-move scoring inputs — never add a second heuristic lane that can disagree with recursive search.

### Result contract

`SearchResult` carries an `OutcomeProjection` populated by one `withOutcomeProjection` wrapper around `greedySearch` / `lookaheadSearch`: guaranteed tier, target tier, per-bar `{ value, bands, requiredBands, nextThreshold, pointsToNextBand }`, the binding bar, and `willAutoFinish`. Presentation code consumes this; it must never recompute a threshold. The field is optional so pre-0.7.5 replay fixtures still load.

Published per-action gains (`expectedGains`) are derived from the **simulated post-action state** (`calculateRecommendationGains` diffs the projected state against the current one), so they include triggered buff procs — a direct technique readout understates proc-driven moves and once showed a craft-ending proc play as "+0/+0". Stability stays on the direct readout (its projection is a survival floor, not a promise). Reasoning for a craft-ending action says "Ends the craft" instead of advertising buffs "for next turns" that will never happen.

## Rust/WASM engine

The Rust engine models the **same searchable action space** as TypeScript — generic buffs, effect trees, mastery, Soulflame, toxicity, item actions — and shares the conjunctive outcome model via `crates/craftbuddy-engine/src/outcome.rs`. The differential corpus has 177 scenarios / 1,554 cases: 1,352 legal transitions and 202 illegal-action checks (`docs/project/MECHANICS_PARITY.md`).

Its role in a search is still a **root policy prior**, by design:

- requested only after cheap terminal/target checks, for large or sublime crafts
- capped to roughly `15-20%` of the remaining TypeScript budget (`500 ms` max)
- may break a near-tie only when both candidates appear in the native policy
- cannot hard-filter a skill or overturn a clear TypeScript score difference

TypeScript remains the differential oracle and the fallback when WASM is unavailable. Measured engine performance and the optimizations that were rejected with data live in `docs/project/ENGINE_PERFORMANCE.md`.

## User goal-priority bias

`searchGoalPriorityBias` is a persisted setting, default `0`.

- `-100` perfection priority, `0` balanced, `100` completion priority.
- Balanced is mathematically neutral: weights follow remaining-work need share.
- The bias shifts the same weight function used by live scoring and craft-end scoring, so it steers real search rather than a UI-only heuristic. It cannot override a band gate — a tier still needs both bars.

## Ambition targets

`perfectionBandGoal` and `completionBandCeiling` let the player state how far
past the tier requirement a craft should be played. Both use `0` as **auto**,
which is the pre-6.4 behaviour bit-for-bit: `normalizeAmbitionBands` collapses
anything non-finite or `<= 0` to `undefined`, and `src/settings/index.ts`
clamps a stored value to `AMBITION_BAND_MAX` (`8`).

Their goal/scoring effects enter through three helpers:

| Entry point | Effect |
| --- | --- |
| `buildOutcomeBands` (`outcome.ts`) | normalizes both values onto the bands object as `ambitionPerfectionBands` / `ambitionCompletionCeilingBands`. Thresholds, flats and cap band counts are derived exactly as before. |
| `deriveBandGoals` (`search.ts`) | raises the effective perfection goal to `bandThreshold(targetPerfection, goal)` when the requested band count exceeds `TIER_REQUIREMENTS[targetTier].perfection`, still passed through `clampGoalByCap`. It can only raise, never lower. |
| `computeOvercraftExtras` (`outcome.ts`) | bounds completion extras by `Math.max(completionRequired, Math.min(capBandCount, sublime ? 5 : required, userCeiling))`, so extra completion past the chosen band stops earning score while the target tier stays reachable. Perfection extras stay uncapped — more stars is the point of the pair. |

All terminal scoring call sites pass both band settings as of 6.9.0. Integration
stale-settings detection and cross-step cache scope also include them and
`overcraftAmbition` (`src/modContent/recommendationContext.ts`), so changing
ambition cannot retain an old recommendation or reuse a differently valued score.

What these settings deliberately do **not** touch: tier classification,
`TIER_REQUIREMENTS`, band thresholds and `willAutoFinish`. They change the goal
the search works toward, not the game's outcome tiers, and `outcome.ts` remains
the single authority for every threshold. No scoring constant moved for them.

Rust parity is full: `EngineConfig` (`crates/craftbuddy-engine/src/lib.rs`)
carries `perfection_band_goal` / `completion_band_ceiling` with serde defaults,
mirrored in `build_outcome_bands`, `compute_overcraft_extras` and `goals()` in
`outcome.rs`. The wire fields are snake_case, written by
`src/optimizer/nativeMcts.ts`.

## Determinism expectations

For a fixed state, config and budget the recommendation is deterministic; `differential_tests::mcts_search_is_deterministic` asserts that directly on the Rust side over all corpus scenarios.

Because lookahead is bounded by wall clock, node cap, beam width and iterative deepening, the same slider values reach different depths on different machines. `searchTimeBudgetMs`, `searchMaxNodes`, `searchBeamWidth` and `lookaheadDepth` define a budget _envelope_, not a cross-machine guarantee. An incomplete deeper pass never mixes partial scores into the final ranking.

## Performance tuning

### User-tunable controls

- `lookaheadDepth` (`1-96`, default `48`)
- `searchTimeBudgetMs` (`100-10,000`, default `2,000`)
- `searchMaxNodes` (`1,000-5,000,000`, default `1,000,000`)
- `searchBeamWidth` (`3-20`, default `5`)
- `searchGoalPriorityBias` (default `0`)
- `overcraftAmbition` ("Push Extra Bands", default **on**)
- `perfectionBandGoal` ("Perfection Band Goal", `0-8`, default `0` = auto)
- `completionBandCeiling` ("Completion Band Ceiling", `0-8`, default `0` = auto)

`overcraftAmbition` switches the extras term between the unilateral
runtime-faithful model (on) and the legacy conjunctive `min` (off); see the
scoring section. Replay snapshots capture it, so a snapshot replays under the
ambition it was recorded with; pre-6.2 snapshots without the field replay with
the new default (on).

Sliders persist on commit, not per drag. They are coupled: over-raising one while starving the others reduces effective frontier quality, which is why presets exist. Beam stays narrow through mid-budget tiers because replay benchmarking showed a wide beam can strand the search on a shallow frontier.

### Internal defaults

- iterative deepening, adaptive beam, condition branching beyond forecast: on
- branch limit `2`, branch minimum probability `0.15`
- engine mode `legacy` by default; `experimental` enables the native prior when inline WASM is available and the search is large or sublime
- legacy default preset Fast (`48` depth, `2,000 ms`, `1M` nodes, beam `5`)
- experimental preset ceiling `4,000 ms`, under the `4,500 ms` responsiveness cap
- MCTS: up to `250` iterations, rollout depth `8-16` from preset depth, exploration `1.15`, node cap `5,000`

### Cost/quality tuning order

1. raise `searchMaxNodes`
2. raise `lookaheadDepth`
3. adjust `searchBeamWidth`
4. raise `searchTimeBudgetMs` only as needed

For ~90-turn crafts, increase depth gradually, avoid maxing depth and beam together on slow machines, and prefer bounded multi-second budgets.

## Key design decisions

- **One outcome authority.** Bands, tiers and the auto-finish predicate live only in `outcome.ts` (mirrored in Rust). Duplicating a threshold anywhere else is a defect, not an optimization.
- **Conjunctive goals over tuned weights.** Gates, not weights, decide tiers; the weights only order candidates inside a tier.
- **Pure optimizer core.** No game runtime, DOM, Redux or settings access in `src/optimizer/*`.
- **EV with survival guardrails.** Expected value for gains and conditions, plus failure-branch checks and a deterministic floor helper; its remaining payment-phase limitation is explicit above.
- **Rust as prior, TypeScript as authority.** Parity is proven mechanically, but ranking authority stays in one place.
