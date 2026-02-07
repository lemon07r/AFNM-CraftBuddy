---
layout: default
title: Set Aid Breakthrough Cooldown Step
parent: Event Step Types
grand_parent: Events System
nav_order: 70
description: 'Set cooldown period for character aid breakthrough interactions'
---

# Set Aid Breakthrough Cooldown Step

## Introduction

The Set Aid Breakthrough Cooldown Step sets a cooldown period for character aid breakthrough interactions, preventing repeated help with the same character's cultivation advancement.

## Interface

```typescript
interface SetAidBreakthroughCooldownStep {
  kind: 'setAidBreakthroughCooldown';
  condition?: string;
  character: string;
  cooldown: string;
}
```

## Properties

**`kind`** - Always `'setAidBreakthroughCooldown'`

**`character`** - Character name

- String identifying which character's aid breakthrough cooldown to set
- Must reference an existing character in the game

**`cooldown`** - Cooldown duration expression

- String expression evaluating to number of time periods to wait
- Typically measured in months or time cycles
- Can be literal numbers, mathematical expressions, or flag references

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for the cooldown to be set

## Examples

```typescript
{
  kind: 'setAidBreakthroughCooldown',
  character: 'Lingxi Gian',
  cooldown: '3'
}
```
