---
title: API Exposure Requests
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/modContent/index.ts, src/optimizer/*
review_cycle_days: 30
related_files:
  - docs/dev-requests/STATUS.md
  - docs/project/OPEN_QUESTIONS.md
---

# API/Data Exposure Requests for Game Developer

This list contains the smallest set of exposures that materially improve optimizer parity and maintainability.

## Priority list

### P0-1: Expose game-native scaling evaluator

- Data/function: `evaluateScaling(scaling, variables, defaultValue)`
- Why: central formula for technique/buff amounts
- Mod usage: replace internal evaluator in `src/optimizer/gameTypes.ts`
- Status: available via `modAPI.utils.evaluateScaling` (`afnm-types@0.6.38`)

### P0-2: Expose game-native overcrit helper

- Data/function: `calculateCraftingOvercrit(...)` (or equivalent effective multiplier)
- Why: high-realm crit handling must match game exactly
- Mod usage: replace overcrit EV helper in `src/optimizer/gameTypes.ts`
- Status: available via `modAPI.utils.calculateCraftingOvercrit` (`afnm-types@0.6.38`)

### P0-3: Expose canonical action availability precheck

- Data/function: `canUseAction(technique, state)`
- Why: avoids edge-case drift in internal availability checks
- Mod usage: authoritative gating before search expansion in `src/optimizer/skills.ts` / `src/optimizer/search.ts`
- Status: available via `modAPI.utils.canUseAction` (`afnm-types@0.6.38`)

### P1-1: Expose completion/perfection caps

- Data/function: cap getters used by runtime craft logic
- Why: avoid recommending gains that will be fully capped away
- Mod usage: cap-aware clamping and scoring
- Status: available via `modAPI.utils.getMaxCompletion/getMaxPerfection` (`afnm-types@0.6.38`)

### P1-2: Expose finalized post-modifier costs

- Data/function: final pool/stability costs after condition/buff/mastery modifiers
- Why: validates stacking-order parity
- Mod usage: direct cost prediction and availability checks

### P1-3: Stable completion-bonus identifier

- Data/function: stable key/id for completion bonus stacks
- Why: avoid name-based brittleness
- Mod usage: reliable completion bonus extraction in integration layer
- Current risk status: reduced (buff-first extraction now primary, computed path is fallback)

### P2-1: Item effect preview helpers for crafting context

- Data/function: normalized craft-time consumable effect payload
- Why: simplifies item action-space integration and reduces parsing heuristics
- Mod usage: item-action simulation path in optimizer transitions/search

## Current implementation posture

CraftBuddy now uses native provider-backed paths for exposed APIs with guarded fallbacks:

- native scaling + overcrit helpers in optimizer core
- native all-depth action availability precheck with simulated-variable propagation
- native completion/perfection cap getters in integration layer
- native crafting-variable seeding via `getVariablesFromCraftingEntity`
- guarded condition-transition provider via discovered `getNextCondition` path
- native alchemy max-toxicity fallback via `getMaxToxicity`

Still pending exposure:

- finalized post-modifier pool/stability cost preview helpers
- documented stable `getNextCondition` ModAPI symbol/path (guarded path probing currently active)
