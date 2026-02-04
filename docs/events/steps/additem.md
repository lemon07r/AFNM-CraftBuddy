---
layout: default
title: Add Item Step
parent: Event Step Types
grand_parent: Events System
nav_order: 6
description: 'Give items to player inventory'
---

# Add Item Step

Gives items to the player's inventory as rewards, loot, or gifts. If looking to add multiple items, use the [Add Multiple Item Step](addmultipleitem) instead. If you wish to add a random item from a pool, use [Drop Item Step](dropitem) instead.

## Interface

```typescript
interface AddItemStep {
  kind: 'addItem';
  condition?: string;
  item: ItemDesc;
  amount: string;
}
```

## Properties

**`kind`** - Always `'addItem'`

**`item`** - Description of the item to add, including name and any modifiers. This must either be the name of an item already in the game, or one added by `window.modAPI.actions.addItem`

**`amount`** - String expression for the quantity to add. Can be literal numbers or mathematical expressions.

**`condition`** _(optional)_ - Flag expression that must evaluate to true for the step to execute.

## Examples

### Basic Item Addition

```typescript
{
  kind: 'addItem',
  item: { name: 'Spirit Grass' },
  amount: '5'
}
```

### Variable Amount

```typescript
{
  kind: 'addItem',
  item: { name: 'Experience Pills' },
  amount: 'realm * 2'
}
```
