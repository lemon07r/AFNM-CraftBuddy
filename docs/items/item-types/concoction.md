---
layout: default
title: Concoction
parent: Item Types
grand_parent: Item System
nav_order: 14
---

# Concoction Items

Combat consumables that apply effects through the TechniqueEffect system. Unlike pills, they don't use toxicity.

## Interface

```typescript
interface ConcoctionItem extends ItemBase {
  kind: 'concoction';
  effects: TechniqueEffect[]; // Combat effects to apply
  tooltip?: string; // Optional description
}
```

## Key Differences from Pills

- **No toxicity limit** - Can be used freely
- **Target flexibility** - Can target self or enemies via effect types
- **Uses TechniqueEffect** - Same effects as combat techniques

## Example

```typescript
export const toxicConcoction: ConcoctionItem = {
  kind: 'concoction',
  name: 'Toxic Concoction',
  description: 'Poisons the target when thrown.',
  icon: toxicIcon,
  stacks: 1,
  rarity: 'mundane',
  realm: 'bodyForging',
  effects: [
    {
      kind: 'buffTarget',
      buff: poisonBuff,
      amount: { value: 3, stat: undefined },
    },
  ],
  tooltip: 'Applies 3 stacks of poison',
};
```

See [TechniqueEffect documentation](../combat/techniques) for available effect types.
