---
layout: default
title: Drop Item Step
parent: Event Step Types
grand_parent: Events System
nav_order: 11
description: 'Give player random selection of items from a larger pool'
---

# Drop Item Step

The Drop Item Step provides players with a random selection of items from a larger pool. It's perfect for loot systems, treasure chests, combat rewards, and repeatable events.

## Interface

```typescript
interface DropItemStep {
  kind: 'dropItem';
  condition?: string;
  items: { item: ItemDesc; amount: string }[];
  count: string;
}
```

## Properties

**`kind`** - Always `'dropItem'`

**`items`** - Array of possible items that can be randomly selected

**`count`** - Number of items to randomly select from the pool

**`condition`** (optional) - Flag expression for conditional execution

## Examples

### Simple Treasure Chest

```typescript
{
  kind: 'dropItem',
  items: [
    { item: { name: 'Spirit Stone' }, amount: '5' },
    { item: { name: 'Healing Pill' }, amount: '2' },
    { item: { name: 'Ancient Coin' }, amount: '10' }
  ],
  count: '2'
}
```
