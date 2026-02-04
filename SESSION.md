# CraftBuddy Debug Session

## Current Issues

### Issue 1: Wrong Target Values on Mid-Craft Save Load

**Problem:** When loading a save that goes directly into the middle of a crafting minigame, the mod displays incorrect target values (e.g., 100/100/60 instead of the actual recipe targets like 130/130/59).

**Root Cause Analysis (CORRECTED 2026-02-04):**
1. The previous analysis was WRONG - `recipeStats` IS persisted in Redux saves
2. The real issue was that the mod tried to read `progressState.maxStability` which doesn't exist in the game
3. The game tracks max stability decay via `progressState.stabilityPenalty`, not a separate `maxStability` field
4. Current max stability = `recipeStats.stability - progressState.stabilityPenalty`
5. DOM parsing for completion/perfection targets won't work because the game shows PERCENTAGES by default (e.g., "45% / 100%"), not raw values

**Fix Applied (2026-02-04):**
Modified both `processCraftingState()` and `updateRecommendation()` in `src/modContent/index.ts`:
- Read target values from `recipeStats` (completion, perfection, stability) - this IS persisted in saves
- Calculate `currentMaxStability = recipeStats.stability - progressState.stabilityPenalty`
- Removed reliance on non-existent `progressState.maxStability` field

**Status:** FIXED (2026-02-04)

**Final Root Cause (from debug output):**
The `pollCraftingState()` function was calling `detectCraftingState()` which returned `entity` and `progress` but NOT `recipeStats`. The targets were never being read from Redux during polling - only during the `onDeriveRecipeDifficulty` hook (which doesn't fire on mid-craft save loads).

**Fix Applied:**
1. Modified `detectCraftingState()` to also return `recipeStats` from Redux
2. Modified `pollCraftingState()` to read target values from `recipeStats` BEFORE calling `updateRecommendation()`
3. Now targets are correctly read as: `targetCompletion = recipeStats.completion`, etc.
4. Current max stability calculated as: `currentMaxStability = recipeStats.stability - progress.stabilityPenalty`

**IMPORTANT NOTE (2026-02-04):** The `nonMinifiedCode/` folder contains code from an OLDER version of the game and may be inaccurate/stale. The actual game's Redux state structure may differ from what's documented there.

### Issue 2: Minimal Skill Tooltips

**Problem:** The skill suggestion tooltips now only show minimal info like "+36 C" instead of more detailed information.

**Root Cause:** The `SingleSkillBox` component was simplified to only show gains.

**Fix Applied (2024-02-04):**
Enhanced `SingleSkillBox` in `src/ui/RecommendationPanel.tsx` to show:
- Qi cost (e.g., "10 Qi")
- Stability cost (e.g., "-10 Stab")
- Full gain names (e.g., "+36 Completion" instead of "+36 C")
- Buff granted indicator (e.g., "🔮 Control x2")
- Buff consumer indicator ("⚡ Uses Buff")
- Reasoning text for primary skill

Also updated `SkillCard` to extract and pass skill costs and buff info to `SingleSkillBox`.

**Status:** FIXED - needs testing

## Debug Commands

In browser console:
```javascript
// *** MOST IMPORTANT - Run this during crafting to see actual Redux state ***
craftBuddyDebug.dumpCraftingState()

// Quick check of what targets the mod is currently using
craftBuddyDebug.getCurrentTargets()

// Check current targets (old)
craftBuddyDebug.getTargets()

// Check current state
craftBuddyDebug.getCurrentState()

// Check last entity and progress state
craftBuddyDebug.getLastEntity()
craftBuddyDebug.getLastProgressState()

// Log all game data sources
craftBuddyDebug.logGameData()

// Manually set targets for testing
craftBuddyDebug.setTargets(130, 130, 59)

// Parse DOM values to see what's visible in UI
craftBuddyDebug.parseDOMValues()
```

## How to Debug the Target Values Issue

1. **Load the mod** and start a crafting session (or load a mid-craft save)
2. **Open browser console** (F12 -> Console tab)
3. **Run:** `craftBuddyDebug.dumpCraftingState()`
4. **Copy the entire output** and share it - this will show:
   - What keys exist in the Redux crafting state
   - Whether `recipeStats` exists and what values it has
   - What `progressState` contains
   - What the mod is currently using as targets
5. **Compare** the Redux values with what the game UI shows

## Testing Steps

1. Start a new craft and note the target values
2. Save the game mid-craft
3. Close and reload the game
4. Load the mid-craft save
5. Check if CraftBuddy shows the correct target values
6. Use `craftBuddyDebug.getTargets()` to verify

## Session Notes

### Game Data Structure (from nonMinifiedCode analysis)

**Redux CraftingState contains:**
- `player` - CraftingEntity with stats, buffs, techniques
- `progressState` - Current progress (completion, perfection, stability, stabilityPenalty)
- `recipe` - The recipe being crafted (difficulty is just a string like 'hard')
- `recipeStats` - TARGET values (completion, perfection, stability) - **IS PERSISTED IN SAVES**

**Key formulas:**
- Current max stability = `recipeStats.stability - progressState.stabilityPenalty`
- `stabilityPenalty` increases by 1 each turn (unless skill has `noMaxStabilityLoss: true`)

**UI Display formats:**
- Completion/Perfection: Shows PERCENTAGES by default ("45% / 100%"), raw numbers only when Alt held
- Stability: Shows raw values ("45 / 59" = current / currentMax)

**Important:** DOM parsing for completion/perfection targets won't work because the game shows percentages, not raw values. Always use `recipeStats` from Redux as the authoritative source.
