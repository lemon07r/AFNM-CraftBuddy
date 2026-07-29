---
title: Release Notes 6.2.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-29
source_of_truth: git history on main, package.json, src/optimizer/search.ts, src/optimizer/outcome.ts, src/optimizer/searchBackend.ts, src/modContent/searchBackendClient.ts
review_cycle_days: 90
related_files:
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/RELEASE_NOTES_6.1.0.md
  - docs/project/RELEASE_PROCESS.md
  - docs/project/WORKSHOP_DESCRIPTION.md
---

# Release Notes 6.2.0

CraftBuddy 6.2.0 fixes one scoring plateau and makes the search substantially
faster in practice, without touching the 6.x outcome architecture or any
scoring constant. The game target is unchanged (`0.7.6-7c586da`).

## Changed

### Overcraft extras are scored the way the game pays them

- The optimizer credited bands past the target tier **conjunctively** — an
  extra band only scored when *both* bars overran together
  (`min(extraCompletion, extraPerfection)`). After the 2-band sublime gate,
  every further perfection action was therefore score-neutral and
  recommendations plateaued at about two bands, even when the game keeps
  paying for more.
- Runtime verification (`docs/project/RUNTIME_EVIDENCE.md` §12) shows the
  game pays **unilaterally, per bar**: extra perfection bands scale result
  stacks (+20% of base per band) and, on the sublime quality path, grant a
  `harmonyAugment` of `perf - 2`; extra completion bands refund materials
  (20% per band, capped at 80%). None of that is gated on the other bar.
- Scoring now credits each bar's extras independently, up to the game's own
  caps (including the realm-based quality cap). The fold is identical in the
  TypeScript engine and the Rust/WASM engine, and the differential corpus
  still agrees transition for transition.
- New setting **Push Extra Bands** (`overcraftAmbition`, default **on**).
  Turning it off restores the pre-6.2 behaviour of stopping at the target
  tier as soon as it is secured.

### Search performance

Measured on the 14 replay payloads before/after each step; full data in
`docs/project/OPTIMIZER_ENGINE_FINDINGS.md`.

- **Cross-step transposition table.** One table per craft scope is carried
  across the steps of a craft, so a re-dispatched search on an unchanged
  state (manual recalc, settings toggle) collapses from ~520 nodes to ~0,
  and a higher-budget search reuses completed shallower passes from earlier
  steps. Step-advanced states structurally cannot share entries — the cache
  key carries the realized condition-queue context, which shifts every step
  — so the feature is scoped to what is sound rather than relaxed into
  mixing scoring contexts.
- **Working early exit.** The old stable-recommendation gate was dead code:
  it required four stable passes at a depth the 2-second wall-clock budget
  never reaches, so it fired zero times in production. The relaxed gate
  (three stable passes at depth `baseline+2`, challenger-only risk scan)
  returns stable mid-craft recommendations immediately: 8259 → 271 nodes on
  `low-stability-regression`, 9078 → 300 on `low-stability-step-before`,
  1041 → 355 on `user-report-fairy-recovery`, while contested states
  correctly keep searching.
- **Worker pool.** Searches now run on background workers instead of the UI
  thread. With **Search Threads** (`searchThreads`: 1/2/4/auto, default 1;
  auto = `min(cores − 2, 4)`) above 1, the root candidates partition across
  workers and the ranked results merge — per-candidate scores are absolute,
  so the merged ranking matches an unpartitioned search. Under the fast
  preset's 2-second wall-clock budget this multiplies explored nodes rather
  than shortening the search: measured 1.5–1.7x throughput at 2 threads and
  2.6–4.1x at 4 threads on time-bound payloads, converting to one extra
  completed frontier on shallow crafts, with identical top recommendations
  in all 18 swept runs. A once-per-session probe falls back to the previous
  synchronous engine unchanged if a runtime blocks blob workers, and the
  probe outcome is recorded in integration diagnostics for support
  snapshots.
- **Presets unchanged.** A full sweep of all seven preset configurations
  over the replay corpus passed 98/98 contracts; Legacy Balanced buys +0.3
  average depth for 1.9x the time of Fast, which is no retune signal. Fast
  stays the ~2 s default.

### Verification

- 872 Jest tests across 32 suites, including a byte-identical wire-format
  round-trip of all 14 replay fixtures (the worker receives exactly what the
  synchronous engine would see) and merge/partition contracts.
- 64 passing Rust tests; the differential corpus of **134 scenarios / 1,432
  transitions** regenerated and still in full TS/Rust agreement.
- Replay benchmark: **98 of 98 contracts passing**. No scoring constant was
  tuned for this release.
- Bundle cost of the worker pool: the worker bundle is 626 KB minified and
  inlined into `mod.js` (2.40 MB → 3.05 MB, +27%); workers spawn lazily on
  the first search.

## Known limitations

The 6.1.0 limitations still stand — `harmonyAugment` item effects and
craft-result material returns are unmodelled beyond the sublime scoring
path, hidden RNG is expected values rather than predicted rolls, and the
panel is English-only. New with this release:

- **Worker memory.** Each search thread carries its own engine instance (a
  few MB). `auto` leaves two cores for the game; on unknown concurrency it
  resolves conservatively to 1.
- **Node-bound searches gain nothing from threads.** Payloads where the
  early exit fires finish before the wall-clock budget matters, so pooling
  only helps the hard, time-bound states — which is where the time goes.
- **Cross-step reuse is deliberately narrow.** Because the cache key carries
  the condition-queue context, entries do not transfer across craft steps;
  the wins are unchanged-state redispatches and cross-budget carry-over.
- **The `depthReached` metric can over-read under partitioning** when one
  worker's root slice completes every planned depth; the ranking itself is
  unaffected.

## Upgrading

No user action is required. Settings and presets are preserved, and the new
toggles default to the recommended values (Push Extra Bands on, Search
Threads 1). The game target is unchanged: AFNM **0.7.6**.
