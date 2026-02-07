---
layout: default
title: Change Reputation Step
parent: Event Step Types
grand_parent: Events System
nav_order: 31
description: "Modify player's reputation with factions"
---

# Change Reputation Step

## Introduction

The Change Reputation Step modifies the player's reputation with various factions, affecting interactions and available content.

## Interface

```typescript
interface ChangeReputationStep {
  kind: 'reputation';
  condition?: string;
  amount: string;
  name: string;
  max?: ReputationTier;
}
```

## Properties

- `kind` - Always `'reputation'`

- `amount` - Reputation change expression

- `name` - Faction or group name, often the name of the settlement in question

- `max` - Maximum reputation tier to cap at (optional)

- `condition` - Conditional execution (optional)

## Examples

```typescript
{
  kind: 'reputation',
  name: 'Nine Mountain Sect',
  amount: '5'
}
```
