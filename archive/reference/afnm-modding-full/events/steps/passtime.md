---
layout: default
title: Pass Time Step
parent: Event Step Types
grand_parent: Events System
nav_order: 35
description: 'Advance the game calendar by a specified number of days'
---

# Pass Time Step

## Introduction

The Pass Time Step advances the game calendar by a specified number of days. This step represents activities that require temporal progression like training, travel, recovery, or waiting.

## Interface

```typescript
interface PassTimeStep {
  kind: 'passTime';
  condition?: string;
  days: string;
}
```

## Properties

**`kind`** - Always `'passTime'`

**`days`** - Number of days to advance

- String expression that evaluates to a positive integer
- Can be literal numbers, mathematical expressions, or flag references

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for time to pass
- Step is skipped if condition fails

## Examples

### Basic Time Passage

```typescript
{
  kind: 'passTime',
  days: '7'
}
```
