---
layout: default
title: Give Item Step
parent: Event Step Types
grand_parent: Events System
nav_order: 52
description: "Let players choose from their inventory to proceed with event branches"
---

# Give Item Step

## Introduction

The Give Item Step creates interactive inventory selection scenarios where players must choose items from their inventory to progress through event branches. This enables crafting systems, trading mechanics, and sacrifice scenarios.

## Interface

```typescript
interface GiveItemStep {
  kind: 'giveItem';
  condition?: string;
  description: string;
  itemNames: string[];
  branches: {
    item: string;
    children: EventStep[];
  }[];
  cancel: EventStep[];
}
```

## Properties

**`kind`** - Always `'giveItem'`

**`description`** - Instruction text
- String displayed to the player explaining what item selection is for
- Appears at the top of the item picker dialog

**`itemNames`** - Valid item filter
- Array of item names that the player can select from
- Only items matching these names will be selectable in the inventory picker

**`branches`** - Item-specific outcomes
- Array of branches defining what happens when specific items are selected
- Each branch contains an item name and the event steps to execute

**`cancel`** - Cancellation outcome
- Array of event steps executed when player cancels selection

**`condition`** (optional) - Conditional execution
- Flag expression that must be true for the step to execute

## Examples

### Basic Material Selection

```typescript
{
  kind: 'giveItem',
  description: 'Select a material to forge into your weapon',
  itemNames: ['Iron Ingot', 'Steel Ingot', 'Mithril Ingot'],
  branches: [
    {
      item: 'Iron Ingot',
      children: [
        {
          kind: 'text',
          text: 'You hand over the iron ingot. The blacksmith nods approvingly.'
        },
        {
          kind: 'removeItem',
          item: { name: 'Iron Ingot' },
          amount: '1'
        },
        {
          kind: 'addItem',
          item: { name: 'Iron Sword' },
          amount: '1'
        }
      ]
    }
  ],
  cancel: [
    {
      kind: 'text',
      text: 'You decide to keep your materials for now.'
    },
    {
      kind: 'exit'
    }
  ]
}
```

### Puppet Crystal Selection

```typescript
{
  kind: 'giveItem',
  description: 'Select a technique crystal to be inserted into the puppet\'s core',
  itemNames: [
    'Blood Crystal IV',
    'Blossom Crystal IV',
    'Cloud Crystal IV',
    'Celestial Crystal IV'
  ],
  branches: [
    {
      item: 'Blood Crystal IV',
      children: [
        {
          kind: 'text',
          text: 'You insert the blood crystal into the core of the puppet, and step back.'
        },
        {
          kind: 'removeItem',
          item: { name: 'Blood Crystal IV' },
          amount: '1'
        },
        {
          kind: 'addItem',
          item: { name: 'Attuned Blood Puppet' },
          amount: '1'
        }
      ]
    }
  ],
  cancel: [
    {
      kind: 'text',
      text: 'You decide to step back and leave the puppet for now.'
    },
    {
      kind: 'exit'
    }
  ]
}
```

### Trading Sequence

```typescript
[
  {
    kind: 'speech',
    character: 'Mysterious Merchant',
    text: 'I seek rare cultivation materials. What might you have to trade?'
  },
  {
    kind: 'giveItem',
    description: 'Select an item to trade with the mysterious merchant',
    itemNames: ['Spirit Root', 'Moonstone', 'Ancient Scroll', 'Beast Core'],
    branches: [
      {
        item: 'Spirit Root',
        children: [
          {
            kind: 'speech',
            character: 'Mysterious Merchant',
            text: 'Ah, an excellent spirit root! This will serve my purposes perfectly.'
          },
          {
            kind: 'removeItem',
            item: { name: 'Spirit Root' },
            amount: '1'
          },
          {
            kind: 'addItem',
            item: { name: 'Rare Technique Manual' },
            amount: '1'
          }
        ]
      }
    ],
    cancel: [
      {
        kind: 'speech',
        character: 'Mysterious Merchant',
        text: 'Perhaps another time, then. Safe travels, cultivator.'
      }
    ]
  }
]
```