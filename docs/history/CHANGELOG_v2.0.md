---
title: Historical Changelog v2.0
status: historical
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: snapshot document from earlier branch phase
review_cycle_days: 365
related_files:
  - docs/project/MECHANICS_PARITY.md
---

> Historical snapshot. Do not treat this file as authoritative current-state documentation. For detailed game mechanics, see `docs/history/GAME_MECHANICS_ANALYSIS.md`.

# CraftBuddy v2.0 - Game-Accurate Mechanics Rewrite

## Summary

Rewrote the optimizer's core mechanics to match the authoritative game code (CraftingStuff). Focused on high-realm accuracy (90+ rounds).

## Key changes

1. **Critical hit formula** — game-accurate excess crit conversion (>100% crit chance converts to bonus multiplier at 1:3 ratio)
2. **Completion bonus system** — tracks bonus stacks (+10% control per stack, exponential 1.3x thresholds)
3. **Stability penalty system** — uses game's `initialMaxStability - stabilityPenalty` model instead of tracking `maxStability` directly
4. **Condition effects by recipe type** — 6 recipe types (Perfectable, Fuseable, Flowing, Energised, Stable, Fortuitous) with distinct stat modifiers
5. **Buff system expansion** — full buff definitions with effect arrays, stat modifiers, action-specific effects
6. **Cost calculation order** — condition multipliers → buff percentage modifiers → mastery reductions
7. **Performance optimizations** — adaptive beam width, iterative deepening, improved caching

## Files changed

| Area | Files |
| --- | --- |
| Core optimizer | `gameTypes.ts` (new), `state.ts`, `skills.ts`, `search.ts`, `index.ts` |
| Tests | `gameAccuracy.test.ts` (new) |
| Docs | `GAME_MECHANICS_ANALYSIS.md`, `MOD_ANALYSIS.md`, `API_EXPOSURE_REQUESTS.md` |

## Known limitations at time of writing

1. Harmony system: types implemented but not fully simulated in search
2. Complex per-turn buff effects: tracked but execution simplified
3. Item/pill effects: not in optimizer search
4. Training mode: not distinguished from real crafting
