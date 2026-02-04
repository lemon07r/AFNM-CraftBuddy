---
layout: default
title: Mark Beat Character Step
parent: Event Step Types
grand_parent: Events System
nav_order: 41
description: 'Mark character as defeated'
---

# Mark Beat Character Step

## Introduction

Marks a character as defeated in combat, tracking player victories.

## Interface

```typescript
interface MarkBeatCharacterStep {
  kind: 'markBeatCharacter';
  condition?: string;
  character: string;
}
```

## Properties

**`kind`** - Always `'markBeatCharacter'`

**`character`** - Character to mark as defeated

**`condition`** (optional) - Conditional execution

## Examples

### Basic Usage

```typescript
{
  kind: 'markBeatCharacter',
  character: 'Rival Cultivator'
}
```
