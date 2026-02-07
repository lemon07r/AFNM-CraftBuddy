---
title: Mechanics Parity Status
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/optimizer/gameTypes.ts, src/optimizer/skills.ts, src/optimizer/harmony.ts, src/optimizer/search.ts
review_cycle_days: 14
related_files:
  - docs/project/ROADMAP.md
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
---

# Mechanics Parity Status

## Implemented in runtime path

- scaling evaluation pipeline including mastery upgrade hooks:
  - recursive search by `upgradeKey`
  - direct numeric-property upgrades on matched objects only
  - additive as `+change`, multiplicative as absolute `*change`
- crit expected-value handling with excess crit conversion behavior
- technique effect simulation in transition path
- buff stat contributions and per-turn/action-specific buff effect execution
- harmony subsystem simulation (forge/alchemical/inscription/resonance)
- condition-effect handling from recipe condition config
- fixed 3-condition forecast queue normalization with probability-weighted EV beyond forecast
- non-turn item actions keep turn-depth/index in lookahead search
- training-mode-aware scoring policy
- large-number-safe parsing/formatting helpers
- local expression evaluator hardening (guarded formula filtering + bounded compile cache)
- native `modAPI.utils` provider path for scaling + overcrit, with fallback
- native all-depth `canUseAction` precheck path with simulated-variable propagation, with fallback
- native max completion/perfection cap getter path in integration layer, with fallback
- native crafting variable snapshot seeding (`getVariablesFromCraftingEntity`) for deeper parity checks
- guarded native condition transition provider wiring via `getNextCondition` path probing, with fallback
- native max toxicity getter fallback path (`getMaxToxicity`) for alchemy crafts

## Still dependency-gated (pending external API)

- finalized post-modifier pool/stability cost preview helpers
- documented stable `getNextCondition` ModAPI symbol/path (guarded path probing is currently used)

## Heuristic/fallback-sensitive areas

- integration fallback extraction paths when full runtime state is missing
- condition fallback table in `gameTypes.ts` (used when real condition data is unavailable)
- local expression compilation path remains an internal fallback if native evaluator is unavailable/fails

## Verification anchors

- `src/__tests__/gameAccuracy.test.ts`
- `src/__tests__/harmony.test.ts`
- `src/__tests__/skills.test.ts`
- `src/__tests__/search.test.ts`
- `src/__tests__/largeNumbers.test.ts`

## Non-goals currently

- exact hidden RNG stream replication not exposed via API
- complete modeling of every possible non-technique item family without normalized runtime payloads
