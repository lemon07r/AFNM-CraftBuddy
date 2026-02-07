---
layout: default
title: Change Physical Statistic Step
parent: Event Step Types
grand_parent: Events System
nav_order: 48
description: "Increase player's physical statistics"
---

# Change Physical Statistic Step

## Introduction

The Change Physical Statistic Step modifies the players physical statistics (muscles, dantian, etc)

## Interface

```typescript
interface ChangePhysicalStatStep {
  kind: 'changePhysicalStat';
  condition?: string;
  stat: PhysicalStatistic;
  amount: string;
}
```

## Properties

**`kind`** - Always `'changePhysicalStat'`

**`amount`** - Amount change expression

- String expression that evaluates to the amount to add or remove (if negative)

**`stat`** - The stat to modify. Must be one of `eyes`,`meridians`,`dantian`,`muscles`,`digestion`,`flesh`

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for change to occur
- Step is skipped if condition fails

## Examples

```typescript
{
  kind: 'changePhysicalStat',
  stat: 'flesh',
  amount: '3'
}
```
