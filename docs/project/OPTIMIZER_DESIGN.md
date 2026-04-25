---
title: Optimizer Design
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-04-25
source_of_truth: src/optimizer/search.ts, src/optimizer/skills.ts, src/optimizer/state.ts, src/optimizer/nativeMcts.ts, crates/craftbuddy-engine/*, src/settings/index.ts
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
- Search also exposes a local pseudo-action, `Finish Craft`, so bounded lookahead can compare exact craft-end EV against continuing lines.
- Transition engine: `calculateSkillGains(...)` + `applySkill(...)` in `src/optimizer/skills.ts`.

## Search modes

- `greedySearch(...)`: fast one-step selection.
- `lookaheadSearch(...)`: main mode for recommendations.
- `findBestSkill(...)`: public entrypoint selecting search strategy.

## Search characteristics

- Transposition table: `Map<string, { score, bestMove }>` on normalized state keys (with adaptive bucket sizing near targets)
- Iterative deepening reuses one shared transposition table; the adaptive beam profile is keyed only by local remaining depth so cached subproblems stay valid across passes
- `findOptimalPath()` reconstructs the tree search's actual chosen path by walking the transposition table's `bestMove` entries, with greedy evaluation fallback for cache misses
- beam-limited exploration
- adaptive beam width at deeper layers
- iterative deepening option (only fully completed deeper passes replace shallower results)
- node/time budget constraints
- node budget counts cache-miss frontier expansions rather than cache probes
- terminal-state shortcuts
- optional Experimental Rust/WASM Monte Carlo Tree Search root policy prior for large/harmony searches. This is not a replacement scorer: the native engine produces root action visit policies from compact rollouts, and TypeScript lookahead still owns legality, post-action scoring, transposition cache entries, terminal handling, and returned recommendations. The persisted Legacy engine setting disables this path and remains the default.

## Probability handling

- Success/crit modeled as expected value in gains.
- Immediate survival is not flattened entirely into EV: `calculateActionSurvivabilityFloor(...)` computes a guaranteed post-action stability/max-stability floor, and search treats proc-dependent survival lines as unsafe when a guaranteed-safe alternative exists while base goals are still unsecured.
- That low-floor unsafe classification is meant to keep risky live branches behind guaranteed-safe continuations such as stabilize lines; it does **not** auto-promote `Finish Craft` above a materially better continuation just because finish is safer.
- The guaranteed floor also applies to exact `1`-stability unmet-goal runway traps where an EV stabilize line can leave only a token guaranteed floor. On sublime crafts, base-success overcraft lines are still allowed to stay probabilistic when they retain a non-terminal guaranteed floor, but immediate hard-stop branches (guaranteed floor `<= 0`) are collapsed so they cannot outrank a guaranteed-safe continuation while sublime goals remain unmet.
- Craft-end resolution is modeled explicitly through the `Finish Craft` branch with the same nonlinear bonus ladder the runtime uses (`getBonusAndChance(...)`). Completion and perfection roll independently at craft end; success requires at least one completion band, perfect requires at least one perfection band, and sublime requires `2+` completion and perfection bands when the recipe has a distinct sublime outcome. Finished-outcome scoring evaluates the resulting fail/basic/perfect/sublime distribution directly, ignores post-finish runway concerns, and applies a full unresolved-work penalty so shallow partial finishes do not outrank healthy live states with runway.
- Condition queue is normalized to fixed length `3` (matches game UI/runtime visibility).
- Beyond forecast queue, condition transitions are probability-weighted (`enableConditionBranchingAfterForecast`, `conditionBranchLimit`, `conditionBranchMinProbability`).
- Non-turn item actions do not consume lookahead turn-depth/index.
- Documented ModAPI transition provider wiring is active (`modAPI.utils.getNextCondition` primary with legacy fallback).

## Scoring architecture

`scoreState()` uses a layered architecture where each layer handles one concern. It accepts an optional `ScoringContext` parameter carrying precomputed craft-specific estimates (`avgStabilityCostPerTurn`, `avgCompletionGainPerTurn`, `avgPerfectionGainPerTurn`, `avgGainPerTurn`) so that survivability and qi/runway calculations use representative live skill gains instead of bare base stats. `buildScoringContext()` samples the strongest currently-usable productive moves (with current state/condition effects when available) rather than averaging every low-output filler action, which keeps long-craft runway estimates grounded on real progress throughput. All scoring weights are defined in the `SCORING` named constants block at the top of `search.ts`. Use `.agents/skills/craftbuddy-optimizer/SKILL.md` for the active design rules, anti-patterns, and validation workflow.

### Layers (in evaluation order)

1. **Progress** — weighted completion + perfection toward effective goals
2. **Target-met bonus** — proportional to `totalTargetMagnitude × SCORING.TARGET_MET_MULTIPLIER` (never hardcoded)
3. **Buff valuation** — expected future return from active buffs (only when targets not yet met)
4. **Resource value** — qi and stability as future-progress enablers (only when targets not yet met)
5. **Overshoot penalty** — penalise going beyond effective caps
6. **Survivability** — stability risk penalties using grounded estimates from `ScoringContext` (skipped entirely when targets are met). Includes: quadratic threshold penalty, death penalty (`totalTargetMagnitude × SCORING.DEATH_PENALTY_MULTIPLIER`), near-death linear penalty, and proportional uncapped runway gap penalty (`gap × totalTargetMagnitude × SCORING.RUNWAY_GAP_FRACTION`)
7. **Toxicity & harmony** — proportional toxicity penalty (`totalTargetMagnitude × SCORING.TOXICITY_PENALTY_FRACTION`) + sublime harmony signal + harmony sub-system quality term (`evaluateHarmonySubsystemQuality()` × remaining-work% × `totalTargetMagnitude × SCORING.HARMONY_SUBSYSTEM_QUALITY_WEIGHT`). That harmony-quality evaluator now uses subsystem-specific state where needed, so forge heat, inscription stacks, partial alchemical charge progress, and resonance target/strength state can all influence frontier scoring instead of only raw intensity/control multipliers. For sublime crafts, these continuation terms stay active until sublime targets are met, not merely until base success is secured, so forge heat recovery and other harmony setup can still outrank shallow “play safe now” lines when overcraft EV is genuinely better.

### Move ordering

`buildOrderedMoveCandidates()` is the live beam-ordering path. It evaluates every currently legal move with `applySkill(...)`, scores the resulting state through `estimatePostMoveStateScore(...)`, and then uses `compareMoveCandidatesForTie(...)` plus immediate progress as tie-breakers. It also consults the guaranteed survivability floor so a move that only survives if a probabilistic stability proc lands does not outrank a guaranteed-safe alternative while goals are still unmet. Sublime continuation lines are still allowed to stay probabilistic after base success when their guaranteed floor remains non-terminal, but immediate hard-stop floor-death branches are collapsed before ranking. When iterative deepening has already solved a shallower version of the same normalized subproblem, the cached `bestMove` is promoted before beam truncation so deeper passes continue from the previously validated principal variation instead of re-guessing move order from scratch.

When the Experimental engine is selected and the bundled inline Rust/WASM engine is available, large or sublime searches also request a root MCTS policy from `src/optimizer/nativeMcts.ts`. That policy may only break root ordering ties inside the same score window used for resource tiebreakers; it cannot hard-filter skills and cannot override a clear TypeScript score difference. This keeps the parity-heavy TypeScript scorer authoritative while giving late-game/harmony crafts a faster way to choose which near-equal root branches deserve the first deep budget.

No skills are hard-filtered out of the search tree before evaluation. If a move class is being mis-ordered, fix the post-move state evaluation or the underlying transition/scoring model instead of introducing a second heuristic ordering lane.

### Budget ownership

Recommendation budget is reserved for ranking first moves. Follow-up suggestions are generated only after a root frontier is accepted, using cached `bestMove` entries first and shallow fallback only when needed. Auxiliary UI data must not consume the search budget that determines the actual recommendation.

## User goal-priority bias

- `searchGoalPriorityBias` is a persisted search-policy setting, default `0`.
- Range: `-100` = perfection priority, `0` = balanced, `100` = completion priority.
- Balanced is the mathematically neutral default: completion/perfection weights still follow remaining-work need share.
- Non-zero bias shifts both ongoing-state scoring and `Finish Craft` outcome scoring through the same weight function, so the preference affects real search evaluation rather than a separate UI-only heuristic.

## Determinism expectations

Identical state + config inputs should produce stable recommendations within the deterministic EV model when the search reaches the same effective frontier under the configured limits. Because lookahead is bounded by wall-clock time, node caps, beam width, and iterative deepening, the same slider values can explore different depths on faster vs slower machines; `searchTimeBudgetMs`, `searchMaxNodes`, `searchBeamWidth`, and `lookaheadDepth` define a budget envelope, not a cross-machine determinism guarantee. Condition normalization lowercases unknown labels to avoid cache-key casing drift. When a deeper pass does not fully complete, the optimizer keeps the last fully completed frontier (or the fully-evaluated immediate root frontier if no recursive pass completed) instead of mixing partial deep scores into the final ranking.

## Performance tuning

### User-tunable controls

- `lookaheadDepth` (`1-96`, default `48`)
- `searchTimeBudgetMs` (`100-10,000`, default `2,000`)
- `searchMaxNodes` (`1,000-5,000,000`, default `1,000,000`)
- `searchBeamWidth` (`3-20`, default `5`)
- `searchGoalPriorityBias` (`0` by default)
- Settings sliders persist on commit (not every drag event) to reduce UI churn.
- Preset tuning now keeps the beam narrower through mid-budget tiers; replay benchmarking showed widening too early can produce worse partial-frontier recommendations than a deeper narrow-beam search, including forge turns where a wider beam strands the search on a shallow terminal frontier and drifts into avoidable heat overshoot.
- Manual tuning is coupled: over-raising one slider while starving the others can reduce effective frontier quality. Presets exist to keep the budget ratios in a safer range.

### Internal search defaults

- iterative deepening: enabled
- adaptive beam width: enabled
- condition branching beyond forecast: enabled
- branch limit: `2`
- branch min probability: `0.15`
- engine mode: `legacy` by default; `experimental` enables the native MCTS root policy when bundled inline WASM is available and the search is large or sublime
- legacy default preset: Fast (`48` depth, `2,000ms`, `1,000,000` nodes, beam `5`)
- experimental preset ceiling: Max uses `4,000ms`, below the `4,500ms` responsiveness cap
- MCTS defaults: `250` iterations, rollout depth `8-16` from preset depth, exploration `1.15`, node cap `5,000`
- Detailed Rust/WASM findings and follow-up work: `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`

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
- **Expected-value modeling with guaranteed-survival guardrails** — EV for success/crit and future-condition branching provides stable quality with bounded runtime cost in the authoritative TypeScript search, while immediate survivability is guarded by a deterministic floor so the optimizer does not spend a craft on a recovery proc when a guaranteed stabilize exists.
- **Native MCTS as a policy prior, not a mechanics source of truth** — the Rust engine intentionally uses a compact scalar model for fast rollouts. Its output improves root branch ordering under tight budgets, but TypeScript mechanics remain responsible for exact gains, buff effects, native availability prechecks, and final recommendation scores.
