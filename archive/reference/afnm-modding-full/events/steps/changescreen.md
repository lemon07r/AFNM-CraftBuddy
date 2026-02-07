---
layout: default
title: Change Screen Step
parent: Event Step Types
grand_parent: Events System
nav_order: 24
description: 'Navigate player to different game screens'
---

# Change Screen Step

## Introduction

The Change Screen Step navigates the player to a different game screen, seamlessly transitioning them between various game interfaces such as research facilities, markets, cultivation areas, and more. This step is essential for creating smooth gameplay flow and directing players to specific game functionalities as part of your event narrative.

Use this step when your events need to automatically take players to relevant screens - like opening the research interface after discovering a new facility, or taking them to the market after meeting a merchant.

## Interface

```typescript
interface ChangeScreenStep {
  kind: 'changeScreen';
  condition?: string;
  screen: GameScreen;
}
```

## Properties

### Required Properties

**`kind`** - Always `'changeScreen'`

- Identifies this as a screen navigation step

**`screen`** - Target game screen

- Specifies which game screen to navigate to
- Must be a valid GameScreen value
- See Available Screens section below for complete list

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must evaluate to true for the step to execute
- Step is skipped if condition fails
- Useful for only changing screens based on player state or story progression

## Available Screens

The following screens are available for navigation:

| Screen            | Description                         |
| ----------------- | ----------------------------------- |
| `'location'`      | Main location screen (default)      |
| `'recipe'`        | Recipe crafting interface           |
| `'mission'`       | Mission and quest management        |
| `'craftingHall'`  | Crafting hall interface             |
| `'manual'`        | Technique manual and skills         |
| `'cultivation'`   | Cultivation and breakthrough screen |
| `'map'`           | World map navigation                |
| `'healer'`        | Healer services and recovery        |
| `'market'`        | Trading and commerce interface      |
| `'favour'`        | Reputation and favour management    |
| `'herbField'`     | Herb gathering and farming          |
| `'mine'`          | Mining operations                   |
| `'recipeLibrary'` | Recipe collection browser           |
| `'requestBoard'`  | Quest and mission board             |
| `'compendium'`    | Knowledge and lore collection       |
| `'library'`       | Texts and research materials        |
| `'altar'`         | Altar interactions and rituals      |
| `'research'`      | Research facilities and experiments |
| `'pillarGrid'`    | Formation and pillar arrangements   |
| `'fallenStar'`    | Fallen star events and rewards      |

## Basic Examples

### Navigate to Research Facility

```typescript
{
  kind: 'changeScreen',
  screen: 'research'
}
```

### Open Market Interface

```typescript
{
  kind: 'changeScreen',
  screen: 'market'
}
```

### Facility Discovery

After players discover or unlock new facilities, automatically navigate them to the relevant screen:

```typescript
[
  {
    kind: 'text',
    text: 'The doors of the ancient library creak open, revealing countless scrolls and tomes filled with cultivation wisdom.',
  },
  {
    kind: 'unlockLocation',
    location: 'Ancient Library',
  },
  {
    kind: 'changeScreen',
    screen: 'library',
  },
];
```

### Cultivation Breakthrough

Guide players to cultivation screen for important spiritual development:

```typescript
[
  {
    kind: 'text',
    text: 'Your spiritual energy surges as you feel yourself on the verge of a breakthrough. The time has come to advance your cultivation.',
  },
  {
    kind: 'changeScreen',
    condition: 'realm >= qiCondensation',
    screen: 'cultivation',
  },
];
```
