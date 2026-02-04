---
layout: default
title: Mount
parent: Item Types
grand_parent: Item System
nav_order: 18
---

# Mount Items

Transportation equipment providing travel speed and bonuses.

## Interface

```typescript
interface MountItem extends ItemBase {
  kind: 'mount';
  speed: number;
  charisma?: number;
  masteryPoints?: number;
  qiAbsorption?: number;
}
```

## Properties

- **speed**: Travel speed multiplier
- **charisma**: Optional social stat bonus
- **masteryPoints**: Optional mastery point generation
- **qiAbsorption**: Optional qi regeneration during travel

## Example

```typescript
export const windHorse: MountItem = {
  kind: 'mount',
  name: 'Wind Horse',
  description: 'Swift mount with wind affinity.',
  icon: horseIcon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'qiCondensation',
  speed: 150,
  charisma: 10,
  qiAbsorption: 5
};
```

## Enchantments

```typescript
interface MountEnchantment extends Enchantment {
  itemKind: 'mount';
  charisma?: number;
  speed?: number;
}
```