---
title: Optimizer Engine Findings
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-26
source_of_truth: crates/craftbuddy-engine/*, src/optimizer/nativeMcts.ts, src/optimizer/search.ts, src/settings/index.ts, scripts/optimizer/benchmark-engines.ts
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md
  - docs/project/TESTING.md
---

# Optimizer Engine Findings

What is actually true about the Rust/WASM engine after the 0.7.5 rework, and which candidate improvements have already been measured and rejected. Read this before proposing engine work.

Raw measurements, reproduction commands and the profiling harness live in `docs/project/ENGINE_PERFORMANCE_075.md`. This file is the decision record.

## Current state

| Question | Answer |
| --- | --- |
| Does Rust model the same mechanics as TypeScript? | **Yes.** Effect trees, generic active buffs, mastery, Soulflame triggers and stack consumption, toxicity, and pill/reagent actions all live in `crates/craftbuddy-engine/src/effects.rs`; `outcome.rs` mirrors the conjunctive outcome model. |
| Does Rust see the same action space? | **Yes.** `buildNativeMctsInput` no longer filters `actionKind !== 'item'`, and serialises effects, mastery, granted buffs, buff gates, `items`, `consumedPillsThisTurn` and buffs. |
| Is that parity proven? | **Yes** — 129 scenarios / 1,417 transitions in the differential corpus, asserted on both sides, plus the Rust unit suite (58 passing tests, 3 ignored long-running profiles) covering the ported mechanics. |
| Is Rust the authority for recommendations? | **No, deliberately.** It supplies a root MCTS policy prior for near-tie ordering. TypeScript owns final ranking and stays the differential oracle and the no-WASM fallback. |
| Is the recommendation deterministic? | **Yes**, and now directly tested (`differential_tests::mcts_search_is_deterministic`). It was not before 0.7.5. |

## The two bugs that mattered more than any tuning

Both were invisible to unit tests and were only exposed by feeding real production-shaped payloads through the engine in a loop.

### The native prior was dead on every real craft

`serde` treats an explicit `null` as a _present_ value, so one `null` on a non-optional engine field fails the **entire** `MctsInput` deserialization. Real 0.7.5 technique data spells "no value" as `null`, and **188 of the game's 226** crafting skills carry `mastery: null`. Every real craft therefore lost its native prior and silently fell back to plain heuristic ordering, with no error anywhere.

Fixed with a deep `stripNullish` at the single bridge boundary in `src/optimizer/nativeMcts.ts`, plus a `null_default` serde helper in Rust as defence in depth. Guarded by `nativeMcts.test.ts` asserting that no `null` survives into the serialized payload at all.

`bun run optimizer:bench` across 98 runs, before → after:

| Metric                             | Before      | After        |
| ---------------------------------- | ----------- | ------------ |
| Runs carrying a native MCTS policy | **0 of 98** | **42 of 98** |
| Contracts passed / failed          | 96 / 2      | **97 / 1**   |

End-to-end node counts move `-2.9%`, concentrated in the MCTS-enabled configs (`-6%` to `-8%`). That is the expected price of a prior that now genuinely runs and consumes part of the budget, not a regression.

### The recommendation was not deterministic

`normalize_distribution` merged the generated condition distribution through a `HashMap`, so the probability total was summed in hash order _and_ exact ties (`positive` vs `negative` at harmony `0`) were broken by hash order. Two of eight identical runs of `forge-heat-runway-step-3` produced a different policy.

It is now an insertion-ordered merge mirroring `normalizeConditionDistribution` in `search.ts`. A non-deterministic recommender cannot be regression-tested at all, so the property is asserted directly over all corpus scenarios.

## Performance: 1.90x at identical search shape

112 runs over the 14 replay payloads at a fixed node budget: `369.801 → 194.555 ms` per run (**-47.4%**), with nodes (25,048), iterations (28,000) and the ranked candidate-score digest **unchanged**.

Three measured redundancies, in impact order:

1. `resolve_active_buffs` hoisted out of the candidate loop — 12,308.9 → 893.6 calls per run.
2. `effective_max_pool` fast path — `maxpool` can only move if an active buff declares that stat, but the full recomputation ran twice per transition at 7,400 ns/call, about 46% of a transition. Now 15.9 ns/call, and it removed the interim state clone it fed.
3. `FxHasher` instead of SipHash for the hot maps, whose keys are short ASCII identifiers.

Because no `perf`/`valgrind`/`rustup` is available in the development container, the measurement harness ships with the crate: a Cargo-feature-gated counter module (compiled out by default, never enabled for the WASM artefact) and three `#[ignore]`d tests, one of which prints the ranked-policy digest that any future optimization must leave byte-identical.

## Rejected with data — do not re-attempt without new evidence

### Compact fixed-layout `EngineState` with mutate/undo

**Measured, then rejected.** The premise was that per-node clones dominate. They do not: `EngineState::clone()` costs 1,358.9 ns against a 28,919.3 ns transition — **4.70%** — so the entire theoretical ceiling of eliminating cloning was under 5%. Against that sits a high divergence risk, since an undo must exactly reverse harmony subsystems, buff sets, items and cooldowns. The three changes above were taken instead: 47.4% for no behavioural risk. Post-change, cloning is 7.31% of a much smaller transition, so the absolute headroom in nanoseconds shrank further.

### Packed numeric transposition-cache key

**Dropped deliberately.** Profiling put stringified cache keys at **1.0-1.4%** of the search budget. The collision risk of a packed key is not justified by that, and the original assumption that key construction was the bottleneck was simply wrong — the cost was spread across pure per-node helpers.

### Higher MCTS iteration counts

Measured on the resonance replay: `250` iterations ≈ `0.75 s`, `500` ≈ `1.45 s`, `1000` ≈ `2.64 s`, `2000` ≈ `4.72 s`. Inside a shared 1-4 s user budget, more iterations buy less than the TypeScript frontier they displace. `250` stays.

### Wider beams

Replay sweeps repeatedly showed a wider beam reaching a shallower frontier and producing _worse_ recommendations, including forge turns that strand on a shallow terminal frontier and drift into heat overshoot. Beam stays at `5` through mid-budget presets.

## Presets

Defined in `src/settings/index.ts`. Unchanged by the 0.7.5 rework.

| Preset | Legacy (depth / time / nodes / beam) | Experimental |
| --- | --- | --- |
| Instant | 32 / 1.0 s / 400k / 5 | 32 / 1.25 s / 400k / 5 |
| Fast | **48 / 2.0 s / 1.0M / 5** (default) | 32 / 1.5 s / 500k / 5 |
| Balanced | 64 / 4.5 s / 2.0M / 5 | 48 / 2.25 s / 800k / 5 |
| High Accuracy | 80 / 8.0 s / 3.5M / 9 | 64 / 3.25 s / 1.3M / 5 |
| Max | 96 / 10.0 s / 5.0M / 12 | 80 / 4.0 s / 2.0M / 5 |

Experimental depth is lower than legacy at high tiers because the prior and the TypeScript search share one user-facing budget, and the ceiling is `4.0 s` to stay under the `4.5 s` responsiveness cap on slower machines. These are safe cross-machine defaults, not proof of optimality on one benchmark box.

MCTS config: `mctsIterations 250`, `mctsMaxNodes 5000`, `mctsRolloutDepth clamp(round(lookaheadDepth / 4), 8, 16)`, `mctsExploration 1.15`.

## Benchmark harness

```bash
bun run optimizer:bench
bun run optimizer:bench -- --json tmp/engine-benchmark.json --markdown tmp/engine-benchmark.md --verbose
```

`scripts/optimizer/benchmark-engines.ts` runs the replay corpus across seven tracked configs (legacy presets, experimental presets, same-budget MCTS on/off), validates per-fixture contracts (`mustRecommendOneOf`, `mustNotRecommend`, `preferredTypes`, `forbiddenTypes`, `mustRankBefore`, `minDepthReached`), and emits JSON plus Markdown.

Rules for using it:

- Never assert wall clock in CI. Use the reports for trend comparison and deterministic contracts for regressions.
- A failing contract is evidence to investigate the model, not licence to tune a scoring constant until it passes.
- Contracts may only change with recorded runtime-oracle evidence.

## Settled finding: `user-report-resonance-regression`

Status: **closed in 6.0.0.** The whole benchmark is green — 98 of 98 contracts pass. Nothing about it turned out to be resonance-specific, and no scoring constant was tuned.

What the investigation ruled out first:

- The resonance model is byte-for-byte faithful to the 0.7.5 runtime, including the `-9` harmony / `-3` stability mismatch penalty and the pending-switch exemption (`docs/project/RUNTIME_EVIDENCE_075.md` section 3). A wrong resonance formula could not explain it.
- The fixture's snapshot carries **no `harmonyData` at all**, so the harmony block never ran for it either way. The "harmony is wrongly gated behind `isSublimeCraft`" hypothesis is ruled out _for this fixture_.

What it actually was — a real mechanics bug in **both** engines:

`calculateSkillGains` (and `evaluate_skill_gains`) weighted progress by success chance and only then clamped it to the remaining bar: `min(p * gain, headroom)`. The runtime applies progress **only on success** — the completion applier is a plain `r.completion += e` inside the success branch — so the expectation is `p * min(gain, headroom)`.

With the old order, the clamp swallowed the failure risk of any technique whose raw gain overshot the bar. On this snapshot Explosive Fusion lands 65% of the time and its raw completion gain exceeds the 9,170 completion remaining, so it was credited with the **full** 9,170: a 35%-failure gamble advertised as a guaranteed bar-filler, and the top recommendation once the search ran past depth 6. That is exactly the user report. Fixed identically in both engines; 11 of 585 corpus transitions shifted by one point and both engines still agree on every transition.

One contract change came with it. The runner-up ordering clause (`focused_refine` before `explosive_fusion`) tracks whichever depth the wall-clock budget happens to finish — measured on this fixture, refine leads at depth 4, inverts at 5, and leads again from 6 — so it is now materiality-aware: it **always** fails when the losing candidate is actually recommended, and otherwise only when the score gap exceeds an explicit tolerance. `rankedScores` was added to the report so an ordering claim always comes with numbers.

Search scores are not normalised across depths (~18k at depth 4 against ~44k at depth 5). Any assertion about ranking must therefore be node-budget bound, never wall-clock bound; `search.test.ts` pins this fixture at a fixed node budget for that reason.

## Validation commands

```bash
bun run wasm:test                                        # Rust unit + differential tests
bun run wasm:build                                       # rebuild the inline WASM artefact
bun run jest src/__tests__/engineDifferential.test.ts    # TypeScript side of the corpus
bun run jest src/__tests__/nativeMcts.test.ts            # bridge shaping, no-null assertion
bun run optimizer:differential-corpus                    # regenerate the corpus after a mechanics change
bun run optimizer:bench                                  # contract + trend comparison
```

Native MCTS is disabled under Jest unless `CRAFTBUDDY_ENABLE_WASM_MCTS_TESTS=1`.
