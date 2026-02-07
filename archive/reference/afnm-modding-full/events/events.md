---
layout: default
title: Events
parent: Events System
nav_order: 1
description: 'Core event system and structure'
---

# Events

## Introduction

Events are the primary system for creating interactive content in Ascend from Nine Mountains. They control dialogue, character interactions, storylines, and all dynamic gameplay moments that make the cultivation journey engaging and personal.

Think of events as scripted sequences that can display text, present choices, modify game state, trigger combat, and create the rich narrative experiences that define your mod's unique story.

## What Events Are

An **Event** is a sequence of **steps** that execute in order to create an interactive experience. Events can:

- Display narrative text and character dialogue
- Present meaningful choices to the player
- Give or take items and resources
- Trigger combat encounters and challenges
- Modify game state through flags and conditions
- Change locations and unlock new content
- Control the flow of story and gameplay

## Event Structure

### GameEvent Interface

The core event definition containing the actual interactive content:

```typescript
import { GameEvent, EventStep } from 'afnm-types';

interface GameEvent {
  location: string; // Where this event takes place
  steps: EventStep[]; // The sequence of actions to perform
  onCompleteFlags?: { flag: string; value: number }[]; // Flags set when event ends
}
```

**Key Components:**

- **location**: Defines where the event occurs (for context and validation)
- **steps**: Array of actions that execute sequentially to create the experience
- **onCompleteFlags**: Optional flags set automatically when the event finishes

## Deep Dive: Event Mechanics

### Step Execution Flow

Events execute their steps **sequentially** in array order:

```typescript
import { GameEvent, EventStep } from 'afnm-types';

const myEvent: GameEvent = {
  location: 'Ancient Library',
  steps: [
    { kind: 'text', text: 'Dust motes dance in the filtered sunlight...' },    // Step 1
    { kind: 'text', text: 'You approach the ancient tome...' },               // Step 2
    { kind: 'speech', character: 'Librarian', text: 'Careful with that!' },   // Step 3
    { kind: 'choice', choices: [...] }                                        // Step 4
  ]
};
```

### Conditional Execution

Steps can include conditions that control when they execute:

```typescript
{
  kind: 'text',
  condition: 'realm >= qiCondensation',  // Only execute if Qi Condensation or higher
  text: 'Your advanced cultivation allows you to sense the tome\'s power.'
}
```

Steps with failing conditions are **skipped**, allowing dynamic content that adapts to player state.

## How Events Are Started

Events can be triggered through multiple pathways:

### Triggered Events

Automatic events that fire based on conditions and player location - see [Triggered Events](triggered-events)

### Character Interactions

Events started by talking to, trading with, or fighting NPCs

### Location Events

Events built into location definitions that activate when visiting

### Quest Steps

Events as part of quest progression and storyline advancement

### Item Usage

Events triggered by using consumable items or special artifacts

### Calendar Events

Time-based events that occur on specific dates or seasons

### Nested Events

Events can start other events as part of their step sequence

## Practical Examples

### Simple Dialogue Event

```typescript
import { GameEvent } from 'afnm-types';

const greetingEvent: GameEvent = {
  location: 'Village Square',
  steps: [
    {
      kind: 'speech',
      character: 'Village Elder',
      text: 'Welcome, young cultivator. What brings you to our humble village?',
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'I seek wisdom and guidance',
          children: [
            {
              kind: 'speech',
              character: 'Village Elder',
              text: 'Wisdom comes to those who listen. Stay awhile and learn.',
            },
          ],
        },
        {
          text: 'I am just passing through',
          children: [
            {
              kind: 'speech',
              character: 'Village Elder',
              text: 'Safe travels, wanderer. May your path be clear.',
            },
          ],
        },
      ],
    },
  ],
};
```

### Complex Storyline Event

```typescript
import { GameEvent } from 'afnm-types';

const mysteriousTome: GameEvent = {
  location: 'Crystal Shore',
  steps: [
    {
      kind: 'text',
      text: 'You discover an ancient tome half-buried in the crystalline sand.',
    },
    {
      kind: 'conditional',
      branches: [
        {
          condition: 'metElderLi >= 1',
          children: [
            {
              kind: 'text',
              text: "You remember Elder Li's warnings about cursed artifacts.",
            },
          ],
        },
      ],
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'Open the tome carefully',
          condition: 'control >= 50',
          children: [
            { kind: 'text', text: 'Your careful approach pays off...' },
            { kind: 'addItem', item: 'Ancient Wisdom Scroll', amount: 1 },
            { kind: 'flag', flag: 'foundSecretTome', value: '1', global: true },
          ],
        },
        {
          text: 'Force the tome open',
          children: [
            { kind: 'text', text: 'The tome crumbles at your rough touch...' },
            { kind: 'flag', flag: 'destroyedTome', value: '1', global: true },
          ],
        },
        {
          text: 'Leave it undisturbed',
          children: [
            {
              kind: 'text',
              text: 'Perhaps some secrets are meant to stay buried.',
            },
            {
              kind: 'flag',
              flag: 'wisdomOfRestraint',
              value: '1',
              global: true,
            },
          ],
        },
      ],
    },
  ],
  onCompleteFlags: [{ flag: 'exploredCrystalShore', value: 1 }],
};
```

## Advanced Techniques

### State-Responsive Events

Create events that adapt to player progression:

```typescript
import { GameEvent } from 'afnm-types';

const adaptiveGreeting: GameEvent = {
  location: 'Sect Grounds',
  steps: [
    {
      kind: 'conditional',
      branches: [
        {
          condition: 'realm >= pillarCreation',
          children: [
            {
              kind: 'text',
              text: 'Fellow disciples bow respectfully to your powerful aura.',
            },
          ],
        },
        {
          condition: 'realm >= meridianOpening',
          children: [
            {
              kind: 'text',
              text: 'Other disciples nod in acknowledgment of your progress.',
            },
          ],
        },
        {
          condition: '1', // Default case
          children: [
            {
              kind: 'text',
              text: 'You feel overwhelmed by the spiritual energy here.',
            },
          ],
        },
      ],
    },
  ],
};
```

### Multi-Path Storylines

Use flags to create branching narratives:

```typescript
import { GameEvent } from 'afnm-types';

const storyProgression: GameEvent = {
  location: 'Mountain Path',
  steps: [
    {
      kind: 'conditional',
      branches: [
        {
          condition: 'helpedVillagers == 1 && foughtBandits == 0',
          children: [
            {
              kind: 'text',
              text: 'The grateful villagers have left supplies for you.',
            },
            { kind: 'addItem', item: 'Village Blessing Charm', amount: 1 },
          ],
        },
        {
          condition: 'foughtBandits == 1 && helpedVillagers == 0',
          children: [
            {
              kind: 'text',
              text: 'Wanted posters with your face are posted along the path.',
            },
            { kind: 'flag', flag: 'reputation', value: 'reputation - 10' },
          ],
        },
      ],
    },
  ],
};
```

### Repeated Events

```typescript
// First-time vs repeat visits
{
  kind: 'conditional',
  branches: [
    {
      condition: 'visitedLocation == 0',
      children: [
        { kind: 'text', text: 'First visit content...' },
        { kind: 'flag', flag: 'visitedLocation', value: '1', global: true }
      ]
    },
    {
      condition: 'visitedLocation >= 1',
      children: [
        { kind: 'text', text: 'Return visit content...' }
      ]
    }
  ]
}
```

Events are the storytelling heart of your mod. Master them, and you'll create immersive, responsive experiences that make each player's cultivation journey unique and memorable.

Continue to: **[Event Steps](event-steps)** to learn about the individual building blocks that make up events.
