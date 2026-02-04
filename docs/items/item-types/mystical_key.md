---
layout: default
title: Mystical Key
parent: Item Types
grand_parent: Item System
nav_order: 10
---

# Mystical Key Items

Complex consumable keys that generate and unlock mystical regions with dynamic content, rewards, and challenges. Mystical keys are among the most sophisticated items in AFNM, creating procedurally generated dungeons with faction-specific mechanics.

## Interface

```typescript
interface MysticalKeyItem extends ItemBase {
  kind: 'mystical_key';

  // Region Generation
  contentType: RegionContentType;
  rewardRarities: Rarity[];
  hasCorePedestal: boolean;

  // Difficulty Scaling
  difficulty: RealmProgress;

  // Faction System
  factionCurses: string[];

  // Loot System
  rewardPools: string[];
}

type RegionContentType = 'blessed' | 'cursed' | 'glitch';
```

## Core Mechanics

### Region Generation System

Mystical keys generate regions with specific characteristics:

- **Content Type**: Determines basic region structure (blessed/cursed/glitch)
- **Blessing Effects**: `factionCurses` apply blessing mechanics region-wide
- **Encounters**: Standard enemy pools or special `overrideEncounterPool` for unique enemies
- **Rewards**: Based on `rewardPools` and `rewardRarities` arrays

### Reward Rarity Distribution

The `rewardRarities` array defines possible item qualities:

```typescript
// Early game key - basic rewards
rewardRarities: ['mundane', 'qitouched'];

// Mid game key - quality rewards
rewardRarities: ['qitouched', 'empowered', 'resplendent'];

// End game key - premium rewards
rewardRarities: ['resplendent', 'incandescent', 'transcendent'];
```

### Core Pedestal System

When `hasCorePedestal: true`, the region contains a special central chamber that allows exchanging a Spirit Core for extra rewards.

## Faction System

### Faction Curses and Blessings

The `factionCurses` system applies blessing effects region-wide. These use actual blessing names from the game:

```typescript
// Elemental blessings
factionCurses: ['Huo']; // Fire enhancement blessing
factionCurses: ['Jin']; // Metal element blessing with Metal Hail
factionCurses: ['Mu']; // Wood element blessing
factionCurses: ['Shui']; // Water element blessing
factionCurses: ['Tu']; // Earth element blessing

// Advanced blessings
factionCurses: ['Chaoxi']; // Advanced elemental fusion
factionCurses: ['Gangtie']; // Steel enhancement
factionCurses: ['Ri Zhu']; // Solar power
factionCurses: ['Destruction Cycle']; // Destructive enhancement
factionCurses: ['Protection Cycle']; // Defensive enhancement

// Special blessings
factionCurses: ['(%£*!']; // Glitch blessing with random effects
```

### Multiple Blessing Effects

Keys can apply multiple blessings that combine effects:

```typescript
factionCurses: ['Huo', 'Jin'];
// Creates a region with both fire and metal enhancement effects
```

## Content Types

### Blessed Regions

Standard mystical regions with normal difficulty and rewards:

- Balanced encounters and challenges
- Standard reward rarity distributions
- Normal blessing effects

### Cursed Regions

Corrupted regions with increased difficulty but better rewards:

- Enhanced enemy encounters
- Higher reward rarities (empowered, resplendent, incandescent)
- Blessing effects applied as regional modifiers
- Usually have `hasCorePedestal: true`

### Glitch Regions

Special corrupted regions with the Glitch blessing:

- Unpredictable mechanics and effects
- Very high reward rarities
- The '(%£\*!' blessing creates random technique effects
- Unique encounter pools with special enemies

## Reward Pool System

The `rewardPools` define available loot categories using actual pool names:

### Standard Pools by Realm

```typescript
// Qi Condensation (Realm III)
rewardPools: [
  'Condensation Art Enchantment (III)',
  'Clothing Enchantment (III)',
  'Artefact Enchantment (III)',
  'Talisman Enchantment (III)',
  'Mount Enchantment (III)',
  'Cauldron Enchantment (III)'
];

// Core Formation (Realm IV)
rewardPools: [
  'Condensation Art Enchantment (IV)',
  'Clothing Enchantment (IV)',
  'Artefact Enchantment (IV)',
  'Talisman Enchantment (IV)',
  'Mount Enchantment (IV)',
  'Cauldron Enchantment (IV)'
];

// Pillar Creation (Realm V)
rewardPools: [
  'Condensation Art Enchantment (V)',
  'Clothing Enchantment (V)',
  'Artefact Enchantment (V)',
  'Talisman Enchantment (V)',
  'Mount Enchantment (V)',
  'Cauldron Enchantment (V)'
];
```

### Specialized Corrupt Pools

```typescript
// Corrupt key exclusive pools
rewardPools: ['Corrupt Key (III)']; // Qi Condensation corrupt rewards
rewardPools: ['Corrupt Key (IV)']; // Core Formation corrupt rewards
rewardPools: ['Corrupt Key (V)']; // Pillar Creation corrupt rewards

// Advanced pools
rewardPools: ['Merged Key (V)']; // Combined high-tier rewards
```

## Difficulty Scaling

### Realm Progress Scaling

The `difficulty` property scales all aspects of the region:

```typescript
difficulty: 'Early'; // Entry-level challenges for realm
difficulty: 'Middle'; // Moderate challenges, better rewards
difficulty: 'Late'; // High-end challenges, premium rewards
```

### Dynamic Scaling Effects

- **Enemy Stats**: Health, damage, and abilities scale with difficulty
- **Reward Quality**: Higher difficulties guarantee better loot
- **Resource Requirements**: More challenging regions need better preparation
- **Mechanic Complexity**: Advanced difficulties introduce new mechanics

## Real Game Examples

```typescript
// Basic blessed key (actual game data)
export const voidKeyIII: MysticalKeyItem = {
  kind: 'mystical_key',
  name: 'Void Key (III)',
  description:
    'A key usable within the Tomb of Lu Bu Lin to open the way to a Mystical Region. This key is fractured, without the usual qi intensity of the others of its ilk. As a result, it only offers meagre rewards.',
  icon: icon,
  stacks: 1,
  rarity: 'mundane',
  realm: 'qiCondensation',

  contentType: 'blessed',
  rewardRarities: ['mundane', 'qitouched'],
  factionCurses: [],
  difficulty: 'Early',
  hasCorePedestal: false,
  rewardPools: [
    'Condensation Art Enchantment (III)',
    'Clothing Enchantment (III)',
    'Artefact Enchantment (III)',
    'Talisman Enchantment (III)',
    'Mount Enchantment (III)',
    'Cauldron Enchantment (III)'
  ],
};

// Corrupt key with blessing effects (actual game data)
export const huoKeyIIICorrupt: MysticalKeyItem = {
  kind: 'mystical_key',
  name: 'Corrupt Huo Key (III)',
  description:
    'A corrupted key that formed within the depths of a Mystical Region, bathed in that roiling qi until it corrupted into something far more dangerous.',
  icon: huoIcon,
  stacks: 1,
  rarity: 'resplendent',
  realm: 'qiCondensation',

  contentType: 'cursed',
  rewardRarities: ['empowered', 'resplendent', 'incandescent'],
  factionCurses: ['Huo'], // Applies fire blessing region-wide
  difficulty: 'Late',
  hasCorePedestal: true,
  rewardPools: [
    'Condensation Art Enchantment (III)',
    'Cauldron Enchantment (III)',
    'Corrupt Key (III)'
  ],
};

// Glitch key with special mechanics (actual game data)
export const corruptVoidKeyIII: MysticalKeyItem = {
  kind: 'mystical_key',
  name: '/$(-^&$*( Void Key (III)',
  description:
    'A fractured Void Key, further twisted to a specific purpose by Tidao Feng. Where this specific key leads you do not know, but the qi roiling off it suggests it will be the most deadly place.',
  icon: icon,
  stacks: 1,
  rarity: 'incandescent',
  realm: 'qiCondensation',
  valueTier: 0,

  contentType: 'glitch',
  rewardRarities: ['resplendent', 'incandescent'],
  factionCurses: ['(%£*!'], // Glitch blessing with random effects
  difficulty: 'Late',
  hasCorePedestal: false,
  rewardPools: [
    'Condensation Art Enchantment (III)',
    'Clothing Enchantment (III)',
    'Artefact Enchantment (III)',
    'Talisman Enchantment (III)',
    'Mount Enchantment (III)',
    'Cauldron Enchantment (III)'
  ],
  // Special override for encounter pools
  overrideEncounterPool: {
    mob: [zhangaiIII],
    elite: [
      yichanDancerIIIGlitch,
      yichanDervishIIIGlitch,
      yichanInquisitorIIIGlitch,
      yichanJudgeIIIGlitch,
    ],
    boss: [...echoOfTheEmperor],
  },
};

// High-tier corrupt key (actual game data)
export const destructionCycleKeyVCorrupt: MysticalKeyItem = {
  kind: 'mystical_key',
  name: 'Corrupt Destruction Key (V)',
  description:
    'It takes a mere single exploration of a Fallen Star to see the parallels between their powers and the blessings that fill the Mystical Regions.',
  icon: destructionIcon,
  stacks: 1,
  rarity: 'resplendent',
  realm: 'pillarCreation',

  contentType: 'cursed',
  rewardRarities: ['empowered', 'resplendent', 'incandescent'],
  factionCurses: ['Destruction Cycle'],
  difficulty: 'Late',
  hasCorePedestal: true,
  rewardPools: [
    'Condensation Art Enchantment (V)',
    'Artefact Enchantment (V)',
    'Talisman Enchantment (V)',
    'Corrupt Key (V)',
    'Merged Key (V)'
  ],
};
```

## Design Patterns

### Content Type Progression

Create keys that follow the natural progression:

1. **Blessed Keys** - Basic regions with standard rewards
2. **Cursed Keys** - Enhanced difficulty with blessing effects and better rewards
3. **Glitch Keys** - Unpredictable mechanics with unique encounters

### Blessing Selection

Choose blessings that enhance the key's theme:

- **Elemental Keys**: Use matching elemental blessings (Huo for fire themes)
- **Combat Keys**: Use damage-enhancing blessings like 'Violence' or 'Brutality'
- **Defensive Keys**: Use protective blessings like 'Protection Cycle'
- **Special Keys**: Use unique blessings like '(%£\*!' for chaotic effects

### Reward Pool Balance

Combine pools that offer different item types:

```typescript
// Balanced selection across item categories
rewardPools: [
  'Condensation Art Enchantment (III)', // Techniques
  'Clothing Enchantment (III)', // Equipment
  'Artefact Enchantment (III)' // Weapons
];
```

### Difficulty Scaling

- **Early**: Lower rarities, no core pedestal, basic blessings
- **Late**: Higher rarities, core pedestal, powerful blessings
- Match difficulty to expected player realm and capability
