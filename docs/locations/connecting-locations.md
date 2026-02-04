---
layout: default
title: Connecting Locations
parent: Location System
nav_order: 2
---

# Connecting Locations

Locations connect to form the game world through two types of links: conditional links and exploration links. These connections determine how players discover and travel between locations.

## Link Types

### ConditionalLink

Conditional links create connections that are always visible when conditions are met:

```typescript
interface ConditionalLink {
  location: GameLocation;  // Target location
  distance: number;        // Travel distance (affects time)
  condition: string;       // When connection is available
}
```

Example:
```typescript
{
  location: xiDianOutpost,
  distance: 2,
  condition: 'outpostDestroyed == 0'  // Only if outpost exists
}
```

### ExplorationLink

Exploration links require players to discover the connection through exploration:

```typescript
interface ExplorationLink {
  location: GameLocation;     // Target location
  distance: number;           // Travel distance
  exploration: number;        // Discovery order (1, 2, 3...)
  event: EventStep[];        // Discovery event
  condition?: string;        // Optional availability condition
}
```

Example:
```typescript
{
  location: deepForest,
  exploration: 1,           // First exploration discovery
  distance: 2,
  event: [
    {
      kind: 'text',
      text: 'You discover a path leading deeper into the forest...'
    },
    {
      kind: 'unlockLocation',
      location: 'Deep Heian Forest'
    }
  ]
}
```

## Exploration System

### Discovery Order

Exploration links use numbered priorities to determine discovery order:

```typescript
unlocks: [
  { exploration: 1, ... },  // Found first
  { exploration: 2, ... },  // Found second
  { exploration: 3, ... },  // Found third
]
```

Players must explore a location multiple times (default: 3) to discover each link.

### Exploration Events

The `event` array triggers when a player discovers the connection:

```typescript
event: [
  {
    kind: 'text',
    text: 'As you explore the crossroads, you spot a structure...'
  },
  {
    kind: 'unlockLocation',
    location: 'Xi Dian Outpost'
  },
  // Optional: Additional rewards or consequences
  {
    kind: 'flag',
    flag: 'outpostDiscovered',
    value: '1',
    global: true
  }
]
```

### Custom Exploration Count

Override the default 3 explorations per discovery:

```typescript
const myLocation: GameLocation = {
  // ...other properties
  explorationCountOverride: 5,  // Requires 5 explorations per unlock
}
```

## Conditional Connections

### Simple Conditions

Basic flag or realm checks:

```typescript
// Flag-based
condition: 'questComplete == 1'

// Realm-based
condition: 'realm >= qiCondensation'  // Qi Condensation or higher

// Multiple conditions
condition: 'realm >= meridianOpening && villageRep >= 100'
```

### Dynamic Connections

Switch between locations based on game state:

```typescript
unlocks: [
  {
    location: intactOutpost,
    distance: 2,
    condition: 'outpostDestroyed == 0'
  },
  {
    location: ruinedOutpost,
    distance: 2,
    condition: 'outpostDestroyed == 1'
  }
]
```

## Distance System

Distance affects travel time between locations:

- **1-2**: Very close (same region)
- **3-5**: Nearby (adjacent regions)
- **6-10**: Moderate distance
- **11-20**: Far distance
- **20+**: Very far (cross-continent)

## Bidirectional Connections

Connections must be defined from both locations:

```typescript
// In location A
export const locationA: GameLocation = {
  unlocks: [
    { location: locationB, distance: 3, condition: '1' }
  ]
};

// In location B
export const locationB: GameLocation = {
  unlocks: [
    { location: locationA, distance: 3, condition: '1' }
  ]
};
```

## Adding Connections to Existing Locations

Use the mod API to add new connections:

```typescript
// Add your new location
window.modAPI.actions.addLocation(myNewLocation);

// Connect it to existing location
window.modAPI.actions.linkLocations('Crossroads', {
  location: myNewLocation,
  exploration: 4,  // Next exploration slot
  distance: 5,
  event: [
    {
      kind: 'text',
      text: 'You discover a hidden path...'
    },
    {
      kind: 'unlockLocation',
      location: myNewLocation.name
    }
  ]
});
```

## Best Practices

### Exploration Progression

Structure exploration to guide player progression:

```typescript
unlocks: [
  // Early game discovery
  {
    exploration: 1,
    location: beginnerArea,
    distance: 2,
    event: [...]
  },
  // Mid-game discovery
  {
    exploration: 2,
    location: intermediateArea,
    distance: 5,
    condition: 'realm >= meridianOpening',
    event: [...]
  },
  // Late-game discovery
  {
    exploration: 3,
    location: advancedArea,
    distance: 10,
    condition: 'realm >= coreFormation',
    event: [...]
  }
]
```

### Narrative Integration

Use discovery events to enhance storytelling:

```typescript
event: [
  {
    kind: 'text',
    text: 'Following rumors from local merchants...'
  },
  {
    kind: 'speech',
    character: 'Traveler',
    text: 'Beyond those hills lies an ancient temple...'
  },
  {
    kind: 'unlockLocation',
    location: 'Ancient Temple'
  },
  {
    kind: 'item',
    name: 'Ancient Map Fragment',
    amount: 1
  }
]
```

### Conditional Availability

Gate discoveries behind progression:

```typescript
{
  exploration: 1,
  location: hiddenGrove,
  distance: 3,
  condition: 'forestRep >= 500 && realm >= qiCondensation',
  event: [
    {
      kind: 'text',
      text: 'Your reputation finally earns you trust...'
    }
  ]
}
```