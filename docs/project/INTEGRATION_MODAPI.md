---
title: Mod API Integration
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.10-9bf9078
last_verified: 2026-09-01
source_of_truth: src/modContent/index.ts, src/modContent/craftingStoreState.ts, src/modContent/craftingContext.ts, src/modContent/harmonyState.ts, src/modContent/nativeAutoUse.ts, src/modContent/craftStateSignature.ts, src/modContent/autoCraftExecutor.ts
review_cycle_days: 30
related_files:
  - docs/project/ARCHITECTURE.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
  - docs/dev-requests/STATUS.md
---

# Mod API Integration

Deep reference for the runtime boundary. For the working checklist load the `craftbuddy-runtime-integration` skill; for ModAPI surface lookups load `modapi-lookup`, then `runtime-oracle`.

## Role

`src/modContent/*` is the only adapter between AFNM runtime objects and the optimizer/UI, so every drift-prone assumption has one home. It reaches the optimizer exclusively through the `src/optimizer/index.ts` facade — never a submodule — so integration code cannot depend on optimizer internals or become a second authority for a rule.

## Data source priority

1. Direct game/Redux store only where synchronous dispatch observation is required (auto-craft state-advance detection).
2. `window.modAPI.subscribe(...)` / `getGameStateSnapshot()` for normal store-like reads.
3. Hook-provided payloads for recipe/condition context.
4. Controlled DOM-derived fallback for visible `X/Y` values and UI-only recovery.
5. Local cache fallback during mid-craft restoration.

## Preferred runtime helpers

- `modAPI.utils.getNextCondition` — condition transitions (legacy probing remains as fallback).
- `modAPI.utils.craftingTechniqueFromKnown` — live technique resolution keyed by the canonical `CraftingTechnique.name`, preserving live cooldown/session state.
- `modAPI.utils.completionBonusBuffName` — stable completion-bonus identifier.
- `modAPI.utils.getActionCost`, `evaluateCraftingCondition`, `getActualCraftingStat`, `getMaxToxicity`, and the completion/perfection cap getters — native previews with guarded fallbacks.

`modAPI.utils.evaluateScaling` is deliberately **not** used inside optimizer simulation: the live provider can diverge on hypothetical future-state variables.

## Game-version behaviour that affects integration

Target build **0.7.6-7c586da**. The semantics below arrived with the 0.7.5 harmony rework and were re-verified against the 0.7.6 bundle; `docs/project/RUNTIME_EVIDENCE.md` is the authority for all of them.

### Harmony resolution

Harmony is a **player choice** and is no longer a function of the item type. `craftingContext.ts` reads the selection from live craft state and keeps `recipe.harmonyTypeOverride` as the forced case.

The ModAPI utility `gameData.itemTypeToHarmonyType` was **removed by the game**. CraftBuddy does not reference it and must not grow a replacement heuristic: when the selection cannot be read, harmony data is treated as _missing_ rather than guessed (forge heat is the single exception, recovered from verified runtime mirrors).

Sublime recipe targets are scaled by the selected harmony's complexity multiplier (`applyComplexityMultiplier`), so effective targets must be derived through the optimizer facade rather than read raw off the recipe. The seven multipliers are unchanged in 0.7.6.

`harmonyState.ts` hydrates the subsystem state. Two properties matter at this boundary: **every** subsystem it knows about must survive cloning (a missed one silently restarts that state machine on every poll, which is exactly the `cloneHarmonyData` bug fixed in 6.1.0), and absent Eccentric Decree state is seeded from the **current** bars, mirroring the runtime's own lazy seeding so attaching mid-craft cannot retro-charge harmony.

### Native crafting auto-use

The game applies the player's crafting auto-use loadout (`player.player.currentCraftingAutoUseLoadout.slots`) **immediately before every technique dispatch**. It is a pre-technique hook inside the same user gesture, not a background timer. The extracted runtime source and the 10-rule selection order are in `docs/project/RUNTIME_EVIDENCE.md` section 1; `nativeAutoUse.ts` mirrors them.

0.7.6 changed nothing on this read path. It added `craftingLoadout.craftingAutoUseLoadoutId`, which pairs a crafting loadout with an auto-use loadout; the game resolves the pairing into `currentCraftingAutoUseLoadout` before CraftBuddy reads state, so integration needs no change. The new `(This Effect)` self-reference slot condition is unevaluable here like every other inline condition, so it falls to the conservative "will fire" default.

Integration consequences:

- `readNativeAutoUseStatus(store)` resolves `{ active, slotCount, coveredItemNames, pillsPerRound, availableToxicity, trainingMode }` defensively from `unknown`.
- Covered item names are removed from the optimizer's action space, and `fullActionSpace` degrades to techniques + finish with a visible reason, so the two systems never consume the same pill.
- **Execution path is a correctness decision, not a reliability one.** With a loadout active, a technique must be executed through the in-game control so the hook runs; dispatching `crafting/executeTechnique` straight to the store would silently skip the player's items, so automation stops (`NativeAutoUseUnreachableError`) rather than bypassing it. With no loadout the direct dispatch stays preferred: it is equivalent for the craft and far more precise than DOM matching.
- `trainingMode !== undefined` means the game applies items **without** removing them from the inventory — inventory-diff verification must not read that as a mismatch.
- After native consumption, auto mode settles and re-reads before deciding again, so a consumed pill is never mistaken for the technique advancing the craft.

### No manual finish

There is no `Finish Craft` action, re-verified absent in 0.7.6; the craft resolves itself when `willAutoFinish` holds. `Wait` is a real technique costing 10 stability, so it is never a free "finish now". UI and status copy say "will auto-finish".

### Dispatch-time state verification

`craftStateSignature.ts` builds a canonical signature over step, qi, completion, perfection, stability, max stability, toxicity, condition, the forecast queue, buffs, cooldowns, the **available-technique roster**, quick-access inventory, harmony value, a canonical `harmonyData` digest, and `consumedPills`. A monotonic `craftStateRevision` is derived from it and attached to every auto-mode snapshot.

The executor re-verifies immediately before dispatch — the controller's own fingerprint check happens ~90 ms earlier and is never repeated:

| Verification | Action |
| --- | --- |
| `match` | dispatch |
| `stale` (with changed field list) | recalculate, dispatch nothing |
| `unverifiable` (state unreadable) | pause with an explanatory status, dispatch nothing |

## DOM fallback rules

- Prefer language-agnostic root-state signals over English text; craft visibility uses `screen.screen === 'recipe'` plus a live crafting slice.
- Parse structural numeric `X/Y` before label regexes, accept compact HUD forms such as `31K`, and reconcile rounded HUD text against exact caps on non-overcraft crafts.

## Current runtime surfaces

- Root state: `subscribe`, `getGameStateSnapshot`, `injectUI`
- `hooks.onReduxAction` (reducer-time; observation only)
- Recipe best-completion tracking: `basicBestCompletion`, `perfectBestCompletion`, `sublimeBestCompletion`
- Crafting stats: `poolCostFlat`, `pillsPerRound`, `resistance`, `maxtoxicity`
- `noQiCost` technique field, `craftingTeamUpOverride` companion buffs
- `currentCraftingAutoUseLoadout` / `storedCraftingAutoUseLoadouts`
- Progress state: `harmonyTypeData`, `consumedPills`, `pillTracking`, `trainingMode`

Not part of the auto-use system: `CRAFTING_AUTO_USE_PILL` / `CRAFTING_AUTO_USE_REAGENT` are react-dnd drag types for the loadout editor rows.

### 0.7.6 surfaces that exist but are not adopted

Available in `afnm-types@0.7.6` and deliberately unused, recorded so they are not rediscovered as new:

| Surface | Why not adopted |
| --- | --- |
| `gameData.buffs` (`Record<string, Buff>`) | CraftBuddy hydrates buff definitions from the live craft payload, which is authoritative for the craft in progress. A global registry would be a second source for the same data. |
| `getCoreFormationAltarStats(breakthrough)` | Altar stats feed a character's derived stats; CraftBuddy reads effective crafting stats from the live entity instead. |
| Buff-interceptor stat filters | No current need; the interceptor hooks CraftBuddy uses are unaffected. |

Adopting any of them is a future decision, not an oversight.

## Migration targets

**Adopted:** root-state reads and craft-session detection; `poolCostFlat` through state/cache/replay/cost evaluation; native auto-use coexistence; dispatch-time state verification.

**Candidates:** `injectUI` to replace the manual overlay container; `actions.addTranslation` for CraftBuddy-owned localization; `hooks.onReduxAction` to replace some polling once action lifecycle guarantees are documented.

**Pending game API follow-up** — see `docs/dev-requests/STATUS.md`: finalized post-modifier cost preview helpers, and a published contract that `CraftingTechnique.name` is the canonical non-localized key.

## Replay snapshot expectations

Snapshots are parity-grade bug reports: runtime-shaped skill fields, active buff definitions, `harmonyData` plus its provenance, craft-context fields, the current turn, bounded recent history, and auto-mode state. See `docs/project/TESTING.md` for the coverage contract.

When runtime behaviour, help text, older notes and types disagree, the installed bundle wins. Verify with the `runtime-oracle` skill.
