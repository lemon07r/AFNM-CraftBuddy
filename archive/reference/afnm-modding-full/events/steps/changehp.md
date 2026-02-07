---
layout: default
title: Change HP Step
parent: Event Step Types
grand_parent: Events System
nav_order: 12
description: "Modify player's health points"
---

# Change HP Step

## Introduction

Modifies the player's current health points, providing damage or healing outside of combat scenarios.

## Interface

```typescript
interface ChangeHpStep {
  kind: 'changeHp';
  condition?: string;
  amount: string;
}
```

## Properties

**`kind`** - Always `'changeHp'`

**`amount`** - Health change expression (positive heals, negative damages)

**`condition`** (optional) - Conditional execution

## Examples

### Environmental Damage

```typescript
{
  kind: 'changeHp',
  amount: '-2000'
}
```

### Healing Effect

```typescript
{
  kind: 'changeHp',
  amount: '5000'
}
```

### Percentage-Based Damage

```typescript
{
  kind: 'changeHp',
  amount: '-hp * 0.5'  // Lose half current HP
}
```
