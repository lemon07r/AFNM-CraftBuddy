---
layout: default
title: Create Buff Step
parent: Event Step Types
grand_parent: Events System
nav_order: 26
description: 'Apply temporary buffs or debuffs to player'
---

# Create Buff Step

## Introduction

The Create Buff Step applies buffs to the player with specified amounts and persistence options.

## Interface

```typescript
interface CreateBuffStep {
  kind: 'createBuff';
  condition?: string;
  buff: Buff;
  amount: string;
  persistBeyondEvent?: boolean;
}
```

## Properties

- `kind` - Always `'createBuff'`

- `buff` - Buff object to create

- `amount` - Amount expression as string

- `persistBeyondEvent` - Whether buff persists beyond the event. If true, each stack will last for `1` day (optional)

- `condition` - Conditional execution (optional)

## Examples

```typescript
{
  kind: 'createBuff',
  buff: 'meditation_focus',
  amount: '1'
}
```

```typescript
{
  kind: 'createBuff',
  buff: 'blessed_cultivation',
  amount: 'playerRealm * 5',
  persistBeyondEvent: true
}
```
