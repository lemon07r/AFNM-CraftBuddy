---
layout: default
title: Add Follower Step
parent: Event Step Types
grand_parent: Events System
nav_order: 16
description: 'Add character as temporary follower with ongoing benefits'
---

# Add Follower Step

## Introduction

The Add Follower Step adds a character as a temporary follower with ongoing benefits and interactions. Followers provide persistent buffs and can be interacted with over extended periods.

## Interface

```typescript
interface AddFollowerStep {
  kind: 'addFollower';
  condition?: string;
  character: string;
  followDef: FollowCharacterDefinition | undefined;
}
```

## Properties

**`kind`** - Always `'addFollower'`

**`character`** - Name of the character becoming a follower

- String identifying which character will become a follower

**`followDef`** - Follower definition including buffs, duration, and interactions

- Can be `undefined` for basic follower with no special properties
- Defines the follower's capabilities, duration, and associated events

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for the step to execute

## Examples

### Use an existing character as a follower

```typescript
{
  kind: 'addFollower',
  character: 'Pi Lip',
  followDef: undefined
}
```

### Follower with custom follow def

```typescript
{
  kind: 'addFollower',
  character: 'Junior Disciple',
  followDef: {
    formParty: [
      {
        kind: 'speech',
        character: 'Junior Disciple',
        text: 'I\'ll follow your lead, Senior!'
      }
    ],
    duration: 7,
    buff: {
      canStack: false,
      stats: {
        maxbarrier: { value: 0.05, stat: 'maxbarrier' }
      }
    },
    cooldown: 2,
    dissolveParty: [
      {
        kind: 'speech',
        character: 'Junior Disciple',
        text: 'Thank you for letting me accompany you, Senior.'
      }
    ]
  }
}
```
