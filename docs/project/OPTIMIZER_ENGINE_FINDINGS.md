---
title: Optimizer Engine Findings
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-27
source_of_truth: crates/craftbuddy-engine/*, src/optimizer/nativeMcts.ts, src/optimizer/search.ts, src/settings/index.ts, scripts/optimizer/benchmark-engines.ts
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md
  - docs/project/TESTING.md
---

# Optimizer Engine Findings

What is actually true about the Rust/WASM engine, current target AFNM **0.7.6**, and which candidate improvements have already been measured and rejected. Read this before proposing engine work.

Raw measurements, reproduction commands and the profiling harness live in `docs/project/ENGINE_PERFORMANCE.md`. This file is the decision record.

## Current state

| Question | Answer |
| --- | --- |
| Does Rust model the same mechanics as TypeScript? | **Yes.** Effect trees, generic active buffs, mastery, Soulflame triggers and stack consumption, toxicity, and pill/reagent actions all live in `crates/craftbuddy-engine/src/effects.rs`; `outcome.rs` mirrors the conjunctive outcome model. |
| Does Rust see the same action space? | **Yes.** `buildNativeMctsInput` no longer filters `actionKind !== 'item'`, and serialises effects, mastery, granted buffs, buff gates, `items`, `consumedPillsThisTurn` and buffs. |
| Is that parity proven? | **Yes** — 134 scenarios / 1,432 transitions in the differential corpus, asserted on both sides, plus the Rust unit suite (64 passing tests, 3 `#[ignore]`d long-running profiles) covering the ported mechanics. |
| Is Rust the authority for recommendations? | **No, deliberately.** It supplies a root MCTS policy prior for near-tie ordering. TypeScript owns final ranking and stays the differential oracle and the no-WASM fallback. |
| Is the recommendation deterministic? | **Yes**, and now directly tested (`differential_tests::mcts_search_is_deterministic`). It was not before 0.7.5. |

## The two bugs that mattered more than any tuning

Both were invisible to unit tests and were only exposed by feeding real production-shaped payloads through the engine in a loop.

### The native prior was dead on every real craft

`serde` treats an explicit `null` as a _present_ value, so one `null` on a non-optional engine field fails the **entire** `MctsInput` deserialization. Real technique data spells "no value" as `null` — measured on 0.7.5, where **188 of the game's 226** crafting skills carried `mastery: null`. Every real craft therefore lost its native prior and silently fell back to plain heuristic ordering, with no error anywhere.

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

## Cross-step transposition reuse (Phase 2.1, 2026-07-28)

`CrossStepSearchCache` hands one transposition table per craft scope across
search calls (`modContent` builds the scope from targets/caps/stats/roster/
settings; budget fields excluded; table dropped on scope change or beyond
400k entries). The search keeps its working table per call and treats the
shared table as a second level: exact-depth hits copy through, the
budget-truncated frontier fallback and PV move promotion may consult it, and
only completed passes merge back at search end, so a truncated search never
publishes a partial frontier. Hits surface as `searchMetrics.crossStepHits`.

Measured on the tutorial fixture (instrumented key dumps, then jest
contracts in `search.test.ts`):

- **Unchanged-state redispatch collapses.** A repeat search of the same
  state/depth/queue context reproduces every probe key, so the whole
  deepening loop is served from the table (523 → ~0 explored nodes in the
  fixture). If the populating search was itself budget-capped, its completed
  shallow passes still carry over: a warm `maxNodes: 80` run after a
  `maxNodes: 40` run recorded 22 cross-step hits, and at a generous budget
  the warm run explored strictly fewer nodes with a byte-identical
  recommendation.
- **Step-advanced reuse is structurally rare — verified, not assumed.** The
  normalized key includes the realized condition-queue context (visible
  3-window plus the stochastic tail draws the transition tree branches on).
  Stepping the craft shifts the window and rotates the draw positions, so a
  step-advanced state's probe keys are disjoint from what the previous step
  stored: key dumps showed 8 same-state entries with zero queue-exact
  matches. Relaxing the key to share more would mix scoring contexts that
  genuinely differ (future conditions change gains), so it was rejected.
- **No drift under any budget.** Warm and table-free searches return
  byte-identical recommendations and scores once passes complete; the
  replay bench stays at 98/98.

## Relaxed early exit (Phase 2.2, 2026-07-28)

Instrumenting all 14 replay payloads showed the old gate was dead code in
production: real 2s searches are time-bound around depth 3-7
(~120-6k nodes/s depending on roster/harmony weight), while the old
criteria needed 4 stable passes no shallower than 35% of the planned depth
(depth 22+ on a 64-deep plan). Zero early exits ever fired.

The relaxation, with each change justified by a measured blocker:

1. **Minimum depth `max(baseline+6, 35% of plan)` → `baseline+2` (= 3).**
   The old formula's first *eligible* pass was deeper than the time-bound
   frontier ever reached.
2. **Stable passes 4 → 3.** Three consecutive completed passes with an
   unchanged top key is the stability signal; the fourth pass cost a full
   extra frontier for no measurable ranking change.
3. **The risky-near-top scan now skips the top line itself.** The old scan
   included index 0, so a dominant-but-unsafe-flagged recommendation (e.g.
   a low-stability recovery stabilize) blocked its own exit forever even
   with a 198k margin. What matters is whether a *challenger* close enough
   to overtake is risky or terminal; the top line's risk flags are already
   priced into its score.

Unchanged on purpose: the margin threshold (`max(10 x tieWindow, 2 x
avgGainPerTurn)`), the challenger scan over the next three ranks, and the
hard disable whenever the native MCTS policy participates in root ordering
(its near-ties need the full budget to converge).

Measured on the replay payloads (before → after):

- `low-stability-regression`: exits at depth 5, 8259 → 271 nodes.
- `low-stability-step-before`: exits at depth 5, 9078 → 300 nodes.
- `user-report-fairy-recovery`: exits at depth 6, 1041 → 355 nodes (and
  returns as soon as stability is proven instead of burning the rest of
  the 2s wall-clock budget on a partial pass that is then discarded).
- The contested payloads (margins 46-732 against thresholds 1.3k-10.6k)
  correctly never exit.

Accuracy gate: replay bench stays at 98/98, and the two jest contracts pin
both sides — the stable fairy-recovery line must exit (node-budget-bound,
so machine speed cannot matter) and the contested pattern-step-1 state must
not.

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

### Quality-vs-spend map (Phase 2.3, 2026-07-28)

`bun run optimizer:bench` sweeps all presets over the 14 replay payloads
(98 contracts). Measured after the Phase 2.1/2.2 changes:

| Config | avg ms | avg depth | contracts | early exits | top-key agreement with Legacy Balanced |
| --- | --- | --- | --- | --- | --- |
| Legacy Instant (32d/1.0s/400k) | 852 | 4.6 | 14/14 | 3 | 10/14 |
| Legacy Fast (48d/2.0s/1M) | 1545 | 5.0 | 14/14 | 6 | 11/14 |
| Same-budget Legacy 2s | 1540 | 5.1 | 14/14 | 6 | 12/14 |
| Same-budget MCTS 2s | 2002 | 5.2 | 14/14 | 0 | 10/14 |
| Legacy Balanced (64d/4.5s/2M) | 2939 | 5.3 | 14/14 | 6 | (reference) |
| Experimental Fast (32d/1.5s/500k) | 1502 | 5.0 | 14/14 | 0 | 10/14 |
| Experimental Balanced (48d/2.25s/800k) | 2252 | 5.3 | 14/14 | 0 | 11/14 |

Read: every preset passes every contract; the disagreements cluster on the
four contested payloads (`pattern-step-1`, `resonance-regression`,
`live-workshop-step-2`, `premature-finish-runway`) where contracts are
deliberately materiality-aware because depth-dependent runner-up ranking
shifts with whatever the wall clock completes. Legacy Balanced buys +0.3
average depth for 1.9x the time of Fast — no retune signal, presets stay.
The relaxed early exit fires on 3-6 of 14 payloads for the legacy presets
(stable mid-craft turns return immediately instead of burning the budget);
the experimental configs never exit because the MCTS gate stays intact.

**Wall-clock budgets intentionally scale with machine speed.** A preset's
milliseconds cap *time*, not work: slower machines complete fewer and
shallower passes at the same budget and land on a different (shallower but
still completed) frontier. That is by design — the alternative (fixed node
budgets) would freeze slow machines for many multiples of the intended
time. Contracts therefore assert recommendation invariants and node
counts, never wall-clock depth.

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

Status: **closed in 6.0.0** — the reported bad recommendation was diagnosed and fixed, the whole benchmark was green at that gate (98 of 98 contract checks), nothing about it turned out to be resonance-specific, and no scoring constant was tuned.

What remains is not the original report: this fixture's `mustRankBefore` clause is a **near-tie whose direction depends on the search depth actually reached**, and depth is machine-dependent. On an idle machine the 6.1.0 tree passes the whole benchmark (98 of 98 contracts). The same tree reported this clause failing on the deepest config when the benchmark was run while the Jest suite was saturating the CPU: less wall clock means less depth, which flips the tie. That is the documented depth sensitivity below, not a re-opening of the user report — and it is still not a licence to tune a constant.

What the investigation ruled out first:

- The resonance model is byte-for-byte faithful to the runtime, including the `-9` harmony / `-3` stability mismatch penalty and the pending-switch exemption, re-verified unchanged in 0.7.6 (`docs/project/RUNTIME_EVIDENCE.md` section 3). A wrong resonance formula could not explain it.
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
