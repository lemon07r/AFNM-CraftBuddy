---
layout: default
title: Team Up Step
parent: Event Step Types
grand_parent: Events System
nav_order: 14
description: 'Create temporary combat partnerships with characters'
---

# Team Up Step

The Team Up Step creates temporary combat partnerships where characters fight alongside the player. It transforms solo encounters into cooperative experiences.

## Interface

```typescript
interface TeamUpStep {
  kind: 'teamUp';
  condition?: string;
  character: string;
  fallbackBuff?: Omit<Buff, 'name' | 'icon'>;
}
```

## Properties

**`kind`** - Always `'teamUp'`

**`character`** - Character name (case-sensitive string)

**`condition`** (optional) - Flag expression for conditional execution

**`fallbackBuff`** (optional) - Alternative buff if team-up mechanics aren't available

## Examples

### Simple Story Team-Up

```typescript
{
  kind: 'teamUp',
  character: 'Beishi Ji'
}
```

### Team-Up with Fallback Benefits

```typescript
{
  kind: 'teamUp',
  character: 'Sect Disciple',
  fallbackBuff: {
    stats: {
      maxbarrier: { value: 0.1, stat: 'maxbarrier' }
    },
    onTechniqueEffects: [
      {
        kind: 'heal',
        amount: { value: 0.15, stat: 'power' }
      }
    ]
  }
}
```
