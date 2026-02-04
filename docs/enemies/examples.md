---
layout: default
title: Examples
parent: Enemies
nav_order: 7
---

# Enemy Implementation Examples

Complete, ready-to-use enemy implementations demonstrating various design patterns and complexity levels.

## Basic Beast Enemy

A simple wolf enemy for early game encounters:

```typescript
import { EnemyEntity } from '../types/entity';
import { Technique } from '../types/technique';
import { Buff } from '../types/buff';

import wolfImage from '../assets/monster/wolf.png';
import biteIcon from '../assets/techniques/bite.png';
import howlIcon from '../assets/techniques/howl.png';

// Materials for drops
import { wolfPelt, wolfFang } from '../items/materials';
import { minorBeastCore } from '../items/cores';

// Simple attack technique
const bite: Technique = {
  name: 'Bite',
  icon: biteIcon,
  type: 'none',
  effects: [
    {
      kind: 'damage',
      amount: {
        value: 0.9,
        stat: 'power'
      }
    }
  ]
};

// Buff self and intimidate
const howl: Technique = {
  name: 'Howl',
  icon: howlIcon,
  type: 'none',
  effects: [
    {
      kind: 'buffSelf',
      buff: {
        name: 'Enraged',
        icon: howlIcon,
        stats: {
          power: { value: 2, stat: 'power' }
        },
        duration: 3
      },
      amount: { value: 1, stat: undefined }
    }
  ]
};

export const wolf: EnemyEntity = {
  name: 'Gray Wolf',
  image: wolfImage,
  imageScale: 0.8,
  realm: 'qiCondensation',
  realmProgress: 'Early',
  difficulty: 'easy',
  battleLength: 'veryshort',
  spawnRoar: 'WolfHowl',

  stances: [
    {
      name: 'hunt',
      techniques: [howl, bite, bite, bite]
    }
  ],

  stanceRotation: [
    { kind: 'single', stance: 'hunt' }
  ],

  rotationOverrides: [],

  drops: [
    { item: wolfPelt, amount: 1, chance: 0.8 },
    { item: wolfFang, amount: 1, chance: 0.5 },
    { item: minorBeastCore, amount: 1, chance: 0.1 }
  ]
};
```

## Adaptive Cultivator Enemy

A human opponent that changes tactics based on player actions:

```typescript
import { EnemyEntity } from '../types/entity';
import cultivatorImage from '../assets/npc/rivalCultivator.png';

// Import techniques from game files
import { palmStrike } from '../techniques/fist/palmStrike';
import { ironBody } from '../techniques/fist/ironBody';
import { windStep } from '../techniques/movement/windStep';
import { qiBurst } from '../techniques/qi/qiBurst';

// Import items
import { healingPillII } from '../items/pills/healingPill';
import { minorSpiritStone } from '../items/currency';
import { cultivatorRobe } from '../items/equipment';

export const adaptiveCultivator: EnemyEntity = {
  name: 'Rival Cultivator',
  image: cultivatorImage,
  imageScale: 1.0,
  realm: 'meridianOpening',
  realmProgress: 'Middle',
  difficulty: 'medium',
  battleLength: 'medium',
  isCharacter: true,  // Human opponent

  stances: [
    {
      name: 'probing',
      techniques: [windStep, palmStrike, palmStrike, qiBurst]
    },
    {
      name: 'aggressive',
      techniques: [qiBurst, palmStrike, palmStrike, palmStrike, qiBurst]
    },
    {
      name: 'defensive',
      techniques: [ironBody, windStep, palmStrike, ironBody]
    }
  ],

  stanceRotation: [
    { kind: 'single', stance: 'probing' },
    {
      kind: 'random',
      stances: ['aggressive', 'defensive']
    }
  ],

  rotationOverrides: [
    {
      kind: 'single',
      stance: 'defensive',
      condition: 'hp < 0.3 * maxhp',
      repeatable: false
    }
  ],

  // Equipment
  talismans: [minorProtectionTalisman],
  artefacts: [],

  // Pill usage
  pills: [
    {
      condition: 'hp < 0.5 * maxhp',
      pill: healingPillII
    },
    {
      condition: 'hp < 0.25 * maxhp',
      pill: healingPillII
    }
  ],

  drops: [
    { item: minorSpiritStone, amount: 10, chance: 1.0 },
    { item: cultivatorRobe, amount: 1, chance: 0.3 },
    { item: palmStrikeTechnique, amount: 1, chance: 0.15 }
  ]
};
```

## Multi-Phase Boss

A complex boss with distinct combat phases:

```typescript
import { EnemyEntity } from '../types/entity';
import { Buff } from '../types/buff';
import bossImage from '../assets/monster/ancientGuardian.png';
import phase2Image from '../assets/monster/ancientGuardianAwakened.png';

// Phase 1 techniques
const stoneFist: Technique = {
  name: 'Stone Fist',
  icon: stoneFistIcon,
  type: 'earth',
  effects: [
    {
      kind: 'damage',
      amount: { value: 1.2, stat: 'power' }
    }
  ]
};

const earthquake: Technique = {
  name: 'Earthquake',
  icon: earthquakeIcon,
  type: 'earth',
  effects: [
    {
      kind: 'damage',
      amount: { value: 0.8, stat: 'power' }
    },
    {
      kind: 'buffTarget',
      buff: {
        name: 'Unbalanced',
        icon: unbalancedIcon,
        stats: {
          speed: { value: -3, stat: 'speed' }
        },
        duration: 2
      },
      amount: { value: 1, stat: undefined }
    }
  ]
};

// Phase 2 exclusive
const awakenedForm: Buff = {
  name: 'Awakened Guardian',
  icon: awakenedIcon,
  canStack: false,
  stats: {
    power: { value: 10, stat: 'power' },
    defense: { value: 15, stat: 'defense' },
    speed: { value: 5, stat: 'speed' }
  },
  combatImage: {
    image: phase2Image,
    position: 'replace'  // Replace main sprite
  }
};

const ancientWrath: Technique = {
  name: 'Ancient Wrath',
  icon: wrathIcon,
  type: 'earth',
  effects: [
    {
      kind: 'damage',
      amount: { value: 2.0, stat: 'power' }
    }
  ]
};

export const ancientGuardian: EnemyEntity = {
  name: 'Ancient Stone Guardian',
  image: bossImage,
  imageScale: 2.5,
  realm: 'coreFormation',
  realmProgress: 'Late',
  difficulty: 'hard',
  battleLength: 'verylong',
  spawnRoar: 'AncientRoar',

  stances: [
    // Phase 1 stances
    {
      name: 'phase1_defensive',
      techniques: [stoneFist, stoneFist, earthquake]
    },
    {
      name: 'phase1_offensive',
      techniques: [earthquake, stoneFist, stoneFist, stoneFist]
    },
    // Transition
    {
      name: 'awakening',
      techniques: [{
        name: 'Awaken',
        icon: awakenIcon,
        type: 'none',
        effects: [
          {
            kind: 'buffSelf',
            buff: awakenedForm,
            amount: { value: 1, stat: undefined }
          },
          {
            kind: 'heal',
            amount: { value: 0.3, stat: 'maxhp' }
          }
        ]
      }]
    },
    // Phase 2 stances
    {
      name: 'phase2_rampage',
      techniques: [ancientWrath, stoneFist, stoneFist, earthquake, ancientWrath]
    },
    {
      name: 'phase2_fortress',
      techniques: [earthquake, earthquake, stoneFist, ancientWrath]
    }
  ],

  stanceRotation: [],

  rotationOverrides: [
    // Phase 1 (100% - 51% HP)
    {
      kind: 'random',
      stances: ['phase1_defensive', 'phase1_offensive'],
      condition: 'hp > 0.5 * maxhp',
      repeatable: true
    },
    // Transition at 50% HP
    {
      kind: 'single',
      stance: 'awakening',
      condition: 'hp <= 0.5 * maxhp && Awakened_Guardian == 0',
      repeatable: false
    },
    // Phase 2 (50% - 0% HP)
    {
      kind: 'random',
      stances: ['phase2_rampage', 'phase2_fortress'],
      condition: 'Awakened_Guardian > 0',
      repeatable: true
    }
  ],

  drops: [
    // Guaranteed drops
    { item: guardianCore, amount: 1, chance: 1.0 },
    { item: ancientStone, amount: 3, chance: 1.0 },
    // Rare drops
    { item: guardianArmor, amount: 1, chance: 0.3 },
    { item: earthquakeTechnique, amount: 1, chance: 0.2 },
    // Ultra rare
    { item: guardianHeart, amount: 1, chance: 0.05 }
  ],

  shardMult: 3,
  qiMult: 5
};
```

## Swarm Enemy

Multiple weak enemies that spawn together:

```typescript
import { EnemyEntity } from '../types/entity';
import swarmImage from '../assets/monster/voidMite.png';

const swarmBite: Technique = {
  name: 'Swarm Bite',
  icon: swarmIcon,
  type: 'none',
  effects: [
    {
      kind: 'damage',
      amount: { value: 0.3, stat: 'power' }
    },
    {
      kind: 'buffSelf',
      buff: {
        name: 'Feeding Frenzy',
        icon: frenzyIcon,
        canStack: true,
        stats: {
          power: { value: 0.1, stat: 'power', scaling: 'stacks' }
        },
        stacks: 1
      },
      amount: { value: 1, stat: undefined }
    }
  ]
};

export const voidMiteSwarm: EnemyEntity = {
  name: 'Void Mite',
  image: swarmImage,
  imageScale: 0.4,  // Very small
  realm: 'meridianOpening',
  realmProgress: 'Early',
  difficulty: 'easy',
  battleLength: 'short',

  stances: [
    {
      name: 'swarm',
      techniques: [swarmBite, swarmBite, swarmBite]
    }
  ],

  stanceRotation: [
    { kind: 'single', stance: 'swarm' }
  ],

  rotationOverrides: [],

  // Low individual rewards
  drops: [
    { item: voidEssence, amount: 1, chance: 0.3 }
  ],

  // Low multipliers for mass spawning
  qiMult: 0.2,
  shardMult: 0,

  // Reduced stats for group encounters
  statMultipliers: {
    hp: 0.3,
    power: 0.7
  }
};
```

## Corrupted Enemy

An enemy that grows stronger as the fight progresses:

```typescript
import { EnemyEntity } from '../types/entity';
import corruptedImage from '../assets/monster/corruptedMonk.png';

const corruption: Buff = {
  name: 'Corruption',
  icon: corruptionIcon,
  canStack: true,
  maxStacks: 10,
  stats: {
    power: { value: 0.15, stat: 'power', scaling: 'stacks' },
    defense: { value: 1, stat: 'defense', scaling: 'stacks' }
  },
  onRoundEffects: [
    {
      kind: 'buffSelf',
      buff: 'Corruption',  // Self-stacking
      amount: { value: 1, stat: undefined }
    }
  ],
  stacks: 1
};

const darkPulse: Technique = {
  name: 'Dark Pulse',
  icon: darkPulseIcon,
  type: 'dark',
  effects: [
    {
      kind: 'damage',
      amount: {
        value: 0.8,
        stat: 'power'
      }
    },
    {
      kind: 'damage',  // Bonus damage per corruption
      amount: {
        value: 0.1,
        stat: 'power',
        scaling: 'Corruption'
      }
    }
  ]
};

export const corruptedMonk: EnemyEntity = {
  name: 'Corrupted Monk',
  image: corruptedImage,
  imageScale: 1.2,
  realm: 'coreFormation',
  realmProgress: 'Middle',
  difficulty: 'mediumhard',
  battleLength: 'long',

  stances: [
    {
      name: 'corrupting',
      techniques: [
        {
          name: 'Embrace Corruption',
          icon: corruptionIcon,
          type: 'dark',
          effects: [
            {
              kind: 'buffSelf',
              buff: corruption,
              amount: { value: 2, stat: undefined }
            }
          ]
        },
        darkPulse,
        darkPulse
      ]
    },
    {
      name: 'corrupted_assault',
      techniques: [darkPulse, darkPulse, darkPulse, darkPulse]
    }
  ],

  stanceRotation: [
    { kind: 'single', stance: 'corrupting' },
    { kind: 'single', stance: 'corrupted_assault' }
  ],

  rotationOverrides: [
    {
      kind: 'single',
      stance: 'corrupted_assault',
      condition: 'Corruption >= 5',
      repeatable: true
    }
  ],

  // Start with some corruption
  spawnCondition: {
    hpMult: 1,
    buffs: [{ ...corruption, stacks: 2 }]
  },

  drops: [
    { item: corruptedEssence, amount: 2, chance: 0.8 },
    { item: darkTechnique, amount: 1, chance: 0.2 },
    { item: purificationPill, amount: 1, chance: 0.5 }
  ]
};
```

## Tournament Champion

A fully equipped cultivator with complex tactics:

```typescript
import { EnemyEntity } from '../types/entity';
import championImage from '../assets/npc/tournamentChampion.png';

// Import full loadout
import { championBlade } from '../items/weapons';
import { championRobe } from '../items/armor';
import { speedTalisman, powerTalisman } from '../items/talismans';
import { combatPillSet } from '../items/pills';

export const tournamentChampion: EnemyEntity = {
  name: 'Weapon Master Chen',
  image: championImage,
  imageScale: 1.0,
  realm: 'pillarCreation',
  realmProgress: 'Peak',
  difficulty: 'veryhard',
  battleLength: 'verylong',
  isCharacter: true,

  stances: [
    {
      name: 'opening_gambit',
      techniques: [
        igniteFurnace,      // Buff setup
        prepareMetal,       // Resource generation
        forgeFleetingShield // Defense
      ]
    },
    {
      name: 'summon_army',
      techniques: [
        forgeUnstableAutomaton,
        forgeDancingSword,
        forgeDancingDagger,
        forgeFleetingShield
      ]
    },
    {
      name: 'all_out_assault',
      techniques: [
        endlessShattering,
        fracturingHammer,
        spinGrinder,
        endlessShattering
      ]
    },
    {
      name: 'tactical_recovery',
      techniques: [
        forgeFleetingShield,
        replicateMaterials,
        prepareMetal,
        forgeFleetingShield
      ]
    }
  ],

  stanceRotation: [
    { kind: 'single', stance: 'opening_gambit' },
    { kind: 'single', stance: 'summon_army' },
    {
      kind: 'random',
      stances: ['all_out_assault', 'tactical_recovery']
    }
  ],

  rotationOverrides: [
    {
      kind: 'single',
      stance: 'tactical_recovery',
      condition: 'hp < 0.3 * maxhp',
      repeatable: false
    }
  ],

  // Full equipment loadout
  artefacts: [championBlade, championRobe],
  talismans: [speedTalisman, powerTalisman],

  // Strategic pill usage
  pills: [
    {
      condition: 'round == 1',
      pill: strengthPill
    },
    {
      condition: 'hp < 0.7 * maxhp',
      pill: healingPillPlus
    },
    {
      condition: 'hp < 0.4 * maxhp',
      pill: healingPillPlus
    },
    {
      condition: 'hp < 0.2 * maxhp',
      pill: lastStandPill
    }
  ],

  // Tournament rewards (no death drops)
  drops: [],
  qiMult: 0,  // No qi from tournament
  shardMult: 0  // No shards from tournament
};
```

## Unique Mechanic Enemy

An enemy with special combat mechanics:

```typescript
const mirrorImage: Buff = {
  name: 'Mirror Image',
  icon: mirrorIcon,
  canStack: true,
  maxStacks: 3,
  // Each stack is a copy that attacks
  onTechniqueEffects: [
    {
      kind: 'damage',
      amount: {
        value: 0.3,
        stat: 'power',
        scaling: 'stacks'
      }
    }
  ],
  combatImage: {
    image: mirrorImageSprite,
    position: 'arc',
    count: 'stacks'  // Visual copies
  }
};

export const illusionist: EnemyEntity = {
  name: 'Shadow Illusionist',
  image: illusionistImage,
  imageScale: 1.0,
  realm: 'coreFormation',
  realmProgress: 'Middle',
  difficulty: 'hard',
  battleLength: 'long',

  stances: [
    {
      name: 'create_illusions',
      techniques: [
        {
          name: 'Split Shadow',
          icon: splitIcon,
          effects: [
            {
              kind: 'buffSelf',
              buff: mirrorImage,
              amount: { value: 1, stat: undefined }
            }
          ]
        },
        shadowStrike,
        shadowStrike
      ]
    },
    {
      name: 'illusion_assault',
      techniques: [
        shadowStrike,  // Main + copies attack
        shadowStrike,
        shadowStrike,
        shadowStrike
      ]
    }
  ],

  stanceRotation: [
    { kind: 'single', stance: 'create_illusions' },
    {
      kind: 'single',
      stance: 'illusion_assault',
      condition: 'Mirror_Image >= 2'
    }
  ],

  drops: [
    { item: illusionTechnique, amount: 1, chance: 0.15 },
    { item: shadowEssence, amount: 2, chance: 0.7 }
  ]
};
```