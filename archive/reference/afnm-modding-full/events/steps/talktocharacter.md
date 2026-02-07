---
layout: default
title: Talk To Character Step
parent: Event Step Types
grand_parent: Events System
nav_order: 18
description: 'Open dialogue interface with specific character'
---

# Talk To Character Step

## Introduction

Immediately inserts the target characters talk interaction steps into the current conversation. Mainly used to allow sharing of dialogue steps between multiple interaction mechanisms

## Interface

```typescript
interface TalkToCharacterStep {
  kind: 'talkToCharacter';
  condition?: string;
  character: string;
}
```

## Properties

- **`kind`** - Always `'talkToCharacter'`

- **`character`** - Character to open dialogue with

- **`condition`** (optional) - Conditional execution

## Examples

```typescript
{
  kind: 'talkToCharacter',
  character: 'VillageElder'
}
```
