---
layout: default
title: Unlock Technique Step
parent: Event Step Types
grand_parent: Events System
nav_order: 39
description: 'Unlock combat techniques'
---

# Unlock Technique Step

## Introduction

The Unlock Technique Step grants the player new combat techniques. The technique must first have been added with the `window.modAPI.actions.addTechnique` function

## Interface

```typescript
interface UnlockTechniqueStep {
  kind: 'unlockTechnique';
  condition?: string;
  technique: string;
}
```

## Properties

**`kind`** - Always `'unlockTechnique'`

**`technique`** - Technique to unlock

**`condition`** (optional) - Conditional execution

## Example

```typescript
{
  kind: 'unlockTechnique',
  technique: 'Dragon Palm Strike'
}
```
