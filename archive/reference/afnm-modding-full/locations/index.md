---
layout: default
title: Location System
nav_order: 9
has_children: true
description: 'Documentation for the AFNM location system'
---

# Location System

Locations form the world of Ascend from Nine Mountains, serving as hubs for exploration, commerce, cultivation, and adventure. Each location represents a distinct area with its own atmosphere, challenges, and opportunities.

## Documentation

### [Location Structure](location-structure)
Core location interface, required fields, and optional properties

### [Connecting Locations](connecting-locations)
Exploration links, conditional connections, and world navigation

### [Building Types](building-types)
All building types with configuration and examples

## Quick Reference

### Core Properties

Every location requires these essential fields:

```typescript
{
  name: string;                  // Unique identifier
  description: string;           // Narrative description
  image: string;                // Background image path
  icon: string;                 // Map icon image path
  screenEffect: ScreenEffectType; // Visual atmosphere
  music: MusicName;             // Background music
  ambience: AmbienceName;       // Ambient sound effects
  position: { x: number; y: number }; // Map coordinates
  size: 'tiny' | 'small' | 'normal' | 'large'; // Map icon size
  unlocks: (ConditionalLink | ExplorationLink)[]; // Connected locations
}
```

### Optional Features

Locations can include various optional content:

**Buildings**: Interactive structures providing services
- Markets, healers, crafting halls
- Mission boards, libraries, custom buildings

**Combat Content**: Enemies and challenges
- Location-specific enemies with intro events
- Rarity-based spawn rates

**Events**: Dynamic content and encounters
- Random location events
- Exploration-triggered events
- Map events with cooldowns

**Progression Elements**: Realm and reputation systems
- Realm requirements and progression levels
- Location-specific reputation tracking

### Location Categories

**Villages & Settlements**
- Trading hubs with markets
- Quest givers and mission boards
- Crafting facilities

**Wilderness Areas**
- Enemy encounters
- Resource gathering
- Exploration opportunities

**Sect Territories**
- Training grounds
- Libraries and pavilions
- Specialized cultivation chambers

**Mystical Regions**
- High-risk, high-reward areas
- Unique environmental effects
- Rare resources and enemies

**Cities & Courts**
- Advanced markets
- Political intrigue
- High-level services

### Integration Points

Locations integrate with multiple game systems:

**World Navigation**
- Map-based travel system
- Distance and travel time calculations
- Exploration-based discovery

**Economic System**
- Location-specific markets
- Regional price variations
- Reputation-based discounts

**Quest System**
- Mission halls and request boards
- Location-specific quest chains
- Delivery and travel quests

**Combat System**
- Enemy spawn points
- Boss encounters
- Training grounds

**Character Progression**
- Realm-appropriate challenges
- Reputation building
- Skill acquisition locations

The location system provides the spatial framework for gameplay, creating a living world where players explore, trade, fight, and advance through the cultivation realms.