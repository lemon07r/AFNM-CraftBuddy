---
title: Optimizer Design
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-06
source_of_truth: src/optimizer/search.ts, src/optimizer/skills.ts, src/optimizer/state.ts, src/settings/index.ts
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/TESTING.md
---

# Optimizer Design

## State and actions

- State: immutable `CraftingState` with deterministic cache key.
- State defensively clones tracked buff entries to preserve immutability boundaries.
- Integration seeds only canonical supplemental `nativeVariables`; state/buff/harmony mirrors are re-derived on demand from `CraftingState` during native availability checks instead of being persisted into cache keys.
- Actions: crafting techniques + mapped item actions (when provided by integration layer).
- Transition engine: `calculateSkillGains(...)` + `applySkill(...)` in `src/optimizer/skills.ts`.

## Search modes

- `greedySearch(...)`: fast one-step selection.
- `lookaheadSearch(...)`: main mode for recommendations.
- `findBestSkill(...)`: public entrypoint selecting search strategy.

## Search characteristics

- Transposition table: `Map<string, { score, bestMove }>` on normalized state keys (with adaptive bucket sizing near targets)
- `findOptimalPath()` reconstructs the tree search's actual chosen path by walking the transposition table's `bestMove` entries, with greedy evaluation fallback for cache misses
- beam-limited exploration
- adaptive beam width at deeper layers
- iterative deepening option (only fully completed deeper passes replace shallower results)
- node/time budget constraints
- terminal-state shortcuts

## Probability handling

- Success/crit modeled as expected value in gains.
- Condition queue is normalized to fixed length `3` (matches game UI/runtime visibility).
- Beyond forecast queue, condition transitions are probability-weighted (`enableConditionBranchingAfterForecast`, `conditionBranchLimit`, `conditionBranchMinProbability`).
- Non-turn item actions do not consume lookahead turn-depth/index.
- Guarded ModAPI transition provider wiring is active (`getNextCondition` path probing with local fallback).

## Scoring architecture

`scoreState()` uses a layered architecture where each layer handles one concern. It accepts an optional `ScoringContext` parameter carrying precomputed craft-specific estimates (`avgStabilityCostPerTurn`, `avgGainPerTurn`) so that survivability calculations use actual skill data instead of hardcoded defaults. All scoring weights are defined in the `SCORING` named constants block at the top of `search.ts`; `buildScoringContext()` computes the context from `OptimizerConfig`. See `AGENTS.md` → "Optimizer Design Principles" for the full design rules, anti-patterns, and validation workflow.

### Layers (in evaluation order)

1. **Progress** — weighted completion + perfection toward effective goals
2. **Target-met bonus** — proportional to `totalTargetMagnitude × SCORING.TARGET_MET_MULTIPLIER` (never hardcoded)
3. **Buff valuation** — expected future return from active buffs (only when targets not yet met)
4. **Resource value** — qi and stability as future-progress enablers (only when targets not yet met)
5. **Overshoot penalty** — penalise going beyond effective caps
6. **Survivability** — stability risk penalties using grounded estimates from `ScoringContext` (skipped entirely when targets are met). Includes: quadratic threshold penalty, death penalty (`totalTargetMagnitude × SCORING.DEATH_PENALTY_MULTIPLIER`), near-death linear penalty, and proportional uncapped runway gap penalty (`gap × totalTargetMagnitude × SCORING.RUNWAY_GAP_FRACTION`)
7. **Toxicity & harmony** — proportional toxicity penalty (`totalTargetMagnitude × SCORING.TOXICITY_PENALTY_FRACTION`) + sublime harmony signal + harmony sub-system quality term (`evaluateHarmonySubsystemQuality()` × remaining-work% × `totalTargetMagnitude × SCORING.HARMONY_SUBSYSTEM_QUALITY_WEIGHT`). The quality function maps sub-system state (e.g., forge heat) to a [-1, +1] score using actual stat modifiers from `getHarmonyStatModifiers`, so the tree search can value skills like fusion that don't directly advance targets but enable future progress.

### Move ordering

`buildOrderedMoveCandidates()` is the live beam-ordering path. It evaluates every currently legal move with `applySkill(...)`, scores the resulting state through `estimatePostMoveStateScore(...)`, and then uses `compareMoveCandidatesForTie(...)` plus immediate progress as tie-breakers. This keeps beam pruning aligned with the same post-move state evaluation that the tree search and first-move recommendation path use.

No skills are hard-filtered out of the search tree before evaluation. If a move class is being mis-ordered, fix the post-move state evaluation or the underlying transition/scoring model instead of introducing a second heuristic ordering lane.

## Determinism expectations

Identical state + config inputs should produce stable recommendations within the deterministic EV model when the search reaches the same effective frontier under the configured limits. Because lookahead is bounded by wall-clock time, node caps, beam width, and iterative deepening, the same slider values can explore different depths on faster vs slower machines; `searchTimeBudgetMs`, `searchMaxNodes`, `searchBeamWidth`, and `lookaheadDepth` define a budget envelope, not a cross-machine determinism guarantee. Condition normalization lowercases unknown labels to avoid cache-key casing drift.

## Performance tuning

### User-tunable controls

- `lookaheadDepth` (`1-96`, default `64`)
- `searchTimeBudgetMs` (`100-10,000`, default `4,500`)
- `searchMaxNodes` (`1,000-5,000,000`, default `2,000,000`)
- `searchBeamWidth` (`3-20`, default `5`)
- Settings sliders persist on commit (not every drag event) to reduce UI churn.
- Preset tuning now keeps the beam narrower through mid-budget tiers; replay benchmarking showed widening too early can produce worse partial-frontier recommendations than a deeper narrow-beam search, including forge turns where a wider beam strands the search on a shallow terminal frontier and drifts into avoidable heat overshoot.
- Manual tuning is coupled: over-raising one slider while starving the others can reduce effective frontier quality. Presets exist to keep the budget ratios in a safer range.

### Internal search defaults

- iterative deepening: enabled
- adaptive beam width: enabled
- condition branching beyond forecast: enabled
- branch limit: `2`
- branch min probability: `0.15`

### Cost/quality tuning order

1. raise `searchMaxNodes`
2. raise `lookaheadDepth`
3. adjust `searchBeamWidth`
4. raise `searchTimeBudgetMs` only as needed

### Long-craft guidance (~90 turns)

- increase depth gradually and validate responsiveness
- avoid maxing depth + beam simultaneously on slower machines
- prefer bounded multi-second time budgets; turn-based crafts can tolerate waiting, but exact frontier depth still varies by machine

## Key design decisions

- **Pure optimizer core** — simulation and search in `src/optimizer/*` remain pure/testable with no game runtime dependencies.
- **Expected-value modeling** — EV for success/crit and future-condition branching provides stable quality with bounded runtime cost (no stochastic rollouts).
