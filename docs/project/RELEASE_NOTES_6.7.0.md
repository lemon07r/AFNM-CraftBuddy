---
title: Release Notes 6.7.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.12-ad43f78
last_verified: 2026-09-13
source_of_truth: git history on main, package.json, src/optimizer/harmony.ts, crates/craftbuddy-engine/src/lib.rs, scripts/installed-game-runtime.js
review_cycle_days: 90
related_files:
  - docs/project/RELEASE_NOTES_6.6.0.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/RELEASE_PROCESS.md
---

# Release Notes 6.7.0

CraftBuddy 6.7.0 retargets the mod to AFNM **0.7.12** (`0.7.12-ad43f78`) and upstream `afnm-types` **0.7.12**. The headline feature is complete support for the 8th harmony type, **Captivating Cadence**, modeled with 100% parity across both the TypeScript simulator and the native Rust/WASM engine.

## Retarget to 0.7.12

- Upgraded `afnm-types` to `0.7.12`.
- Added selective runtime code extraction in `scripts/installed-game-runtime.js` via `@electron/asar`. In 0.7.12, the character art overhaul increased `app.asar` size to >2 GB, causing standard whole-archive extraction to overflow Node.js buffer allocations. Selective extraction of `.js` and `.json` files resolves this in ~0.2s.
- Updated `runtime:oracle` to inspect 0.7.12 runtime structures.

## Changed

### Captivating Cadence (New 8th Harmony Type)

AFNM 0.7.11/0.7.12 introduced **Captivating Cadence** (`captivatingCadence`):
- **Mechanics:** Rewards varying techniques and punishes repetition. Actions are categorized into four types (`fusion`, `refine`, `stabilize`, `support`).
- **Chain Building:** Switching to a different technique type extends the chain (`chain += 1`, `lastOutcome = 'build'`). Initial turn sets chain to 1 with no harmony delta. For `chain > 1`, awards `+3 * chain` harmony. Each chain point grants +2% control and +2% intensity (+0.02 multiplier bonus).
- **Chain Breaking:** Repeating the previous action breaks the chain (`chain = 0`, `lastOutcome = 'break'`), penalizing by -50 harmony and -1 max stability (+1 stability penalty).
- **Recommended Techniques:** Recommends all technique types other than the most recent action.
- **Parameters:** Complexity multiplier: 1.5. Starting harmony: 0.

### Engine & State Parity

- Full implementation in `src/optimizer/harmony.ts`, `src/optimizer/harmonyRegistry.ts`, and `crates/craftbuddy-engine/src/lib.rs`.
- `cloneHarmonyData` in `src/optimizer/state.ts` and `src/modContent/harmonyState.ts` now preserves `captivatingCadence` state across simulation copies and UI hydration polls.
- Differential corpus updated to version 4 with dedicated Captivating Cadence transition test cases.

### Buff Type Aggregations & ModAPI Alignment

- Supported new 0.7.12 buff type aggregate scaling variables (`variables[buffType]` for total stacks and `variables['unique_' + buffType]` for distinct buff count).
- Added `cadence` and `Cadence` chain aliases to native scaling variables.
- Preserved `buffType` during buff extraction in `src/modContent/index.ts`.

## Validation

| Check | Result |
| --- | --- |
| `bun run typecheck` | clean |
| `bun run test` | 934 passed, 35 suites |
| `bun run wasm:test` | 74 passed (3 ignored profiling harnesses) |
| `bun run wasm:build` | clean inline WASM generation |
| `bun run optimizer:differential-corpus` | regenerated: 142 scenarios / 1,499 transitions, TS↔Rust parity holds |
| `bun run build` | OK, `builds/afnm-craftbuddy.zip` |
| `bun run docs:check` | verified with docs inventory |
