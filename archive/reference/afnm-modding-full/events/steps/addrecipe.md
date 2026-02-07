---
layout: default
title: Add Recipe Step
parent: Event Step Types
grand_parent: Events System
nav_order: 40
description: 'Grant crafting recipes to player'
---

# Add Recipe Step

## Introduction

The Add Recipe Step grants the player new crafting recipes for creating items. The recipe must first have been added via the `window.modAPI.action.addItem` function.

## Interface

```typescript
interface AddRecipeStep {
  kind: 'addRecipe';
  condition?: string;
  recipe: string;
}
```

## Properties

**`kind`** - Always `'addRecipe'`

**`recipe`** - Recipe to add

**`condition`** (optional) - Conditional execution

## Example

```typescript
{
  kind: 'addRecipe',
  recipe: 'Spirit Enhancement Pill'
}
```
