---
layout: default
title: Artefact
parent: Item Types
grand_parent: Item System
nav_order: 2
---

# Artefact Items

Powerful weapons that provide combat stats and unique techniques.

## Interface

```typescript
interface ArtefactItem extends ItemBase {
  kind: 'artefact';
  combatStats?: Partial<CombatStatsMap>;
  charisma?: number;
  techniques: ArtefactTechnique[];
}
```

## Properties

- **combatStats**: Combat bonuses (power, speed, etc.)
- **charisma**: Optional social stat bonus
- **techniques**: Artefact techniques the artefact will use. These make up the artefacts stance, so ensure it is the correct length for the realm

## Examples

```typescript
// Simple damage artefact with repeated technique
const strike: ArtefactTechnique = {
  icon: strikeIcon,
  effects: [{
    kind: 'damage',
    amount: { value: 0.4, stat: 'artefactpower' },
  }],
};

export const nineMountainHammer: ArtefactItem = {
  kind: 'artefact',
  techniques: [strike, strike, strike, strike, strike],
  name: 'Nine Mountain Hammer',
  description: 'This hammer, forged by those aspiring to become inner disciples of the sect as part of the admittance examination, is afterwards resold in the favour exchange. Powerful qi resides within it, allowing this weapon to strike down all who would dare challenge the wielder.',
  icon: hammerIcon,
  stacks: 1,
  rarity: 'qitouched',
  realm: 'qiCondensation',
  valueTier: 2,
};

// Artefact with self-buffing and attack techniques
const forestAura: Buff = {
  name: 'Aura of the Forest',
  icon: buffIcon,
  canStack: true,
  stats: {
    maxtoxicity: { value: 12, stat: undefined, scaling: 'stacks' },
  },
  onTechniqueEffects: [],
  onRoundEffects: [],
  stacks: 1,
};

const forestBuff: ArtefactTechnique = {
  icon: buffIcon,
  effects: [
    { kind: 'damage', amount: { value: 0.05, stat: 'artefactpower' } },
    {
      kind: 'buffSelf',
      buff: forestAura,
      amount: { value: 1, stat: undefined },
    },
  ],
};

const attack: ArtefactTechnique = {
  icon: attackIcon,
  effects: [{
    kind: 'damage',
    amount: { value: 0.35, stat: 'artefactpower' },
  }],
};

export const shroudedForestWand: ArtefactItem = {
  kind: 'artefact',
  techniques: [forestBuff, attack, attack],
  name: 'Shrouded Forest Wand',
  description: 'A wand crafted using Crystallized Qi, a precious resource coveted by the beasts of the spirit well. Unlike most artefacts, the energies of this creation focus on the wielder. It fortifies their blood to allow them to greater withstand pill toxins.',
  icon: wandIcon,
  stacks: 1,
  rarity: 'empowered',
  realm: 'bodyForging',
};

// Conditional artefact based on celestial techniques
const dualityAttack: ArtefactTechnique = {
  icon: attackIcon,
  tooltip: 'If there is Sunlight then deal damage, if there is Moonlight then gain barrier.',
  effects: [
    {
      kind: 'damage',
      condition: { kind: 'condition', condition: `${sunlight.name} > 0` },
      amount: { value: 0.3, stat: 'artefactpower' },
    },
    {
      kind: 'barrier',
      condition: { kind: 'condition', condition: `${moonlight.name} > 0` },
      amount: { value: 0.3, stat: 'artefactpower' },
    },
  ],
};

export const dualitySphere: ArtefactItem = {
  kind: 'artefact',
  techniques: [dualityAttack, dualityAttack, dualityAttack, dualityAttack, dualityAttack, dualityAttack],
  name: 'Duality Sphere',
  description: 'Where the Eclipse Lord comes from is unknown. Whether it be terrestrial beast or firmament descender, its link to the heavens above is undeniable. This artefact, crafted with its remnants, resonates with the celestial bodies, channelling their power to devastating effect.',
  icon: sphereIcon,
  stacks: 1,
  rarity: 'empowered',
  realm: 'coreFormation',
};

// Artefact that generates technique resources
const shard: ArtefactTechnique = {
  icon: shardIcon,
  effects: [
    { kind: 'damage', amount: { value: 0.25, stat: 'artefactpower' } },
    {
      kind: 'buffSelf',
      buff: metalFragment,
      amount: { value: 1, stat: undefined },
    },
  ],
};

export const azuritePuppet: ArtefactItem = {
  kind: 'artefact',
  techniques: [shard, shard, shard, shard, shard],
  name: 'Azurite Puppet',
  description: 'An artefact-puppet fashioned in the likeness of an ancient Azurite Automaton. Interfacing perfectly with the weapon techniques of its original creator, it can produce shards to be used by a cultivator in vast numbers.',
  icon: puppetIcon,
  stacks: 1,
  rarity: 'resplendent',
  realm: 'qiCondensation',
};
```

## Techniques

Artefacts can have associated techniques:

```typescript
interface ArtefactTechnique {
  icon: string;
  tooltip?: string;
  effects: TechniqueEffect[];
}
```

## Enchantments

```typescript
interface ArtefactEnchantment extends Enchantment {
  itemKind: 'artefact';
  combatStats?: Partial<CombatStatsMap>;
  charisma?: number;
}
```