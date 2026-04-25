---
title: Mechanics Parity Status
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-04-25
source_of_truth: src/optimizer/gameTypes.ts, src/optimizer/skills.ts, src/optimizer/state.ts, src/optimizer/harmony.ts, src/optimizer/search.ts, src/optimizer/nativeMcts.ts, crates/craftbuddy-engine/*
review_cycle_days: 14
related_files:
  - docs/project/ROADMAP.md
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
---

# Mechanics Parity Status

## Implemented

- scaling evaluation pipeline (mastery upgrade hooks, recursive `upgradeKey` search, additive/multiplicative upgrades)
- crit expected-value handling with excess crit conversion
- technique effect simulation in transition path
- buff stat contributions and per-turn/action-specific buff effect execution
- dynamic max-pool buff evaluation for `% maxpool` restores and qi-cap clamping (for example `Harmonious Expansion` interacting with `Focused Opposition` / `Brilliant Respite`)
- active-buff definition hydration from skill payloads when runtime snapshots omit buff definitions
- harmony subsystem simulation (forge/alchemical/inscription/resonance)
- authoritative harmony-data hydration from `progressState.harmonyTypeData`, with forge-only fallback recovery from verified runtime mirrors (`Heat` native variables / heat buff stacks) when the live payload omits forge heat
- search-side harmony frontier valuation now reads subsystem-specific setup state for non-forge harmonies as well, so resonance strength/pending-switch state and partial alchemical charge progress are no longer flattened to neutral when ordering bounded search frontiers
- crafting-context resolution now uses live `modAPI.gameData.itemTypeToHarmonyType` mapping as a fallback when recipe harmony fields are absent, and replay snapshots capture detection provenance plus raw craft-context fields for parity triage
- condition-effect handling from recipe condition config
- integration guard against stale recipe condition-effect cache across craft transitions
- fixed 3-condition forecast queue normalization with probability-weighted EV beyond forecast
- non-turn item actions keep turn-depth/index in lookahead search
- training-mode-aware scoring policy
- large-number-safe parsing/formatting
- local expression evaluator hardening (guarded formula filtering + bounded compile cache)
- local scaling evaluation throughout optimizer simulation, with guarded native `modAPI.utils` overcrit fallback
- native all-depth `canUseAction` precheck with simulated-variable propagation, with fallback
- native max completion/perfection cap getters in integration layer, with fallback
- native crafting variable snapshot seeding (`getVariablesFromCraftingEntity`)
- canonical native-variable storage that strips state/buff/harmony mirrors from persisted optimizer state and re-derives those aliases at native-availability evaluation time
- native condition transition provider via documented `modAPI.utils.getNextCondition`, with legacy fallback probing
- native mastery-applied technique resolution via `modAPI.utils.craftingTechniqueFromKnown`, keyed by stable live technique names and preserving live cooldown/session state with fallback
- native completion-bonus identifier via `modAPI.utils.completionBonusBuffName`, with heuristic fallback
- native max toxicity getter (`getMaxToxicity`) for alchemy crafts
- root-state-backed ModAPI craft-session detection via `subscribe` / `getGameStateSnapshot`, removing the old English-DOM dependency for “is the recipe screen active?”
- flat Qi-cost surcharge modeling via runtime `poolCostFlat`, carried through state/cache/replay/effective-cost evaluation
- internal effective action-cost modeling (buff/harmony/condition aware) used by recommendation and follow-up previews
- voluntary `Finish Craft` modeling as a search-local action, using the runtime `getBonusAndChance(...)` ladder for both completion and perfection craft-end rolls; finished scoring now evaluates fail/basic/perfect/sublime EV from that exact distribution, and the persisted completion/perfection goal-priority bias slider (`-100` perfection to `100` completion, `0` balanced default) feeds the same underlying scorer
- optional Experimental Rust/WASM MCTS root policy for large/sublime searches. The native engine mirrors scalar costs/gains, condition generation, finish EV, and harmony sub-state rollouts for policy guidance only; TypeScript remains the parity source of truth for exact transition/scoring behavior. The Legacy engine remains the default.
- optimizer replay snapshots now include serialized `harmonyData` plus a `harmonyDataSource` tag, and exported snapshot bundles retain the newest bounded turn history plus auto-mode state so bug reports can distinguish authoritative parity data from fallback/debug context
- installed runtime extraction from the current game bundle is the tiebreaker when UI/help text or older notes drift from executable behavior; forge low-control penalties are verified against the live bundle at heat `2-3`, not `1-3`
- installed runtime `0.6.50` exposes recipe `basicBestCompletion` / `perfectBestCompletion` / `sublimeBestCompletion`; this affects craft-result/material-return parity, not turn-to-turn optimizer choice, so it is currently tracked in docs/oracle rather than search scoring
- native provider detection for `getActionCost`, `evaluateCraftingCondition`, `getActualCraftingStat` (new in `0.6.50`)
- `noQiCost` technique field handling — techniques marked with `noQiCost` skip Qi-cost evaluation
- `craftingTeamUpOverride` companion buff integration — companion crafting buffs flow into optimizer state

## Community guide validation status

- percentage-buff order-of-operations: implemented and explicitly covered in `gameAccuracy.test.ts` runtime-shaped percent buffs (`stat: 'intensity'` / `stat: 'control'`) scale the pre-craft base stat and do not multiply flat in-craft reagent/pill-style bonuses
- Inscribed Patterns stack-halving penalty: implemented and covered in `harmony.test.ts`
- Spiritual Resonance double-switch target shifting: implemented and covered in `harmony.test.ts`
- partial completion / chance-based finish: verified against the installed runtime; completion and perfection resolve as independent nonlinear craft-end ladder rolls rather than deterministic hard bars, and search now matches that distribution directly
- toxicity detox per-turn handling: implemented in `skills.ts` and explicitly covered for multi-turn active-buff cleansing in `skills.test.ts`
- cost-percentage buff stacking order: verified against the installed runtime; `poolCostPercentage` / `stabilityCostPercentage` buffs floor after each buff application, then action costs apply condition multipliers in the same order the optimizer now uses
- soft-cap Qi surcharge: implemented via the runtime `poolCostFlat` crafting stat; action-cost evaluation now carries the flat additive tax alongside the older percentage modifier path
- static `poolcost` / `stabilitycost` / `successchance` masteries: verified against the installed runtime as technique-construction modifiers that are already baked into the live technique payload; current integration filtering avoids double counting, and no conditional variants were found in the installed `0.6.50` bundle
- instant-craft material returns: verified against installed runtime `0.6.50` as best-completion-tier based with an `80%` cap; no optimizer/search adjustment is needed because the effect resolves after craft completion, but replay/docs/oracle should treat it as current runtime behavior

## Dependency-gated

See `docs/dev-requests/STATUS.md` for full status and open questions on pending APIs.

## Heuristic/fallback-sensitive areas

- integration fallback extraction paths when full runtime state is missing forge heat fallback is verified against runtime mirrors; non-forge harmony state is treated as missing instead of guessed when authoritative subtype data is absent
- condition fallback table in `gameTypes.ts` (used when real condition data is unavailable)
- local expression compilation path (internal evaluator for optimizer simulation)
- native scaling is intentionally disabled in optimizer simulation because the live provider can diverge from hypothetical future-state variables
- native MCTS uses a compact scalar model and deliberately excludes item actions from rollouts because inventory consumption is still owned by TypeScript search

## Verification test suites

`gameAccuracy.test.ts`, `harmony.test.ts`, `skills.test.ts`, `search.test.ts`, `nativeMcts.test.ts`, `state.test.ts`, `gameTypes.test.ts`, `largeNumbers.test.ts`, `modContentHarmonyState.test.ts`, `crates/craftbuddy-engine` Rust unit tests

## Non-goals

- exact hidden RNG stream replication (not exposed via API)
- complete modeling of every non-technique item family without normalized runtime payloads
