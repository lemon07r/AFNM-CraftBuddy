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
  - docs/project/ROADMAP.md
---

> Historical snapshot. Do not treat this file as authoritative current-state documentation.

# CraftBuddy v2.0 - Game-Accurate Mechanics Rewrite

## Summary

This update rewrites the optimizer's core mechanics to match the authoritative game code (CraftingStuff). The changes focus on high-realm accuracy (90+ rounds) and correct implementation of complex game systems.

## Key Changes

### 1. Critical Hit Formula (NEW)

**Before:** Simple expected value: `1 + critChance * (critMult - 1)`

**After:** Game-accurate formula with excess crit conversion:
- Crit chance above 100% converts to bonus multiplier at 1:3 ratio
- Example: 150% crit chance with 150% base multiplier → 300% effective multiplier
- Significantly impacts high-realm characters with >100% crit

```typescript
// Excess crit (>100%) converts to bonus multiplier at 1:3 ratio
const excessCritChance = Math.max(0, critChance - 100);
const bonusCritMultiplier = excessCritChance * 3;
const effectiveCritMultiplier = critMultiplier + bonusCritMultiplier;
```

### 2. Completion Bonus System (NEW)

**Before:** Not tracked

**After:** Tracks completion bonus stacks that provide +10% control per stack:
- Uses exponential scaling factor (1.3x) for bonus thresholds
- Each threshold exceeded adds +10% control to perfection gains
- Critical for high-realm crafts where completion often exceeds target by 2-3x

### 3. Stability Penalty System (FIXED)

**Before:** Tracked `maxStability` directly

**After:** Uses game's penalty system:
- `initialMaxStability` from recipe
- `stabilityPenalty` accumulates each turn (unless skill prevents decay)
- `maxStability = initialMaxStability - stabilityPenalty`

### 4. Condition Effects by Recipe Type (NEW)

**Before:** Single `controlCondition` multiplier

**After:** Full condition effect system supporting 6 recipe types:
- **Perfectable**: Control ±50%/100%
- **Fuseable**: Intensity ±50%/100%
- **Flowing**: Both Control & Intensity ±25%/50%
- **Energised**: Pool Cost ±30%/60%
- **Stable**: Stability Cost ±30%/60%
- **Fortuitous**: Success Chance ±25%/50%

### 5. Buff System Expansion (IMPROVED)

**Before:** Simple stack tracking

**After:** Full buff definition support:
- Buff effects arrays (`effects`, `onFusion`, `onRefine`, etc.)
- Stat modifiers from buffs
- Proper buff consumption and stack management

### 6. Cost Calculation Order (FIXED)

**Before:** Mastery reductions only

**After:** Game-accurate stacking:
1. Apply condition multipliers
2. Apply buff percentage modifiers (`poolCostPercentage`, `stabilityCostPercentage`)
3. Apply mastery reductions

### 7. Performance Optimizations (NEW)

Added for high-realm scenarios with 90+ rounds:
- **Adaptive beam width**: Narrows beam for deeper searches
- **Iterative deepening**: Start shallow, deepen incrementally
- **Improved caching**: Better normalization for large progress values
- **Increased budgets**: 200ms time, 100k nodes default

## Files Changed

### Core Optimizer Files

| File | Changes |
|------|---------|
| `src/optimizer/gameTypes.ts` | NEW - Game-accurate type definitions and utility functions |
| `src/optimizer/state.ts` | MAJOR - New state model with stabilityPenalty, completionBonus, buffs |
| `src/optimizer/skills.ts` | MAJOR - Accurate gain calculations with condition effects |
| `src/optimizer/search.ts` | IMPROVED - Performance optimizations, condition effects integration |
| `src/optimizer/index.ts` | Updated exports |

### Documentation

| File | Description |
|------|-------------|
| `docs/GAME_MECHANICS_ANALYSIS.md` | Comprehensive game mechanics reference |
| `docs/MOD_ANALYSIS.md` | Gap analysis between old mod and game code |
| `docs/API_EXPOSURE_REQUESTS.md` | Requests for game developer |
| `docs/CHANGELOG_v2.0.md` | This file |

### Tests

| File | Description |
|------|-------------|
| `src/__tests__/gameAccuracy.test.ts` | NEW - Tests validating game-accurate mechanics |

## Validation

All 182 tests pass, including:
- Original tests (159)
- New game accuracy tests (23)

Key validation scenarios:
- Critical hit excess conversion
- Completion bonus tiers
- Condition effect multipliers for all 6 recipe types
- Stability penalty tracking
- High-realm scenarios with large stat values

## Backwards Compatibility

Legacy API maintained:
- `maxStability` parameter still accepted (converted to `initialMaxStability`)
- `buffStacks` parameter still accepted (converted to `buffs` map)
- `controlCondition` number parameter still accepted (converted to condition effects)

## Known Limitations

1. **Harmony System**: Partial support. Heat/combo/pattern/resonance tracking implemented in types but not fully simulated in search.

2. **Buff Effect Simulation**: Complex per-turn buff effects (like Empower stacks decaying) are tracked but effect execution is simplified.

3. **Item/Pill Effects**: Not included in optimizer search.

4. **Training Mode**: Not distinguished from real crafting.

## How to Test

```bash
# Run all tests
bun run test

# Run game accuracy tests specifically
bun run jest src/__tests__/gameAccuracy.test.ts

# Build the mod
bun run build
```

## Migration Notes

If you have custom code that uses the optimizer:

1. Replace `maxStability` with `initialMaxStability` (backwards compatible but deprecated)
2. Replace `buffStacks` with `buffs` Map (backwards compatible but deprecated)
3. Update `applySkill` calls to use `ConditionEffect[]` instead of `number`
4. Consider using `getConditionEffectsForConfig()` to get proper condition effects