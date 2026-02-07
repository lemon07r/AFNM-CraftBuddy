---
layout: default
title: Qi Step
parent: Event Step Types
grand_parent: Events System
nav_order: 10
description: "Modify player's qi reserves for cultivation progress"
---

# Qi Step

Modifies the player's qi points.

## Interface

```typescript
interface QiStep {
  kind: 'qi';
  condition?: string;
  amount: string;
}
```

## Properties

**`kind`** - Always `'qi'`

**`amount`** - String expression for amount to add/remove. Use negative values to remove qi.

**`condition`** *(optional)* - Flag expression that must evaluate to true for the step to execute.

## Examples

### Add Qi
```typescript
{
  kind: 'qi',
  amount: '50'
}
```

### Remove Qi
```typescript
{
  kind: 'qi',
  amount: '-30'
}
```

### Variable Amount
```typescript
{
  kind: 'qi',
  amount: 'dantian * 5'
}
```