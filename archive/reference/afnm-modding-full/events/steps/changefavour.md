---
layout: default
title: Change Favour Step
parent: Event Step Types
grand_parent: Events System
nav_order: 29
description: "Modify player's sect favour"
---

# Change Favour Step

## Introduction

The Change Favour Step modifies the player's sect favour

## Interface

```typescript
interface ChangeFavourStep {
  kind: 'favour';
  condition?: string;
  amount: string;
}
```

## Properties

- `kind` - Always `'favour'`

- `amount` - Favour change expression (positive adds, negative removes)

- `condition` - Conditional execution (optional)

## Examples

```typescript
{
  kind: 'favour',
  amount: '10'
}
```
