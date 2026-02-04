---
layout: default
title: Enchantment
parent: Item Types
grand_parent: Item System
nav_order: 11
---

# Enchantment Items

Items that modify other equipment.

## Interface

```typescript
interface EnchantmentItem extends ItemBase {
  kind: 'enchantment';
  targetKind: ItemKind;     // What item type this enchants
  enchantmentKind: string;  // Enchantment identifier
}
```

## Properties

- **targetKind**: Which item type can be enchanted (clothing, artefact, etc.)
- **enchantmentKind**: Specific enchantment type identifier

## Example

```typescript
export const powerEnchantment: EnchantmentItem = {
  kind: 'enchantment',
  name: 'Power Enhancement Stone',
  description: 'Adds combat power to weapons.',
  icon: enchantIcon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'qiCondensation',
  targetKind: 'artefact',
  enchantmentKind: 'power_boost'
};
```