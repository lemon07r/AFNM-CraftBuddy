---
layout: default
title: Enemy Structure
parent: Enemies
nav_order: 1
---

# Enemy Structure

The `EnemyEntity` interface defines the complete structure for all enemies in AFNM. Understanding this structure is essential for creating balanced and engaging combat encounters.

## Core Properties

### Basic Information

```typescript
interface EnemyEntity {
  name: string; // Display name for the enemy
  image: string; // Path to enemy sprite/image
  imageScale: number; // Visual scaling factor (typically 0.5-3)
  imageOffset?: {
    // Optional position adjustment
    x: number;
    y: number;
  };
  disableBreathing?: boolean; // Disable idle animation
}
```

### Realm & Progression

```typescript
{
  realm: Realm; // Cultivation realm (qiCondensation, meridianOpening, etc.)
  realmProgress: RealmProgress; // Early, Middle, or Late stage
  difficulty: EnemyDifficulty; // Difficulty tier (see below)
  battleLength: BattleLength; // Expected combat duration
}
```

#### Difficulty Tiers

How much damage the enemy will do over its lifetime. Damage per round is `damage / battle length`.

| Tier                         | Description            | Use Case             |
| ---------------------------- | ---------------------- | -------------------- |
| `veryeasy`                   | Trivial opponents      | Tutorial, farming    |
| `easy`                       | Below player level     | Warm-up encounters   |
| `mediumEasy`                 | Slightly below level   | Standard mobs        |
| `medium`                     | Equal to player        | Regular encounters   |
| `medium+`                    | Slightly challenging   | Elite variants       |
| `mediumhard`                 | Moderately challenging | Mini-bosses          |
| `hard`                       | Significant challenge  | Bosses               |
| `hard+`                      | Very challenging       | Elite bosses         |
| `veryhard` to `veryhard++++` | Extreme challenges     | Legendary encounters |

#### Battle Length

How long it should survive.

| Length      | Rounds | Description          |
| ----------- | ------ | -------------------- |
| `halfround` | <1     | Instant kill enemies |
| `1round`    | 1      | Single exchange      |
| `veryshort` | 2-3    | Quick encounters     |
| `short`     | 4-6    | Standard fights      |
| `medium`    | 7-10   | Tactical battles     |
| `long`      | 11-15  | Endurance tests      |
| `verylong`+ | 16+    | Marathon battles     |

#### Note on stats

You cannot set stats directly. They are derived from the difficulty and battle length to have stats to give roughly that level of danger. You can then modifies these after the fact with spawn condition to add flat multipliers on top of the stats if neccessary.

## Combat Configuration

### Stances

Stances define technique sequences that enemies cycle through:

```typescript
{
  stances: Stance[];         // Array of available stances
  stanceRotation: StanceRule[]; // Rules for stance switching
  rotationOverrides: SingleStance[]; // Conditional stance overrides
}
```

#### Stance Definition

```typescript
interface Stance {
  name: string; // Unique identifier
  techniques: Technique[]; // Ordered technique sequence
}
```

#### Stance Rotation Rules

```typescript
type StanceRule = SingleStance | RandomStance;

interface SingleStance {
  kind: 'single';
  stance: string; // Stance name to use
  condition?: string; // Mathematical condition
  repeatable?: boolean; // Can be used multiple times
  alternatives?: StanceRule[]; // Fallback options
}

interface RandomStance {
  kind: 'random';
  stances: string[]; // Pool of stances to choose from
  condition?: string;
  repeatable?: boolean;
  alternatives?: StanceRule[];
}
```

### Equipment & Pills

```typescript
{
  talismans?: ItemDesc[];    // Equipped talismans
  artefacts?: ItemDesc[];    // Equipped artefacts
  affinities?: Partial<Record<TechniqueElement, number>>; // Elemental affinities

  pillsPerRound?: number;    // Pills consumption limit
  pills?: {                  // Conditional pill usage
    condition: string;       // When to use (e.g., "hp < 0.5 * maxhp")
    pill: CombatPillItem | ConcoctionItem;
  }[];
}
```

## Special Properties

### Spawn Conditions

```typescript
{
  spawnCondition?: {
    hpMult: number;          // HP multiplier when spawned, e.g. spawning at half health due to a story condition saying its been weakened
    buffs: Buff[];           // Pre-applied buffs
  };

  spawnRoar?: SoundEffectName; // Sound effect on spawn
}
```

### Stat Multipliers

```typescript
{
  statMultipliers?: {
    hp?: number;             // Health multiplier
    power?: number;          // Damage multiplier
  };
}
```

### Character Flag

```typescript
{
  isCharacter?: boolean;     // True for NPC combatants. This rescales their hp to be in the correct range for a player, and gives defense to compensate
}
```

## Rewards Configuration

### Drop System

```typescript
{
  drops: {
    item: Item;              // Item to drop
    amount: number;          // Quantity
    chance: number;          // Drop rate (0-1)
    condition?: string;      // Optional condition
  }[];

  shardMult?: number;        // Pillar shard multiplier
  qiMult?: number;           // Qi reward multiplier
}
```

### Special Flags

```typescript
{
  hideFromCompendium?: boolean; // Hide from bestiary
  qiDroplets?: number;       // Qi droplet rewards
}
```

## Advanced Configuration

### Preconfigured Combat Entity

For complex enemies, you can provide a complete `CombatEntity` configuration:

```typescript
{
  preconfiguredCombatEntity?: CombatEntity;
}
```

This allows for precise control over initial combat state, including:

- Custom stat distributions
- Pre-applied buffs
- Special rendering configurations
- Initial stance positioning

## Example Implementation

```typescript
const exampleEnemy: EnemyEntity = {
  name: 'Corrupted Spirit Beast',
  image: 'path/to/sprite.png',
  imageScale: 1.5,
  realm: 'qiCondensation',
  realmProgress: 'Middle',
  difficulty: 'medium',
  battleLength: 'short',

  stances: [
    {
      name: 'aggressive',
      techniques: [clawStrike, bite, clawStrike, roar],
    },
    {
      name: 'defensive',
      techniques: [harden, regenerate, clawStrike],
    },
  ],

  stanceRotation: [
    { kind: 'single', stance: 'aggressive' },
    {
      kind: 'single',
      stance: 'defensive',
      condition: 'hp < 0.3 * maxhp',
    },
  ],

  rotationOverrides: [],

  drops: [
    { item: spiritCore, amount: 1, chance: 0.5 },
    { item: beastFang, amount: 2, chance: 0.8 },
  ],
};
```

## Condition Expressions

Conditions use mathematical expressions with available variables:

- `hp`, `maxhp` - Current and maximum health
- `round` - Current combat round
- `power`, `defense` - Combat stats
- `buffStacks('BuffName')` - Check buff stack count
- `hasBuff('BuffName')` - Check if buff exists
- `enemyhp`, `enemymaxhp` - Target's health values

Examples:

- `"hp < 0.5 * maxhp"` - Below 50% health
- `"round > 3"` - After round 3
- `"buffStacks('Rage') >= 3"` - 3+ Rage stacks
