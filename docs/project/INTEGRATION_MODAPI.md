---
title: Mod API Integration
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/modContent/index.ts
review_cycle_days: 21
related_files:
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
  - docs/project/OPEN_QUESTIONS.md
---

# Mod API Integration

## Role

`src/modContent/index.ts` is the adapter from game runtime objects to optimizer input/output.

## Responsibilities

- read live crafting state and recipe data
- normalize techniques/masteries/buffs into optimizer action definitions
- collect condition effects and forecasted conditions
- seed optimizer state with native variable snapshots when available
- register guarded native provider seams (availability + condition transitions)
- pass harmony/training mode fields to optimizer config/state
- map settings to search config
- update overlay UI and debug surface

## Data source priority

1. direct game/Redux state when present
2. hook-provided payloads (for recipe/condition context)
3. controlled DOM-derived fallback
4. local cache fallback (for resilience on mid-craft restoration)

## Known fallback paths

Fallback handling exists for targets/progress extraction, condition transitions, and optional payload fields when game objects are incomplete.

## Migration targets (still pending game API exposure)

- finalized post-modifier pool/stability cost preview helpers
- documented stable `getNextCondition` ModAPI symbol/path (guarded path probing currently active)

## Guardrail

Any new extraction/fallback logic must be centralized here (do not duplicate extraction logic across optimizer modules).
