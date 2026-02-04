---
layout: default
title: Quest System
parent: Your First Mod
grand_parent: Guides
nav_order: 5
description: 'Creating multi-step quests with events and progression'
---

# Step 5: Quest System

Now we have items, characters, and locations - time to connect them with a quest! We'll create a simple but complete quest that:

1. **Introduces Master Chen** to the player
2. **Creates a goal** - help restore his tea house
3. **Uses our items** - player needs to gather tea leaves
4. **Rewards progression** - unlocks his shop when complete

This demonstrates how quests tie all your mod systems together into a cohesive experience.

## Why This Quest Structure Works

The quest we'll build follows a proven pattern:

**Discovery → Goal → Collection → Reward**

- **Discover Master Chen** - Player finds him by his abandoned tea house via quest distribution
- **Learn his story** - He explains the tea house's history and asks for help
- **Collect tea leaves** - Gives purpose to our items and creates gameplay
- **Unlock the shop** - Creates lasting progression and rewards helping

This structure works because each step naturally leads to the next, and the reward (shop access) makes the effort worthwhile.

## Creating the Tea House Quest

Create `src/modContent/quests/teaQuests.ts`:

```typescript
import { Quest, EventStep } from 'afnm-types';
import { greenTeaLeaves, brewedGreenTea } from '../items/teaItems';

export const restoreTeaHouseQuest: Quest = {
  name: 'The Forgotten Tea House',
  description:
    'Help Master Chen restore his abandoned tea house to its former glory.',
  category: 'side',
  steps: [
    {
      kind: 'speakToCharacter',
      hint: 'Find Master Chen in Liang Tiao Village',
      character: 'Master Chen',
      event: [
        {
          kind: 'speech',
          character: 'Master Chen',
          text: 'Greetings, young cultivator. I see wisdom in your eyes - perhaps you could help an old tea master?',
        },
        {
          kind: 'speech',
          character: 'Master Chen',
          text: 'My tea house has been abandoned for years. If you could bring me 5 Green Tea Leaves, I could brew something special and reopen the establishment.',
        },
        {
          kind: 'text',
          text: 'Master Chen looks hopeful as he explains his situation.',
        },
      ],
    },
    {
      kind: 'collect',
      hint: 'Gather 5 Green Tea Leaves for Master Chen',
      item: greenTeaLeaves.name,
      amount: 5,
    },
    {
      kind: 'speakToCharacter',
      hint: 'Return the tea leaves to Master Chen',
      character: 'Master Chen',
      event: [
        {
          kind: 'choice',
          choices: [
            {
              text: `Give Master Chen the tea leaves (Requires 5 ${greenTeaLeaves.name})`,
              condition: {
                kind: 'item',
                item: { name: greenTeaLeaves.name },
                amount: 5,
              },
              children: [
                {
                  kind: 'removeItem',
                  item: { name: greenTeaLeaves.name },
                  amount: '5',
                },
                {
                  kind: 'speech',
                  character: 'Master Chen',
                  text: 'Perfect! These leaves have excellent qi resonance. Watch as I restore the tea house!',
                },
                {
                  kind: 'text',
                  text: 'With ancient techniques, Master Chen channels qi through the tea leaves, causing the dilapidated building to shimmer and restore itself.',
                },
                {
                  kind: 'flag',
                  flag: 'teaHouseUnlocked',
                  value: '1',
                  global: true,
                },
                {
                  kind: 'speech',
                  character: 'Master Chen',
                  text: 'My shop is now open! Take these brewed teas as thanks for your help.',
                },
                {
                  kind: 'addItem',
                  item: { name: brewedGreenTea.name },
                  amount: '2',
                },
              ],
            },
            {
              text: 'I need to gather more tea leaves first',
              children: [
                {
                  kind: 'speech',
                  character: 'Master Chen',
                  text: 'Take your time. The tea house has waited this long - it can wait a little longer.',
                },
              ],
            },
          ],
        },
      ],
      completionCondition: 'teaHouseUnlocked == 1',
    },
  ],
  rewards: [
    {
      kind: 'item',
      item: { name: brewedGreenTea.name },
      amount: 2,
    },
    {
      kind: 'money',
      amount: 100,
    },
  ],
};
```

## Why This Design Works

This quest structure follows best practices:

**Imported references** - We import items from `teaItems.ts` and use `greenTeaLeaves.name` instead of hard-coding strings like `'Green Tea Leaves'`. This prevents typos, makes refactoring easier, and ensures consistency across your mod.

**Clear progression**: Each step builds on the previous one

- Step 1: Meet Master Chen and learn the problem
- Step 2: Collect what he needs (creates gameplay)
- Step 3: Deliver and see the result

**Proper item checking**: Uses choice conditions to verify the player has the required items before allowing the completion.

**Meaningful consequences**: The quest permanently unlocks Master Chen's shop through the `teaHouseUnlocked` flag.

**Player agency**: Players can choose when to complete the delivery, and there's a polite exit option if they're not ready.

**Reasonable requirements**: Only 5 tea leaves makes the quest feel achievable without being tedious.

## Registering the Quest

```typescript
export function initializeTeaQuests() {
  console.log('📜 Adding tea house quest...');

  window.modAPI.actions.addQuest(restoreTeaHouseQuest);

  console.log('✅ Added The Forgotten Tea House quest');
}
```

## Connect to Your Mod

Update `src/modContent/index.ts`:

```typescript
import { initializeTeaItems } from './items/teaItems';
import { initializeTeaCharacters } from './characters/teaMasters';
import { initializeTeaBrewery } from './locations/teaBrewery';
import { initializeTeaQuests } from './quests/teaQuests';

function initializeMysticalTeaGarden() {
  console.log('🍵 Initializing Mystical Tea Garden Mod...');

  // Dependencies first - items, characters, locations
  initializeTeaItems();
  initializeTeaCharacters();
  initializeTeaBrewery();

  // Quests last - they reference everything else
  initializeTeaQuests();

  console.log('✅ Mystical Tea Garden Mod loaded successfully!');
}

initializeMysticalTeaGarden();
```

## What We've Created

Our quest creates a complete gameplay loop:

1. **Discovery**: Player meets Master Chen in the village
2. **Challenge**: Player must gather tea leaves (interaction with our items)
3. **Resolution**: Quest completion unlocks the shop permanently
4. **Reward**: Player receives immediate items plus ongoing shop access

This demonstrates how quests bind all your mod systems together - items become quest objectives, characters provide the story context, and completion unlocks new features.

## How Quest Progression Works

**Step-by-step advancement**: Each quest step must complete before the next becomes available. The first step introduces Master Chen, the second tracks tea leaf collection, and the third handles the delivery.

**Conditional choices**: The final step uses item conditions to ensure players actually have the required items before allowing completion.

**Completion conditions**: Only the final delivery step needs a `completionCondition` because players might visit Master Chen multiple times before they have enough tea leaves.

## Next Steps

Now we need to [distribute this quest](06-quest-distribution.md) automatically to players, as quests aren't automatically added to the journal. We'll create triggered events that give the quest when players visit Liang Tiao Village.
