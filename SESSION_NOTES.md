# AFNM-CraftBuddy Session Notes

## Current Status (v1.11.0)

The mod loads successfully and shows the title screen indicator, but the recommendation panel is not appearing during crafting sessions despite the mod receiving data.

## Key Findings

### What Works
1. **Mod loads correctly** - Title screen indicator "🔮 AFNM-CraftBuddy v1.11.0 Loaded" appears
2. **Harmony type wrappers register** - Console shows registration for forge, alchemical, inscription, resonance
3. **Lifecycle hooks work** - `onDeriveRecipeDifficulty` is called (though no log appears in user's output)
4. **Redux store is found** - `findReduxStore()` successfully returns a store with `getState()`, `subscribe()`, etc.
5. **Redux state has crafting key** - Store state keys include `crafting` among 32 keys
6. **Mock data test works** - `craftBuddyDebug.testWithMockData()` successfully shows the panel with recommendations

### What Doesn't Work
1. **Panel doesn't appear during actual crafting** - Despite data being available
2. **Settings show `panelVisible: false`** - Panel visibility gets set to false somehow

### Console Output Analysis (from user's testing)

**Before crafting (at pagoda/recipe selection screen):**
```
Current config: null
Last entity: null
Last progressState: null
```

**After starting crafting:**
```
Current config: {maxQi: 194, maxStability: 60, baseIntensity: 20, baseControl: 23, minStability: 10, …}
Last entity: {realm: 'bodyForging', image: '...', techniques: [...], ...}
Last progressState: {completion: 0, perfection: 0, harmony: 50, stability: 60, stabilityPenalty: 0, …}
panelVisible: false  <-- THIS IS THE PROBLEM
```

### Redux Store Structure

The game's Redux store has these top-level keys:
```
gameData, gameEvent, combat, player, calendar, month, quests, inventory, 
crafting, newGame, breakthrough, location, screen, herbField, mine, 
tutorial, characters, worldMapViewport, mineViewport, version, 
selectedCharacter, selectedLocation, auction, mysticalRegion, tournament, 
house, mod, dualCultivation, guild, stoneCutting, fallenStar, characterUiPreferences
```

The `crafting` slice follows the `CraftingState` interface from `afnm-types`:
```typescript
interface CraftingState {
    player?: CraftingEntity;
    recipe?: RecipeItem;
    recipeStats?: CraftingRecipeStats;
    progressState?: ProgressState;
    consumedPills: number;
    craftingLog: string[];
    craftResult?: CraftingResult;
    trainingMode?: CraftingTrainingMode;
    eventStateSnapshot?: GameEventState;
}
```

### ProgressState Structure
```typescript
interface ProgressState {
    completion: number;
    perfection: number;
    stability: number;
    stabilityPenalty: number;
    condition: CraftingCondition;
    nextConditions: CraftingCondition[];
    harmony: number;
    harmonyTypeData?: HarmonyData;
    step: number;
    effectTracking: Record<string, CraftingEffectTracking>;
    actionTracking: Record<string, ActionTracking>;
    pillTracking: Record<string, number>;
    lastActionType?: CraftingTechniqueType;
}
```

## Changes Made in v1.11.0

1. **Added Redux store caching** - Store is cached after first discovery for faster access
2. **Added Redux store subscription** - Subscribes to store changes 1 second after mod load
3. **Force panel visible on crafting start** - In `onDeriveRecipeDifficulty`, sets `currentSettings.panelVisible = true`
4. **Better debug logging** - `detectCrafting()` now logs raw Redux crafting state

## Potential Issues to Investigate

1. **`onDeriveRecipeDifficulty` might not be called** - User's console output doesn't show the `[CraftBuddy] onDeriveRecipeDifficulty called for:` message, but `lastEntity` and `lastProgressState` ARE populated during crafting

2. **Redux subscription might not trigger** - Need to verify `[CraftBuddy] Subscribing to Redux store for state changes` appears in console

3. **Panel visibility state** - Something is setting `panelVisible: false` - possibly localStorage has old settings

4. **Overlay container might not be visible** - The DOM element might exist but be hidden

## Debug Commands Available

```javascript
// Test panel rendering with mock data
craftBuddyDebug.testWithMockData()

// Show/hide panel manually
craftBuddyDebug.showPanel()
craftBuddyDebug.hidePanel()

// Check crafting detection (now logs Redux state)
craftBuddyDebug.detectCrafting()

// View current state
craftBuddyDebug.getCurrentState()
craftBuddyDebug.getLastEntity()
craftBuddyDebug.getLastProgressState()

// Log all game data sources
craftBuddyDebug.logGameData()

// Find Redux store
craftBuddyDebug.findStore()

// Force update with stored data
craftBuddyDebug.forceUpdate()

// Settings
craftBuddyDebug.getSettings()
craftBuddyDebug.togglePanel()
```

## Next Steps to Try

1. **Clear localStorage** - Run `localStorage.removeItem('craftbuddy_settings')` to reset settings

2. **Check if subscription fires** - Look for `[CraftBuddy] Subscribing to Redux store for state changes` in console

3. **Check if Redux updates fire** - Look for `[CraftBuddy] Redux update:` messages during crafting

4. **Manual panel show** - During crafting, run `craftBuddyDebug.showPanel()` to force the panel visible

5. **Check overlay container** - Run `document.getElementById('craftbuddy-overlay')` to see if it exists and check its style

6. **Verify onDeriveRecipeDifficulty** - Look for `[CraftBuddy] Crafting starting, forcing panel visible` message

## File Locations

- **Mod source**: `/home/lamim/Development/AFNM - CraftBuddy/`
- **Built mod**: `/home/lamim/Development/AFNM - CraftBuddy/builds/afnm-craftbuddy.zip`
- **Game mods folder**: `/home/lamim/Games/AFNM_Linux/mods/`
- **Game executable**: `/home/lamim/Games/AFNM_Linux/`
- **Debug mode file**: `/home/lamim/Games/AFNM_Linux/devMode` (empty file enables console)

## Key Source Files

- `src/modContent/index.ts` - Main mod integration (1235 lines)
- `src/optimizer/state.ts` - CraftingState class
- `src/optimizer/skills.ts` - Skill definitions and application
- `src/optimizer/search.ts` - Search algorithms
- `src/ui/RecommendationPanel.tsx` - React UI component
- `src/settings/index.ts` - Settings management

## GitHub Repository

https://github.com/lemon07r/AFNM-CraftBuddy

## Build Commands

```bash
cd "/home/lamim/Development/AFNM - CraftBuddy"
npm install      # Install dependencies
npm run build    # Build mod (output: builds/afnm-craftbuddy.zip)
npm test         # Run tests (95 tests)

# Deploy to game
cp builds/afnm-craftbuddy.zip /home/lamim/Games/AFNM_Linux/mods/
```

## Version History

- v1.0.0 - Initial release
- v1.1.0 - Support all harmony types, toxicity, mastery, cooldowns
- v1.2.0 - Optimal rotation display, expected final state, quality ratings
- v1.3.0 - Settings panel, keyboard shortcuts, compact mode
- v1.4.0 - Unit tests, performance optimization, conflict detection
- v1.5.0 - Title screen indicator, default lookahead depth 4
- v1.5.1 - Fix: Include package.json in zip
- v1.6.0 - Version-less zip filename, improved indicator
- v1.8.0 - Harmony type wrapper approach (didn't work for overriding)
- v1.9.0 - DOM-based overlay approach
- v1.10.0 - Improved Redux store detection
- v1.11.0 - Redux store subscription, force panel visible on crafting start
