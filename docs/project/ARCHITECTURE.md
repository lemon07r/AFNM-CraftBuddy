---
title: Architecture
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-06
source_of_truth: src/mod.ts, src/modContent/*, src/optimizer/*, src/ui/*, src/settings/index.ts, src/utils/*
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/INTEGRATION_MODAPI.md
---

# Architecture

## Runtime module map

- `src/mod.ts` — bootstrap entrypoint and metadata export.
- `src/modContent/index.ts` — runtime integration boundary: reads game state, builds optimizer config/state/actions, invokes optimizer, renders overlay panel.
- `src/modContent/configStats.ts` — base crafting stat resolution from game entities.
- `src/modContent/harmonyState.ts` — harmony-state hydration/canonicalization from authoritative progress payloads and verified runtime fallbacks.
- `src/modContent/replaySnapshot.ts` — optimizer replay snapshot serialization for live bug reports/debug captures.
- `src/optimizer/index.ts` — barrel re-exports (public API surface of the optimizer module).
- `src/optimizer/state.ts` — immutable simulation state model and cache-key generation.
- `src/optimizer/gameTypes.ts` — game-aligned types + shared formulas (`evaluateScaling`, guarded native-scaling bridge, condition parsing, crit EV helpers).
- `src/optimizer/skills.ts` — action transition engine (`calculateSkillGains`, `applySkill`, mastery + buff + harmony handling).
- `src/optimizer/harmony.ts` — deterministic harmony subsystem simulation for forge/alchemical/inscription/resonance.
- `src/optimizer/nativeVariables.ts` — canonical native-variable storage + runtime re-derivation of buff/harmony aliases for native availability checks.
- `src/optimizer/search.ts` — recommendation search (`greedySearch`, `lookaheadSearch`, `findBestSkill`) with memoization, pruning, branching.
- `src/ui/RecommendationPanel.tsx`, `src/ui/SettingsPanel.tsx` — recommendation and settings panels.
- `src/ui/theme.ts` — MUI theme configuration with custom palette and component overrides.
- `src/ui/ThemeProvider.tsx` — theme provider wrapper for UI components.
- `src/ui/animations.ts` — shared animation definitions (keyframes, transitions, search progress fill).
- `src/ui/components/StyledComponents.tsx` — reusable styled components (buttons, cards, indicators, search progress bar).
- `src/ui/components/index.ts` — component barrel exports.
- `src/settings/index.ts` — persistent user settings and optimizer search-config mapping.
- `src/utils/largeNumbers.ts` — safe arithmetic, number parsing/formatting for late-game values.
- `src/utils/debug.ts` — debug logging utility.

## Runtime lifecycle (high level)

1. Craft state detection/refresh in integration layer.
2. Conversion of live game payloads -> optimizer model, including harmony hydration and canonical native-variable extraction.
3. Search execution for best next action.
4. UI render/update with recommendation + alternatives.
5. Repeat on craft-state changes.

## Key integration functions (in `src/modContent/index.ts`)

These are internal (not exported) — the file is a side-effect module imported by `mod.ts`:

- `extractBuffInfo(...)` — buff data extraction from game entities
- `extractMasteryData(...)` — mastery data extraction
- `convertGameTechniques(...)` — game technique normalization
- `buildConfigFromEntity(...)` — optimizer config construction
- `updateRecommendation(...)` — triggers search and updates UI
- `pollCraftingState(...)` — polling loop for craft state changes
- `processCraftingState(...)` — main state processing pipeline
- `renderOverlay(...)` — UI mount/update

## Design boundaries

- Keep simulation logic in `src/optimizer/*` pure and testable.
- Keep game object adaptation and fallback extraction in `src/modContent/*`.
- Keep UI concerns in `src/ui/*` and settings persistence in `src/settings/index.ts`.

## Dependency direction

```
modContent -> optimizer + settings + ui + utils
ui         -> optimizer + settings + utils
optimizer  -> utils
settings   -> (nothing internal)
```

`optimizer` does not depend on `modContent`, `ui`, or `settings`.
