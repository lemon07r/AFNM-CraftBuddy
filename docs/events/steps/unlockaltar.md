---
layout: default
title: Unlock Altar Step
parent: Event Step Types
grand_parent: Events System
nav_order: 33
description: 'Unlock special altar locations'
---

# Unlock Altar Step

## Introduction

The Unlock Altar Step unlocks altar functionality for breakthrough attempts and cultivation advancement.

## Interface

```typescript
interface UnlockAltarStep {
  kind: 'unlockAltar';
  condition?: string;
}
```

## Properties

- `kind` - Always `'unlockAltar'`

- `condition` - Conditional execution (optional)

## Examples

```typescript
{
  kind: 'unlockAltar';
}
```
