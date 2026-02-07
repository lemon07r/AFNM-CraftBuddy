---
layout: default
title: Crafting Buff System
parent: Crafting System
nav_order: 1
description: 'Core concepts and mechanics of the AFNM crafting buff system'
---

# Crafting Buff System

Crafting buffs are temporary enhancements that modify your crafting statistics and capabilities during the crafting process. They are essential for overcoming difficult recipes and achieving high-quality results.

## Buff Structure

Every crafting buff follows the `CraftingBuff` interface:

```typescript
interface CraftingBuff {
  name: string; // Unique identifier
  icon: string; // Visual representation
  canStack: boolean; // Whether buff can stack

  // Stack management
  stacks: number; // Current stack count
  maxStacks?: number; // Maximum stack limit

  // Visual properties
  effectHint?: string; // Brief hint text
  tooltip?: string; // Custom description
  statsTooltip?: string; // Stats-specific tooltip
  displayLocation: CraftingBuffDisplayLocation; // Where buff appears in UI
  // Locations: 'none' | 'avatar' | 'stabilityLeft' | 'stabilityRight' |
  // 'perfectionLeft' | 'perfectionRight' | 'completionLeft' | 'completionRight'

  // Stat modifications
  stats: Partial<{ [key in CraftingStatistic]: Scaling }> | undefined;

  // Main effects that always trigger
  effects: CraftingBuffEffect[];

  // Technique-specific triggers
  onFusion?: CraftingBuffEffect[]; // Triggers on fusion techniques
  onRefine?: CraftingBuffEffect[]; // Triggers on refine techniques
  onStabilize?: CraftingBuffEffect[]; // Triggers on stabilize techniques
  onSupport?: CraftingBuffEffect[]; // Triggers on support techniques

  // Scaling properties
  baseScaling?: number; // Base scaling value
  stacksScaling?: number; // Per-stack scaling

  // Upgrade flag
  cantUpgrade?: boolean; // If true, cannot be upgraded
}
```

## Core Crafting Statistics

Buffs modify these key statistics:

- **Qi Intensity** (`intensity`) - Increases completion from fusion actions
- **Qi Control** (`control`) - Increases perfection from refine actions
- **Qi Pool** (`pool`) - Resource for using techniques
- **Stability** (`stability`) - Prevents craft failure
- **Crit Chance** (`critchance`) - Chance for enhanced effects
- **Pool Cost Multiplier** (`poolCostPercentage`) - Reduces qi costs
- **Stability Cost Multiplier** (`stabilityCostPercentage`) - Reduces stability loss
- **Action Success Chance** (`successChanceBonus`) - Improves technique success

## Buff Categories

### Stat Enhancement Buffs

Direct improvements to crafting statistics:

```typescript
export const empowerIntensity: CraftingBuff = {
  name: 'Empower Intensity',
  icon: intensityIcon,
  canStack: true,
  maxStacks: 10,
  stats: {
    intensity: { value: 0.15, stat: undefined, scaling: 'stacks' },
  },
  effects: [],
  stacks: 1,
};
```

### Cost Reduction Buffs

Lower resource consumption:

```typescript
export const skillfulManipulation: CraftingBuff = {
  name: 'Skillful Manipulation',
  icon: skillIcon,
  canStack: true,
  stats: {
    poolCostPercentage: { value: -0.2, stat: undefined },
  },
  effects: [
    {
      kind: 'addStack',
      stacks: { value: -1, stat: undefined }, // Loses stack per action
    },
  ],
  stacks: 3,
};
```

### Conditional Buffs

Activate under specific circumstances:

```typescript
export const fusionEnlightenment: CraftingBuff = {
  name: 'Fusion Enlightenment',
  icon: fusionIcon,
  onFusionEffects: [
    {
      kind: 'intensity',
      multiplier: 1.5,
    },
  ],
  condition: {
    kind: 'techniqueType',
    type: 'fusion',
  },
  stacks: 1,
};
```

### Resource Generation Buffs

Restore or preserve resources:

```typescript
export const gentleReenergisation: CraftingBuff = {
  name: 'Gentle Re-energisation',
  icon: energyIcon,
  canStack: true,
  effects: [
    {
      kind: 'pool',
      amount: { value: 5, stat: undefined },
    },
    {
      kind: 'addStack',
      stacks: { value: -1, stat: undefined }, // Loses stack per turn
    },
  ],
  stacks: 5,
};
```

## Buff Effect Types

Buffs can produce these effect types:

### Completion Effect

Advances craft completion:

```typescript
{ kind: 'completion', amount: { value: 10, stat: 'intensity' } }
```

### Perfection Effect

Improves item quality:

```typescript
{ kind: 'perfection', amount: { value: 5, stat: 'control' } }
```

### Stability Effect

Modifies current stability only (not maximum):

```typescript
{ kind: 'stability', amount: { value: 3, stat: undefined } }
```

**Important:** This restores/reduces your active stability pool without changing the cap.

### Max Stability Effect

Changes the maximum stability ceiling:

```typescript
{ kind: 'maxStability', amount: { value: 1, stat: undefined } }
```

**Important:** This modifies how much stability you can have total. Reducing max below current will force current down.

### Pool Effect

Restores qi pool:

```typescript
{ kind: 'pool', amount: { value: 10, stat: undefined } }
```

### Create Buff Effect

Generates other buffs:

```typescript
{ kind: 'createBuff', buff: otherBuff, stacks: { value: 2, stat: undefined } }
```

### Add Stack Effect

Modifies buff's own stacks:

```typescript
{ kind: 'addStack', stacks: { value: -1, stat: undefined } }
```

### Change Toxicity Effect

Modifies toxicity levels:

```typescript
{ kind: 'changeToxicity', amount: { value: -5, stat: undefined } }
```

### Negate Effect

Cancels other effects:

```typescript
{ kind: 'negate', condition: { kind: 'chance', percentage: 50 } }
```

## Buff Triggers

Buffs can activate through different trigger mechanisms:

### Main Effects

Always active effects that apply continuously or on specific conditions:

```typescript
effects: [
  {
    kind: 'stability',
    amount: { value: 2, stat: undefined },
  },
];
```

### On Fusion

Triggers specifically when fusion techniques are used:

```typescript
onFusion: [
  {
    kind: 'completion',
    amount: { value: 5, stat: undefined },
  },
];
```

### On Refine

Triggers specifically when refine techniques are used:

```typescript
onRefine: [
  {
    kind: 'perfection',
    amount: { value: 3, stat: undefined },
  },
];
```

### On Stabilize

Triggers specifically when stabilize techniques are used:

```typescript
onStabilize: [
  {
    kind: 'maxStability',
    amount: { value: 1, stat: undefined },
  },
];
```

### On Support

Triggers specifically when support techniques are used:

```typescript
onSupport: [
  {
    kind: 'createBuff',
    buff: focusBuff,
    stacks: { value: 2, stat: undefined },
  },
];
```

## Stack Management

Buffs can lose or gain stacks through their effects:

### Self-Consuming Effects

Buffs can reduce their own stacks through `addStack` effects:

```typescript
effects: [
  {
    kind: 'addStack',
    stacks: { value: -1, stat: undefined }, // Loses 1 stack
  },
];
```

### Technique-Triggered Consumption

Buffs can lose stacks when specific techniques are used:

```typescript
onFusion: [
  {
    kind: 'perfection',
    amount: { value: 10, stat: undefined },
  },
  {
    kind: 'addStack',
    stacks: { value: -1, stat: undefined }, // Consume on use
  },
];
```

## Buff Interactions

### Stacking Behavior

- **Additive stacking** - Each stack adds its full effect
- **Max stacks** - Prevents infinite accumulation
- **Non-stackable** - Only one instance can exist

### Buff Synergies

Some buffs work better together:

```typescript
// Focus buff enhances other techniques
export const focus: CraftingBuff = {
  name: 'Focus',
  icon: focusIcon,
  canStack: true,
  maxStacks: 20,
  stats: undefined,
  effects: [],
  // Consumed by powerful techniques for bonus effects
  stacks: 1,
};
```
