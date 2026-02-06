# CraftBuddy Mod Analysis - Issues and Fixes

## Summary of Key Discrepancies

After comparing the mod implementation with the authoritative game source (CraftingStuff), these critical issues were identified:

### 1. **Scaling Formula Differences**

**Mod Implementation:**
```typescript
// Simple multiplier * stat
completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, intensity));
```

**Game Implementation (evaluateScaling):**
```typescript
// Multi-stage scaling with optional modifiers:
result = value * (stat ? variables[stat] : 1)  // Base scaling
       * (scaling ? variables[scaling] : 1)     // Variable scaling (e.g., stacks)
       * (equation ? evalExpNoFloor(eqn, vars) : 1)  // Custom equation
       * (customScaling ? 1 + mult * vars[scale] : 1) // Custom multiplier
       + (additiveEqn ? evalExpNoFloor(additiveEqn, vars) : 0) // Additive bonus
result = Math.min(result, max ? evaluateScaling(max, vars, 1) : result) // Max cap
```

**Impact:** Buffs that use `scaling: 'stacks'` or custom equations are calculated incorrectly.

---

### 2. **Critical Hit System**

**Mod Implementation:**
```typescript
// Expected value model (EV)
const expectedCritFactor = 1 + effectiveCritChance * (effectiveCritMultiplier - 1);
```

**Game Implementation:**
```typescript
// Excess crit (>100%) converts to bonus multiplier at 1:3 ratio
const excessCritChance = Math.max(0, critChance - 100);
const bonusCritMultiplier = excessCritChance * 3;
const effectiveCritMultiplier = critMultiplier + bonusCritMultiplier;
// Only positive gains can crit
```

**Impact:** High-realm characters with high crit chance (>100%) have incorrect expected value calculations.

---

### 3. **Buff Execution Order**

**Mod Implementation:**
- Decrements buff turns BEFORE using buffs for gains
- Disciplined Touch explicitly clears buffs after

**Game Implementation:**
1. Execute technique effects (including buff costs)
2. Execute buff effects AFTER technique
3. Buff type-specific effects (onFusion, onRefine, etc.)
4. Turn processing (cooldowns, condition advance, etc.)
5. Buff expiry happens at turn processing

**Impact:** Buffs may provide their benefits for the wrong number of turns.

---

### 4. **Stack-Based Buff System**

**Mod Implementation:**
- Basic `buffStacks: Map<string, number>` tracking
- Limited understanding of buff effects

**Game Implementation:**
```typescript
interface CraftingBuff {
  effects: CraftingBuffEffect[];      // Execute every turn
  onFusion?: CraftingBuffEffect[];    // On fusion action
  onRefine?: CraftingBuffEffect[];    // On refine action
  onStabilize?: CraftingBuffEffect[]; // On stabilize action  
  onSupport?: CraftingBuffEffect[];   // On support action
  stats?: Partial<{ [key in CraftingStatistic]: Scaling }>;
}
```

**Impact:** Complex buff effects (Empower, Focus, Pressure, Insight systems) are not simulated correctly.

---

### 5. **Condition System Complexity**

**Mod Implementation:**
- Reads condition multiplier from game (controlCondition)
- Applies to control-scaling skills

**Game Implementation:**
- 7 condition effect types with different stat modifications:
  - Perfectable: Control ±50%/100%
  - Fuseable: Intensity ±50%/100%
  - Flowing: Both Control/Intensity ±25%/50%
  - Energised: Pool Cost ±30%/60%
  - Stable: Stability Cost ±30%/60%
  - Fortuitous: Success Chance ±25%/50%
  
**Impact:** Non-control condition types may have incorrect multipliers.

---

### 6. **Harmony System (Sublime Crafts)**

**Mod Implementation:**
- Basic `isSublimeCraft` flag
- `targetMultiplier` for scoring

**Game Implementation:**
4 distinct harmony systems with unique mechanics:

| Type | Mechanic |
|------|----------|
| Forge Works | Heat 0-10 (fusion +2, others -1), optimal 4-6 |
| Alchemical Arts | 3-action combos (6 valid patterns) |
| Inscribed Patterns | Pattern matching with stacks |
| Spiritual Resonance | Same-type streaks with strength |

**Impact:** Optimizer cannot properly simulate sublime craft mechanics.

---

### 7. **Mastery Effects**

**Mod Implementation:**
```typescript
interface SkillMastery {
  controlBonus?: number;
  intensityBonus?: number;
  poolCostReduction?: number;
  stabilityCostReduction?: number;
  successChanceBonus?: number;
  critChanceBonus?: number;
  critMultiplierBonus?: number;
}
```

**Game Implementation:**
```typescript
type CraftingTechniqueMastery =
  | { kind: 'control'; percentage: number }
  | { kind: 'intensity'; percentage: number }
  | { kind: 'critchance'; percentage: number }
  | { kind: 'critmultiplier'; percentage: number }
  | { kind: 'effect'; effects: CraftingTechniqueEffect[] }  // ADDITIONAL EFFECTS!
  | { kind: 'poolcost'; change: number }
  | { kind: 'stabilitycost'; change: number }
  | { kind: 'successchance'; change: number }
  | { kind: 'upgrade'; upgradeKey: string; change: number; shouldMultiply?: boolean };
```

**Impact:** Masteries that add effects or use the upgrade system are not handled.

---

### 8. **Completion Bonus System**

**Mod Implementation:** Not implemented

**Game Implementation:**
```typescript
// After each turn, check if completion exceeds threshold
const EXPONENTIAL_SCALING_FACTOR = 1.3;
const completionBonus = getBonusAndChance(progress.completion, recipeStats.completion);
if (completionBonus.guaranteed > 1) {
  // Add 'Completion Bonus' buff: +10% control per stack
}
```

**Impact:** Late-game crafts where completion exceeds 130%+ of target get significant control bonuses that the optimizer doesn't account for.

---

### 9. **Pool Cost Calculation Order**

**Mod Implementation:**
```typescript
effectiveQiCost = skill.qiCost - (mastery.poolCostReduction || 0);
```

**Game Implementation:**
```typescript
let cost = technique.poolCost;
// 1. Apply condition multiplier
conditionEffects.forEach(e => {
  if (e.kind === 'pool') cost = Math.floor(cost * e.multiplier);
});
// 2. Apply poolCostPercentage (from buffs)
if (variables.poolCostPercentage) {
  cost = Math.floor((cost * variables.poolCostPercentage) / 100);
}
// Mastery reductions applied earlier at technique level
```

**Impact:** Pool cost reductions may be calculated in wrong order.

---

### 10. **Max Stability vs Stability Penalty**

**Mod Implementation:**
- Tracks `maxStability` directly

**Game Implementation:**
- `stabilityPenalty` accumulates each turn
- Current max = `recipeStats.stability - progress.stabilityPenalty`

**Impact:** Conceptually similar but may cause drift if initial stability differs.

---

## Priority Fixes Required

### Critical (Breaking Accuracy):
1. **Buff effect system** - Stack buffs with per-action effects
2. **Crit formula** - Excess crit conversion
3. **Scaling formula** - Stack-based scaling and equations
4. **Completion bonus tracking** - Control bonus from completion

### High (Significant Impact):
5. **Condition type handling** - All 7 effect types
6. **Buff execution order** - When buffs apply
7. **Mastery effect/upgrade kinds** - Additional effects

### Medium (Sublime Crafts):
8. **Harmony system simulation** - 4 harmony types
9. **Harmony value tracking** - Affects condition generation

### Performance:
10. **Deep lookahead optimization** - For 90+ round crafts