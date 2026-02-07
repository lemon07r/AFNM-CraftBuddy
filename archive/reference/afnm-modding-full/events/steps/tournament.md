---
layout: default
title: Tournament Step
parent: Event Step Types
grand_parent: Events System
nav_order: 25
description: 'Create multi-round tournament competitions with bracket-style progression'
---

# Tournament Step

## Introduction

The Tournament Step creates structured competitive events where the player participates in bracket-style tournaments against multiple opponents. Tournaments are ideal for festival events, sect competitions, and major story milestones that showcase the player's growing cultivation prowess.

The system automatically manages tournament bracket progression, opponent selection from participant pools, and handles victory/defeat outcomes at different stages including first place, second place, and elimination scenarios.

## Interface

```typescript
interface TournamentStep {
  kind: 'tournament';
  condition?: string;
  title: string;
  participantPool: EnemyEntity[];
  participantCharacters?: string[];
  participantBuffs: Buff[];
  guaranteedWinner?: string;
  victory: EventStep[];
  secondPlace?: EventStep[];
  defeat: EventStep[];
}
```

## Properties

### Required Properties

**`kind`** - Always `'tournament'`

- Identifies this as a tournament competition step

**`title`** - Tournament display name

- String shown to players during the tournament
- Should be descriptive and thematic
- Examples: "Ying Meihua Festival Tournament", "Sect Ranking Competition"

**`participantPool`** - Array of possible opponents

- Pool of `EnemyEntity` objects representing potential tournament participants
- System randomly selects 7 opponents from this pool for an 8-person bracket
- Can include duplicates if pool is smaller than needed

**`participantBuffs`** - Buffs applied during tournament

- Array of `Buff` objects applied to the player during all tournament fights
- Often used to restrict technique schools or provide thematic bonuses
- Applied automatically when tournament begins, removed when finished

**`victory`** - Steps for winning the tournament

- Event steps executed when player wins first place
- Typically includes rewards, reputation gains, and celebration narrative
- Should provide meaningful recognition for the achievement

**`defeat`** - Steps for elimination

- Event steps executed when player is eliminated before the finals
- Usually consolation narrative and minor rewards for participation
- Helps maintain positive player experience even in defeat

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must be true for tournament to occur
- Tournament is skipped if condition fails
- Useful for one-time events or progression gates

**`participantCharacters`** - Named character participants

- Array of character names to include as tournament opponents
- These characters are converted to `EnemyEntity` objects and added to the participant pool
- Useful for story-driven tournaments featuring specific rivals or allies

**`guaranteedWinner`** - Character guaranteed to reach finals

- Name of a character who will always advance to face the player in the finals
- Must be present in either `participantPool` or `participantCharacters`
- Creates dramatic final confrontations with specific story characters

**`secondPlace`** - Steps for reaching finals but losing

- Event steps executed when player reaches the final match but loses
- Provides distinct narrative and rewards for getting second place
- If not specified, `defeat` steps are used for final match losses

## Basic Examples

### Simple Festival Tournament

```typescript
{
  kind: 'tournament',
  title: 'Village Harvest Tournament',
  participantPool: [
    // Array of EnemyEntity objects representing local competitors
    villageChampion,
    travelingMartialArtist,
    youngProdigy,
    veteranFighter
  ],
  participantBuffs: [
    {
      name: 'Tournament Rules',
      icon: 'tournament_icon',
      canStack: false,
      stats: {
        weaponDisabled: { value: 1, stat: undefined }
      },
      onTechniqueEffects: [],
      onRoundEffects: [],
      stacks: 1
    }
  ],
  victory: [
    {
      kind: 'text',
      text: 'The crowd erupts in cheers as you claim victory! You have proven yourself the strongest warrior in the village.'
    },
    {
      kind: 'money',
      amount: '5000'
    },
    {
      kind: 'addItem',
      item: { name: 'Village Champion Medal' },
      amount: '1'
    }
  ],
  defeat: [
    {
      kind: 'text',
      text: 'Though you fought valiantly, you were eliminated from the tournament. The experience has taught you much about combat.'
    },
    {
      kind: 'money',
      amount: '500'
    }
  ]
}
```

### Sect Ranking Tournament

```typescript
{
  kind: 'tournament',
  title: 'Inner Sect Ranking Competition',
  participantPool: innerSectDisciples,
  participantBuffs: [],
  victory: [
    {
      kind: 'text',
      text: 'Your mastery has been acknowledged by all. You now stand at the pinnacle of the inner sect disciples.'
    },
    {
      kind: 'changeReputation',
      name: 'Sect Standing',
      amount: '3'
    },
    {
      kind: 'addItem',
      item: { name: 'Inner Sect Champion Robes' },
      amount: '1'
    }
  ],
  secondPlace: [
    {
      kind: 'text',
      text: 'You fought admirably and reached the finals, earning the respect of your sect brothers and sisters.'
    },
    {
      kind: 'changeReputation',
      name: 'Sect Standing',
      amount: '2'
    }
  ],
  defeat: [
    {
      kind: 'text',
      text: 'The competition was fierce, but you gained valuable experience fighting against fellow disciples.'
    },
    {
      kind: 'changeReputation',
      name: 'Sect Standing',
      amount: '-1'
    }
  ]
}
```

### Tournament with Named Character

```typescript
{
  kind: 'tournament',
  title: 'Championship Finals',
  participantPool: [
    ...tournamentEliteParticipants
  ],
  participantCharacters: ['Lingxi Gian'], // Add specific rival
  participantBuffs: [],
  guaranteedWinner: 'Lingxi Gian', // Ensures dramatic final confrontation
  victory: [
    {
      kind: 'text',
      text: 'In an intense final battle, you manage to overcome Lingxi Gian\'s formidable cloud techniques. She nods with grudging respect.'
    },
    {
      kind: 'speech',
      character: 'Lingxi Gian',
      text: '"Impressive. You have earned this victory. Perhaps I misjudged your potential."'
    },
    {
      kind: 'approval',
      character: 'Lingxi Gian',
      amount: '2'
    }
  ],
  secondPlace: [
    {
      kind: 'text',
      text: 'You fight with all your might, but cannot prevail against Lingxi\'s overwhelming power. Still, reaching the finals against such an opponent is an achievement.'
    },
    {
      kind: 'speech',
      character: 'Lingxi Gian',
      text: '"You showed more skill than I expected. Continue your cultivation and perhaps next time will be different."'
    }
  ],
  defeat: [
    {
      kind: 'text',
      text: 'You are eliminated before reaching the finals, but the tournament has shown you areas where your cultivation must improve.'
    }
  ]
}
```

## Tournament Mechanics

### Bracket Structure

Tournaments in AFNM use an 8-person single-elimination bracket:

- 7 opponents selected from participant pool
- Player always participates as the 8th contestant
- 3 rounds: Quarterfinals → Semifinals → Finals
- Each round consists of 4 → 2 → 1 matches

### Opponent Selection

The system automatically handles opponent selection:

1. Randomly selects 7 unique opponents from the participant pool
2. If pool has fewer than 7 unique entities, can select duplicates
3. Characters from `participantCharacters` are converted to enemies and added
4. If `guaranteedWinner` is specified, they occupy one of the 7 slots

### Tournament Progression

- **Player wins match**: Advances to next round
- **Player loses match**: Tournament ends with `defeat` or `secondPlace` outcomes
- **Non-player matches**: Determined randomly, unless `guaranteedWinner` is involved

### Outcome Resolution

Tournament results trigger different event sequences:

- **Victory**: Player wins finals → `victory` steps
- **Second Place**: Player loses finals → `secondPlace` steps (if provided) or `defeat` steps
- **Elimination**: Player loses before finals → `defeat` steps
