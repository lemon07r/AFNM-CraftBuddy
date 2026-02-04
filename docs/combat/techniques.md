---
layout: default
title: Technique System
parent: Combat System
nav_order: 6
description: 'Core concepts and structure of the AFNM technique system'
---

# Technique System

Techniques are active combat abilities that players use to deal damage, apply buffs, and manipulate resources. Unlike buffs which have ongoing effects, techniques execute their effects immediately when used.

## Complete Technique Interface

```typescript
import {
  Technique,
  TechniqueEffect,
  TechniqueCost,
  TechniqueRequirement,
} from 'afnm-types';

interface Technique {
  // Identity
  name: string; // Display name
  icon: string; // Visual representation
  type: TechniqueElement; // School/element type
  realm?: Realm; // Minimum cultivation level
  tooltip?: string; // Custom description (auto-generated if omitted)

  // Resource costs (consumed when used)
  costs?: TechniqueCost[]; // Buff stacks to consume
  toxicityCost?: number; // Toxicity granted when used
  dropletCost?: number; // Special resource cost

  // Requirements (must be met but not consumed)
  requirements?: TechniqueRequirement[]; // Conditions for usage

  // Usage restrictions
  maxInstances?: number; // Uses per stance (default: 3)
  stanceRestriction?: 'opener' | 'finisher'; // Position in stance sequence

  // Effects and mechanics
  effects: TechniqueEffect[]; // What happens when used
  triggeredEffects: { trigger: string, effects: TechniqueEffect[] }[]; // Effects that can be triggered by the base effects
  enhancement?: number; // Bonus from element matching
  secondaryType?: TechniqueElement | 'origin'; // Additional element

  // Mastery system
  upgradeMasteries?: { [key: string]: TechniqueMasteryRarityMap }; // Fixed upgrades
  masteryKindPools?: TechniqueEffectKind[]; // Random upgrade pools
}
```

## Element Types

The `type` field determines which cultivation school the technique belongs to:

### Primary Schools

- **`'celestial'`** - Sun/moon duality, light/shadow manipulation
- **`'blood'`** - Life force manipulation, corruption mechanics
- **`'blossom'`** - Nature-based, growth and healing effects
- **`'fist'`** - Martial arts, momentum and flow
- **`'weapon'`** - Tool-based combat, metal manipulation
- **`'cloud'`** - Storm effects, weather manipulation

### Special Types

- **`'none'`** - Universal techniques not tied to any school
- **`secondaryType`** - Additional element for dual-school techniques

Element types affect:

- **Enhancement scaling** - Techniques gain bonuses from matching element buffs
- **Affinity calculations** - Damage/healing modified by element affinity
- **School identity** - Each school has distinct mechanical themes

## Realm

The `realm` field sets the realm of technique crystals this technique will drop from, and where its sorted in the various menus:

```typescript
realm: 'bodyForging'; // Available from Body Forging realm
realm: 'coreFormation'; // Requires Core Formation or higher
```

- **Purpose**: Organises techniques based on expected acquisition time
- **Balance**: Higher realms generally have more complex/powerful techniques that take advantage of longer stance lengths
- **Optional**: If omitted, technique is not dropped from technique crystals, and must be acquire through some other means

## Resource Costs

Techniques can consume various resources when used:

### Buff Costs

The most common cost type - consumes buff stacks:

```typescript
costs: [
  {
    buff: fragrantBlossom,     // Buff object to consume
    amount: 4,                 // Stacks required
    upgradeKey?: 'cost'        // Can be reduced through mastery
  }
]
```

**Example from Restoring Fragrance:**

```typescript
costs: [
  {
    buff: fragrantBlossom,
    amount: 4,
    upgradeKey: 'cost', // Mastery can reduce to 3 stacks
  },
];
```

### Toxicity Costs

Direct toxicity increases:

```typescript
toxicityCost: 15; // Grants 15 toxicity when used
```

### Droplet Costs

Special resource for unique techniques:

```typescript
dropletCost: 1; // Consume 1 droplet when used
```

**Use cases:**

- Rare or ultimate techniques
- Cross-school abilities
- Special progression rewards

## Requirements

Requirements must be met for the technique to be usable, but aren't consumed:

```typescript
requirements: [
  {
    buff: requiredBuff,        // Buff that must be present
    amount: 3,                 // Minimum stacks needed
    mode?: 'more',             // 'more', 'less', or 'equal' (default 'more')
    upgradeKey?: 'requirement' // Can be modified through mastery
  }
]
```

**Use cases:**

- **Setup requirements**: Need specific buffs active before use
- **Conditional access**: Technique only available in certain states
- **Scaling effects**: Higher requirements for more powerful versions

## Usage Restrictions

### Maximum Instances

Limits how many times a technique can be used per stance:

```typescript
maxInstances: 1; // Can only be used once per stance
```

**Use cases:**

- Powerful techniques
- Setup abilities that shouldn't be spammed
- Weaker techniques that would benefit from more than the usual 3 instances

### Stance Restrictions

Controls when in a stance sequence the technique can be used:

```typescript
stanceRestriction: 'opener'; // Must be first technique in stance
stanceRestriction: 'finisher'; // Must be last technique in stance
```

**Strategic implications:**

- **Openers**: Set up resources/conditions for the stance
- **Finishers**: Capitalize on resources built during the stance
- **Flexible**: No restriction allows use anywhere in sequence

## Effect Types

Techniques use similar effect types to buffs but execute immediately:

### Damage Effects

#### `damage`

Deal damage to the enemy:

```typescript
{
  kind: 'damage',
  amount: { value: 0.9, stat: 'power' },
  hits?: { value: 2, stat: undefined },
  damageType?: 'true' | 'corrupt' | 'disruption'
}
```

#### `damageSelf`

Deal damage to yourself:

```typescript
{
  kind: 'damageSelf',
  amount: { value: 0.05, stat: 'maxhp' },
  damageType?: 'true'
}
```

### Healing and Protection

#### `heal`

Restore health:

```typescript
{
  kind: 'heal',
  amount: { value: 0.8, stat: 'power' },
  hits?: { value: 1, stat: undefined }
}
```

#### `barrier`

Grant damage absorption:

```typescript
{
  kind: 'barrier',
  amount: { value: 0.9, stat: 'power' },
  hits?: { value: 1, stat: undefined }
}
```

### Buff Management

#### `buffSelf`

Grant a buff to yourself:

```typescript
{
  kind: 'buffSelf',
  buff: targetBuff,
  amount: { value: 2, stat: undefined },
  hits?: { value: 1, stat: undefined },
  hideBuff?: true
}
```

#### `consumeSelf`

Remove a buff from yourself:

```typescript
{
  kind: 'consumeSelf',
  buff: targetBuff,
  amount: { value: 1, stat: undefined },
  hideBuff?: true
}
```

#### `buffTarget`

Give a buff to the enemy:

```typescript
{
  kind: 'buffTarget',
  buff: debuffBuff,
  amount: { value: 3, stat: undefined },
  hits?: { value: 1, stat: undefined }
}
```

#### `consumeTarget`

Remove a buff from the enemy:

```typescript
{
  kind: 'consumeTarget',
  buff: enemyBuff,
  amount: { value: 2, stat: undefined }
}
```

### Resource Manipulation (Technique-Specific)

#### `convertSelf`

Transform one buff type into another:

```typescript
{
  kind: 'convertSelf',
  source: sourceBuff,
  target: targetBuff,
  amount: { value: 1, stat: undefined, scaling: 'stacks' }
}
```

**Use case**: Resource transformation mechanics like celestial sun/moon cycling.

#### `mergeSelf`

Combine multiple stacks from one buff into fewer of another:

```typescript
{
  kind: 'mergeSelf',
  source: sourceBuff,
  sourceStacks: { value: 2, stat: undefined },
  target: targetBuff,
  targetStacks: { value: 1, stat: undefined }
}
```

**Use case**: Efficiency techniques that condense resources.

### Utility Effects

#### `cleanseToxicity`

Modify toxicity levels:

```typescript
{
  kind: 'cleanseToxicity',
  amount: { value: 10, stat: undefined }  // Positive removes, negative adds
}
```

#### `modifyBuffGroup`

Adds/removes stacks to all buffs of a specific group:

```typescript
{
  kind: 'modifyBuffGroup',
  group: 'celestial', // Must be defined as the 'buffType' field of the buff
  amount: { value: 1, stat: undefined }
}
```

#### `trigger`

Fire custom events for other systems:

```typescript
{
  kind: 'trigger',
  triggerKey: 'celestialRotation',
  amount: { value: 1, stat: undefined },
  triggerTooltip?: 'Explanation of the trigger' // Will appear in its own sub-tooltip to the side of the main one
}
```

## Conditional Effects

Effects can have conditions that determine when they execute:

### Buff Conditions

```typescript
condition: {
  kind: 'buff',
  buff: requiredBuff,
  count: 5,
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
  condition: 'custom_flag > 0'
}
```

### Chance Conditions

```typescript
condition: {
  kind: 'chance',
  percentage: 30
}
```

## Multiple Hits

Many effects support the `hits` parameter for repeated application:

### Fixed Hits

```typescript
hits: { value: 3, stat: undefined }     // Always 3 hits
```

### Scaling Hits

```typescript
hits: { value: 1, scaling: 'stacks' }   // 1 hit per stack of something
```

### Capped Scaling

```typescript
hits: {
  value: 0.5,                           // 1 hit per 2 stacks
  scaling: 'bloodCorruption',
  max: { value: 5, stat: undefined }    // Maximum 5 hits
}
```

## Triggered Effects

Certain effects can be configured to only trigger if the main effects (those in the `effects` array) emit a specific trigger. This can hook off any trigger that can be produced (see the [Triggers](triggers) docs for more details).

Note, triggered effects are not supported by automatic tooltip generation so require a custom tooltp to be written. See [Tooltips](tooltips) for details.

### Extra effect when healing to full

```typescript
effects: [{
  kind: "heal",
  amount: {
    value: 2,
    stat: "power"
  }
}],
triggeredEffects: [{
  trigger: "fullHeal", // When this techniques heals the player to full, gain an additional barrier
  effects: [{
    kind: "barrier",
    amount: {
      value: 1,
      stat: "power"
    }
  }]
}]
```

## Complete Examples

### Simple Damage Technique - Advancing Fist

```typescript
import { Technique } from 'afnm-types';
import icon from '../assets/techniques/advancing-fist.png';

export const advancingFist: Technique = {
  name: 'Advancing Fist',
  icon: icon,
  type: 'fist',
  realm: 'bodyForging',
  effects: [
    {
      kind: 'damage',
      amount: { value: 0.9, stat: 'power', upgradeKey: 'power' },
    },
    {
      kind: 'barrier',
      amount: { value: 0.9, stat: 'power', upgradeKey: 'barrier' },
    },
    {
      kind: 'buffSelf',
      buff: window.modAPI.gameData.techniqueBuffs.fist.flow,
      amount: { value: 1, stat: undefined, upgradeKey: 'stacks' },
    },
  ],
};
```

**Analysis:**

- **Basic technique**: No costs or requirements, usable from Body Forging
- **Multi-effect**: Deals damage, grants barrier, generates Flow resource
- **Upgradeable**: All three effects can be improved through mastery

### Resource Management - Restoring Fragrance

```typescript
import { Technique } from 'afnm-types';
import icon from '../assets/techniques/restoring-fragrance.png';

export const restoringFragrance: Technique = {
  name: 'Restoring Fragrance',
  icon: icon,
  type: 'blossom',
  realm: 'coreFormation',
  costs: [
    {
      buff: window.modAPI.gameData.techniqueBuffs.blossom.fragrantBlossom,
      amount: 4,
      upgradeKey: 'cost',
    },
  ],
  effects: [
    {
      kind: 'buffSelf',
      buff: { 
        // Buff implementation...
      },
      amount: { value: 1, stat: undefined, upgradeKey: 'stacks' },
    },
  ],
};
```

**Analysis:**

- **Resource cost**: Consumes 4 Fragrant Blossom stacks
- **Higher realm**: Requires Core Formation
- **Buff creation**: Creates a healing-over-time buff
- **Cost reduction**: Mastery can reduce resource cost

### Conditional Toggle - Profane Exchange

```typescript
import { Technique, Buff } from 'afnm-types';
import icon from '../assets/techniques/profane-exchange.png';

const profaneExchangeBuff: Buff = {
  // Buff implementation...
}

export const profaneExchange: Technique = {
  name: 'Profane Exchange',
  icon: icon,
  type: 'blood',
  realm: 'meridianOpening',
  effects: [
    {
      kind: 'buffSelf',
      buff: profaneExchangeBuff,
      condition: {
        kind: 'condition',
        condition: `original_${window.modAPI.utils.flag(profaneExchangeBuff.name)} == 0`,
      },
      amount: { value: 1, stat: undefined },
    },
    {
      kind: 'consumeSelf',
      buff: profaneExchangeBuff,
      condition: {
        kind: 'condition',
        condition: `original_${window.modAPI.utils.flag(profaneExchangeBuff.name)} == 1`,
      },
      amount: { value: 1, stat: undefined },
    },
  ],
};
```

**Analysis:**

- **Toggle behavior**: First use applies buff, second use removes it
- **Conditional effects**: Each effect only executes under specific conditions
- **State-dependent**: Same technique does different things based on current state

### Resource Conversion - Sunrise

```typescript
import { Technique } from 'afnm-types';
import icon from '../assets/techniques/sunrise.png';

export const sunrise: Technique = {
  name: 'Sunrise',
  icon: icon,
  type: 'celestial',
  realm: 'bodyForging',
  effects: [
    {
      kind: 'buffSelf',
      buff: window.modAPI.gameData.techniqueBuffs.celestial.solarAttunement,
      amount: { value: 1, stat: undefined, upgradeKey: 'attuneStacks' },
    },
    {
      kind: 'buffSelf',
      buff: window.modAPI.gameData.techniqueBuffs.celestial.sunlight,
      amount: { value: 1, stat: undefined, upgradeKey: 'stacks' },
    },
    {
      kind: 'convertSelf',
      source: window.modAPI.gameData.techniqueBuffs.celestial.moonlight,
      target: window.modAPI.gameData.techniqueBuffs.celestial.sunlight,
      amount: { value: 1, stat: undefined, scaling: window.modAPI.gameData.techniqueBuffs.celestial.moonlight.name },
      triggerKey: celestialRotation,
    },
  ],
};
```

**Analysis:**

- **Multi-function**: Generates resources, attunement, and converts existing resources
- **School mechanics**: Demonstrates celestial sun/moon transformation
- **Trigger system**: Fires celestial rotation event for other systems
- **Scaling conversion**: Converts all existing Moonlight to Sunlight

## Mastery System

Techniques can be upgraded through the mastery system:

```typescript
upgradeMasteries: {
  power: createPowerUpgradeMap('power', 'empowered'),
  cost: createCostUpgradeMap('cost', 'empowered', fragrantBlossom.name, -1),
  stacks: createStacksUpgradeMap('stacks', 'empowered', buffName, 1)
}
```

### Upgrade Keys

Properties with `upgradeKey` can be modified by mastery:

- **Damage/healing amounts**: Increase effectiveness
- **Resource costs**: Reduce consumption
- **Stack generation**: Generate more resources
- **Requirements**: Modify usage conditions

### Mastery Pools

```typescript
masteryKindPools: ['damage', 'heal', 'buffSelf'];
```

Determines which effect types can receive random mastery bonuses, allowing for build customization beyond fixed upgrades.
