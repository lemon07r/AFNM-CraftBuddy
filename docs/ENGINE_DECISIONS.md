# Engine decisions and measurements

Why the current search shape exists, what was measured, and what still needs evidence. These are **dated/historical measurements**, not fresh AFNM 0.7.19 speed guarantees. Current architecture is in [Optimizer design](OPTIMIZER_DESIGN.md); runtime gaps are in [Mechanics parity](MECHANICS_PARITY.md).

## Experimental-prior retirement (7.0)

The user-approved fair evaluation found no recommendation benefit from the opt-in Rust/WASM MCTS prior:

- **Fixed work:** all **16/16** recommendations were identical to TypeScript at **6,000 nodes**, with the prior about **48% slower**.
- **Equal time:** agreement with a deep oracle was **18/32** for the prior versus **24/32** for TypeScript alone.

Retire the experimental engine, bridge, toolchain and selector rather than maintain two mechanics implementations for a prior that displaced useful search. The established TypeScript search, scoring constants and Legacy preset budgets are unchanged. Old engine settings are discarded on load; old replay engine/MCTS fields are tolerated and ignored. The existing **211 scenarios / 1,588 transitions** remain as a TypeScript golden with unchanged expected outputs, not a cross-engine maintenance duty.

The benchmark retains all **15 fixture contracts** unchanged. Removing the three experimental configurations reduces the matrix from **105 to 60 contract evaluations** (7 to 4 configs; 16 replay fixtures give 112 to 64 total runs). The retained same-budget TypeScript config is intentionally still present.

The retirement's fixed-work digest compared **32 TypeScript entries** against the pre-edit baseline at `3c8872c`: **zero differences**, including recommendation/ranking/scores, safety flags, rotation, depth and **95,688 total expanded nodes**. All 1,588 stored transition outputs were also preserved exactly while converting their inputs to TypeScript wire data. These checks establish removal neutrality on the fixtures, not a new runtime-fidelity claim.

## Historical authority and packaging

Before retirement, TypeScript owned final ranking and score caches; Rust supplied only a near-tie root-policy prior. Absolute scores were not comparable across engines. The old differential corpus established covered transition agreement, not universal runtime fidelity. The following Rust findings are historical, not build instructions or an obligation to keep a second engine in sync.

**Renderer feasibility, 2026-04-23:** raw `WebAssembly.instantiate(bytes)` worked; wasm-bindgen worked with its imports/glue. Fetching either `mod://` or localhost failed, as did a localhost WebSocket and Node process/file APIs. Hence `wasm-pack --target web`, embedded bytes and glue initialization; a separately fetched WASM/HTTP sidecar was not viable in that measured renderer. This experiment established loading, not quality or performance. Remeasure if the renderer changes.

## Correctness findings that mattered more than tuning

### Explicit null disabled the native prior (6.0.0 investigation)

One explicit `null` on a non-optional Rust field rejected the **entire** `MctsInput`. Of 226 game techniques measured on 0.7.5, 188 carried `mastery: null`, so real crafts silently lost their prior. The retired bridge's `stripNullish` and Rust's `null_default` fixed the boundary, with a bridge test asserting no explicit null survived serialization.

Across 98 benchmark runs, native-policy participation went **0 → 42**, contracts **96 pass/2 fail → 97/1**. Nodes fell 2.9% overall, concentrated in MCTS configs (6–8%): a now-working prior consumed real shared budget. The remaining resonance defect was separate.

### Hash-order merging changed recommendations (6.0.0 investigation)

`normalize_distribution` merged via a `HashMap`: sum order and exact probability ties varied. Two of eight identical heat-runway runs changed policy. Insertion-ordered merging now mirrors TS, guarded by `mcts_search_is_deterministic`. This proves the tested fixed-work case, not arbitrary clock-budget determinism.

### Success weighting belongs outside the clamp (closed in 6.0.0)

`user-report-resonance-regression` was not a resonance formula bug: the fixture had no harmony data and runtime resonance already used −9 harmony/−3 stability with the pending-switch exemption. Both engines instead used **`min(p * gain, headroom)`** rather than **`p * min(gain, headroom)`**. A 65%-success Explosive Fusion overshooting the 9,170 remaining completion was credited with all 9,170, hiding its failure risk. Clamp the successful gain **before** multiplying by success probability; “clamping first hides failure risk” reverses the actual fix.

The original correction shifted 11 of 585 corpus transitions by one point, with both engines still agreeing. The final 6.0.0 benchmark passed 98/98. Runner-up order was depth-sensitive (refine led at depth 4, inverted at 5, led again from 6); scores were not depth-normalized (~18k at depth 4 vs ~44k at 5). This motivated materiality-aware ranked-score reporting and fixed-node regression cases, not constant tuning.

**6.8.0 update:** the old resonance runner-up `mustRankBefore` clause was removed after runtime-correct pre-action-name ticking explained a 6.37% inversion; restoring old ticking reproduced old scores. `mustNotRecommend: ['explosive_fusion']` remains. The heat-one fixture retains every assertion at an approved **6,000-node** budget with a 120-second guard; its 1-second Instant run had reached depth 5/3,242 nodes (support) while other presets reached depth 6 (fusion). These overrides are fixture-only, not user defaults.

## Historical Rust profile: 6.0.0 / 6.1.0

112 release-build runs over 14 production-shaped replay inputs, fixed node budget:

| Metric               | Before          | After          |
| -------------------- | --------------- | -------------- |
| Total clock          | 41,417.675 ms   | 21,790.132 ms  |
| Per run              | 369.801 ms      | 194.555 ms     |
| Per node             | 1,653,532 ns    | 869,935 ns     |
| Nodes / iterations   | 25,048 / 28,000 | unchanged      |
| Ranked policy digest | baseline        | byte-identical |

That was **1.90× throughput / −47.4% time** at identical search shape. The changes removed redundant work:

1. Resolve active buffs once per candidate space, not once per candidate: 12,308.9 → 893.6 calls/run.
2. Fast-path effective maxpool unless a held buff declares that stat. The old full recomputation cost 7,400 ns/call (~46% of a transition), ran twice per transition and caused an interim state clone.
3. Use `FxHasher` for short ASCII hot-map keys rather than paying SipHash's collision-resistance cost.

| Counter/run                       | Before             | After     |
| --------------------------------- | ------------------ | --------- |
| Iterations / nodes created        | 250 / 223.6        | unchanged |
| `apply_skill` / `can_apply_skill` | 6,203.8 / 12,308.9 | unchanged |
| Score / preview calls             | 6,718.6 / 6,468.6  | unchanged |
| Rollout steps                     | 227.9              | unchanged |
| State clones                      | 13,374.0           | 7,170.2   |

Component microbench, ns/call, means over 20,000 calls:

| Component            | Before   | After    |
| -------------------- | -------- | -------- |
| State clone          | 1,358.9  | 1,335.7  |
| Resolve active buffs | 3,865.7  | 3,669.8  |
| Can apply            | 1,241.8  | 1,099.4  |
| Apply                | 28,919.3 | 18,264.0 |
| Score                | 241.6    | 246.3    |
| Effective maxpool    | 7,400.0  | 15.9     |
| Resolve action       | 10,418.6 | 8,914.5  |
| Calculate gains      | 863.9    | 910.3    |

### Measured alternatives not taken

| Idea | Evidence / decision at that workload |
| --- | --- |
| Fixed-layout state with mutate/undo | Clone was **4.70%** of the original transition, a <5% theoretical ceiling against substantial undo risk for buffs/harmony/items/cooldowns. After the profile fixes it was 7.31% of a smaller transition, with less absolute nanosecond headroom. |
| Packed numeric transposition key | String keys measured **1.0–1.4%** of search time. Collision risk did not justify the small ceiling. |
| More MCTS iterations | Resonance replay: 250 ≈ .75 s, 500 ≈ 1.45 s, 1,000 ≈ 2.64 s, 2,000 ≈ 4.72 s. Extra native effort displaced useful TS frontier inside a shared 1–4 s budget. |
| Wider beams | Replay sweeps reached shallower frontiers and sometimes worse forge recommendations/heat overshoot. Narrow mid-budget beams won at that workload. |

These are reasons to **remeasure if inputs change**, not permanent bans or settings defaults. Defaults/presets live in `src/settings/index.ts`.

### Per-bar Decree cost (6.1.0)

The ordered event fold is bounded by a turn's bar-moving effects. `needsBarContributions()` / `needs_bar_contributions()` collect only for sublime Decree; other harmonies avoid the contribution list. Historical 6.1.0 benchmark: 98/98 contracts, unchanged trends, timing within noise of the 6.0.0 profile. A concurrent Jest-heavy run flipped the depth-sensitive resonance runner-up clause: benchmark on an idle machine before interpreting wall-clock frontiers.

## Cache reuse, 2026-07-28

One cross-step transposition table per craft scope (targets/caps/stats/roster/settings, excluding budgets), bounded at 400k entries. Exact-depth hits copy through; truncated-frontier fallback and principal-variation promotion can consult it; only completed passes publish back.

Tutorial-fixture measurements:

- Same-state redispatch collapsed **523 → ~0** explored nodes. After a max-40-node population, a warm max-80-node run recorded 22 cross-step hits. Completed warm/table-free searches had identical recommendations/scores.
- Step-advanced reuse was structurally rare: eight same-state entries had zero queue-exact matches after stepping. The realized three-condition window and stochastic tail draws shift; relaxing the key would mix different future gains.
- Replay benchmark at that gate remained 98/98. Warm/cold comparisons need completed equal-work frontiers, not an assumption that clock-bound depths agree.

## Working early exit, 2026-07-28

Across 14 replays, production-like 2-second searches reached depth 3–7 (~120–6k nodes/s). The old gate required four stable passes at depth ≥35% of plan (22+ on a depth-64 plan), so it never fired.

The revised gate used baseline+2 minimum depth, three stable passes, and scanned risky/terminal **challengers**, not the top line itself (which had blocked its own exit despite a 198k margin). Margin threshold `max(10 × tieWindow, 2 × avgGainPerTurn)`, the next-three challenger scan and disable-when-native-policy-participates stayed unchanged.

| Replay                       | Completed depth | Nodes before → after |
| ---------------------------- | --------------- | -------------------- |
| `low-stability-regression`   | 5               | 8,259 → 271          |
| `low-stability-step-before`  | 5               | 9,078 → 300          |
| `user-report-fairy-recovery` | 6               | 1,041 → 355          |

Contested margins (46–732 against thresholds 1.3k–10.6k) correctly did not exit. Fixed-node tests pin stable fairy recovery and contested pattern behavior; replay contracts stayed 98/98.

### Historical quality/spend sweep, 2026-07-28

These configuration labels describe the **measured sweep**, not a maintained defaults table. All seven configurations passed 14/14 contracts.

| Config | Avg ms | Avg depth | Early exits | Top-key agreement with Legacy Balanced |
| --- | --- | --- | --- | --- |
| Legacy Instant | 852 | 4.6 | 3 | 10/14 |
| Legacy Fast | 1,545 | 5.0 | 6 | 11/14 |
| Same-budget Legacy 2s | 1,540 | 5.1 | 6 | 12/14 |
| Same-budget MCTS 2s | 2,002 | 5.2 | 0 | 10/14 |
| Legacy Balanced | 2,939 | 5.3 | 6 | reference |
| Experimental Fast | 1,502 | 5.0 | 0 | 10/14 |
| Experimental Balanced | 2,252 | 5.3 | 0 | 11/14 |

Balanced bought +0.3 depth for 1.9× Fast time, not a retuning signal. Disagreements clustered on four contested payloads (`pattern-step-1`, `resonance-regression`, `live-workshop-step-2`, `premature-finish-runway`); invariant/materiality contracts were more useful than asserting clock-bound runner-up order.

## Worker pool, 2026-07-29

Worker source is bundled inline, then loaded through a blob URL because the shipping `mod://` path cannot resolve normal chunks. The integration client smoke-probes once/session; worker failure falls back to synchronous search. Epoch cancellation and cooperative abort checks drop stale work. Each worker owns its engine and cache.

Root keys partition by stride. An `autoResolved` partial short-circuits the merge with no actions. Otherwise only `live` partials contribute candidates; their absolute scores merge with survival precedence and key tie-breaks, deduping keys and recomputing relative quality ratings. The merged status is `live` when candidates remain, or `blocked` otherwise; goal achievement stays independent metadata. For pooled results, work metrics sum and depth/time take maxima. An empty slice can complete all depths and **overstate merged depthReached** without changing ranking.

Six replay payloads, real Bun workers, captured production budgets (`scripts/bench-worker-pool.ts`):

| Payload | Sync ms / nodes / depth | 2-worker nodes/ms × sync | 4-worker × sync | Depth gain |
| --- | --- | --- | --- | --- |
| Low stability | 225 / 271 / 5 | .89 | .80 | none |
| Low stability before | 234 / 300 / 5 | .96 | .85 | none |
| Skyfall bow heat | 4,501 / 8,655 / 5 | 1.71 | 2.71 | none |
| Alchemical sequence | 1,002 / 1,314 / 4 | 1.72 | 2.60 | +1 at ≥2 |
| Live workshop step 1 | 1,002 / 1,399 / 4 | 1.52 | 2.56 | +1 at ≥2 |
| Premature finish runway | 2,006 / 627 / 4 | 2.43 | 4.11 | +1 at 4 |

All 18 runs kept the sync top skill. Single-worker throughput was .83–1.19× sync; node-bound early exits gained nothing. Time-bound cases gained work/depth, not a shorter fixed wall-time cap. Alchemical/live-workshop scores rose 36k → 119k with a completed deeper line. Historical bundle cost: 626 KB worker, mod 2.40 → 3.05 MB (+644 KB/27%); zip compression reduced duplication. Workers spawn lazily and even one worker keeps search off the UI thread after a passing probe.

## TypeScript retarget cost, 6.8.0 (0.7.17)

Fixed-node probing: pre-retarget **.405737 ms/node**, initial phase/cost port **2.115**, after repeated payment/scaling work removal **.646 → .569423**. After Cycle: **.591207 / .579968** (+3.8%/+1.9% relative to the post-phase baseline). The remaining ~.58 vs ~.41 belonged to the phase/cost model, not scoring changes. These local numbers are not universal hardware guarantees or fresh 0.7.19 measurements.

## Reproduce / protect neutrality

```bash
bun run optimizer:digest -- --out tmp/baseline.json
# After a neutral refactor:
bun run optimizer:digest -- --compare tmp/baseline.json
bun run optimizer:bench:gate
```

The gate runs every benchmark contract with fixed node budgets (each preset's time budget at the 7.0 reference rate of ~1.33 nodes/ms: 1,330, 2,660 and 6,000 nodes), so it is deterministic and part of `release:validate` and CI. In 7.0 two consecutive gate runs matched in all 64 fixture×preset results and passed 60/60 contracts.

The retired Rust profiling commands are no longer supported. Benchmark JSON/Markdown output options are available in `scripts/optimizer/benchmark-engines.ts`; run clock measurements without competing test loads. A failing contract is a reproduction lead, not permission to tune a constant.

## Evidence still worth collecting

- More full player replays: high-realm/50+ technique crafts, sublime after basic success, Formless/Echo/Decree (especially mid-technique focus changes), alchemical charges, inscription partial blocks, low-stability proc recovery, near-auto-finish states, and real Cycle/Cadence strategy. Fourteen curated fixtures were a regression set, not broad proof.
- `window.craftBuddyDebug.exportOptimizerReplaySnapshot()` produces the input to curate under `src/__tests__/__fixtures__/replay-snapshots/`; attach a flexible runtime-grounded benchmark contract and the player's rationale.
- Native finalized-cost helper adoption is dependency-gated; other unsupported effects and survivability timing are in the mechanics gaps, not ranking-tuning work.
- Diagnostics already include frontier/nodes/cache/time/early-exit, outcome projection and setup hints. A debug-only per-layer score explanation remains a useful candidate, not a normal-UI requirement.
- UI host/localization adoption, auto-use condition/loadout-switch coverage and structured fallback/missing-field counters remain local integration opportunities. Post-craft harmony effects/material payout and combat are deliberately outside transition scope.
