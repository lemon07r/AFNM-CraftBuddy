---
layout: default
title: NPCs
parent: Character System
nav_order: 2
---

# NPCs (Neutral & Enemy Characters)

NPCs form the backbone of the game world, providing services, quests, and challenges. This page covers neutral and enemy character types.

## Neutral Characters

Neutral characters are non-hostile NPCs that provide various services and interactions.

### Definition Structure

```typescript
interface NeutralCharacterDefinition extends BaseCharacterDefinition {
  kind: 'neutral';

  breakthroughInteraction?: TalkCharacterInteraction;
  talkInteraction?: TalkCharacterInteraction[];
  shopInteraction?: ShopCharacterInteraction[];
  sparInteraction?: SparCharacterInteraction[];
  craftingInteraction?: CraftingCharacterInteraction[];
}
```

### Talk Interactions

Basic dialogue interactions:

```typescript
const talkInteraction: TalkCharacterInteraction = {
  condition: 'realm >= meridianOpening',  // Only for Meridian Opening+
  locations: ['Sect Library'], // Optional: specific locations
  event: [
    {
      kind: 'text',
      text: 'The scholar looks up from his scrolls.'
    },
    {
      kind: 'speech',
      character: 'Scholar Wei',
      text: 'Ah, a fellow seeker of knowledge!'
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'Ask about cultivation techniques',
          children: [
            {
              kind: 'speech',
              character: 'Scholar Wei',
              text: 'The path to immortality...'
            }
          ]
        },
        {
          text: 'Leave',
          children: []
        }
      ]
    }
  ]
};
```

### Shop Interactions

Merchant NPCs with realm-based inventory:

```typescript
const shopInteraction: ShopCharacterInteraction = {
  condition: '1',
  stock: {
    bodyForging: [
      healingPillI,
      spiritStone
    ],
    meridianOpening: [
      healingPillII,
      cultivationManual
    ],
    qiCondensation: [
      healingPillIII,
      advancedManual
    ]
    // ...other realms
  },
  costMultiplier: 1.5,  // Price modifier
  introSteps: [
    {
      kind: 'speech',
      character: 'Merchant Chen',
      text: 'Welcome! Browse my wares.'
    }
  ],
  exitSteps: [
    {
      kind: 'speech',
      character: 'Merchant Chen',
      text: 'Come back anytime!'
    }
  ]
};
```

### Sparring Interactions

Friendly combat for training:

```typescript
const sparInteraction: SparCharacterInteraction = {
  condition: '1',
  cooldown: 5,  // Days between spars
  introSteps: [
    {
      kind: 'speech',
      character: 'Disciple Han',
      text: 'Want to test your skills?'
    }
  ],
  victorySteps: [
    {
      kind: 'reputation',
      amount: '2',
      name: 'Nine Mountain Sect',
      max: 'respected'
    },
    {
      kind: 'speech',
      character: 'Disciple Han',
      text: 'Well fought!'
    }
  ],
  defeatSteps: [
    {
      kind: 'speech',
      character: 'Disciple Han',
      text: 'Better luck next time!'
    }
  ]
};
```

### Crafting Services

NPCs that craft items for players:

```typescript
const craftingInteraction: CraftingCharacterInteraction = {
  condition: '1',
  itemKinds: ['pill', 'elixir', 'concoction'],  // What they can craft
  craftingPower: '150',  // Their crafting skill level
  introSteps: [
    {
      kind: 'speech',
      character: 'Alchemist Liu',
      text: 'I can refine pills for you.'
    }
  ],
  exitSteps: [
    {
      kind: 'speech',
      character: 'Alchemist Liu',
      text: 'May your cultivation prosper.'
    }
  ]
};
```

## Enemy Characters

Enemy characters are hostile NPCs that can be attacked and defeated.

### Definition Structure

```typescript
interface EnemyCharacterDefinition extends BaseCharacterDefinition {
  kind: 'enemy';

  attackEvent: TalkCharacterInteraction[];  // Combat initiation
  beatenResetMonths?: number;  // Respawn timer (default: never)
}
```

### Attack Events

What happens when attacking the enemy:

```typescript
const attackEvent: TalkCharacterInteraction = {
  condition: '1',
  event: [
    {
      kind: 'text',
      text: 'The bandit draws his blade with a snarl.'
    },
    {
      kind: 'speech',
      character: 'Bandit Leader',
      text: 'You dare challenge me?!'
    },
    {
      kind: 'fightCharacter',
      character: 'Bandit Leader',  // Use character's stats
      victory: [
        {
          kind: 'markBeatCharacter',
          character: 'Bandit Leader'
        },
        {
          kind: 'text',
          text: 'The bandit falls to his knees.'
        },
        {
          kind: 'speech',
          character: 'Bandit Leader',
          text: 'This... is not... possible!'
        },
        {
          kind: 'flag',
          flag: 'bandit_defeated',
          value: '1',
          global: true
        }
      ],
      defeat: [
        {
          kind: 'text',
          text: 'You are overwhelmed by the bandit\'s strength.'
        }
      ]
    }
  ]
};
```

### Respawning Enemies

Enemies that return after being defeated:

```typescript
const respawningEnemy: EnemyCharacterDefinition = {
  kind: 'enemy',
  condition: '1',
  realm: 'qiCondensation',
  realmProgress: 'Early',

  beatenResetMonths: 3,  // Respawns after 3 months

  attackEvent: [{
    condition: 'character_beaten == 0',  // First encounter
    event: [...]
  }, {
    condition: 'character_beaten == 1',  // After respawn
    event: [
      {
        kind: 'speech',
        character: 'Vengeful Cultivator',
        text: 'You! I\'ve been training for our rematch!'
      }
      // Combat event...
    ]
  }],

  stats: [...],
  locations: [...],
  encounters: [...]
};
```

## Complete NPC Examples

### Quest Giver NPC

```typescript
const questGiver: Character = {
  name: 'Elder Zhang',
  allegiance: 'Nine Mountains',
  bio: 'A wise elder who guides young disciples.',
  condition: '1',
  portrait: 'elder_zhang_portrait.png',
  image: 'elder_zhang.png',

  definitions: [{
    kind: 'neutral',
    condition: '1',
    realm: 'coreFormation',
    realmProgress: 'Late',

    stats: [],  // Non-combatant

    locations: [{
      kind: 'static',
      condition: '1',
      location: 'Mission Hall'
    }],

    talkInteraction: [{
      condition: 'quest_complete == 0',
      event: [
        {
          kind: 'speech',
          character: 'Elder Zhang',
          text: 'I have a task for you...'
        },
        {
          kind: 'quest',
          quest: 'eliminate_spirit_beasts'
        }
      ]
    }, {
      condition: 'quest_complete == 1',
      event: [
        {
          kind: 'speech',
          character: 'Elder Zhang',
          text: 'Well done! Here is your reward.'
        },
        {
          kind: 'item',
          item: { name: 'Spirit Stone' },
          amount: '100'
        }
      ]
    }],

    encounters: []
  }]
};
```

### Wandering Merchant

```typescript
const wanderingMerchant: Character = {
  name: 'Trader Feng',
  allegiance: undefined,
  bio: 'A mysterious merchant with rare goods.',
  condition: '1',
  portrait: 'trader_feng_portrait.png',
  image: 'trader_feng.png',

  definitions: [{
    kind: 'neutral',
    condition: '1',
    realm: 'meridianOpening',
    realmProgress: 'Middle',

    stats: [{
      condition: '1',
      stats: {
        difficulty: 'hard',
        battleLength: 'short',
        // Has good gear if attacked
        artefacts: [{ name: 'Escape Talisman' }],
        drops: []  // Drops nothing to discourage attacks
      }
    }],

    locations: [{
      kind: 'random',
      condition: '1',
      locations: [
        { location: 'Crossroads', duration: { min: 2, max: 4 } },
        { location: 'Shen Henda City', duration: { min: 3, max: 5 } },
        { location: 'Xi Dian Outpost', duration: { min: 1, max: 3 } }
      ]
    }],

    shopInteraction: [{
      condition: '1',
      stock: {
        meridianOpening: [
          rareManual,
          mysticalKey,
          ancientPill
        ]
      },
      costMultiplier: 3.0,  // Expensive!
      introSteps: [
        {
          kind: 'speech',
          character: 'Trader Feng',
          text: 'Rare treasures, for those who can afford them...'
        }
      ],
      exitSteps: []
    }],

    encounters: [{
      id: 'feng_special_offer',
      condition: 'money >= 1000',
      cooldown: { min: 30, max: 60 },
      event: [
        {
          kind: 'speech',
          character: 'Trader Feng',
          text: 'Psst... I have something special today.'
        }
        // Special shop event...
      ]
    }]
  }]
};
```

### Hostile Cultivator

```typescript
const demonicCultivator: Character = {
  name: 'Corrupted Disciple',
  allegiance: 'Demonic Sect',
  bio: 'A cultivator who fell to demonic arts.',
  condition: 'demonic_invasion == 1',
  portrait: 'corrupted_portrait.png',
  image: 'corrupted_full.png',

  definitions: [{
    kind: 'enemy',
    condition: '1',
    realm: 'qiCondensation',
    realmProgress: 'Late',

    stats: [{
      condition: '1',
      stats: {
        difficulty: 'hard',
        battleLength: 'long',
        stances: [/* demonic techniques */],
        drops: [
          { name: 'Corrupted Core', amount: 1 },
          { name: 'Demonic Scripture', amount: 1, chance: 0.1 }
        ],
        affinities: {
          blood: 80
        }
      }
    }],

    locations: [{
      kind: 'wander',
      condition: '1',
      route: [
        { location: 'Northern Wastes', duration: { min: 5, max: 10 } },
        { location: 'Corrupted Grove', duration: { min: 3, max: 7 } }
      ]
    }],

    attackEvent: [{
      condition: '1',
      event: [
        {
          kind: 'text',
          text: 'Dark qi swirls around the corrupted cultivator.'
        },
        {
          kind: 'speech',
          character: 'Corrupted Disciple',
          text: 'Your soul will feed my cultivation!'
        },
        {
          kind: 'combat',
          enemies: ['$character'],
          victory: [
            {
              kind: 'text',
              text: 'The demonic qi dissipates as the cultivator falls.'
            },
            {
              kind: 'reputation',
              amount: '10',
              name: 'Nine Mountain Sect',
              max: 'exalted'
            }
          ],
          defeat: [
            {
              kind: 'text',
              text: 'The demonic cultivator laughs as darkness takes you.'
            }
          ]
        }
      ]
    }],

    beatenResetMonths: 1,  // Respawns monthly

    encounters: []
  }]
};
```

## Registering NPCs

```typescript
// Add NPCs to the game
window.modAPI.actions.addCharacter(questGiver);
window.modAPI.actions.addCharacter(wanderingMerchant);
window.modAPI.actions.addCharacter(demonicCultivator);
```