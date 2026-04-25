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
5. For data-source priority and runtime boundary rules, load `craftbuddy-runtime-integration`.

## Hook Rules

- `onReduxAction` is reducer-time; use only for fast read-only observation.
- Mutation hooks must return the expected payload shape and stay deterministic.
- Optional-chain ModAPI access and preserve graceful degradation for older runtimes.
- Network or external calls must be non-fatal.

## CraftBuddy-Specific Helpers

- `getNextCondition` — condition transitions
- `craftingTechniqueFromKnown` — live technique resolution by canonical name
- `completionBonusBuffName` — completion bonus extraction
- `getActionCost` — native post-modifier action cost preview
- `evaluateCraftingCondition` — native crafting condition evaluation
- `getActualCraftingStat` — native crafting stat resolution

## References

- `docs/project/INTEGRATION_MODAPI.md` — deep integration reference
- `docs/reference/afnm-modding/` — upstream AFNM modding docs
- `src/modContent/index.ts` — integration boundary implementation
- `runtime-oracle` skill — verify against installed runtime
- `craftbuddy-runtime-integration` skill — active workflow for modContent changes
