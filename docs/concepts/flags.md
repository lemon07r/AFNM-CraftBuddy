---
layout: default
title: Flags System
parent: Core Concepts
nav_order: 1
description: 'State management and tracking in AFNM mods'
---

# Flags System

## Introduction

Flags are the backbone of state management in Ascend from Nine Mountains. They serve as the game's memory system, allowing you to track player choices, quest progress, character interactions, and any other persistent or temporary data your mod needs to remember.

Think of flags as a simple database where you can store numbers and retrieve them later to make decisions about how events unfold.

## Core Concepts

### What Are Flags?

Flags are **key-value pairs** consisting of:

- **Key**: A unique string identifier (e.g., `"playerMetElder"`)
- **Value**: A numeric value that can represent booleans, counters, or complex data

### Flag Types

**Global Flags**

- Persist across the entire game session
- Saved permanently with the game state
- Use for: player progress, unlocked content, important choices

**Event Flags**

- Temporary storage during event sequences
- Automatically cleared when the event ends
- Use for: dialogue branches, temporary calculations, step-by-step logic

## Deep Dive: Flag Mechanics

### Setting Flag Values

When you set a flag, the `value` field is evaluated as a mathematical expression, and the resulting number is stored:

```typescript
{
  kind: 'flag',
  flag: 'questProgress',
  value: 'questProgress + 1',  // Evaluates current value + 1
  global: true
}
```

**Expression Examples:**

```typescript
value: '1'; // Stores: 1
value: 'month'; // Stores: current month (e.g., 15)
value: 'existingFlag + 1'; // Stores: previous value + 1
value: 'power * 2'; // Stores: player's power × 2
```

### Reading Flags in Conditions

Use flags in `condition` strings to control event flow:

```typescript
// Simple boolean check
condition: 'playerMetBoss == 1';

// Numeric comparison
condition: 'questProgress >= 5';

// Complex logic with multiple flags
condition: 'playerLevel >= 10 && hasWeapon == 1';

// Mathematical operations
condition: 'totalScore >= requiredScore * 2';
```

## Practical Examples

### Tracking First Meetings

```typescript
{
  kind: 'conditional',
  branches: [
    {
      condition: 'metElderLi == 0',
      children: [
        {
          kind: 'text',
          text: 'You encounter Elder Li for the first time.'
        },
        {
          kind: 'flag',
          flag: 'metElderLi',
          value: '1',
          global: true
        }
      ]
    },
    {
      condition: 'metElderLi >= 1',
      children: [
        {
          kind: 'text',
          text: 'Elder Li greets you warmly.'
        }
      ]
    }
  ]
}
```

### Progressive Counters

```typescript
// Increment helper counter
{
  kind: 'flag',
  flag: 'helpedPeople',
  value: 'helpedPeople + 1',
  global: true
}

// Check reputation threshold
{
  kind: 'conditional',
  branches: [
    {
      condition: 'helpedPeople >= 5',
      children: [
        {
          kind: 'text',
          text: 'Your reputation for kindness precedes you.'
        }
      ]
    }
  ]
}
```

### Time-Based Logic

```typescript
// Remember when something happened
{
  kind: 'flag',
  flag: 'festivalMonth',
  value: 'month',
  global: true
}

// Check elapsed time
{
  kind: 'conditional',
  branches: [
    {
      condition: 'month - festivalMonth >= 6',
      children: [
        {
          kind: 'text',
          text: 'Half a year has passed since the festival.'
        }
      ]
    }
  ]
}
```

## Built-in Game Flags

The game automatically provides numerous flags representing the current game state:

### Player Stats

- `power`, `defense`, `barrier`, `control`, `intensity` - Combat and crafting stats
- `qi`, `maxqi`, `qiDroplets` - Qi management
- `realm`, `realmProgress` - Cultivation level
- `money`, `spiritstones`, `favour` - Resources

### Time and Calendar

- `year`, `yearMonth`, `day` - Current game time

### Inventory and Equipment

- Item names as flags (with proper conversion)
- `storage_` + item flag - Storage quantities
- `equipped_` + item flag - Equipment status
- `recipe_` + item flag - Known recipes

### Character State

- `age`, `lifespan`, `injured` - Character condition
- Affinity levels: `fist`, `weapon`, `blossom`, `celestial`, `cloud`, `blood`

## Advanced Techniques

### Flag Helper Function

For items with complex names, use the `flag()` helper to convert names to valid flag keys:

```typescript
const flag = window.modAPI.utils.flag;

// Convert item names properly
flag('Greater Spirit Grass'); // becomes: 'Greater_Spirit_Grass'
flag('Corrupt Void Key (III)'); // becomes: 'Corrupt_Void_Key__III_'

// Use in conditions
condition: `${flag(itemName)} >= 5`;
condition: `storage_${flag(itemName)} > 0`;
```

### Organized Flag Management

```typescript
// Define flag constants for maintainability
export const modFlags = {
  playerMetMaster: 'myMod_playerMetMaster',
  questProgress: 'myMod_questProgress',
  specialChoice: 'myMod_specialChoice',
};

// Use in events
{
  kind: 'flag',
  flag: modFlags.playerMetMaster,
  value: '1',
  global: true
}
```

## Tips and Best Practices

### Naming Conventions

- **Prefix your flags**: Use `myMod_flagName` to avoid conflicts
- **Use descriptive names**: `completedIntroQuest` not `flag1`
- **Be consistent**: Establish patterns and stick to them

### Storage Strategy

- **Global flags** for persistent data: player choices, progress, unlocks
- **Event flags** for temporary state: dialogue options, calculations
- **Document your flags**: Keep track of meanings and possible values

### Common Patterns

```typescript
// Boolean flags (0 = false, 1 = true)
condition: 'hasKeyItem == 1';

// Threshold checks for progression
condition: 'questStage >= 3';

// Time-based unlock conditions
condition: 'month >= 6 && completedPreQuest == 1';

// Resource requirement checks
condition: 'money >= 1000 && power >= 50';
```

The flags system is incredibly flexible and powerful. Master it, and you'll be able to create dynamic, responsive content that adapts to each player's unique journey through your mod.
