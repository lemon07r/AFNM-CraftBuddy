---
layout: default
title: Companions
parent: Character System
nav_order: 3
---

# Companions

Companions are the most complex character type, featuring deep relationship systems, realm progression, party mechanics, and intimate interactions including dual cultivation.

## Companion Definition

```typescript
interface CompanionCharacterDefinition extends BaseCharacterDefinition {
  kind: 'companion';

  // Interactions (all optional)
  breakthroughInteraction?: TalkCharacterInteraction;
  talkInteraction?: TalkCharacterInteraction[];
  shopInteraction?: ShopCharacterInteraction[];
  sparInteraction?: SparCharacterInteraction[];
  giftInteraction?: GiftCharacterInteraction[];
  craftingInteraction?: CraftingCharacterInteraction[];
  challengeInteraction?: ChallengeCharacterInteraction[];
  patrolInteraction?: PatrolCharacterInteraction[];
  aidBreakthroughInteraction?: AidBreakthroughCharacterInteraction[];

  mount?: MountItem; // Mount for faster travel
}
```

## Relationship System

Companions have a full relationship progression system defined at the character level:

```typescript
interface Character {
  // ...other properties
  relationship?: CharacterRelationshipDefinition[];
}
```

### Relationship Tiers

```typescript
interface CharacterRelationshipDefinition {
  requiredApproval: number; // Points needed
  relationshipCategory: 'Hostile' | 'Neutral' | 'Friendly' | 'Intimate';
  name: string; // Tier name (e.g., "Close Friends")
  tooltip: string; // Description

  followCharacter?: FollowCharacterDefinition; // Party mechanics
  dualCultivation?: DualCultivationDefinition; // Intimate only

  progressionEvent: {
    // Event to advance relationship
    name: string;
    tooltip: string;
    event: EventStep[];
    locationOverride?: string; // Specific location
    requirement?: {
      condition: string;
      tooltip: string;
    };
  };
}
```

## Realm Progression

Companions advance through cultivation realms alongside the player. Create multiple definitions for different realm stages:

```typescript
const companion: Character = {
  name: 'Li Wei',
  // ...other properties

  definitions: [
    // Body Forging definitions
    bodyForgingEarlyDef,
    bodyForgingMidDef,
    bodyForgingLateDef,

    // Meridian Opening definitions
    meridianOpeningEarlyDef,
    meridianOpeningMidDef,
    meridianOpeningLateDef,

    // Qi Condensation definitions
    qiCondensationEarlyDef,
    qiCondensationMidDef,
    qiCondensationLateDef,

    // Continue for higher realms...
  ],

  relationship: [
    acquaintanceRelationship,
    friendRelationship,
    closeFriendRelationship,
    swornSiblingRelationship,
    partnerRelationship,
    daoPartnerRelationship,
  ],
};
```

### Realm Definition Example

```typescript
const qiCondensationMidDef: CompanionCharacterDefinition = {
  kind: 'companion',
  condition: 'companion_realm == 3 && companion_progress == 2',
  realm: 'qiCondensation',
  realmProgress: 'Middle',

  stats: [
    {
      condition: '1',
      stats: {
        difficulty: 'mediumhard',
        battleLength: 'long',
        stances: [
          /* techniques appropriate for realm */
        ],
        talismans: [{ name: 'Protection Talisman III' }],
        artefacts: [{ name: 'Companion Sword' }],
        drops: [], // Companions typically don't drop items
        affinities: {
          celestial: 70,
          weapon: 50,
        },
      },
    },
  ],

  // Wander between realm-appropriate locations
  locations: [
    {
      kind: 'wander',
      condition: '1',
      route: [
        { location: 'Nine Mountain Sect', duration: { min: 2, max: 4 } },
        { location: 'Mausoleum Gate', duration: { min: 1, max: 2 } },
        { location: 'Shen Henda City', duration: { min: 1, max: 2 } },
      ],
    },
  ],

  // Mount for this realm
  mount: transportSwordMap.qiCondensation,

  // Interactions available at this realm
  talkInteraction: [mainDialogue, questDialogue],
  shopInteraction: [companionShop],
  sparInteraction: [friendlySpar],
  giftInteraction: realmAppropriateGifts,
  challengeInteraction: [seriousCombat],
  patrolInteraction: [jointExploration],
  aidBreakthroughInteraction: [helpBreakthrough],

  encounters: [requestEncounter, emergencyEncounter, casualEncounter],
};
```

## Companion-Specific Interactions

### Gift Interactions

Accept gifts to increase approval:

```typescript
const giftInteraction: GiftCharacterInteraction = {
  condition: '1',
  key: 'gift_jade_pendant', // Unique ID for tracking
  introSteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'You have something for me?',
    },
  ],
  item: 'Pure Jade Pendant',
  amount: 1,
  alternates: [
    // Alternative acceptable gifts
    { name: 'Refined Jade', stacks: 5 },
    { name: 'Spirit Crystal', stacks: 3 },
  ],
  acceptSteps: [
    {
      kind: 'approval',
      character: 'Li Wei',
      amount: '3',
    },
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'This is beautiful! Thank you so much!',
    },
  ],
  declineSteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'I appreciate the thought, but I cannot accept this.',
    },
  ],
};
```

### Challenge Interactions

Serious combat with consequences:

```typescript
const challengeInteraction: ChallengeCharacterInteraction = {
  condition: 'relationship >= 2', // Must be friends
  introSteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'I need to test my true strength. Fight me seriously!',
    },
  ],
  victorySteps: [
    {
      kind: 'approval',
      character: 'Li Wei',
      amount: '2',
    },
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'Your strength is incredible! I have much to learn.',
    },
  ],
  defeatSteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'My training has paid off! But you fought well.',
    },
  ],
};
```

### Patrol Interactions

Joint exploration missions:

```typescript
const patrolInteraction: PatrolCharacterInteraction = {
  condition: 'relationship >= 3',
  introSteps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: "Let's patrol the area together.",
    },
  ],
  preRepVictorySteps: [
    {
      kind: 'text',
      text: 'You encounter spirit beasts during patrol.',
    },
  ],
  postRepVictorySteps: [
    {
      kind: 'reputation',
      amount: '5',
      name: 'Nine Mountain Sect',
      max: 'exalted',
    },
    {
      kind: 'approval',
      character: 'Li Wei',
      amount: '1',
    },
  ],
  defeatSteps: [
    {
      kind: 'text',
      text: 'The patrol ends in defeat.',
    },
  ],
};
```

### Aid Breakthrough

Help companion advance realms:

```typescript
const aidBreakthroughInteraction: AidBreakthroughCharacterInteraction = {
  condition: 'companion_ready_breakthrough == 1',
  steps: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: "I'm ready to breakthrough. Will you help me?",
    },
    {
      kind: 'choice',
      choices: [
        {
          text: 'Of course!',
          children: [
            {
              kind: 'text',
              text: 'You channel your qi to support their breakthrough...',
            },
            {
              kind: 'qi',
              amount: '-500',
            },
            {
              kind: 'approval',
              character: 'Li Wei',
              amount: '5',
            },
            {
              kind: 'flag',
              flag: 'li_wei_realm',
              value: 'li_wei_realm + 1',
              global: true,
            },
          ],
        },
        {
          text: 'Not right now',
          children: [],
        },
      ],
    },
  ],
};
```

## Party System

Companions can join the player's party at certain relationship levels:

```typescript
const followDefinition: FollowCharacterDefinition = {
  formParty: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: "Let's travel together!",
    },
  ],
  duration: 3, // Days in party
  buff: {
    canStack: false,
    stats: {
      defense: { value: 2.0, stat: 'power' },
      barrierMitigation: { value: 5, stat: undefined },
    },
    onTechniqueEffects: [
      {
        kind: 'damage',
        amount: { value: 0.15, stat: 'power' },
      },
    ],
    onRoundEffects: [],
    stacks: 1,
  },
  cooldown: 5, // Days before can party again
  dissolveParty: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'I need to handle some personal matters.',
    },
  ],
};
```

## Dual Cultivation

Available at intimate relationship levels:

```typescript
const dualCultivation: DualCultivationDefinition = {
  condition: 'relationship >= 5',
  traits: ['passionate', 'gentle'], // Required traits for success
  intro: [
    {
      kind: 'speech',
      character: 'Li Wei',
      text: 'Shall we cultivate together?',
    },
  ],
  success: [
    {
      kind: 'qi',
      amount: 'maxqi * 0.3',
    },
    {
      kind: 'approval',
      character: 'Li Wei',
      amount: '2',
    },
    {
      kind: 'text',
      text: 'Your qi harmonizes perfectly...',
    },
  ],
  failure: [
    {
      kind: 'text',
      text: 'Your qi conflicts, preventing proper circulation.',
    },
  ],
};
```

## Complete Companion Example

```typescript
const fullCompanion: Character = {
  name: 'Mei Ling',
  displayName: 'Senior Sister Mei',
  allegiance: 'Nine Mountains',
  bio: 'A talented cultivator with a passion for alchemy...',

  condition: 'tutorial_complete == 1',

  portrait: 'mei_ling_portrait.png',
  image: 'mei_ling.png',
  imageScale: 1.1,

  // Multiple realm definitions
  definitions: [
    // Body Forging - Early
    {
      kind: 'companion',
      condition: 'mei_realm == 1 && mei_progress == 1',
      realm: 'bodyForging',
      realmProgress: 'Early',

      stats: [
        {
          condition: '1',
          stats: {
            difficulty: 'easy',
            battleLength: 'medium',
            stances: [
              /* basic techniques */
            ],
            drops: [],
            affinities: { blossom: 40 },
          },
        },
      ],

      locations: [
        {
          kind: 'static',
          condition: '1',
          location: 'Liang Tiao Village',
        },
      ],

      talkInteraction: [
        {
          condition: '1',
          event: [
            {
              kind: 'speech',
              character: 'Mei Ling',
              text: "We're both just starting our journey.",
            },
          ],
        },
      ],

      sparInteraction: [
        {
          condition: '1',
          cooldown: 7,
          introSteps: [
            /*...*/
          ],
          victorySteps: [
            /*...*/
          ],
          defeatSteps: [
            /*...*/
          ],
        },
      ],

      encounters: [],
    },
    // ...more realm definitions
  ],

  // Relationship progression
  relationship: [
    {
      requiredApproval: 0,
      relationshipCategory: 'Neutral',
      name: 'Acquaintance',
      tooltip: "A fellow disciple you've recently met.",

      progressionEvent: {
        name: 'Getting to Know You',
        tooltip: 'Spend time with Mei Ling',
        event: [
          // Dialogue about her background
        ],
      },
    },

    {
      requiredApproval: 6,
      relationshipCategory: 'Friendly',
      name: 'Friend',
      tooltip: 'A trusted friend and ally.',

      followCharacter: {
        formParty: [
          /*...*/
        ],
        duration: 2,
        buff: {
          /* combat bonuses */
        },
        cooldown: 5,
        dissolveParty: [
          /*...*/
        ],
      },

      progressionEvent: {
        name: 'Shared Secrets',
        tooltip: 'Mei Ling wants to share something important',
        event: [
          // Deep conversation about past
        ],
      },
    },

    {
      requiredApproval: 8,
      relationshipCategory: 'Friendly',
      name: 'Close Friend',
      tooltip: 'Your bond grows stronger.',

      followCharacter: {
        // Improved party benefits
        duration: 4,
        buff: {
          /* better bonuses */
        },
        cooldown: 3,
      },

      progressionEvent: {
        name: 'A Moment of Truth',
        tooltip: 'Something important is happening',
        requirement: {
          condition: 'realm >= qiCondensation',
          tooltip: 'Reach Qi Condensation realm',
        },
        event: [
          // Emotional moment, perhaps confession
        ],
      },
    },

    {
      requiredApproval: 8,
      relationshipCategory: 'Intimate',
      name: 'Partner',
      tooltip: 'Your hearts are as one.',

      followCharacter: {
        duration: 7,
        buff: {
          /* significant bonuses */
        },
        cooldown: 1,
      },

      dualCultivation: {
        condition: '1',
        traits: ['gentle', 'passionate'],
        intro: [
          /*...*/
        ],
        success: [
          {
            kind: 'qi',
            amount: 'maxqi * 0.25',
          },
        ],
        failure: [
          /*...*/
        ],
      },

      progressionEvent: {
        name: 'Dao Ceremony',
        tooltip: 'Become Dao Partners',
        event: [
          // Ceremony to become dao partners
        ],
      },
    },

    {
      requiredApproval: 8,
      relationshipCategory: 'Intimate',
      name: 'Dao Partner',
      tooltip: 'Bound for eternity.',

      followCharacter: {
        duration: 10,
        buff: {
          /* maximum bonuses */
        },
        cooldown: 0, // No cooldown
      },

      dualCultivation: {
        condition: '1',
        traits: ['gentle', 'passionate', 'synchronized'],
        intro: [
          /*...*/
        ],
        success: [
          {
            kind: 'qi',
            amount: 'maxqi * 0.4',
          },
          {
            kind: 'approval',
            character: 'Mei Ling',
            amount: '1',
          },
        ],
        failure: [
          /*...*/
        ],
      },

      progressionEvent: {
        name: '',
        tooltip: '',
        event: [], // Max relationship
      },
    },
  ],
};

// Register the companion
window.modAPI.actions.addCharacter(fullCompanion);
```

## File Structure & Management

Companions are complex entities with many files. The codebase uses a structured approach to manage this complexity. Here's the recommended organization:

### Directory Structure

```
src/data/characters/yourCompanion/
├── companionName.ts              # Main character definition
├── companionNameFlags.ts         # All flags and progression logic
├── companionNameCraftingActions.ts  # Custom crafting actions (if applicable)
├── definitions/                  # Realm-based definitions
│   ├── companionNameNewGameDef.ts
│   ├── companionName1EarlyDef.ts
│   ├── companionName1MidDef.ts
│   ├── companionName1LateDef.ts
│   ├── companionName2EarlyDef.ts
│   └── ... (continue for all realms)
├── interactions/                 # All interaction types
│   ├── gifts1.ts                # Realm-specific gifts
│   ├── gifts2.ts
│   ├── interaction1Early.ts     # Talk interactions by realm
│   ├── interaction2Breakthrough.ts
│   ├── sparInteraction.ts       # Shared interactions
│   ├── companionNameShop.ts     # Shop definitions
│   ├── craftingInteraction.ts   # Crafting services
│   └── questInteractions.ts     # Quest-specific talks
├── relationship/                 # Relationship progression
│   ├── acquaintance.ts
│   ├── friend.ts
│   ├── closeFriend.ts
│   ├── partner.ts
│   ├── daoPartner.ts
│   └── dualCultivationTraits.ts
└── utils/                       # Reusable helper functions
    ├── createGiftInteraction.ts
    ├── createEncounters.ts
    ├── createAidBreakthrough.ts
    └── sharedFunctions.ts
```

### Flag Management System

The `companionNameFlags.ts` file centralizes all companion progression:

```typescript
// Character name constant
export const companionName = 'Your Companion';

// Unlock flags
export const companionUnlocked = 'companionUnlocked';
export const companionShopUnlocked = 'companionShopUnlocked';

// Aid tracking (affects progression speed)
export const companionAidFlag = 'companionAid';

// Complex progression formula
const advancement = `(month + ${companionAidFlag} + (realm*12+realmProgress*3))`;

// Realm progression thresholds (in months)
const yearToMonth = (year: number) => Math.floor(year * 12);

export const companion1MidMonth = `${yearToMonth(4)}`;
export const companion1LateMonth = `${yearToMonth(6)}`;
export const companion2EarlyMonth = `${yearToMonth(8)}`;
export const companion2MidMonth = `${yearToMonth(10)}`;
export const companion2LateMonth = `${yearToMonth(12)}`;
export const companion3EarlyMonth = `${yearToMonth(17)}`;
export const companion3MidMonth = `${yearToMonth(24)}`;
export const companion3LateMonth = `${yearToMonth(28)}`;
export const companion4EarlyMonth = `${yearToMonth(34)}`;
export const companion4MidMonth = `${yearToMonth(38)}`;
export const companion4LateMonth = `${yearToMonth(42)}`;
export const companion5EarlyMonth = `${yearToMonth(105)}`;
export const companion5MidMonth = `${yearToMonth(115)}`;
export const companion5LateMonth = `${yearToMonth(125)}`;
// Continue for all progression points...

// Condition strings for each definition
export const companion1Mid = `${advancement} > ${companion1MidMonth}`;
export const companion1Late = `${advancement} > ${companion1LateMonth}`;
export const companion2Early = `${advancement} > ${companion2EarlyMonth}`;
// Continue for all conditions...

// Quest and interaction flags
export const questOneGiven = 'companionQuestOneGiven';
export const questOneComplete = 'companionQuestOneComplete';
export const craftingBonus1 = 'companionCraftingBonus1';
export const craftingBonus2 = 'companionCraftingBonus2';
```

### Definition Pattern

Each realm definition follows a consistent pattern:

```typescript
// File: definitions/companion3MidDef.ts
export const companion3MidDef: CompanionCharacterDefinition = {
  kind: 'companion',
  condition: companion3Mid, // From flags file
  realm: 'qiCondensation',
  realmProgress: 'Middle',

  // Stats, locations, interactions imported from other files
  stats: [companionStats3Mid],
  locations: [wanderRoute3],
  talkInteraction: [interaction3Mid, questInteraction],
  shopInteraction: [companionShopIII],
  sparInteraction: [sparInteraction],
  giftInteraction: gifts3, // Realm-appropriate gifts
  encounters: [
    // Generated encounters using utility functions
    ...createStandardEncounters('qiCondensation'),
    ...createCraftingEncounters(qiCondensationRecipes),
  ],
};
```

### Utility Functions

Create reusable functions for common patterns:

```typescript
// utils/createGiftInteraction.ts
export const createGiftInteraction = (
  item: string,
  amount: number,
  aidBoost: number,
  craftingBonus?: number,
  craftingFlag?: string,
  alternates?: ItemDesc[],
): GiftCharacterInteraction => ({
  condition: '1',
  key: `${item}_${amount}`,
  item,
  amount,
  alternates,
  introSteps: [
    {
      kind: 'speech',
      character: companionName,
      text: `"Oh, ${amount > 1 ? 'some' : 'a'} ${item}? I've been looking for those!"`,
    },
  ],
  acceptSteps: [
    {
      kind: 'approval',
      character: companionName,
      amount: '1',
    },
    {
      kind: 'flag',
      flag: companionAidFlag,
      value: `${companionAidFlag} + ${aidBoost}`,
      global: true,
    },
    // Conditional crafting bonus
    ...(craftingBonus
      ? [
          {
            kind: 'flag',
            flag: craftingFlag!,
            value: `${craftingFlag} + ${craftingBonus}`,
            global: true,
          },
        ]
      : []),
    {
      kind: 'speech',
      character: companionName,
      text: 'Thank you so much! This will help my research greatly.',
    },
  ],
  declineSteps: [
    {
      kind: 'speech',
      character: companionName,
      text: 'Maybe another time then.',
    },
  ],
});

// utils/createStandardEncounters.ts
export const createStandardEncounters = (realm: Realm) => [
  {
    id: `${companionName.toLowerCase()}_casual_${realm}`,
    condition: '1',
    cooldown: { min: 10, max: 20 },
    event: [
      {
        kind: 'speech',
        character: companionName,
        text: getRandomCasualDialogue(realm),
      },
    ],
  },
  {
    id: `${companionName.toLowerCase()}_help_${realm}`,
    condition: 'relationship >= 2',
    cooldown: { min: 15, max: 30 },
    event: createHelpRequestEvent(realm),
  },
];
```

### Interaction Organization

Organize interactions by type and realm:

```typescript
// interactions/gifts3.ts (Qi Condensation gifts)
import { createGiftInteraction } from '../utils/createGiftInteraction';
import { companionCraftingBonus3 } from '../companionFlags';

export const gifts3: GiftCharacterInteraction[] = [
  createGiftInteraction('Spirit Core III', 1, 2, 1, companionCraftingBonus3),
  createGiftInteraction('Jade Essence', 5, 1),
  createGiftInteraction('Ancient Manual', 1, 3, 2, companionCraftingBonus3),
  // More gifts...
];

// interactions/companionShop.ts
export const companionShopI: ShopCharacterInteraction = {
  condition: `${companionShopUnlocked} == 1`,
  stock: {
    bodyForging: [
      ...companionCraftingActions
        .filter((action) => action.realm === 'bodyForging')
        .map((action) => ({ ...action, stacks: 1 })),
    ],
    // Other realms empty initially
  },
  costMultiplier: 0.8, // Friendly discount
  introSteps: [
    /*...*/
  ],
  exitSteps: [
    /*...*/
  ],
};
```

### Relationship Structure

Each relationship tier gets its own file:

```typescript
// relationship/closeFriend.ts
export const closeFriend: CharacterRelationshipDefinition = {
  requiredApproval: 15,
  relationshipCategory: 'Friendly',
  name: 'Close Friend',
  tooltip: 'A bond deeper than mere friendship.',

  followCharacter: {
    formParty: [
      {
        kind: 'speech',
        character: companionName,
        text: "Of course! We're stronger together.",
      },
    ],
    duration: 5,
    buff: closeFriendCombatBuff,
    cooldown: 3,
    dissolveParty: [
      /*...*/
    ],
  },

  progressionEvent: {
    name: 'Heart to Heart',
    tooltip: 'A meaningful conversation awaits',
    requirement: {
      condition: 'realm >= qiCondensation',
      tooltip: 'Reach Qi Condensation realm',
    },
    event: [
      // Import from separate event file if very long
      ...heartToHeartEvent,
    ],
  },
};
```

### Main Character Assembly

The main character file assembles everything:

```typescript
// companionName.ts
import { Character } from '../../../types/character';
import { companionName, companionUnlocked } from './companionFlags';

// Import all definitions
import { companionNewGameDef } from './definitions/companionNewGameDef';
import { companion1EarlyDef } from './definitions/companion1EarlyDef';
// ... all other definitions

// Import all relationships
import { acquaintance } from './relationship/acquaintance';
import { friend } from './relationship/friend';
// ... all relationships

export const companion: Character = {
  name: companionName,
  allegiance: 'Nine Mountains',
  bio: 'A detailed character background...',
  condition: companionUnlocked,

  portrait: 'companion_portrait.png',
  image: 'companion_full.png',

  definitions: [
    companionNewGameDef,
    companion1EarlyDef,
    companion1MidDef,
    // ... all definitions in order
  ],

  relationship: [acquaintance, friend, closeFriend, partner, daoPartner],
};
```

## Best Practices

1. **Consistent Naming**: Use clear, consistent naming patterns across all files
2. **Centralized Flags**: Keep all progression logic in the flags file
3. **Utility Functions**: Create reusable functions for common patterns
4. **File Organization**: Group related functionality in dedicated directories
5. **Import Order**: Maintain consistent import order (types, utils, data)
6. **Documentation**: Comment complex progression formulas and logic
7. **Realm Scaling**: Use utility functions to scale content across realms
8. **Testing Hooks**: Include debug utilities during development
9. **Modular Design**: Each file should have a single, clear responsibility
10. **Version Control**: Use meaningful commit messages when changing companion progression
