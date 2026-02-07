---
layout: default
title: Combat Step
parent: Event Step Types
grand_parent: Events System
nav_order: 22
description: 'Initiate combat encounters with enemies'
---

# Combat Step

## Introduction

Initiates turn-based combat encounters with specified enemies and branching outcomes.

## Interface

```typescript
interface CombatStep {
  kind: 'combat';
  condition?: string;
  enemies: EnemyEntity[];
  playerBuffs?: Buff[];
  numEnemies?: number;
  isSpar?: boolean;
  bgm?: string[];
  victory: EventStep[];
  defeat: EventStep[];
}
```

## Properties

- **`kind`** - Always `'combat'`

- **`enemies`** - Array of enemy entities to fight. Either the full list to fight, or the pool to draw from if `numEnemies` is set.

- **`playerBuffs`** (optional) - Buffs to apply to the player

- **`numEnemies`** (optional) - Number of enemies to spawn. If set, will select this number randomly from the enemies pool

- **`isSpar`** (optional) - Whether this is a sparring match

- **`bgm`** (optional) - Background music for combat

- **`victory`** - Steps to execute on victory

- **`defeat`** - Steps to execute on defeat

- **`condition`** (optional) - Conditional execution

## Examples

### Basic Combat

```typescript
{
  kind: 'combat',
  enemies: [
    mountainBear
  ],
  victory: [
    { kind: 'text', text: 'You defeated the mountain bear!' },
    { kind: 'addItem', item: { name: 'BearHide' }, amount: '1' }
  ],
  defeat: [
    { kind: 'text', text: 'The bear overpowers you.' },
  ]
}
```

### Horde battle

```typescript
{
  kind: 'combat',
  enemies: [
    ratascar, ratascar, ratascar
  ],
  victory: [
    { kind: 'text', text: 'You defeat the swarm of ratascar' },
  ],
  defeat: [
    { kind: 'text', text: 'The swarm overwhelms you and you flee' },
  ]
}
```

## Randomised group

```typescript
{
  kind: 'combat',
  enemies: [
    ratascar, gorashi, xingKulei, stellarShard, gravityAnomaly
  ],
  numEnemies: 2,
  victory: [
    { kind: 'text', text: 'You defeat the pair of beasts' },
  ],
  defeat: [
    { kind: 'text', text: 'You lose and run' },
  ]
}
```
