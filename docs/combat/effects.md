---
layout: default
title: Effect Types
parent: Combat System
nav_order: 2
description: 'All available buff effect types with real examples'
---

# Effect Types

Buff effects define what happens when a buff triggers. All effects extend the `BaseBuff` interface and can have optional conditions and trigger keys.

## Base Effect Properties

### `condition`

Optional condition that must be met for the effect to trigger.

### `triggerKey`

Optional key used for triggered effects system.

## Damage Effects

### `damage`

Deals damage to the enemy.

```typescript
{
  kind: 'damage',
  amount: { value: 1.0, stat: 'power' },
  hits?: { value: 3, stat: undefined }, // Optional multiple hits
  damageType?: 'true' | 'corrupt' | 'disruption' // Optional special damage
}
```

**Example from game:**

```typescript
// From a celestial technique
{
  kind: 'damage',
  amount: { value: 0.8, stat: 'power' },
  damageType: 'true'
}
```

### `damageSelf`

Deals damage to yourself.

```typescript
{
  kind: 'damageSelf',
  amount: { value: 0.03, stat: 'maxhp' },
  damageType?: 'true' | 'corrupt' | 'disruption'
}
```

**Example from Profane Exchange:**

```typescript
// Intercept effect that converts corruption into self-damage
{
  kind: 'damageSelf',
  amount: { value: 0.03, stat: 'maxhp', upgradeKey: 'hpCost' },
  damageType: 'true'
}
```

## Healing and Protection

### `heal`

Restores health.

```typescript
{
  kind: 'heal',
  amount: { value: 0.25, stat: 'power' },
  hits?: { value: 2, stat: undefined } // Optional multiple heals
}
```

**Example from Restoring Fragrance:**

```typescript
// After-technique healing
{
  kind: 'heal',
  amount: { value: 0.25, stat: 'power', upgradeKey: 'power' }
}
```

### `barrier`

Grants barrier (damage absorption).

```typescript
{
  kind: 'barrier',
  amount: { value: 0.9, stat: 'power' },
  hits?: { value: 1, stat: undefined }
}
```

**Example from Advancing Fist:**

```typescript
{
  kind: 'barrier',
  amount: { value: 0.9, stat: 'power', upgradeKey: 'barrier' }
}
```

## Buff Management

### `buffSelf`

Grants a buff to yourself.

```typescript
{
  kind: 'buffSelf',
  amount: { value: 2, stat: undefined },
  buff: targetBuff,
  silent?: true, // Don't show application message
  hideBuff?: true // Don't show buff in tooltips
}
```

### `consumeSelf`

Removes a buff from yourself.

```typescript
{
  kind: 'consumeSelf',
  amount: { value: 1, stat: undefined },
  buff: targetBuff // Can be Buff object or string name
}
```

### `buffTarget`

Gives a buff to the enemy.

```typescript
{
  kind: 'buffTarget',
  amount: { value: 3, stat: undefined },
  buff: debuffBuff
}
```

### `consumeTarget`

Removes a buff from the enemy.

```typescript
{
  kind: 'consumeTarget',
  amount: { value: 2, stat: undefined },
  buff: enemyBuff
}
```

## Stack Manipulation

### `add`

Adds or removes stacks from the current buff.

```typescript
{
  kind: 'add',
  amount: { value: -1, stat: undefined } // Remove 1 stack
}
```

**Example from Moonchill:**

```typescript
// Consume 1 stack after each technique
{
  kind: 'add',
  amount: { value: -1, stat: undefined }
}
```

### `multiply`

Multiplies the current stack count.

```typescript
{
  kind: 'multiply',
  amount: { value: 2 } // Double stacks (multiply by 2)
}
```

### `negate`

Removes all stacks of the current buff.

```typescript
{
  kind: 'negate';
}
```

## Advanced Effects

### `merge`

Converts stacks from one buff to another.

```typescript
{
  kind: 'merge',
  sourceBuff?: sourceBuff, // If omitted, uses current buff
  sourceStacks: { value: 2, stat: undefined },
  targetBuff: targetBuff,
  targetStacks: { value: 1, stat: undefined }
}
```

### `trigger`

Triggers custom events for other systems.

```typescript
{
  kind: 'trigger',
  triggerKey: 'customEvent',
  amount: { value: 1, stat: undefined },
  triggerTooltip?: 'Explanation of what this trigger does'
}
```

### `cleanseToxicity`

Removes or adds toxicity.

```typescript
{
  kind: 'cleanseToxicity',
  amount: { value: 10, stat: undefined } // Positive removes, negative adds
}
```

### `modifyBuffGroup`

Modifies all buffs of a specific group.

```typescript
{
  kind: 'modifyBuffGroup',
  group: 'celestial',
  amount: { value: 1, stat: undefined }
}
```

## Scaling System

All effects use the **[Scaling](../concepts/scaling)** interface for amount calculations:

```typescript
interface Scaling {
  value: number; // Base value
  stat?: CombatStatistic; // Stat to scale from
  scaling?: string; // Custom scaling variable
  max?: Scaling; // Maximum value cap
  upgradeKey?: string; // Reference for upgrades
}
```

### Common Scaling Patterns

**Power Scaling:**

```typescript
amount: { value: 1.2, stat: 'power' }
```

**Stack Scaling:**

```typescript
amount: { value: 0.1, stat: 'power', scaling: 'stacks' }
```

**Percentage of Max HP:**

```typescript
amount: { value: 0.05, stat: 'maxhp' }
```

**Capped Scaling:**

```typescript
amount: {
  value: 0.05,
  stat: 'power',
  scaling: 'stacks',
  max: { value: 1, stat: 'power' }
}
```

## Damage Types

Special damage types bypass certain protections:

### `'true'`

Ignores both barrier and defense.

### `'corrupt'`

Ignores defense but not barrier.

### `'disruption'`

Only affects barrier, not health.

## Condition Examples

### Multiple Hits with Scaling

```typescript
{
  kind: 'damage',
  amount: { value: 0.3, stat: 'power' },
  hits: {
    value: 0.5, // 1 hit per 2 stacks
    scaling: 'bloodCorruption',
    max: { value: 3, stat: undefined } // Max 3 hits
  }
}
```

### Conditional Effects

```typescript
{
  kind: 'heal',
  amount: { value: 0.2, stat: 'power' },
  condition: {
    kind: 'hp',
    percentage: 50,
    mode: 'less'
  }
}
```

### Chance-Based Effects

```typescript
{
  kind: 'buffSelf',
  buff: shieldBuff,
  amount: { value: 1, stat: undefined },
  condition: {
    kind: 'chance',
    percentage: 25
  }
}
```
