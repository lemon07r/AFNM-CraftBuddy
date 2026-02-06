# Ascend From Nine Mountains - Crafting Mechanics Analysis

**Source:** CraftingStuff game code bundle (authoritative)  
**Analysis Date:** February 2025  
**Purpose:** Reference document for AFNM-CraftBuddy optimizer

---

## Table of Contents
1. [Core State Model](#core-state-model)
2. [Turn Processing Sequence](#turn-processing-sequence)
3. [Crafting Statistics](#crafting-statistics)
4. [Effect Calculations & Formulas](#effect-calculations--formulas)
5. [Skill/Technique System](#skilltechnique-system)
6. [Buff System](#buff-system)
7. [Condition System](#condition-system)
8. [Harmony System (Sublime Crafts)](#harmony-system-sublime-crafts)
9. [Mastery System](#mastery-system)
10. [Recipe Difficulty Calculation](#recipe-difficulty-calculation)
11. [RNG Elements](#rng-elements)
12. [Action Usability Checks](#action-usability-checks)
13. [Complete Skill Reference](#complete-skill-reference)

---

## Core State Model

### CraftingState
The main state container for a crafting session:
```typescript
interface CraftingState {
  player?: CraftingEntity;         // The crafter entity
  recipe?: RecipeItem;             // The recipe being crafted
  recipeStats?: CraftingRecipeStats; // Derived difficulty stats
  progressState?: ProgressState;   // Current crafting progress
  consumedPills: number;           // Pills consumed this turn
  craftingLog: string[];           // Log of crafting events
  craftResult?: CraftingResult;    // Final result when complete
  trainingMode?: CraftingTrainingMode;
}
```

### ProgressState
Tracks the current state of the craft:
```typescript
interface ProgressState {
  completion: number;              // Progress toward completing the craft
  perfection: number;              // Progress toward perfecting the craft
  stability: number;               // Current stability (craft fails at 0)
  stabilityPenalty: number;        // Max stability reduction (increases each turn)
  condition: CraftingCondition;    // Current condition (neutral/positive/negative/etc)
  nextConditions: CraftingCondition[]; // Queue of upcoming conditions (3 ahead)
  harmony: number;                 // Harmony value (-100 to 100)
  harmonyTypeData?: HarmonyData;   // Sublime craft-specific data
  step: number;                    // Current turn number
  effectTracking: Record<string, CraftingEffectTracking>;
  actionTracking: Record<string, ActionTracking>;
  pillTracking: Record<string, number>;
  lastActionType?: CraftingTechniqueType;
}
```

### CraftingRecipeStats
Recipe difficulty parameters:
```typescript
interface CraftingRecipeStats {
  completion: number;              // Total completion needed
  perfection: number;              // Total perfection needed
  stability: number;               // Base max stability
  conditionType: RecipeConditionEffect; // Condition type effects
  harmonyType: RecipeHarmonyType;  // Harmony type for sublime crafts
}
```

---

## Turn Processing Sequence

When `executeTechnique` is called, the following sequence occurs:

### 1. Pre-Execution Setup
```typescript
// Track buffs present before technique execution
const buffsToProcess = new Set(entity.buffs.map(e => e.name));

// Execute the technique
doExecuteTechnique(technique, entity, recipe, progress, state);

// Increment cooldown
technique.currentCooldown++;

// Process turn
processTurn(entity, progress, state, recipe, technique, buffsToProcess);
```

### 2. Technique Execution (`doExecuteTechnique`)

#### a. Apply Toxicity Cost
```typescript
if (technique.toxicityCost) {
  entity.stats.toxicity += technique.toxicityCost;
}
```

#### b. Consume Buff Cost
```typescript
if (technique.buffCost) {
  consumeBuff(technique.buffCost.buff.name, technique.buffCost.amount, entity, state);
}
```

#### c. Calculate Success Chance
```typescript
let successChance = technique.successChance + (variables.successChanceBonus || 0);
conditionEffects.forEach(e => {
  if (e.kind === 'chance') {
    successChance += e.bonus;
  }
});
```

#### d. Apply Mastery Effects (Pre-Roll)
Before the success roll, mastery effects that modify stats are applied:
```typescript
switch (mastery.kind) {
  case 'control':
    variables.control *= 1 + mastery.percentage / 100;
    break;
  case 'intensity':
    variables.intensity *= 1 + mastery.percentage / 100;
    break;
  case 'critchance':
    variables.critchance += mastery.percentage;
    break;
  case 'critmultiplier':
    variables.critmultiplier += mastery.percentage;
    break;
  case 'effect':
    // Execute additional effects
    break;
}
```

#### e. Apply Pool Cost
```typescript
if (technique.poolCost > 0) {
  let cost = technique.poolCost;
  conditionEffects.forEach(e => {
    if (e.kind === 'pool') {
      cost = Math.floor(cost * e.multiplier);
    }
  });
  if (variables.poolCostPercentage) {
    cost = Math.floor((cost * variables.poolCostPercentage) / 100);
  }
  changePool(-cost, entity, animations, variables, effectTracking, recipe, state);
}
```

#### f. Apply Stability Cost
```typescript
if (technique.stabilityCost > 0) {
  changeStability(-technique.stabilityCost, variables, entity, progress, ...);
}
```

#### g. Success Roll
```typescript
if (successChance < 1) {
  const roll = Math.random();
  if (roll > successChance) {
    // Technique fails - no effects applied
    technique.currentCooldown = technique.cooldown;
    return;
  }
}
```

#### h. Execute Technique Effects
```typescript
for (const effect of technique.effects) {
  doExecuteTechniqueEffect(effect, entity, recipe, progress, state, variables, animations, effectTracking);
}
technique.currentCooldown = technique.cooldown;
```

### 3. Turn Processing (`processTurn`)

#### a. Decrement Cooldowns
```typescript
entity.techniques = entity.techniques.map(e => {
  if (e.currentCooldown > 0 || e.justClicked) {
    const newE = { ...e };
    newE.currentCooldown--;
    newE.justClicked = undefined;
    return newE;
  }
  return e;
});
```

#### b. Execute Buff Effects
```typescript
for (const buff of entity.buffs) {
  if (buffsToProcess.has(buff.name)) {
    doExecuteBuff(buff, entity, recipe, progress, state, technique.type);
  }
}
```

#### c. Process Harmony Type (Sublime Crafts)
```typescript
if (state.recipe?.isSublimeCraft) {
  const harmonyConfig = harmonyConfigs[state.recipeStats.harmonyType];
  harmonyConfig.processEffect(progress.harmonyTypeData, technique, progress, entity, state);
}
```

#### d. Advance Condition
```typescript
progress.condition = progress.nextConditions[0];
progress.nextConditions.shift();
progress.nextConditions.push(getNextCondition(progress));
```

#### e. Apply Max Stability Decay
```typescript
if (!technique.noMaxStabilityLoss) {
  progress.stabilityPenalty++;
}
progress.stabilityPenalty = Math.ceil(progress.stabilityPenalty);
if (progress.stabilityPenalty > recipe.stability) {
  progress.stabilityPenalty = recipe.stability;
}
```

#### f. Clamp Values
```typescript
// Stability clamping
progress.stability = Math.floor(progress.stability);
if (progress.stability < 0) progress.stability = 0;
if (progress.stability > recipe.stability - progress.stabilityPenalty) {
  progress.stability = recipe.stability - progress.stabilityPenalty;
}

// Perfection clamping
progress.perfection = Math.floor(progress.perfection);
if (progress.perfection < 0) progress.perfection = 0;
if (progress.perfection > maxPerfection) progress.perfection = maxPerfection;

// Completion clamping
progress.completion = Math.floor(progress.completion);
if (progress.completion < 0) progress.completion = 0;
if (progress.completion > maxCompletion) progress.completion = maxCompletion;

// Pool clamping
entity.stats.pool = Math.floor(entity.stats.pool);
if (entity.stats.pool < 0) entity.stats.pool = 0;
if (entity.stats.pool > variables.maxpool) entity.stats.pool = variables.maxpool;

// Harmony clamping
if (progress.harmony < -100) progress.harmony = -100;
if (progress.harmony > 100) progress.harmony = 100;
```

#### g. Update Completion Bonus
```typescript
const completionBonus = getBonusAndChance(progress.completion, recipeStats.completion);
if (completionBonus.guaranteed > 1) {
  // Add 'Completion Bonus' buff with (guaranteed - 1) stacks
  // Provides +10% control per stack
}
```

#### h. Increment Step
```typescript
progress.step++;
```

---

## Crafting Statistics

### Core Stats
```typescript
const craftingStatistics = [
  'maxpool',           // Maximum Qi pool
  'pool',              // Current Qi pool
  'maxtoxicity',       // Maximum toxicity
  'toxicity',          // Current toxicity
  'resistance',        // Toxicity resistance (reduces toxicity gains)
  'itemEffectiveness', // Item effectiveness bonus
  'control',           // Base perfection scaling
  'intensity',         // Base completion scaling
  'critchance',        // Critical hit chance (%)
  'critmultiplier',    // Critical hit multiplier (%)
  'pillsPerRound',     // Items usable per action
  'poolCostPercentage',      // Pool cost modifier (100 = normal)
  'stabilityCostPercentage', // Stability cost modifier (100 = normal)
  'successChanceBonus',      // Flat success chance bonus
] as const;
```

### Stat Calculation (`getActualStat`)
Stats are calculated by:
1. Start with base entity stat
2. Add buff stat contributions (using `evaluateScaling`)
3. Apply condition multipliers

```typescript
export const getActualStat = (stat, entity, condition, recipeConditionEffect, progress, recipeStats) => {
  let value = entity.stats[stat];
  
  // Add buff contributions
  for (const buff of entity.buffs) {
    const scaling = buff.stats?.[stat];
    if (scaling) {
      const rawVal = evaluateScaling(scaling, { ...variables, stacks: buff.stacks }, 1);
      
      // Percentage stats multiply
      if (stat === 'poolCostPercentage' || stat === 'stabilityCostPercentage') {
        value = Math.floor((value / 100) * (rawVal / 100) * 100);
      } else {
        value += rawVal;
      }
    }
  }
  
  // Apply condition effects
  const conditionEffects = recipeConditionEffect.conditionEffects[condition].effects;
  if (stat === 'control') {
    conditionEffects.forEach(e => {
      if (e.kind === 'control') value *= 1 + e.multiplier;
    });
  }
  // Similar for intensity, stabilityCostPercentage, poolCostPercentage
  
  return value;
};
```

---

## Effect Calculations & Formulas

### Completion/Perfection Gains

The base formula for gains:
```typescript
amount = evaluateScaling(effect.amount, variables, 1);
```

Where `evaluateScaling` computes:
```typescript
// Basic formula:
result = value * (stat ? variables[stat] : 1)

// With scaling variable:
result *= variables[scaling]

// With equation:
result *= evalExpNoFloor(eqn, variables)

// With custom scaling:
result *= 1 + (customScaling.multiplier * variables[customScaling.scaling])

// With additive equation:
result += evalExpNoFloor(additiveEqn, variables)

// With max capping:
if (max) result = Math.min(result, evaluateScaling(max, variables, 1))
```

### Critical Hit System
```typescript
export const calculateCraftingOvercrit = (critChance, critMultiplier) => {
  // Excess crit chance (>100%) converts to bonus multiplier at 1:3 ratio
  const excessCritChance = Math.max(0, critChance - 100);
  const bonusCritMultiplier = excessCritChance * 3;
  const effectiveCritMultiplier = critMultiplier + bonusCritMultiplier;
  
  // Roll for crit
  const actualCritChance = Math.min(critChance, 100);
  const didCrit = Math.random() * 100 < actualCritChance;
  
  const multiplier = didCrit ? effectiveCritMultiplier / 100 : 1;
  return { multiplier, critCount: didCrit ? 1 : 0, didCrit };
};
```

**Key insight:** Positive completion/perfection gains roll for crits; negative amounts do NOT crit.

### Stability Cost Calculation
```typescript
let actualCost = amount; // negative value

if (variables.stabilityCostPercentage) {
  actualCost = Math.ceil((amount * variables.stabilityCostPercentage) / 100);
}

conditionEffects.forEach(e => {
  if (e.kind === 'stability') {
    actualCost = Math.floor(actualCost * e.multiplier);
  }
});

progress.stability += actualCost;
```

### Pool Cost Calculation
```typescript
let cost = technique.poolCost;

conditionEffects.forEach(e => {
  if (e.kind === 'pool') {
    cost = Math.floor(cost * e.multiplier);
  }
});

if (variables.poolCostPercentage) {
  cost = Math.floor((cost * variables.poolCostPercentage) / 100);
}

entity.stats.pool -= cost;
```

### Bonus Threshold Formula (Completion/Perfection)
```typescript
const EXPONENTIAL_SCALING_FACTOR = 1.3;

export const getBonusAndChance = (value, target) => {
  let currentTarget = target;
  let remainingValue = value;
  let guaranteed = 0;
  
  while (remainingValue > 0 && currentTarget > 0 && remainingValue >= currentTarget) {
    remainingValue -= currentTarget;
    guaranteed++;
    currentTarget = Math.floor(currentTarget * EXPONENTIAL_SCALING_FACTOR);
  }
  
  const bonusChance = remainingValue / currentTarget;
  const nextThreshold = value + (currentTarget - remainingValue);
  
  return { guaranteed, bonusChance, nextThreshold };
};
```

**Example:** If target = 100:
- 0-99: 0 guaranteed, X% chance
- 100-129: 1 guaranteed (next threshold at 130)
- 130-168: 2 guaranteed (next threshold at 169)
- And so on...

---

## Skill/Technique System

### Technique Structure
```typescript
interface CraftingTechnique {
  name: string;
  icon: string;
  poolCost: number;              // Qi pool cost
  toxicityCost?: number;         // Toxicity cost
  stabilityCost: number;         // Stability cost
  noMaxStabilityLoss?: boolean;  // If true, doesn't reduce max stability
  successChance: number;         // Base success chance (0-1)
  cooldown: number;              // Turns until usable again
  buffCost?: { buff: CraftingBuff; amount: number };  // Buff stacks consumed
  conditionRequirement?: CraftingCondition;           // Required condition
  buffRequirement?: { buff: CraftingBuff; amount: number }; // Required buff stacks
  effects: CraftingTechniqueEffect[];  // Effects on use
  type: CraftingTechniqueType;   // fusion/refine/stabilize/support
  realm: Realm;                  // Minimum realm to use
  mastery?: CraftingTechniqueMastery[];  // Mastery bonuses
  upgradeMasteries?: {...};      // Upgrade system
  currentCooldown: number;       // Current cooldown counter
}
```

### Technique Types
```typescript
type CraftingTechniqueType = 'fusion' | 'refine' | 'stabilize' | 'support';
```

### Effect Types
```typescript
type CraftingTechniqueEffect =
  | { kind: 'completion'; amount: Scaling }
  | { kind: 'perfection'; amount: Scaling }
  | { kind: 'stability'; amount: Scaling }
  | { kind: 'maxStability'; amount: Scaling }
  | { kind: 'pool'; amount: Scaling }
  | { kind: 'createBuff'; buff: CraftingBuff; stacks: Scaling }
  | { kind: 'consumeBuff'; buff: CraftingBuff; stacks: Scaling }
  | { kind: 'cleanseToxicity'; amount: Scaling };
```

---

## Buff System

### Buff Structure
```typescript
interface CraftingBuff {
  name: string;
  icon: string;
  canStack: boolean;
  maxStacks?: number;
  stats?: Partial<{ [key in CraftingStatistic]: Scaling }>;  // Stat modifiers
  effects: CraftingBuffEffect[];      // Effects every turn
  onFusion?: CraftingBuffEffect[];    // Effects on fusion action
  onRefine?: CraftingBuffEffect[];    // Effects on refine action
  onStabilize?: CraftingBuffEffect[]; // Effects on stabilize action
  onSupport?: CraftingBuffEffect[];   // Effects on support action
  stacks: number;
  displayLocation: CraftingBuffDisplayLocation;
}
```

### Buff Effect Types
```typescript
type CraftingBuffEffect =
  | { kind: 'completion'; amount: Scaling }
  | { kind: 'perfection'; amount: Scaling }
  | { kind: 'stability'; amount: Scaling }
  | { kind: 'maxStability'; amount: Scaling }
  | { kind: 'pool'; amount: Scaling }
  | { kind: 'negate' }                // Removes the buff
  | { kind: 'createBuff'; buff: CraftingBuff; stacks: Scaling }
  | { kind: 'addStack'; stacks: Scaling }  // Add/remove stacks from self
  | { kind: 'changeToxicity'; amount: Scaling };
```

### Buff Execution Order
1. Execute `effects` array (always)
2. Execute type-specific array (`onFusion`/`onRefine`/`onStabilize`/`onSupport`)

---

## Condition System

### Condition Types
```typescript
type CraftingCondition = 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative';
```

**Display Names:**
- neutral → Balanced
- positive → Harmonious
- negative → Resistant
- veryPositive → Brilliant
- veryNegative → Corrupted

### Condition Generation Algorithm
```typescript
export const getNextCondition = (progress: ProgressState): CraftingCondition => {
  const negativeDelta = progress.harmony < 0 ? Math.abs(progress.harmony) / 100 : 0;
  const positiveDelta = progress.harmony > 0 ? Math.abs(progress.harmony) / 100 : 0;
  
  const lastCondition = progress.nextConditions[progress.nextConditions.length - 1];
  
  // veryPositive/veryNegative always followed by neutral
  if (lastCondition === 'veryPositive' || lastCondition === 'veryNegative') {
    return 'neutral';
  }
  
  // positive can upgrade to veryPositive
  if (lastCondition === 'positive') {
    const upgradeChance = 0.3 * positiveDelta;
    return Math.random() < upgradeChance ? 'veryPositive' : 'neutral';
  }
  
  // negative can upgrade to veryNegative
  if (lastCondition === 'negative') {
    const upgradeChance = 0.3 * negativeDelta;
    return Math.random() < upgradeChance ? 'veryNegative' : 'neutral';
  }
  
  // Determine if we should change from neutral
  let changeCondition = false;
  if (progress.condition === 'neutral' && 
      progress.nextConditions.every(c => c === 'neutral')) {
    changeCondition = true;
  } else {
    let neutralCount = 0;
    for (let i = progress.nextConditions.length - 1; i >= 0; i--) {
      if (progress.nextConditions[i] === 'neutral') neutralCount++;
      else break;
    }
    changeCondition = Math.random() < neutralCount * (0.15 + 0.15 * Math.max(negativeDelta, positiveDelta));
  }
  
  if (!changeCondition) return 'neutral';
  
  // Harmony determines positive vs negative
  const positiveChance = (progress.harmony + 100) / 200;
  return Math.random() < positiveChance ? 'positive' : 'negative';
};
```

### Recipe Condition Effects

Different recipes have different condition types with varying effects:

#### Perfectable (Control)
- positive: +50% Qi Control
- negative: -50% Qi Control
- veryPositive: +100% Qi Control
- veryNegative: -100% Qi Control

#### Fuseable (Intensity)
- positive: +50% Qi Intensity
- negative: -50% Qi Intensity
- veryPositive: +100% Qi Intensity
- veryNegative: -100% Qi Intensity

#### Flowing (Insight)
- positive: +25% both Control and Intensity
- negative: -25% both Control and Intensity
- veryPositive: +50% both
- veryNegative: -50% both

#### Energised (Pool)
- positive: -30% Pool Cost
- negative: +30% Pool Cost
- veryPositive: -60% Pool Cost
- veryNegative: +60% Pool Cost

#### Stable (Stability)
- positive: -30% Stability Cost
- negative: +30% Stability Cost
- veryPositive: -60% Stability Cost
- veryNegative: +60% Stability Cost

#### Fortuitous (Chance)
- positive: +25% Success Chance
- negative: -25% Success Chance
- veryPositive: +50% Success Chance
- veryNegative: -50% Success Chance

---

## Harmony System (Sublime Crafts)

Sublime crafts use special harmony mechanics. There are 4 types:

### 1. Forge Works
Maintain heat between 4-6 for bonuses.

**Mechanics:**
- Fusion actions: +2 heat
- All other actions: -1 heat
- Heat range: 0-10

**Effects by Heat:**
| Heat | Harmony | Stat Effect |
|------|---------|-------------|
| 0 | -20 | -1000% Control |
| 1-3 | -10 | -50% Control |
| **4-6** | **+10** | **+50% Control & Intensity** |
| 7-9 | -10 | -50% Intensity |
| 10 | -20 | -1000% Intensity |

### 2. Alchemical Arts
Combine 3 action types for combo effects.

**Valid Combos:**
| Combo | Effect |
|-------|--------|
| Fusion + Refine + Support | -25% Stability Cost |
| Fusion + Refine + Refine | +25% Intensity |
| Fusion + Fusion + Refine | +25% Control |
| Fusion + Refine + Stabilize | +25% Crit Chance |
| Refine + Refine + Support | -25% Pool Cost |
| Refine + Stabilize + Support | +25% Success Chance |

- Valid combo: +20 Harmony, apply buff
- Invalid combo: -20 Harmony, -25% Control debuff

### 3. Inscribed Patterns
Follow a pattern of action types.

**Pattern per block:** Stabilize, Support, Fusion, Refine, Refine

**Mechanics:**
- Correct action: +10 Harmony, +1 stack
- Wrong action: -20 Harmony, stacks halved, +1 stability penalty, -25 pool
- Stack buff: +2% Control and +2% Intensity per stack

### 4. Spiritual Resonance
Build resonance by repeating the same action type.

**Mechanics:**
- Same type as current resonance: +1 strength, +(3 × strength) Harmony
- Different type (1st): -9 Harmony, -3 Stability, -1 strength
- Different type (2nd consecutive): Changes resonance type (no penalty)
- Buff: +3% Crit Chance and +3% Success Chance per strength

---

## Mastery System

Masteries provide technique-specific upgrades based on rarity tiers.

### Rarity Tiers
```typescript
const rarities = ['mundane', 'qitouched', 'empowered', 'resplendent', 'incandescent', 'transcendent'];
```

### Mastery Types
```typescript
type CraftingTechniqueMastery =
  | { kind: 'control'; percentage: number }      // +% to control for this technique
  | { kind: 'intensity'; percentage: number }    // +% to intensity for this technique
  | { kind: 'critchance'; percentage: number }   // +% crit chance for this technique
  | { kind: 'critmultiplier'; percentage: number } // +% crit multiplier
  | { kind: 'effect'; effects: CraftingTechniqueEffect[] } // Additional effects
  | { kind: 'poolcost'; change: number }         // Pool cost reduction
  | { kind: 'stabilitycost'; change: number }    // Stability cost reduction
  | { kind: 'successchance'; change: number }    // Success chance bonus
  | { kind: 'upgrade'; upgradeKey: string; change: number; shouldMultiply?: boolean };
```

### Standard Effect Upgrades
Most techniques use these standard upgrade percentages:
```typescript
{
  mundane: 5%,
  qitouched: 10%,
  empowered: 15%,
  resplendent: 20%,
  incandescent: 25%,
  transcendent: 30%
}
```

### Mastery Application
Masteries are applied **before** the success roll during technique execution. The `upgrade` kind modifies the base values of the technique's `Scaling` objects.

---

## Recipe Difficulty Calculation

### Base Formula
```typescript
const deriveRecipeDifficulty = (recipe, gameFlags) => {
  const realmIndex = realms.indexOf(realm) + realmProgressMult[realmProgress] - 1;
  
  const craftSkillMult = getRealmCraftSkillMult(realm, realmProgress);
  let masteryBonus = 1 + realmIndex * 0.2;
  if (realms.indexOf(realm) >= realms.indexOf('coreFormation')) {
    masteryBonus += 0.4;
  }
  
  const expectedControl = getScaledStat(realm, realmProgress, expectedControlPerMeridian) 
                          * craftSkillMult * masteryBonus;
  const expectedIntensity = getScaledStat(realm, realmProgress, expectedIntensityPerMuscle) 
                            * craftSkillMult * masteryBonus;
  
  const steps = 6;
  let actualSteps = steps * difficultyStepMult(difficulty) 
                    * (1 + (realms.indexOf(realm) - 1) * 0.4)
                    + (expectedPool / 29) * 0.75 * realmDifficultyMult[realm];
  
  // Bonus steps from pool
  const bonusPoolFromSteps = (actualSteps / 4) * 20;
  const bonusSteps = bonusPoolFromSteps / 29;
  actualSteps += bonusSteps;
  
  const totalCompletion = expectedIntensity * actualSteps * 0.1;
  const totalPerfection = expectedControl * actualSteps * 0.1;
  
  return {
    stability: steps * 10,
    completion: Math.floor(totalCompletion * 0.5) * 10,
    perfection: Math.floor(totalPerfection * 0.5) * 10,
    conditionType,
    harmonyType
  };
};
```

### Difficulty Multipliers
```typescript
const difficultyStepMult = {
  'easy': 1,
  'medium': 1.4,
  'hard': 1.5,
  'veryhard': 1.7,
  'veryhard+': 2.75,
  'extreme': 3.7
};
```

### Realm Difficulty Multipliers
```typescript
const realmDifficultyMult = {
  mundane: 0.9,
  bodyForging: 1.1,
  meridianOpening: 1.35,
  qiCondensation: 1.7,
  coreFormation: 2.2,
  pillarCreation: 4,
  lifeFlourishing: 5,
  worldShaping: 6.2,
  innerGenesis: 7.6,
  soulAscension: 9
};
```

---

## RNG Elements

### Critical Hits
- **Chance:** `min(critChance, 100)%`
- **Excess crit:** Converts to bonus multiplier at 1:3 ratio
- **Only positive gains can crit**

### Success Rolls
- Techniques with `successChance < 1` roll each use
- Condition effects can modify success chance
- Success chance bonuses from buffs apply

### Condition Generation
- Uses `Math.random()` for:
  - Whether to change from neutral
  - Positive vs negative direction
  - Upgrade to very positive/negative

### Harmony System RNG
- Some harmony types involve no additional RNG
- Effect timing is deterministic based on action sequence

---

## Action Usability Checks

```typescript
export const canUseAction = (technique, variables, poolCost, condition) => {
  const hasPool = poolCost === 0 || variables['pool'] >= poolCost;
  const hasBuff = !technique.buffCost || 
                  variables[technique.buffCost.buff.name] >= technique.buffCost.amount;
  const hasCondition = !technique.conditionRequirement || 
                       condition === technique.conditionRequirement;
  const hasRequiredBuff = !technique.buffRequirement || 
                          variables[technique.buffRequirement.buff.name] >= technique.buffRequirement.amount;
  const hasToxicity = !technique.toxicityCost || 
                      variables.maxtoxicity - variables.toxicity >= technique.toxicityCost;
  
  return (
    technique.currentCooldown <= 0 &&
    hasPool &&
    hasBuff &&
    hasCondition &&
    hasRequiredBuff &&
    hasToxicity &&
    variables.stability > 0
  );
};
```

---

## Complete Skill Reference

### Basic Actions (Body Forging)

| Skill | Type | Pool | Stab | Success | Cooldown | Effect |
|-------|------|------|------|---------|----------|--------|
| Simple Fusion | fusion | 0 | 10 | 100% | 0 | 1.0×Intensity completion |
| Simple Refine | refine | 18 | 10 | 100% | 0 | 1.0×Control perfection |
| Forceful Stabilize | stabilize | 88 | 0 | 100% | 0 | +40 stability (no max loss) |
| Energised Fusion | fusion | 10 | 10 | 100% | 0 | 1.8×Intensity completion |
| Rapid Fusion | fusion | 0 | 10 | 65% | 0 | 2.5×Intensity completion |
| Unstable Refine | refine | 0 | 10 | 60% | 0 | 2.0×Control perfection |

### Condition Actions

| Skill | Condition | Type | Pool | Stab | Effect |
|-------|-----------|------|------|------|--------|
| Siphon Qi | positive | support | 0 | 5 | +30 pool |
| Repurpose Qi | negative | support | 0 | 5 | +35 pool |
| Harmonious Stabilize | positive | stabilize | 0 | 0 | +20 stability (no max loss) |
| Harmonious Refine | positive | refine | 7 | 10 | 2.0×Control perfection |
| Harmonious Fusion | positive | fusion | 7 | 10 | 2.0×Intensity completion |
| Brilliant Refine | veryPositive | refine | 20 | 5 | 3.5×Control + buff |
| Brilliant Fusion | veryPositive | fusion | 20 | 5 | 3.5×Intensity + buff |
| Brilliant Respite | veryPositive | support | 0 | 15 | +20% maxpool |

### Focus System

| Skill | Type | Pool | Stab | Requirement | Effect |
|-------|------|------|------|-------------|--------|
| Focus | support | 10 | 1 | - | +1 Focus stack (no max loss) |
| Focused Fusion | fusion | 5 | 5 | 1 Focus (cost) | 2.1×Intensity completion |
| Focused Refine | refine | 12 | 5 | 1 Focus (cost) | 1.7×Control perfection |
| Focused Recirculation | support | 0 | 5 | 2 Focus (cost) | +pool based on completion% |
| Focused Stabilization | stabilize | 35 | 0 | 5+ Focus | Consume all Focus, +5 stab/stack, +2 max stab |
| Enhancing Focus | support | 38 | 5 | 1+ Focus | Double Focus stacks |
| Focused Opposition | support | 0 | 5 | 3 Focus (cost) | +13% maxpool |

### Delayed Actions

| Skill | Type | Pool | Stab | Cooldown | Effect |
|-------|------|------|------|----------|--------|
| Delayed Fusion | fusion | 8 | 5 | 4 | Creates buff: after 4 turns → 2.2×Intensity + -1 max stab |
| Delayed Refine | refine | 18 | 5 | 4 | Creates buff: after 4 turns → 1.5×Control + -1 max stab |
| Suspended Fusion | fusion | 12 | 5 | 8 | Creates buff: after 8 turns → 3.5×Intensity + -1 max stab |
| Suspended Refine | refine | 22 | 5 | 8 | Creates buff: after 8 turns → 3.0×Control + -1 max stab |
| Suspended Stabilize | stabilize | 111 | 0 | 8 | Creates buff: after 8 turns → +40 stab + +1 max stab |
| Cascading Refine | refine | 20 | 5 | 15 | 1×Control + buff that triggers at 5/10/15 turns |

### Buff Actions

| Skill | Type | Pool | Stab | Cooldown | Effect |
|-------|------|------|------|----------|--------|
| Empower Intensity | support | 18 | 10 | 6 | 6 stacks: +0.5×Intensity per stack, -1/turn |
| Empower Control | support | 18 | 10 | 6 | 6 stacks: +0.5×Control per stack, -1/turn |
| Skillful Manipulation | support | 50 | 10 | 10 | 10 stacks: 75% stability cost, -1/fusion or refine |
| Resourceful Manipulation | support | 56 | 10 | 10 | 10 stacks: 75% pool cost, -1/fusion or refine |
| False Fusion | support | 50 | 10 | ∞ | +1×Intensity (only if >100% completion) |
| Strive for Perfection | support | 60 | 10 | ∞ | +1×Control (only if >100% perfection) |
| Gentle Stabilize | stabilize | 96 | 0 | 8 | 8 stacks: +5 stability/turn, -1 stack/turn |
| Gentle Re-energisation | support | 0 | 10 | 10 | 10 stacks: +5 pool/turn, -1 stack/turn |

### Pressure System

| Skill | Type | Pool | Stab | Requirement | Effect |
|-------|------|------|------|-------------|--------|
| Inducing Pressure | support | 18 | 0 | - | +1 Pressure stack (130% stab cost, +5% control/intensity per stack, +1 on fusion) |
| Pressurized Forging | fusion | 20 | 8 | 1+ Pressure | 0.65× completion/perfection + +1 Pressure |
| Rapid Release | stabilize | 0 | 0 | 1+ Pressure | +4 stab/Pressure, +10 max stab, consume all |
| High Pressure Forging | support | 30 | 5 | 1+ Pressure | 9 stacks buff: +1% success +1% crit per Pressure |
| Explosive Release | support | 55 | 0 | 1+ Pressure | 0.65×/Pressure completion/perfection, consume all stability |

### Insight System

| Skill | Type | Pool | Stab | Requirement | Effect |
|-------|------|------|------|-------------|--------|
| Crafter's Knowledge | support | 18 | 0 | - | +1 Insight (+10% control/stack, 140% pool cost, +1/refine) |
| Insightful Refinement | refine | 8 | 10 | 5+ Insight | 2.0×Control perfection |
| Insightful Finale | refine | 15 | 10 | 1+ Insight | 0.3×Control/Insight, consume all |
| Insightful Restoration | support | 0 | 5 | 1+ Insight | +20 pool/Insight, consume all |
| Seek Insight | refine | 20 | 10 | 1+ Insight | 0.7×Control + +1 Insight |

### Risky Actions

| Skill | Type | Pool | Stab | Success | Effect |
|-------|------|------|------|---------|--------|
| Rapid Fusion | fusion | 0 | 10 | 65% | 2.5×Intensity |
| Explosive Fusion | fusion | 0 | 10 | 50% | 5.0×Intensity |
| Unstable Refine | refine | 0 | 10 | 60% | 2.0×Control |
| Explosive Refinement | refine | 0 | 10 | 40% | 3.0×Control |
| Desperate Stabilize | stabilize | 0 | 10 | 50% | +30 stability (no max loss) |
| Unstable Re-energisation | support | 0 | 5 | 50% | +50 pool |

### Special/Utility

| Skill | Type | Pool | Stab | Effect |
|-------|------|------|------|--------|
| Wait | support | 0 | 10 | No effect (advance turn) |
| Fairy's Blessing | support | 0 | 5 | +50% maxpool (one-time) |

---

## Key Insights for Optimizer

1. **Max Stability Decay:** Every action (except those with `noMaxStabilityLoss`) reduces max stability by 1. This is the fundamental turn limit.

2. **Buff Timing:** Buffs execute their effects AFTER the technique, before turn processing completes.

3. **Condition Visibility:** Players can see 3 conditions ahead, allowing planning.

4. **Crit Only on Positive:** Completion/perfection gains can crit; costs and negative effects cannot.

5. **Stack Multiplication:** Many buffs use `scaling: 'stacks'` which multiplies the effect by the buff's stack count.

6. **Harmony Matters for Sublime:** Harmony affects condition generation probability, making positive conditions more/less likely.

7. **Pool Cost Modifiers Stack Multiplicatively:** Multiple pool cost percentage effects multiply together.

8. **Success Chance Has Multiple Sources:** Base technique + condition effect + buff bonuses + mastery.

9. **Delayed Actions Trade Efficiency for Planning:** They provide better value but require surviving long enough.

10. **High Realms = More Turns:** Higher realm crafts have more stability (more max stability = more turns), requiring deeper planning.