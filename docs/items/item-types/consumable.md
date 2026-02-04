---
layout: default
title: Consumable
parent: Item Types
grand_parent: Item System
nav_order: 15
---

# Consumable Items

Combat consumables using the TechniqueEffect system. Despite the confusing name, `CombatItem` represents consumable items.

## Interface

```typescript
interface CombatItem extends ItemBase {
  kind: 'consumable';
  effects: TechniqueEffect[]; // Combat effects to apply
  tooltip?: string; // Optional description
}
```

## Difference from Concoctions

Functionally identical to concoctions - both use TechniqueEffect arrays. The distinction is primarily organizational.

## Common Use Case: Formation Triggers

```typescript
export const formationSlip: CombatItem = {
  kind: 'consumable',
  name: 'Formation Slip',
  description: 'Triggers formation after several techniques.',
  icon: slipIcon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'meridianOpening',
  effects: [
    {
      kind: 'buffSelf',
      buff: formationTriggerBuff, // Buff that counts techniques and triggers
      amount: { value: 1, stat: undefined },
    },
  ],
};
```

See [TechniqueEffect documentation](../combat/techniques) for available effect types.
