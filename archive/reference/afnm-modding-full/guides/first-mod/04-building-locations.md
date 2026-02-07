---
layout: default
title: Building Locations
parent: Your First Mod
grand_parent: Guides
nav_order: 4
description: 'Creating interactive buildings and location content'
---

# Step 4: Building Locations

With items and characters ready, we need a place for players to interact with them. We'll create Master Chen's tea house as a custom building that transforms raw tea leaves into consumables and provides access to his shop.

## Why Custom Buildings?

We'll use a [custom building](../../locations/building-types.md#custom-building) because we need:

- **Interactive brewing system** - Transform raw materials through player choices
- **Character integration** - Access Master Chen's dialogue and shop
- **Quest progression** - Building only appears after restoration quest

## Creating the Tea House

Create `src/modContent/locations/teaBrewery.ts`:

```typescript
import { CustomBuilding, EventStep } from 'afnm-types';
import {
  greenTeaLeaves,
  jasmineTeaLeaves,
  brewedGreenTea,
  brewedJasmineTea,
} from '../items/teaItems';

// Tea House Interactive Events
const teaHouseSteps: EventStep[] = [
  {
    kind: 'text',
    text: "You enter Master Chen's restored tea house. The atmosphere is serene, with the gentle aroma of carefully brewed teas filling the air.",
  },
  {
    kind: 'choice',
    choices: [
      {
        text: `Brew Green Tea (Requires 3 ${greenTeaLeaves.name})`,
        condition: {
          kind: 'item',
          item: { name: greenTeaLeaves.name },
          amount: 3,
        },
        children: [
          {
            kind: 'removeItem',
            item: { name: greenTeaLeaves.name },
            amount: '3',
          },
          {
            kind: 'addItem',
            item: { name: brewedGreenTea.name },
            amount: '1',
          },
          {
            kind: 'text',
            text: 'You carefully steep the green tea leaves in perfectly heated water. The gentle brewing process creates a calming, aromatic tea.',
          },
        ],
      },
      {
        text: `Brew Jasmine Tea (Requires 2 ${jasmineTeaLeaves.name})`,
        condition: {
          kind: 'item',
          item: { name: jasmineTeaLeaves.name },
          amount: 2,
        },
        children: [
          {
            kind: 'removeItem',
            item: { name: jasmineTeaLeaves.name },
            amount: '2',
          },
          {
            kind: 'addItem',
            item: { name: brewedJasmineTea.name },
            amount: '1',
          },
          {
            kind: 'text',
            text: "The delicate jasmine flowers release their essence into the hot water, creating a spiritually uplifting brew that enhances one's qi awareness.",
          },
        ],
      },
      {
        text: 'Learn about tea brewing techniques',
        children: [
          {
            kind: 'text',
            text: 'Master Chen explains: "The art of tea brewing is meditation in motion. Each leaf must be treated with respect, each temperature precisely controlled. Only through harmony between cultivator and tea can true spiritual benefits be achieved."',
          },
        ],
      },
      {
        text: 'Talk to Master Chen',
        children: [
          {
            kind: 'talkToCharacter',
            character: 'Master Chen',
          },
        ],
      },
      {
        text: "Visit Master Chen's shop",
        children: [
          {
            kind: 'tradeWithCharacter',
            character: 'Master Chen',
          },
        ],
      },
      {
        text: 'Leave the tea house',
        children: [
          {
            kind: 'text',
            text: 'You bow respectfully and leave the peaceful tea house.',
          },
        ],
      },
    ],
  },
];

// Tea House Building Definition
export const teaHouseBuilding: CustomBuilding = {
  kind: 'custom',
  name: "Master Chen's Tea House",
  icon: 'https://placehold.co/256x256/transparent/d98d00?text=Tea House',
  position: 'middleright',
  condition: 'teaHouseUnlocked == 1',
  eventSteps: teaHouseSteps,
};

export function initializeTeaBrewery() {
  console.log('🍵 Adding tea house to Liang Tiao Village...');

  // Add building to existing location
  const liangTiaoVillage =
    window.modAPI.gameData.locations['Liang Tiao Village'];

  if (liangTiaoVillage) {
    if (!liangTiaoVillage.buildings) {
      liangTiaoVillage.buildings = [];
    }
    liangTiaoVillage.buildings.push(teaHouseBuilding);
    console.log('✅ Added Tea House building to Liang Tiao Village');
  } else {
    console.warn('⚠️ Liang Tiao Village not found');
  }
}
```

## Why This Works

**Imported references** - We import items and use `greenTeaLeaves.name` instead of hard-coding strings like `'Green Tea Leaves'`. This prevents typos, ensures consistency, and makes refactoring much easier.

**Custom building structure** gives us complete control over player interactions:

- **EventSteps array** - Creates interactive brewing system instead of simple purchases
- **Condition-based visibility** - Building only appears after quest completion
- **Character integration** - Links to Master Chen's dialogue and shop systems

**Item-based crafting** creates meaningful resource conversion:

- **3:1 ratios** prevent exploitation while making brewing worthwhile
- **Visible requirements** teach players what they need without guessing
- **Strategic choices** about when to use raw materials vs save for brewing

**Defensive programming** ensures mod compatibility:

- **Location existence checks** prevent crashes when locations change
- **Array initialization** handles missing building arrays safely
- **Push instead of replace** preserves other mods' buildings

## Registering the Building

Update `src/modContent/index.ts` to initialize the tea house:

```typescript
import { initializeTeaItems } from './items/teaItems';
import { initializeTeaCharacters } from './characters/teaMasters';
import { initializeTeaBrewery } from './locations/teaBrewery';

function initializeMysticalTeaGarden() {
  console.log('🍵 Initializing Mystical Tea Garden Mod...');

  // Order is critical for dependencies
  initializeTeaItems(); // Items first
  initializeTeaCharacters(); // Characters second (reference items)
  initializeTeaBrewery(); // Locations third (reference items & characters)

  console.log('✅ Mystical Tea Garden Mod loaded successfully!');
}
```

Buildings must be added after items and characters since they reference both through the [ModAPI](../../concepts/modapi.md#game-data-access).

## Next Steps

With our interactive tea house complete, we need quests to guide players through discovering it. Let's create [the quest system](05-quest-system.md) that will unlock the tea house and provide meaningful progression.
