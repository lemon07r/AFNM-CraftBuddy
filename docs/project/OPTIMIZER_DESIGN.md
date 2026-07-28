---
title: Optimizer Design
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-27
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

How CraftBuddy decides what to do next in AFNM **0.7.6**. Use `.agents/skills/craftbuddy-optimizer/SKILL.md` for the action checklist; this is the reference.

## Module boundary

`src/optimizer/index.ts` is the **only** entry point for everything outside `src/optimizer/*`. `src/modContent/*` and `src/ui/*` import from `../optimizer`, never from a submodule, so there is one authority per rule and no consumer can depend on internal layout. Anything the integration layer legitimately needs is added to the barrel (for example `clampForgeHeat`, `getForgeRecommendedTechniqueTypes`, `preloadNativeMctsPolicyEngine`, `buildCanonicalNativeVariables`) rather than reached for directly.

| Module | Owns |
| --- | --- |
| `outcome.ts` | band widths, tier requirements, `willAutoFinish`. The single authority for every threshold. |
| `state.ts` | immutable `CraftingState`, generic `TrackedBuff` set, cache-key generation |
| `gameTypes.ts` | game-aligned types and shared formulas (`evaluateScaling`, expression evaluator, condition parsing, crit EV, `getBonusAndChance`) |
| `skills.ts` | transition engine (`calculateSkillGains`, `applySkill`, `canApplySkill`), masteries, buffs, harmony application |
| `harmony.ts` + `harmonyRegistry.ts` | the seven harmony subsystems and their static data, including the 0.7.6 per-bar-change Eccentric Decree fold |
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

Consequences that must not be re-litigated with weights:

- Pouring points into one bar cannot raise the tier once that bar's requirement is met. An additive weighted sum could, which is exactly why sublime crafts were mis-played before 0.7.5 (over-completion, or Perfection spam that never banked completion).
- `basic` is a real floor for a finished craft, but as a _live_ checkpoint it is suppressed while aiming at perfect/sublime, so banking completion alone cannot outrank progress on the binding bar.

## Terminal states: there is no manual finish

AFNM has no `Finish Craft` action, re-verified in 0.7.6. The craft resolves itself the moment `willAutoFinish(state, bands)` holds — see `docs/project/RUNTIME_EVIDENCE.md` section 2 for the extracted predicate and the proof that `Wait` is a normal technique costing 10 stability, not a finish button.

Search therefore:

- treats an auto-finishing state as **terminal** and scores it by its resolved tier, so nothing "improves" a state the game has already ended;
- keeps an internal, non-turn-consuming `Finish Craft` pseudo-action (`actionKind: 'finish'`) purely to price craft-end EV against continuing lines at the search frontier;
- never lets automation dispatch a finish once `willAutoFinish` holds, because the craft has already resolved. The auto-mode policy name `techniquesAndFinish` predates 0.7.5 and now means "may act on a craft-resolving recommendation", not "may press a finish button".

UI wording is "will auto-finish", never "you can finish crafting now".

## State and actions

- Immutable `CraftingState` with a deterministic cache key; tracked buffs are cloned defensively at the boundary.
- Buffs are a generic set of `TrackedBuff { key, stacks, duration, definition }`. The two legacy scalar `control/intensityBuffTurns` counters remain only as a fast path for simple turn-based buffs; **new effects must not use them**, or they double-apply against the definition-driven path.
- Actions: crafting techniques plus item (pill/reagent) actions supplied by the integration layer. Item actions do not consume lookahead turn depth.
- Integration seeds only canonical supplemental `nativeVariables`; state, buff and harmony mirrors are re-derived on demand instead of being persisted into cache keys.
- When the native crafting auto-use loadout covers an item, that item is removed from the action space by the integration layer, so search never proposes a consumption the game is about to perform itself.
- For a **sublime Eccentric Decree** craft only, a turn's transition also carries the ordered per-application bar changes that harmony's 0.7.6 `onBarChange` hook scores. `needsBarContributions()` gates this, so no event list is allocated for the other six harmonies (`docs/project/MECHANICS_PARITY.md` for the model and its known limits).

## Search

- `greedySearch(...)` — one-step selection.
- `lookaheadSearch(...)` — the main recommendation mode.
- `findBestSkill(...)` — public entry point choosing the strategy.

Characteristics:

- transposition table `Map<string, { score, bestMove }>` on normalized state keys with adaptive bucket sizing near targets. The key stays a string: profiling put key construction at **1.0-1.4%** of the search budget, so a packed numeric key was dropped rather than accept its collision risk
- iterative deepening over one shared table; only fully completed deeper passes replace shallower results
- beam-limited exploration with adaptive width at depth, and cached `bestMove` promotion so a deeper pass continues from the validated principal variation
- node budget counts cache-miss frontier expansions, not cache probes
- conservative stable-recommendation early exit, reported as `searchMetrics.earlyExit`
- `findOptimalPath()` reconstructs the displayed rotation from the table's `bestMove` chain, with greedy evaluation only on a cache miss
- optional Rust/WASM MCTS **root policy prior** for large or sublime searches when the Experimental engine is selected (see below)

### Probability handling

- Success and crit are expected values inside gains.
- Immediate survival is _not_ flattened into EV: `calculateActionSurvivabilityFloor(...)` computes a guaranteed post-action stability floor, and a proc-dependent line is treated as unsafe while a guaranteed-safe alternative exists and goals are unsecured. Hard-stop branches (guaranteed floor `<= 0`) are collapsed before ranking; sublime continuation lines may stay probabilistic while their floor is non-terminal. This is the Qi/stability juggling behaviour players praised and it has dedicated survivability regression coverage — do not weaken it.
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
   the effective tier or trade off the binding bar, and they bank **guaranteed
   bands only** in both live and terminal scoring — fractional bonus-roll EV
   let band-fraction noise at the horizon override real strategy (buff setup
   vs immediate progress) and is kept only as an analysis mode. The soft
   overshoot penalty stays active in both modes: it is the only ranking
   signal between two overshooting live lines. This is the
   `overcraftAmbition` search setting below; when off, the legacy conjunctive
   `min` term runs bit-identically.

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

## Rust/WASM engine

The Rust engine models the **same searchable action space** as TypeScript — generic buffs, effect trees, mastery, Soulflame, toxicity, item actions — and shares the conjunctive outcome model via `crates/craftbuddy-engine/src/outcome.rs`. Parity is proven by a 134-scenario / 1,432-transition differential corpus (`docs/project/MECHANICS_PARITY.md`).

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
- **EV with guaranteed-survival guardrails.** Expected value for gains and conditions, plus a deterministic survivability floor so a craft is never spent on a recovery proc when a guaranteed line exists.
- **Rust as prior, TypeScript as authority.** Parity is proven mechanically, but ranking authority stays in one place.
