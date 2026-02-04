---
layout: default
title: Interaction Types
parent: Character System
nav_order: 4
---

# Interaction Types

Characters can have various interaction types that define how players engage with them. Each interaction type has specific properties and use cases.

## Base Interaction Properties

All interactions share these common properties:

```typescript
interface BaseCharacterInteraction {
  condition: string;           // When interaction is available
  notifyCondition?: string;    // Show notification icon when true
  locations?: string[];        // Limit to specific locations
}
```

## Talk Interaction

Basic dialogue interactions for conversations and quests.

```typescript
interface TalkCharacterInteraction extends BaseCharacterInteraction {
  event: EventStep[];  // Dialogue event steps
}
```

### Example: Branching Dialogue

```typescript
const talkInteraction: TalkCharacterInteraction = {
  condition: 'realm >= meridianOpening',
  notifyCondition: 'has_quest_item == 1',  // Show ! icon
  locations: ['Nine Mountain Sect'],
  event: [
    {
      kind: 'text',
      text: 'The elder strokes his beard thoughtfully.'
    },
    {
      kind: 'speech',
      character: 'Elder Chen',
      text: 'What brings you to me, young disciple?'
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'I seek guidance',
          children: [
            {
              kind: 'speech',
              character: 'Elder Chen',
              text: 'The path of cultivation is long and arduous...'
            },
            {
              kind: 'flag',
              flag: 'received_guidance',
              value: '1',
              global: true
            }
          ]
        },
        {
          text: 'I have the item you requested',
          condition: { kind: 'item', item: { name: 'Ancient Scroll' }, amount: 1 },
          children: [
            {
              kind: 'removeItem',
              item: { name: 'Ancient Scroll' },
              amount: '1'
            },
            {
              kind: 'speech',
              character: 'Elder Chen',
              text: 'Excellent! Here is your reward.'
            },
            {
              kind: 'item',
              item: { name: 'Spirit Stone' },
              amount: '100'
            }
          ]
        },
        {
          text: 'Nothing for now',
          children: []
        }
      ]
    }
  ]
};
```

## Shop Interaction

Creates a merchant interface for buying/selling items.

```typescript
interface ShopCharacterInteraction extends BaseCharacterInteraction {
  stock: { [key in Realm]: Item[] };  // Items by realm
  costMultiplier: number;              // Price modifier
  introSteps: EventStep[];             // Shop opening dialogue
  exitSteps: EventStep[];              // Shop closing dialogue
}
```

### Example: Realm-Based Shop

```typescript
const shopInteraction: ShopCharacterInteraction = {
  condition: '1',
  stock: {
    bodyForging: [
      healingPillI,
      spiritStoneI,
      basicManual
    ],
    meridianOpening: [
      healingPillII,
      spiritStoneII,
      intermediateManual,
      protectionTalisman
    ],
    qiCondensation: [
      healingPillIII,
      spiritCoreI,
      advancedManual,
      flyingSword
    ]
    // Continue for other realms...
  },
  costMultiplier: 1.2,  // 20% markup
  introSteps: [
    {
      kind: 'speech',
      character: 'Merchant Wang',
      text: 'Welcome! I have goods from across the continent.'
    }
  ],
  exitSteps: [
    {
      kind: 'speech',
      character: 'Merchant Wang',
      text: 'Safe travels, cultivator.'
    }
  ]
};
```

## Spar Interaction

Friendly combat for training and reputation.

```typescript
interface SparCharacterInteraction extends BaseCharacterInteraction {
  introSteps: EventStep[];      // Pre-combat dialogue
  victorySteps: EventStep[];    // Player wins
  defeatSteps: EventStep[];     // Player loses
  cooldown: number;             // Days between spars
}
```

### Example: Training Spar

```typescript
const sparInteraction: SparCharacterInteraction = {
  condition: 'relationship >= 1',  // Must be friends
  cooldown: 3,
  introSteps: [
    {
      kind: 'speech',
      character: 'Senior Brother Liu',
      text: 'Ready for some training?'
    },
    {
      kind: 'text',
      text: 'You both take combat stances.'
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
      kind: 'approval',
      character: 'Senior Brother Liu',
      amount: '1'
    },
    {
      kind: 'speech',
      character: 'Senior Brother Liu',
      text: 'Well fought! You\'re improving rapidly.'
    }
  ],
  defeatSteps: [
    {
      kind: 'speech',
      character: 'Senior Brother Liu',
      text: 'Good effort! Keep training and you\'ll surpass me soon.'
    },
    {
      kind: 'qi',
      amount: '50'  // Consolation qi
    }
  ]
};
```

## Gift Interaction (Companion Only)

Accept gifts to increase companion approval.

```typescript
interface GiftCharacterInteraction extends BaseCharacterInteraction {
  key: string;               // Unique gift ID
  introSteps: EventStep[];   // Gift offering dialogue
  item: string;              // Primary gift item
  amount: number;            // Required amount
  alternates?: ItemDesc[];   // Alternative acceptable gifts
  acceptSteps: EventStep[];  // Gift accepted
  declineSteps: EventStep[]; // Gift rejected
}
```

### Example: Meaningful Gift

```typescript
const giftInteraction: GiftCharacterInteraction = {
  condition: 'relationship >= 2',
  key: 'jade_pendant_gift',
  introSteps: [
    {
      kind: 'text',
      text: 'You pull out the jade pendant.'
    },
    {
      kind: 'speech',
      character: 'Mei Ling',
      text: 'Is that... for me?'
    }
  ],
  item: 'Flawless Jade Pendant',
  amount: 1,
  alternates: [
    { name: 'Pure Jade', stacks: 10 },
    { name: 'Spirit Crystal Necklace', stacks: 1 }
  ],
  acceptSteps: [
    {
      kind: 'removeItem',
      item: { name: '$gift' },  // Remove given item
      amount: '$amount'
    },
    {
      kind: 'approval',
      character: 'Mei Ling',
      amount: '5'
    },
    {
      kind: 'speech',
      character: 'Mei Ling',
      text: 'It\'s beautiful! I\'ll treasure it always.'
    },
    {
      kind: 'flag',
      flag: 'mei_pendant_given',
      value: '1',
      global: true
    }
  ],
  declineSteps: [
    {
      kind: 'speech',
      character: 'Mei Ling',
      text: 'That\'s very kind, but I couldn\'t possibly accept something so valuable.'
    }
  ]
};
```

## Crafting Interaction

Commission crafting services from NPCs.

```typescript
interface CraftingCharacterInteraction extends BaseCharacterInteraction {
  itemKinds: ItemKind[];      // What they can craft
  craftingPower: string;      // Their skill level
  introSteps: EventStep[];    // Opening dialogue
  exitSteps: EventStep[];     // Closing dialogue
}
```

### Example: Master Alchemist

```typescript
const craftingInteraction: CraftingCharacterInteraction = {
  condition: 'reputation_alchemist >= 100',
  itemKinds: ['pill', 'elixir', 'concoction', 'reagent'],
  craftingPower: '250',  // Very skilled
  introSteps: [
    {
      kind: 'speech',
      character: 'Master Alchemist',
      text: 'Bring me materials and recipes. My cauldron awaits.'
    }
  ],
  exitSteps: [
    {
      kind: 'speech',
      character: 'Master Alchemist',
      text: 'May these medicines aid your cultivation.'
    }
  ]
};
```

## Challenge Interaction (Companion Only)

Serious combat with higher stakes than sparring.

```typescript
interface ChallengeCharacterInteraction extends BaseCharacterInteraction {
  introSteps: EventStep[];     // Challenge initiation
  victorySteps: EventStep[];   // Player wins
  defeatSteps: EventStep[];    // Player loses
}
```

### Example: Breakthrough Challenge

```typescript
const challengeInteraction: ChallengeCharacterInteraction = {
  condition: 'companion_breakthrough_ready == 1',
  introSteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'I need to test my limits before breaking through. Fight me with everything you have!'
    }
  ],
  victorySteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'Your strength... it\'s overwhelming! Now I know what I must surpass.'
    },
    {
      kind: 'approval',
      character: 'Li Wei',
      amount: '3'
    },
    {
      kind: 'flag',
      flag: 'li_wei_ready_breakthrough',
      value: '1',
      global: true
    }
  ],
  defeatSteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'I\'ve grown stronger! Thank you for this battle.'
    },
    {
      kind: 'approval',
      character: 'Li Wei',
      amount: '1'
    }
  ]
};
```

## Patrol Interaction (Companion Only)

Joint exploration and combat missions.

```typescript
interface PatrolCharacterInteraction extends BaseCharacterInteraction {
  introSteps: EventStep[];           // Patrol start
  preRepVictorySteps: EventStep[];   // Before combat
  postRepVictorySteps: EventStep[];  // After victory
  defeatSteps: EventStep[];          // If defeated
}
```

### Example: Sect Patrol

```typescript
const patrolInteraction: PatrolCharacterInteraction = {
  condition: 'relationship >= 3 && sect_reputation >= 500',
  introSteps: [
    {
      kind: 'speech',
      character: 'Senior Sister',
      text: 'The sect needs us to patrol the borders. Ready?'
    }
  ],
  preRepVictorySteps: [
    {
      kind: 'text',
      text: 'You encounter a group of rogue cultivators threatening travelers.'
    },
    {
      kind: 'combat',
      enemies: [rogueCultivator1, rogueCultivator2],
      victory: [],  // Continue to postRepVictorySteps
      defeat: []    // Go to defeatSteps
    }
  ],
  postRepVictorySteps: [
    {
      kind: 'reputation',
      amount: '10',
      name: 'Nine Mountain Sect',
      max: 'exalted'
    },
    {
      kind: 'approval',
      character: 'Senior Sister',
      amount: '2'
    },
    {
      kind: 'speech',
      character: 'Senior Sister',
      text: 'Excellent work! The sect will hear of our success.'
    },
    {
      kind: 'item',
      item: { name: 'Sect Contribution Token' },
      amount: '5'
    }
  ],
  defeatSteps: [
    {
      kind: 'text',
      text: 'You both retreat, wounded but alive.'
    },
    {
      kind: 'speech',
      character: 'Senior Sister',
      text: 'We were unprepared. Let\'s train harder for next time.'
    }
  ]
};
```

## Aid Breakthrough (Companion Only)

Help companion advance cultivation realms.

```typescript
interface AidBreakthroughCharacterInteraction extends BaseCharacterInteraction {
  steps: EventStep[];  // Breakthrough assistance event
}
```

### Example: Realm Breakthrough Aid

```typescript
const aidBreakthroughInteraction: AidBreakthroughCharacterInteraction = {
  condition: 'companion_at_peak == 1 && qi >= 1000',
  steps: [
    {
      kind: 'speech',
      character: 'Companion',
      text: 'I\'m ready to break through to the next realm. Will you help stabilize my qi?'
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'Channel your qi to help (Cost: 1000 qi)',
          condition: { kind: 'qi', amount: 1000 },
          children: [
            {
              kind: 'qi',
              amount: '-1000'
            },
            {
              kind: 'text',
              text: 'You place your hands on their back, channeling pure qi...'
            },
            {
              kind: 'passTime',
              days: '1'
            },
            {
              kind: 'speech',
              character: 'Companion',
              text: 'Success! I\'ve broken through!'
            },
            {
              kind: 'approval',
              character: 'Companion',
              amount: '10'
            },
            {
              kind: 'flag',
              flag: 'companion_realm',
              value: 'companion_realm + 1',
              global: true
            }
          ]
        },
        {
          text: 'Use breakthrough pill (requires pill)',
          condition: { kind: 'item', item: { name: 'Breakthrough Pill III' }, amount: 1 },
          children: [
            {
              kind: 'removeItem',
              item: { name: 'Breakthrough Pill III' },
              amount: '1'
            },
            {
              kind: 'speech',
              character: 'Companion',
              text: 'This pill is perfect! Thank you!'
            },
            {
              kind: 'approval',
              character: 'Companion',
              amount: '5'
            },
            {
              kind: 'flag',
              flag: 'companion_realm',
              value: 'companion_realm + 1',
              global: true
            }
          ]
        },
        {
          text: 'Not right now',
          children: [
            {
              kind: 'speech',
              character: 'Companion',
              text: 'I understand. I\'ll wait until you\'re ready.'
            }
          ]
        }
      ]
    }
  ]
};
```

## Custom Interactions

Fully customizable interaction blocks for unique mechanics.

```typescript
interface CustomCharacterInteractionBlock {
  condition: string;         // When block appears
  name: string;             // UI label
  tooltip: string;          // Hover description
  icon: IconComponent;      // MUI icon
  interactions: CustomCharacterInteraction[];
}

interface CustomCharacterInteraction extends BaseCharacterInteraction {
  disableCondition?: string;  // When greyed out
  disableTooltip?: string;    // Disabled hover text
  event: EventStep[];         // Interaction content
}
```

### Example: Technique Training

```typescript
const customInteraction: CustomCharacterInteractionBlock = {
  condition: 'relationship >= 4',
  name: 'Learn Technique',
  tooltip: 'Learn a special technique from this master',
  icon: SchoolIcon,
  interactions: [{
    condition: 'learned_technique == 0',
    disableCondition: 'realm < 3',
    disableTooltip: 'Requires Qi Condensation realm',
    event: [
      {
        kind: 'speech',
        character: 'Master',
        text: 'You are ready to learn my secret technique.'
      },
      {
        kind: 'choice',
        choices: [
          {
            text: 'Learn the technique (Cost: 500 Spirit Stones)',
            condition: { kind: 'money', amount: 500 },
            children: [
              {
                kind: 'money',
                amount: '-500'
              },
              {
                kind: 'unlockTechnique',
                technique: 'Secret Sword Art'
              },
              {
                kind: 'flag',
                flag: 'learned_technique',
                value: '1',
                global: true
              }
            ]
          },
          {
            text: 'Not yet',
            children: []
          }
        ]
      }
    ]
  }]
};
```

## Interaction Best Practices

1. **Condition Logic**: Use clear, meaningful conditions for availability
2. **Notification Icons**: Use `notifyCondition` to alert players to important interactions
3. **Location Limits**: Restrict interactions to appropriate locations for realism
4. **Cooldown Balance**: Set reasonable cooldowns to prevent exploitation
5. **Reward Scaling**: Scale rewards based on realm and relationship level
6. **Dialogue Quality**: Write engaging, character-appropriate dialogue
7. **Choice Consequences**: Make player choices meaningful with different outcomes
8. **Progressive Content**: Gate advanced interactions behind progression milestones