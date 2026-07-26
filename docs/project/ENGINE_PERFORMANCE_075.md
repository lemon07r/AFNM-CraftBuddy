---
title: Rust Engine Performance and Neutrality Evidence (0.7.5)
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-26
source_of_truth: crates/craftbuddy-engine/src/profile_tests.rs, crates/craftbuddy-engine/src/profiling.rs, scripts/optimizer/benchmark-engines.ts
review_cycle_days: 90
related_files:
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/project/MECHANICS_PARITY.md
  - crates/craftbuddy-engine/src/profile_tests.rs
  - crates/craftbuddy-engine/src/profiling.rs
  - src/optimizer/nativeMcts.ts
---

# Rust Engine Performance and Neutrality Evidence (0.7.5)

Measurements behind the 0.7.5 engine performance work. Every number here was
produced on this repository; nothing is estimated. Read this before proposing
another engine optimization — two of the obvious candidates have already been
measured and rejected with data.

## How to reproduce

No `perf`, `valgrind` or `rustup` is available in the development container, so
profiling lives in the crate itself as three `#[ignore]`d tests plus a
Cargo-feature-gated counter module (`profiling` — compiled out by default and
never enabled for the WASM artefact).

```bash
# Real production-shaped payloads: dumps buildNativeMctsInput for all 14 replay
# snapshots to tmp/native-mcts-inputs.json (~0.05 s).
bun run scripts/optimizer/dump-native-mcts-inputs.ts

CT="cargo test --manifest-path crates/craftbuddy-engine/Cargo.toml --release --lib"
$CT -- --ignored --nocapture --test-threads 1 profile_mcts_throughput        # ~24 s
$CT -- --ignored --nocapture --test-threads 1 profile_component_microbench   # ~10 s
$CT -- --ignored --nocapture --test-threads 1 profile_ranked_policy_digest   # ~5 s
$CT --features profiling -- --ignored --nocapture --test-threads 1 profile_mcts_throughput
```

`profile_ranked_policy_digest` is the neutrality proof: it prints the ranked
candidate scores for every payload, so an optimization is only allowed to ship
if its output `diff`s clean against the pre-change run (cargo's own timing lines
excepted).

## Throughput: 1.90x at identical search shape

112 runs over the 14 replay payloads, release build, fixed node budget.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Wall clock | 41,417.675 ms | 21,790.132 ms | **-47.4%** |
| Per run | 369.801 ms | 194.555 ms | **-47.4% (1.90x)** |
| Per node | 1,653,532 ns | 869,935 ns | **-47.4%** |
| Nodes | 25,048 | 25,048 | unchanged |
| Iterations | 28,000 | 28,000 | unchanged |
| Ranked policy digest | baseline | byte-identical | no behaviour change |

The counters confirm the search *shape* is untouched and only redundant work
disappeared (`--features profiling`, per run):

| Counter | Before | After |
| --- | --- | --- |
| `iteration` | 250.0 | 250.0 |
| `node_created` | 223.6 | 223.6 |
| `apply_skill` | 6,203.8 | 6,203.8 |
| `can_apply_skill` | 12,308.9 | 12,308.9 |
| `score_state` | 6,718.6 | 6,718.6 |
| `preview_action_score` | 6,468.6 | 6,468.6 |
| `rollout_step` | 227.9 | 227.9 |
| `resolve_active_buffs` | 12,308.9 | **893.6** |
| `state_clone` | 13,374.0 | **7,170.2** |

### What actually changed

1. **`resolve_active_buffs` hoisted out of the candidate loop.** It clones every
   active buff and its definition, and move ordering evaluated it once per
   candidate against one shared state. It now runs once per action space;
   `apply_skill_with_buffs` / `can_apply_skill` / `preview_action_score` take the
   pre-resolved buffs. 12,308.9 -> 893.6 calls per run.
2. **`effective_max_pool` fast path.** `maxpool` can only move if an active buff
   *declares* that stat, yet the full recomputation ran twice per transition and
   measured 7,400 ns/call - roughly 46% of a transition. Guarding it also removed
   the interim full-state clone it fed (`state_clone` 13,374 -> 7,170).
3. **`FxHasher` for the hot maps** (`Variables`, `UpgradeMap`, the expression
   cache, buff lookup). These keys are short ASCII identifiers, where SipHash's
   collision resistance buys nothing.

Component microbenchmark, ns/call mean over 20,000 calls:

| Call | Before | After |
| --- | --- | --- |
| `EngineState::clone` | 1,358.9 | 1,335.7 |
| `resolve_active_buffs` | 3,865.7 | 3,669.8 |
| `can_apply_skill` | 1,241.8 | 1,099.4 |
| `apply_skill` | 28,919.3 | 18,264.0 |
| `score_state` | 241.6 | 246.3 |
| `effective_max_pool` | 7,400.0 | **15.9** |
| `resolve_action` | 10,418.6 | 8,914.5 |
| `calculate_skill_gains` | 863.9 | 910.3 |

## Rejected with data

### Compact fixed-layout `EngineState` with mutate/undo

**Measured, then rejected.** The premise was that per-node clones dominate. They
do not: `EngineState::clone()` costs 1,358.9 ns against a 28,919.3 ns
transition, i.e. **4.70%** of the work, so the entire theoretical ceiling of
removing cloning was under 5%. Against that sits a high risk of divergence when
unwinding harmony subsystems, buff sets, items and cooldowns - every one of
which is a mutation an undo would have to reverse exactly.

The three changes above were taken instead and delivered 47.4% for no
behavioural risk. Post-change, cloning is 7.31% of a now much smaller
transition, so the absolute headroom shrank further in nanoseconds.

### Packed numeric transposition-cache key

**Dropped deliberately** (recorded in the 0.7.5 plan). Profiling put stringified
cache keys at 1.0-1.4% of the search budget, so the collision risk is
unjustified.

## Two correctness bugs found by the profiling work

Both were found because production-shaped payloads were finally being fed to the
engine in a loop, which is worth noting: neither was visible from the unit tests.

### The native prior was silently disabled for real game data

`serde` treats an explicit `null` as a *present* value, so a `null` on a
non-optional engine field fails the **entire** `MctsInput` deserialization. Real
0.7.5 technique data spells "no value" as `null`, and **188 of the game's 226**
crafting skills carry `mastery: null`. The search therefore lost its native
prior on every real craft and fell back to the plain heuristic ordering, without
any error surfacing.

Fixed at the one boundary that crosses into Rust: a deep `stripNullish` in
`src/optimizer/nativeMcts.ts`, plus a `null_default` serde helper in Rust as
defence in depth. Guarded by `nativeMcts.test.ts` ->
"never sends an explicit null into the Rust payload", which asserts the whole
serialized payload contains no `null`.

Evidence from `bun run optimizer:bench` (98 runs, before/after, WASM rebuilt for
each side):

| Metric | Before | After |
| --- | --- | --- |
| Runs carrying a native MCTS policy | **0 of 98** | **42 of 98** |
| Contracts passed | 96 | **97** |
| Contracts failed | 2 | **1** |

The single remaining failure is `user-report-resonance-regression` on
`legacy_balanced`; the `experimental_balanced` failure is gone. Resolving the
last one is the resonance-contract decision in the release step, and it is now a
one-config finding rather than two.

Node counts move slightly *down* end to end, which is expected and not a
regression: the native pre-pass now genuinely runs and consumes part of the time
budget, where before it aborted almost immediately.

| Config | Nodes before | Nodes after | Change |
| --- | --- | --- | --- |
| Legacy Instant (32d, 1s, 400k) | 21,496 | 21,571 | +0.3% |
| Legacy Fast (48d, 2s, 1M) | 47,511 | 46,692 | -1.7% |
| Same Budget Legacy (48d, 2s, 1M) | 48,316 | 48,373 | +0.1% |
| Same Budget MCTS (48d, 2s, 1M) | 47,576 | 44,709 | -6.0% |
| Legacy Balanced (64d, 4.5s, 2M) | 114,986 | 114,038 | -0.8% |
| Experimental Fast (32d, 1.5s, 500k) | 36,646 | 33,851 | -7.6% |
| Experimental Balanced (48d, 2.25s, 800k) | 55,249 | 51,708 | -6.4% |
| **Total** | **371,780** | **360,942** | **-2.9%** |

The MCTS-enabled configs pay 6-8% of their nodes for a prior they were not
getting at all before. The 1.90x engine speedup is what makes that affordable.

### The recommendation was not deterministic

`normalize_distribution` merged the generated condition distribution through a
`HashMap`, so the probability total was summed in hash order *and* exact ties
(`positive` vs `negative` at harmony 0) were broken by hash order. Two of eight
identical runs of `forge-heat-runway-step-3` produced a different policy.

Rewritten as an insertion-ordered merge mirroring `normalizeConditionDistribution`
in `src/optimizer/search.ts`. A non-deterministic recommender cannot be
regression-tested at all, so the property is now guarded directly by
`differential_tests::mcts_search_is_deterministic`, which re-runs all 129 corpus
scenarios twice and compares the serialized results (~15 s debug).
