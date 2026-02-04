---
layout: default
title: ModAPI Reference
parent: Core Concepts
nav_order: 1
description: 'Complete reference for the AFNM ModAPI system'
---

# ModAPI Reference

The ModAPI provides access to game data, content registration functions, and utility helpers for mod development.

## Structure

The ModAPI is available globally as `window.modAPI` with three main sections:

```typescript
interface ModAPI {
  gameData: {
    /* Access to all game content */
  };
  actions: {
    /* Functions to add new content */
  };
  utils: {
    /* Helper functions for mod development */
  };
}
```

## Game Data Access

Access existing game content through `window.modAPI.gameData`:

### Core Collections

- **`items`** - `Record<string, Item>` - All items in the game
- **`characters`** - `Record<string, Character>` - All NPCs and characters
- **`techniques`** - `Record<string, Technique>` - All cultivation techniques
- **`locations`** - `Record<string, GameLocation>` - All game locations
- **`quests`** - `Record<string, Quest>` - All available quests
- **`manuals`** - `Record<string, Manual>` - All technique manuals

### Realm-Based Collections

- **`auction`** - `Record<Realm, AuctionItemDef[]>` - Auction items by realm
- **`breakthroughs`** - `Record<Realm, Breakthrough[]>` - Breakthrough requirements
- **`crops`** - `Record<Realm, Crop[]>` - Crops available by realm
- **`mineChambers`** - `Record<Realm, Record<RealmProgress, MineChamber[]>>` - Mine chambers by realm and progress
- **`uncutStones`** - `Record<Realm, UncutStonePool | undefined>` - Uncut stone pools by realm

### Specialized Collections

- **`backgrounds`** - Character backgrounds by life stage:
  - `birth: Background[]`
  - `child: Background[]`
  - `teen: Background[]`
- **`craftingTechniques`** - `Record<string, CraftingTechnique>` - All crafting techniques
- **`techniqueBuffs`** - School-specific technique buffs:
  - `blood`, `blossom`, `celestial`, `cloud`, `fist`, `weapon`
- **`guilds`** - `Record<string, Guild>` - All guilds
- **`enchantments`** - `Enchantment[]` - All equipment enchantments
- **`fallenStars`** - `FallenStar[]` - All fallen star events
- **`rooms`** - `Room[]` - All house rooms
- **`mysticalRegionBlessings`** - `Blessing[]` - All mystical region blessings

## Content Registration

Add new content through `window.modAPI.actions`:

### Items and Equipment

```typescript
window.modAPI.actions.addItem(item: Item)
window.modAPI.actions.addItemToShop(item, stacks, location, realm, valueModifier?, reputation?)
window.modAPI.actions.addItemToAuction(item, chance, condition, countOverride?, countMultiplier?)
```

### Characters and Backgrounds

```typescript
window.modAPI.actions.addCharacter(character: Character)
window.modAPI.actions.addBirthBackground(background: Background)
window.modAPI.actions.addChildBackground(background: Background)
window.modAPI.actions.addTeenBackground(background: Background)
```

### Cultivation Content

```typescript
window.modAPI.actions.addBreakthrough(realm: Realm, breakthrough: Breakthrough)
window.modAPI.actions.addTechnique(technique: Technique)
window.modAPI.actions.addManual(manual: Manual)
window.modAPI.actions.addCraftingTechnique(technique: CraftingTechnique)
window.modAPI.actions.addDestiny(destiny: Destiny)
```

### World Content

```typescript
window.modAPI.actions.addLocation(location: GameLocation)
window.modAPI.actions.linkLocations(existing: string, link: ConditionalLink | ExplorationLink)
window.modAPI.actions.addQuest(quest: Quest)
window.modAPI.actions.addCalendarEvent(event: CalendarEvent)
window.modAPI.actions.addTriggeredEvent(event: TriggeredEvent)
```

### Specialized Content

```typescript
window.modAPI.actions.addCrop(realm: Realm, crop: Crop)
window.modAPI.actions.addMineChamber(realm: Realm, progress: RealmProgress, chamber: MineChamber)
window.modAPI.actions.addGuild(guild: Guild)
window.modAPI.actions.addDualCultivationTechnique(technique: IntimateTechnique)
window.modAPI.actions.addEnchantment(enchantment: Enchantment)
window.modAPI.actions.addFallenStar(fallenStar: FallenStar)
window.modAPI.actions.addRoom(room: Room)
```

### Crafting System

```typescript
window.modAPI.actions.addRecipeToLibrary(item: RecipeItem)
window.modAPI.actions.addRecipeToResearch(baseItem: Item, recipe: RecipeItem)
window.modAPI.actions.addResearchableRecipe(baseItem: string, recipe: RecipeItem)
window.modAPI.actions.addUncutStone(realm: Realm, uncutStone: Item)
```

### Audio

```typescript
window.modAPI.actions.addMusic(name: string, path: string[])
window.modAPI.actions.addSfx(name: string, path: string)
```

Note: When adding audio files the compiler won't know they exist at first, so you will get errors when trying to use the new names you added. To get around that, you will need to cast it to the expected type `'my_music' as MusicName` manually. This is essentially just saying to the compiler 'trust me, this exists'.

## Utility Functions

Helper functions through `window.modAPI.utils`:

### Enemy Modifiers

```typescript
window.modAPI.utils.alpha(enemy: EnemyEntity) // Elite version
window.modAPI.utils.alphaPlus(enemy: EnemyEntity) // Enhanced elite
window.modAPI.utils.realmbreaker(enemy: EnemyEntity) // Multiple realmbreaker variants
window.modAPI.utils.corrupted(enemy: EnemyEntity) // Corrupted version
```

### Quest Creation

```typescript
window.modAPI.utils.createCombatEvent(enemy: LocationEnemy)
window.modAPI.utils.createCullingMission(monster, location, description, favour)
window.modAPI.utils.createCollectionMission(item, location, description, favour)
window.modAPI.utils.createHuntQuest(monster, location, description, encounter, spiritStones, reputation, reputationName, maxReputation, characterEncounter?)
```

### Balance Calculations

```typescript
window.modAPI.utils.getExpectedHealth(realm: Realm, progress: RealmProgress)
window.modAPI.utils.getExpectedPower(realm: Realm, progress: RealmProgress)
window.modAPI.utils.getExpectedDefense(realm: Realm, progress: RealmProgress)
window.modAPI.utils.getExpectedPlayerPower(realm: Realm, progress: RealmProgress)
window.modAPI.utils.getRealmQi(realm: Realm, realmProgress: RealmProgress)
window.modAPI.utils.getNumericReward(base: number, realm: Realm, progress: RealmProgress)
window.modAPI.utils.getCraftingEquipmentStats(realm: Realm, realmProgress: RealmProgress, factors: { pool: number; control: number; intensity: number }, type: 'cauldron' | 'flame')
```

### Equipment Calculations

```typescript
window.modAPI.utils.getClothingDefense(realm: Realm, scale: number)
window.modAPI.utils.getClothingCharisma(realm: Realm, mult: number)
window.modAPI.utils.getBreakthroughCharisma(realm: Realm, mult: number)
```

### Event Helpers

```typescript
window.modAPI.utils.createQuestionAnswerList(key: string, questions: QuestionAnswer[], exit: QuestionAnswer, showExitOnAllComplete?: boolean)
window.modAPI.utils.flag(flag: string) // Convert flag name to game flag format
window.modAPI.utils.evalExp(exp: string, flags: Record<string, number>) // Evaluate an expression using the given flags, then floor it if the number is greater than 3
window.modAPI.utils.evalExpNoFloor(exp: string, flags: Record<string, number>) // The above but without the floor
```

## Examples

### Adding a Custom Item

```typescript
const myTreasure: TreasureItem = {
  kind: 'treasure',
  name: 'The Best Treasure',
  description: 'Wooo mod content.',
  icon: icon,
  stacks: 1,
  rarity: 'mundane',
  realm: 'coreFormation',
};

window.modAPI.actions.addItem(myTreasure);
```

For docs on the more advanced features of the Mod API, then see the **[Advanced Mods](../advanced-mods/)** page.