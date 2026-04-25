---
name: craftbuddy-runtime-integration
description: CraftBuddy runtime integration workflow. Activate for src/modContent changes, ModAPI/root-state adoption, craft-state extraction, DOM fallback, live technique resolution, auto-craft action execution, replay snapshots, or runtime parity issues.
---

# CraftBuddy Runtime Integration

`src/modContent/index.ts` and neighboring modules are the only boundary between AFNM runtime objects and the optimizer/UI.

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

## Preferred Runtime Helpers

- `modAPI.utils.getNextCondition` for condition transitions.
- `modAPI.utils.craftingTechniqueFromKnown` for live technique resolution by canonical `CraftingTechnique.name`.
- `modAPI.utils.completionBonusBuffName` for completion bonus extraction.
- `modAPI.utils.getActionCost`, `evaluateCraftingCondition`, and `getActualCraftingStat` when runtime parity requires native previews.

If a helper is missing or throws, keep the existing guarded fallback and verify with `runtime-oracle`.

## DOM Fallback Rules

- Prefer language-agnostic root-state signals over English text.
- If DOM is unavoidable, parse structural numeric `X/Y` values before label regexes.
- Accept compact HUD formats like `31K`.
- For non-overcraft crafts, reconcile rounded HUD text against exact completion/perfection caps.

## Auto-Craft Boundaries

- Controller policy and state transitions belong in `autoCraftController.ts`.
- Native action dispatch bridge belongs in `autoCraftExecutor.ts`.
- Synthesized `Finish Craft` recommendations map to the native `Wait` technique before DOM fallback.
- Auto mode must execute one action, then wait for an observed craft-state change before continuing.

## Validation

```bash
bun run runtime:oracle
bun run runtime:grep -- "getGameStateSnapshot|injectUI|basicBestCompletion|perfectBestCompletion|sublimeBestCompletion|poolCostFlat"
bun run test
```

Add focused tests for controller state, replay parity, or integration regressions. Rebuild before any live game validation so `dist/` and the zip are current.

## Gotchas

1. **`onReduxAction` runs inside the reducer**: observation only; no async side effects or state mutation.
2. **Runtime docs can drift**: installed bundle grep beats old notes and assumptions.
3. **DOM state is locale fragile**: never make English labels the sole truth source when root state exists.
4. **Replay snapshots are bug reports**: preserve runtime-shaped skill fields, active buff definitions, craft-context provenance, current turn, and recent history.

## References

- `docs/project/INTEGRATION_MODAPI.md`
- `docs/project/ARCHITECTURE.md`
- `docs/project/TESTING.md`
- `src/modContent/index.ts`
- `src/modContent/autoCraftController.ts`
- `src/modContent/autoCraftExecutor.ts`
