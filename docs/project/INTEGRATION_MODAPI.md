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

For the active workflow when editing `src/modContent/*`, load the `craftbuddy-runtime-integration` skill. For ModAPI surface lookups, load `modapi-lookup`. This doc is the deep reference for integration architecture and migration state.

## Role

`src/modContent/index.ts` is the sole adapter from game runtime objects to optimizer input/output. All fallback extraction and game-object adaptation logic is centralized here to maintain a single drift boundary.

## Data source priority

1. Direct game/Redux store only when synchronous dispatch notifications are required (e.g. auto-craft state-advance detection).
2. `window.modAPI.subscribe(...)` / `window.modAPI.getGameStateSnapshot()` for normal store-like reads.
3. Hook-provided payloads for recipe/condition context.
4. Controlled DOM-derived fallback for visible `X/Y` values and UI-only recovery.
5. Local cache fallback for resilience during mid-craft restoration.

## Known fallback paths

Live crafting techniques prefer `modAPI.utils.craftingTechniqueFromKnown` by matching the active `CraftingTechnique.name` to `player.player.craftingTechniques[*].technique`, then reattaching live cooldown/session state; the raw live technique payload remains the fallback if the resolver misses or throws. Condition transitions prefer `modAPI.utils.getNextCondition`, with legacy fallback probing for older runtimes. Completion-bonus extraction prefers `modAPI.utils.completionBonusBuffName`, with heuristic fallback.

Craft-session visibility treats root-state `screen.screen === 'recipe'` plus a live crafting slice as the primary language-agnostic signal. DOM text parsing remains for target/progress recovery but must parse structural `X/Y` progress values before English-label regex fallback, accept compact HUD formats like `31K`, and reconcile rounded HUD text against exact caps for non-overcraft crafts.

`modAPI.utils.evaluateScaling` is intentionally not used by optimizer simulation because the live provider can drift from hypothetical future-state variables.

## Runtime 0.6.50 additions

- Root ModAPI state APIs: `subscribe`, `getGameStateSnapshot`, `injectUI`
- `hooks.onReduxAction`
- Recipe best-completion tracking: `basicBestCompletion`, `perfectBestCompletion`, `sublimeBestCompletion`
- Flat crafting Qi-cost stat: `poolCostFlat`
- `modAPI.utils.getActionCost` — native post-modifier action cost preview
- `modAPI.utils.evaluateCraftingCondition` — native crafting condition evaluation
- `modAPI.utils.getActualCraftingStat` — native crafting stat resolution
- `noQiCost` technique field — marks techniques that cost no Qi
- `craftingTeamUpOverride` companion buff integration

## Migration targets

**Adopted:**
- `subscribe` / `getGameStateSnapshot` for store-like reads and state-backed craft-session detection
- Runtime `poolCostFlat` flows through state/cache/replay/effective-cost evaluation

**Good next candidates:**
- `injectUI` to replace manual overlay container when layout flexibility is sufficient
- `actions.addTranslation` for CraftBuddy-owned string localization
- `hooks.onReduxAction` to replace some polling once action lifecycle guarantees are documented

**Pending game API follow-up** — see `docs/dev-requests/API_EXPOSURE_REQUESTS.md`:
- Finalized post-modifier pool/stability cost preview helpers
- Published contract that live `CraftingTechnique.name` is the canonical non-localized key

## Replay snapshot expectations

Snapshots must be parity-grade bug reports preserving runtime-shaped skill fields, active buff definitions, craft-context provenance, current turn, bounded recent-turn history, and auto-mode state. See `docs/project/TESTING.md` replay-parity section for test coverage expectations.

When runtime UI/help text, older reference notes, and executable behavior disagree, the installed game bundle is authoritative. Use `runtime-oracle` skill to verify.
