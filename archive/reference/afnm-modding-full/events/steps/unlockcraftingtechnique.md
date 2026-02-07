---
layout: default
title: Unlock Crafting Technique Step
parent: Event Step Types
grand_parent: Events System
nav_order: 38
description: 'Unlock new crafting techniques'
---

# Unlock Crafting Technique Step

## Introduction

The Unlock Crafting Technique Step grants the player new crafting actions. The crafting action must first have been added via the `window.modAPI.action.addCraftingTechnique` function.

## Interface

```typescript
interface UnlockCraftingTechniqueStep {
  kind: 'unlockCraftingTechnique';
  condition?: string;
  craftingTechnique: string;
}
```

## Properties

**`kind`** - Always `'unlockCraftingTechnique'`

**`craftingTechnique`** - Crafting technique to unlock

**`condition`** (optional) - Conditional execution

## Example

```typescript
{
  kind: 'unlockCraftingTechnique',
  craftingTechnique: 'Advanced Pill Refinement'
}
```
