---
layout: default
title: Replace Item Step
parent: Event Step Types
grand_parent: Events System
nav_order: 8
description: 'Transform one item into another'
---

# Replace Item Step

## Introduction

The Replace Item Step transforms one item into another, making it perfect for upgrades, refinements, transmutations, and magical transformations. Unlike separate remove/add operations, this step handles equipped items directly and maintains item relationships seamlessly.

This step is essential for creating progression systems where players can improve their existing gear and consumables through cultivation processes, crafting upgrades, and mystical transformations.

## Interface

```typescript
interface ReplaceItemStep {
  kind: 'replaceItem';
  condition?: string;
  source: ItemDesc;
  target: ItemDesc;
}
```

## Properties

### Required Properties

**`kind`** - Always `'replaceItem'`

- Identifies this as an item replacement step

**`source`** - Item to be replaced

- Uses `ItemDesc` format to specify the exact item to transform
- Must exist in player's inventory or be equipped
- Can include quality tiers and enchantments for precise targeting

**`target`** - Item to replace it with

- Uses `ItemDesc` format to specify the result item
- Can include quality improvements and new enchantments
- Maintains equipped status if source was equipped

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must be true for replacement to occur
- Step is skipped if condition fails
- Useful for upgrade requirements and progression gates

## Examples

### Simple Weapon Upgrade

```typescript
{
  kind: 'replaceItem',
  source: { name: 'Iron Sword' },
  target: { name: 'Steel Sword' }
}
```

### Pill Refinement

```typescript
{
  kind: 'replaceItem',
  source: { name: 'Crude Healing Pill' },
  target: { name: 'Refined Healing Pill' }
}
```

### Artifact Enhancement

```typescript
{
  kind: 'replaceItem',
  source: { name: 'Ancient Ring' },
  target: {
    name: 'Ancient Ring',
    qualityTier: 2
  }
}
```

### Quality Tier Progression

```typescript
{
  kind: 'replaceItem',
  source: {
    name: 'Cultivation Blade',
    qualityTier: 1
  },
  target: {
    name: 'Cultivation Blade',
    qualityTier: 2
  },
  condition: 'metalsmithingLevel >= 3'
}
```

### Enchantment Addition

```typescript
{
  kind: 'replaceItem',
  source: { name: 'Spirit Sword' },
  target: {
    name: 'Spirit Sword',
    enchantment: {
      kind: 'sharpness',
      rarity: 'qitouched'
    }
  }
}
```
