---
layout: default
title: Triggered Events
parent: Events System
nav_order: 3
description: 'Automatic event triggering system'
---

# Triggered Events

## Introduction

Triggered Events provide a powerful system for automatically starting [Events](events) based on specific conditions and player context. They watch for opportunities to fire events when players are on certain screens, at specific locations, or when particular conditions are met.

This system enables dynamic, responsive content that enhances the player experience without requiring manual interaction - from location introductions and random encounters to progression gates and recurring seasonal events.

## Understanding Triggered Events

A **TriggeredEvent** wraps a [GameEvent](events) with trigger conditions that control when and where it activates automatically:

```typescript
import {
  TriggeredEvent,
  GameEvent,
  GameScreen,
} from 'afnm-types';

interface TriggeredEvent {
  event: GameEvent; // The actual event content to execute
  name: string; // Unique identifier for this trigger
  trigger: string; // Condition expression for when to trigger
  screens: GameScreen[]; // Which game screens this can activate on
  locations?: string[]; // Optional: specific locations for triggering
  triggerChance?: number; // Optional: random chance (0.0-1.0) to trigger
  resetMonths?: {
    // Optional: cooldown between triggers. If not specified, a trigger can only ever run once
    min: number;
    max: number;
  };
  usesCooldown?: boolean; // Optional: uses global encounter cooldown (3 days)
}
```

## Deep Dive: Trigger Mechanics

### How Triggered Events Work

1. **Context Evaluation** - Game checks all TriggeredEvents for current screen/location combination
2. **Condition Testing** - Evaluates `trigger` expression using current [flags](../concepts/flags) and game state
3. **Random Chance** - Applies `triggerChance` probability if specified
4. **Cooldown Verification** - Ensures cooldown period has passed since last trigger
5. **Event Execution** - Processes the GameEvent's steps in sequence if all conditions pass

### Trigger Conditions

The `trigger` field uses [flag expressions](../concepts/flags) to determine when an event can fire:

```typescript
// Simple conditions
trigger: '1'; // Always trigger when other conditions met
trigger: 'tutorialComplete == 0'; // Only if tutorial hasn't been completed
trigger: 'realm >= coreFormation'; // Only for Core Formation realm or higher

// Complex conditions
trigger: 'realm >= qiCondensation && visitedLocation == 0'; // High realm, first visit
trigger: 'power >= 100 && hasSpecialItem == 1'; // Strong with specific item
trigger: 'yearMonth >= 6 && yearMonth <= 8'; // Summer months only
```

### Screen and Location Targeting

**Screen Targeting** - The `screens` array specifies which game screens can trigger this event:

```typescript
screens: ['location']; // Location/exploration screen only
screens: ['market', 'home']; // Market or home screen
screens: ['location', 'inventory']; // Location or inventory screen
```

**Common Screen Types:**

- `'location'` - Location/exploration screen
- `'market'` - Marketplace screen
- `'inventory'` - Inventory management screen
- `'home'` - Home/rest screen
- `'crafting'` - Crafting interface
- `'techniques'` - Technique management

**Location Targeting** - The optional `locations` array restricts triggering to specific places:

```typescript
locations: ['Crystal Shore']; // Only at Crystal Shore
locations: ['Sect Grounds', 'Ancient Library']; // Multiple specific locations
// Omit locations array = can trigger anywhere (if screen matches)
```

## Practical Examples

### Location Introduction Event

Perfect for first-time location visits:

```typescript
import { GameEvent, TriggeredEvent } from 'afnm-types';

const ancientLibraryIntro: GameEvent = {
  location: 'Ancient Library',
  steps: [
    {
      kind: 'text',
      text: 'Towering shelves stretch into shadow, filled with countless scrolls and tomes. The air itself seems heavy with accumulated knowledge.',
    },
    {
      kind: 'speech',
      character: 'Ancient Librarian',
      text: 'Welcome, seeker. These halls have waited long for one with your... potential.',
    },
    {
      kind: 'flag',
      flag: 'discoveredAncientLibrary',
      value: '1',
      global: true,
    },
  ],
};

const libraryIntroTrigger: TriggeredEvent = {
  event: ancientLibraryIntro,
  name: 'ancientLibraryFirstVisit',
  trigger: 'discoveredAncientLibrary == 0', // First visit only
  screens: ['location'],
  locations: ['Ancient Library'],
};

// Register with your mod
window.modAPI.actions.addTriggeredEvent(libraryIntroTrigger);
```

### Random Encounter System

Create chance-based encounters while exploring:

```typescript
import { GameEvent, TriggeredEvent } from 'afnm-types';

const mysteriousStranger: GameEvent = {
  location: 'Mountain Path',
  steps: [
    {
      kind: 'text',
      text: 'A hooded figure emerges from the mountain mists, blocking your path.',
    },
    {
      kind: 'speech',
      character: 'Mysterious Cultivator',
      text: 'Your cultivation shows promise. Perhaps you are worthy of this test...',
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'Accept the challenge',
          children: [
            //...
          ],
        },
        {
          text: 'Politely decline',
          children: [
            {
              kind: 'speech',
              character: 'Mysterious Cultivator',
              text: "Wisdom in knowing one's limits. We shall meet again.",
            },
          ],
        },
      ],
    },
  ],
};

const strangerEncounter: TriggeredEvent = {
  event: mysteriousStranger,
  name: 'mountainPathStranger',
  trigger: 'realm >= meridianOpening',
  screens: ['location'],
  locations: ['Mountain Path', 'High Peaks'],
  triggerChance: 0.15, // 15% chance when conditions met
  resetMonths: { min: 2, max: 4 }, // 2-4 months between encounters
  usesCooldown: true, // Uses global encounter cooldown
};
```

### Progression Gate Event

Trigger story events when player reaches milestones:

```typescript
const realmBreakthroughCelebration: GameEvent = {
  location: 'Sect Grounds',
  steps: [
    {
      kind: 'text',
      text: 'Your breakthrough to Core Formation sends ripples through the sect. Fellow disciples gather to witness your transformed spiritual presence.',
    },
    {
      kind: 'speech',
      character: 'Sect Master',
      text: 'Excellent progress! Your dedication has earned you access to the Inner Sanctum.',
    },
    {
      kind: 'unlockLocation',
      location: 'Inner Sanctum',
    },
    {
      kind: 'addItem',
      item: 'Core Formation Recognition Token',
      amount: 1,
    },
  ],
};

const breakthroughTrigger: TriggeredEvent = {
  event: realmBreakthroughCelebration,
  name: 'coreFormationCelebration',
  trigger: 'realm >= coreFormation && coreFormationCelebrated == 0', // Just reached Core Formation
  screens: ['location', 'home'],
  locations: ['Sect Grounds'],
};
```

### Seasonal/Timed Events

Create events that occur during specific time periods:

```typescript
const springFestival: GameEvent = {
  location: 'Village Square',
  steps: [
    {
      kind: 'text',
      text: 'The annual Spring Blossom Festival fills the village with celebration. Colorful banners flutter in the warm breeze.',
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'Participate in the cultivation contest',
          children: [
            {
              kind: 'text',
              text: 'You demonstrate your techniques to enthusiastic crowds.',
            },
            {
              kind: 'flag',
              flag: 'springFestivalParticipant',
              value: '1',
              global: true,
            },
          ],
        },
        {
          text: 'Enjoy the festivities quietly',
          children: [
            {
              kind: 'text',
              text: 'You find peace in observing the joyful celebrations.',
            },
          ],
        },
      ],
    },
  ],
};

const festivalTrigger: TriggeredEvent = {
  event: springFestival,
  name: 'springBlossomFestival',
  trigger: 'yearMonth == 3', // The third month, once per year
  screens: ['location'],
  locations: ['Village Square'],
  resetMonths: { min: 12, max: 12 }, // Annual event
};
```

## Advanced Techniques

### Multi-Stage Story Events

Use flags to create continuing storylines:

```typescript
// First encounter
const mysteryBegins: TriggeredEvent = {
  event: {
    location: 'Forest Path',
    steps: [
      {
        kind: 'text',
        text: 'You discover strange tracks leading deeper into the forest.',
      },
      { kind: 'flag', flag: 'mysteryTracks', value: '1', global: true },
    ],
  },
  name: 'mysteryTracksDiscovery',
  trigger: 'mysteryTracks == 0',
  screens: ['location'],
  locations: ['Forest Path'],
  triggerChance: 0.3,
};

// Follow-up encounter
const mysteryDeepens: TriggeredEvent = {
  event: {
    location: 'Deep Forest',
    steps: [
      {
        kind: 'text',
        text: "The tracks lead to an abandoned cultivator's retreat.",
      },
      { kind: 'flag', flag: 'foundRetreat', value: '1', global: true },
    ],
  },
  name: 'mysteryRetreatDiscovery',
  trigger: 'mysteryTracks >= 1 && foundRetreat == 0',
  screens: ['location'],
  locations: ['Deep Forest'],
};
```

### Conditional Complexity

Create sophisticated triggering logic:

```typescript
const masterEncounter: TriggeredEvent = {
  event: masterTeachingEvent,
  name: 'hiddenMasterAppears',
  trigger: `
    realm >= coreFormation && 
    power >= 200 && 
    (helpedVillagers >= 5 || defeatedBandits >= 3) &&
    visitedAllBasicLocations == 1 &&
    masterEncountered == 0
  `, // Complex multi-condition trigger
  screens: ['location'],
  triggerChance: 0.4,
  resetMonths: { min: 6, max: 12 },
};
```

### Dynamic Location Targeting

Use arrays for flexible location targeting:

```typescript
const wanderingMerchant: TriggeredEvent = {
  event: merchantEvent,
  name: 'wanderingMerchantAppears',
  trigger: '1', // Always available
  screens: ['location'],
  locations: [
    'Village Square',
    'Town Center',
    'Crossroads',
    'Market District',
    'Sect Gates',
  ], // Can appear at multiple trading locations
  triggerChance: 0.05, // Rare encounter
  resetMonths: { min: 1, max: 3 },
};
```

## When to Use Triggered Events

Triggered Events are ideal for:

### **Location Introductions**

First-time visit events that set atmosphere and context

### **Random Encounters**

Chance-based events that add unpredictability to exploration

### **Progression Gates**

Events that fire when players reach certain milestones or achievements

### **Recurring Events**

Events that repeat with cooldowns - seasonal festivals, merchant visits, etc.

### **Contextual Events**

Events specific to certain screens, locations, or game states

### **Atmospheric Events**

Background events that enhance immersion without requiring direct interaction

## Alternative Event Triggering

Remember, TriggeredEvents are just one way to start events. Events can also be initiated through:

- **Character Interactions** - Talking to, trading with, or fighting NPCs
- **Location Events** - Built into location definitions for guaranteed triggers
- **Quest Steps** - Events as part of structured quest progression
- **Calendar Events** - Scheduled events tied to specific dates
