---
layout: default
title: Mod Development
parent: Guides
nav_order: 2
description: 'Building content with the AFNM ModAPI'
---

# Mod Development

## What You'll Learn

In this guide, you'll learn to use the ModAPI (Mod Application Programming Interface) - think of it as your toolkit for adding content to the game. You'll create your first items, understand how the game stores data, and see how everything connects together.

**By the end of this guide, you'll have:**

- Created your first custom item
- Understood how the game organizes content
- Learned the basic patterns for adding content

## How Modding Works in AFNM

### The Big Picture

When you create a mod, you're essentially writing instructions that tell the game:

1. **"Here's new content I want to add"** (items, NPCs, locations, etc.)
2. **"Here's where players can find it"** (shops, quests, drops, etc.)
3. **"Here's how it should behave"** (effects, interactions, etc.)

The game reads your instructions when it starts up and integrates your content seamlessly.

### Your Mod's Entry Point

All mods start from one file: **`src/modContent/index.ts`**

This is like the front door to your mod - the game looks here first to find all your content. You can organize your mod across multiple files, but they must all be imported into this main file.

## Understanding the ModAPI

The ModAPI is your connection to the game's systems. It's available globally as `window.modAPI` and has three main sections:

### 1. `gameData` - What's Already in the Game

```typescript
window.modAPI.gameData;
```

This is like a giant catalog of everything that already exists in the game:

- `items` - All existing items (weapons, consumables, artifacts, etc.)
- `characters` - NPCs you can interact with
- `locations` - All areas in the game world
- `techniques` - Combat and cultivation abilities
- `quests` - Available questlines
- And much more...

**Think of this as read-only information.** You can look at what exists, but you shouldn't modify it directly.

**Example - Looking at existing content:**

```typescript
// See all existing items
console.log(window.modAPI.gameData.items);

// Check if a specific item exists
const healingPill = window.modAPI.gameData.items['Healing Pill'];
console.log(healingPill.description); // Shows the item's description
```

### 2. `actions` - Adding Your Content to the Game

```typescript
window.modAPI.actions;
```

These are the functions that actually add your content to the game. Think of them as "registration functions" - they tell the game about your new creations.

**Core Content Functions:**

- `addItem(item)` - Register a new item
- `addCharacter(character)` - Add an NPC
- `addLocation(location)` - Create new areas
- `addTechnique(technique)` - Add cultivation abilities
- `addQuest(quest)` - Create questlines

**Integration Functions:**

- `addItemToShop(item, quantity, location, ...)` - Make items purchasable
- `addItemToAuction(item, chance, condition, ...)` - Add to auction house
- `linkLocations(existing, newLocation)` - Connect areas together
- `addCalendarEvent(event)` - Add seasonal/timed events

**Golden Rule:** Always `add` your content before using it elsewhere.

For example, to create a purchasable item:

1. First: `addItem(myItem)` - Register the item
2. Then: `addItemToShop(myItem, ...)` - Make it buyable

### 3. `utils` - Helper Functions

```typescript
window.modAPI.utils;
```

These are convenience functions that handle common tasks and help with game balance:

**Enemy Scaling:**

- `alpha(enemy)` - Create stronger variant (+50% stats)
- `realmbreaker(enemy)` - Create cross-realm variants
- `corrupted(enemy)` - Add corruption effects

**Quest Templates:**

- `createCullingMission(...)` - "Kill X enemies" quest
- `createDeliveryMission(...)` - "Fetch/deliver item" quest
- `createHuntQuest(...)` - "Hunt specific enemy" quest

**Balance Helpers:**

- `getExpectedPower(realm, progress)` - Recommended combat stats
- `getExpectedHealth(realm, progress)` - HP scaling by level
- `getNumericReward(base, realm, progress)` - Scale rewards properly

**Why use these?** They ensure your content fits well with the game's existing balance and difficulty curve.

## Your First Item - Step by Step

Let's create your first mod content: a simple combat pill that restores health and provides a temporary power boost, similar to the healing pills already in the game.

### Step 1: Prepare Your Assets

First, you'll need an image for your item.

**Add an image:**

1. Find or create an image (256x256 pixels recommended, but anything square works) for your combat pill
2. Save it as `src/assets/vigor-pill.png`
3. **If you don't have an image:** You can temporarily use any small `.png` file just to test

### Step 2: Create the Item Code

Open **`src/modContent/index.ts`** and replace the contents with:

```typescript
import { CombatPillItem } from 'afnm-types';
// Import your item's image
import pillIcon from '../assets/vigor-pill.png';

// Define your item's properties
const vigorPill: CombatPillItem = {
  name: 'Vigor Pill',
  description:
    'A carefully refined pill that restores health and grants temporary strength. Popular among cultivators entering combat.',
  icon: pillIcon,
  rarity: 'mundane', // Valid rarities: 'mundane', 'qitouched', 'empowered', 'resplendent', 'incandescent', 'transcendent'
  kind: 'pill',
  pillKind: 'combat', // Pills need this additional classification
  toxicity: 10, // Pills have toxicity (how much they poison you)
  realm: 'bodyForging', // What realm this pill is designed for
  stacks: 1,
  effects: [
    {
      kind: 'heal', // Direct healing effect
      amount: {
        value: 50, // Restores 50 health when consumed
        stat: undefined,
      },
    },
  ],
};

// Register the item with the game
window.modAPI.actions.addItem(vigorPill);

// Make it available for purchase
window.modAPI.actions.addItemToShop(
  vigorPill,
  12, // 12 items in stock
  'Liang Tiao Village', // Location name (this location exists in the base game)
  'bodyForging', // Minimum cultivation realm required
);
```

### Understanding the Code

Let's break down what each part does:

**Import Statement:**

```typescript
import pillIcon from '../assets/vigor-pill.png';
```

This tells the build system to include your image file and gives you a reference to use later.

**Pill Item Definition:**

```typescript
const vigorPill: CombatPillItem = {
  //...
};
```

**Property Details:**

- `name`: Display name in-game
- `description`: Flavour text shown to players
- `icon`: Reference to your image
- `rarity`: Affects text color and power ('mundane', 'qitouched', 'empowered', 'resplendent', 'incandescent', 'transcendent')
- `kind`: Type of item ('pill', 'weapon', 'armour', 'artefact', etc.)
- `pillKind`: For pills only - 'combat', 'crafting', etc.
- `toxicity`: How much toxicity consuming this pill costs
- `realm`: What cultivation realm the pill is designed for
- `effects`: What happens when used (see **[Techniques](../combat/techniques)**)

**Registration:**

```typescript
window.modAPI.actions.addItem(vigorPill);
```

This tells the game "this item exists now."

**Shop Integration:**

```typescript
window.modAPI.actions.addItemToShop(...)
```

This makes your item purchasable in the specified location.

### Step 3: Test Your First Item

Let's test this basic version before adding more complexity:

**Build your mod:**

```bash
npm run build
```

**Expected result:** You should see a new ZIP file in your `builds/` folder.

**If you get errors:** Check that:

- Your image file exists at `src/assets/vigor-pill.png`
- There are no typos in your code
- VS Code isn't showing any red error underlines

## Working with Assets (Images)

### File Organization

```
src/assets/
├── items/
│   ├── vigor-pill.png
│   ├── strength-pill.png
│   └── healing-pill.png
├── characters/
│   └── pill-master-chen.png
└── locations/
    └── ancient-alchemy-hall.jpg
```

### Import Patterns

```typescript
// Single import
import pillIcon from '../assets/items/vigor-pill.png';

// Multiple imports
import strengthPillIcon from '../assets/items/strength-pill.png';
import pillMasterPortrait from '../assets/characters/pill-master-chen.png';
import alchemyHallBackground from '../assets/locations/ancient-alchemy-hall.jpg';
```

### Image Guidelines

- **Size:** 256x256 pixels for items, 1536x1536 for characters
- **Format:** PNG with transparency preferred
- **Style:** Should match the game's art style if possible
- **Naming:** Use kebab-case (my-item.png) for consistency

## Organizing Your Mod

As your mod grows beyond a single item, you'll want to organize your code into separate files.

### Recommended Structure

```typescript
// src/modContent/index.ts (main entry point)
import { initializeItems } from './items';
import { initializeCharacters } from './characters';
import { initializeLocations } from './locations';

// Initialize all content when mod loads
initializeItems();
initializeCharacters();
initializeLocations();
```

```typescript
// src/modContent/items.ts
import { CombatPillItem } from 'afnm-types';
import pillIcon from '../assets/items/vigor-pill.png';
import strengthPillIcon from '../assets/items/strength-pill.png';

export function initializeItems() {
  // Create your items
  const vigorPill: CombatPillItem = {
    name: 'Vigor Pill',
    kind: 'pill',
    pillKind: 'combat',
    toxicity: 10,
    realm: 'bodyForging',
    rarity: 'mundane',
    stacks: 1,
    icon: pillIcon,
    description: 'A healing pill.',
    effects: [
      {
        kind: 'heal',
        amount: {
          value: 50,
          stat: undefined,
        },
      },
    ],
  };

  const strengthPill: CombatPillItem = {
    name: 'Strength Pill',
    kind: 'pill',
    pillKind: 'combat',
    toxicity: 15,
    realm: 'coreFormation',
    rarity: 'qitouched',
    stacks: 1,
    icon: strengthPillIcon,
    description: 'A pill that boosts power temporarily.',
    effects: [
      {
        kind: 'buffSelf',
        buff: {
          name: 'Strength Boost',
          icon: strengthPillIcon,
          canStack: false,
          buffType: 'Pill',
          stats: {
            power: {
              value: 100,
              stat: undefined,
            },
          },
          onTechniqueEffects: [],
          onRoundEffects: [
            {
              kind: 'add',
              amount: {
                value: -1,
                stat: undefined,
              },
            },
          ],
          stacks: 1,
        },
        amount: {
          value: 10,
          stat: undefined,
        },
      },
    ],
  };

  // Register them all
  window.modAPI.actions.addItem(vigorPill);
  window.modAPI.actions.addItem(strengthPill);

  // Add to shops
  window.modAPI.actions.addItemToShop(
    vigorPill,
    15,
    'Liang Tiao Village',
    'bodyForging',
  );
  window.modAPI.actions.addItemToShop(
    strengthPill,
    8,
    'Liang Tiao Village',
    'coreFormation',
  );
}
```

### Why Organize This Way?

**Benefits:**

- Easier to find and edit specific content
- Multiple people can work on different files
- Reduces merge conflicts when using Git
- Makes debugging easier when things go wrong

**When to split:**

- More than ~5 items in one category
- Different team members working on different content types
- Content has complex inter-relationships

## Scaling and Game Balance

### Using Balance Helpers

The game provides utility functions to keep your content balanced:

```typescript
// Create appropriately scaled rewards
const rewardAmount = window.modAPI.utils.getNumericReward(
  100, // Base amount
  'coreFormation', // Player's realm
  'Middle', // Progress through realm ('Early', 'Middle', 'Late')
);

// Result: automatically scaled number appropriate for core formation cultivators
```

## Next Steps

🎉 **Great work!** You've learned the fundamentals of AFNM modding:

**You now understand:**

- ✅ How the ModAPI works (`gameData`, `actions`, `utils`)
- ✅ Creating and registering items
- ✅ Working with images and assets
- ✅ Organizing mod code across files
- ✅ Basic game balance concepts

**Ready for more?** Your mod is functional but needs to be packaged for the game to load it.

Continue to: **[Packaging & Testing](packaging-testing)**
