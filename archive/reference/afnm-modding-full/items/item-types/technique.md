---
layout: default
title: Technique
parent: Item Types
grand_parent: Item System
nav_order: 7
---

# Technique Items

Items that teach or enhance combat techniques.

## Base Interface

```typescript
interface BaseTechniqueItem extends ItemBase {
  kind: 'technique';
  subKind: TechniqueItemKind;
}

type TechniqueItemKind = 'technique' | 'crystal' | 'shard' | 'enhance';
```

## Technique Types

### Direct technique items (to sell techniques in shops)
```typescript
interface TechniqueItem extends BaseTechniqueItem {
  subKind: 'technique';
  technique: string;           // Technique name to learn
  element: TechniqueElement;   // Technique school
}
```

### Technique Crystals
```typescript
interface TechniqueCrystalItem extends BaseTechniqueItem {
  subKind: 'crystal';
  techniques: string[];         // Primary techniques
  fallbackTechniques: string[]; // Techniques to drop when the primary techniques are all unlocked. Normally should contain all the techniques for the realms below this one
}
```

### Technique Shards
```typescript
interface TechniqueShardItem extends BaseTechniqueItem {
  subKind: 'shard';
  crystal: string;  // Crystal this shard belongs to
}
```

### Enhancement Dust
```typescript
interface TechniqueEnhancementDust extends BaseTechniqueItem {
  subKind: 'enhance';
  element: 'none';  // Universal enhancement
  realm: 'any';
}
```

## Examples

```typescript
// Technique manual (generated from actual techniques)
export const basicPunchManual: TechniqueItem = {
  subKind: 'technique',
  technique: 'Basic Punch',
  kind: 'technique',
  name: 'Basic Punch',
  element: 'fist',
  description: "The knowledge of how to perform the 'Basic Punch' technique.",
  icon: basicPunchIcon,
  stacks: 1,
  rarity: 'mundane',
  realm: 'bodyForging',
};

// Technique crystal with primary and fallback techniques
export const fistCrystalII: TechniqueCrystalItem = {
  subKind: 'crystal',
  kind: 'technique',
  name: 'Technique Crystal II (Fist)',
  description: 'The crystal of an unformed Fist technique. Focus on it to unveil the technique locked within, or convert to Enhancement Dust.',
  techniques: ['Power Fist', 'Iron Palm Strike'], // This realms techniques
  fallbackTechniques: ['Basic Punch', 'Focused Strike'], // The previous realms techniques
  icon: fistCrystalIcon,
  stacks: 1,
  rarity: 'mundane',
  realm: 'meridianOpening',
};

// Technique shard (crafting component)
export const celestialShardI: TechniqueShardItem = {
  subKind: 'shard',
  kind: 'technique',
  name: 'Technique Shard I (Celestial)',
  description: 'The shard of a Celestial technique. Combine 10 to form a Technique Crystal.',
  crystal: 'Technique Crystal I (Celestial)',
  icon: celestialShardIcon,
  stacks: 1,
  rarity: 'mundane',
  realm: 'bodyForging',
  valueTier: 0.075,
};

// Enhancement dust (universal upgrade)
export const enhancementDust: TechniqueEnhancementDust = {
  subKind: 'enhance',
  element: 'none',
  kind: 'technique',
  name: 'Enhancement Dust',
  description: 'The qi-infused remnants of a powdered technique crystal. Can be absorbed by a cultivator to enhance a technique and increase its effectiveness.',
  icon: dustIcon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'any',
  valueTier: 0.35,
};
```