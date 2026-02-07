---
layout: default
title: Relationship System
parent: Character System
nav_order: 5
---

# Relationship System

The relationship system allows companions to develop deep bonds with the player through approval mechanics, relationship tiers, party formation, and intimate interactions including dual cultivation.

## Relationship Categories

Four main relationship categories define the bond level:

```typescript
type CharacterRelationship = 'Hostile' | 'Neutral' | 'Friendly' | 'Intimate';
```

Each category has distinct visual indicators:

- **Hostile**: Red border, attack/threaten options available
- **Neutral**: Gray border, basic interactions only
- **Friendly**: Green border, party and advanced interactions
- **Intimate**: Pink border, dual cultivation and maximum benefits

### Gaining Approval

```typescript
// Gift giving
{
  kind: 'approval',
  character: 'Companion Name',
  amount: '3'  // Can be negative for disapproval
}

// Sparring victory
{
  kind: 'approval',
  character: 'Companion Name',
  amount: '1'
}

// Quest completion
{
  kind: 'approval',
  character: 'Companion Name',
  amount: '5'
}
```

## Relationship Definition Structure

```typescript
interface CharacterRelationshipDefinition {
  requiredApproval: number; // Minimum approval needed to unlock progression event to next tier
  relationshipCategory: CharacterRelationship;
  name: string; // Tier name (e.g., "Best Friend")
  tooltip: string; // Description shown in UI

  followCharacter?: FollowCharacterDefinition; // Party mechanics
  dualCultivation?: DualCultivationDefinition; // Intimate interactions

  progressionEvent: {
    // Event to reach next tier
    name: string; // Event title
    tooltip: string; // Event description
    event: EventStep[]; // Event content
    locationOverride?: string; // Specific location required
    requirement?: {
      // Additional requirements
      condition: string;
      tooltip: string;
    };
  };
}
```

## Relationship Tiers Example

```typescript
const relationshipProgression: CharacterRelationshipDefinition[] = [
  // Tier 1: Acquaintance (progression event unlocks at 5 approval)
  {
    requiredApproval: 5,
    relationshipCategory: 'Neutral',
    name: 'Acquaintance',
    tooltip: "You've just met and know little about each other.",

    progressionEvent: {
      name: 'First Conversation',
      tooltip: 'Get to know your new acquaintance',
      event: [
        {
          kind: 'speech',
          character: 'Companion',
          text: "It's nice to finally talk properly...",
        },
        // Dialogue about background
        {
          kind: 'progressRelationship',
          character: 'Companion',
        },
      ],
    },
  },

  // Tier 2: Friend (progression event unlocks at 6 approval)
  {
    requiredApproval: 6,
    relationshipCategory: 'Friendly',
    name: 'Friend',
    tooltip: 'A trusted friend who will aid you in battle.',

    followCharacter: {
      formParty: [
        {
          kind: 'speech',
          character: 'Companion',
          text: "Let's travel together!",
        },
      ],
      duration: 3,
      buff: {
        canStack: false,
        stats: {
          defense: { value: 1.5, stat: 'power' },
        },
        onTechniqueEffects: [],
        onRoundEffects: [],
        stacks: 1,
      },
      cooldown: 5,
      dissolveParty: [
        {
          kind: 'speech',
          character: 'Companion',
          text: 'I need to handle my own affairs for now.',
        },
      ],
    },

    progressionEvent: {
      name: 'Deeper Bonds',
      tooltip: 'Your friendship deepens',
      requirement: {
        condition: 'realm >= meridianOpening',
        tooltip: 'Reach Meridian Opening realm',
      },
      event: [
        // Emotional conversation
      ],
    },
  },

  // Tier 3: Close Friend (progression event unlocks at 8 approval)
  {
    requiredApproval: 8,
    relationshipCategory: 'Friendly',
    name: 'Close Friend',
    tooltip: 'Your bond is unbreakable.',

    followCharacter: {
      duration: 5, // Longer party duration
      buff: {
        // Stronger buffs
        stats: {
          defense: { value: 2.5, stat: 'power' },
          barrierMitigation: { value: 5, stat: undefined },
        },
      },
      cooldown: 3, // Shorter cooldown
    },

    progressionEvent: {
      name: 'A Moment of Truth',
      tooltip: 'Something important is about to happen',
      locationOverride: 'Nine Mountain Sect', // Will override the character location whilst this event is available
      event: [
        // Confession or major revelation
      ],
    },
  },

  // Tier 4: Sworn Sibling (progression event unlocks at 10 approval)
  {
    requiredApproval: 10,
    relationshipCategory: 'Friendly',
    name: 'Sworn Brother/Sister',
    tooltip: 'Bound by oath and honor.',

    followCharacter: {
      duration: 7,
      buff: {
        stats: {
          defense: { value: 3, stat: 'power' },
          barrierMitigation: { value: 8, stat: undefined },
        },
        onTechniqueEffects: [
          {
            kind: 'damage',
            amount: { value: 0.1, stat: 'power' },
          },
        ],
      },
      cooldown: 2,
    },

    progressionEvent: {
      name: 'Oath Ceremony',
      tooltip: 'Become sworn siblings',
      requirement: {
        condition: 'realm >= qiCondensation && defeated_boss == 1',
        tooltip: 'Reach Qi Condensation and defeat a major enemy together',
      },
      event: [
        {
          kind: 'text',
          text: 'You perform the ancient ceremony...',
        },
        {
          kind: 'speech',
          character: 'Companion',
          text: 'From this day forward, we are family.',
        },
        {
          kind: 'progressRelationship',
          character: 'Companion',
        },
      ],
    },
  },

  // Tier 5: Partner (progression event unlocks at 10 approval)
  {
    requiredApproval: 10,
    relationshipCategory: 'Intimate',
    name: 'Partner',
    tooltip: 'Your hearts beat as one.',

    followCharacter: {
      duration: 10,
      buff: {
        // Maximum combat buffs
        stats: {
          defense: { value: 4, stat: 'power' },
          barrierMitigation: { value: 10, stat: undefined },
          power: { value: 0.5, stat: 'power' },
        },
        onTechniqueEffects: [
          {
            kind: 'damage',
            amount: { value: 0.15, stat: 'power' },
          },
        ],
      },
      cooldown: 1,
    },

    dualCultivation: {
      condition: '1',
      traits: [lovesTender, lovesPassionate], // Required trait objects
      intro: [
        {
          kind: 'speech',
          character: 'Companion',
          text: 'Shall we cultivate together, my love?',
        },
      ],
      success: [
        {
          kind: 'qi',
          amount: 'maxqi * 0.3',
        },
        {
          kind: 'approval',
          character: 'Companion',
          amount: '1',
        },
        {
          kind: 'text',
          text: 'Your qi harmonizes perfectly, strengthening both of you.',
        },
      ],
      failure: [
        {
          kind: 'text',
          text: 'Your techniques clash, but the attempt brings you closer.',
        },
      ],
    },

    progressionEvent: {
      name: 'Eternal Bond',
      tooltip: 'Become Dao Partners',
      requirement: {
        condition: 'realm >= coreFormation',
        tooltip: 'Reach Core Formation realm',
      },
      event: [
        // Dao partner ceremony
      ],
    },
  },

  // Tier 6: Dao Partner (progression event unlocks at 10 approval)
  {
    requiredApproval: 10,
    relationshipCategory: 'Intimate',
    name: 'Dao Partner',
    tooltip: 'Your souls are forever intertwined.',

    followCharacter: {
      duration: -1, // Unlimited
      buff: {
        // Transcendent buffs
        stats: {
          defense: { value: 5, stat: 'power' },
          barrierMitigation: { value: 15, stat: undefined },
          power: { value: 1, stat: 'power' },
          healthMax: { value: 0.5, stat: 'healthMax' },
        },
        onTechniqueEffects: [
          {
            kind: 'damage',
            amount: { value: 0.2, stat: 'power' },
          },
        ],
        onRoundEffects: [
          {
            kind: 'heal',
            amount: { value: 0.05, stat: 'healthMax' },
          },
        ],
      },
      cooldown: 0, // No cooldown
    },

    dualCultivation: {
      condition: '1',
      traits: [lovesTender, lovesPassionate, energetic],
      intro: [
        {
          kind: 'speech',
          character: 'Companion',
          text: 'Our souls resonate as one.',
        },
      ],
      success: [
        {
          kind: 'qi',
          amount: 'maxqi * 0.5', // Maximum qi gain
        },
        {
          kind: 'approval',
          character: 'Companion',
          amount: '2',
        },
        {
          kind: 'buff',
          buff: 'Harmonized Souls', // Temporary combat buff
          duration: 30,
        },
      ],
      failure: [], // Cannot fail at this level
    },

    progressionEvent: {
      name: '', // No further progression
      tooltip: '',
      event: [],
    },
  },
];
```

## Party System

Companions can join the player's party (normally unlocked Friendly relationship or higher).

```typescript
interface FollowCharacterDefinition {
  formParty: EventStep[]; // Party formation dialogue
  duration: number; // Days in party (-1 for unlimited)
  buff: Buff; // Combat bonuses while in party
  cooldown: number; // Days before can party again
  dissolveParty: EventStep[]; // Party dissolution dialogue
}
```

### Party Buffs Scale with Relationship

```typescript
// Friend tier buffs
buff: {
  stats: {
    defense: { value: 1.5, stat: 'power' }
  }
}

// Close Friend tier buffs
buff: {
  stats: {
    defense: { value: 2.5, stat: 'power' },
    barrierMitigation: { value: 5, stat: undefined }
  }
}

// Dao Partner tier buffs
buff: {
  stats: {
    defense: { value: 5, stat: 'power' },
    power: { value: 1, stat: 'power' },
    healthMax: { value: 0.5, stat: 'healthMax' }
  },
  onRoundEffects: [{
    kind: 'heal',
    amount: { value: 0.05, stat: 'healthMax' }
  }]
}
```

## Dual Cultivation

Available at Intimate relationship levels for deep qi sharing.

```typescript
interface DualCultivationDefinition {
  condition: string; // Additional requirements
  traits: IntimateTrait[]; // Required traits for success
  intro: EventStep[]; // Initiation dialogue
  success: EventStep[]; // Successful cultivation
  failure: EventStep[]; // Failed attempt
}
```

### Intimate Traits

Success in dual cultivation depends on matching traits:

```typescript
// Available intimate traits from the game
const traits = [
  'lovesRough', // Prefers rough intimacy
  'lovesTender', // Prefers tender intimacy
  'lovesPassionate', // Passionate lover
  'aggressiveLover', // Dislikes tender approaches
  'hardToPlease', // High standards
  'hairTrigger', // Quick but recovers fast
  'energetic', // High energy
  'lowStamina', // Tires quickly
  'painTolerant', // Handles roughness well
  'sensitive', // Low pain threshold
];
```

### Dual Cultivation Rewards

```typescript
// Partner level (basic intimacy)
success: [
  {
    kind: 'qi',
    amount: 'maxqi * 0.3', // 30% max qi
  },
  {
    kind: 'approval',
    character: 'Companion',
    amount: '1',
  },
];

// Dao Partner level (perfect unity)
success: [
  {
    kind: 'qi',
    amount: 'maxqi * 0.5', // 50% max qi
  },
  {
    kind: 'approval',
    character: 'Companion',
    amount: '2',
  },
  {
    kind: 'buff',
    buff: 'Harmonized Cultivation',
    duration: 7, // Week-long buff
  },
];
```

## Progression Events

Special events that advance the relationship to the next tier.

### Event Requirements

```typescript
requirement: {
  condition: 'realm >= qiCondensation && quest_complete == 1', // Block advancement until the player reaches Qi Condensation and completes a specific character sidequest
  tooltip: 'Reach Qi Condensation and complete the quest'
}
```

### Location Override

Force events to occur at specific locations:

```typescript
locationOverride: 'Nine Mountain Sect'; // Must be at sect
```

### Progression Event Example

```typescript
progressionEvent: {
  name: 'Heart to Heart',
  tooltip: 'Have an important conversation',
  requirement: {
    condition: 'realm >= meridianOpening',
    tooltip: 'Reach Meridian Opening realm'
  },
  locationOverride: 'Starlit Peak',
  event: [
    {
      kind: 'text',
      text: 'You meet at the peak under the stars...'
    },
    {
      kind: 'speech',
      character: 'Companion',
      text: 'There\'s something I need to tell you...'
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'I feel the same way',
          children: [
            {
              kind: 'speech',
              character: 'Companion',
              text: 'Really? You do?'
            },
            {
              kind: 'progressRelationship',
              character: 'Companion'
            }
          ]
        },
        {
          text: 'We should remain friends',
          children: [
            {
              kind: 'speech',
              character: 'Companion',
              text: 'I... I understand.'
            },
            {
              kind: 'approval',
              character: 'Companion',
              amount: '-2'
            }
          ]
        }
      ]
    }
  ]
}
```

## Implementation Best Practices

### Approval Pacing

Balance approval gains to create meaningful progression:

- **Small gains (1-2)**: Regular interactions, sparring
- **Medium gains (3-5)**: Gifts, quest completion
- **Large gains (6-10)**: Major story events, breakthrough aid

### Relationship Gates

Use requirements to pace relationship progression:

```typescript
// Early relationship - no requirements
requirement: undefined

// Mid relationship - realm gate
requirement: {
  condition: 'realm >= meridianOpening',
  tooltip: 'Reach Meridian Opening'
}

// Late relationship - story gate
requirement: {
  condition: 'realm >= qiCondensation && main_quest_complete == 1',
  tooltip: 'Complete the main questline'
}
```

### Narrative Consistency

Maintain character voice across relationship tiers:

```typescript
// Acquaintance - Formal
text: 'It is good to meet a fellow disciple.';

// Friend - Casual
text: 'Hey! Good to see you again!';

// Close Friend - Warm
text: 'I was just thinking about you!';

// Partner - Intimate
text: "My love, you've returned to me.";

// Dao Partner - Transcendent
text: 'Our souls sing in harmony once more.';
```

### Visual Feedback

The game automatically handles visual indicators:

- Character portrait border color changes
- Relationship status in character menu
- Heart icons at intimate levels
- Approval bar showing progress to next tier

## Complete Relationship Example

```typescript
const companionRelationships: CharacterRelationshipDefinition[] = [
  {
    requiredApproval: 0,
    relationshipCategory: 'Neutral',
    name: 'Stranger',
    tooltip: "A fellow cultivator you've recently encountered.",
    progressionEvent: {
      name: 'Breaking the Ice',
      tooltip: 'Have your first real conversation',
      event: [
        /* introduction dialogue */
      ],
    },
  },
  {
    requiredApproval: 5,
    relationshipCategory: 'Friendly',
    name: 'Friend',
    tooltip: 'A dependable ally in your cultivation journey.',
    followCharacter: {
      formParty: [
        /* party formation */
      ],
      duration: 3,
      buff: {
        /* combat bonuses */
      },
      cooldown: 5,
      dissolveParty: [
        /* party end */
      ],
    },
    progressionEvent: {
      name: 'Shared Secrets',
      tooltip: 'Learn about their past',
      requirement: {
        condition: 'realm >= meridianOpening',
        tooltip: 'Reach Meridian Opening',
      },
      event: [
        /* backstory reveal */
      ],
    },
  },
  {
    requiredApproval: 15,
    relationshipCategory: 'Intimate',
    name: 'Lover',
    tooltip: 'Your hearts are intertwined.',
    followCharacter: {
      duration: 7,
      buff: {
        /* enhanced bonuses */
      },
      cooldown: 1,
    },
    dualCultivation: {
      condition: '1',
      traits: [lovesPassionate, sensitive],
      intro: [
        /* initiation */
      ],
      success: [
        /* qi gains and bonuses */
      ],
      failure: [
        /* minor setback */
      ],
    },
    progressionEvent: {
      name: 'Eternal Vow',
      tooltip: 'Make your bond permanent',
      requirement: {
        condition: 'realm >= coreFormation',
        tooltip: 'Both reach Core Formation',
      },
      locationOverride: 'Sacred Grove',
      event: [
        /* dao partner ceremony */
      ],
    },
  },
];

// Attach to character
const myCompanion: Character = {
  name: 'Companion Name',
  relationship: companionRelationships,
  // ...other properties
};
```
