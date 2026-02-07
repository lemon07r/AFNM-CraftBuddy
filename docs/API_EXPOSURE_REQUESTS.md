# API/Data Exposure Requests for Game Developer

This document lists game internals and API endpoints that would make the AFNM-CraftBuddy optimizer more accurate and maintainable. Each request includes the specific data/function, justification, and usage.

---

## Critical Priority

### 1. `evaluateScaling()` Function or Equivalent

| Field | Value |
|-------|-------|
| **Data/Function** | `evaluateScaling(scaling: Scaling, variables: ScalingVariables, defaultValue: number): number` |
| **Why Needed** | This is the core formula for calculating technique/buff effect amounts. Without access, the optimizer must reimplement it and may drift from game behavior when updates occur. |
| **How Used** | Calculate expected gains for any technique effect before applying it, ensuring optimizer predictions match actual game results. |

---

### 2. `calculateCraftingOvercrit()` Return Values

| Field | Value |
|-------|-------|
| **Data/Function** | `calculateCraftingOvercrit(critChance: number, critMultiplier: number): { multiplier: number, didCrit: boolean }` |
| **Why Needed** | The excess crit conversion (>100% → bonus multiplier at 1:3 ratio) is critical for high-realm accuracy. Currently reimplemented from source inspection. |
| **How Used** | Calculate expected critical hit multiplier for optimizer's expected value calculations. |

---

### 3. Recipe Condition Effect Type

| Field | Value |
|-------|-------|
| **Data/Function** | `recipeStats.conditionType.name` or equivalent identifier for condition effect type ('perfectable', 'fuseable', 'flowing', etc.) |
| **Why Needed** | Different condition types affect different stats (control vs intensity vs pool cost). The optimizer needs to know which type applies to choose optimal skills. |
| **How Used** | Determine which stat multipliers apply during positive/negative conditions for accurate gain predictions. |

---

### 4. Full Buff Definitions with Effect Arrays

| Field | Value |
|-------|-------|
| **Data/Function** | `entity.buffs[]` with complete `effects`, `onFusion`, `onRefine`, `onStabilize`, `onSupport` arrays |
| **Why Needed** | Many techniques create buffs with complex per-turn or per-action effects (e.g., Empower stacks, Pressure stacks). The optimizer needs these to simulate multi-turn strategies. |
| **How Used** | Accurately simulate buff effects during lookahead search to predict cumulative gains from buff-based strategies. |

---

## High Priority

### 5. Completion Bonus Current Stacks

| Field | Value |
|-------|-------|
| **Data/Function** | Current completion bonus stack count from the game state |
| **Why Needed** | Completion bonus provides +10% control per stack. The optimizer calculates this from completion/target, but having the exact value ensures accuracy. |
| **How Used** | Apply correct control bonus when calculating perfection gains from refine skills. |

---

### 6. Harmony Type Data (Sublime Crafts)

| Field | Value |
|-------|-------|
| **Data/Function** | `progressState.harmonyTypeData` for all harmony types (forge heat, alchemical combo history, pattern index, resonance strength) |
| **Why Needed** | Each harmony type has unique mechanics that significantly affect optimal strategy. |
| **How Used** | Track harmony state during simulation to predict buffs/debuffs from harmony systems. |

---

### 7. Actual Pool/Stability Cost After Modifiers

| Field | Value |
|-------|-------|
| **Data/Function** | Expose calculated costs after all modifiers (condition effects, buff percentages, mastery reductions) |
| **Why Needed** | Multiple modifiers stack multiplicatively. Having the final cost avoids reimplementing the stacking logic. |
| **How Used** | Accurately check if a technique can be used and calculate remaining resources after use. |

---

### 8. Technique Upgrade/Mastery Applied Values

| Field | Value |
|-------|-------|
| **Data/Function** | Pre-calculated mastery bonuses on `entity.techniques[]` (e.g., `technique.effectiveControlBonus`, `technique.effectiveCritBonus`) |
| **Why Needed** | Mastery system includes complex upgrade logic with percentage modifications. Having pre-calculated values is more reliable. |
| **How Used** | Apply correct mastery bonuses when calculating expected gains. |

---

## Medium Priority (Quality of Life)

### 9. Max Completion/Perfection Caps

| Field | Value |
|-------|-------|
| **Data/Function** | `getMaxCompletion(...)` and `getMaxPerfection(...)` return values |
| **Why Needed** | Game caps completion/perfection at certain values. Optimizer should know these caps to avoid recommending skills that would overshoot with no benefit. |
| **How Used** | Penalize or stop recommending completion/perfection skills once caps are approached. |

---

### 10. Condition Generation Algorithm State

| Field | Value |
|-------|-------|
| **Data/Function** | Harmony value and its effect on condition probabilities |
| **Why Needed** | For deep lookahead beyond the 3 visible conditions, predicting likely future conditions improves recommendations. |
| **How Used** | Weight expected gains by probability of favorable conditions in future turns. |

---

### 11. Technique Availability Pre-Check

| Field | Value |
|-------|-------|
| **Data/Function** | `canUseAction(technique, state)` result or equivalent |
| **Why Needed** | The full availability check includes edge cases (buff requirements, condition requirements, toxicity limits). Having a pre-check avoids reimplementing all conditions. |
| **How Used** | Filter available skills before running optimization search. |

---

### 12. Pill/Item Effect Previews

| Field | Value |
|-------|-------|
| **Data/Function** | Effect previews for consumable items during crafting |
| **Why Needed** | Items can significantly change optimal strategy (e.g., recovery pills for Qi). |
| **How Used** | Include item usage in optimization search when items are available. |

---

## Low Priority (Future Enhancement)

### 13. Training Mode Detection

| Field | Value |
|-------|-------|
| **Data/Function** | Flag indicating training mode vs real crafting |
| **Why Needed** | Training mode may have different consequences for failure. |
| **How Used** | Adjust risk tolerance in recommendations based on mode. |

---

### 14. Recipe Difficulty Calculation Inputs

| Field | Value |
|-------|-------|
| **Data/Function** | Expected control/intensity values used in `deriveRecipeDifficulty()` |
| **Why Needed** | Understanding how targets are calculated helps predict if character is over/under-geared for recipe. |
| **How Used** | Provide guidance on expected difficulty and suggest build improvements. |

---

## Summary Table

| Priority | Item | Key Benefit |
|----------|------|-------------|
| Critical | evaluateScaling() | Accurate effect calculations |
| Critical | calculateCraftingOvercrit() | High-realm crit accuracy |
| Critical | Condition effect type | Correct stat multipliers |
| Critical | Full buff definitions | Complex buff simulation |
| High | Completion bonus stacks | Control bonus accuracy |
| High | Harmony type data | Sublime craft optimization |
| High | Final costs after modifiers | Resource tracking |
| High | Mastery applied values | Mastery accuracy |
| Medium | Completion/perfection caps | Avoid overshoot |
| Medium | Condition generation state | Deep lookahead |
| Medium | Technique availability check | Filter reliability |
| Medium | Item effect previews | Item strategy |
| Low | Training mode flag | Risk adjustment |
| Low | Difficulty calculation inputs | Build guidance |

---

## Implementation Notes

If exposing these values is not feasible, the following alternatives would help:

1. **Versioned mechanics documentation** - Official docs describing formulas would allow accurate reimplementation.

2. **Debug/dev mode exports** - Even a dev-only mode that logs calculated values would help validate optimizer accuracy.

3. **Test crafting mode** - A sandbox mode where we can run crafting sequences and observe results would enable empirical validation.

The most critical need is accurate access to the scaling/gain calculation formulas, as these affect every skill recommendation.

---

## Developer Response (Feb 2026)

The game developer reviewed this document and provided the following resolution status.

### Already Available (confirmed by dev)

| Item | How to Access | Our Usage | Status |
|------|---------------|-----------|--------|
| Condition effect type | `recipeStats.conditionType` (full `RecipeConditionEffect` object with multipliers) | Cached from `onDeriveRecipeDifficulty` hook; real multipliers now passed directly to optimizer | **Working** |
| Full buff definitions | `entity.techniques[].effects` + `entity.buffs` | Read both in `convertGameTechniques()` and `extractBuffInfo()` | **Working** |
| Harmony type data | `modAPI.gameData.harmonyConfigs` (typed `Record<RecipeHarmonyType, HarmonyTypeConfig>`) | Referenced in debug logging only | **Not yet implemented** (future: simulate harmony for sublime crafts) |
| Mastery applied values | Crafting loadout / technique `mastery[]` arrays | Read via `extractMasteryData()` | **Working** |
| Condition generation state | `progressState.nextConditions` (2 conditions ahead) | Used for lookahead simulation | **Working** |
| Item effect previews | Defined on the item itself | Not implemented | **Future work** |

### Coming in modAPI (not yet available)

| Item | Benefit When Available |
|------|----------------------|
| `evaluateScaling()` | Replace our reimplementation; stay in sync with formula changes |
| `calculateCraftingOvercrit()` | Replace our overcrit reimplementation |
| Completion/perfection caps (`getMaxCompletion`/`getMaxPerfection`) | Avoid recommending skills past caps |
| Technique availability check (`canUseAction`) | Replace our availability reimplementation |

### Still Unknown to Dev (needs follow-up)

| Item | Our Current Approach | Question for Dev |
|------|---------------------|------------------|
| Completion bonus stacks | Read from `entity.buffs.find(b => b.name === 'Completion Bonus').stacks` | Is this buff name stable/reliable across versions? |
| Final costs after modifiers | Calculate ourselves using cost percentage modifiers + condition effects | Could be exposed for validation to catch stacking order bugs |

### Dev Notes

> "Condition effect, Full buff effects, Harmony effects -- I think should already be available through the mod api"

> Re: Difficulty calculation inputs -- "Not sure why you need this, `deriveRecipeDifficulty` gives you the results that matter"