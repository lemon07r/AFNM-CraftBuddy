# API requests

Unresolved requests after the AFNM 0.7.19 audit. Runtime facts live in [Runtime evidence](RUNTIME_EVIDENCE.md); local adoption and fallbacks live in [Development](DEVELOPMENT.md#native-helpers-availability-is-not-adoption).

## Still useful upstream

| Request | Why / current position |
| --- | --- |
| Finalized post-modifier Qi/stability payment preview | Validate mastery/buff/condition order against a canonical helper. `getActionCost` previews an individual cost, not final execution after effect masteries; the local adapter defines/imports a wrapper but does not call it. Both engines simulate payment locally. |
| Pure hypothetical-state scaling contract | `evaluateScaling` exists, but a live provider can disagree on future state. A documented pure input/output contract is needed before using it inside search. |
| Stable auto-use slot/rule contract | Document item reference, condition groups/self-effect references and `maxCount`, so projection need not conservatively assume unknown conditions fire. Actual native selection/consumption remains authoritative. |
| Normalized craft-time consumable effect preview | Could reduce item-family parsing heuristics; no finalized preview contract is recorded. |

## Local cutover questions (not missing APIs)

- What measured disagreement/error threshold should roll back all-depth native `canUseAction` enforcement? Current errors fall back locally.
- When can heuristic cap extraction retire? Prior criterion was a stable release without native-cap regressions; no retirement decision is recorded.
- `injectUI`, `gameData.registerOptionsUI`, translation helpers and Redux observation hooks exist; adopting them is a local integration choice, not a request to expose them.

## Fulfilled / obsolete

- Root-state `subscribe` / `getGameStateSnapshot`, native overcrit/precheck, completion/perfection cap getters, `getNextCondition`, `craftingTechniqueFromKnown`, completion-bonus identifier and max-toxicity getter are available, with guarded adopted paths.
- `getActionCost`, `evaluateCraftingCondition`, `getActualCraftingStat` and scaling utilities are exposed. Availability alone does not establish production use or hypothetical-state safety.
- Canonical non-localized `CraftingTechnique.name` matching known-technique/registry keys was documented upstream in `AfnmExampleMod`; that documentation request is **fulfilled**.
- Buff definitions, harmony state/config and condition payloads are available. `gameData.buffs` exists but is not needed for the current live-payload hydration path.
- Item-kind → harmony mapping was removed in 0.7.5 and is correctly obsolete: harmony is selected by the player.
