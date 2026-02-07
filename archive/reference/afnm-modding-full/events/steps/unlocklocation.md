---
layout: default
title: Unlock Location Step
parent: Event Step Types
grand_parent: Events System
nav_order: 32
description: 'Make new locations accessible on world map'
---

# Unlock Location Step

## Introduction

The Unlock Location Step makes new locations accessible on the world map, expanding the player's exploration options. The location must first have been added with the `window.modAPI.actions.addLocation` function and connected to the world using the `window.modAPI.actions.linkLocations` function

## Interface

```typescript
interface UnlockLocationStep {
  kind: 'unlockLocation';
  condition?: string;
  location: string;
}
```

## Properties

- `kind` - Always `'unlockLocation'`

- `location` - Name of location to unlock

- `condition` - Conditional execution (optional)

## Examples

```typescript
{
  kind: 'unlockLocation',
  location: 'Hidden Valley'
}
```
