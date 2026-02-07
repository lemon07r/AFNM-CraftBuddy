---
title: Optimizer Design
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/optimizer/search.ts, src/optimizer/skills.ts, src/optimizer/state.ts
review_cycle_days: 30
related_files:
  - docs/project/PERFORMANCE.md
  - docs/project/TESTING.md
---

# Optimizer Design

## State and actions

- State: immutable `CraftingState` with deterministic cache key.
- Actions: crafting techniques + mapped item actions (when provided by integration layer).
- Transition engine: `calculateSkillGains(...)` + `applySkill(...)` in `src/optimizer/skills.ts`.

## Search modes

- `greedySearch(...)`: fast one-step selection.
- `lookaheadSearch(...)`: main mode for recommendations.
- `findBestSkill(...)`: public entrypoint selecting search strategy.

## Search characteristics

- memoization on normalized state keys
- beam-limited exploration
- adaptive beam width at deeper layers
- iterative deepening option
- node/time budget constraints
- terminal-state shortcuts

## Probability handling

- Success/crit modeled as expected value in gains.
- Condition queue is used when available.
- Beyond forecast queue, condition transitions are probability-weighted (`enableConditionBranchingAfterForecast`, `conditionBranchLimit`, `conditionBranchMinProbability`).

## Scoring intent

- maximize useful completion/perfection progress toward targets
- preserve survivability/resources
- account for harmony signal and training-mode risk profile

## Determinism expectations

Identical state + config inputs should produce stable recommendations within the deterministic EV model.
