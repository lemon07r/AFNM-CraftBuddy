---
layout: default
title: Progress Relationship Step
parent: Event Step Types
grand_parent: Events System
nav_order: 13
description: "Advance player's relationship with character to next tier"
---

# Progress Relationship Step

The Progress Relationship Step advances the player's relationship with a character to the next tier when approval thresholds are met. It marks significant milestones in character relationships.

## Interface

```typescript
interface ProgressRelationshipStep {
  kind: 'progressRelationship';
  condition?: string;
  character: string;
}
```

## Properties

**`kind`** - Always `'progressRelationship'`

**`character`** - Character name (case-sensitive string)

**`condition`** (optional) - Flag expression for conditional execution

## Examples

### Natural Relationship Progression

```typescript
[
  {
    kind: 'text',
    text: 'Your shared experiences have brought you closer together.',
  },
  {
    kind: 'progressRelationship',
    character: 'Beishi Ji',
  },
];
```
