---
layout: default
title: Buff System Overview
parent: Combat System
nav_order: 1
description: 'Core concepts and mechanics of the AFNM buff system'
---

# Buff System Overview

Buffs are the core of AFNM's combat system. They represent temporary effects, enhancements, debuffs, and resource pools that drive combat mechanics. Understanding buffs is essential because techniques primarily work by creating and manipulating buffs.

## Complete Buff Interface

```typescript
import { Buff, BuffEffect, Scaling } from 'afnm-types';

interface Buff {
  // Identity
  name: string; // Unique identifier displayed to players
  icon: string; // Image asset for visual representation

  // Stacking behavior
  canStack: boolean; // Whether multiple instances can exist
  stacks: number; // Current number of stacks
  maxStacks?: number; // Optional stack limit

  // Visual properties
  colour?: string; // Optional background color for buff icon
  effectHint?: string; // Brief description when tooltip isn't sufficient
  tooltip?: string; // Custom tooltip (auto-generated if omitted)
  combatImage?: CombatImage; // Visual effects during combat

  // Combat properties
  stats?: { [key: string]: Scaling }; // Passive stat modifications
  type?: TechniqueElement; // Element type for enhancement/affinity
  buffType?: string; // Grouping for modifyBuffGroup effects
  priority?: number; // Execution order (lower = earlier)

  // Effect timing
  onCombatStartEffects?: BuffEffect[]; // Once when combat begins
  onRoundStartEffects?: BuffEffect[]; // Start of each round
  onTechniqueEffects?: BuffEffect[]; // Before/after each technique
  onRoundEffects?: BuffEffect[]; // End of each round

  // Advanced mechanics
  interceptBuffEffects?: InterceptEffect[]; // Intercept other buff applications
  triggeredBuffEffects?: TriggeredEffect[]; // Respond to custom triggers
  condition?: BuffCondition; // When buff effects are active

  // Timing modifiers
  afterTechnique?: boolean; // onTechniqueEffects trigger after instead of before

  // System properties
  cantUpgrade?: boolean; // Prevent mastery upgrades
}
```

## Buff Lifecycle

Understanding when and how buffs execute is crucial for creating effective combat content:

### 1. Application Phase

When a buff is applied to a character, the system:

- Checks if the buff can stack with existing instances
- Applies any intercept effects from other buffs
- Updates the character's buff list

### 2. Execution Phase

During combat, buffs execute their effects based on timing:

- **Priority order**: Lower `priority` values execute first
- **Timing triggers**: Each timing type executes at its designated moment
- **Condition checks**: Effects only execute if conditions are met

### 3. Modification Phase

Buffs can be modified during combat:

- Stack counts can increase/decrease
- Effects can be intercepted or triggered
- Buffs can be consumed or negated

### 4. Cleanup Phase

Buffs are removed when:

- Stack count reaches zero (through `add` effects with negative values)
- Explicitly consumed by techniques or other buffs
- Combat ends (most buffs don't persist)

## Effect Timing

Buffs can trigger effects at different times during combat:

### `onCombatStartEffects`

Triggers once when combat begins. Used for setup effects.

### `onRoundStartEffects`

Triggers at the start of each round, before any techniques are used.

### `onTechniqueEffects`

Triggers before each technique use (default) or after if `afterTechnique: true`.

### `onRoundEffects`

Triggers at the end of each round, after all techniques have been used.

### Advanced Timing

- **`interceptBuffEffects`** - Intercepts when specific buffs are applied
- **`triggeredBuffEffects`** - Responds to custom trigger events. See [Triggers](triggers) for details
- **`priority`** - Controls execution order (lower numbers execute first)

## Real Examples

### Resource Buffer - Sunlight

```typescript
import { Buff } from 'afnm-types';
import sunIcon from '../assets/icons/sunlight.png';

export const sunlight: Buff = {
  name: 'Sunlight',
  icon: sunIcon,
  canStack: true,
  effectHint: 'Used to empower Celestial techniques',
  stats: {
    power: {
      value: 0.05,
      stat: 'power',
      scaling: 'stacks',
      max: { value: 1, stat: 'power' },
    },
  },
  onTechniqueEffects: [],
  onRoundEffects: [],
  stacks: 1,
  combatImage: {
    image: sunIcon,
    position: 'floating',
    entrance: 'rotate',
    stacksScale: 0.15,
  },
  cantUpgrade: true,
};
```

### Self-Consuming Effect - Moonchill

```typescript
import { Buff } from 'afnm-types';
import moonchillIcon from '../assets/icons/moonchill.png';

export const moonchill: Buff = {
  name: 'Moonchill',
  icon: moonchillIcon,
  type: 'celestial',
  canStack: true,
  stats: {
    power: { value: -0.3, stat: 'power' },
  },
  onTechniqueEffects: [
    {
      kind: 'add',
      amount: { value: -1, stat: undefined },
    },
  ],
  onRoundEffects: [],
  stacks: 1,
  cantUpgrade: true,
};
```

### Conditional Buff - Lunar Attunement

```typescript
import { Buff } from 'afnm-types';
import lunarAttunementIcon from '../assets/icons/lunar-attunement.png';

export const lunarAttunement: Buff = {
  name: 'Lunar Attunement',
  icon: lunarAttunementIcon,
  canStack: true,
  maxStacks: 10,
  condition: {
    kind: 'condition',
    condition: `${window.modAPI.utils.flag(moonlight.name)} > 0`,
    tooltip: 'If you have <name>Moonlight</name> then',
  },
  stats: {
    celestialBoost: {
      value: 5,
      stat: undefined,
      scaling: 'stacks',
      max: { value: 50, stat: undefined },
    },
  },
  onTechniqueEffects: [],
  onRoundEffects: [],
  stacks: 1,
  cantUpgrade: true,
};
```

### Healing Over Time - Restoring Fragrance

```typescript
import { Buff } from 'afnm-types';
import icon from '../assets/icons/restoring-fragrance.png';

const restoringFragranceBuff: Buff = {
  name: 'Restoring Fragrance',
  icon: icon,
  canStack: true,
  stats: undefined,
  type: 'blossom',
  afterTechnique: true,
  onTechniqueEffects: [
    {
      kind: 'heal',
      amount: { value: 0.25, stat: 'power', upgradeKey: 'power' },
    },
  ],
  onRoundEffects: [
    {
      kind: 'add',
      amount: { value: -1, stat: undefined },
    },
  ],
  stacks: 1,
};
```

## Stack Management

Buffs use different stacking behaviors:

### Standard Stacking

- `canStack: true` - Multiple instances combine their stacks
- `maxStacks` - Optional limit to prevent infinite stacking

### Non-Stacking

- `canStack: false` - Only one instance can exist
- Applying again refreshes or replaces the existing buff

## Conditions

Buffs can have conditional effects that only trigger under specific circumstances:

### Buff Conditions

```typescript
condition: {
  kind: 'buff',
  buff: targetBuff,
  count: 3,
  mode: 'more'
}
```

### HP Conditions

```typescript
condition: {
  kind: 'hp',
  percentage: 50,
  mode: 'less'
}
```

### Custom Conditions

```typescript
condition: {
  kind: 'condition',
  condition: 'custom_flag > 0',
  tooltip: 'When condition is met'
}
```

### Chance Conditions

```typescript
condition: {
  kind: 'chance',
  percentage: 30
}
```
