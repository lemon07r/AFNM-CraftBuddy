---
layout: default
title: Material
parent: Item Types
grand_parent: Item System
nav_order: 17
---

# Material Items

Crafting ingredients for recipes.

## Interface

```typescript
interface CraftingItem extends ItemBase {
  kind: 'material';
  // No additional fields - materials are defined by their base properties
}
```

## Properties

Materials only use base ItemBase properties:
- **name**: Material type identifier
- **description**: What the material is used for
- **rarity**: Quality tier affects recipe requirements
- **realm**: Indicates what level recipes can use it

## Example

```typescript
export const ironOre: CraftingItem = {
  kind: 'material',
  name: 'Iron Ore',
  description: 'Common metal ore for basic equipment.',
  icon: oreIcon,
  stacks: 99,
  rarity: 'mundane',
  realm: 'bodyForging'
};
```