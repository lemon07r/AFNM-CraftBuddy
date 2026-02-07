---
layout: default
title: Mark Did Encounter Step
parent: Event Step Types
grand_parent: Events System
nav_order: 42
description: 'Mark character as encountered by the player'
---

# Mark Did Encounter Step

## Introduction

Marks a character as having been encountered by the player this month, preventing duplicate encounter events. Usually used alongside the 'harassment' character interactions.

## Interface

```typescript
interface MarkDidEncounterStep {
  kind: 'markDidEncounter';
  condition?: string;
  character: string;
}
```

## Properties

**`kind`** - Always `'markDidEncounter'`

**`character`** - Character to mark as encountered

**`condition`** (optional) - Conditional execution

## Examples

### Basic Usage

```typescript
{
  kind: 'markDidEncounter',
  character: 'Shiao Gian'
}
```
