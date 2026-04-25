---
title: Mod API Integration
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-04-25
source_of_truth: src/modContent/index.ts, src/modContent/craftingStoreState.ts
review_cycle_days: 21
related_files:
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
---

# Mod API Integration

## Role

`src/modContent/index.ts` is the sole adapter from game runtime objects to optimizer input/output.

All fallback extraction and game-object adaptation logic is centralized here — never duplicated in optimizer modules. This is a deliberate design decision to maintain a single drift boundary and clearer parity auditing.

## Responsibilities

- read live crafting state and recipe data
- use direct Redux store access only where synchronous dispatch notifications are required, and otherwise prefer `window.modAPI.subscribe(...)` / `window.modAPI.getGameStateSnapshot()` for store-like reads
- resolve crafting type/sublime context from live recipe fields plus `modAPI.gameData.itemTypeToHarmonyType` when explicit harmony fields are missing
- normalize techniques/masteries/buffs into optimizer action definitions
- collect condition effects and forecasted conditions
- prefer documented crafting helpers such as `modAPI.utils.getNextCondition`, `modAPI.utils.craftingTechniqueFromKnown`, and `modAPI.utils.completionBonusBuffName` when they are available
- seed optimizer state with native variable snapshots when available
- keep locale-sensitive DOM logic as structural fallback only; never make English UI copy the sole source of craft-session truth when root-state APIs or stable selectors exist
- register guarded native provider seams (overcrit, availability, condition transitions)
- pass harmony/training mode fields to optimizer config/state
- map settings to search config
- update overlay UI and debug surface

## Data source priority

1. direct game/Redux store only when synchronous dispatch notifications are required, such as auto-craft state-advance detection
2. ModAPI root-state adapter (`subscribe`, `getGameStateSnapshot`) for normal store-like reads and state-backed craft-session detection
3. hook-provided payloads for recipe/condition context
4. controlled DOM-derived fallback for visible `X/Y` values and UI-only recovery
5. local cache fallback for resilience during mid-craft restoration

## Known fallback paths

Fallback handling exists for targets/progress extraction, condition transitions, optional payload fields when game objects are incomplete, and local scaling evaluation. `modAPI.utils.evaluateScaling` is not used by optimizer simulation because the live provider can drift from hypothetical future-state variables and already-upgraded payloads. Live crafting techniques now prefer `modAPI.utils.craftingTechniqueFromKnown` by matching the active `CraftingTechnique.name` to `player.player.craftingTechniques[*].technique`, then reattaching live cooldown/session state; if that name match misses or the resolver throws, the raw live technique payload remains the fallback. Condition transitions now prefer the documented `modAPI.utils.getNextCondition` helper, with legacy fallback probing retained only for older runtimes. Completion-bonus extraction now prefers `modAPI.utils.completionBonusBuffName`, with the old name/signature heuristic retained as fallback.

Craft-session visibility now treats the root-state `screen.screen === 'recipe'` plus a live crafting slice as the primary language-agnostic signal. DOM text parsing remains for target/progress recovery, but it should parse structural `X/Y` progress values from visible widgets before trying any English-label regex fallback. Those DOM fallbacks must also accept compact HUD number formats such as `31K`, and when the craft explicitly cannot overcraft they should reconcile rounded HUD text against the exact completion/perfection caps instead of trusting the abbreviated display as the exact target.

Installed runtime `0.6.50` also exposes additional parity-relevant fields that are not necessarily search inputs by themselves:

- root ModAPI state APIs: `subscribe`, `getGameStateSnapshot`, `injectUI`
- `hooks.onReduxAction`
- recipe best-completion tracking: `basicBestCompletion`, `perfectBestCompletion`, `sublimeBestCompletion`
- flat crafting Qi-cost stat: `poolCostFlat`

New in `0.6.50`:

- `modAPI.utils.getActionCost` — native post-modifier action cost preview
- `modAPI.utils.evaluateCraftingCondition` — native crafting condition evaluation
- `modAPI.utils.getActualCraftingStat` — native crafting stat resolution
- `noQiCost` technique field — marks techniques that cost no Qi (integration now skips Qi-cost evaluation for these)
- `craftingTeamUpOverride` companion buff integration — companion crafting buffs now flow into optimizer state

Replay snapshots are expected to be parity-grade bug reports, not just light debug summaries. They should preserve runtime-shaped skill fields (including mastery/granted-buff payloads), active buff definitions when those change optimizer gains or costs, and craft-context provenance (crafting-type source, sublime-detection signals, integration diagnostics, raw recipe/recipeStats fields). Exported snapshot bundles now keep the current turn plus a bounded recent-turn history with auto-mode state so bug reports can show how a bad line developed without growing unbounded.

When the runtime UI/help text, older reference notes, and executable behavior disagree, the installed game bundle is authoritative. Use the extraction flow in `docs/project/TESTING.md` before changing mechanics constants or parity tests.

## Migration targets

Adopted in current code:

- `window.modAPI.subscribe(...)` / `window.modAPI.getGameStateSnapshot()` are available for normal store-like reads; state-backed craft-session detection (`hasStateBackedCraftingUi`) removes locale-sensitive dependency on English DOM text
- runtime `poolCostFlat` now flows through optimizer state, cache keys, replay snapshots, and effective-action-cost evaluation

Good next migration candidates:

- `window.modAPI.injectUI(...)` can eventually replace the manual overlay container when the injected-host layout is flexible enough for the recommendation panel
- `window.modAPI.actions.addTranslation(...)` and related font controls can localize CraftBuddy-owned strings instead of relying on English-only panel copy
- `window.modAPI.hooks.onReduxAction(...)` can replace some polling/manual transition observation once the needed action names and lifecycle guarantees are documented

Pending game API/documentation follow-up — see `docs/dev-requests/API_EXPOSURE_REQUESTS.md` for full details and status:

- finalized post-modifier pool/stability cost preview helpers
- published contract that live `CraftingTechnique.name` is the canonical non-localized key shared with `KnownCraftingTechnique.technique`
