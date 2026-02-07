---
layout: default
title: Craft With Character Step
parent: Event Step Types
grand_parent: Events System
nav_order: 20
description: 'Open crafting interface with specific character'
---

# Craft With Character Step

## Introduction

Opens the crafting interface with a specific character for collaborative crafting.

## Interface

```typescript
interface CraftWithCharacterStep {
  kind: 'craftWithCharacter';
  condition?: string;
  character: string;
}
```

## Properties

- **`kind`** - Always `'craftWithCharacter'`

- **`character`** - Character to craft with

- **`condition`** (optional) - Conditional execution

## Examples

### Basic Collaborative Crafting

```typescript
{
  kind: 'craftWithCharacter',
  character: 'MasterCraftsman'
}
```
