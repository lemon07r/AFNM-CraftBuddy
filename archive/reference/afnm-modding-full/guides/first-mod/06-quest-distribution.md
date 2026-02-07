---
layout: default
title: Quest Distribution
parent: Your First Mod
grand_parent: Guides
nav_order: 6
description: 'Setting up triggered events to automatically give quests to players'
---

# Step 6: Quest Distribution

Our quest exists, but players need a way to discover it naturally! We'll create triggered events that automatically give players the quest when they visit Liang Tiao Village:

## Quest Distribution Events

Create `src/modContent/events/teaQuestEvents.ts`:

```typescript
import { TriggeredEvent, GameEvent } from 'afnm-types';
import { restoreTeaHouseQuest } from '../quests/teaQuests';

// Event that gives our tea house quest to players
const teaHouseDiscoveryEvent: GameEvent = {
  location: 'Liang Tiao Village',
  steps: [
    {
      kind: 'text',
      text: 'As you explore Liang Tiao Village, you notice an elderly man sitting by an abandoned building, looking wistful.',
    },
    {
      kind: 'quest',
      quest: restoreTeaHouseQuest.name,
    },
    {
      kind: 'flag',
      flag: 'discoveredTeaQuest',
      value: '1',
      global: true,
    },
  ],
};

// Triggered event that fires when players visit the village
export const teaHouseQuestTrigger: TriggeredEvent = {
  event: teaHouseDiscoveryEvent,
  name: 'teaHouseDiscovery',
  trigger: 'discoveredTeaQuest == 0 && realm >= 2', // Quest not discovered AND Meridian Opening realm (2) or higher
  screens: ['location'], // Only on location screens (entering a location)
  locations: ['Liang Tiao Village'], // Only in this specific location
  triggerChance: 1.0, // 100% chance when conditions are met
};
```

## Why This Structure Works

**Imported quest reference** - We import `restoreTeaHouseQuest` and use `restoreTeaHouseQuest.name` instead of hard-coding the string. This prevents typos and makes refactoring easier.

**Realm-gated discovery** - The quest only triggers for players in Meridian Opening realm (2) or higher. This makes sense because the herb garden (where players can grow tea leaves) unlocks in Meridian Opening, giving them a way to actually complete the quest.

**Natural discovery flow** - Players learn about Master Chen and his situation through exploration.

**One-time trigger** - The `discoveredTeaQuest` flag ensures this event only fires once per player, preventing spam.

**Location-specific** - Only triggers in Liang Tiao Village where Master Chen actually lives.

**Screen targeting** - Only fires on location screens (when entering a location), not during combat or other activities.

**Quest integration** - The `quest` step automatically finds the quest by name and adds it to the player's journal. By using `restoreTeaHouseQuest.name`, we ensure the reference stays correct even if we change the quest's name later.

**Flag management** - Setting `discoveredTeaQuest = 1` prevents the event from firing again and enables Master Chen to appear on the map.

## Registering Quest Events

```typescript
export function initializeTeaQuestEvents() {
  console.log('🎯 Adding tea quest distribution...');

  window.modAPI.actions.addTriggeredEvent(teaHouseQuestTrigger);

  console.log('✅ Added tea house quest trigger');
}
```

## Connect to Your Mod

Update `src/modContent/index.ts`:

```typescript
import { initializeTeaItems } from './items/teaItems';
import { initializeTeaCharacters } from './characters/teaMasters';
import { initializeTeaBrewery } from './locations/teaBrewery';
import { initializeTeaQuests } from './quests/teaQuests';
import { initializeTeaQuestEvents } from './events/teaQuestEvents';

function initializeMysticalTeaGarden() {
  console.log('🍵 Initializing Mystical Tea Garden Mod...');

  // Foundation systems first
  initializeTeaItems();
  initializeTeaCharacters();
  initializeTeaBrewery();

  // Quest content - order matters!
  initializeTeaQuests(); // Quests must exist first
  initializeTeaQuestEvents(); // Then events can reference them

  console.log('✅ Mystical Tea Garden Mod loaded successfully!');
}

initializeMysticalTeaGarden();
```

## What We've Created

Our triggered event creates a natural discovery experience:

1. **Player explores** Liang Tiao Village
2. **Event fires** automatically, adding atmosphere text
3. **Quest appears** in their journal with context
4. **Flag prevents** the event from repeating

This feels much more natural than players having to manually check their quest journal for new content.

## How Triggered Events Work

**Condition checking** - The game constantly evaluates trigger conditions. When `discoveredTeaQuest == 0` is true and the player is in Liang Tiao Village, the event fires.

**Screen filtering** - `screens: ['location']` ensures this only happens during exploration, not combat or dialogue.

**Location filtering** - `locations: ['Liang Tiao Village']` restricts the trigger to just this village.

**Quest integration** - The `quest` step automatically finds "The Forgotten Tea House" by name and adds it to the player's journal.

**Flag management** - Setting `discoveredTeaQuest = 1` prevents the event from firing again.

## Next Steps

Your mod is now functionally complete! Time for [testing and polish](07-testing-polish.md) to ensure everything works smoothly and provides a professional player experience.
