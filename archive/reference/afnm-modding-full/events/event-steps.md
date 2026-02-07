---
layout: default
title: Event Steps
parent: Events System
nav_order: 2
description: 'Building blocks of interactive events'
---

# Event Steps

## Introduction

Event Steps are the fundamental building blocks of [Events](events). Each step represents a single action or interaction that occurs during an event sequence - from displaying text and dialogue to modifying game state and triggering complex interactions.

Understanding event steps is essential for creating rich, interactive content. They provide the granular control needed to craft everything from simple conversations to complex, branching storylines.

## Core Step Properties

Most event steps share these fundamental properties:

### Condition System

All steps can have an optional `condition` that must evaluate to true for the step to execute:

```typescript
{
  kind: 'text',
  condition: 'realm >= coreFormation',  // Only execute if Core Formation or higher
  text: 'Your advanced cultivation reveals hidden meanings in the text.'
}
```

**Condition Examples:**

```typescript
condition: 'muscles >= 15'; // Stat requirement
condition: 'hasKeyItem == 1'; // Item possession
condition: 'questComplete == 0'; // Quest status
condition: 'realm >= coreFormation && visited == 0'; // Multiple conditions
condition: 'yearMonth >= 6 && yearMonth <= 8'; // Time-based
```

## Step Execution Flow

### Sequential Processing

Steps execute **sequentially** in the order they appear in the `steps` array:

```typescript
import { EventStep } from 'afnm-types';

const steps: EventStep[] = [
  { kind: 'text', text: 'You approach the ancient door...' },      // Step 1
  { kind: 'text', text: 'Mystical runes glow as you near...' },    // Step 2
  { kind: 'speech', character: 'Guardian', text: `"State your purpose!"` }, // Step 3
  { kind: 'choice', choices: [...] }                               // Step 4
];
```

When executing nested groups of steps, it will fall through the remaining steps at a higher level once the child steps are completed.

```typescript
import { EventStep } from 'afnm-types';

const steps: EventStep[] = [
  { kind: 'text', text: 'Step 1' },
  {
    kind: 'choice',
    choices: [
      {
        text: 'Option 1',
        children: [
          { kind: 'text', text: 'Step 2' },
          { kind: 'text', text: 'Step 3' },
        ],
      },
    ],
  },
  { kind: 'text', text: 'Step 4' },
];
```

### Conditional Execution

Steps with failing conditions are **automatically skipped**:

```typescript
steps: [
  { kind: 'text', text: 'You enter the temple chamber.' }, // Always executes
  {
    kind: 'text',
    condition: 'hasBlessing == 1', // Only if blessed
    text: 'The sacred statues bow in recognition of your blessing.',
  },
  { kind: 'text', text: 'You proceed deeper into the temple.' }, // Always executes
];
```

### Branching with Choices

Choice steps create **branches** - different execution paths through the event:

```typescript
{
  kind: 'choice',
  choices: [
    {
      text: 'Show respect and bow deeply',
      children: [
        { kind: 'text', text: 'Your respectful gesture is appreciated.' },
        { kind: 'flag', flag: 'respect', value: 'respect + 1', global: true }
      ]
    },
    {
      text: 'Stand proudly and assert your strength',
      condition: 'muscles >= 15',  // Only available if strong enough
      children: [
        { kind: 'text', text: 'Your power commands immediate attention.' },
        { kind: 'flag', flag: 'dominance', value: 'dominance + 1', global: true }
      ]
    },
    {
      text: 'Remain silent and observe',
      children: [
        { kind: 'text', text: 'You learn much by watching and listening.' },
        { kind: 'flag', flag: 'wisdom', value: 'wisdom + 1', global: true }
      ]
    }
  ]
}
```

## Advanced Patterns

### Nested Conditionals

Create complex logic with nested conditional steps:

```typescript
{
  kind: 'conditional',
  branches: [
    {
      condition: 'realm >= coreFormation',  // Core Formation or higher
      children: [
        {
          kind: 'conditional',
          branches: [
            {
              condition: 'visitedAncientLibrary == 1',
              children: [
                { kind: 'text', text: 'Your combined knowledge and power reveal hidden secrets.' }
              ]
            },
            {
              condition: '1',  // Default for high realm
              children: [
                { kind: 'text', text: 'Your cultivation allows deep understanding.' }
              ]
            }
          ]
        }
      ]
    },
    {
      condition: '1',  // Default for lower realms
      children: [
        { kind: 'text', text: 'The concepts seem beyond your current understanding.' }
      ]
    }
  ]
}
```

### Dynamic Content Generation

Use step sequences that adapt to player state:

```typescript
// Generate different rewards based on player's school affinity
{
  kind: 'conditional',
  branches: [
    {
      condition: 'fist >= weapon && fist >= blossom',
      children: [
        { kind: 'addItem', item: 'Fist Technique Manual', amount: 1 },
        { kind: 'text', text: 'The manual resonates with your fist cultivation.' }
      ]
    },
    {
      condition: 'weapon >= blossom',
      children: [
        { kind: 'addItem', item: 'Weapon Crafting Guide', amount: 1 },
        { kind: 'text', text: 'The guide enhances your weapon mastery.' }
      ]
    },
    {
      condition: '1',  // Default to blossom
      children: [
        { kind: 'addItem', item: 'Nature Harmony Scroll', amount: 1 },
        { kind: 'text', text: 'The scroll deepens your connection to nature.' }
      ]
    }
  ]
}
```

Continue to: **[Event Step Types](steps/)** for detailed documentation on each individual step type.
