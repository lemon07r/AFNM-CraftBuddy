---
layout: default
title: Adding Characters
parent: Your First Mod
grand_parent: Guides
nav_order: 3
description: 'Creating NPCs with dialogue, shops, and interactions'
---

# Step 3: Adding Characters

Our tea items need someone to sell them! We'll create Master Chen, a friendly tea merchant who:

1. **Sells our tea items** through his shop
2. **Provides educational dialogue** about tea cultivation
3. **Unlocks through quest progression** (shop appears after helping him)

This teaches you how NPCs interact with your items and create meaningful progression in your mod.

## Why Master Chen Works

We're designing Master Chen as a **neutral character** because:

**Accessibility** - All players can interact with him regardless of their cultivation path or faction choices

**Shop integration** - Neutral characters can run shops that sell your custom items to players

**Quest connectivity** - He'll be the central figure in our restoration quest, making the story personal

**Educational role** - His dialogue will teach players about your mod's tea system and benefits

## Creating Master Chen

Create `src/modContent/characters/teaMasters.ts`:

```typescript
import { Character, EventStep } from 'afnm-types';
import {
  greenTeaLeaves,
  jasmineTeaLeaves,
  brewedGreenTea,
  brewedJasmineTea,
} from '../items/teaItems';

export const masterChen: Character = {
  name: 'Master Chen',
  displayName: 'Master Chen',
  allegiance: undefined, // Neutral - available to all players
  bio: 'A wise tea master who has spent decades perfecting the spiritual art of tea cultivation. His knowledge of qi-infused brewing techniques is legendary.',
  condition: 'discoveredTeaQuest == 1', // Only visible after quest starts
  portrait: 'https://placehold.co/256x256/transparent/d98d00?text=Master Chen',
  image: 'https://placehold.co/1536x1536/transparent/d98d00?text=Master Chen',
  definitions: [
    {
      kind: 'neutral',
      condition: '1',
      realm: 'qiCondensation',
      realmProgress: 'Late',

      stats: [], // No combat stats - not sparrable

      // Location - where players can find him
      locations: [
        {
          kind: 'static',
          condition: '1',
          location: 'Liang Tiao Village',
        },
      ],

      encounters: [], // No random encounters

      // What happens when players talk to him
      talkInteraction: [
        {
          condition: '1', // Always available
          event: [
            {
              kind: 'speech',
              character: 'Master Chen',
              text: 'Greetings, young cultivator. I see you found my old tea house... or what remains of it.',
            },
            {
              kind: 'choice',
              choices: [
                {
                  text: 'What happened to this place?',
                  children: [
                    {
                      kind: 'speech',
                      character: 'Master Chen',
                      text: 'Years ago, I ran a thriving tea house here. But time and neglect have taken their toll. The qi has faded from this place.',
                    },
                  ],
                },
                {
                  text: 'Tell me about tea cultivation',
                  children: [
                    {
                      kind: 'speech',
                      character: 'Master Chen',
                      text: 'Tea cultivation requires patience and spiritual awareness. Each leaf must be nurtured with qi to unlock its true potential.',
                    },
                  ],
                },
                {
                  text: 'Farewell, Master Chen',
                  children: [
                    {
                      kind: 'speech',
                      character: 'Master Chen',
                      text: 'May your path bring you wisdom, young cultivator.',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],

      // Shop - only available after quest completion
      shopInteraction: [
        {
          condition: 'teaHouseUnlocked == 1',
          stock: {
            mundane: [],
            bodyForging: [],
            meridianOpening: [greenTeaLeaves],
            qiCondensation: [
              jasmineTeaLeaves,
              brewedGreenTea,
              brewedJasmineTea,
            ],
            coreFormation: [],
            pillarCreation: [],
            lifeFlourishing: [],
            worldShaping: [],
            innerGenesis: [],
            soulAscension: [],
          },
          costMultiplier: 1.2, // 20% markup from base prices
          introSteps: [
            {
              kind: 'speech',
              character: 'Master Chen',
              text: 'Welcome to my restored tea house! Browse my finest leaves and brewed teas.',
            },
          ],
          exitSteps: [
            {
              kind: 'speech',
              character: 'Master Chen',
              text: 'May these teas serve you well in your cultivation.',
            },
          ],
        },
      ],
    },
  ],
};
```

## Why This Structure Works

**Quest-gated visibility** creates discovery gameplay. Master Chen only appears after the quest distribution event fires, making him feel like a discovery rather than just another NPC.

**Dialogue matches the situation** - His opening line acknowledges that players found his "old tea house" and its current abandoned state, which makes narrative sense.

**Progressive unlocking** through quest flags. The shop only opens after completing the restoration quest, giving players a reason to help Master Chen.

**Neutral allegiance** makes Master Chen accessible to all players regardless of their cultivation sect or moral choices.

**Educational dialogue** teaches players about tea cultivation in a way that fits the abandoned tea house context.

## Registering the Character

```typescript
export const allTeaCharacters: Character[] = [masterChen];

export function initializeTeaCharacters() {
  console.log('👤 Adding tea master characters...');

  allTeaCharacters.forEach((character) => {
    window.modAPI.actions.addCharacter(character);
  });

  console.log(`✅ Added ${allTeaCharacters.length} tea characters`);
}
```

All characters must be registered with the [ModAPI](../../concepts/modapi.md#characters-and-backgrounds) to appear in-game.

## Connect to Your Mod

Update `src/modContent/index.ts` to include characters:

```typescript
import { initializeTeaItems } from './items/teaItems';
import { initializeTeaCharacters } from './characters/teaMasters';

function initializeMysticalTeaGarden() {
  console.log('🍵 Initializing Mystical Tea Garden Mod...');

  // Items first - characters reference them in shops
  initializeTeaItems();

  // Characters second - locations will reference them
  initializeTeaCharacters();

  console.log('✅ Mystical Tea Garden Mod loaded successfully!');
}

initializeMysticalTeaGarden();
```

## What We've Created

Master Chen demonstrates a proper quest-driven character discovery:

- **Hidden until discovered** through quest distribution events
- **Contextual dialogue** that matches the abandoned tea house situation
- **Progressive unlocking** where helping him leads to ongoing shop access
- **Educational conversations** about tea cultivation that fit the setting

The narrative flow now works: players discover the abandoned tea house and Master Chen through exploration, learn his story, help restore the tea house, and gain access to his restored shop.

## How Character Interactions Work

**Location conditions** control when characters appear. Master Chen only becomes visible after the `discoveredTeaQuest` flag is set by the quest distribution event.

**Dialogue context** should match the story situation. Master Chen's opening dialogue acknowledges the abandoned state of his tea house rather than welcoming players to a functioning establishment.

**Shop conditions** control when shops become available. Master Chen's shop only opens after the `teaHouseUnlocked` flag is set by completing his restoration quest.

**Character definitions** let you create different versions of the same character for different story states if needed.

## Next Steps

Master Chen needs somewhere to conduct his business! Let's build [the tea house location](04-building-locations.md) where players can:

- Experience the restored atmosphere after completing quests
- Use brewing facilities to transform raw tea leaves
- Access Master Chen's newly opened shop

The location will tie together our items, character, and upcoming quest into a complete player experience.
