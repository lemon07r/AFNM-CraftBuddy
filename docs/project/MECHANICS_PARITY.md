---
title: Mechanics Parity Status
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-05
source_of_truth: src/optimizer/gameTypes.ts, src/optimizer/skills.ts, src/optimizer/state.ts, src/optimizer/harmony.ts, src/optimizer/search.ts
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
- active-buff definition hydration from skill payloads when runtime snapshots omit buff definitions
- harmony subsystem simulation (forge/alchemical/inscription/resonance)
- authoritative harmony-data hydration from `progressState.harmonyTypeData`, with forge-only fallback recovery from verified runtime mirrors (`Heat` native variables / heat buff stacks) when the live payload omits forge heat
- condition-effect handling from recipe condition config
- integration guard against stale recipe condition-effect cache across craft transitions
- fixed 3-condition forecast queue normalization with probability-weighted EV beyond forecast
- non-turn item actions keep turn-depth/index in lookahead search
- training-mode-aware scoring policy
- large-number-safe parsing/formatting
- local expression evaluator hardening (guarded formula filtering + bounded compile cache)
- native `modAPI.utils` provider path for scaling + overcrit, with fallback
- native all-depth `canUseAction` precheck with simulated-variable propagation, with fallback
- native max completion/perfection cap getters in integration layer, with fallback
- native crafting variable snapshot seeding (`getVariablesFromCraftingEntity`)
- canonical native-variable storage that strips state/buff/harmony mirrors from persisted optimizer state and re-derives those aliases at native-availability evaluation time
- guarded native condition transition provider (`getNextCondition` path probing), with fallback
- native max toxicity getter (`getMaxToxicity`) for alchemy crafts
- internal effective action-cost modeling (buff/harmony/condition aware) used by recommendation and follow-up previews
- optimizer replay snapshots now include serialized `harmonyData` plus a `harmonyDataSource` tag so bug reports can distinguish authoritative harmony state from verified fallbacks

## Dependency-gated

See `docs/dev-requests/STATUS.md` for full status and open questions on pending APIs.

## Heuristic/fallback-sensitive areas

- integration fallback extraction paths when full runtime state is missing
  forge heat fallback is verified against runtime mirrors; non-forge harmony state is treated as missing instead of guessed when authoritative subtype data is absent
- condition fallback table in `gameTypes.ts` (used when real condition data is unavailable)
- local expression compilation path (internal fallback if native evaluator unavailable)

## Verification test suites

`gameAccuracy.test.ts`, `harmony.test.ts`, `skills.test.ts`, `search.test.ts`, `state.test.ts`, `gameTypes.test.ts`, `largeNumbers.test.ts`, `modContentHarmonyState.test.ts`

## Non-goals

- exact hidden RNG stream replication (not exposed via API)
- complete modeling of every non-technique item family without normalized runtime payloads
