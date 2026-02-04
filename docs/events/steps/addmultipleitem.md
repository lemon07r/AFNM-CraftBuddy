---
layout: default
title: Add Multiple Items Step
parent: Event Step Types
grand_parent: Events System
nav_order: 7
description: 'Give multiple items to player in one step'
---

# Add Multiple Items Step

The Add Multiple Items Step efficiently adds several different items to the player's inventory in a single step. It's perfect for quest rewards, loot bundles, and gift packages. If you want to instead add multiple items from a larger pool of items, use the [Drop Item Step](dropitem) instead.

## Interface

```typescript
interface AddMultipleItemStep {
  kind: 'addMultipleItem';
  condition?: string;
  items: { item: ItemDesc; amount: string }[];
}
```

## Properties

**`kind`** - Always `'addMultipleItem'`

**`items`** - Array of item/amount pairs to add simultaneously

**`condition`** (optional) - Flag expression for conditional execution

## Examples

### Quest Reward Bundle

```typescript
{
  kind: 'addMultipleItem',
  items: [
    { item: { name: 'Spirit Stone' }, amount: '10' },
    { item: { name: 'Healing Pill' }, amount: '5' },
    { item: { name: 'Cultivation Manual' }, amount: '1' }
  ]
}
```

### Variable Reward Amounts

```typescript
{
  kind: 'addMultipleItem',
  items: [
    { item: { name: 'Gold Coin' }, amount: 'questDifficulty * 100' },
    { item: { name: 'Experience Crystal' }, amount: 'yearMonth/3' }
  ]
}
```
