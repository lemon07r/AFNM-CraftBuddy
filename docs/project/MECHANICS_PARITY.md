---
title: Mechanics Parity Status
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.17-d8ae6ce
last_verified: 2026-10-29
source_of_truth: src/optimizer/outcome.ts, src/optimizer/skills.ts, src/optimizer/harmony.ts, src/optimizer/harmonyRegistry.ts, src/optimizer/gameTypes.ts, src/optimizer/state.ts, src/optimizer/search.ts, src/optimizer/nativeMcts.ts, src/modContent/harmonyState.ts, crates/craftbuddy-engine/*
review_cycle_days: 30
related_files:
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/dev-requests/STATUS.md
---

# Mechanics Parity Status

The historical **0.7.17** mechanics baseline, the subsequent stochastic-planner changes, and the limits of the available parity evidence.

Authority order: installed runtime bundle → tests → this document. When they disagree, the runtime wins and this file is wrong. `docs/project/RUNTIME_EVIDENCE.md` preserves the 0.7.17 baseline and records the current 0.7.18 auto-finish predicate in section 18.

## October 2026 audit and planner revision

The installed runtime inspected in the audit was **0.7.18-97c093b**, while CraftBuddy 6.8.0 targeted 0.7.17. Historical corpus counts and release results below describe that earlier baseline, not exhaustive proof of 0.7.18 or the new planner. Current results and all recorded automated-review dispositions are recorded in [PR4_REVIEW_VALIDATION.md](PR4_REVIEW_VALIDATION.md).

The production planner now uses discrete supported success, crit and effect chance branches from the TypeScript transition model. Future buff state stays inside those branches; bounded enumeration records unresolved probability rather than pretending unexplored outcomes are safe. A separate handwritten stability simulation is not authoritative: payment and mastery phases must agree with the action transition used for planning. Expected-value APIs remain for display and legacy/reference search.

`resolvePlanningGoals` separates requested completion/perfection from actual item tiers. Explicit 1-8 band settings request both bars up to their actual caps. Auto requests the caps with extra-band ambition enabled, or the ordinary tier requirements with it disabled. Missing caps fall back to ordinary requirements. The persisted completion ceiling key now represents a Completion Band Goal. Item tiers and band thresholds are unchanged. The old five-completion-band early-finish shortcut was removed from the model after checking installed 0.7.18: resolution requires stability zero or both actual cap flats. The same flat-cap rule was already recorded in the 0.7.17 runtime evidence.

New goal tests demonstrate that provably inert full-bar restoration can be pruned while recovery that unlocks cooldowns or useful buffs remains available, selected-goal work remains after baseline success, and immediate terminal scores retain the same goal settings at every depth. These tests do not prove every requested craft feasible or all effects supported. Any unsupported effect or exhausted branch budget must be distinguished from a proven safe continuation.

Rust remains a reference for the historical transition surface. Its old EV scorer/prior does not implement the new production planner or certify its goal semantics. Do not infer new cross-engine parity from the older corpus.

## How parity is proven

| Layer | Proof |
| --- | --- |
| Formula/transition parity vs the game | `gameAccuracy.test.ts`, `runtimeParity.test.ts`, `skills.test.ts`, `harmony.test.ts`, plus `runtime0717.test.ts` and `returningCycle.test.ts` for the current retarget |
| Outcome/band/tier model | `outcome.test.ts`, `outcomeProjection.test.ts` |
| TypeScript ↔ Rust engine parity | the differential corpus: `src/__tests__/fixtures/differentialCorpus.ts` → `engineDifferential.test.ts` (TS side) and `crates/craftbuddy-engine/tests/differential_corpus.json` → `differential_tests.rs` (Rust side) |
| Multi-turn behaviour | `craftSimulation.test.ts`, replay fixtures in `src/__tests__/__fixtures__/replay-snapshots/` |

The corpus is schema v4 and covers **177 scenarios / 1,554 cases**: **1,352 legal transitions** and **202 illegal-action checks**. `expected` asserts qi, droplets and droplet cap, additive item effectiveness, stability, stability penalty, completion, perfection, toxicity, harmony, step, completion bonus, cooldowns, the active-buff set (including per-buff `internalState`), `items`, `consumedPillsThisTurn`, and a `harmonyData` digest. Regenerate with `bun run optimizer:differential-corpus`; never hand-edit the JSON.

The 0.7.17 retarget adds focused TS/Rust tests for payment phases, new-name buff survival and Returning Cycle. Current release-gate results are recorded in `RELEASE_NOTES_6.8.0.md`; the three Rust profiling harnesses remain intentionally ignored during ordinary tests.

## The 0.7.17 retarget

Runtime source and offsets: `RUNTIME_EVIDENCE.md` §17. The model is mirrored in TypeScript and Rust; no scoring constants or outcome thresholds changed.

| Mechanic | Model |
| --- | --- |
| Cost channels | `qiCostReduction`, `qiCostPenalty`, `stabilityCostReduction`, `stabilityCostPenalty` are independent zero-based multiplicative channels. Stack-scaled contributions are folded once; flat surcharge, condition and harmony ordering follow the runtime. Legacy percentage inputs normalize at the state boundary; legacy buff adjustments apply only to the side with an actual legacy stat, never floor an untouched fractional modern baseline. |
| Payment phases | Toxicity → droplets → buff costs → success-chance capture → effect masteries → recomputed Qi/stability payment → success-only technique effects. Failed actions still pay, retain mastery effects and resolve harmony. |
| Chance payment buffs | The 0.7.17 release used transient independent payment branches for current-action EV. The revised production path preserves supported discrete decisions through payment and subsequent state; bounded branch coverage is reported explicitly. |
| Droplets | `qiDroplets` / `maxQiDroplets`, `dropletCost`, legality, payment, cloning, replay and native bridge all preserve the runtime payload. New Stablizing Circuit data flows through the generic effect path. |
| Buff tick membership | Snapshot pre-action buff names; only those names receive type-specific/ordinary ticks. A new name survives its creation turn; a refreshed existing name still ticks. |
| Scaling and triggers | Preserve `additionalVariables`, room-effectiveness opt-in, nested scaling multiplier/step rules, integer rounding and `setState.keys`. Triggered blocks run general buff effects with a re-entry guard and running bars, so Converging Jade's completion also feeds Bifang's `percentGained` normally. |
| Item effectiveness | Live additive stat, neutral 0, carried through extraction/state/copy/cache/replay/worker/native bridge. `isItem` multiplies by `1 + itemEffectiveness / 100`; Calming Mind Pill's 4 stacks remain 4 at neutral. |
| Worker state | Exhaustive wire schema and JSON round-trip regression preserve every state field, including simultaneous cost channels/full reduction, droplets, Returning Cycle and native variables; only the derived cache key is excluded. |
| Invasions | Fusion/Refinement Invasion are stackable ticking durations; their unscaled stat penalties are not multiplied by held stacks. |
| Returning Cycle | Ninth harmony, complexity 1.3, starting harmony 0, no recommendations. Fixed `chargeSize = max(1, raw starting maxpool × .1)`; reported nonnegative Qi payment accrues even on failure. Each full charge drains 3 harmony and 30% of its charge size in Qi per action. Stabilize drains first, then releases all charges for +10 harmony and +5 Returned Precision each, retaining the partial stored-Qi remainder. Missing/invalid data reinitializes. |
| Returned Precision | Ordinary stackable buff: +1 crit point per stack, loses one stack per subsequent action. Existing stacks tick before release; fresh release stacks neither decay nor boost the release action. |

Captivating Cadence (0.7.11/0.7.12) remains modelled: non-repeating types extend a chain, granting `+3 × chain` harmony after its first entry and +2% control/intensity per chain point. Repeating a type clears it, costs 50 harmony and 1 max stability; complexity is 1.5.

Corpus sanity: all 142 previous scenarios and their legality outcomes remain; the seeded eight-type random pool is frozen rather than remapped by the ninth registry entry. Two registry matrices plus 12 retarget and 16 Cycle cases originally added 30 scenarios / 50 cases. Review added five cases for fractional cost channels, combined Jade+Bifang, and Calming Mind at neutral/positive/negative effectiveness. Fresh comparison found no outcome changes in the existing 172 scenarios; item-effectiveness scalar checks were added throughout.

## The 0.7.6 change: Eccentric Decree scores per bar application

This is the only crafting mechanics change in 0.7.6. The extracted runtime source, offsets and the exact per-event rules are in `docs/project/RUNTIME_EVIDENCE.md` section 4; what follows is only how CraftBuddy models it.

The runtime moved Eccentric Decree out of the end-of-turn `processEffect` hook into a new `onBarChange` hook fired **inside** `applyCompletion` / `applyPerfection`. One turn can therefore award harmony several times and flip its focused bar part-way through.

| Layer | Model |
| --- | --- |
| TypeScript | `processEccentricDecree` in `src/optimizer/harmony.ts` folds over an ordered `BarChangeEvent[]` supplied on `HarmonyProcessContext.barChanges` |
| Rust | the same fold over `BarChange` in `crates/craftbuddy-engine/src/lib.rs`, gated by `needs_bar_contributions()` in `effects.rs` |
| Event construction | `src/optimizer/skills.ts`: `scaleBarContributions` → `buildBarChangeEvents`, only when `needsBarContributions()` (sublime **and** `craftingType === 'eccentricDecree'`) |
| Fallback | no events → the pre-0.7.6 single end-of-turn delta, so replay fixtures recorded without event data degrade rather than mis-score |

Per event both engines clamp with `min(cap, max(0, floor(value)))`, award `+5` harmony when the focused bar advanced, **−15 harmony / −15 Qi Pool** when the other one did (−5/−5 only in 0.7.6), and flip focus when the focused bar's `getBonusAndChance(...).guaranteed` improved across that event. Like the runtime's own hook, the fold ignores the event's `bar` label and derives focused/stray by diffing both clamped bars.

### Known, deliberately unmodelled second-order effects

These are real gaps, not rounding noise. They are stated here so nobody "discovers" them as bugs.

1. **Mid-technique stat-modifier flip.** In the runtime a focus flip between two effects of the _same_ technique retunes intensity/control for the **later** effects of that technique. CraftBuddy evaluates effect scaling once per action, so a flip affects scoring and every subsequent turn, but not the remaining effect magnitudes within the same turn.
2. **Per-application reconstruction.** Legacy EV transitions reconstruct running bar values by distributing each aggregate proportionally across raw per-effect contributions (`scaleBarContributions`). Discrete action branches remove success/crit averaging at their decision sites, but do not by themselves prove exact runtime integer order for every multi-effect/trigger combination. Keep explicit parity cases for those combinations.
3. **Disciplined Touch and the legacy scalar path expose no per-effect breakdown**, so they synthesize one application per moved bar, completion first (`synthesizeBarContributions`). Identical in both engines, and equivalent to the old single-delta model except when a band is cleared between the two applications.

Seeding matches the runtime's laziness: `processEffect` and `onBarChange` both anchor absent state on the **current** bars, while only the game's `initEffect` seeds at zero at craft start. `seedEccentricDecreeData` in `src/modContent/harmonyState.ts` mirrors that, so attaching to a craft already in progress cannot retro-charge harmony for progress made before CraftBuddy saw it.

Everything else in 0.7.6 needed no model change: the Fallen Soulflame nerf is data carried by the definition-driven buff path, complexity multipliers are unchanged, the auto-use read path is unchanged, the False Fusion rename is display-only, and crafting toxicity cleansing never critted in either build.

## The 0.7.7/0.7.8 changes: stateful buffs, the Illume Crucible seal, and discordant conditions

0.7.7 introduced buffs that carry **per-instance internal state** written by triggered effects, and 0.7.8 added the Illume Crucible seal and rebalanced Eccentric Decree's stray penalty. The extracted runtime source and offsets are in `docs/project/RUNTIME_EVIDENCE.md` section 14; what follows is only how CraftBuddy models them. Every piece is mirrored in both engines and locked by the differential corpus (schema v3 digests each buff's `internalState`).

| Mechanic | Runtime behaviour | CraftBuddy model |
| --- | --- | --- |
| Buff `internalState` | Buffs carry an instance key→number map, seeded from the definition's `initialState` eqns at creation and readable by all of the buff's own eqns | `TrackedBuff.internalState` / `ActiveBuff.internal_state`, cloned on every transition, included in cache keys, signatures and the WASM bridge, seeded by `seedBuffInternalState` / `seed_internal_state` |
| `triggeredEffects` | Six crafting triggers (`completionGained`, `perfectionGained`, `poolSpent`, `poolRestored`, `stabilitySpent`, `stabilityRestored`) fire the buff's effect block with `amount` (and `percentGained` for the bar triggers) in scope | `dispatchBuffTriggers` / `dispatch_buff_triggers` run after costs and technique applications, before the per-turn buff fold, so the fold reads the state the triggers just wrote |
| `setState` effects | Write the buff's internal state (`set` / `add`); later effects in the same block read earlier writes | a `setState` arm in `executeBuffEffect` and the Rust `run` closure over a working state map |
| `percentGained` | `100 × (tier(after) − tier(before))` over the 1.3×-inflated threshold tiers (runtime `O7o`/`ox`) | `computeTriggerPercentGained` / `compute_trigger_percent_gained` on top of the shared `getBonusAndChance` / `bonus_and_chance` |
| True Bifang Flame | `completionGained` → `blaze = max(blaze, floor(percentGained))`; +0.03 control per blaze | definition-driven; no special case |
| Flame of the Azure Depths | `poolSpent` → charge accumulates `amount`, `stored` gains `floor(charge × 100 / maxpool)`, charge keeps the remainder; every action decays `stored` by 1 | definition-driven; the per-action decay is an ordinary `setState` per-turn effect |
| Illume Crucible `sealedMaxStability` | Max stability falls by 1 every action even when the technique prevents decay, and **no** max stability restoration applies while held (runtime `E7o`/`D7o`) | `hasSealedMaxStabilityBuff` / `has_sealed_max_stability_buff` force the decay and drop positive `maxStabilityChange`, `restoresMaxStabilityToFull`, and technique/buff max-stability deltas in the action fold, the survivability floor, and the display frame |
| `discordantConditions` (Uncontrollable Flames) | At the stay-neutral decision the runtime rolls `if (Math.random() >= d) return 'neutral'`: a would-be neutral outcome only holds `1 − d` of the time, the rest falls through to the harmony roll | `getBuffDiscordantConditions` takes the strongest `d` across held buffs; `getGeneratedConditionDistribution` / `generated_condition_distribution` apply `effectiveChange = change + (1 − change) × d` only at the final neutral/positive/negative block, matching the gate's placement |
| Eccentric Decree rebalance (0.7.8) | Stray bar change now costs **−15 harmony and −15 Qi Pool** (was −5/−5); the focused bar still awards +5 | constants updated in both engines; tests and corpus regenerated |

Verified unchanged, so no model change: Turbid Qi (first stack at step 100, then every 3 steps, granted after the step bump), all seven harmony complexity multipliers, Formless Way's starting harmony of 33, and reagent toxicity gating.

## The 0.7.9 changes: quality caps can be raised, and the Insight package was overhauled

0.7.9 reworked Purifying Flame and the crafting Insight package. The extracted runtime source is in `docs/project/RUNTIME_EVIDENCE.md` section 15. Only one of these needed a model change; the rest arrives through the live technique read.

| Mechanic | Runtime behaviour | CraftBuddy model |
| --- | --- | --- |
| `bonusMaximumQuality` (reworked Purifying Flame) | A held buff raises the achievable quality cap by extra threshold steps (+2 at pillarCreation and above, +1 below), each step stretching the bar by one more 1.3x-scaled threshold. The runtime sums it with `getMaxStepsBoost(entity.buffs)` and threads it into `getMaxCompletion`/`getMaxPerfection` as the optional 4th `maxStepsBoost` argument | `computeMaxStepsBoost()` in `src/modContent/qualityCap.ts` mirrors the sum exactly — `eqn` stripped, `stacks` pinned to 1 so a `stacks`-scaled bonus is not multiplied by the held count, each buff floored individually — and passes it to both cap getters, so `maxCompletionCap`/`maxPerfectionCap` — and every band, tier gate and auto-finish decision derived from them — see the real ceiling. A boost of `0` reproduces the pre-0.7.9 call exactly |
| `bonusQuality` (reworked Purifying Flame) | Awards bonus quality stars on the finished item when the craft reaches the maximum possible tier | **Not simulated by design**: a finished-item property that cannot change turn-to-turn play, like the `bonusHiddenPotential` it replaced. Typed on both engines' `BuffDefinition` for payload parity |
| Insight package overhaul | Insight control `.1`→`.15` per stack; new Perfected Understanding (`floor(perfectionPercentage / 100) * 2` Insight) and Sustained Revelation (5 stacks, each converting a refine into `+.08` perfection per Insight stack); Insightful Refinement removed; Seek Insight 16 pool / `.9` perfection | no model change — `convertGameTechniques` resolves the roster live every craft, and the payload shape was unchanged |
| Forge Compression rework | Rebuilt around a `stackGained.Pressure` trigger with new `pressureStacks`/`completion` masteries; 0.7.9 also added the dynamic `stackGained.<buff>` / `stackLost.<buff>` trigger family | no model change — triggered-effect dispatch already accepts string triggers, and masteries are read live |
| New cauldrons, extra core formation masteries | Two new cauldrons (Discernment, Hundredfold Lens); more crafting actions carry masteries | no model change — cauldrons are pre-craft equipment, and mastery data is read live per technique |

## The 0.7.10 change: Completion Bonus becomes a Perfection Boost stat

0.7.10 replaced the high-completion bonus's per-stack control with a new percentage stat. The extracted runtime source is in `docs/project/RUNTIME_EVIDENCE.md` section 16.

| Mechanic | Runtime behaviour | CraftBuddy model |
| --- | --- | --- |
| New boost stats | Four crafting stats join the registry — `completionBoost`, `perfectionBoost`, `stabilityBoost`, `qiBoost` — defaulting to `0` and formatted as percentages | `ScalingVariables`/`ScalingVars` carry all four on every evaluation, sourced from entity stats so any future buff or stat that grants them flows through the generic fold with no further code |
| Completion Bonus buff payload | Still a synthetic `"Completion Bonus"` buff re-created after every action with `stacks = getBonusAndChance(completion).guaranteed - 1`, but its payload is now `perfectionBoost: { value: 10, scaling: 'stacks' }` instead of `control: { value: .1, scaling: 'stacks' }` | the buff's own stat is **skipped during the generic buff-stat fold** (`COMPLETION_BONUS_BUFF_KEY` guard) and re-added as `perfectionBoost = completionBonus × 10` from the tracked stack count, so the stacks-to-boost mapping is exact even mid-turn when the runtime has not yet rebuilt its buff |
| Application point | The four appliers (`Yas`/`Xas`/`Gas`/`Zas`) floor the gain after the expected-crit multiplier, then apply `gain * (1 + boost / 100)` with a second floor — **positive amounts only** | `applyGainBoost` / `apply_gain_boost` wrap every completion, perfection, stability-restoration and pool-restore application in both engines, including `qiRestore`, technique `pool` effects, and buff-per-turn paths; costs and max-stability changes are untouched, matching the runtime |
| Cost/limit sides | Boosts never touch costs, max-stability evolution, discordant gates, or harmony scoring | confirmed unchanged; no code outside the four gain appliers reads them |

## 0.7.5 model changes

These are the semantics that changed with the 0.7.5 harmony rework and still hold in 0.7.6. Older CraftBuddy notes describing the opposite are wrong and have been removed.

| Behaviour | CraftBuddy |
| --- | --- |
| Harmony type is **chosen by the player** and is no longer derived from the item type | `src/modContent/craftingContext.ts` reads the selection from live craft state; `recipe.harmonyTypeOverride` remains the forced case. There is **no** item-kind inference anywhere, and the removed `modAPI.gameData.itemTypeToHarmonyType` utility is not referenced. |
| **Seven** harmony types at the 0.7.5 rework | Now nine: Captivating Cadence and Returning Cycle were added later; `harmonyRegistry.ts` and `harmony.ts` cover all nine. |
| Each harmony carries a **complexity multiplier** on sublime recipe targets | `applyComplexityMultiplier` applies `round(stat * cm)` wherever effective targets are derived, guarded against a non-positive multiplier. |
| Outcome tiers are decided **conjunctively** from completion _and_ perfection band counts | `src/optimizer/outcome.ts` is the single authority (`deriveOutcomeBands`, `classifyOutcome`, `TIER_REQUIREMENTS`, `willAutoFinish`); search, the Rust engine, and the panel all consume it. |
| There is **no manual finish action**; the craft resolves itself | `willAutoFinish` is the terminal predicate. `Wait` is a real technique costing 10 stability, not a finish button. |
| Native crafting **auto-use loadout** applies pills/reagents immediately before every technique | `src/modContent/nativeAutoUse.ts` mirrors the runtime selector; auto mode coexists with it instead of duplicating consumption. |
| Quality no longer blanket-improves an item; each harmony grants its own effect | CraftBuddy optimises the **reachable outcome tier**, not an abstract "quality" number. Per-harmony `harmonyAugment` item effects are out of scope: they resolve after the craft and cannot change turn-to-turn play. |

Harmony registry values, verified against the installed bundle:

| Harmony | Complexity multiplier | Starting harmony (sublime) | Notes |
| --- | --: | --: | --- |
| Forge Works | 1.2 | 0 | heat sweet spot verified at `2-3`, plus the `lastBuffedHeat` heat-1 quirk |
| Alchemical Arts | 1.2 | 0 | charge/reaction sequencing |
| Inscribed Patterns | 0.9 | 0 | stack-halving penalty on invalid colour |
| Spiritual Resonance | 1.3 | 0 | mismatch applies `-9` harmony / `-3` stability (the in-game log text saying `-15` is stale) |
| Formless Way | 1.5 | 33 | pins the harmony value every action instead of accumulating deltas |
| Enhancing Echo | 1.3 | 0 | only harmony that scales live Qi/stability action costs |
| Eccentric Decree | 1.0 | 0 | scores per bar application since 0.7.6; `+5` focused, `-15` harmony and `-15` Qi Pool for straying since 0.7.8 |
| Captivating Cadence | 1.5 | 0 | varied-type chains; repetition breaks the chain and costs 50 harmony / 1 max stability |
| Returning Cycle | 1.3 | 0 | fixed-size paid-Qi charges; drain before stabilize release; ordinary Returned Precision |

The multiplier only applies to **sublime** recipes, matching the runtime's `initCrafting` guard.

## Implemented mechanics

Transition and formula layer (`src/optimizer/skills.ts`, `gameTypes.ts`, `state.ts`):

- effect-tree technique evaluation, effect conditions, and the local JS-subset expression evaluator (guarded formula filtering, bounded compile cache)
- scaling evaluation with mastery `upgradeKey` rewrites, additive/multiplicative upgrades, and `percentage` fields treated as percentages
- crit expected value including excess-crit conversion
- generic active buffs with full definitions: stat contributions, per-turn effects, action-type effects (`onFusion` / `onRefine` / `onStabilize` / `onSupport`), expression gates, stack consumption. Definition-driven buffs such as False Fusion (displayed as "Strive for Completion" since 0.7.6) and Fallen Soulflame fragments flow through this path — there are no per-skill special cases, which is why the 0.7.6 Soulflame re-balance needed no code change
- stateful buffs (0.7.7+): per-instance `internalState` seeded from `initialState`, `triggeredEffects` on the six crafting triggers with `amount`/`percentGained` in scope, and `setState` writes visible to later effects in the same block — True Bifang Flame and Flame of the Azure Depths flow through this path with no per-buff code
- `sealedMaxStability` (0.7.8): forced per-action max-stability decay and full restoration block while an Illume Crucible-style buff is held
- `bonusMaximumQuality` (0.7.9): cap-raising buffs are summed at the modContent boundary and threaded into the game's own cap getters as `maxStepsBoost`, so the raised ceiling reaches the band model without the optimizer recomputing a threshold
- crafting boost stats (0.7.10): `completionBoost`, `perfectionBoost`, `stabilityBoost` and `qiBoost` multiply their respective gains after crit with a per-step floor, and the Completion Bonus buff's `+10 perfectionBoost` per stack is folded from the tracked stack count rather than re-read from the game-built payload
- `discordantConditions` (0.7.7+): the stay-neutral gate applied at the generated-condition distribution, in search, the forecast queue, and the live `getNextCondition` fallback
- dynamic max-pool buff evaluation for `% maxpool` restores with qi-cap clamping
- active-buff definition hydration from skill payloads when a runtime snapshot omits definitions
- Qi/stability costs: independent reduction/penalty channels, mastery-before-payment recomputation, condition/flat/harmony ordering and explicit droplet payment (0.7.17 table above)
- Turbid Qi step surcharge: first stack at step `100`, then every `3` steps, granted _after_ the step bump so it taxes later actions
- toxicity effects with the runtime's sign convention, per-turn detox, and the native `getMaxToxicity` ceiling for alchemy
- `noQiCost` techniques, `craftingTeamUpOverride` companion buffs, cooldowns, max-stability decay and `preventsMaxStabilityDecay`
- large-number-safe arithmetic, parsing, and formatting

Outcome layer (`src/optimizer/outcome.ts`):

- band widths from the recipe's completion/perfection stats, each successive band costing `1.3x` the previous (runtime `qIa`)
- `TIER_REQUIREMENTS`: `basic` = 1 completion band; `perfect` = 1 + 1; `sublime` = **2 + 2**, and only when the recipe has a distinct sublime item
- fractional bonus-roll chance carried separately from guaranteed bands, so a near-miss is never reported as banked
- `willAutoFinish` resolves at stability zero or both actual cap flats; five completion bands alone do not finish a 0.7.18 craft. The Rust reference predicate follows the same rule. Explicit zero caps stay zero; absent/non-finite caps use the documented fallback.
- unilateral overcraft reward scaling (`computeOvercraftExtras`): each extra perfection band scales result stacks by `1 + (bands - baseline) * 0.2` (baseline 1 perfect / 2 sublime, plus +1 harmony-augment quality on the sublime path), each extra completion band refunds 20% of recipe cost capped at 80% (five bands, sublime-capable crafts only), all gated on the target tier being secured — `docs/project/RUNTIME_EVIDENCE.md` section 12

Search layer (`src/optimizer/search.ts`): see `docs/project/OPTIMIZER_DESIGN.md`.

Integration layer (`src/modContent/*`):

- root-state ModAPI craft-session detection via `subscribe` / `getGameStateSnapshot`, with no English-DOM dependency for "is a craft open?"
- authoritative harmony hydration from `progressState.harmonyTypeData`, with forge-only recovery from verified runtime mirrors (`Heat` native variables / heat buff stacks) when the payload omits forge heat; other harmonies are treated as _missing_ rather than guessed
- native providers with guarded fallbacks: `getNextCondition`, `craftingTechniqueFromKnown`, `completionBonusBuffName`, `getActionCost`, `evaluateCraftingCondition`, `getActualCraftingStat`, `getMaxToxicity`, completion/perfection cap getters, all-depth `canUseAction` precheck
- canonical native-variable storage that strips state/buff/harmony mirrors from persisted optimizer state and re-derives them at evaluation time
- fixed 3-condition forecast queue normalization with probability-weighted EV beyond the forecast
- native crafting auto-use coexistence and the dispatch-time state-revision guard (`nativeAutoUse.ts`, `craftStateSignature.ts`)
- replay snapshots carrying `harmonyData` + `harmonyDataSource`, craft-context provenance, bounded turn history, and auto-mode state

## Bugs found and fixed

Each was verified against the installed bundle before the fix and has a regression test:

| Bug | Fix |
| --- | --- |
| Disciplined Touch scaled perfection off **control** | scales off `effectiveVars.intensity`, matching the 0.7.5 tooltip |
| Overcrit ratios divided by `100` twice | crit EV integration corrected |
| Mastery `percentage` fields used as raw multipliers | treated as percentages |
| Mastery upgrades multiplied across every numeric field | the game's replace behaviour applies to the intended field only |
| Soulflame triggers and their stability loss were absent | modelled through the generic buff-effect path (`runtimeParity.test.ts`) |
| Turbid Qi future-step stacks generated on the wrong step | grants after the step bump, from step `100` every `3` |
| Reversed toxicity sign on buff effects | corrected |
| Cost/stability rounding applied in the wrong order | floors after each buff, then condition multipliers |
| `completionPercentage` / `perfectionPercentage` casing mismatch evaluated to zero | canonical casing |
| Sublime targets derived from cap-based multipliers, overshooting the real 2-band requirement | real band thresholds from `outcome.ts` |
| `cloneHarmonyData` in `src/modContent/harmonyState.ts` silently dropped `enhancingEcho` and `eccentricDecree` during hydration, so the simulator restarted those two state machines from scratch on **every poll** — losing attunement, the focused bar and the last-seen bar values | fixed in 6.1.0: both are now cloned and preserved. This entry previously claimed the fix had landed in 6.0.0; it had not, and the omission dated back to the 0.7.5 harmony rework that introduced the two subsystems |
| Rust rejected the whole `MctsInput` when any field arrived as an explicit `null`, silently disabling the native prior on real game data | deep `stripNullish` at the bridge plus a `null_default` serde helper |
| The Rust recommendation was not deterministic (hash-ordered condition merge) | insertion-ordered merge mirroring `normalizeConditionDistribution` |
| Overcraft scoring plateaued at the target tier: extras were counted conjunctively (`min` of both bars), so a one-sided perfection push to the game caps earned nothing and the optimizer stopped at ~297% on a craft the game pays out to 1100% | unilateral per-bar extras gated on the secured tier (`overcraftAmbition`, default on), with the refund's 80% cap and the game caps as ceilings, mirrored in Rust |
| Buff-gated techniques (Focused Fusion without an active Focus buff) were recommended because the extraction only read CraftBuddy's own buff-gate fields and missed the game's native top-level `buffCost` / `buffRequirement` | `convertGameTechniques` reads the native fields; regression tests on the extraction seam plus a replay-snapshot fixture of the exact user report |

## Cross-engine parity

The Rust engine models the **same searchable action space** as TypeScript: generic active buffs, effect-tree techniques, mastery, Soulflame triggers and stack consumption, toxicity effects, and pill/reagent actions. Item actions are no longer filtered out of the bridge payload.

At the 6.8.0 release, both engines shared the conjunctive outcome model and agreed on 1,352 legal corpus transitions and 202 illegal-action cases. This historical result is not a claim that revised stochastic branches or new requested-goal semantics are mirrored in Rust.

What is still asymmetric, deliberately:

- TypeScript owns production recommendations through constrained stochastic planning. The Rust root MCTS prior is retained only for legacy/reference lookahead.
- The Rust scorer mirrors the tier/gate model but not TypeScript's `ScoringContext` sampling, so absolute scores are not comparable across engines — only rankings and transitions are.
- An unknown effect kind is skipped deterministically on both sides, so the corpus stays green instead of drifting.

## Heuristic / fallback-sensitive areas

- condition fallback table in `gameTypes.ts`, used only when real condition data is unavailable
- the local expression compiler, used instead of `modAPI.utils.evaluateScaling` because the native provider can diverge on hypothetical future states
- forge heat recovery from runtime mirrors when `harmonyTypeData` omits it
- native auto-use slot conditions: CraftBuddy cannot evaluate the game's inline condition expressions, so `projectNativeAutoUse` treats a slot as _satisfiable_ unless a caller injects an evaluator. Over-estimating native consumption is the safe direction — it withholds a CraftBuddy item action rather than duplicating one
- DOM-derived progress recovery: structural `X/Y` first, compact HUD forms such as `31K` accepted, reconciled against exact caps on non-overcraft crafts

## Known limitations

Stated plainly rather than tracked as pending work:

1. **Per-harmony item effects (`harmonyAugment`) are not modelled.** They decide what the finished item does, not which action is best this turn.
2. **Craft-result material returns are not modelled in search.** Verified as best-completion-tier based with an `80%` cap; resolves after the craft.
3. **Hidden RNG streams are not replicated.** Supported success/crit/effect decisions are probability branches; neither their actual future rolls nor craft-end bonus rolls are predicted.
4. **Absolute Rust scores are not TypeScript scores** (see above).
5. **Wall-clock search depth is machine-dependent.** Presets are a budget envelope, not a determinism guarantee; the _recommendation_ is deterministic for a fixed budget, and that is now directly tested on the Rust side.
6. **Eccentric Decree's mid-technique modifier refresh remains limited.** Branching success/crit does not itself repair the focus-flip or per-application reconstruction limitations described above.
7. **Stochastic coverage is bounded.** Supported chance-buff decisions retain separate future state. Unexplored probability mass and unmodeled effects are not a safety guarantee. Historical Rust EV parity does not prove these branches.

## Non-goals

- exact hidden RNG stream replication (not exposed by the game)
- modelling every non-technique item family without normalized runtime payloads
- combat-side systems, including the combat auto-use path

## Resource transition audit, 0.7.18

Qi restoration is capped at each application; spending floors at zero and does not apply an upper cap. Native resource handlers observe the actual delta at that point in the action. Stability retains debt until action cleanup. Mastery resource frames, fresh payment/buff/event frames and item-versus-turn cleanup are distinct boundaries. The production discrete simulator now follows those resource operations in order, including boost/sign and fractional cases.

The independent native pool oracle contains 1,440 cases and a hash-checked regeneration script. This establishes scoped resource-applier evidence, not full game equivalence. The historical Rust EV corpus remains an implementation-agreement check; 24 over-cap-state Qi expectations changed with the spending/cleanup repair. EV stability weighting remains historical and cannot certify a stochastic route.

Intermediate progress dependencies and bar-listener subscription changes that the reconstructed bar model cannot order reliably are explicitly unresolved. The validated Celadon Cycle remains supported. See [the review report](PR4_REVIEW_VALIDATION.md#thirteenth-review-follow-up-finding-on-7208130) for origin analysis, reproductions and final validation results.
