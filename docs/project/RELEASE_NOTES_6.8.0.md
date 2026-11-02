---
title: Release Notes 6.8.0
status: historical
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.17-d8ae6ce
last_verified: 2026-10-22
source_of_truth: package.json, src/optimizer/*, src/modContent/*, crates/craftbuddy-engine/*, scripts/installed-game-runtime.js, scripts/optimizer/benchmark-engines.ts
review_cycle_days: 90
related_files:
  - CHANGELOG.md
  - docs/project/RELEASE_NOTES_6.7.0.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/ENGINE_PERFORMANCE.md
  - docs/project/WORKSHOP_DESCRIPTION.md
  - docs/project/RELEASE_PROCESS.md
---

# Release Notes 6.8.0

CraftBuddy 6.8.0 targets **AFNM 0.7.17-d8ae6ce** with **afnm-types 0.7.17**.
This is a mechanics retarget, not a scoring redesign: scoring constants,
outcome thresholds, per-bar Decree folds/gates and native-auto-use dispatch
safety remain intact. Runtime evidence is recorded in `RUNTIME_EVIDENCE.md` §17.

## Changed

### Payment, mastery and buff phases

- Independent zero-based Qi/stability reduction and penalty channels replace
  the old percentage-cost model; compatibility inputs normalize at the boundary.
- Droplet state, caps, technique requirements and payment survive extraction,
  cloning, replay and the native bridge.
- Toxicity, droplets and buff costs precede success-chance capture and effect
  masteries; Qi/stability payment is then recomputed before success-only effects.
  Failed actions still pay, apply masteries and resolve harmony.
- Only pre-action buff names tick. Newly created names survive the creation
  turn; refreshed existing names still tick. This changes some legitimate replay
  outcomes without changing historical replay inputs.
- Scaling additions, buff `additionalVariables`, `setState.keys`, and general
  triggered effects are preserved in both engines. Converging Jade receives its
  normal perfection-triggered completion; Invasion stacks extend duration rather
  than multiplying their unscaled stat penalty.

### Returning Cycle

- Ninth harmony, complexity **1.3**, starting harmony **0**, no forced technique
  recommendations. Charge size is fixed from raw starting maxpool (10%, minimum 1).
- Reported Qi payment accrues even on failure. Each full charge drains **3 harmony**
  and **30% of its charge size in Qi** per action. Stabilize drains first, then
  releases all charges for **+10 harmony / +5 Returned Precision stacks** each;
  the stored partial-charge remainder survives.
- Returned Precision is an ordinary +1 crit-point-per-stack buff, decaying on
  later actions. Release stacks neither improve nor immediately decay on the
  release action. Hydration, cloning, replay and Rust carry the same Cycle state.
- No invented flat score, new search branching or forced Stabilize heuristic.

### Tooling and benchmark evidence

- Selective ASAR extraction normalizes Windows and Unix separators; it still
  avoids whole-archive extraction for large installs.
- Rebuilt inline WASM and regenerated schema-v4 corpus: **177 scenarios / 1,554
  cases**, including **1,352 legal transitions** and **202 rejected actions**.
  All 142 old scenarios remain with unchanged legality. The seeded eight-type
  random pool stays fixed; two new harmony matrices plus 12 retarget and 16 Cycle
  cases plus five review regressions provide the added coverage. Default droplet/cost fields and tiny legacy
  percentage conversion roundoff are the only existing-input differences.
- The resonance safety prohibition remains; its non-recommended runner-up
  ordering clause was removed with runtime evidence for new-name buff survival.
  Restoring old ticking reproduced HEAD scores. No tolerance was widened.
- Heat-one retains all assertions at an approved **6,000-node** fixture budget
  (120 s wall-clock guard). The 1 s legacy preset previously stopped at contested
  depth 5. Measured phase/cost throughput is ~**0.58 ms/node**, versus pre-retarget
  HEAD ~**0.41**; see `ENGINE_PERFORMANCE.md` for the measured optimization trail.
- Current docs/skills and Workshop BBCode now describe the 0.7.17 target;
  historical releases and measurements retain their original scope.

## Original retarget validation (before review fixes)

- WASM release build and inline generation succeeded.
- Corpus Jest: **4 passed**; recorded Rust replay: **1,347 transitions compared**,
  zero disagreements, without a scratch-input override.
- All-preset benchmark: **105 contracts passed, 0 failed, 7 uncontracted**.
- Non-corpus Cargo: **86 passed, 0 failed, 3 intentionally ignored profiling
  harnesses**; determinism passes against the regenerated corpus.
- `bun run release:validate`: **passed** — strict typecheck, **966 Jest tests /
  38 suites** (198.23 s), production build/package, docs links/freshness/authority.
- Docs inventory: **63 Markdown files**; all 16 initially stale documents were
  reviewed against their named sources, not date-bumped blindly. Workshop body:
  **7,696 / 8,000 characters**, with all four cross-links preserved.
- Package inspection: **6.8.0**, five zip entries, CRC check passed. Generated
  WASM/build artifacts remain ignored. Rust's unused-assignment warning and
  webpack asset/entrypoint-size advisories remain non-fatal.
- Formatting check on the two 2c TypeScript files and `git diff --check` pass.

## Review follow-up

- Worker serialization now has an exhaustive state schema and a JSON round-trip
  regression checking every field except the derived cache key. Droplets,
  simultaneous cost channels/full reduction, Returning Cycle and native variables
  survive the worker boundary.
- Live additive item effectiveness (neutral **0**) now reaches extraction, state,
  cache identity, replay, worker and native bridge, and both engines' scaling
  scopes. The real Calming Mind payload creates **4 / 6 / 2** stacks at
  **0 / +50 / -50** effectiveness; buff contributions add to the live base once.
- Modern fractional cost channels no longer pass through legacy compatibility
  flooring unless a legacy stat contributes on that side. The 15.5% base plus
  10% reduction regression pays **152**, not 151, from a base cost of 200.
- Rust advances running bars through recursive triggers and per-turn effects.
  Combined multi-application Jade+Bifang matches TS: **123 completion / 110
  perfection / 24 blaze**.
- Focused review Jest: **53 tests / 3 suites passed**; corpus Jest: **4 passed**.
  Fresh and recorded Rust replay each compare **1,352 legal transitions** with
  no disagreement; non-corpus Cargo: **89 passed, 0 failed, 3 ignored**.
- Fresh comparison found **no existing recorded outcome changes** across the
  original 172 scenarios. Regeneration adds the five review scenarios and
  item-effectiveness scalar checks; it does not rewrite historical outcomes.
- Post-review all-preset benchmark: **105 contracts passed, 0 failed,
  7 uncontracted**, with the approved heat-one budget and assertions unchanged.
- The earlier Rust unused-assignment warning was removed while fixing recursive
  dispatch; webpack size advisories are unrelated to these mechanics fixes.

## Known limitations

- Chance-conditioned payment effects use transient independent branches for
  current-action EV, not a redesigned probability-aware future-buff model.
- Decree still folds expected-value bar events and does not retune later effect
  magnitudes after a mid-technique focus flip; both engines share these limits.
- Search depth is wall-clock dependent. The local throughput figures are not
  cross-machine guarantees, and the Rust prior does not own final ranking.
- Hidden RNG and finished-item harmony effects/material returns are not simulated.
- Validation here is automated simulator/build evidence, not a live game UI smoke test.

## Upgrading

Replace the installed mod zip or update through Workshop after publication.
Version strings in `package.json` and the UI harness are both 6.8.0. No settings
reset is required. Publishing, committing, pushing and tagging remain separate
human-approved release steps; this retarget does not perform them.
