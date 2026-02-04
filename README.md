# AFNM-CraftBuddy - Crafting Optimizer Mod

A mod for **Ascend From Nine Mountains** that automatically calculates and displays the optimal next skill to use during crafting.

## Features

- 🔮 **Real-time Recommendations**: Shows the best skill to use based on current crafting state
- 📊 **Expected Gains**: Displays completion, perfection, and stability gains for each skill
- 💡 **Reasoning**: Explains why a skill is recommended (buff active, low stability, etc.)
- 🎯 **Target Tracking**: Monitors progress toward completion and perfection goals
- 🔄 **Alternative Options**: Shows other viable skills if you prefer a different approach

## Installation

1. Download the latest release (`afnm-craftbuddy-x.x.x.zip`) from [Releases](https://github.com/lemon07r/AFNM-CraftBuddy/releases)
2. Copy the zip file to your game's mods folder:
   - **Linux**: `~/.local/share/AscendFromNineMountains/mods/`
   - **Windows**: `%APPDATA%/AscendFromNineMountains/mods/`
3. Launch the game - the mod will be loaded automatically

## Usage

During any crafting session (forge, alchemical, inscription, or resonance), AFNM-CraftBuddy will display a recommendation panel showing:

- The recommended next skill with its type (fusion/refine/stabilize/support)
- Expected gains from using that skill
- Brief reasoning for the recommendation
- Alternative skills you could use instead

### Debug Console Commands

Open the browser console (F12) to use these debug functions:

```javascript
// View current optimizer config (from game data)
window.craftBuddyDebug.getConfig()

// View current recommendation
window.craftBuddyDebug.getRecommendation()

// View targets (from recipe)
window.craftBuddyDebug.getTargets()

// View current crafting state
window.craftBuddyDebug.getCurrentState()

// View forecasted conditions (from game)
window.craftBuddyDebug.getNextConditions()

// View condition effect multipliers
window.craftBuddyDebug.getConditionEffects()

// Set custom targets for testing
window.craftBuddyDebug.setTargets(completion, perfection, stability)

// Log all game data sources to console
window.craftBuddyDebug.logGameData()
```

## Building from Source

```bash
# Install dependencies
npm install

# Build the mod
npm run build

# Output: builds/craftbuddy-x.x.x.zip
```

## How It Works

CraftBuddy ports the algorithm from the [Python Crafting Optimizer](../Ascend%20From%20Nine%20Mountains%20Crafting%20Optimizer/) to TypeScript and integrates it directly into the game's crafting UI.

The optimizer uses a **lookahead search** algorithm that:
1. Evaluates all available skills
2. Simulates applying each skill
3. Recursively searches several moves ahead
4. Uses memoization to avoid redundant calculations
5. Scores states based on progress toward targets

## Technical Details

- Built with TypeScript, React, and Material-UI
- Uses the AFNM ModAPI for game integration
- Overrides the 'forge' harmony type to inject the recommendation panel
- Hooks into `onDeriveRecipeDifficulty` to capture crafting targets

## Game Data Integration

CraftBuddy reads **all values directly from the game** - no hardcoded assumptions:

- **Character Stats**: Control, intensity, max Qi from `entity.stats`
- **Techniques**: All available skills from `entity.techniques` with costs, effects, and scaling
- **Buff Multipliers**: Read from active buff stats (e.g., `buff.stats.control.value`)
- **Condition Effects**: Multipliers from `recipeStats.conditionType.conditionEffects`
- **Recipe Targets**: Completion, perfection, stability from `recipeStats`
- **Forecasted Conditions**: Upcoming conditions from `progressState.nextConditions`
- **Max Stability Decay**: Tracks decay each turn, respects `noMaxStabilityLoss` flag

## Limitations

- May conflict with other mods that override harmony types
- Some edge cases (special conditions, equipment bonuses) may not be fully handled

## License

MIT License - See LICENSE file for details

## Credits

- Author: [lemon07r](https://github.com/lemon07r)
- Based on the Python Crafting Optimizer tool
- Uses the [AFNM Example Mod](https://github.com/Lyeeedar/AfnmExampleMod) template
- Game: [Ascend From Nine Mountains](https://store.steampowered.com/app/1843760/Ascend_From_Nine_Mountains/)
