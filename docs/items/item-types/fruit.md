---
layout: default
title: Fruit
parent: Item Types
grand_parent: Item System
nav_order: 16
---

# Fruit Items

Consumables that provide permanent stat bonuses.

## Base Interface

```typescript
interface BaseSpiritFruitItem extends ItemBase {
  kind: 'fruit';
  subKind: 'affinity' | 'lifespan';
}
```

## Fruit Types

### Affinity Fruits
```typescript
interface AffinityFruitItem extends BaseSpiritFruitItem {
  subKind: 'affinity';
  amounts: Partial<Omit<Record<TechniqueElement, number>, 'none'>>;
  max: number;  // Maximum affinity it can increase to
}
```

### Lifespan Fruits
```typescript
interface LifespanFruitItem extends BaseSpiritFruitItem {
  subKind: 'lifespan';
  years: number;  // Years of lifespan added
}
```

## Examples

```typescript
// Affinity fruit
export const celestialFruit: AffinityFruitItem = {
  kind: 'fruit',
  subKind: 'affinity',
  name: 'Celestial Spirit Fruit',
  max: 255, // Can increase affinity to a maximum of 255
  amounts: { celestial: 10 },
  // ... base properties
};

// Lifespan fruit
export const longevityPeach: LifespanFruitItem = {
  kind: 'fruit',
  subKind: 'lifespan',
  name: 'Longevity Peach',
  years: 100,
  // ... base properties
};
```