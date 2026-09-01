---
title: Release Notes 6.6.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.10-9bf9078
last_verified: 2026-09-01
source_of_truth: git history on main, package.json, src/modContent/index.ts, src/optimizer/gameTypes.ts, crates/craftbuddy-engine/src/effects.rs, docs/project/RUNTIME_EVIDENCE.md
review_cycle_days: 90
related_files:
  - docs/project/RELEASE_NOTES_6.5.0.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/RELEASE_PROCESS.md
---

# Release Notes 6.6.0

CraftBuddy 6.6.0 retargets the mod to AFNM **0.7.10**. The headline for players
is that the new Perfection Boost stat is priced exactly like the game: pushing
completion past a band now visibly raises the value of refines, and CraftBuddy
plans those rotations instead of the old control-based ones.

## Retarget to 0.7.10

- `afnm-types` moved to `0.7.10`. The four new boost stats are upstream and
  typed (`stat.d.ts` `craftingStatistics`), and `completionBonusBuffName`
  remains available under `utils` — a note in earlier session summaries that it
  had disappeared from the runtime was wrong; the ModAPI export table in
  `Game.js` still maps it.
- All runtime evidence was re-verified by diffing the installed 0.7.9 build
  against the installed 0.7.10 build. The findings are recorded verbatim in
  `docs/project/RUNTIME_EVIDENCE.md` section 16.

## Changed

### Completion Bonus is now Perfection Boost, and it is modelled end to end

0.7.10 replaced the high-completion bonus's per-stack `.1` control with
`perfectionBoost: { value: 10, scaling: 'stacks' }` on the synthetic
`"Completion Bonus"` buff, and added four percent crafting stats:
`completionBoost`, `perfectionBoost`, `stabilityBoost` and `qiBoost`. Each boost
scales its bar's **gains** by `1 + boost / 100`, floor applied after the
expected-crit multiplier, on positive amounts only. Costs, harmony and
max-stability evolution never see the boosts.

- `ScalingVariables` on both engines now carries all four boosts, seeded from
  the entity's stats, and the Completion Bonus contribution is folded from the
  optimizer's own stack tracking (`perfectionBoost = completionBonus × 10`)
  while the runtime-crafted buff is skipped during the generic buff-stat fold —
  so the boost is never double-counted and never lags a turn behind.
- Every gain application site — fusion/refine completion and perfection,
  Disciplined Touch, stability restoration, pool restoration (`qiRestore`, the
  legacy `normalizeEffects` path, technique `pool` effects, and buff per-turn
  effects) — goes through a shared `applyGainBoost` / `apply_gain_boost`
  helper in TypeScript and Rust alike, mirroring the runtime's four appliers.
- Extraction accepts both the new `perfectionBoost`-of-10 signature and the
  legacy control signature when locating the buff, so a mixed-version window
  cannot silently drop the stacks.

The measurable behaviour change: overcraft completion now pays out in extra
perfection, so rotations that race completion bands early and then refine are
valued correspondingly higher by both engines.

### One planning test moved out one turn of horizon

`search.test.ts`'s "completion-rush then False Fusion payoff" scenario used a
5-deep horizon on which the gated-buff rotation and a plain rush rotation now
score identically — rushing is stronger because completion stacks feed
Perfection Boost, and the buff payoff window still fits at depth 6. The test
now proves the gated payoff is found at depth 6, with a comment tying the
shift to the 0.7.10 mechanic. No search constants changed.

## Validation

| Check | Result |
| --- | --- |
| `bun run typecheck` | clean |
| `bun run test` | 929 passed, 35 suites |
| `bun run wasm:test` | 70 passed (3 ignored profiling harnesses) |
| `bun run build` | OK, `builds/afnm-craftbuddy.zip` |
| `bun run docs:check` | clean |
| `bun run optimizer:differential-corpus` | regenerated: 137 scenarios / 1,471 transitions, TS↔Rust parity holds |

The regenerated corpus (a *changed* file this time, unlike 6.5.0) is the
load-bearing evidence that both engines agree on the new Perfection Boost
transitions transition-for-transition.
