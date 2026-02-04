---
layout: default
title: Item System
nav_order: 7
has_children: true
description: 'Documentation for the AFNM item system'
---

# Item System

Items are the foundation of character progression, crafting, and equipment in Ascend from Nine Mountains. The item system supports over 20 different item types ranging from equipment and consumables to crafting materials and mystical keys.

## Documentation

### [Item Structure](item-structure)

Core item interfaces, shared fields, and rarity system

### [Recipe System](recipes)
Crafting recipes, ingredients, and difficulty mechanics

### [Advanced Integration](advanced-integration)
Shop integration, auctions, and stone cutting systems

### [Item Types](item-types)
Detailed documentation for each item category

## Quick Reference

### Item Categories

**Equipment**

- **`clothing`** - Armor and robes providing combat stats and charisma
- **`talisman`** - Accessories granting combat buffs
- **`artefact`** - Powerful items with unique combat techniques
- **`cauldron`** - Crafting equipment for alchemy
- **`flame`** - Crafting equipment providing heat and control
- **`mount`** - Transportation with speed and charisma bonuses

**Consumables**

- **`pill`** - Temporary combat or crafting enhancement
- **`elixir`** - Qi restoration items
- **`concoction`** - Combat consumables with technique effects
- **`consumable`** - Miscellaneous consumable items
- **`recuperation`** - Rest and recovery items
- **`fruit`** - Permanent stat improvements

**Progression**

- **`technique`** - Combat manuals and crystals
- **`action`** - Crafting technique items
- **`breakthrough`** - Realm advancement materials
- **`condensation_art`** - Qi droplet generation methods

**Crafting & Resources**

- **`recipe`** - Crafting instructions and requirements
- **`material`** - Base crafting components
- **`reagent`** - Specialized crafting enhancers
- **`enchantment`** - Equipment upgrade items
- **`upgrade`** - Item enhancement materials

**Special Purpose**

- **`mystical_key`** - Access to mystical regions
- **`transport_seal`** - Location travel items
- **`formation`** - Environmental enhancement items
- **`pillar_shard`** - Advanced cultivation components
- **`trophy`** - Achievement rewards
- **`token`** - Currency and exchange items
- **`treasure`** - Valuable collectibles
- **`blueprint`** - House construction plans
- **`flare`** - Signal and utility items

### Common Properties

All items share these core properties:

- **Name & Description**: Identity and lore
- **Icon**: Visual representation
- **Rarity**: Quality tier (mundane → qitouched → empowered → resplendent → incandescent → transcendent)
- **Realm**: Cultivation level requirement
- **Stacks**: Inventory quantity
- **Value Tier**: Economic worth

### Game Integration

Items integrate throughout the game systems:

**Shops & Trading**

- Buy/sell prices based on item kind and rarity
- Faction-specific merchants and inventories
- Dynamic pricing based on realm progression

**Drops & Rewards**

- Combat loot from defeated enemies
- Quest completion rewards
- Mystical region exploration prizes
- Achievement and milestone unlocks

**Crafting System**

- Recipe-based item creation
- Quality tiers (basic, perfect, sublime)
- Harmony types and difficulty scaling
- Equipment and consumable production

**Character Progression**

- Equipment providing combat and social stats
- Consumables for temporary enhancement
- Breakthrough materials for realm advancement
- Technique items for skill acquisition

**House & Infrastructure**

- Formation items for environmental bonuses
- Blueprint items for room construction
- Upgrade materials for improvement systems
- Furniture and decoration options

The item system provides both mechanical progression through stats and equipment, and narrative depth through lore-rich descriptions and quest integration.
