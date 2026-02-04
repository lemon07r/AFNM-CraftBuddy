---
layout: default
title: Clear Team Up Step
parent: Event Step Types
grand_parent: Events System
nav_order: 15
description: 'Remove all current team-up partners'
---

# Clear Team Up Step

The Clear Team Up Step removes all current team-up partners, returning the player to solo status. It provides closure to collaborative experiences and manages transitions where allies must part ways.

## Interface

```typescript
interface ClearTeamUpStep {
  kind: 'clearTeamUp';
  condition?: string;
}
```

## Properties

**`kind`** - Always `'clearTeamUp'`

**`condition`** (optional) - Flag expression for conditional execution

## Examples

### Mission Completion

```typescript
[
  {
    kind: 'text',
    text: 'With the mission complete, your companions bid you farewell.',
  },
  {
    kind: 'clearTeamUp',
  },
];
```
