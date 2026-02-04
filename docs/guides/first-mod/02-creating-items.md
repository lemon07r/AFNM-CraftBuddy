---
layout: default
title: Creating Items
parent: Your First Mod
grand_parent: Guides
nav_order: 2
description: 'Building your first items with buffs and effects'
---

# Step 2: Creating Items

For our tea house mod, we need items that players can actually interact with. Let's think about what a tea house would offer:

1. **Tea ingredients** that players can collect or buy
2. **Finished teas** that players can drink for benefits

This gives us a natural progression: raw materials → finished products. Players can collect tea leaves, then buy or brew finished teas for buffs.

## Why These Item Types?

We'll create two types of items:

**Material items** (`CraftingItem`) - These are ingredients like tea leaves. We use the 'material' kind because:

- Players can gather/buy them in bulk (high stack counts)
- Other systems (NPCs, crafting) can reference them as ingredients
- They represent the "input" side of our tea economy

**Consumable items** (`CombatItem`) - These are finished teas players drink. We use 'consumable' because:

- They provide temporary buffs when used
- They have limited uses (encouraging repeated purchases)
- They represent the "output" side - the reason players want tea leaves

## Images

Note, for this example mod we will be using placeholder images from [placehold.co](https://placehold.co/). For an actual mod, replace those images with real ones of the same resolution.

## Creating Our Tea Items

Create `src/modContent/items/teaItems.ts`:

```typescript
import { CraftingItem, CombatItem, Buff } from 'afnm-types';

// First, we need buff definitions for our consumables
export const calmMindBuff: Buff = {
  name: 'Calm Mind',
  icon: 'https://placehold.co/256x256/transparent/d98d00?text=Calm Mind',
  canStack: true,
  stats: {
    resistance: {
      value: 5,
      stat: undefined,
      scaling: 'stacks',
    },
    critchance: {
      value: 10,
      stat: undefined,
      scaling: 'stacks',
    },
  },
  onTechniqueEffects: [],
  onRoundEffects: [],
  stacks: 1,
};

// Tea Leaves - the raw ingredient players collect
export const greenTeaLeaves: CraftingItem = {
  kind: 'material',
  name: 'Green Tea Leaves',
  description: 'Fresh tea leaves suitable for basic brewing.',
  icon: 'https://placehold.co/256x256/transparent/d98d00?text=Green Tea Leaves',
  stacks: 1,
  rarity: 'mundane', // Basic ingredient
  realm: 'meridianOpening', // Inventory sorting
};

// Brewed Tea - the finished product players actually use
export const brewedGreenTea: CombatItem = {
  kind: 'consumable',
  name: 'Brewed Green Tea',
  description: 'A calming tea that enhances focus and resilience.',
  icon: 'https://placehold.co/256x256/transparent/d98d00?text=Brewed Green Tea',
  stacks: 1,
  rarity: 'mundane',
  realm: 'meridianOpening',
  effects: [
    {
      kind: 'buffSelf',
      buff: calmMindBuff,
      amount: { value: 3, stat: undefined }, // Gives 3 stacks
    },
    {
      kind: 'heal',
      amount: {
        value: Math.floor(
          window.modAPI.utils.getExpectedHealth('meridianOpening', 'Late') *
            0.8,
        ),
      }, // 80% heal in the meridian opening realm
    },
  ],
};

// Higher tier version to show progression
export const jasmineTeaLeaves: CraftingItem = {
  kind: 'material',
  name: 'Jasmine Tea Leaves',
  description: 'Fragrant jasmine-infused tea leaves.',
  icon: 'https://placehold.co/256x256/transparent/d98d00?text=Jasmine Tea Leaves',
  stacks: 1,
  rarity: 'qitouched', // Better quality
  realm: 'qiCondensation',
};

export const spiritualClarityBuff: Buff = {
  name: 'Spiritual Clarity',
  icon: 'https://placehold.co/256x256/transparent/d98d00?text=Spiritual Clarity',
  canStack: true,
  tooltip: 'Enhanced spiritual awareness from refined tea.',
  stats: {
    power: {
      value: 25,
      stat: 'power',
      scaling: 'stacks',
    },
    itemEffectiveness: {
      value: 20,
      stat: undefined,
      scaling: 'stacks',
    },
  },
  onTechniqueEffects: [],
  onRoundEffects: [],
  stacks: 1,
};

export const brewedJasmineTea: CombatItem = {
  kind: 'consumable',
  name: 'Brewed Jasmine Tea',
  description: 'An aromatic tea that sharpens spiritual awareness.',
  icon: 'https://placehold.co/256x256/transparent/d98d00?text=Brewed Jasmine Tea',
  stacks: 1,
  rarity: 'qitouched',
  realm: 'qiCondensation',
  effects: [
    {
      kind: 'buffSelf',
      buff: spiritualClarityBuff,
      amount: { value: 2, stat: undefined },
    },
    {
      kind: 'heal',
      amount: {
        value: Math.floor(
          window.modAPI.utils.getExpectedHealth('qiCondensation', 'Late') * 0.8,
        ),
      }, // 80% heal in the qi condensation realm
    },
  ],
};
```

## Adding Tea Crops

Now let's make our tea leaves growable! This gives players agency over their progression - instead of just buying materials, they can cultivate their own tea garden.

Create `src/modContent/crops/teaCrops.ts`:

```typescript
import { Crop } from 'afnm-types';
import { greenTeaLeaves, jasmineTeaLeaves } from '../items/teaItems';

// Tea leaf crops for the herb garden
export const greenTeaLeafCrop: Crop = {
  item: greenTeaLeaves.name, // Must match the item name exactly
  yield: 2, // Produces 2 tea leaves per harvest
  growthDays: 20, // Takes 20 days to mature
  cost: 'Vita',
  change: 'Aurum',
};


export const jasmineTeaLeafCrop: Crop = {
  item: jasmineTeaLeaves.name,
  yield: 1, // Lower yield but higher tier
  growthDays: 30, // Takes longer to grow
  cost: 'Condensed Vita',
  change: 'Etherite',
};

export function initializeTeaCrops() {
  console.log('🌱 Adding tea leaf crops...');

  // Green tea leaves available in Meridian Opening (when farming unlocks)
  window.modAPI.actions.addCrop('meridianOpening', greenTeaLeafCrop);

  // Jasmine tea leaves available in Qi Condensation (advanced farming)
  window.modAPI.actions.addCrop('qiCondensation', jasmineTeaLeafCrop);

  console.log('✅ Added 2 tea leaf crops');
}
```

## Why Tea Crops Work Well

**Player agency** - Instead of relying on shops or random drops, players can grow their own tea leaves through dedicated farming effort.

**Resource transformation** - Green tea crops consume basic Vita but produce valuable Aurum soil, creating a beneficial cycle for the herb garden economy.

**Progression gating** - Jasmine crops require advanced soil conditions (Condensed Vita) that players won't have until later realms, creating natural progression.

**Balanced yields** - Lower yields (1-2 items) prevent farming from trivializing the tea economy while still being worthwhile.

## Why This Structure Works

**Buffs are separate objects** because they can be reused. Multiple items, techniques, or effects might all grant "Calm Mind" - so we define it once and reference it.

**Effects array** lets consumables do multiple things. Our teas both buff the player AND heal them. This makes them more valuable than single-effect items.

**Flat scaling** fixes the effectiveness of the item to be detached from player realm, so a higher realm player gets no value from consuming large numbers of lower realm items

## Registering Items and Crops

```typescript
export const allTeaItems = [
  greenTeaLeaves,
  jasmineTeaLeaves,
  brewedGreenTea,
  brewedJasmineTea,
];

export function initializeTeaItems() {
  console.log('🍃 Adding tea items...');

  allTeaItems.forEach((item) => {
    window.modAPI.actions.addItem(item);
  });

  console.log(`✅ Added ${allTeaItems.length} tea items`);
}
```

**Important**: Export your items so other files can import them! This lets you use `greenTeaLeaves.name` in quests and characters instead of hard-coding strings like `'Green Tea Leaves'`. This approach:

- **Prevents typos** - TypeScript will catch name mismatches
- **Enables refactoring** - Change the name once and it updates everywhere
- **Ensures consistency** - Same item referenced identically across all files

## Connect to Your Mod

Update `src/modContent/index.ts`:

```typescript
import { initializeTeaItems } from './items/teaItems';
import { initializeTeaCrops } from './crops/teaCrops';

function initializeMysticalTeaGarden() {
  console.log('🍵 Initializing Mystical Tea Garden Mod...');

  initializeTeaItems();
  initializeTeaCrops();

  console.log('✅ Mystical Tea Garden Mod loaded successfully!');
}

initializeMysticalTeaGarden();
```

## What We've Created

**Items:**

- **Green Tea Leaves** - Basic material players can buy/find/grow
- **Brewed Green Tea** - Entry-level consumable that gives defensive buffs
- **Jasmine Tea Leaves** - Higher tier material for advanced players
- **Brewed Jasmine Tea** - Premium consumable with offensive buffs

**Crops:**

- **Green Tea Leaf Crop** - Available in Meridian Opening, transforms Vita into Aurum
- **Jasmine Tea Leaf Crop** - Available in Qi Condensation, transforms Condensed Vita into Etherite

This creates a complete tea economy with multiple acquisition paths. Players can buy ingredients from NPCs, grow their own through farming, and craft finished products for various benefits. The herb garden integration gives players long-term agency over their tea supply.

## Next Steps

Now we need [a character to sell these items](03-adding-characters.md) - Master Chen, our tea house proprietor who will explain the benefits of each tea and run the shop.
