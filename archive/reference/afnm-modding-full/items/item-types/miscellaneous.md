---
layout: default
title: Miscellaneous
parent: Item Types
grand_parent: Item System
nav_order: 20
---

# Miscellaneous Item Types

Several item types in AFNM use only the base ItemBase interface without additional fields or mechanics. These items rely on their name, description, rarity, and realm to convey their purpose.

## Simple Item Types

### Breakthrough Items
```typescript
export interface BreakthroughItem extends ItemBase {
  kind: 'breakthrough';
  // No additional fields
}
```
**Purpose**: Required consumables for realm advancement
**Usage**: Consumed during cultivation breakthroughs

### Token Items
```typescript
export interface TokenItem extends ItemBase {
  kind: 'token';
  // No additional fields
}
```
**Purpose**: Currency or exchange items
**Usage**: Trade, quests, or special vendors

### Trophy Items
```typescript
export interface TrophyItem extends ItemBase {
  kind: 'trophy';
  hint: string;           // Hint about how to earn
  achievementID: string;  // Achievement system link
}
```
**Purpose**: Achievement rewards and collectibles
**Usage**: Display accomplishments, unlock achievements

### Treasure Items
```typescript
export interface TreasureItem extends ItemBase {
  kind: 'treasure';
  isCollectible?: boolean;  // Optional collection tracking
}
```
**Purpose**: Valuable items from enemies or exploration
**Usage**: Selling, crafting materials, or collections

### Upgrade Items
```typescript
export interface UpgradeItem extends ItemBase {
  kind: 'upgrade';
  // No additional fields
}
```
**Purpose**: Equipment enhancement materials
**Usage**: Improve existing items' stats or quality

### Flare Items
```typescript
export interface FlareItem extends ItemBase {
  kind: 'flare';
  // No additional fields
}
```
**Purpose**: Used to explore the mine
**Usage**: Spendable resource

### Recuperation Items
```typescript
export interface RecuperationItem extends ItemBase {
  kind: 'recuperation';
  // No additional fields
}
```
**Purpose**: Healing/recovery consumables
**Usage**: Restore health between combats

### Elixir Items
```typescript
export interface ElixirItem extends ItemBase {
  kind: 'elixir';
  qi: number;  // Amount of qi restored
}
```
**Purpose**: Qi restoration consumables
**Usage**: Replenish qi during cultivation

### Transport Seal Items
```typescript
export interface TransportSealItem extends ItemBase {
  kind: 'transport_seal';
  destination: string;  // Location identifier
}
```
**Purpose**: Fast travel consumables
**Usage**: Teleport to specific locations

## Common Properties

All these items inherit from ItemBase:
- `kind`: The item type identifier
- `name`: Display name
- `description`: Flavor text and usage hints
- `icon`: Visual representation
- `stacks`: Stack size
- `rarity`: Item quality tier
- `realm`: Associated cultivation realm
- `valueTier?`: Optional economic value indicator

## Implementation Example

```typescript
// Simple breakthrough item
export const meridianNeedle: BreakthroughItem = {
  kind: 'breakthrough',
  name: 'Meridian Cleansing Needle',
  description: 'Clears impurities from meridians during breakthrough.',
  icon: needleIcon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'meridianOpening'
};

// Trophy with achievement link
export const bossDefeatTrophy: TrophyItem = {
  kind: 'trophy',
  name: 'Demon Lord\'s Crown',
  description: 'Proof of defeating the Demon Lord.',
  icon: crownIcon,
  stacks: 1,
  rarity: 'resplendent',
  realm: 'coreFormation',
  hint: 'Defeat the Demon Lord in single combat',
  achievementID: 'ACH_DEMON_LORD'
};

// Collectible treasure
export const ancientCoin: TreasureItem = {
  kind: 'treasure',
  name: 'Ancient Spirit Coin',
  description: 'Currency from a lost cultivation empire.',
  icon: coinIcon,
  stacks: 99,
  rarity: 'mundane',
  realm: 'any',
  isCollectible: true
};

// Qi restoration elixir
export const minorQiElixir: ElixirItem = {
  kind: 'elixir',
  name: 'Minor Qi Elixir',
  description: 'Restores a small amount of qi.',
  icon: elixirIcon,
  stacks: 10,
  rarity: 'mundane',
  realm: 'bodyForging',
  qi: 50  // Restores 50 qi
};

// Transport seal for fast travel
export const marketSeal: TransportSealItem = {
  kind: 'transport_seal',
  name: 'Market District Seal',
  description: 'Instantly transports you to the Market District.',
  icon: sealIcon,
  stacks: 1,
  rarity: 'mundane',
  realm: 'any',
  destination: 'market_district'
};
```

## Design Notes

These item types are intentionally simple:
- **No complex mechanics**: Functionality comes from game systems, not item properties
- **Flexible usage**: Can be repurposed for various game features
- **Easy to extend**: New items just need base properties
- **Clear purpose**: Name and description convey all necessary information

For items requiring special mechanics or additional data, use the more complex item types like `pill`, `technique`, `artefact`, etc.