---
layout: default
title: Change Location Step
parent: Event Step Types
grand_parent: Events System
nav_order: 23
description: 'Move player to different location'
---

# Change Location Step

Moves the player to a different location on the world map.

## Interface

```typescript
interface ChangeLocationStep {
  kind: 'location';
  condition?: string;
  location: string;
  updatePlayerLocation?: boolean;
}
```

## Properties

**`kind`** - Always `'location'`

**`location`** - Name of destination location.

**`condition`** _(optional)_ - Flag expression that must evaluate to true for the step to execute.

**`updatePlayerLocation`** _(optional)_ - Whether to update the player's current location.

## Examples

### Temporary location change for duration of event

```typescript
{
  kind: 'changeLocation',
  location: 'Sect Grounds'
}
```

### Actual Location Change

```typescript
{
  kind: 'location',
  location: 'Mountain Peak',
  updatePlayerLocation: true
}
```

### Conditional Travel

```typescript
{
  kind: 'location',
  condition: 'has_travel_pass == 1',
  location: 'Forbidden Valley',
  updatePlayerLocation: true
}
```
