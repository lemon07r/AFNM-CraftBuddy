---
layout: default
title: Cauldron
parent: Item Types
grand_parent: Item System
nav_order: 3
---

# Cauldron Items

Crafting equipment for alchemy and refinement.

## Interface

```typescript
interface CauldronItem extends CraftingEquipmentItem {
  kind: 'cauldron';
}

interface CraftingEquipmentItem extends ItemBase {
  stats: Partial<CraftingStatsMap>;
  buffs?: { buff: CraftingBuff; buffStacks: Scaling }[];
}
```

## Properties

- **stats**: Crafting stat bonuses (control, intensity, etc.)
- **buffs**: Optional crafting buffs to apply

## Examples

```typescript
// Basic stats-only cauldron
export const wornCauldron: CauldronItem = {
  kind: 'cauldron',
  name: 'Worn Cauldron',
  description: 'An alchemy cauldron that is worn from years of use.',
  icon: icon,
  stats: window.modAPI.utils.getCraftingEquipmentStats(
    'bodyForging',
    'Middle',
    { pool: 0.4, control: 0.6, intensity: 0 },
    'cauldron',
  ),
  stacks: 1,
  rarity: 'qitouched',
  realm: 'bodyForging',
};

// Specialized cauldron with critchance
export const blastCauldron: CauldronItem = {
  kind: 'cauldron',
  stats: {
    ...window.modAPI.utils.getCraftingEquipmentStats('bodyForging', 'Late', { pool: 0.2, control: 0, intensity: 0.2 }, 'cauldron'),
    critchance: 20,
  },
  name: 'Blast Cauldron (I)',
  description: "A cauldron designed to bombard its contents with qi, sometimes forcing great leaps in progress.",
  icon: icon,
  stacks: 1,
  rarity: 'empowered',
  realm: 'bodyForging',
};

// High-qi pool focused cauldron
export const ragingQiCauldron: CauldronItem = {
  kind: 'cauldron',
  stats: window.modAPI.utils.getCraftingEquipmentStats('bodyForging', 'Late', { pool: 1.1, control: 0, intensity: 0 }, 'cauldron'),
  name: 'Raging Qi Cauldron (I)',
  description: 'A cauldron with qi storage chambers, greatly increasing the users available qi pool.',
  icon: icon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'bodyForging',
};

// Complex cauldron with buffs and special mechanics
export const stellarFurnace: CauldronItem = {
  kind: 'cauldron',
  stats: window.modAPI.utils.getCraftingEquipmentStats('pillarCreation', 'Late', {
    pool: 0.3, control: 0.3, intensity: 0.3,
  }, 'cauldron'),
  buffs: [{
    buff: {
      name: 'Stellar Furnace',
      icon,
      canStack: false,
      stats: undefined,
      effects: [{
        kind: 'createBuff',
        buff: stellarEnergy,
        stacks: { value: 1, stat: undefined },
      }],
      stacks: 1,
      displayLocation: 'none',
    },
    buffStacks: { value: 1, stat: undefined },
  }],
  name: 'Stellar Furnace',
  description: 'Shimmering with stellar power, this cauldron infuses materials with cosmic energy.',
  icon,
  stacks: 1,
  rarity: 'empowered',
  realm: 'pillarCreation',
};
```