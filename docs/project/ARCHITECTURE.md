---
title: Architecture
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/mod.ts, src/modContent/index.ts, src/optimizer/*, src/ui/*, src/settings/index.ts
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/INTEGRATION_MODAPI.md
---

# Architecture

## Runtime module map

- `src/mod.ts`
  - bootstrap entrypoint and metadata export.
- `src/modContent/index.ts`
  - runtime integration boundary: reads game state, builds optimizer config/state/actions, invokes optimizer, renders overlay panel.
- `src/optimizer/state.ts`
  - immutable simulation state model and cache-key generation.
- `src/optimizer/gameTypes.ts`
  - game-aligned types + shared formulas (`evaluateScaling`, condition parsing, crit EV helpers).
- `src/optimizer/skills.ts`
  - action transition engine (`calculateSkillGains`, `applySkill`, mastery + buff + harmony handling).
- `src/optimizer/harmony.ts`
  - deterministic harmony subsystem simulation for forge/alchemical/inscription/resonance.
- `src/optimizer/search.ts`
  - recommendation search (`greedySearch`, `lookaheadSearch`, `findBestSkill`) with memoization, pruning, branching.
- `src/ui/*.tsx`
  - recommendation and settings panels.
- `src/settings/index.ts`
  - persistent user settings and optimizer search-config mapping.

## Runtime lifecycle (high level)

1. Craft state detection/refresh in integration layer.
2. Conversion of live game payloads -> optimizer model.
3. Search execution for best next action.
4. UI render/update with recommendation + alternatives.
5. Repeat on craft-state changes.

## Key integration functions

- `extractBuffInfo(...)`
- `extractMasteryData(...)`
- `convertGameTechniques(...)`
- `buildConfigFromEntity(...)`
- `updateRecommendation(...)`
- `pollCraftingState(...)`
- `processCraftingState(...)`
- `renderOverlay(...)`

## Design boundaries

- Keep simulation logic in `src/optimizer/*` pure and testable.
- Keep game object adaptation and fallback extraction in `src/modContent/index.ts`.
- Keep UI concerns in `src/ui/*` and settings persistence in `src/settings/index.ts`.

## Dependency direction

`modContent` -> `optimizer` + `settings` + `ui`

`optimizer` does not depend on `modContent` or UI.
