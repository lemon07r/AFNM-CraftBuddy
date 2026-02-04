---
layout: default
title: Packaging & Testing
parent: Your First Mod
grand_parent: Guides
nav_order: 7
description: 'Package your mod and load it in-game'
---

# Step 7: Packaging & Testing

Your mod is complete! Now let's package it up and get it running in the actual game.

## Building Your Mod

First, make sure all your files are properly connected. Your final `src/modContent/index.ts` should look like this:

```typescript
import { initializeTeaItems } from './items/teaItems';
import { initializeTeaCrops } from './crops/teaCrops';
import { initializeTeaCharacters } from './characters/teaMasters';
import { initializeTeaBrewery } from './locations/teaBrewery';
import { initializeTeaQuests } from './quests/teaQuests';
import { initializeTeaQuestEvents } from './events/teaQuestEvents';

function initializeMysticalTeaGarden() {
  console.log('🍵 Initializing Mystical Tea Garden Mod...');

  initializeTeaItems();
  initializeTeaCrops();
  initializeTeaCharacters();
  initializeTeaBrewery();
  initializeTeaQuests();
  initializeTeaQuestEvents();

  console.log('✅ Mystical Tea Garden Mod loaded successfully!');
}

initializeMysticalTeaGarden();
```

Build your mod by running:

```bash
npm run build
```

This creates a `.zip` file in the `builds/` folder with everything the game needs.

## Loading Your Mod

1. **Locate the zip file** in your `builds/` folder (e.g., `mystical-tea-garden-1.0.0.zip`)

2. **Copy it to your game installation's mod folder**:

   - Find your game directory (Steam: Right-click game → Properties → Installed Files → Browse)
   - Create a `mods/` folder next to `Ascend from Nine Mountains.exe` if it doesn't exist
   - Copy your ZIP file into this `mods/` folder
   - **Do NOT unzip it** - the game loads ZIP files directly

3. **Start the game** and check the console for your mod's loading messages:

   ```
   🍵 Initializing Mystical Tea Garden Mod...
   🍃 Adding tea items...
   ✅ Added 4 tea items
   🌱 Adding tea leaf crops...
   ✅ Added 2 tea leaf crops
   👤 Adding tea master characters...
   ✅ Added 1 tea characters
   ...
   ✅ Mystical Tea Garden Mod loaded successfully!
   ```

4. **Check the mod loader** and select the information button on the row for your mod. You should see all your assets and changes displayed.

## Testing Your Mod In-Game

1. **Create a new character** or use one in Meridian Opening realm or higher

2. **Visit Liang Tiao Village** - you should see the discovery event fire:

   ```
   "As you explore Liang Tiao Village, you notice an elderly man sitting by an abandoned building, looking wistful."
   ```

3. **Check your quest journal** - "The Forgotten Tea House" should appear

4. **Talk to Master Chen** to start the quest

5. **Test the progression**:
   - Collect 5 Green Tea Leaves (buy from shops or grow in herb garden)
   - Return to Master Chen and complete the quest
   - Verify his shop opens with tea items
   - Visit the Tea House building (if you added locations)

## Congratulations!

You've successfully created and deployed a complete AFNM mod! Your tea house mod demonstrates:

- ✅ Items with buffs and effects
- ✅ Growable crops for the herb garden
- ✅ NPCs with dialogue and shops
- ✅ Custom locations with interactive systems
- ✅ Quest systems with proper progression
- ✅ Triggered events for natural discovery

This foundation can be extended with additional teas, more complex quests, seasonal events, or integration with other mod systems. Happy modding!
