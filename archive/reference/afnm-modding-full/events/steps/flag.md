---
layout: default
title: Flag Step
parent: Event Step Types
grand_parent: Events System
nav_order: 4
description: 'Set and modify flag values for state tracking'
---

# Flag Step

Sets or modifies flag values to track player choices, progression, and game state.

## Interface

```typescript
interface SetFlagStep {
  kind: 'flag';
  condition?: string;
  global: boolean;
  flag: string;
  value: string;
}
```

## Properties

**`kind`** - Always `'flag'`

**`global`** - Persistence scope. If `true`, stored permanently in save game; if `false`, only exists during current event.

**`flag`** - Unique string identifier for the flag. Recommend prefixing with mod name to avoid conflicts.

**`value`** - String expression that evaluates to a number. Can be literal numbers, mathematical expressions, or references to other flags.

**`condition`** _(optional)_ - Flag expression that must evaluate to true for the step to execute.

## Examples

### Simple Flag Setting

```typescript
{
  kind: 'flag',
  global: true,
  flag: 'met_elder_chen',
  value: '1'
}
```

### Mathematical Expression

```typescript
{
  kind: 'flag',
  global: true,
  flag: 'total_quest_points',
  value: 'total_quest_points + 10'
}
```

### Event-Scoped Flag

```typescript
{
  kind: 'flag',
  global: false,
  flag: 'explored_western_path',
  value: '1'
}
```

## Flag Naming Best Practices

Use descriptive names with consistent prefixes:

- `mymod_quest_bandit_leader_defeated`
- `mymod_character_elder_li_approval`
- `mymod_location_secret_chamber_discovered`
