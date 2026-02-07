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

## Still dependency-gated (pending external API)

- direct game-native `evaluateScaling`
- direct game-native overcrit helper
- direct game-native action availability helper
- direct game-native completion/perfection cap getters

## Heuristic/fallback-sensitive areas

- integration fallback extraction paths when full runtime state is missing
- condition fallback table in `gameTypes.ts` (used when real condition data is unavailable)
- local expression compilation path remains an internal fallback until native evaluator is exposed

## Verification anchors

- `src/__tests__/gameAccuracy.test.ts`
- `src/__tests__/harmony.test.ts`
- `src/__tests__/skills.test.ts`
- `src/__tests__/search.test.ts`
- `src/__tests__/largeNumbers.test.ts`

## Non-goals currently

- exact hidden RNG stream replication not exposed via API
- complete modeling of every possible non-technique item family without normalized runtime payloads
