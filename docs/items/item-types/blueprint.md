---
layout: default
title: Blueprint
parent: Item Types
grand_parent: Item System
nav_order: 4
---

# Blueprint Items

Blueprints for constructing rooms in the player's house.

## Interface

```typescript
interface BlueprintItem extends ItemBase {
  kind: 'blueprint';
  room: Room;
}
```

## Properties

- **room**: Room definition this blueprint creates

## Examples

```typescript
// Simple cultivation room blueprint
export const cultivationRoomBlueprint: BlueprintItem = {
  kind: 'blueprint',
  name: 'Blueprint: Cultivation Chamber',
  description: 'The complex formation in this chamber allows better sensing of qi flows.',
  icon: blueprintIcon,
  room: {
    kind: 'cultivation',
    name: 'Cultivation Chamber',
    description: 'The complex formation in this chamber is designed to allow the occupier to focus in on themselves, better sensing the flows of Qi within their body and the world around them.',
    icon: Spa,
    realm: 'qiCondensation',
    rarity: 'empowered',
    buildMonths: 6,
  },
  stacks: 1,
  rarity: 'empowered',
  realm: 'qiCondensation',
  valueTier: 2,
};

// Crafting room blueprint with buffs and costs
export const craftControlRoomBlueprint: BlueprintItem = {
  kind: 'blueprint',
  name: 'Blueprint: Discharging Refinement Chamber (I)',
  description: 'Around the furnace-mount are discharging arrays, controlled by levers for careful qi flow control.',
  icon: blueprintIcon,
  room: {
    kind: 'crafting',
    buffs: [{
      name: 'Controlled Refinement',
      icon: craftIcon,
      canStack: false,
      stats: {
        control: { value: window.modAPI.utils.getCraftingEquipmentStats('bodyForging', 'Late', { pool: 0, control: 0.4, intensity: 0 }, 'cauldron').control, stat: undefined },
      },
      effects: [],
      onFusion: [],
      onRefine: [],
      stacks: 1,
      displayLocation: 'none',
    }],
    moneyCost: window.modAPI.utils.getNumericReward(650, 'bodyForging', 'Early'),
    name: 'Discharging Refinement Chamber (I)',
    description: 'Around the furnace-mount at the center of this chamber are a number of discharging arrays, controlled by levers. Usage of these allows the refiner to carefully control the flow of qi within the materials, ensuring that the final product is of the highest quality and purity possible.',
    realm: 'bodyForging',
    rarity: 'empowered',
    icon: MenuBook,
    buildMonths: 6,
  },
  stacks: 1,
  rarity: 'empowered',
  realm: 'bodyForging',
  valueTier: 3,
};

// Buff room blueprint with temporary stat bonuses
export const barrierRoomBlueprint: BlueprintItem = {
  kind: 'blueprint',
  name: 'Blueprint: Dantian Energizer (I)',
  description: 'A large array continuously circulating qi to temporarily swell dantian capacity.',
  icon: blueprintIcon,
  room: {
    kind: 'buff',
    buffs: [{
      name: 'Energized Dantian',
      icon: energyIcon,
      canStack: true,
      stats: {
        maxbarrier: { value: window.modAPI.utils.getExpectedBarrier(), stat: undefined },
        barrierMitigation: { value: 4, stat: undefined },
      },
      onTechniqueEffects: [],
      onRoundEffects: [],
      stacks: 2,
      stacksAreDays: true,
    }],
    moneyCost: window.modAPI.utils.getNumericReward(30, 'bodyForging', 'Early'),
    name: 'Dantian Energizer (I)',
    description: 'A large array stands within this room, continuously circulating qi through its occupants. Any who meditate within will find their dantian stimulated, temporarily swelling its capacity and reinforcing the barrier that can be projected from it to protect the users body from harm.',
    realm: 'bodyForging',
    rarity: 'empowered',
    icon: BlurCircular,
    buildMonths: 3,
  },
  stacks: 1,
  rarity: 'empowered',
  realm: 'bodyForging',
  valueTier: 2,
};

// Combat-focused buff room blueprint
export const powerRoomBlueprint: BlueprintItem = {
  kind: 'blueprint',
  name: 'Blueprint: Practise Post (I)',
  description: 'A practise post that lashes out to enhance combat responses and technique power.',
  icon: blueprintIcon,
  room: {
    kind: 'buff',
    buffs: [{
      name: 'Practised',
      icon: practiseIcon,
      canStack: true,
      stats: {
        power: { value: Math.floor(window.modAPI.utils.getExpectedPower() * 0.1), stat: undefined },
      },
      onTechniqueEffects: [],
      onRoundEffects: [],
      stacks: 2,
      stacksAreDays: true,
    }],
    moneyCost: window.modAPI.utils.getNumericReward(15, 'bodyForging', 'Early'),
    name: 'Practise Post (I)',
    description: 'At the center of this room stands a practise post, infused with qi to lash out at the user to enhance their responses in combat. Training within this room will allow the user to temporarily hone their techniques and bring out the full potential of their power.',
    realm: 'bodyForging',
    rarity: 'empowered',
    icon: SportsKabaddi,
    buildMonths: 3,
  },
  stacks: 1,
  rarity: 'empowered',
  realm: 'bodyForging',
  valueTier: 2,
};
```
