---
layout: default
title: Add Quest Step
parent: Event Step Types
grand_parent: Events System
nav_order: 28
description: 'Start new questlines for the player'
---

# Add Quest Step

Starts new questlines, adding them to the player's quest log. Any quest added in this way must first have been added by the `window.modAPI.actions.addQuest` function.

## Interface

```typescript
interface AddQuestStep {
  kind: 'quest';
  condition?: string;
  quest: string;
}
```

## Properties

**`kind`** - Always `'quest'`

**`quest`** - Name of quest to add.

**`condition`** _(optional)_ - Flag expression that must evaluate to true for the step to execute.

## Example

### Basic Quest Start

```typescript
{
  kind: 'quest',
  quest: 'Bandit Leader Hunt'
}
```
