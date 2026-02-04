---
layout: default
title: Fight Character Step
parent: Event Step Types
grand_parent: Events System
nav_order: 21
description: 'Initiate combat encounter with specific character'
---

# Fight Character Step

## Introduction

Initiates a combat encounter with a specific character with branching outcomes.

## Interface

```typescript
interface FightCharacterStep {
  kind: 'fightCharacter';
  condition?: string;
  character: string;
  isSpar?: boolean;
  spawnCondition?: {
    hpMult: number;
    buffs: Buff[];
  };
  victory: EventStep[];
  defeat: EventStep[];
}
```

## Properties

- **`kind`** - Always `'fightCharacter'`

- **`character`** - Character to fight

- **`isSpar`** (optional) - Whether this is a sparring match

- **`spawnCondition`** (optional) - HP multiplier and buffs for opponent

- **`victory`** - Steps to execute on victory

- **`defeat`** - Steps to execute on defeat

- **`condition`** (optional) - Conditional execution

## Examples

### Basic Combat

```typescript
{
  kind: 'fightCharacter',
  character: 'RivalCultivator',
  victory: [
    { kind: 'text', text: 'You emerge victorious!' },
    { kind: 'reputation', name: 'sect', amount: '5' }
  ],
  defeat: [
    { kind: 'text', text: 'You suffer a humbling defeat.' },
  ]
}
```
