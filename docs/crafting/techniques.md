---
layout: default
title: Crafting Technique System
parent: Crafting System
nav_order: 6
description: 'Core concepts and structure of the AFNM crafting technique system'
---

# Crafting Technique System

Crafting techniques are the primary actions used during the crafting process to transform materials into finished items. Each technique serves a specific purpose and consumes resources while advancing the craft toward completion.

## Basic Structure

Every crafting technique is defined by the `CraftingTechnique` interface:

```typescript
interface CraftingTechnique {
  name: string; // Display name
  icon: string; // Visual representation
  type: CraftingTechniqueType; // fusion, refine, stabilize, or support
  realm: Realm; // Minimum cultivation level
  tooltip?: string; // Custom description

  // Resource costs
  poolCost: number; // Qi pool cost
  stabilityCost: number; // Stability cost
  toxicityCost?: number; // Optional toxicity gain
  buffCost?: { buff: CraftingBuff; amount: number };

  // Requirements and restrictions
  successChance: number; // Base success rate (0-100)
  cooldown: number; // Turns before reuse
  conditionRequirement?: CraftingCondition;
  buffRequirement?: { buff: CraftingBuff; amount: number };

  // Effects
  effects: CraftingTechniqueEffect[];

  // Mastery system
  upgradeMasteries?: { [key: string]: CraftingTechniqueMasteryRarityMap };
}
```

## Technique Types

There are **four core technique types**, each serving a distinct purpose:

### Fusion

- **Purpose**: Increases completion progress toward finishing the item
- **Scaling**: Progress scales with Qi Intensity stat
- **Visual**: Green-tinted techniques
- **Strategic use**: Focus on these to complete crafts quickly

### Refine

- **Purpose**: Increases perfection progress for higher quality
- **Scaling**: Progress scales with Qi Control stat
- **Visual**: Cyan-tinted techniques
- **Strategic use**: Balance with fusion for quality items

### Stabilize

- **Purpose**: Restores stability or creates stability buffs
- **Scaling**: Often fixed amounts or based on current stability
- **Visual**: Orange-tinted techniques
- **Strategic use**: Prevent craft failure from stability loss

### Support

- **Purpose**: Creates buffs and utility effects
- **Scaling**: Varies by specific buff created
- **Visual**: Purple-tinted techniques
- **Strategic use**: Set up powerful combinations

## Resource Costs

### Qi Pool Cost

The primary resource consumed by all techniques:

```typescript
poolCost: 20; // Base cost in qi
```

- Modified by **Qi Pool Cost Multiplier** stat
- Can be reduced through mastery upgrades
- Running out prevents technique use

### Stability Cost

Risk factor for each technique:

```typescript
stabilityCost: 5; // Stability lost on use
```

**Current Stability vs Max Stability:**

- **Current Stability**: The active stability pool that decreases with technique use
- **Max Stability**: The upper limit for current stability
- When current stability reaches 0, the craft fails
- When using a technique, max stability usually decrease by 1
- The `noMaxStabilityLoss` flag prevents max stability reduction (only current decreases)

**Modifiers:**

- Modified by **Stability Cost Multiplier** stat
- Some buffs restore current stability without affecting max
- Other effects specifically target max stability

### Toxicity Cost

Accumulation from certain techniques:

```typescript
toxicityCost: 10; // Toxicity gained
```

- Primarily from pill-related techniques
- Accumulates over multiple crafts
- High toxicity causes negative effects

### Buff Cost

Some techniques consume buff stacks:

```typescript
buffCost: {
  buff: focusBuff,
  amount: 3
}
```

## Success Mechanics

### Base Success Chance

Each technique has a success rate:

```typescript
successChance: 0.8; // 80% base success rate (0.0 to 1.0)
```

- Value ranges from 0 (always fails) to 1 (always succeeds)
- Modified by **Action Success Chance** stat bonus
- Failed techniques still consume resources
- Some risky techniques have rates as low as 0.4 (40%)

### Cooldown System

Prevents technique spam:

```typescript
cooldown: 3; // Cannot use for 3 turns
```

- Tracked per technique
- Some buffs can reduce cooldowns
- Strategic planning required for technique rotation

## Requirements

### Condition Requirements

Techniques may require specific recipe conditions:

```typescript
conditionRequirement: 'positive'; // Only usable when Harmonious
```

**Condition states:**

- `neutral` - Balanced
- `positive` - Harmonious
- `negative` - Resistant
- `veryPositive` - Brilliant
- `veryNegative` - Corrupted

### Buff Requirements

Need specific buffs active:

```typescript
buffRequirement: {
  buff: concentrationBuff,
  amount: 5
}
```

## Effect Types

Techniques produce various effects on the crafting process:

### Completion Effect

Advances craft progress:

```typescript
{
  kind: 'completion',
  amount: { value: 15, stat: 'intensity' },
  condition?: techniqueCondition
}
```

### Perfection Effect

Improves item quality:

```typescript
{
  kind: 'perfection',
  amount: { value: 10, stat: 'control' }
}
```

### Stability Effect

Restores or reduces current stability (not max):

```typescript
{
  kind: 'stability',
  amount: { value: 8, stat: undefined } // Positive = restore, negative = reduce
}
```

**Note:** This only affects current stability. Your max stability remains unchanged.

### Max Stability Effect

Modifies the maximum stability cap:

```typescript
{
  kind: 'maxStability',
  amount: { value: 2, stat: undefined } // Positive = increase cap, negative = reduce cap
}
```

**Note:** This changes your stability ceiling. If max decreases below current, current is reduced to match.

### Pool Effect

Restores qi pool:

```typescript
{
  kind: 'pool',
  amount: { value: 10, stat: undefined }
}
```

### Create Buff Effect

Grants crafting buffs:

```typescript
{
  kind: 'createBuff',
  buff: empowerIntensityBuff,
  amount: { value: 3, stat: undefined }
}
```

### Consume Buff Effect

Removes buff stacks:

```typescript
{
  kind: 'consumeBuff',
  buff: targetBuff,
  amount: { value: 2, stat: undefined }
}
```

### Cleanse Toxicity Effect

Reduces accumulated toxicity:

```typescript
{
  kind: 'cleanseToxicity',
  amount: { value: 5, stat: undefined }
}
```

## Mastery System

Techniques improve through mastery tiers:

### Mastery Tiers

1. **Mundane** - Base technique
2. **Qi-touched** - Minor improvements
3. **Empowered** - Significant upgrades
4. **Resplendent** - Major enhancements
5. **Incandescent** - Powerful modifications
6. **Transcendent** - Ultimate mastery

### Upgrade Types

#### Effect Upgrades

Increase completion/perfection amounts:

```typescript
upgradeMasteries: {
  completion: createCompletionUpgradeMap('completion', 'empowered', 5);
}
```

#### Cost Reductions

Lower resource consumption:

```typescript
upgradeMasteries: {
  poolCost: createCostUpgradeMap('cost', 'empowered', -5);
}
```

#### Success Improvements

Higher success rates:

```typescript
upgradeMasteries: {
  success: createSuccessUpgradeMap('success', 'empowered', 10);
}
```
