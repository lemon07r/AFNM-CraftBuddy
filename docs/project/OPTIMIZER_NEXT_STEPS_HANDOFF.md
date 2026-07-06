---
title: Optimizer Next Steps Handoff
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-06
source_of_truth: docs/project/OPTIMIZER_ENGINE_FINDINGS.md, src/optimizer/search.ts, src/optimizer/nativeMcts.ts, crates/craftbuddy-engine/src/lib.rs, src/__tests__/__fixtures__/replay-snapshots/*
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/project/TESTING.md
  - src/optimizer/search.ts
  - src/optimizer/nativeMcts.ts
  - crates/craftbuddy-engine/src/lib.rs
  - src/__tests__/search.test.ts
  - src/__tests__/craftSimulation.test.ts
  - src/__tests__/nativeMcts.test.ts
  - scripts/optimizer/benchmark-engines.ts
---

# Optimizer Next Steps Handoff

## Purpose

This is the handoff for the next agent improving CraftBuddy optimizer accuracy and performance. Read this before starting so you do not rediscover the same context from `v5.0.1`/`v5.0.2`.

## Startup Checklist

1. Load skills:
   - `afnm-modding`
   - `craftbuddy-optimizer`
   - `typescript-afnm` for TypeScript changes
   - `rust-skills` for `crates/craftbuddy-engine/*`
   - `pre-commit-validation` before final validation/commit
2. Read:
   - `docs/project/OPTIMIZER_DESIGN.md`
   - `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`
   - this file
3. Keep boundaries:
   - `src/optimizer/*` remains pure simulation/search.
   - `src/modContent/*` owns runtime extraction and ModAPI access.
   - Rust/WASM MCTS is still a root-policy prior, not the source of truth.

## Current Baseline: `v5.0.2`

`v5.0.2` shipped these improvements:

- `Finish Craft` scoring now probability-weights the sublime finish bonus by resolved craft-end bonus bands.
- Candidate move ordering reuses each action's guaranteed survivability floor instead of recomputing it during sort/classification.
- Safe-stabilize guardrails apply deeper in unresolved base-goal search without suppressing already-secured sublime forge heat recovery.
- Native MCTS is budget-aware and capped to a small share of remaining TypeScript search time.
- MCTS tie-breaking only applies when both near-tied candidates are represented in the native policy.
- Rust MCTS expansion previews deeper nodes with the node's actual condition queue and avoids cloning full `MctsInput` for every preview score.
- Validation for `v5.0.2` passed `bun run release:validate`, `bun run wasm:test`, and targeted optimizer suites.

Known release references:

- Commit: `6e07755`
- Tag: `v5.0.2`
- Workshop item: `3661729323`
- GitHub Release: `https://github.com/lemon07r/AFNM-CraftBuddy/releases/tag/v5.0.2`

## Phase 1 Implementation Status: `v5.1.0`

This handoff's first implementation phase now includes:

- A tracked optimizer benchmark harness at `scripts/optimizer/benchmark-engines.ts`.
- Package scripts:
  - `bun run optimizer:bench`
  - `bun run optimizer:bench:verbose`
- JSON and Markdown benchmark reports under `tmp/` for local/manual comparison.
- Flexible replay contracts covering the existing replay corpus, including rank-order checks where a single universally-correct top skill is too brittle.
- Safer harmony frontier scoring for:
  - normalized Forge Works heat distance from the sweet spot,
  - partial Inscribed Patterns block progress,
  - imminent Spiritual Resonance pending switches,
  - top-three live skill sampling for long-craft runway estimates.
- Follow-up display budget isolation: cached best moves and shallow fallback are used after ranking instead of running an extra deep follow-up search.
- Conservative stable-recommendation early-exit telemetry via `searchMetrics.earlyExit`.

Latest local benchmark command:

```bash
bun run optimizer:bench -- --json tmp/engine-benchmark.json --markdown tmp/engine-benchmark.md --verbose
```

Latest local result on the existing 14-fixture corpus:

- `98` / `98` benchmark contracts passed across the seven tracked legacy/experimental/same-budget configs.
- No full benchmark wall-clock thresholds are asserted in CI; use the reports for trend comparison only.

## Important Findings To Preserve

### Rust/WASM is not yet a replacement engine

Do not assume Rust is generally faster at equal quality. The current Rust engine:

- uses compact rollouts,
- omits many exact TypeScript mechanics,
- does not own final recommendation scoring,
- can help with root ordering under tight budgets,
- can hurt harmony-heavy cases if trusted too much.

TypeScript currently remains authoritative for:

- legality,
- exact transition mechanics,
- scoring,
- finish-craft EV,
- transposition cache,
- returned recommendation ranking.

### Wider/deeper is not always better

Prior replay sweeps found wider beams and deeper partial frontiers can make recommendations worse when the search does not complete enough depth. Do not blindly increase beam width or MCTS iterations.

### Harmony is the hardest quality area

Problem cases cluster around:

- Spiritual Resonance switching and pending resonance state,
- Forge Works heat recovery/collapse,
- Alchemical Arts partial charge setup,
- Inscribed Patterns action blocks,
- high-realm crafts with many available skills and large target magnitudes,
- finish-vs-continue choices in sublime crafts.

### Wall-clock assertions are fragile

Do not put strict elapsed-time thresholds in CI. Use local benchmark reports for performance and deterministic replay contracts for CI.

## Recommended Work Order

1. Expand replay snapshot corpus and quality contracts.
2. Use the tracked benchmark harness before and after scoring/search changes.
3. Improve diagnostics/explainability so bad recommendations are easier to debug.
4. Fix scoring/parity issues revealed by benchmarks.
5. Port more exact mechanics to Rust only after TypeScript-vs-Rust parity fixtures exist.
6. Add safe performance wins such as cache reuse and early-exit stability detection.

## Workstream 1: Benchmark Harness

### Goal

Maintain the repeatable local tool that compares optimizer configurations over replay snapshots without relying on ad-hoc scripts.

### Suggested location

- `scripts/optimizer/benchmark-engines.ts` (implemented)

### Suggested command shape

```bash
bun run scripts/optimizer/benchmark-engines.ts --fixtures replay --json tmp/engine-benchmark.json --markdown tmp/engine-benchmark.md
```

Package scripts are available as `optimizer:bench` and `optimizer:bench:verbose`.

### Inputs

- Replay snapshots from `src/__tests__/__fixtures__/replay-snapshots/*.snapshot.json`
- Config matrix:
  - Legacy presets
  - Experimental presets
  - Same-budget MCTS off/on
  - Optional custom budget overrides

Uses existing helpers:

- `getReplaySearchInput(...)`
- `lookaheadSearch(...)`

### Metrics to record

Per run:

- fixture name,
- engine mode / config label,
- recommendation key/type/name,
- top score and score margin vs runner-up,
- full ordered top-N recommendation list,
- `searchMetrics.depthReached`,
- `searchMetrics.nodesExplored`,
- `searchMetrics.cacheHits`,
- `searchMetrics.timeTakenMs`,
- MCTS backend/iterations/nodes/rollout depth/best skill/policy count,
- expected final state,
- optimal rotation,
- whether any recommendation is marked `requiresProbabilisticSurvival`,
- finish projected success chance when present.

### Quality contract shape

Avoid hardcoding one universal "correct skill" for every fixture. Support a flexible fixture contract sidecar or inline map:

```ts
interface OptimizerFixtureContract {
  fixture: string;
  mustRecommendOneOf?: string[];
  mustNotRecommend?: string[];
  preferredTypes?: string[];
  forbiddenTypes?: string[];
  mustRankBefore?: Array<{ before: string; after: string }>;
  minDepthReached?: number;
  notes: string;
}
```

### Output

Produces both JSON and markdown:

- JSON for diffing across runs.
- Markdown table for humans:
  - fixture,
  - config,
  - recommendation,
  - pass/fail,
  - depth,
  - nodes,
  - elapsed,
  - notes.

### CI guidance

Do not put full benchmark timing in CI. A small deterministic contract subset can become Jest tests; full benchmark is local/manual.

### Phase 2 benchmark follow-up

When players provide new replay/snapshot data, add it to `src/__tests__/__fixtures__/replay-snapshots/`, add a flexible benchmark contract, run `bun run optimizer:bench`, then only promote deterministic quality findings into Jest regression tests once the expected behavior is clear.

## Workstream 2: Replay Corpus Expansion

### Goal

Add enough real replay coverage that tuning decisions are evidence-driven.

### Capture source

In-game debug export:

```js
window.craftBuddyDebug.exportOptimizerReplaySnapshot();
```

Store curated snapshots in:

```text
src/__tests__/__fixtures__/replay-snapshots/
```

### Needed fixture categories

Prioritize at least 10-20 new snapshots across:

- late high-realm crafts with 50+ available techniques,
- long sublime crafts after base success but before sublime success,
- Spiritual Resonance pending-switch states,
- Forge heat at `0`, `1`, `2`, `6`, `7`, and `10`,
- Alchemical charge sequences with one/two charges already present,
- Inscription blocks with partial stacks and an invalid-color temptation,
- low-stability crafts with proc-dependent recovery alternatives,
- finish-craft temptation where live continuation is better,
- cases where old CraftBuddy recommended bad finish/fusion/stabilize actions,
- complicated skills with cooldowns, buff costs, item actions, toxicity, or mastery entries.

### Existing useful fixtures

Known regression fixtures already in use:

- `user-report-resonance-regression.snapshot.json`
- `user-report-alchemical-sequence.snapshot.json`
- `skyfall-bow-heat-regression.snapshot.json`
- `forge-heat-runway-step-2.snapshot.json`
- `forge-heat-runway-step-3.snapshot.json`
- `low-stability-step-before.snapshot.json`
- `low-stability-regression.snapshot.json`
- `premature-finish-proc-floor.snapshot.json`
- `user-report-premature-finish-runway.snapshot.json`
- `user-report-fairy-recovery.snapshot.json`

### Tests to update

- Contract tests: `src/__tests__/search.test.ts`
- Multi-turn behavior: `src/__tests__/craftSimulation.test.ts`
- Harmony specifics: `src/__tests__/harmony.test.ts`

## Workstream 3: Diagnostics / Explainability

### Goal

Make bad recommendations debuggable without manually instrumenting `search.ts`.

### Suggested debug report fields

Expose optional diagnostic data through `searchMetrics` or a debug-only return field:

- score layer contributions:
  - progress,
  - target-met bonus,
  - buffs,
  - resources,
  - overshoot,
  - survivability,
  - toxicity/harmony,
  - finish EV,
  - step penalty,
- guaranteed survivability floor,
- `requiresProbabilisticSurvival`,
- unsafe-safe-stabilize classification,
- harmony subsystem quality,
- MCTS policy value/visits for root actions,
- cached best-move source,
- follow-up source:
  - cache,
  - shallow fallback,
  - deep fallback.

### Suggested API

Do not show this in normal UI by default. Prefer debug-only export:

```ts
window.craftBuddyDebug.explainLastRecommendation();
```

or an option on replay/benchmark tooling that attaches diagnostics locally.

## Workstream 4: Scoring Improvements

Use benchmark failures before changing constants.

### Candidate areas

1. **Harmony sub-system quality**
   - File: `src/optimizer/search.ts`
   - Function: `evaluateHarmonySubsystemQuality(...)`
   - Check whether partial setup is valued correctly for:
     - Resonance pending switches,
     - Alchemical two-charge states,
     - Forge correction pressure,
     - Inscription stack/block progress.

2. **Finish-vs-continue EV**
   - File: `src/optimizer/search.ts`
   - Functions:
     - `scoreFinishedOutcome(...)`
     - `getFinishAction(...)`
     - `scoreStateConsideringFinish(...)`
   - Watch for shallow finish lines outranking live runway, especially high-realm/sublime cases.

3. **Runway/resource scaling**
   - File: `src/optimizer/search.ts`
   - Functions:
     - `buildScoringContext(...)`
     - `scoreState(...)`
   - Ensure large target magnitudes use representative live skill gains rather than raw base stats or low-output filler moves.

4. **Move ordering**
   - File: `src/optimizer/search.ts`
   - Function: `buildOrderedMoveCandidates(...)`
   - Fix post-action scoring inputs, not separate recommendation-only heuristics.

### Anti-patterns

Avoid:

- one-off skill-key exceptions,
- hard-filtering legal skills before evaluation,
- adding a heuristic lane that disagrees with recursive search,
- large resource tie-breakers,
- tuned constants without replay proof.

## Workstream 5: Rust/WASM Parity and Authority

### Current Rust limits

Files:

- `src/optimizer/nativeMcts.ts`
- `crates/craftbuddy-engine/src/lib.rs`

Known gaps:

- item actions are filtered out from native input,
- many `SkillDefinition.effects` details are compacted or absent,
- mastery entries and runtime-derived effect conditions are simplified,
- full harmony scoring does not match TypeScript exactly,
- finish-craft scoring is compact,
- Rust score scaling is not identical to TypeScript `ScoringContext`,
- native action legality is not authoritative.

### Safe path

Do this incrementally:

1. Add TS-vs-Rust deterministic parity fixtures for:
   - state serialization,
   - action legality,
   - one-step transitions,
   - harmony transitions,
   - finish outcome scoring.
2. Port exact mechanics in small slices.
3. Only after parity is proven, let Rust influence more than near-tie root ordering.

### Validation commands

For Rust changes:

```bash
bun run wasm:test
bun run wasm:build
bun run jest src/__tests__/nativeMcts.test.ts src/__tests__/search.test.ts
bun run build
```

If WASM-backed Jest is needed:

```bash
CRAFTBUDDY_ENABLE_WASM_MCTS_TESTS=1 bun run jest src/__tests__/nativeMcts.test.ts
```

## Workstream 6: Safe Performance Wins

Prefer changes that do not alter quality semantics first.

### Candidate improvements

1. **Stable recommendation early exit**
   - Implemented conservatively for non-MCTS iterative deepening.
   - Stops only when:
     - top recommendation is stable across several completed depths,
     - score margin is well above tie window and average progress,
     - no unsafe/probabilistic/terminal branch is near top.
   - Exposed as `searchMetrics.earlyExit`.

2. **MCTS policy cache**
   - Cache by state/config/condition fingerprint.
   - Invalidate on state mismatch.
   - Keep small and bounded.

3. **Adjacent-turn MCTS reuse**
   - Reuse tree/policy only if previous top action matches observed state transition.
   - Harder than root policy cache; do after diagnostics.

4. **Reduce repeated state/gain calculations**
   - Continue auditing calls to:
     - `applySkill(...)`,
     - `calculateActionSurvivabilityFloor(...)`,
     - `calculateDisplayedSkillGains(...)`,
     - condition transition generation.

5. **Follow-up generation budget isolation**
   - Implemented: follow-up display now uses cached best moves first and shallow fallback only after ranking.
   - Continue benchmarking if follow-up quality regressions are reported.

## Suggested Validation Matrix

### During iteration

Run focused tests based on touched area:

```bash
bun run jest src/__tests__/search.test.ts
bun run jest src/__tests__/craftSimulation.test.ts
bun run jest src/__tests__/harmony.test.ts
bun run jest src/__tests__/nativeMcts.test.ts
```

### Before claiming done

For optimizer/search changes:

```bash
bun run typecheck
bun run test
```

For Rust/WASM changes:

```bash
bun run wasm:test
bun run wasm:build
bun run build
```

For docs changes:

```bash
bun run docs:inventory
bun run docs:check
```

For release:

```bash
bun run release:validate
```

## Open Questions

- What fixture contracts best represent "good" high-realm behavior when there is no single exact skill answer?
- Should benchmark contracts measure final simulated outcome over N turns instead of only root recommendation?
- How much native policy cache is safe without stale state risk?
- Which mechanics should Rust port first: finish EV, harmony transitions, item actions, or mastery/effect conditions?
- Is the current default of Legacy still correct once benchmark evidence improves Experimental reliability?

## Best First Task For The Next Agent

Use the benchmark harness with new knowledgeable-player snapshots. Start by adding flexible fixture contracts for each new replay, then compare current recommendations against the expected player rationale before tuning constants or search behavior.
