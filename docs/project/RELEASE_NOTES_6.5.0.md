---
title: Release Notes 6.5.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.9-b8ef246
last_verified: 2026-08-23
source_of_truth: git history on main, package.json, src/modContent/index.ts, src/optimizer/gameTypes.ts, crates/craftbuddy-engine/src/effects.rs, docs/project/RUNTIME_EVIDENCE.md
review_cycle_days: 90
related_files:
  - docs/project/RELEASE_NOTES_6.4.0.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/RELEASE_PROCESS.md
---

# Release Notes 6.5.0

CraftBuddy 6.5.0 retargets the mod to AFNM **0.7.9**. The headline for players
is that the reworked Purifying Flame is now understood: CraftBuddy sees the
raised quality cap it grants instead of planning against the old one.

## Retarget to 0.7.9

- `afnm-types` moved to `0.7.9`. The strict typecheck passes untouched: none of
  the upstream breaking changes (required `CharacterDefinition.gender`, removed
  `CharaState.followSlotMember`, removed `TournamentBuild.untunable`, required
  `FormationPuzzleActiveState.displayName`) are referenced by this mod, and every
  crafting-side type change in 0.7.9 is additive.
- All runtime evidence was re-verified by diffing the installed 0.7.8 build
  against the installed 0.7.9 build. The findings are recorded verbatim in
  `docs/project/RUNTIME_EVIDENCE.md` section 15.

## Fixed

### The reworked Purifying Flame no longer under-predicts the cap

0.7.9 rebuilt Purifying Flame. It used to grant `bonusHiddenPotential`, which
CraftBuddy never modelled and never needed to — hidden potential is a property
of the finished item, not of the craft in progress. The rework replaced it with
a per-realm `Purity` buff carrying **`bonusMaximumQuality`**, and that one *does*
change the craft: it lifts the achievable quality cap by extra threshold steps
(+2 at pillarCreation and above, +1 below), stretching each bar by another
1.3x-scaled threshold.

The game threads that bonus into its own cap getters through a new optional
fourth argument, `maxStepsBoost`. CraftBuddy was still calling
`getMaxCompletion`/`getMaxPerfection` with three arguments, so with the flame
equipped it read the *unboosted* cap and planned the craft against a ceiling
lower than the one the game would actually enforce.

- `computeMaxStepsBoost()` in the new `src/modContent/qualityCap.ts` sums
  `bonusMaximumQuality` across the entity's held buffs, mirroring the runtime's
  `getMaxStepsBoost` fold exactly: `eqn` is stripped before evaluation, `stacks`
  is **pinned to 1** (so a `stacks`-scaled bonus is *not* multiplied by the held
  stack count), and each buff's contribution is floored individually before
  being summed. Getting any of those three wrong would over-predict the ceiling
  and make CraftBuddy plan past a cap the game will not grant.
- `updateProgressCapsFromModApi()` passes that boost as the fourth argument to
  both cap getters, so `maxCompletionCap` / `maxPerfectionCap` — and therefore
  every band, tier gate and auto-finish decision derived from them — reflect the
  real ceiling.
- The call is backwards-safe: the argument is optional upstream, and a boost of
  `0` reproduces the previous behaviour exactly, so nothing changes for crafts
  without a cap-raising buff.

`bonusQuality`, the other half of the rework, awards bonus stars on a max-tier
finish. That is a finished-item property with no effect on in-craft decisions,
so it is deliberately not simulated.

### A test that only failed on a busy machine

`search.test.ts`'s "0 cost percentages behave as the neutral baseline" case
asserts *exact* score equality between two searches, but gave them a 700ms
wall-clock budget. That frontier completes at depth 8 after ~821 expanded nodes
(~540ms unloaded), so on a loaded machine the budget truncated the two runs at
different points and they reported different scores — a false failure that had
nothing to do with the behaviour under test. Both budgets are now set far above
what the frontier needs, so the comparison is deterministic. This follows the
same rule that already moved the depth perf contracts off wall clock; no
assertion and no scoring constant changed.

## Added

- `BuffDefinition` in `src/optimizer/gameTypes.ts` gained the optional
  `bonusMaximumQuality` and `bonusQuality` fields, mirrored as optional serde
  fields on the Rust `BuffDefinition` in `crates/craftbuddy-engine/src/effects.rs`
  so both engines accept the 0.7.9 buff payload verbatim.

## Adopted without a code change

The optimizer resolves the technique roster live from game data every craft
(`convertGameTechniques`, via `craftingTechniqueFromKnown` when available), and
0.7.9 kept the technique payload shape intact. The whole crafting Insight
overhaul is therefore adopted automatically:

- **Insight** buff: per-stack control up from `.1` to `.15`.
- **Perfected Understanding** (new, coreFormation): grants 2 Insight per 100%
  perfection completed, via `floor(perfectionPercentage / 100) * 2`.
- **Sustained Revelation** (new, lifeFlourishing): 5 stacks that each convert a
  refine into `+.08` perfection per Insight stack.
- **Insightful Refinement** was removed from the game; the roster no longer
  offers it, and CraftBuddy simply stops seeing it.
- **Seek Insight**: 16 pool (was 20), `.9` perfection (was `.7`).
- **Forge Compression**: rebuilt around a `stackGained.Pressure` trigger with
  new `pressureStacks` / `completion` masteries. The existing triggered-effect
  dispatch already handles the dynamic `stackGained.<buff>` trigger family that
  0.7.9 introduced.
- **New cauldrons** (Discernment, Hundredfold Lens) and the additional core
  formation masteries on many crafting actions arrive through the same live
  read.

## Validation

| Check | Result |
| --- | --- |
| `bun run typecheck` | clean |
| `bun run test` | 929 passed, 35 suites |
| `bun run wasm:test` | 70 passed (3 ignored profiling harnesses) |
| `bun run build` | OK, `builds/afnm-craftbuddy.zip` |
| `bun run docs:check` | clean |
| `bun run optimizer:bench` | 105 contracts passed, 0 failed |
| `bun run optimizer:differential-corpus` | regenerated byte-identical (137 scenarios / 1,471 transitions) |

The corpus regenerating unchanged is the load-bearing evidence that this release
alters no simulation mechanics: the cap boost is resolved at the modContent
boundary and reaches both engines only as an already-raised cap.
