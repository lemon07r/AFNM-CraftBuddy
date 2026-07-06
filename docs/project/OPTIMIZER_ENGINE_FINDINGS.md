---
title: Optimizer Engine Findings and Improvement Brief
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-06
source_of_truth: src/settings/index.ts, src/optimizer/search.ts, src/optimizer/nativeMcts.ts, crates/craftbuddy-engine/src/lib.rs, src/__tests__/__fixtures__/replay-snapshots/*
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/TESTING.md
  - src/settings/index.ts
  - src/optimizer/search.ts
  - src/optimizer/nativeMcts.ts
  - crates/craftbuddy-engine/src/lib.rs
---

# Optimizer Engine Findings and Improvement Brief

Last updated: 2026-04-25  
Release context: `v5.1.0`

## Purpose

This brief captures the preset tuning, benchmark observations, and recommended next steps for improving CraftBuddy optimizer speed and recommendation quality. It is written for follow-up AI coding agents so they can start from the current findings instead of rediscovering the same context.

## Executive Summary

- The Rust/WASM path is currently **not a full replacement engine**. It is a native Monte Carlo Tree Search (MCTS) **root-policy prior** layered on top of the TypeScript search.
- Because TypeScript still owns exact scoring, transitions, legality, and final recommendation ranking, Rust/WASM usually does **not** make the same quality result happen at a much lower budget yet.
- The MCTS prior can help at tight budgets when root ordering is the bottleneck, but it can also consume budget before TypeScript has reached a stable frontier.
- The largest current quality risks are high-realm, long-horizon, harmony-heavy, and large-skill-set crafts where the TypeScript beam/frontier is shallow and the Rust rollout model is too compact to be authoritative.
- `v5.1.0` adds a tracked replay benchmark harness, tightens harmony setup scoring, keeps experimental presets conservative, and continues treating Rust/WASM as a bounded root-policy prior.

## Current Presets

Defined in `src/settings/index.ts`.

### Legacy Presets

| Preset        | Depth |  Time | Nodes | Beam |
| ------------- | ----: | ----: | ----: | ---: |
| Instant       |    32 |  1.0s |  400k |    5 |
| Fast          |    48 |  2.0s |  1.0M |    5 |
| Balanced      |    64 |  4.5s |  2.0M |    5 |
| High Accuracy |    80 |  8.0s |  3.5M |    9 |
| Max           |    96 | 10.0s |  5.0M |   12 |

Legacy default was changed to `Fast` (`48`, `2.0s`, `1.0M`, beam `5`).

### Experimental / Rust-WASM Presets

| Preset        | Depth |  Time | Nodes | Beam |
| ------------- | ----: | ----: | ----: | ---: |
| Instant       |    32 | 1.25s |  400k |    5 |
| Fast          |    32 |  1.5s |  500k |    5 |
| Balanced      |    48 | 2.25s |  800k |    5 |
| High Accuracy |    64 | 3.25s |  1.3M |    5 |
| Max           |    80 |  4.0s |  2.0M |    5 |

Experimental MCTS config:

- `mctsIterations`: `250`
- `mctsMaxNodes`: `5000`
- `mctsRolloutDepth`: `clamp(round(lookaheadDepth / 4), 8, 16)`
- `mctsExploration`: inherited default `1.15`

## Why These Presets Were Chosen

The presets are intentionally conservative:

1. **Wall-clock budgets vary by PC.** The slowest experimental preset is `4.0s`, not `4.5s`, to leave headroom for slower machines, WASM initialization, and runtime UI overhead.
2. **Beam width stays at `5`.** Prior replay regressions showed wider beams can make partial-frontier results worse by preventing search from reaching enough depth.
3. **MCTS iterations stay low.** Direct checks showed higher MCTS iteration counts quickly consume seconds before TypeScript can do useful authoritative search work.
4. **Depth increases gradually.** Experimental depth is lower than legacy at high tiers because the MCTS prior and TS search share the same user-facing time budget.
5. **The presets optimize for sane cross-PC behavior, not one benchmark machine.** They are safe defaults, not proof of global optimality.

## Benchmark Findings

### Focused Preset Timing Check

Using `user-report-resonance-regression.snapshot.json` as a hard harmony proxy:

| Experimental preset | Observed elapsed | Recommendation     | Depth reached |
| ------------------- | ---------------: | ------------------ | ------------: |
| Instant             |           ~1.25s | `focused_refine`   |             3 |
| Fast                |           ~1.50s | `focused_refine`   |             3 |
| Balanced            |           ~2.25s | `explosive_fusion` |             4 |
| High Accuracy       |           ~3.25s | `explosive_fusion` |             4 |
| Max                 |           ~4.00s | `explosive_fusion` |             4 |

Important: the existing `search.test.ts` regression expects this snapshot to prefer `focused_refine` under a stable legacy budget. The fact that deeper experimental presets still return fusion here means the current MCTS prior is not a general quality fix for harmony-heavy cases.

### Cross-Fixture Proxy Sweep

A temporary benchmark compared 14 replay fixtures with a simple contract score:

- allowed/disallowed skill keys or technique types,
- average elapsed time,
- average reached depth,
- failures per fixture.

Useful observations:

- Experimental `Fast` at about `1.5s` had no proxy failures in one sweep, while legacy `Fast` at `2.0s` still failed the resonance proxy. This is the strongest evidence that MCTS can sometimes reach comparable-or-better quality at lower budget.
- Experimental `Balanced`, `High Accuracy`, and `Max` did not consistently beat legacy quality proxies; the resonance snapshot remained a recurring failure.
- Same-budget experimental and legacy runs had similar wall time because both engines spend the configured time budget. Rust/WASM is not currently replacing the expensive TypeScript search.

### Direct MCTS Iteration Timing

On the resonance replay, approximate direct MCTS timings were:

| Rollout depth | Iterations | Approx elapsed |
| ------------: | ---------: | -------------: |
|            12 |        250 |         ~0.75s |
|            12 |        500 |         ~1.45s |
|            12 |       1000 |         ~2.64s |
|            12 |       1500 |         ~3.71s |
|            12 |       2000 |         ~4.72s |

This is why `250` iterations was selected. Higher values are not viable inside a 1–4 second shared search budget unless MCTS becomes the primary search or moves off the main path.

## Current Rust/WASM Integration Limits

Relevant files:

- `src/optimizer/search.ts`
  - Decides whether to call native MCTS.
  - Uses native policy only for root ordering/tie-breaking.
  - TypeScript remains authoritative.
- `src/optimizer/nativeMcts.ts`
  - Builds compact DTOs for Rust.
  - Derives and runs native MCTS.
- `crates/craftbuddy-engine/src/lib.rs`
  - Rust MCTS implementation.
- `src/settings/index.ts`
  - Preset values and MCTS settings passed through `getSearchConfig()`.

Key limitation in `src/optimizer/search.ts`:

- MCTS is only used when `useMonteCarloTreeSearch !== false`, depth is above `1`, skills exist, and craft/search complexity is high enough.
- MCTS policy only breaks root ties where TypeScript already considers moves close.
- It cannot override a clear TypeScript score difference.
- It does not own multi-turn final scoring, exact buffs, exact harmony semantics, cooldown parity, finish policy, or full recommendation ranking.

This design is safe, but it caps possible speed/quality gains.

## Answer: Is Rust/WASM Faster At Equal Accuracy?

Current answer: **not reliably**.

More precise:

- **Sometimes yes at tight budgets**: the MCTS prior can improve root ordering enough that a lower-budget experimental run matches or beats a higher-budget legacy run on some fixtures.
- **Not generally yes**: for high-realm/harmony cases, the current native engine is too shallow/compact and too limited in authority. It does not consistently recover the high-quality recommendation at lower wall time.
- **Same-budget speed is not meaningfully better**: because MCTS is additive and TypeScript still spends the configured budget, same-budget runs usually take about the same wall time.

## What To Improve Next

### Implemented in `v5.0.2`

- Native MCTS is now requested only after cheap terminal/target checks, and the actual request is capped to a small share of remaining search budget so TypeScript frontier search keeps priority.
- MCTS policy tie-breaking now requires both candidate actions to be present in the native policy, preventing unmodeled item or mechanics-heavy actions from losing a near-tie solely because Rust did not represent them.
- The TypeScript move-ordering path reuses each candidate's guaranteed survivability floor instead of recomputing it while sorting, and recursive search applies the safe-stabilize guard to unresolved base-goal states without suppressing already-secured sublime forge recovery lines.
- Finished craft scoring now probability-weights the sublime finish bonus by resolved craft-end bonus bands instead of treating raw `200/200` overcraft as equivalent to the guaranteed second-band `230/230` threshold.
- Rust MCTS expansion now previews deeper nodes with their actual condition queue and avoids cloning the full `MctsInput` for every preview score.

### Implemented in `v5.1.0`

- Added `scripts/optimizer/benchmark-engines.ts` plus `optimizer:bench` / `optimizer:bench:verbose` package scripts for repeatable replay-snapshot comparisons.
- The benchmark harness emits JSON and Markdown reports, validates flexible per-fixture contracts, supports custom fixture directories, includes same-budget MCTS on/off configs, and rejects unknown config IDs.
- Harmony subsystem scoring now values normalized Forge Works heat distance, partial Inscribed Patterns block progress, and imminent Spiritual Resonance switches more accurately.
- `buildScoringContext(...)` samples the top three productive moves to reduce outlier effects in high-skill-count crafts.
- Follow-up display no longer runs an extra deep search after root ranking; it uses cached best moves first and shallow fallback to preserve recommendation budget.
- Native MCTS dispatch now scales the requested work by craft complexity while keeping the actual request capped to roughly `15-20%` of remaining TypeScript search budget.
- Non-MCTS iterative deepening can report a conservative stable-recommendation early exit via `searchMetrics.earlyExit`.

### P0: Maintain the Real Benchmark Harness

Maintain the tracked benchmark script under `scripts/optimizer/benchmark-engines.ts`. It can:

1. Load replay snapshots.
2. Run legacy and experimental configs.
3. Compare:
   - recommendation key/type,
   - final simulated completion/perfection/stability,
   - death/failure/early-finish risk,
   - score margin vs known bad alternatives,
   - depth reached,
   - nodes explored,
   - time elapsed,
   - MCTS iterations/nodes/policy choice.
4. Output JSON and markdown summaries.

Suggested command shape:

```bash
bun run optimizer:bench -- --json tmp/engine-benchmark.json --markdown tmp/engine-benchmark.md
```

Do not assert strict wall-clock times in CI. Use local reports for tuning and CI assertions for deterministic quality contracts.

### P1: Expand Replay Corpus

Capture more real high-realm and harmony-heavy crafts:

- long sublime crafts,
- many known techniques,
- complicated cooldown/resource skills,
- forge heat edge cases,
- alchemical sequence/charge cases,
- resonance pending-switch cases,
- low-stability high-value crafts,
- cases where old CraftBuddy recommended bad finish/fusion/stabilize actions.

Good snapshot source:

- `window.craftBuddyDebug.exportOptimizerReplaySnapshot()`

Store curated fixtures under:

- `src/__tests__/__fixtures__/replay-snapshots/`

### P1: Port More Authoritative Mechanics To Rust

To get real speedups, Rust/WASM needs to own more than root policy. Candidate path:

1. Port exact skill legality and costs.
2. Port exact transition mechanics for buffs, cooldowns, conditions, resource costs, toxicity, and stability.
3. Port harmony subsystems with parity tests:
   - Forge Works heat,
   - Alchemical Arts charges/reactions,
   - Inscribed Patterns,
   - Resonance.
4. Port finish-craft expected-value scoring.
5. Add deterministic parity fixtures against TypeScript before trusting Rust results.

Only after this can Rust search replace large parts of TypeScript search instead of merely hinting at root ordering.

### P1: Make Native Search Budget-Aware

Current MCTS remains bounded and complexity-scaled. Continue improving by:

- skipping native MCTS below a minimum budget/complexity threshold,
- measuring WASM warmup separately,
- adapting iterations from observed rollout speed rather than a fixed ms-per-iteration estimate,
- increasing MCTS only after parity improves for high-skill-count, sublime, or harmony crafts.

### P2: Use MCTS More Intelligently

Possible improvements:

- Use MCTS to seed more than tie-breaks, but only after parity improves.
- Feed top-N MCTS root moves into TypeScript principal variation ordering.
- Reuse MCTS trees across adjacent turns when state fingerprints match expected transitions.
- Keep a small native policy cache keyed by state/config/condition fingerprint.

### P2: Refine Early Exit / Stability Detection

TypeScript can still spend the full time budget. A conservative non-MCTS early exit exists; refine it only with replay evidence. It returns early when:

- top recommendation stays stable across multiple completed iterative-deepening frontiers,
- score margin is well above tie window,
- no unsafe/probabilistic/terminal branch is near the top.

This may improve perceived speed more than tuning MCTS alone.

### P2: Improve Scoring For High-Realm/Harmony Crafts

Likely issues to investigate:

- Harmony value may be too delayed or too compressed in post-move scoring.
- Partial subsystem progress may be under/overvalued depending on craft type.
- Finish Craft EV and continuation EV can diverge at shallow depth.
- Resource/stability runway estimates may not scale enough with very large targets.
- Complicated skills with cooldowns/buffs need direct parity fixtures.

Use `craftbuddy-optimizer` skill and add replay tests before changing heuristics.

## Suggested Agent Workflow

1. Run focused tests:

```bash
bun run jest src/__tests__/search.test.ts src/__tests__/craftSimulation.test.ts
```

2. Run `bun run optimizer:bench` before and after candidate changes; avoid ad-hoc temp scripts.
3. Add or curate at least 10 high-realm/harmony replay fixtures.
4. Establish/refresh baseline tables for:
   - legacy presets,
   - experimental presets,
   - same-budget legacy vs MCTS,
   - MCTS off/on under identical depth/time/node/beam.
5. Only then tune MCTS iterations, rollout depth, node cap, and beam.
6. If recommendation quality remains mixed, fix scoring/parity before adding more constants.

## Validation Commands

For preset/settings changes:

```bash
bun run typecheck
bun run jest src/__tests__/settings.test.ts src/__tests__/search.test.ts src/__tests__/nativeMcts.test.ts
bun run test
```

For Rust/WASM changes:

```bash
bun run wasm:test
bun run wasm:build
bun run build
```

For release:

```bash
bun run release:validate
```

## Known Caveats

- Existing Jest tests disable native MCTS by default unless explicitly enabled or called through local scripts outside Jest.
- Wall-clock numbers are machine-dependent and should not become hard CI assertions.
- MCTS startup/warmup affects short-budget measurements.
- The current replay corpus is too small to prove broad high-realm accuracy.
- The experimental engine is safer than a full replacement because TypeScript remains authoritative, but that same safety limits speedups.

## Bottom Line For Future Agents

Do not assume the Rust/WASM engine is already faster or more accurate. Treat it as a useful but limited root-prior experiment. The highest-impact next step is a real benchmark harness plus more high-realm/harmony fixtures, followed by moving exact mechanics and larger parts of search into Rust only after parity is proven.
