---
layout: default
title: Lifecycle hooks
parent: Advanced mods
nav_order: 1
---

# Mod Hooks Documentation

This document describes the available mod hooks that allow mods to intercept and modify game behavior at specific points.

## Combat Hooks

### `onCreateEnemyCombatEntity`

Intercepts the creation of enemy combat entities, allowing modifications to enemy stats, abilities, or equipment before combat begins.

**Parameters:**
- `enemy: EnemyEntity` - The base enemy definition
- `combatEntity: CombatEntity` - The combat entity being created
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** Modified `CombatEntity`

**Example:**
```typescript
mod.onCreateEnemyCombatEntity((enemy, combatEntity, gameFlags) => {
  // Make the entire game harder
  combatEntity.stats.attack *= 1.2;
  combatEntity.stats.defense *= 1.2;

  // Modify defense factor for specific enemy types
  if (enemy.name.includes('Stone')) {
    combatEntity.stats.defense *= 1.5;
  }

  return combatEntity;
});
```

## Crafting Hooks

### `onDeriveRecipeDifficulty`

Modifies the difficulty and stats of crafting recipes during the crafting process.

**Parameters:**
- `recipe: RecipeItem` - The recipe being crafted
- `recipeStats: CraftingRecipeStats` - The calculated recipe statistics with properties:
  - `completion: number` - Completion threshold
  - `perfection: number` - Perfection threshold
  - `stability: number` - Stability value
  - `conditionType: RecipeConditionEffect` - Recipe condition effect
  - `harmonyType: RecipeHarmonyType` - Recipe harmony type
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** Modified `CraftingRecipeStats`

**Example:**
```typescript
mod.onDeriveRecipeDifficulty((recipe, recipeStats, gameFlags) => {
  // Custom quest that makes all crafts easier
  if (gameFlags.unlockedUltimateCauldron === 1) {
    recipeStats.completion *= 0.8;
    recipeStats.perfection *= 0.8;
  }

  // Increase stability for experienced crafters
  if (gameFlags.totalCraftsCompleted > 100) {
    recipeStats.stability *= 1.2;
  }

  return recipeStats;
});
```

## Completion Hooks

These hooks trigger after specific game activities complete during an event, allowing mods to inject additional event steps into the event flow.

### `onCompleteCombat`

Triggers after combat ends, allowing for custom victory/defeat consequences.

**Parameters:**
- `eventStep: CombatStep | FightCharacterStep` - The event stap that triggered the combat
- `victory: boolean` - Whether the player won
- `playerCombatState: CombatEntity` - The player's combat state at end
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** `EventStep[]` - Additional event steps to execute

**Example:**
```typescript
mod.onCompleteCombat((eventStep, victory, playerCombatState, gameFlags) => {
  const events: EventStep[] = [];

  // Add permadeath
  if (!victory && eventStep.kind === "combat" && !eventStep.isSpar) {
    events.push({
      kind: 'text',
      text: 'As you fall the world fades to black, your lifeblood pouring from your ruined body.'
    });
    events.push({
      kind: 'changeSocialStat',
      stat: 'lifespan',
      amount: '-lifespan'
    });
    events.push({
      kind: 'text',
      text: 'You died.'
    });
  }

  // Grant bonus rewards for flawless victories
  if (victory && playerCombatState.stats.hp === playerCombatState.stats.maxHp) {
    events.push({
      kind: 'addItem',
      item: { name: 'Flawless Victory Token' },
      amount: '1'
    });
    events.push({
      kind: 'flag',
      global: false,
      flag: 'flawlessVictories',
      value: '' + ((gameFlags.flawlessVictories || 0) + 1)
    });
  }

  return events;
});
```

### `onCompleteTournament`

Triggers after tournament participation with placement results.

**Parameters:**
- `eventStep: TournamentStep` - The event stap that triggered the combat
- `tournamentState: 'victory' | 'second' | 'defeat'` - Tournament placement
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** `EventStep[]` - Additional event steps to execute

**Example:**
```typescript
mod.onCompleteTournament((eventStep, tournamentState, gameFlags) => {
  const events: EventStep[] = [];

  if (tournamentState === 'victory' && !gameFlags.firstTournamentVictory) {
    events.push({
      kind: 'text',
      text: 'The crowd erupts in cheers as you claim your first tournament victory!'
    });
    events.push({
      kind: 'flag',
      global: false,
      flag: 'firstTournamentVictory',
      value: '1'
    });
    events.push({
      kind: 'unlockLocation',
      location: 'Champion Training Grounds'
    });
  }

  // Track tournament statistics
  const tournamentCount = (gameFlags.tournamentsEntered || 0) + 1;
  events.push({
    kind: 'flag',
    global: false,
    flag: 'tournamentsEntered',
    value: '' + tournamentCount
  });

  return events;
});
```

### `onCompleteDualCultivation`

Triggers after dual cultivation attempts.

**Parameters:**
- `eventStep: DualCultivationStep` - The event stap that triggered the combat
- `success: boolean` - Whether the dual cultivation succeeded
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** `EventStep[]` - Additional event steps to execute

**Example:**
```typescript
mod.onCompleteDualCultivation((eventStep, success, gameFlags) => {
  const events: EventStep[] = [];

  if (success) {
    // Grant bonus qi based on consecutive successes
    const streak = (gameFlags.dualCultivationStreak || 0) + 1;
    events.push({
      kind: 'qi',
      amount: '' + (100 * streak)
    });
    events.push({
      kind: 'flag',
      global: false,
      flag: 'dualCultivationStreak',
      value: '' + streak
    });
  } else {
    // Reset streak on failure
    if (gameFlags.dualCultivationStreak > 0) {
      events.push({
        kind: 'flag',
        global: false,
        flag: 'dualCultivationStreak',
        value: '0'
      });
    }
  }

  return events;
});
```

### `onCompleteCrafting`

Triggers after crafting attempts, successful or failed.

**Parameters:**
- `eventStep: CraftingStep` - The event stap that triggered the combat
- `item: CraftingResult | undefined` - The crafted item (undefined if failed)
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** `EventStep[]` - Additional event steps to execute

**Example:**
```typescript
mod.onCompleteCrafting((eventStep, item, gameFlags) => {
  const events: EventStep[] = [];

  if (item) {
    // Track crafting statistics
    const totalCrafted = (gameFlags.totalItemsCrafted || 0) + 1;
    events.push({
      kind: 'flag',
      global: false,
      flag: 'totalItemsCrafted',
      value: '' + totalCrafted
    });

    // Reputation rewards for high quality items
    if (item.quality >= 4) {
      events.push({
        kind: 'reputation',
        name: 'Celadon Flame Brewers',
        amount: '' + (item.quality * 5)
      });
    }

    // Unlock new recipes at milestones
    if (totalCrafted === 50) {
      events.push({
        kind: 'addRecipe',
        recipe: 'Advanced Spirit Pill'
      });
    }
  }

  return events;
});
```

### `onCompleteAuction`

Triggers after participating in auctions.

**Parameters:**
- `eventStep: AuctionStep` - The event stap that triggered the combat
- `itemsBought: AuctionItem[]` - Items successfully purchased
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** `EventStep[]` - Additional event steps to execute

**Example:**
```typescript
mod.onCompleteAuction((eventStep, itemsBought, gameFlags) => {
  const events: EventStep[] = [];

  // Track auction spending
  let totalSpent = 0;
  itemsBought.forEach(item => {
    totalSpent += item.price;
  });

  if (totalSpent > 10000) {
    events.push({
      kind: 'text',
      text: 'Your lavish spending catches the attention of the auction house.'
    });
    events.push({
      kind: 'reputation',
      name: 'Auction House',
      amount: '10'
    });
  }

  // Special reward for buying multiple items
  if (itemsBought.length >= 5) {
    events.push({
      kind: 'addItem',
      item: { name: 'Bulk Buyer Token' },
      amount: '1'
    });
  }

  return events;
});
```

### `onCompleteStoneCutting`

Triggers after stone cutting activities.

**Parameters:**
- `eventStep: StoneCuttingStep` - The event stap that triggered the combat
- `gameFlags: Record<string, number>` - Current game flags/state

**Returns:** `EventStep[]` - Additional event steps to execute

**Example:**
```typescript
mod.onCompleteStoneCutting((eventStep, gameFlags) => {
  const events: EventStep[] = [];

  // Track total stones cut
  const stonesCount = (gameFlags.totalStonesCut || 0) + 1;
  events.push({
    kind: 'flag',
    global: false,
    flag: 'totalStonesCut',
    value: '' + stonesCount
  });

  // Milestone rewards
  if (stonesCount === 100) {
    events.push({
      kind: 'text',
      text: 'Your expertise in stone cutting has reached a new level.'
    });
    events.push({
      kind: 'addItem',
      item: { name: 'Master Stone Cutter Badge' },
      amount: '1'
    });
  }

  // Random chance for bonus materials
  if (Math.random() < 0.1) {
    events.push({
      kind: 'addItem',
      item: { name: 'Rare Stone Fragment' },
      amount: '' + (1 + Math.floor(stonesCount / 50))
    });
  }

  return events;
});
```