---
layout: default
title: Add Destiny Step
parent: Event Step Types
grand_parent: Events System
nav_order: 30
description: "Modify player's destiny points"
---

# Add Destiny Step

## Introduction

The Add Destiny Step adds a destiny to the player. Note, the destiny must first have been added via the `window.modAPI.action.addDestiny` function.

## Interface

```typescript
interface AddDestinyStep {
  kind: 'destiny';
  condition?: string;
  destiny: string;
}
```

## Properties

**`kind`** - Always `'destiny'`

**`destiny`** - Name of destiny to be added

**`condition`** (optional) - Conditional execution

## Examples

```typescript
{
  kind: 'destiny',
  destiny: myDestiny.name
}
```
