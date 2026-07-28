---
title: Mechanics Parity Status
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-27
source_of_truth: src/optimizer/outcome.ts, src/optimizer/skills.ts, src/optimizer/harmony.ts, src/optimizer/harmonyRegistry.ts, src/optimizer/gameTypes.ts, src/optimizer/state.ts, src/optimizer/search.ts, src/optimizer/nativeMcts.ts, src/modContent/harmonyState.ts, crates/craftbuddy-engine/*
review_cycle_days: 30
related_files:
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/dev-requests/STATUS.md
---

# Mechanics Parity Status

Which AFNM **0.7.6** crafting mechanics CraftBuddy models, how that is proven, and what is genuinely still approximate.

Authority order: installed runtime bundle → tests → this document. When they disagree, the runtime wins and this file is wrong. `docs/project/RUNTIME_EVIDENCE.md` holds the extracted runtime source, currently for build `0.7.6-7c586da`.

## How parity is proven

| Layer | Proof |
| --- | --- |
| Formula/transition parity vs the game | `gameAccuracy.test.ts`, `runtimeParity.test.ts`, `skills.test.ts`, `harmony.test.ts`, verified against the extracted 0.7.6 bundle |
| Outcome/band/tier model | `outcome.test.ts`, `outcomeProjection.test.ts` |
| TypeScript ↔ Rust engine parity | the differential corpus: `src/__tests__/fixtures/differentialCorpus.ts` → `engineDifferential.test.ts` (TS side) and `crates/craftbuddy-engine/tests/differential_corpus.json` → `differential_tests.rs` (Rust side) |
| Multi-turn behaviour | `craftSimulation.test.ts`, replay fixtures in `src/__tests__/__fixtures__/replay-snapshots/` |

The corpus is schema v2 and covers **134 scenarios / 1,432 transitions**, with `expected` asserting qi, stability, stability penalty, completion, perfection, toxicity, harmony, step, completion bonus, cooldowns, the active-buff set, `items`, `consumedPillsThisTurn`, and a `harmonyData` digest. Regenerate with `bun run optimizer:differential-corpus`; never hand-edit the JSON.

The wider suites report **828 Jest tests across 31 suites** and **64 passing Rust tests** (plus 3 `#[ignore]`d profiling tests).

## The 0.7.6 change: Eccentric Decree scores per bar application

This is the only crafting mechanics change in 0.7.6. The extracted runtime source, offsets and the exact per-event rules are in `docs/project/RUNTIME_EVIDENCE.md` section 4; what follows is only how CraftBuddy models it.

The runtime moved Eccentric Decree out of the end-of-turn `processEffect` hook into a new `onBarChange` hook fired **inside** `applyCompletion` / `applyPerfection`. One turn can therefore award harmony several times and flip its focused bar part-way through.

| Layer | Model |
| --- | --- |
| TypeScript | `processEccentricDecree` in `src/optimizer/harmony.ts` folds over an ordered `BarChangeEvent[]` supplied on `HarmonyProcessContext.barChanges` |
| Rust | the same fold over `BarChange` in `crates/craftbuddy-engine/src/lib.rs`, gated by `needs_bar_contributions()` in `effects.rs` |
| Event construction | `src/optimizer/skills.ts`: `scaleBarContributions` → `buildBarChangeEvents`, only when `needsBarContributions()` (sublime **and** `craftingType === 'eccentricDecree'`) |
| Fallback | no events → the pre-0.7.6 single end-of-turn delta, so replay fixtures recorded without event data degrade rather than mis-score |

Per event both engines clamp with `min(cap, max(0, floor(value)))`, award `+5` harmony when the focused bar advanced, `-5` harmony and `-5` Qi Pool when the other one did, and flip focus when the focused bar's `getBonusAndChance(...).guaranteed` improved across that event. Like the runtime's own hook, the fold ignores the event's `bar` label and derives focused/stray by diffing both clamped bars.

### Known, deliberately unmodelled second-order effects

These are real gaps, not rounding noise. They are stated here so nobody "discovers" them as bugs.

1. **Mid-technique stat-modifier flip.** In the runtime a focus flip between two effects of the *same* technique retunes intensity/control for the **later** effects of that technique. CraftBuddy evaluates effect scaling once per action, so a flip affects scoring and every subsequent turn, but not the remaining effect magnitudes within the same turn.
2. **Expected-value bar events.** CraftBuddy applies aggregated expected values, not discrete per-application gains. The fold reconstructs per-application running values by distributing each bar's aggregate proportionally across that bar's raw per-effect contributions (`scaleBarContributions`). That preserves the ordering and the exact total, but not the runtime's exact per-application integers when crit/success weighting is fractional.
3. **Disciplined Touch and the legacy scalar path expose no per-effect breakdown**, so they synthesize one application per moved bar, completion first (`synthesizeBarContributions`). Identical in both engines, and equivalent to the old single-delta model except when a band is cleared between the two applications.

Seeding matches the runtime's laziness: `processEffect` and `onBarChange` both anchor absent state on the **current** bars, while only the game's `initEffect` seeds at zero at craft start. `seedEccentricDecreeData` in `src/modContent/harmonyState.ts` mirrors that, so attaching to a craft already in progress cannot retro-charge harmony for progress made before CraftBuddy saw it.

Everything else in 0.7.6 needed no model change: the Fallen Soulflame nerf is data carried by the definition-driven buff path, complexity multipliers are unchanged, the auto-use read path is unchanged, the False Fusion rename is display-only, and crafting toxicity cleansing never critted in either build.

## 0.7.5 model changes

These are the semantics that changed with the 0.7.5 harmony rework and still hold in 0.7.6. Older CraftBuddy notes describing the opposite are wrong and have been removed.

| Behaviour | CraftBuddy |
| --- | --- |
| Harmony type is **chosen by the player** and is no longer derived from the item type | `src/modContent/craftingContext.ts` reads the selection from live craft state; `recipe.harmonyTypeOverride` remains the forced case. There is **no** item-kind inference anywhere, and the removed `modAPI.gameData.itemTypeToHarmonyType` utility is not referenced. |
| **Seven** harmony types | `src/optimizer/harmonyRegistry.ts` defines all seven; `src/optimizer/harmony.ts` simulates each subsystem. |
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
| Eccentric Decree | 1.0 | 0 | scores per bar application in 0.7.6; `+5` focused, `-5` harmony and `-5` Qi Pool for straying |

The multiplier only applies to **sublime** recipes, matching the runtime's `initCrafting` guard.

## Implemented mechanics

Transition and formula layer (`src/optimizer/skills.ts`, `gameTypes.ts`, `state.ts`):

- effect-tree technique evaluation, effect conditions, and the local JS-subset expression evaluator (guarded formula filtering, bounded compile cache)
- scaling evaluation with mastery `upgradeKey` rewrites, additive/multiplicative upgrades, and `percentage` fields treated as percentages
- crit expected value including excess-crit conversion
- generic active buffs with full definitions: stat contributions, per-turn effects, action-type effects (`onFusion` / `onRefine` / `onStabilize` / `onSupport`), expression gates, stack consumption. Definition-driven buffs such as False Fusion (displayed as "Strive for Completion" since 0.7.6) and Fallen Soulflame fragments flow through this path — there are no per-skill special cases, which is why the 0.7.6 Soulflame re-balance needed no code change
- dynamic max-pool buff evaluation for `% maxpool` restores with qi-cap clamping
- active-buff definition hydration from skill payloads when a runtime snapshot omits definitions
- Qi/stability cost order: percentage buffs floor after each application, then condition multipliers, then the flat `poolCostFlat` surcharge
- Turbid Qi step surcharge: first stack at step `100`, then every `3` steps, granted _after_ the step bump so it taxes later actions
- toxicity effects with the runtime's sign convention, per-turn detox, and the native `getMaxToxicity` ceiling for alchemy
- `noQiCost` techniques, `craftingTeamUpOverride` companion buffs, cooldowns, max-stability decay and `preventsMaxStabilityDecay`
- large-number-safe arithmetic, parsing, and formatting

Outcome layer (`src/optimizer/outcome.ts`):

- band widths from the recipe's completion/perfection stats, each successive band costing `1.3x` the previous (runtime `qIa`)
- `TIER_REQUIREMENTS`: `basic` = 1 completion band; `perfect` = 1 + 1; `sublime` = **2 + 2**, and only when the recipe has a distinct sublime item
- fractional bonus-roll chance carried separately from guaranteed bands, so a near-miss is never reported as banked
- `willAutoFinish` mirroring the runtime predicate, including the overcraft branch at `>= 5` guaranteed completion bands
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

## Cross-engine parity

The Rust engine models the **same searchable action space** as TypeScript: generic active buffs, effect-tree techniques, mastery, Soulflame triggers and stack consumption, toxicity effects, and pill/reagent actions. Item actions are no longer filtered out of the bridge payload.

Both engines share the conjunctive outcome model (`outcome.ts` / `crates/craftbuddy-engine/src/outcome.rs`) and agree on all 1,432 corpus transitions.

What is still asymmetric, deliberately:

- TypeScript owns the returned recommendation. The Rust engine contributes a root MCTS **policy prior** for near-tie ordering; it cannot hard-filter a legal skill or overturn a clear TypeScript score difference.
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
3. **Hidden RNG streams are not replicated.** Success/crit/bonus rolls are expected values, never predicted rolls.
4. **Absolute Rust scores are not TypeScript scores** (see above).
5. **Wall-clock search depth is machine-dependent.** Presets are a budget envelope, not a determinism guarantee; the _recommendation_ is deterministic for a fixed budget, and that is now directly tested on the Rust side.
6. **Eccentric Decree bar events are expected values, not the runtime's discrete applications**, and a mid-technique focus flip does not retune that same turn's remaining effect magnitudes. Both are spelled out above and hold in both engines.

## Non-goals

- exact hidden RNG stream replication (not exposed by the game)
- modelling every non-technique item family without normalized runtime payloads
- combat-side systems, including the combat auto-use path
