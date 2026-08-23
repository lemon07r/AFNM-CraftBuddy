---
name: craftbuddy-runtime-integration
description: CraftBuddy runtime integration workflow. Activate for src/modContent changes, ModAPI/root-state adoption, craft-state extraction, DOM fallback, live technique resolution, auto-craft action execution, replay snapshots, or runtime parity issues.
---

# CraftBuddy Runtime Integration

`src/modContent/index.ts` and neighboring modules are the only boundary between AFNM runtime objects and the optimizer/UI. Target runtime: AFNM **0.7.8**.

Reach the optimizer only through `src/optimizer/index.ts`. If something is missing from the barrel, add it there rather than importing a submodule.

## Activate When

- Editing `src/modContent/*`
- Reading live crafting state, recipes, techniques, buffs, or root-state snapshots
- Changing auto-craft controller/executor behavior
- Adding or removing ModAPI, Redux, fiber, or DOM fallback paths
- Updating replay snapshot export/import context

## Data Source Priority

1. Direct game/Redux store only when needed for synchronous dispatch notifications such as auto-craft state-advance detection.
2. `window.modAPI.subscribe()` and `window.modAPI.getGameStateSnapshot()` as the official store-like fallback.
3. Hook payloads for recipe/condition context.
4. Controlled DOM-derived fallback for visible `X/Y` values and UI-only recovery.
5. Local cache fallback for resilience during mid-craft restoration.

Do not scatter fallback logic into optimizer/UI modules. Centralize drift-prone assumptions in `src/modContent/*`.

## Runtime Essentials

1. **Harmony is player-selected.** Read it from live craft state in `craftingContext.ts`; `recipe.harmonyTypeOverride` is the forced case. The `itemTypeToHarmonyType` ModAPI utility was removed by the game and is still absent in 0.7.8 (`hasItemTypeToHarmonyType` is false) — do not reintroduce item-kind inference. When the selection cannot be read, treat harmony data as missing (forge heat is the one verified-mirror exception). Sublime targets are scaled by the harmony's complexity multiplier (forge 1.2, alchemical 1.2, inscription 0.9, resonance 1.3, formless 1.5, enhancingEcho 1.3, eccentricDecree 1).
2. **Native crafting auto-use is a pre-technique hook.** The game applies `player.player.currentCraftingAutoUseLoadout.slots` immediately before every technique dispatch. That read path is unchanged in 0.7.6, which only pairs a crafting loadout with its auto-use loadout through `craftingLoadout.craftingAutoUseLoadoutId` and resolves it before CraftBuddy reads state. `nativeAutoUse.ts` mirrors the selector; covered items leave the action space and `fullActionSpace` degrades to techniques + finish with a visible reason. Never let CraftBuddy consume an item the loadout covers.
3. **Execution path is a correctness decision.** With a loadout active, execute the technique through the in-game control so the hook runs, and stop (`NativeAutoUseUnreachableError`) rather than dispatching around it. With no loadout, the direct `crafting/executeTechnique` dispatch is preferred: equivalent for the craft and more precise than DOM matching.
4. **There is no manual finish.** The craft resolves itself when `willAutoFinish` holds. `Wait` is a real technique costing 10 stability, so it is never a stand-in for "finish now". Say "will auto-finish" in any copy.
5. **Verify at dispatch time.** `craftStateSignature.ts` covers step, resources, condition + forecast, buffs, cooldowns, quick-access inventory, harmony value, a canonical `harmonyData` digest and the available-technique roster. `stale` → recalculate, `unverifiable` → pause. Never dispatch against unverified state.
6. **Harmony can score several times per turn.** 0.7.6 fires Eccentric Decree's scoring from an `onBarChange` hook inside every completion/perfection application, so one technique can award several harmony steps (+5 focused, -15 stray since 0.7.8) and switch its focused bar mid-turn. Snapshots must preserve enough bar-change ordering for the optimizer to reproduce it.

Ground truth for all six: `docs/project/RUNTIME_EVIDENCE.md`. Do not re-derive them from tooltips or patch notes.

## Preferred Runtime Helpers

- `modAPI.utils.getNextCondition` for condition transitions.
- `modAPI.utils.craftingTechniqueFromKnown` for live technique resolution by canonical `CraftingTechnique.name`.
- `modAPI.utils.completionBonusBuffName` for completion bonus extraction.
- `modAPI.utils.getActionCost`, `evaluateCraftingCondition`, and `getActualCraftingStat` when runtime parity requires native previews.

If a helper is missing or throws, keep the existing guarded fallback and verify with `runtime-oracle`.

Exposed by 0.7.6 but deliberately **not adopted**: the `gameData.buffs` registry, `getCoreFormationAltarStats`, and buff-interceptor stat filters. Confirm with `runtime-oracle` before building on any of them.

## DOM Fallback Rules

- Prefer language-agnostic root-state signals over English text.
- If DOM is unavoidable, parse structural numeric `X/Y` values before label regexes.
- Accept compact HUD formats like `31K`.
- For non-overcraft crafts, reconcile rounded HUD text against exact completion/perfection caps.

## Auto-Craft Boundaries

- Controller policy and state transitions belong in `autoCraftController.ts`.
- The native dispatch bridge and dispatch-time verification belong in `autoCraftExecutor.ts`.
- Typed failures live in `autoCraftErrors.ts` and mean different things: `StaleCraftStateError` → recalculate, `UnverifiableCraftStateError` → pause, `NativeAutoUseConflictError` / `NativeAutoUseUnreachableError` → refuse. Do not collapse them into a generic error.
- Auto mode executes one action, then waits for an observed craft-state change; native item consumption gets its own settle phase so it is never mistaken for the technique advancing the craft.
- A silent wait is not a failure. When the state-advance timeout fires, re-read the live signature (`verifySnapshotState`) before deciding: changed → the action landed, resume (`resumeAfterLateStateAdvance`) with the executed fingerprint pinned; unchanged → resend once (`MAX_STATE_ADVANCE_RETRIES = 1`); unverifiable → never retry. A second failure degrades to a recoverable armed pause (`pauseAfterRejectedAction`), not a terminal error.
- Automation must be able to do nothing. Pausing with an explanation is always better than dispatching a guess, and a pause must always be resumable by the next real craft change.

## Validation

```bash
bun run runtime:oracle
bun run runtime:grep -- "getGameStateSnapshot|injectUI|basicBestCompletion|perfectBestCompletion|sublimeBestCompletion|poolCostFlat"
bun run runtime:grep -- "currentCraftingAutoUseLoadout|pillsPerRound|pillTracking|trainingMode"
bun run jest src/__tests__/nativeAutoUse.test.ts src/__tests__/craftStateSignature.test.ts
bun run jest src/__tests__/autoCraftController.test.ts src/__tests__/autoCraftExecutor.test.ts
bun run test
```

Add focused tests for controller state, replay parity, or integration regressions. Rebuild before any live game validation so `dist/` and the zip are current.

## Gotchas

1. **`onReduxAction` runs inside the reducer**: observation only; no async side effects or state mutation.
2. **Runtime docs can drift**: installed bundle grep beats old notes and assumptions.
3. **DOM state is locale fragile**: never make English labels the sole truth source when root state exists.
4. **Replay snapshots are bug reports**: preserve runtime-shaped skill fields, active buff definitions, `harmonyData` and its provenance, craft-context fields, current turn, and recent history.
5. **`trainingMode !== undefined` suppresses inventory removal**: the game applies items without consuming them, so inventory-diff verification must not read that as a mismatch. The check is definedness, not truthiness.
6. **`CRAFTING_AUTO_USE_PILL` / `CRAFTING_AUTO_USE_REAGENT` are react-dnd drag types** for the loadout editor, not the auto-use system.
7. **Unmodelled auto-use conditions default to "will fire"**: 0.7.6's `(This Effect)` self-reference condition is not modelled, so `nativeAutoUse.ts` takes the conservative branch and assumes the game will consume the item. Keep that default — the safe failure is CraftBuddy skipping an item, never double-spending one.
8. **Never hardcode buff magnitudes**: 0.7.6 nerfed Fallen Soulflame (0.5 → 0.2 intensity/control per stack, pool 3 → 2, stability 2 → 1) and neither engine needed a change, because both read live buff definitions. Copying a number into code re-breaks that.
9. **Harmony clones must cover every harmony's state**: `cloneHarmonyData` in `harmonyState.ts` was silently dropping `enhancingEcho` and `eccentricDecree` during hydration. When adding harmony state, extend the clone and its test in the same change.
10. **User-facing technique names are not internal names**: key `false_fusion` / internal `name` `False Fusion` displays as "Strive for Completion". Format labels with `techniqueDisplayName()` from `src/optimizer/index.ts`; keep matching, dispatch and `craftingTechniqueFromKnown` on `name`. The one exception is the DOM click fallback: `buildSearchAliases` in `autoCraftExecutor.ts` must index **both** spellings, because the in-game button carries the display name.

## References

- `docs/project/INTEGRATION_MODAPI.md`
- `docs/project/RUNTIME_EVIDENCE.md`
- `docs/project/ARCHITECTURE.md`
- `docs/project/TESTING.md`
- `src/modContent/index.ts`
- `src/modContent/nativeAutoUse.ts`
- `src/modContent/craftStateSignature.ts`
- `src/modContent/autoCraftController.ts`
- `src/modContent/autoCraftExecutor.ts`
