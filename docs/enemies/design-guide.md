---
layout: default
title: Design Guide
parent: Enemies
nav_order: 2
---

# Enemy Design Guide

Standard patterns and techniques used in the game's enemy implementations.

## Core Buff Patterns

### Stack-Scaling Buffs

**When to use**: Create escalating threats that force players to act quickly.

**Why it works**: Each turn the enemy becomes stronger, creating urgency. Players must decide between offense (end the fight fast) or defense (survive the scaling).

```typescript
const strengthened: Buff = {
  name: 'Strengthened',
  icon: buffIcon,
  canStack: true,
  stats: {
    power: {
      value: 0.075,        // +7.5% power per stack
      stat: 'power',
      scaling: 'stacks'    // Scales with stack count
    }
  },
  stacks: 1
};
```

**Design tip**: Start with small values (5-10% per stack) to avoid exponential power spikes.

### On-Technique Effect Buffs

**When to use**: Create finite resources that provide immediate impact but deplete over time.

**Why it works**: Gives enemies burst phases where they're dangerous, followed by vulnerable periods. Creates natural combat rhythm.

```typescript
const soulmass: Buff = {
  name: 'Soulmass',
  icon: soulmassIcon,
  canStack: true,
  onTechniqueEffects: [
    {
      kind: 'damage',
      amount: { value: 0.75, stat: 'power' }  // Extra damage per technique
    },
    {
      kind: 'add',
      amount: { value: -1, stat: undefined }  // Consume 1 stack
    }
  ],
  stacks: 1
};
```

**Design tip**: Balance stack count vs. effect strength. More stacks = longer threat duration.

### Defensive Scaling Buffs

**When to use**: Punish players who drag out fights or create defensive phases.

**Why it works**: Forces players to find burst damage solutions rather than slow attrition. Makes long battles favor the enemy.

```typescript
const pressureAdaptation: Buff = {
  name: 'Pressure Adaptation',
  icon: adaptIcon,
  canStack: true,
  stats: {
    defense: {
      value: 0.5,          // +50% defense per stack
      stat: 'power',
      scaling: 'stacks'
    }
  },
  stacks: 1
};
```

**Design tip**: Use when you want to prevent stalling tactics or create time pressure.

## Standard Technique Types

### Multi-Effect Techniques

**When to use**: Create snowball effects where early advantage leads to greater advantage.

**Why it works**: Each successful attack makes the next one stronger. Rewards aggressive play and punishes defensive tactics.

```typescript
const drainingTouch: Technique = {
  name: 'Draining Touch',
  effects: [
    {
      kind: 'buffTarget',   // Debuff enemy
      buff: drainedBuff,
      amount: { value: 1, stat: undefined }
    },
    {
      kind: 'buffSelf',     // Buff self
      buff: strengthenedBuff,
      amount: { value: 1, stat: undefined }
    },
    {
      kind: 'damage',       // Deal damage
      amount: { value: 0.4, stat: 'power' }
    }
  ]
};
```

**Design tip**: Use lower base damage to compensate for the buff effects. Players should feel the enemy getting stronger over time.

### Scaling Damage Techniques

**When to use**: Create payoff techniques that reward buff accumulation.

**Why it works**: Gives purpose to setup phases. Players can see the threat building and must act before the enemy reaches critical mass.

```typescript
const rendingClaws: Technique = {
  name: 'Rending Claws',
  effects: [
    {
      kind: 'damage',
      amount: { value: 1.2, stat: 'power' }  // Base damage
    },
    {
      kind: 'damage',
      amount: {
        value: 0.1,
        stat: 'power',
        scaling: 'Strengthened'  // +10% power per Strengthened stack
      }
    }
  ]
};
```

**Design tip**: Make base damage reasonable but scaling dramatic. 10+ stacks should feel genuinely threatening.

### Mass Buff Application

**When to use**: Create setup techniques that enable burst phases.

**Why it works**: Allows enemies to transition between phases dramatically. Players get warning of incoming threat spikes.

```typescript
const voidSoulmass: Technique = {
  name: 'Void Soulmass',
  effects: [
    {
      kind: 'buffSelf',
      buff: soulmass,
      amount: { value: 12, stat: undefined }  // Apply 12 stacks at once
    },
    {
      kind: 'damage',
      amount: { value: 0.25, stat: 'power' }
    }
  ]
};
```

**Design tip**: Include minor damage so the technique isn't completely passive. Players should still feel immediate threat.

## Setup Round Patterns

### Single Setup Override

**When to use**: Give enemies consistent opening plays without making every turn identical.

**Why it works**: Players learn to expect the setup and can plan accordingly, but the enemy still gets their foundation established.

```typescript
rotationOverrides: [
  {
    kind: 'single',
    stance: 'setup',
    condition: '1'  // Always true initially
  }
],
stanceRotation: [
  { kind: 'single', stance: 'main_combat' }
]
```

**Design tip**: Setup should be meaningful but not overwhelming. Think buffs, summons, or resource generation.

### Multi-Setup Chain

**When to use**: Create complex enemies with multiple preparation phases.

**Why it works**: Builds tension as players watch the enemy prepare multiple layers of threat. Creates longer buildup to payoff.

```typescript
stances: [
  {
    name: 'summon_phase',
    techniques: [summonMinion, summonMinion, shield]
  },
  {
    name: 'buff_phase',
    techniques: [powerUp, defenseUp, speedUp]
  }
],
rotationOverrides: [
  {
    stance: 'summon_phase',
    condition: '1',
    repeatable: false
  },
  {
    stance: 'buff_phase',
    condition: '1',
    repeatable: false
  }
]
```

**Design tip**: Each setup phase should build on the previous. Minions → buffs → enhanced abilities, etc.

## Stance Rotation Patterns

### Fixed Cycle

**When to use**: Create predictable enemies that players can learn to counter.

**Why it works**: Players can anticipate what's coming and prepare responses. Creates puzzle-like gameplay where timing matters.

```typescript
stanceRotation: [
  { kind: 'single', stance: 'offensiveStance' },
  { kind: 'single', stance: 'defensiveStance' }
]
// Alternates: offensive → defensive → offensive → defensive...
```

**Design tip**: Make sure each stance has clear counterplay. If offense is dangerous, defense should have windows of vulnerability.

### Fixed Sequence

**When to use**: Create complex but learnable patterns that reward player knowledge.

**Why it works**: More sophisticated than simple alternation. Players feel smart when they master the sequence.

```typescript
stanceRotation: [
  { kind: 'single', stance: 'attack' },
  { kind: 'single', stance: 'block' },
  { kind: 'single', stance: 'steal' }
]
// Cycles: attack → block → steal → attack → block → steal...
```

**Design tip**: Each stance should feel meaningfully different. Avoid stances that are just "attack but slightly different".

### Random Selection

**When to use**: Create unpredictable enemies that require adaptive play.

**Why it works**: Players can't rely on memorized patterns. Must stay alert and react to current situation.

```typescript
stanceRotation: [
  {
    kind: 'random',
    stances: ['attack1', 'attack2', 'attack3']
  }
]
```

**Design tip**: All random stances should be roughly equal in power level. No "clearly best" or "clearly worst" options.

## Equipment Integration Patterns

### Tournament Fighter Pattern

Full equipment loadout with pills:

```typescript
{
  artefacts: [weaponArtefact],
  talismans: [powerTalisman],
  pills: [
    {
      condition: 'hp < 0.5 * maxhp',
      pill: healingPill
    },
    {
      condition: 'hp < 0.5 * maxhp',
      pill: healingPill  // Can use same pill multiple times
    }
  ]
}
```

### Basic Equipment

Simple equipment for non-tournament enemies:

```typescript
{
  talismans: [shieldTalisman],
  artefacts: [basicWeapon],
  pillsPerRound: 1  // Limit pill usage
}
```

## Real Combat Patterns

### The Drain & Gain (Soul Hoarder)

**Purpose**: Create accelerating threat through mutual scaling.

**Why it works**: Double pressure - player gets weaker while enemy gets stronger. Forces decisive action rather than defensive play.

```typescript
// Technique that weakens enemy and strengthens self
const drainingTouch: Technique = {
  effects: [
    { kind: 'buffTarget', buff: drainedDebuff },    // -2% power per stack
    { kind: 'buffSelf', buff: strengthenedBuff },   // +7.5% power per stack
    { kind: 'damage', amount: { value: 0.4, stat: 'power' } }
  ]
};

// Simple repeating stance
stances: [
  {
    name: 'attack',
    techniques: [drainingTouch, rend, drainingTouch, rend, rend]
  }
]
```

**Use when**: You want players to feel pressure to end fights quickly.

### The Summoner (Bifang Manifestation)

**Purpose**: Create scaling damage through minion accumulation.

**Why it works**: Visual feedback shows growing threat. Players can see exactly how dangerous the enemy is becoming.

```typescript
// Creates stacking minions that add damage
const tentacle: Buff = {
  name: 'Tentacle',
  canStack: true,
  onTechniqueEffects: [
    {
      kind: 'damage',
      amount: { value: 0.2, stat: 'power', scaling: 'stacks' }
    }
  ],
  combatImage: { image: tentacleImage, position: 'arc' }
};

// Mix summoning with attacks across multiple stances
stances: [
  {
    name: 'attack1',
    techniques: [manifestTentacle, roar, flail, flail, roar, flail]
  },
  {
    name: 'attack2',
    techniques: [manifestTentacle, flail, flail, flail, flail, flail]
  }
]
```

**Use when**: You want clear visual indication of threat level and scaling damage.

### The Defender (Chasm Leviathan)

**Purpose**: Create rhythm-based combat with distinct phases.

**Why it works**: Players learn when to attack (offense phase) and when to defend (defense phase). Creates tactical timing decisions.

```typescript
// Alternates between pure offense and pure defense
stances: [
  {
    name: 'offensiveStance',
    techniques: [heavyHit, mediumHit, heavyHit, mediumHit, heavyHit, mediumHit]
  },
  {
    name: 'defensiveStance',
    techniques: [barrier, stackDefense, barrier, stackDefense, barrier, stackDefense]
  }
],
stanceRotation: [
  { kind: 'single', stance: 'offensiveStance' },
  { kind: 'single', stance: 'defensiveStance' }
]
```

**Use when**: You want predictable but challenging patterns that reward timing.

### The Resource Manager (Empowered Guimancer)

**Purpose**: Create burst-and-lull combat rhythm.

**Why it works**: Periods of high threat (when resource is full) alternate with lower threat (when depleted). Natural ebb and flow.

```typescript
// Builds up consumable resource (soulmass) then spends it
const soulmass: Buff = {
  onTechniqueEffects: [
    { kind: 'damage', amount: { value: 0.75, stat: 'power' } },
    { kind: 'add', amount: { value: -1, stat: undefined } }  // Self-consuming
  ]
};

// Each stance builds some resource while doing other things
stances: [
  {
    name: 'attack',
    techniques: [harnessSoulmass, attack, attack, attack, attack]  // Build + spend
  },
  {
    name: 'defend',
    techniques: [shield, shield, shield, attack, attack]  // Mostly defensive
  }
]
```

**Use when**: You want enemies with natural high/low intensity cycles.

## Implementation Templates

### Basic Beast Template

```typescript
export const basicBeast: EnemyEntity = {
  name: 'Beast Name',
  image: beastImage,
  imageScale: 1.0,
  realm: 'qiCondensation',
  realmProgress: 'Early',
  difficulty: 'easy',
  battleLength: 'short',

  stances: [
    {
      name: 'hunt',
      techniques: [roar, bite, bite, bite]
    }
  ],
  stanceRotation: [
    { kind: 'single', stance: 'hunt' }
  ],
  rotationOverrides: [],
  drops: [
    { item: commonMaterial, amount: 1, chance: 0.8 }
  ]
};
```

### Stacking Buffer Template

```typescript
export const stackingEnemy: EnemyEntity = {
  name: 'Stacking Enemy',
  // ... basic properties

  stances: [
    {
      name: 'build_up',
      techniques: [addBuff, addBuff, lightAttack]
    },
    {
      name: 'powered_assault',
      techniques: [scalingAttack, scalingAttack, scalingAttack]
    }
  ],
  rotationOverrides: [
    {
      stance: 'powered_assault',
      condition: 'BuffName >= 3',  // Switch when enough stacks
      repeatable: true
    }
  ],
  stanceRotation: [
    { stance: 'build_up' }  // Default to building
  ]
};
```

### Tournament Cultivator Template

```typescript
export const tournamentFighter: EnemyEntity = {
  name: 'Cultivator Name',
  // ... basic properties
  isCharacter: true,

  stances: [
    { name: 'setup', techniques: [buff1, buff2, summon, buff3, finisher] },
    { name: 'main', techniques: [combo1, combo2, combo3, ultimate] }
  ],
  rotationOverrides: [
    { stance: 'setup', condition: '1' }  // One-time setup
  ],
  stanceRotation: [
    { stance: 'main' }
  ],

  artefacts: [weaponArtefact],
  talismans: [supportTalisman],
  pills: [
    { condition: 'hp < 0.7 * maxhp', pill: healingPill },
    { condition: 'hp < 0.5 * maxhp', pill: healingPill }
  ]
};
```