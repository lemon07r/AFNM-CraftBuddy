---
layout: default
title: Set Character Step
parent: Event Step Types
grand_parent: Events System
nav_order: 34
description: 'Place NPCs at specific locations'
---

# Set Character Step

## Introduction

Sets the active character for the current event location, displaying their image in the event screen

## Interface

```typescript
interface SetCharacterStep {
  kind: 'setCharacter';
  character: string;
  condition?: string;
}
```

## Properties

- **`kind`** - Always `'setCharacter'`

- **`character`** - Character to set as active

- **`condition`** (optional) - Conditional execution

## Examples

```typescript
{
  kind: 'setCharacter',
  character: 'WanderingMerchant'
}
```
