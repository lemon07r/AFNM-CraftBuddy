# AFNM-CraftBuddy - Crafting Optimizer Mod

A mod for **Ascend From Nine Mountains** that automatically calculates and displays the optimal next skill to use during crafting.

## Features

- ✅ **Mod Loaded Indicator**: Brief visual confirmation in the top-right corner when the game starts (fades after 5 seconds)
- 🔮 **Real-time Recommendations**: Shows the best skill to use based on current crafting state
- 📊 **Expected Gains**: Displays completion, perfection, and stability gains for each skill
- 💡 **Reasoning**: Explains why a skill is recommended (buff active, low stability, etc.)
- 🎯 **Target Tracking**: Monitors progress toward completion and perfection goals
- 🔄 **Alternative Options**: Shows other viable skills if you prefer a different approach
- ⚙️ **Settings Panel**: Configure lookahead depth, display options, and more
- ⌨️ **Keyboard Shortcuts**: Quick toggle for panel visibility and compact mode
- 📏 **Compact Mode**: Smaller panel for less screen obstruction

## Installation

1. Download the latest release (`afnm-craftbuddy.zip`) from [Releases](https://github.com/lemon07r/AFNM-CraftBuddy/releases)
2. Create a `mods` folder in your game installation directory (same folder as the game executable)
3. Copy the zip file to the `mods` folder - **do NOT unzip it**
4. Launch the game - the mod will be loaded automatically

**Example paths:**
- **Windows (Steam)**: `C:\Program Files (x86)\Steam\steamapps\common\Ascend From Nine Mountains\mods\`
- **Windows (Direct)**: `C:\Games\Ascend From Nine Mountains\mods\`
- **Linux (Steam)**: `~/.steam/steam/steamapps/common/Ascend From Nine Mountains/mods/`
- **Linux (Direct)**: `/path/to/AFNM_Linux/mods/`

**Verify installation:** Look for the "🔮 AFNM-CraftBuddy Loaded" indicator in the top-right corner when the game starts. It will appear briefly for 5 seconds then fade away.

## Usage

During any crafting session (forge, alchemical, inscription, or resonance), AFNM-CraftBuddy will display a recommendation panel showing:

- The recommended next skill with its type (fusion/refine/stabilize/support)
- Expected gains from using that skill
- Brief reasoning for the recommendation
- Alternative skills you could use instead

### Keyboard Shortcuts

- **Ctrl+Shift+C** - Toggle panel visibility
- **Ctrl+Shift+M** - Toggle compact mode

### Settings Panel

Click the gear icon (⚙️) on the recommendation panel to access settings:

- **Lookahead Depth** (1-6): Higher values give better recommendations but are slower
- **Compact Mode**: Show only essential information
- **Show Rotation**: Display suggested skill sequence
- **Show Final State**: Display projected outcome
- **Show Conditions**: Display upcoming crafting conditions
- **Max Alternatives**: Number of alternative skills to show (0-5)

Settings are automatically saved and persist between sessions.

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

// View/modify settings
window.craftBuddyDebug.getSettings()
window.craftBuddyDebug.setLookaheadDepth(4)  // 1-6
window.craftBuddyDebug.togglePanel()         // Toggle visibility
window.craftBuddyDebug.toggleCompact()       // Toggle compact mode

// Log all game data sources to console
window.craftBuddyDebug.logGameData()

// Check for mod conflicts
window.craftBuddyDebug.getConflicts()    // View detected conflicts
window.craftBuddyDebug.checkConflicts()  // Manually check for conflicts
```

## Building from Source

```bash
# Install dependencies
npm install

# Build the mod
npm run build

# Output: builds/afnm-craftbuddy-x.x.x.zip
```

## How It Works

CraftBuddy ports the algorithm from the [Python Crafting Optimizer](../Ascend%20From%20Nine%20Mountains%20Crafting%20Optimizer/) to TypeScript and integrates it directly into the game's crafting UI.

The optimizer uses a **lookahead search** algorithm that:
1. Evaluates all available skills using move ordering (promising skills first)
2. Simulates applying each skill
3. Recursively searches several moves ahead
4. Uses memoization to avoid redundant calculations
5. Scores states based on progress toward targets
6. Detects conflicts with other mods that override harmony types

## Technical Details

- Built with TypeScript, React, and Material-UI
- Uses the AFNM ModAPI for game integration
- Overrides all harmony types (forge, alchemical, inscription, resonance) to inject the recommendation panel
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

- May conflict with other mods that override harmony types (conflict detection will warn you)
- Equipment bonuses and realm modifiers are detected and logged but may vary by game version

## License

MIT License - See LICENSE file for details

## Credits

- Author: [lemon07r](https://github.com/lemon07r)
- Based on the Python Crafting Optimizer tool
- Uses the [AFNM Example Mod](https://github.com/Lyeeedar/AfnmExampleMod) template
- Game: [Ascend From Nine Mountains](https://store.steampowered.com/app/1843760/Ascend_From_Nine_Mountains/)
