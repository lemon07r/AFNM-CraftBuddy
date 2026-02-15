---
title: Optimizer Design
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-15
source_of_truth: src/optimizer/search.ts, src/optimizer/skills.ts, src/optimizer/state.ts
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/PERFORMANCE.md
  - docs/project/TESTING.md
---

# Optimizer Design

## State and actions

- State: immutable `CraftingState` with deterministic cache key.
- State defensively clones tracked buff entries to preserve immutability boundaries.
- Actions: crafting techniques + mapped item actions (when provided by integration layer).
- Transition engine: `calculateSkillGains(...)` + `applySkill(...)` in `src/optimizer/skills.ts`.

## Search modes

- `greedySearch(...)`: fast one-step selection.
- `lookaheadSearch(...)`: main mode for recommendations.
- `findBestSkill(...)`: public entrypoint selecting search strategy.

## Search characteristics

- memoization on normalized state keys (with adaptive bucket sizing near targets)
- beam-limited exploration
- adaptive beam width at deeper layers
- iterative deepening option
- node/time budget constraints
- terminal-state shortcuts

## Probability handling

- Success/crit modeled as expected value in gains.
- Condition queue is normalized to fixed length `3` (matches game UI/runtime visibility).
- Beyond forecast queue, condition transitions are probability-weighted (`enableConditionBranchingAfterForecast`, `conditionBranchLimit`, `conditionBranchMinProbability`).
- Non-turn item actions do not consume lookahead turn-depth/index.
- Guarded ModAPI transition provider wiring is active (`getNextCondition` path probing with local fallback).

## Scoring architecture

`scoreState()` uses a layered architecture where each layer handles one concern. See `AGENTS.md` → "Optimizer Design Principles" for the full design rules, anti-patterns, and validation workflow.

### Layers (in evaluation order)

1. **Progress** — weighted completion + perfection toward effective goals
2. **Target-met bonus** — proportional to `totalTargetMagnitude * 2` (never hardcoded)
3. **Buff valuation** — expected future return from active buffs (only when targets not yet met)
4. **Resource value** — qi and stability as future-progress enablers (only when targets not yet met)
5. **Overshoot penalty** — penalise going beyond effective caps
6. **Survivability** — stability risk penalties (skipped entirely when targets are met)
7. **Toxicity & harmony** — alchemy toxicity danger + sublime harmony signal

### Move ordering

`orderSkillsForSearch()` uses condition-modified gains (via `calculateSkillGains()`) and soft stall penalties (via `computeStallPenalties()`) to rank skills for beam-width pruning. No skills are hard-filtered out of the search tree.

## Determinism expectations

Identical state + config inputs should produce stable recommendations within the deterministic EV model. Condition normalization lowercases unknown labels to avoid cache-key casing drift.
