---
name: modapi-lookup
description: CraftBuddy ModAPI lookup workflow. Activate when using AFNM hooks, actions, utilities, root-state APIs, gameData, injectUI, registerOptionsUI, or when verifying API signatures before implementation.
---

# ModAPI Lookup

Use curated docs first, then verify uncertain symbols with the installed runtime.

## Workflow

1. Read the project integration doc for CraftBuddy constraints: `docs/project/INTEGRATION_MODAPI.md`.
2. For upstream examples, start with `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` and only then open deeper reference files.
3. Verify undocumented or risky APIs:
   ```bash
   bun run runtime:grep -- "<method-or-hook-name>"
   ```
4. Keep adoption and fallbacks centralized in `src/modContent/*`.

## API Preference Order

1. `window.modAPI.getGameStateSnapshot()`
2. `window.modAPI.subscribe()`
3. `window.modAPI.injectUI()` / `registerOptionsUI()` / documented actions and utils
4. Verified direct store access when synchronous action observation is required
5. DOM/React fiber fallback only for confirmed gaps

## Hook Rules

- `onReduxAction` is reducer-time; use only for fast read-only observation.
- Mutation hooks must return the expected payload shape and stay deterministic.
- Optional-chain ModAPI access and preserve graceful degradation for older runtimes.
- Network or external calls must be non-fatal.

## CraftBuddy-Specific Helpers

- `getNextCondition`
- `craftingTechniqueFromKnown`
- `completionBonusBuffName`
- `getActionCost`
- `evaluateCraftingCondition`
- `getActualCraftingStat`

## References

- `docs/project/INTEGRATION_MODAPI.md`
- `docs/reference/afnm-modding/`
- `src/modContent/index.ts`
- `runtime-oracle` skill
