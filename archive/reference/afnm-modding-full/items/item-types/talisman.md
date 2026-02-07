---
layout: default
title: Talisman
parent: Item Types
grand_parent: Item System
nav_order: 13
---

# Talisman Items

Combat accessories that provide buffs during battles.

## Interface

```typescript
interface TalismanItem extends ItemBase {
  kind: 'talisman';
  buffs: { buff: Buff; buffStacks: Scaling }[];
}
```

## Properties

- **buffs**: Array of buffs to apply during combat
- **buffStacks**: Uses Scaling to determine how many stacks to apply

## Example

```typescript
export const powerTalisman: TalismanItem = {
  kind: 'talisman',
  name: 'Power Talisman',
  description: 'Increases combat power.',
  icon: talismanIcon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'qiCondensation',
  buffs: [
    {
      buff: powerBuff,
      buffStacks: { value: 3, stat: undefined }
    }
  ]
};
```

## Enchantments

Talismans can be enchanted to modify their properties:

```typescript
interface TalismanEnchantment extends Enchantment {
  itemKind: 'talisman';
  combatStats: Partial<CombatStatsMap>;
  buffs?: { buff: Buff; buffStacks: Scaling }[];
}
```