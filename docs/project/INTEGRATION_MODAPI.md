---
title: Mod API Integration
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-20
source_of_truth: src/modContent/index.ts
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
- resolve crafting type/sublime context from live recipe fields plus `modAPI.gameData.itemTypeToHarmonyType` when explicit harmony fields are missing
- normalize techniques/masteries/buffs into optimizer action definitions
- collect condition effects and forecasted conditions
- prefer documented crafting helpers such as `modAPI.utils.getNextCondition`, `modAPI.utils.craftingTechniqueFromKnown`, and `modAPI.utils.completionBonusBuffName` when they are available
- seed optimizer state with native variable snapshots when available
- register guarded native provider seams (overcrit, availability, condition transitions)
- pass harmony/training mode fields to optimizer config/state
- map settings to search config
- update overlay UI and debug surface

## Data source priority

1. direct game/Redux state when present
2. hook-provided payloads (for recipe/condition context)
3. controlled DOM-derived fallback
4. local cache fallback (for resilience on mid-craft restoration)

## Known fallback paths

Fallback handling exists for targets/progress extraction, condition transitions, optional payload fields when game objects are incomplete, and local scaling evaluation. `modAPI.utils.evaluateScaling` is not used by optimizer simulation because the live provider can drift from hypothetical future-state variables and already-upgraded payloads. Live crafting techniques now prefer `modAPI.utils.craftingTechniqueFromKnown` by matching the active `CraftingTechnique.name` to `player.player.craftingTechniques[*].technique`, then reattaching live cooldown/session state; if that name match misses or the resolver throws, the raw live technique payload remains the fallback. Condition transitions now prefer the documented `modAPI.utils.getNextCondition` helper, with legacy fallback probing retained only for older runtimes. Completion-bonus extraction now prefers `modAPI.utils.completionBonusBuffName`, with the old name/signature heuristic retained as fallback.

Replay snapshots are expected to be parity-grade bug reports, not just light debug summaries. They should preserve runtime-shaped skill fields (including mastery/granted-buff payloads), active buff definitions when those change optimizer gains or costs, and craft-context provenance (crafting-type source, sublime-detection signals, integration diagnostics, raw recipe/recipeStats fields). Exported snapshot bundles now keep the current turn plus a bounded recent-turn history with auto-mode state so bug reports can show how a bad line developed without growing unbounded.

When the runtime UI/help text, older reference notes, and executable behavior disagree, the installed game bundle is authoritative. Use the extraction flow in `docs/project/TESTING.md` before changing mechanics constants or parity tests.

## Migration targets

Pending game API/documentation follow-up — see `docs/dev-requests/API_EXPOSURE_REQUESTS.md` for full details and status:

- finalized post-modifier pool/stability cost preview helpers
- published contract that live `CraftingTechnique.name` is the canonical non-localized key shared with `KnownCraftingTechnique.technique`
