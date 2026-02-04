---
layout: default
title: Clear Change BGM Step
parent: Event Step Types
grand_parent: Events System
nav_order: 18
description: 'Clear music overrides to restore location-based background music'
---

# Clear Change BGM Step

## Introduction

The Clear Change BGM Step removes any active music override set by previous ChangeBGMStep actions, allowing the game's natural location-based background music system to resume control. This step provides a clean way to end special musical segments within events and return to ambient gameplay music.

This step is commonly used to conclude dramatic moments, special encounters, or narrative sequences that required specific musical accompaniment, smoothly transitioning back to the environmental audio that matches the player's current location.

## Interface

```typescript
interface ClearChangeBGMStep {
  kind: 'clearChangeBGM';
  condition?: string;
}
```

## Properties

### Required Properties

**`kind`** - Always `'clearChangeBGM'`

- Identifies this as a music override clearing step

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must be true for the override to be cleared
- Step is skipped if condition fails
- Useful for conditional music management based on player state or story progress

## Examples

### Simple Override Clearing

```typescript
{
  kind: 'clearChangeBGM';
}
```
