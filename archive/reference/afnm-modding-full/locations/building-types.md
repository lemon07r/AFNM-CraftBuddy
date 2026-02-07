---
layout: default
title: Building Types
parent: Location System
nav_order: 3
---

# Building Types

Buildings provide interactive services and content within locations. Each building type offers specific functionality, from commerce and healing to quest distribution and cultivation.

## Basic Buildings

### Healer

Provides healing services to restore health and remove injuries:

```typescript
{
  kind: 'healer',
  condition?: 'realm >= meridianOpening',  // Optional availability
  disabled?: 'injured == 0'  // Optional disable condition
}
```

### Cultivation Chamber

Allows meditation and qi cultivation:

```typescript
{
  kind: 'cultivation'
}
```

### Manual Pavilion

Access to combat technique manuals:

```typescript
{
  kind: 'manual'
}
```

### Crafting (Furnace Pagoda)

Alchemy and item crafting:

```typescript
{
  kind: 'crafting'
}
```

### Treasure Vault

Banking and storage services:

```typescript
{
  kind: 'vault'
}
```

### Material Compendium

Encyclopedia of crafting materials:

```typescript
{
  kind: 'compendium'
}
```

### Mystical Region

Portal to special cultivation areas:

```typescript
{
  kind: 'mysticalRegion'
}
```

### Training Ground

Combat training and sparring:

```typescript
{
  kind: 'trainingGround'
}
```

### Research (Vault of Infinite Reflections)

Research and experimentation facility:

```typescript
{
  kind: 'research'
}
```

## Commerce Buildings

### Market

General marketplace with realm-specific inventory:

```typescript
{
  kind: 'market',
  itemPool: {
    bodyForging: [
      { name: 'Small Claw', stacks: 5 },
      { name: 'Healing Pill I', stacks: 3 },
      { name: 'Speed Room I', stacks: 1 }
    ],
    meridianOpening: [...],
    // ...other realms
  },
  reputationPool?: {  // Optional reputation items
    bodyForging: [
      {
        name: 'Spirit Core I',
        stacks: 1,
        reputation: 'respected',  // Required reputation
        valueModifier: 15         // Price multiplier
      }
    ]
  },
  costMultiplier: 1.5,   // Base price multiplier
  refreshMonths: 3        // Inventory refresh period
}
```

### Favour Exchange

Special shop using favour currency:

```typescript
{
  kind: 'favourExchange',
  itemPool: { ... },      // Same as market
  costMultiplier: 2.0,
  refreshMonths: 1
}
```

## Mission Buildings

### Mission Hall

Sect missions with rewards:

```typescript
{
  kind: 'mission'
}
```

Missions defined at location level:
```typescript
missions: [
  {
    realm: 'bodyForging',
    rarity: 'mundane',
    quest: 'ratascar_culling',
    condition: '1'
  }
]
```

### Crafting Hall

Crafting-focused missions:

```typescript
{
  kind: 'craftingHall'
}
```

Crafting missions defined at location level:
```typescript
crafting: [
  {
    realm: 'meridianOpening',
    rarity: 'qitouched',
    quest: 'pill_delivery',
    condition: 'craftingSkill >= 50'
  }
]
```

### Request Board

Player-requested tasks:

```typescript
{
  kind: 'requestBoard',
  requests: {
    bodyForging: [
      {
        quest: 'herb_collection',
        condition: '1',
        rarity: 'mundane'
      }
    ],
    meridianOpening: [...],
    // ...other realms
  }
}
```

## Resource Buildings

### Herb Field

Herb gathering location:

```typescript
{
  kind: 'herbField',
  condition?: 'farmingUnlocked == 1'
}
```

### Yinying Mine

Mining for ores and gems:

```typescript
{
  kind: 'mine',
  condition?: 'miningUnlocked == 1'
}
```

## Special Buildings

### Recipe Library

Access to crafting recipes:

```typescript
{
  kind: 'recipe',
  recipePool: {
    bodyForging: [
      'recuperation_pill_recipe',
      'iron_skin_pill_recipe',
      'clothing_blank_recipe'
    ],
    meridianOpening: [...],
    // ...other realms
  }
}
```

### Library

Books and lore:

```typescript
{
  kind: 'library',
  title: 'Ancient Archives',
  categories: [
    {
      name: 'History',
      condition: '1',
      books: [
        {
          title: 'Rise of the Nine Mountains',
          author: 'Elder Shou',
          condition?: 'historyInterest == 1',
          contents: 'Long ago, when the heavens...'
        }
      ]
    },
    {
      name: 'Cultivation Theory',
      condition: 'realm >= meridianOpening',
      books: [...]
    }
  ]
}
```

### House

Player housing:

```typescript
{
  kind: 'house',
  houseDef: {
    name: 'Heaven-Touched House',
    description: 'Your rebuilt childhood home...',
    background: homeImage,
    screenEffect: 'dust',
    qiDensity: 1000,
    fixedRooms: [],
    freeRooms: 3,
    transportSeal: liangTiaoSeal
  },
  unlockCondition: 'houseRepaired == 1',
  condition: 'houseRepaired == 1'
}
```

### Compression Altar

Core compression service:

```typescript
{
  kind: 'altar',
  buff: {
    name: 'Compressed Core',
    description: 'Your core has been compressed...',
    // ...buff properties
  }
}
```

### Guild

Guild headquarters:

```typescript
{
  kind: 'guild',
  guild: 'Merchant Alliance',
  position: 'topleft',
  condition?: 'guildUnlocked == 1'
}
```

### Custom Building

Fully customizable building with event steps:

```typescript
{
  kind: 'custom',
  name: 'Mysterious Shop',
  icon: shopIcon,
  position: 'middleright',  // Screen position
  condition: 'mysteryUnlocked == 1',
  eventSteps: [
    {
      kind: 'text',
      text: 'You enter the mysterious shop...'
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'Browse wares',
          children: [...]
        },
        {
          text: 'Leave',
          children: [
            { kind: 'exit' }
          ]
        }
      ]
    }
  ]
}
```

Position options for custom buildings:
- `'top'`, `'topleft'`, `'topright'`
- `'belowtop'`, `'belowtopleft'`, `'belowtopright'`
- `'middleleft'`, `'middle'`, `'middleright'`
- `'bottom'`, `'bottomleft'`, `'bottomright'`

## Building Properties

### Common Properties

All buildings support these optional fields:

```typescript
{
  kind: BuildingType,      // Required building type
  condition?: string,       // When building is available
  disabled?: string,        // When building is disabled
  offset?: {               // Position adjustment
    x: number,
    y: number
  }
}
```

### Conditional Availability

Control when buildings appear:

```typescript
{
  kind: 'market',
  condition: 'marketBuilt == 1 && realm >= meridianOpening',
  // ...other properties
}
```

### Disabled State

Temporarily disable buildings:

```typescript
{
  kind: 'healer',
  disabled: 'injured == 0',  // Disabled when not injured
}
```

## Complete Example

```typescript
export const myLocation: GameLocation = {
  // ...basic properties

  buildings: [
    // Basic services
    { kind: 'healer' },
    { kind: 'crafting' },

    // Market with reputation items
    {
      kind: 'market',
      itemPool: {
        bodyForging: [
          { name: 'Healing Pill I', stacks: 5 },
          { name: 'Small Claw', stacks: 10 }
        ]
      },
      reputationPool: {
        bodyForging: [
          {
            name: 'Rare Manual',
            stacks: 1,
            reputation: 'exalted',
            valueModifier: 10
          }
        ]
      },
      costMultiplier: 1.8,
      refreshMonths: 2
    },

    // Custom event building
    {
      kind: 'custom',
      name: 'Elder\'s Residence',
      icon: elderIcon,
      position: 'top',
      condition: 'elderQuestComplete == 1',
      eventSteps: [
        {
          kind: 'speech',
          character: 'Village Elder',
          text: 'Welcome back, young cultivator...'
        },
        // ...more events
      ]
    },

    // Conditional library
    {
      kind: 'library',
      condition: 'libraryUnlocked == 1',
      title: 'Village Archives',
      categories: [
        {
          name: 'Local History',
          condition: '1',
          books: [...]
        }
      ]
    }
  ]
};
```