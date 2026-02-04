---
layout: default
title: Location Structure
parent: Location System
nav_order: 1
---

# Location Structure

The `GameLocation` interface defines all properties available for creating locations in the game world.

## Required Fields

Every location must define these core properties:

### Basic Information

```typescript
name: string;         // Unique identifier used internally
displayName?: string; // Optional display name (defaults to name)
description: string;  // Narrative description shown to players
```

The `name` field serves as the location's unique identifier throughout the game. Use the `displayName` field when you want to show a different name to players.

### Visual Properties

```typescript
image: string;                    // Background image path
icon: string;                     // Map icon image path
screenEffect: ScreenEffectType;   // Visual atmosphere effect
```

Available screen effects:
- `'none'` - No effect
- `'sun'` - Bright sunlight
- `'rain'` - Falling rain
- `'snow'` - Snowfall
- `'smoke'` - Smoky atmosphere
- `'dust'` - Dusty particles
- `'driftingLeaves'` - Floating leaves
- `'flyingPetals'` - Cherry blossoms or similar

### Audio Properties

```typescript
music: MusicName;       // Background music track
ambience: AmbienceName; // Ambient sound effects
```

Music and ambience names must match registered audio files in the game.

### Map Properties

```typescript
position: { x: number; y: number };           // World map coordinates
size: 'tiny' | 'small' | 'normal' | 'large'; // Icon size on map
```

Position coordinates determine where the location appears on the world map. Size affects how prominently it displays.

### Connections

```typescript
unlocks: (ConditionalLink | ExplorationLink)[];  // Connected locations
```

Every location must define its connections to other locations, even if the array is empty. See [Connecting Locations](connecting-locations) for details.

## Optional Fields

### Realm Requirements

```typescript
realm?: Realm;                   // Minimum realm to access
realmProgress?: RealmProgress;   // Specific progress level
```

Example:
```typescript
realm: 'qiCondensation',
realmProgress: 'Middle',
```

### Buildings

```typescript
buildings?: LocationBuilding[];  // Interactive structures
```

Buildings provide services and interactions. See [Building Types](building-types) for all available options.

### Combat Content

```typescript
enemies?: LocationEnemy[];       // Combat encounters
```

Enemy encounters with intro events:
```typescript
enemies: [
  {
    enemy: gorashi,
    rarity: 'qitouched',
    condition: '1',
    intro: [
      {
        kind: 'text',
        text: 'A Gorashi emerges from the undergrowth...'
      }
    ]
  }
]
```

**Enemy Integration**: Enemies must be defined as `EnemyEntity` objects before being added to locations. See the [Enemy Entities](../enemies/) documentation for complete enemy design and implementation guidance, including stance systems, behavior patterns, and combat mechanics.

### Events

```typescript
events?: LocationEvent[];           // Random events
explorationEvent?: LocationEvent[];  // First-time exploration events
mapEvents?: LocationMapEvent[];      // Timed map events
```

#### Location Events
Random events that can trigger when visiting:
```typescript
events: [
  {
    event: [...],           // Event steps
    rarity: 'mundane',      // Spawn frequency
    triggerChance: 0.1,     // Override rarity (optional)
    condition: 'realm >= qiCondensation' // When available
  }
]
```

#### Exploration Events
Special events that trigger during exploration:
```typescript
explorationEvent: [
  {
    event: [...],
    rarity: 'mundane',
    condition: 'exploreWarning == 0'
  }
]
```

#### Map Events
Timed events that appear on the map:
```typescript
mapEvents: [
  {
    name: 'Training Beast',
    realm: 'meridianOpening',
    condition: 'trainingFlag == 1',
    image: beastIcon,
    persist: 2,              // Days visible
    cooldown: { min: 5, max: 16 }, // Days between spawns
    event: [...]
  }
]
```

### Missions

```typescript
missions?: SectMission[];        // Sect mission board
crafting?: CraftingMission[];     // Crafting hall missions
```

Mission definitions for mission halls:
```typescript
missions: [
  {
    realm: 'bodyForging',
    rarity: 'mundane',
    quest: 'leachongCulling',
    condition: '1'
  }
]
```

### Reputation

```typescript
reputationName?: string;  // Reputation faction name
```

If defined, the location tracks player reputation for shops and other features.

### Exploration Override

```typescript
explorationCountOverride?: number;  // Custom exploration count
```

Override the default exploration requirement (normally 3 explorations per unlock).

## Complete Example

```typescript
export const liangTiaoVillage: GameLocation = {
  // Required fields
  name: 'Liang Tiao Village',
  description: 'A small village at the crux of two rivers...',
  image: villageBg,
  icon: villageIcon,
  screenEffect: 'rain',
  music: 'Liangtiao',
  ambience: 'Rain',
  position: { x: 2019, y: 406 },
  size: 'normal',

  // Connections
  unlocks: [
    {
      location: lingyuMoor,
      condition: 'moorUnlocked == 1',
      distance: 3
    }
  ],

  // Optional features
  reputationName: 'Liang Tiao Village',

  buildings: [
    { kind: 'healer' },
    { kind: 'crafting' },
    {
      kind: 'market',
      itemPool: { ... },
      costMultiplier: 1.7,
      refreshMonths: 3
    }
  ],

  missions: [
    {
      realm: 'bodyForging',
      rarity: 'qitouched',
      quest: 'clothingBlankDelivery',
      condition: '1'
    }
  ]
};
```

## Registering Locations

Add locations to your mod using the global mod API:

```typescript
// Access the mod API via window.modAPI
window.modAPI.actions.addLocation(myCustomLocation);
```

The mod API is globally available through `window.modAPI` and provides access to all game data and actions for modifying the game.