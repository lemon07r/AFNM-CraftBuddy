---
layout: default
title: Item Structure
parent: Item System
nav_order: 1
description: 'Core item interfaces, shared fields, and rarity system'
---

# Item Structure

All items in AFNM share a common base structure while extending into specialized types. Understanding this structure is essential for creating balanced, functional items.

## Core Item Interface

Every item implements the `ItemBase` interface:

```typescript
interface ItemBase {
  kind: ItemKind; // Item category/type
  name: string; // Display name
  description: string; // Lore and description text
  icon: string; // Asset path for visual representation
  stacks: number; // Default quantity in inventory
  rarity: Rarity; // Quality tier
  realm: Realm | 'any'; // Cultivation requirement
  valueTier?: number; // Economic worth modifier
  upgradedFrom?: Item; // Upgrade chain tracking
}
```

## Item Categories

AFNM supports 24 distinct item categories:

### Equipment Types

```typescript
'clothing'; // Armor and robes
'talisman'; // Accessories with buffs
'artefact'; // Powerful items with techniques
'cauldron'; // Alchemy equipment
'flame'; // Crafting heat sources
'mount'; // Transportation items
```

### Consumable Types

```typescript
'pill'; // Temporary enhancements
'elixir'; // Qi restoration
'concoction'; // Combat consumables
'consumable'; // Formation parts
'recuperation'; // Rest enhancement
'fruit'; // Permanent improvements
'reagent'; // Crafting enhancers
```

### Technique Types

```typescript
'technique'; // Combat abilities
'action'; // Crafting abilities
```

### Progression Types

```typescript
'breakthrough'; // Realm advancement
'condensation_art'; // Qi droplet generation
'pillar_shard'; // Advanced cultivation
```

### Crafting Types

```typescript
'recipe'; // Crafting instructions
'material'; // Base components
'enchantment'; // Equipment upgrades
'upgrade'; // Enhancement materials
```

### Special Types

```typescript
'mystical_key'; // Region access
'transport_seal'; // Location travel
'formation'; // Environmental enhancement
'trophy'; // Achievements
'token'; // Currency/exchange
'treasure'; // Collectibles
'blueprint'; // Construction
'flare'; // Utility items
```

## Economic System

All items are given a base priced based on their type, rarity, realm, enchantments/quality, and the valueTier specified. Additionally, a random offset based on the items title is applied to give variance between goods.

### Value Modifiers

- **valueTier**: Multiplies base price (optional)
- **rarity**: Affects pricing multipliers
- **realm**: Higher realms increase value
- **enchantment**: Adds significant value

## Enchantment System

Items can be enhanced through enchantments:

```typescript
interface Enchantment {
  kind: string; // Enchantment type
  realm: Realm; // Required realm
  rarity: Rarity; // Enchantment quality
  itemKind: ItemKind; // Compatible item type
  name: string; // Display name
}
```

### Enchantment Benefits

- **Combat Stats**: Additional power, defense, etc.
- **Utility Effects**: Qi absorption, mastery points
- **Special Abilities**: Unique buff applications
- **Economic Value**: Significant price increases

## Integration Points

Items must be registered with the game and integrated into acquisition sources.

### 1. Adding Items to the Game

All items must be registered through the ModAPI:

```typescript
// Register the item with the game
window.modAPI.actions.addItem(myCustomItem);
```

This adds the item to the global item registry, making it available for:
- Inventory management
- Trading systems
- Quest rewards
- Event integration

### 2. Item Acquisition Sources

Once registered, items need acquisition sources for players to obtain them:

#### Shop Integration
```typescript
// Add to location-based shops
window.modAPI.actions.addItemToShop(
  myItem,           // Item to sell
  5,                // Stack size
  'Nine Mountain Sect', // Shop location
  'bodyForging',    // Required realm
  1.2,              // Price multiplier (optional)
  'friendly'        // Required reputation (optional)
);
```

#### Auction House
```typescript
// Add to auction rotation
window.modAPI.actions.addItemToAuction(
  myItem,           // Item to auction
  0.15,             // Appearance chance (15%)
  '1',              // Condition for availability. Normally always available (1), only use if intending to unlock with a quest flag
  3,                // Stack override (optional)
  1.5               // Count multiplier (optional)
);
```

#### Combat Drops
Items are added to enemy loot through character/location definitions:
```typescript
// In enemy/character definitions
{
  kind: 'addItem',
  item: { name: 'My Custom Sword' },
  amount: '1',
}
```

#### Quest Rewards
Items can be quest objectives or rewards:
```typescript
// Quest step reward
{
  kind: 'collect',
  item: 'My Custom Material',
  amount: 5,
}

// Quest completion reward
{
  kind: 'addItem',
  item: { name: 'Quest Reward Item' },
  amount: '1',
}
```

#### Event Integration
Items work in events through EventSteps:
```typescript
// Give item to player
{
  kind: 'addItem',
  item: { name: 'Story Item' },
  amount: '1',
}

// Remove item from player
{
  kind: 'removeItem',
  item: { name: 'Consumed Item' },
  amount: '1',
}

// Check if player has item
{
  kind: 'conditional',
  branches: [{
    condition: 'My_Custom_Item >= 1',
    children: [/* event steps */]
  }]
}
```

#### Calendar Events
Items can be distributed through scheduled events:
```typescript
// Resource distribution events
{
  kind: 'addItem',
  item: { name: 'Seasonal Gift' },
  amount: '3',
}
```

#### Crafting Integration
Items integrate with crafting as materials or outputs:

**Recipe Ingredients**:
```typescript
ingredients: [
  { item: myCustomMaterial, quantity: 3 },
  { item: anotherItem, quantity: 1 },
]
```

**Recipe Outputs**:
```typescript
baseItem: myCustomCraftedItem,
perfectItem: myCustomCraftedItemPlus,
```

**Research System**:
```typescript
// Add recipe to research tree
window.modAPI.actions.addRecipeToResearch(
  baseItemName,     // Item that unlocks the recipe
  recipeItem        // Recipe to unlock
);
```

### 3. Economic Integration

Items automatically integrate with the economy:

**Pricing**: Based on `buyItemCostMap` and `sellItemCostMap` for the item's `kind`

**Value Modifiers**:
- `valueTier` multiplies base price
- `rarity` affects market pricing
- `realm` gates availability and cost
- `enchantment` adds significant value
- `Additional random element` applied to the final cost based on the item name to force unique pricing between items

### 4. Flag Integration

Items automatically create flags for use in conditions:
- Item names are converted to flag format: `"My Item Name"` → `"My_Item_Name"`
- Available in inventory: `My_Item_Name >= 1`
- In storage: `storage_My_Item_Name >= 1`
- Equipped status: `equipped_My_Item_Name == 1`

### 5. Common Integration Patterns

**Progressive Equipment**:
```typescript
// Add basic version to early shops
window.modAPI.actions.addItemToShop(basicSword, 1, 'Sect Armory', 'bodyForging');

// Add enhanced version to later shops
window.modAPI.actions.addItemToShop(enhancedSword, 1, 'Core Armory', 'coreFormation');

// Add powerful version to auctions
window.modAPI.actions.addItemToAuction(powerfulSword, 0.05, 'realm >= 4');
```

**Crafting Material Chain**:
```typescript
// Basic material from gathering/shops
window.modAPI.actions.addItemToShop(rawMaterial, 10, 'Material Shop', 'bodyForging');

// Processed material requires recipe
const processingRecipe = {
  kind: 'recipe',
  ingredients: [{ item: rawMaterial, quantity: 3 }],
  baseItem: processedMaterial,
  // ...
};

// Final item uses processed material
const finalItemRecipe = {
  kind: 'recipe',
  ingredients: [{ item: processedMaterial, quantity: 2 }],
  baseItem: finalItem,
  // ...
};
```

**Story Item Progression**:
```typescript
// Quest gives broken item
{ kind: 'addItem', item: { name: 'Broken Sword' }, amount: '1' }

// Repair quest requires materials + broken item
{
  kind: 'condition',
  completionCondition: 'Broken_Sword >= 1 && Repair_Material >= 5'
}

// Quest completion gives repaired version
{ kind: 'addItem', item: { name: 'Restored Sword' }, amount: '1' }
```

This integration system ensures items feel natural within the game world while providing multiple acquisition paths for different player preferences and progression styles.
