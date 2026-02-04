---
layout: default
title: Pill
parent: Item Types
grand_parent: Item System
nav_order: 9
---

# Pill Items

Consumables providing temporary enhancements, limited by toxicity to prevent overuse.

## Base Interface

```typescript
interface BasePillItem extends ItemBase {
  kind: 'pill';
  pillKind: PillKind;
}

type PillKind = 'combat' | 'crafting' | 'advancement' | 'consumable';
```

## Pill Types

### Combat Pills
```typescript
interface CombatPillItem extends BasePillItem {
  pillKind: 'combat';
  toxicity: number;                    // Toxicity cost
  effects: TechniqueEffect[];          // Combat effects
  tooltip?: string;
}
```

### Crafting Pills
```typescript
interface CraftingPillItem extends BasePillItem {
  pillKind: 'crafting';
  toxicity: number;                    // Toxicity cost
  effects: CraftingTechniqueEffect[];  // Crafting effects
}
```

### Advancement Pills (No toxicity)
```typescript
interface MiscPillItem extends BasePillItem {
  pillKind: 'advancement';
  toxicity?: undefined;
}
```

### Consumable Pills (Permanent stats)
```typescript
interface ConsumablePillItem extends BasePillItem {
  pillKind: 'consumable';
  max: number;                         // Usage limit
  physicalStats: Partial<Record<PhysicalStatistic, number>>;
  socialStats: Partial<Record<SocialStatistic, number>>;
  toxicity?: undefined;
}
```

## Examples

```typescript
// Combat pill
export const healingPill: CombatPillItem = {
  pillKind: 'combat',
  kind: 'pill',
  name: 'Healing Pill',
  toxicity: 25,
  effects: [{
    kind: 'heal',
    amount: { value: 50, stat: undefined, eqn: '1 + (itemEffectiveness * 0.01)' },
  }],
  // ... base properties
};

// Permanent stat improvement
export const strengthElixir: ConsumablePillItem = {
  pillKind: 'consumable',
  kind: 'pill',
  name: 'Strength Elixir',
  max: 3,
  physicalStats: { muscles: 5 },
  socialStats: {},
  // ... base properties
};
```