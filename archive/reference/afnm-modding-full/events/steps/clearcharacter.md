---
layout: default
title: Clear Character Step
parent: Event Step Types
grand_parent: Events System
nav_order: 35
description: 'Remove NPCs from locations'
---

# Clear Character Step

## Introduction

Clears the active character from the current event location. Usually used after the character has left the conversation narratively to remove their image from the screen

## Interface

```typescript
interface ClearCharacterStep {
  kind: 'clearCharacter';
  condition?: string;
}
```

## Properties

- **`kind`** - Always `'clearCharacter'`
- **`condition`** (optional) - Conditional execution

## Examples

### Basic Character Clearing

```typescript
{
  kind: 'clearCharacter';
}
```
