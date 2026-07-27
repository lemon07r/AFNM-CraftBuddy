---
title: Release Notes 6.1.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-27
source_of_truth: git history on main, package.json, src/optimizer/harmony.ts, src/optimizer/skills.ts, src/modContent/harmonyState.ts, crates/craftbuddy-engine/*
review_cycle_days: 90
related_files:
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/ENGINE_PERFORMANCE.md
  - docs/project/RELEASE_NOTES_6.0.0.md
  - docs/project/RELEASE_PROCESS.md
  - docs/project/WORKSHOP_DESCRIPTION.md
---

# Release Notes 6.1.0

CraftBuddy retargeted to AFNM **0.7.6** (`0.7.6-7c586da`). This is a minor version, not a rework: the 6.0.0 outcome and scoring architecture is unchanged. 0.7.6 contains exactly **one** crafting mechanics change that CraftBuddy has to model — Eccentric Decree now scores per bar application — plus a data-driven Fallen Soulflame re-balance that needed no code change at all.

The full runtime diff of `0.7.5-d764178` against `0.7.6-7c586da`, with extracted source and offsets, is in `docs/project/RUNTIME_EVIDENCE.md`.

## Changed

### Game version

- Targets AFNM **0.7.6**; `afnm-types` updated to **0.7.6**.
- `bun run runtime:oracle` against the installed game reports `gameVersion: 0.7.6-7c586da`, with every ModAPI helper CraftBuddy depends on still present. `hasItemTypeToHarmonyType` remains `false`, as it has been since 0.7.5.
- 0.7.6 exposes three new ModAPI surfaces — a `gameData.buffs` registry, `getCoreFormationAltarStats`, and buff-interceptor stat filters. They are recorded in `docs/project/INTEGRATION_MODAPI.md` as available but **not adopted**; nothing in this release depends on them.

### Eccentric Decree scores per bar application

- In 0.7.5 the whole Eccentric Decree state machine ran once, at the end of the turn, after the action had resolved. In 0.7.6 the scoring moved into a per-bar-change hook that the game fires from **inside** each completion and perfection application.
- Consequence for play: one technique can now award harmony **several times in a single turn**, and the focused bar can **flip part-way through the turn** — so the second half of a technique's effects can be scored against a different focused bar than the first half.
- Per application: `+5` harmony when the focused bar advanced, `-5` harmony and `-5` Qi Pool when the other bar advanced, then focus flips if the focused bar's guaranteed bonus improved on that application. A negative application still fires the hook but awards nothing; it only re-anchors the last-seen bar values, so a drain is absorbed rather than paid back later.
- Modelled identically in both engines: a fold over ordered bar-change events in `src/optimizer/harmony.ts`, mirrored in `crates/craftbuddy-engine/src/lib.rs`. The event list is only built when the craft is sublime **and** its harmony is `eccentricDecree`, so the other six harmonies pay nothing for this.
- Seeding follows the runtime's own laziness and anchors on the **current** bars, not zero. Attaching to a craft already in progress therefore cannot retro-charge harmony for progress made before CraftBuddy saw the craft.
- Where no event data exists — replay fixtures recorded before this release — the model degrades to the pre-0.7.6 single end-of-turn delta rather than mis-scoring.

### Fallen Soulflame nerf, reflected automatically

- 0.7.6 nerfed the Soulflame souls: `Soul of Fusion` completion and `Soul of Refinement` perfection both drop from `0.5x` to `0.2x` (of intensity and control respectively) per stack, `Soul of Qi` pool restore from `3` to `2` per stack, and `Soul of Stability` stability from `2` to `1` per stack. The fragment threshold (9 stacks, 5 stability) is unchanged.
- **No CraftBuddy code changed for this.** Both engines model Soulflame through the generic, definition-driven buff path with no hardcoded soul constants, so the new numbers arrive from the live buff definitions. The 0.7.6 values are pinned in `src/__tests__/runtimeParity.test.ts` so a future re-balance is caught rather than assumed.

### Technique labels match the game

- The technique the game now calls **"Strive for Completion"** is displayed under that name. Its internal identifier is still `False Fusion` / `false_fusion`, and that has not changed — 0.7.6 only changed the user-facing label, and CraftBuddy resolves labels through the game's own display-name path.
- Internal keys, replay snapshots and existing bug reports referring to False Fusion remain valid.

### Fixed: harmony state was reset on every poll

- `cloneHarmonyData` in `src/modContent/harmonyState.ts` silently dropped `enhancingEcho` and `eccentricDecree` state during hydration. Every polling cycle handed the simulator a fresh copy of those two state machines — losing Enhancing Echo attunement, and Eccentric Decree's focused bar and last-seen bar values.
- **This shipped broken in 6.0.0**, for the whole life of that release, and the two subsystems affected were the ones the 0.7.5 rework introduced. `docs/project/MECHANICS_PARITY.md` also listed the fix as already delivered in 6.0.0, which was wrong; it had not been. Both are now corrected — the state is cloned and preserved, and the parity document says so honestly.
- This matters more in 0.7.6 than it did in 0.7.5: the new per-bar-change hook depends on the focused bar and last-seen bar values surviving between polls.

### Verification

- 828 Jest tests across 31 suites, 64 passing Rust tests (plus 3 `#[ignore]`d profiling tests), and a differential corpus of **134 scenarios / 1,432 transitions** on which the two engines still agree transition for transition.
- Benchmarks after the change: **98 of 98 contracts passing** and recommendation trends unchanged, within noise of the 6.0.0 baseline recorded in `docs/project/ENGINE_PERFORMANCE.md`. **No scoring constant was tuned** for this release.

## Known limitations

The 6.0.0 limitations all still stand — `harmonyAugment` item effects and craft-result material returns are unmodelled, hidden RNG is expected values rather than predicted rolls, and the panel is English-only. New or newly relevant with this release:

- **Mid-technique stat-modifier flip is not applied within the turn.** In the runtime, a focus flip between two effects of the *same* technique retunes intensity/control for that technique's **later** effects. CraftBuddy evaluates effect scaling once per action, so a flip changes scoring and every subsequent turn, but not the remaining effect magnitudes inside the same turn.
- **Bar events carry expected values, not the runtime's discrete applications.** CraftBuddy applies aggregated expected values, then reconstructs per-application running values by distributing each bar's aggregate proportionally across that bar's raw per-effect contributions. Ordering and the exact total are preserved; the runtime's exact per-application integers are not, when crit/success weighting is fractional.
- **Disciplined Touch and the legacy scalar path expose no per-effect breakdown**, so they synthesize one application per moved bar, completion first. Identical in both engines, and equivalent to the old single-delta model except when a band is cleared between the two applications.
- **One replay contract is a genuine near-tie.** The `user-report-resonance-regression` ordering assertion inverts at the deepest search configuration. It is a scoring near-tie whose resolution is depth-sensitive, and wall-clock depth is machine-dependent; it is not treated as licence to tune a constant.
- The new 0.7.6 auto-use `(This Effect)` self-reference slot condition is unmodelled and falls to the existing conservative default in `src/modContent/nativeAutoUse.ts`, which assumes a configured slot will fire. Over-estimating native consumption is the safe direction: CraftBuddy withholds a duplicate item action rather than causing one.

Out of scope and unmodelled by design: the research queue, market favourites, Unstable Rift, the herb garden, equipment-side harmony balance (`upgradeHarmonies` / `statTable`, which decides what the finished item does), and every combat-side change in 0.7.6.

## Upgrading

No user action is required. Settings, presets and the engine selector are preserved, and replay snapshots exported by 6.0.0 still load — those recorded on Eccentric Decree crafts simply score through the single end-of-turn fallback, since they carry no bar-change event data. Running 6.1.0 against game version 0.7.5 is not supported; 0.7.6 is the target.
