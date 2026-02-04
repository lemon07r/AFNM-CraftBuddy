---
layout: default
title: Formation
parent: Item Types
grand_parent: Item System
nav_order: 6
---

# Formation Items

Mystical arrays that enhance cultivation environments.

## Base Interface

```typescript
interface FormationItemBase extends ItemBase {
  kind: 'formation';
  subkind: FormationKind;
}

type FormationKind = 'herbField' | 'qiDensity';
type FormationItem = HerbFieldFormationItem | QiDensityFormationItem;
```

## Formation Types

### Herb Field Formations
```typescript
interface HerbFieldFormationItem extends FormationItemBase {
  subkind: 'herbField';
  speed: number;  // Growth speed multiplier
}
```

### Qi Density Formations
```typescript
interface QiDensityFormationItem extends FormationItemBase {
  subkind: 'qiDensity';
  qi: number;           // Qi density bonus
  buffs: Buff[];        // Additional buffs provided
  moneyCost: number;    // Maintenance cost
}
```

## Examples

```typescript
// Herb field growth formation
export const growthFormationII: HerbFieldFormationItem = {
  kind: 'formation',
  subkind: 'herbField',
  speed: 0, // 10 second reduction per realm tier
  name: 'Growth Formation (II)',
  description: 'A formation that enhances the growth speed of qi-herbs within its confines. It works by attuning to the soil within its reaches, pushing qi into it in great enough amounts that the herbs growing within can flourish.',
  icon: growthIcon,
  stacks: 1,
  rarity: 'empowered',
  realm: 'meridianOpening',
  valueTier: 2,
};

// Basic qi density formation
export const cyclingDensityFormation: QiDensityFormationItem = {
  kind: 'formation',
  subkind: 'qiDensity',
  qi: Math.ceil(window.modAPI.utils.getRealmQi('bodyForging', 'Early') / 60),
  moneyCost: window.modAPI.utils.getNumericReward(20, 'bodyForging', 'Early'),
  buffs: [],
  name: 'Qi-Cycling Density Formation (I)',
  description: 'A density formation that cycles the Qi of the spirit stones used to power it in a continuous loop, reducing the amount lost to the external world. A favourite formation of free cultivators, this allows them to keep progressing without the vast sums of wealth those of the sects are wont to spend.',
  icon: cyclingIcon,
  stacks: 1,
  rarity: 'empowered',
  realm: 'bodyForging',
  valueTier: 2,
};

// Qi density formation with buffs
export const empoweringDensityFormation: QiDensityFormationItem = {
  kind: 'formation',
  subkind: 'qiDensity',
  qi: Math.ceil(window.modAPI.utils.getRealmQi('bodyForging', 'Early') / 90),
  moneyCost: window.modAPI.utils.getNumericReward(40, 'bodyForging', 'Early'),
  buffs: [{
    name: 'Qi-Empowered',
    icon: empoweringIcon,
    canStack: true,
    stats: {
      power: { value: Math.ceil(window.modAPI.utils.getExpectedPower() * 0.1), stat: undefined },
    },
    onTechniqueEffects: [],
    onRoundEffects: [],
    stacks: 3,
    stacksAreDays: true,
  }],
  name: 'Qi-Empowering Density Formation (I)',
  description: 'A density formation that focuses the qi infusing it through the occupier. This qi-bath leaves a mark on the muscles it touches, allowing the cultivator to draw on a latent power they did not know they possessed.',
  icon: empoweringIcon,
  stacks: 1,
  rarity: 'empowered',
  realm: 'bodyForging',
  valueTier: 2,
};

// Dangerous formation with negative effects
export const corruptDensityFormation: QiDensityFormationItem = {
  kind: 'formation',
  subkind: 'qiDensity',
  qi: Math.ceil(window.modAPI.utils.getRealmQi('coreFormation', 'Late') / 85),
  moneyCost: window.modAPI.utils.getNumericReward(130, 'coreFormation', 'Late'),
  buffs: [{
    name: 'Corrupted Qi',
    icon: corruptIcon,
    canStack: true,
    stats: {},
    onTechniqueEffects: [],
    onRoundEffects: [],
    onCombatStartEffects: [{
      kind: 'buffSelf',
      buff: shadowSickness,
      amount: { value: 2, stat: undefined },
    }],
    stacks: 3,
    stacksAreDays: true,
  }],
  name: 'Corrupt Density Formation',
  description: 'Setting this formation with a filtered Yinying Globule and copious amounts of spirit stones, the supplied qi will be a dark and corrupted variant. This formation\'s exact purpose is unknown, but its infecting qi is a powerful stimulant if used correctly. However, the trade off is dangerous, and in some places as such, prohibited.',
  icon: corruptIcon,
  stacks: 1,
  rarity: 'resplendent',
  realm: 'coreFormation',
  valueTier: 2,
};
```