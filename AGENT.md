# CraftBuddy - AFNM Crafting Optimizer Mod

## Project Overview

CraftBuddy is a mod for "Ascend From Nine Mountains" that automatically calculates and displays the optimal next skill to use during crafting. It ports the algorithm from the Python crafting optimizer tool to TypeScript and integrates it directly into the game's crafting UI.

## Project Structure

```
AFNM - CraftBuddy/
├── src/
│   ├── mod.ts              # Mod entry point with metadata
│   ├── modContent/
│   │   └── index.ts        # Main mod content registration
│   ├── optimizer/
│   │   ├── index.ts        # Optimizer exports
│   │   ├── state.ts        # CraftingState class
│   │   ├── skills.ts       # Skill definitions and application
│   │   └── search.ts       # Search algorithm (greedy/lookahead)
│   ├── ui/
│   │   └── RecommendationPanel.tsx  # React UI component
│   ├── assets/             # Images and icons
│   ├── custom.d.ts         # Custom type declarations
│   └── global.d.ts         # Global type declarations
├── docs/                   # Modding documentation (from template)
├── scripts/
│   └── zip-dist.js         # Build packaging script
├── package.json            # NPM config with mod metadata
├── webpack.config.js       # Build configuration
├── tsconfig.json           # TypeScript configuration
└── AGENT.md                # This file
```

## Modding API Findings

### Key APIs

1. **window.modAPI.actions** - Register content:
   - `addItem(item)` - Add items
   - `addTechnique(technique)` - Add techniques
   - `addHarmonyType(config)` - Add custom crafting harmony types
   - `addScreen(config)` - Add custom screens

2. **window.modAPI.hooks** - Lifecycle hooks:
   - `onDeriveRecipeDifficulty(callback)` - Called when crafting starts
   - `onCompleteCrafting(callback)` - Called when crafting completes

3. **window.modAPI.gameData** - Access game data:
   - `craftingTechniques` - All crafting techniques
   - `items` - All items

4. **Redux State Access** (via screenAPI.useSelector):
   - Access crafting state during active crafting session
   - Read current qi, stability, completion, perfection, buffs

### HarmonyTypeConfig (for custom crafting UI)

```typescript
interface HarmonyTypeConfig {
  name: string;
  description: Translatable;
  processEffect: (harmonyData, technique, progressState, entity, state) => void;
  initEffect: (harmonyData, entity) => void;
  renderComponent: (harmonyData) => ReactNode;  // Custom UI rendering!
}
```

### CraftingState Structure (from afnm-types)

```typescript
interface ProgressState {
  pool: number;           // Current qi/pool
  stability: number;      // Current stability
  maxStability: number;   // Maximum stability
  completion: number;     // Current completion
  perfection: number;     // Current perfection
  toxicity?: number;      // Toxicity (alchemy)
}

interface CraftingState {
  progress: ProgressState;
  buffs: CraftingBuff[];
  condition: CraftingCondition;  // 'neutral' | 'positive' | 'negative' | etc.
}
```

### CraftingTechnique Structure

```typescript
interface CraftingTechnique {
  name: string;
  poolCost: number;        // Qi cost
  stabilityCost: number;   // Stability cost
  successChance: number;   // Base success chance
  cooldown: number;        // Cooldown turns
  effects: CraftingTechniqueEffect[];  // completion/perfection/stability gains
  type: 'fusion' | 'refine' | 'stabilize' | 'support';
}
```

## Crafting System Mechanics

### Core Resources
- **Qi (Pool)**: Energy resource, consumed by most skills
- **Stability**: Must stay >= 10 (min_stability), restored by stabilize skills
- **Completion**: Progress toward finishing the craft
- **Perfection**: Quality of the craft

### Buff System
- **Control Buff**: Multiplies control stat (affects refine skills)
- **Intensity Buff**: Multiplies intensity stat (affects fusion skills)
- Buff multipliers are read from `buff.stats.control.value` or `buff.stats.intensity.value`
- The value is a percentage bonus (e.g., 0.4 for 40%), converted to multiplier (1 + value)
- Buffs last N turns and apply to SUBSEQUENT actions (not the action that grants them)

### Max Stability Decay
- **Max stability decreases by 1 each turn** unless the skill has `noMaxStabilityLoss: true`
- Some skills can also directly modify max stability via `maxStability` effect
- The optimizer tracks current max stability separately from initial/target stability
- Skills like "Stabilize" typically have `noMaxStabilityLoss: true` to prevent decay

### Skill Categories
1. **Fusion** - Gain completion (scales with intensity)
2. **Refine** - Gain perfection (scales with control)
3. **Stabilize** - Restore stability
4. **Support** - Grant buffs or special effects

### Key Rules
- Stability must NEVER drop below 10 (min_stability)
- Max stability decreases by 1 each turn (unless skill prevents it)
- Buffs apply to the NEXT turn, not the current turn
- Gains are calculated using floor division (integer math)
- Control condition affects control-based skills (multipliers read from game data)

## Implementation Approach

### Phase 1: Core Optimizer Module
Port the Python algorithm to TypeScript:
1. `State` class with qi, stability, completion, perfection, buff tracking
2. `applySkill()` function with resource validation and gain calculation
3. `getAvailableSkills()` to filter valid actions
4. `findBestNextSkill()` using greedy or limited lookahead search

### Phase 2: Game Integration
Two approaches considered:

**Approach A: Custom Harmony Type** (Recommended)
- Create a harmony type with `renderComponent` that shows recommendations
- `processEffect` updates recommendations after each skill use
- Works within existing crafting UI

**Approach B: Lifecycle Hooks + Overlay**
- Use `onDeriveRecipeDifficulty` to detect crafting start
- Create floating overlay panel with recommendations
- More complex, requires managing overlay lifecycle

### Phase 3: UI Component
React component showing:
- Recommended next skill name
- Expected gains (completion, perfection)
- Brief reasoning (e.g., "Buff active - maximize gains")

## Algorithm Summary

### Greedy Search (Fast)
```
for each available skill:
  simulate applying skill
  score = completion_progress + perfection_progress
  track best scoring skill
return best skill
```

### Lookahead Search (Better Quality)
```
for each available skill:
  simulate applying skill
  recursively search N moves ahead
  use memoization on (qi, stability, buffs) state
  score based on final state quality
return skill leading to best final state
```

### Scoring Function
```
score = min(completion, target_completion) + min(perfection, target_perfection)

if targets_met:
  score += 100  # Large bonus for achieving the goal
  score += qi * 0.01  # Small bonus for remaining qi
  score += stability * 0.01  # Small bonus for remaining stability

penalty for exceeding targets (wasted resources): -0.5 per point over
penalty for low stability (<20): -0.1 per point below 20
```

## Build & Test

```bash
# Install dependencies
npm install

# Build mod
npm run build

# Output: dist/craftbuddy.zip

# Install: Copy zip to game's mods/ folder
# Linux: ~/.local/share/AscendFromNineMountains/mods/
# Windows: %APPDATA%/AscendFromNineMountains/mods/
```

## API Quirks & Notes

1. **Type imports**: Use `import { X } from 'afnm-types'` for game types
2. **React**: Game uses React 19, available via dependencies
3. **Redux**: State access via `screenAPI.useSelector` in screen components
4. **Translatable**: Can be plain string OR `{ _translatable: true, key: string }` format - plain strings work fine
5. **Scaling**: Effect amounts use `{ value: number, stat?: string }` format
6. **addHarmonyType**: First argument must be a `RecipeHarmonyType` ('forge' | 'alchemical' | 'inscription' | 'resonance') - cannot add custom harmony types, only override existing ones
7. **ProgressState**: Has `stability`, `completion`, `perfection`, `condition` but NOT `pool` or `maxStability`
8. **CraftingEntity**: Has `stats.pool`, `stats.maxpool`, `buffs` array
9. **CraftingState**: Has `progressState`, `player` (CraftingEntity), `recipe`, `recipeStats`
10. **onDeriveRecipeDifficulty**: Signature is `(recipe, recipeStats, gameFlags) => recipeStats` - must return CraftingRecipeStats, not difficulty

## Implementation Notes

### Build Output
- Build creates `builds/craftbuddy-1.0.0.zip`
- Contains `mod.js` (~60KB) with all optimizer logic bundled

### Integration Approach
Since custom harmony types cannot be added, CraftBuddy overrides the 'forge' harmony type to inject the recommendation panel into forge-type crafting sessions. This means:
- Works automatically during any forge crafting
- May conflict with other mods that also override forge harmony
- For other crafting types (alchemical, inscription, resonance), would need separate overrides

### Game Data Sources (NO HARDCODED VALUES)

The mod reads ALL values from the game API instead of using hardcoded defaults:

| Data | Source | API Path |
|------|--------|----------|
| Character Control stat | CraftingEntity | `entity.stats.control` |
| Character Intensity stat | CraftingEntity | `entity.stats.intensity` |
| Max Qi (Pool) | CraftingEntity | `entity.stats.maxpool` |
| Current Qi | CraftingEntity | `entity.stats.pool` |
| Current Stability | ProgressState | `progressState.stability` |
| Current Max Stability | ProgressState/GameState | `progressState.maxStability` or tracked internally |
| Current Completion | ProgressState | `progressState.completion` |
| Current Perfection | ProgressState | `progressState.perfection` |
| Current Condition | ProgressState | `progressState.condition` |
| Forecasted Conditions | ProgressState | `progressState.nextConditions` |
| Active Buffs | CraftingEntity | `entity.buffs` |
| Buff Multipliers | CraftingBuff | `buff.stats.control.value` / `buff.stats.intensity.value` |
| No Max Stability Loss | CraftingTechnique | `technique.noMaxStabilityLoss` |
| Player's Techniques | CraftingEntity | `entity.techniques` |
| Target Completion | CraftingRecipeStats | `recipeStats.completion` |
| Target Perfection | CraftingRecipeStats | `recipeStats.perfection` |
| Target Stability | CraftingRecipeStats | `recipeStats.stability` |
| Condition Multipliers | RecipeConditionEffect | `recipeStats.conditionType.conditionEffects[condition].effects` |
| All Crafting Techniques | ModAPI GameData | `window.modAPI.gameData.craftingTechniques` |
| Condition Effect Types | ModAPI GameData | `window.modAPI.gameData.recipeConditionEffects` |

### Technique Data Extraction

For each technique from `entity.techniques`, the mod extracts:
- `poolCost` - Qi cost
- `stabilityCost` - Stability cost
- `type` - fusion/refine/stabilize/support
- `noMaxStabilityLoss` - If true, prevents max stability decay this turn
- `effects[]` - Array of effects with:
  - `kind` - completion/perfection/stability/maxStability/createBuff/consumeBuff
  - `amount.value` - Base value
  - `amount.stat` - Scaling stat (control/intensity)
  - `stacks.value` - Buff duration (for createBuff)
  - `buff.name` - Buff name (for createBuff)
  - `buff.stats.control.value` - Control buff multiplier bonus (e.g., 0.4 for 40%)
  - `buff.stats.intensity.value` - Intensity buff multiplier bonus

### Debug Functions
The mod exposes debug functions via `window.craftBuddyDebug`:
- `getConfig()` - Returns current optimizer config (from game data)
- `getRecommendation()` - Returns current skill recommendation
- `getTargets()` - Returns target values (from recipe)
- `getCurrentState()` - Returns current completion/perfection/stability
- `getNextConditions()` - Returns forecasted conditions (from game)
- `getConditionEffects()` - Returns cached condition effect multipliers
- `setTargets(completion, perfection, stability?)` - Override targets for testing
- `logGameData()` - Logs all game data sources to console

## Reference Materials

- Modding Guide: https://lyeeedar.github.io/AfnmExampleMod/
- Example Mod Repo: https://github.com/Lyeeedar/AfnmExampleMod
- Python Optimizer: /home/lamim/Development/Ascend From Nine Mountains Crafting Optimizer/

## Future Improvements

- [ ] Support for mastery bonuses on techniques
- [ ] Handle toxicity for alchemy crafting
- [ ] Configurable lookahead depth
- [ ] Show full optimal rotation, not just next skill
- [ ] Settings panel for customization
- [ ] Support alchemical/inscription/resonance harmony types

## Completed Improvements (v1.0.0)

- [x] Read buff multipliers from game data (`buff.stats.control/intensity.value`)
- [x] Track max stability decay (decreases by 1 each turn unless `noMaxStabilityLoss`)
- [x] Read `noMaxStabilityLoss` flag from techniques
- [x] Read `maxStability` effect from techniques (for skills that modify max stability)
- [x] Include maxStability in memoization cache key
- [x] Display current max stability vs initial max stability in UI
- [x] **Always use fresh values** - Config is rebuilt every turn to ensure no stale data
- [x] **No caching of character stats** - baseControl, baseIntensity, maxQi read fresh each turn
- [x] **No caching of techniques** - Skills list rebuilt from entity.techniques each turn
- [x] **Track max stability decay in processEffect** - When game doesn't expose maxStability, track it ourselves after each technique use
- [x] **Forecasted conditions in lookahead** - Convert nextConditions to multipliers and use at each depth level
- [x] **Enhanced scoring function** - Bonus for meeting targets, resource efficiency, penalty for low stability

## Freshness Guarantees

The mod ensures ALL values are current on every turn:

| Value | When Updated | Source |
|-------|--------------|--------|
| Character stats (control, intensity, maxQi) | Every turn | `entity.stats` |
| Current Qi (pool) | Every turn | `entity.stats.pool` |
| Stability/Completion/Perfection | Every turn | `progressState.*` |
| Active buffs & multipliers | Every turn | `entity.buffs` |
| Available techniques | Every turn | `entity.techniques` |
| Current condition | Every turn | `progressState.condition` |
| Forecasted conditions | Every turn | `progressState.nextConditions` |
| Max stability | Every turn | `progressState.maxStability` or tracked internally |

**Key Design Decision**: The optimizer config is rebuilt from `entity` on EVERY call to `updateRecommendation()`, not cached. This ensures that if any stats, techniques, or other values change mid-craft (from equipment, buffs, or game mechanics), the optimizer always uses the current values.
