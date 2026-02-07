---
layout: default
title: Choice Step
parent: Event Step Types
grand_parent: Events System
nav_order: 3
description: "Player decision points and branching narratives"
---

# Choice Step

Presents players with decision options that branch storylines and create interactive experiences.

## Interface

```typescript
interface ChoiceStep {
  kind: 'choice';
  condition?: string;
  choices: ChoiceStepChoice[];
}

interface ChoiceStepChoice {
  text: string;
  showCondition?: string;
  condition?: EventChoiceCondition;
  hideIfDisabled?: boolean;
  children: EventStep[];
}
```

## Properties

**`kind`** - Always `'choice'`

**`condition`** *(optional)* - Flag expression that must be true for the entire choice step to appear.

**`choices`** - Array of choice options available to the player.

### ChoiceStepChoice Properties

**`text`** - Display text shown to the player for this choice.

**`showCondition`** *(optional)* - Flag expression controlling whether this choice appears in the menu.

**`condition`** *(optional)* - Structured requirement condition (realm, stats, items, etc.) that determines if the choice is available.

**`hideIfDisabled`** *(optional)* - If true, hide choices with failed conditions; if false, show as grayed-out.

**`children`** - Event steps that execute when this choice is selected.

## Examples

### Basic Choice
```typescript
{
  kind: 'choice',
  choices: [
    {
      text: 'Be respectful and bow deeply',
      children: [
        { kind: 'text', text: 'You bow politely to the elder, showing proper respect.' },
        { kind: 'flag', flag: 'respectfulApproach', value: '1', global: true }
      ]
    },
    {
      text: 'Stand proudly and assert your strength',
      children: [
        { kind: 'text', text: 'You stand tall, meeting the elder\'s gaze with determination.' },
        { kind: 'flag', flag: 'defiantApproach', value: '1', global: true }
      ]
    }
  ]
}
```

### Conditional Choice
```typescript
{
  kind: 'choice',
  choices: [
    {
      text: 'Demonstrate advanced cultivation technique (Core Formation+)',
      condition: {
        kind: 'realm',
        realm: 'coreFormation',
        mode: 'more'
      },
      children: [
        { kind: 'text', text: 'Your demonstration leaves the audience in awe.' },
        { kind: 'favour', amount: '20' }
      ]
    },
    {
      text: 'Share basic cultivation insights',
      children: [
        { kind: 'text', text: 'You offer fundamental cultivation advice.' },
        { kind: 'favour', amount: '5' }
      ]
    }
  ]
}
```

### Item Requirement Choice
```typescript
{
  kind: 'choice',
  choices: [
    {
      text: 'Offer Spirit Grass as payment (Requires 5)',
      condition: {
        kind: 'item',
        item: { name: 'Spirit Grass' },
        amount: 5
      },
      children: [
        { kind: 'removeItem', item: { name: 'Spirit Grass' }, amount: '5' },
        { kind: 'addItem', item: { name: 'Rare Manual' }, amount: '1' }
      ]
    },
    {
      text: 'Pay 1000 Spirit Stones',
      condition: {
        kind: 'money',
        amount: 1000
      },
      children: [
        { kind: 'money', amount: '-1000' },
        { kind: 'addItem', item: { name: 'Rare Manual' }, amount: '1' }
      ]
    }
  ]
}
```

## Condition Types

Available condition types: `realm`, `physicalStatistic`, `socialStatistic`, `item`, `money`, `favour`, `qi`, `buff`, `affinity`, `reputation`, `multiple`.