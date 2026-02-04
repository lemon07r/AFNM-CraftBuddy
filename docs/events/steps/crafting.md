---
layout: default
title: Crafting Step
parent: Event Step Types
grand_parent: Events System
nav_order: 24
description: 'Initiate crafting'
---

# Crafting Step

## Introduction

The Crafting Step initiates crafting challenges with different branches based on the results.

## Interface

```typescript
interface CraftingStep {
  kind: 'crafting';
  condition?: string;
  recipe: string;
  basicCraftSkill: number;
  perfectCraftSkill: number;
  sublimeCraftSkill?: number;
  sublime?: EventStep[];
  perfect: EventStep[];
  basic: EventStep[];
  failed: EventStep[];
  useCurrentBackground?: boolean;
  buffs?: CraftingBuff[];
  forceSublimeCrafting?: boolean;
}
```

## Properties

- `kind` - Always `'crafting'`

- `recipe` - Recipe identifier to craft

- `basicCraftSkill` - Craft skill given on basic result

- `perfectCraftSkill` - Craft skill given on perfect result

- `sublimeCraftSkill` - Craft skill given on sublime result (optional)

- `sublime` - Steps for sublime outcome (optional)

- `perfect` - Steps for perfect outcome

- `basic` - Steps for basic success

- `failed` - Steps for failed crafting

- `useCurrentBackground` - Keep current screen background (optional)

- `buffs` - Applied crafting buffs (optional)

- `forceSublimeCrafting` - Force sublime crafting mode (optional)

- `condition` - Conditional execution (optional)

## Examples

```typescript
{
  kind: 'crafting',
  recipe: healingPillIRecipe,
  basicCraftSkill: 0,
  perfectCraftSkill: 1,
  perfect: [{ kind: 'text', text: 'Perfect pill created!' }],
  basic: [{ kind: 'text', text: 'Basic pill created.' }],
  failed: [{ kind: 'text', text: 'Crafting failed.' }]
}
```
