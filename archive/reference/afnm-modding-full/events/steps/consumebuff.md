---
layout: default
title: Consume Buff Step
parent: Event Step Types
grand_parent: Events System
nav_order: 27
description: 'Remove or reduce buff duration'
---

# Consume Buff Step

## Introduction

The Consume Buff Step removes or reduces active buffs by specified amounts.

## Interface

```typescript
interface ConsumeBuffStep {
  kind: 'consumeBuff';
  condition?: string;
  buff: Buff;
  amount: string;
}
```

## Properties

- `kind` - Always `'consumeBuff'`

- `buff` - Buff object to consume

- `amount` - Amount to consume as expression string

- `condition` - Conditional execution (optional)

## Examples

```typescript
{
  kind: 'consumeBuff',
  buff: favourOfTheAscender,
  amount: '10'
}
```
