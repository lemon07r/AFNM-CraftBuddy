# AFNM-CraftBuddy - Crafting Optimizer Mod

A mod for **Ascend From Nine Mountains** that calculates and displays the recommended next crafting action.

## Features

- Real-time recommendation for the next action during crafting
- Expected completion/perfection/stability gain preview
- Effective qi/stability cost preview (current + follow-up), condition/buff/harmony aware
- Alternative action suggestions
- Lookahead search with presets and manual performance controls
- Condition forecast awareness and probabilistic branching beyond forecast queue
- Harmony-aware simulation for sublime crafts
- Buff/mastery-aware simulation
- Large-number-safe parsing and formatting for late-game values
- Snapshot export for bug reports and replayable optimizer debugging

![CraftBuddy Workshop Preview](pictures/workshop_preview.png)

## Installation

### Steam Workshop (Recommended)

Subscribe on the [Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3661729323).

### Manual Install

1. Download the latest release (`afnm-craftbuddy.zip`) from [Releases](https://github.com/lemon07r/AFNM-CraftBuddy/releases)
2. Create a `mods` folder in your game install directory (same folder as the game executable)
3. Copy the zip file into `mods` (do not unzip)
4. Launch the game

## Usage

During crafting (forge/alchemical/inscription/resonance), the panel shows:

- recommended next action
- expected gains
- brief reasoning
- alternatives

![CraftBuddy GUI](pictures/gui.png)

### Keyboard shortcuts

- `Ctrl+Shift+C`: toggle panel visibility
- `Ctrl+Shift+M`: toggle compact mode
- `Ctrl+Shift+Y`: export optimizer replay snapshot (clipboard first, download fallback)

### Settings

![CraftBuddy Settings](pictures/settings.png)

- The settings view opens as a dedicated slide-over panel face inside CraftBuddy, instead of expanding the panel footprint
- Search presets: `Instant`, `Fast`, `Balanced` (default), `High Accuracy`, `Max`
- `Lookahead Depth` (`1-96`, default `64`)
- `Search Time Budget` (`100-10,000ms`, default `4,500ms`)
- `Search Max Nodes` (`1,000-5,000,000`, default `2,000,000`)
- `Search Beam Width` (`3-20`, default `8`)
- display controls (rotation/final state/conditions/alternatives)

If you are unsure, use a preset. Presets overwrite all four search sliders together and keep them in safer ratios.

Depth, time, nodes, and beam width are coupled search-budget controls: pushing one much higher than the others can waste search and sometimes reduce recommendation quality. Search stops when either the time budget or node budget is hit first, and exact results vary somewhat by craft complexity and machine speed because the time budget is wall-clock based. Manual slider changes apply when you release the slider.

## Local Workshop Publish

If the sibling uploader repo is available at `../ModUploader-AFNM`, you can publish the current build directly from this repo:

```bash
bun run workshop:upload -- --change-note "What changed"
```

That rebuilds CraftBuddy, prepares `ModUploader-AFNM`, and updates workshop item `3661729323`. Steam must be running and logged in locally.

## Debug helpers

### Enabling Game Dev Mode

To access browser devtools (F12) in the game, create an empty file called `devMode` (case-sensitive) in your game installation directory, next to the game executable:

```
AFNM_Linux/                              # or Windows equivalent
├── AscendFromNineMountains              # Game executable
├── devMode                              # ← Empty file, no extension
└── mods/
    └── afnm-craftbuddy.zip
```

Restart the game after creating this file.

### Debug Console Commands

Open browser devtools and use:

```javascript
window.craftBuddyDebug.getConfig();
window.craftBuddyDebug.getRecommendation();
window.craftBuddyDebug.getTargets();
window.craftBuddyDebug.getCurrentState();
window.craftBuddyDebug.getNextConditions();
window.craftBuddyDebug.getConditionEffects();
window.craftBuddyDebug.setTargets(completion, perfection, stability);
window.craftBuddyDebug.getSettings();
window.craftBuddyDebug.setLookaheadDepth(32);
window.craftBuddyDebug.togglePanel();
window.craftBuddyDebug.toggleCompact();
window.craftBuddyDebug.logGameData();
window.craftBuddyDebug.getDiagnostics();
window.craftBuddyDebug.getDiagnosticsSummary();
window.craftBuddyDebug.dumpOptimizerReplaySnapshot();
```

## Build and test

```bash
bun install
bun run build
bun run test
```

Output zip: `builds/afnm-craftbuddy.zip`

## How it works

- Integration layer (`src/modContent/index.ts`) reads crafting state from game/Redux, with DOM/cache fallback paths for resilience.
- Optimizer (`src/optimizer/*`) simulates candidate actions and runs lookahead search.
- Search combines deterministic simulation with expected-value modeling for probabilistic outcomes.
- UI (`src/ui/*`) renders recommendation + alternatives.

## Technical notes

- TypeScript + React + Material UI
- Uses AFNM ModAPI hooks (including `onDeriveRecipeDifficulty`) and runtime state extraction
- Includes harmony simulation and training-mode-aware scoring behavior
- Includes docs health scripts (`bun run docs:check`)

## Data accuracy policy

CraftBuddy prefers direct game data when available and uses documented fallback logic only when specific fields are missing.

## Known limitations

- Native game APIs are used where available (scaling, overcrit, can-use-action, caps) with guarded fallback paths for resilience; fallback code may drift if upstream mechanics change
- Some mechanics still await API exposure (canonical post-modifier cost preview helpers, stable `getNextCondition` path); cost previews currently use internal runtime modeling/parity checks — see `docs/dev-requests/STATUS.md`
- Fallback extraction paths are used when complete runtime state is unavailable

## Documentation

- Authoritative project docs: `docs/project/`
- Dev API request tracking: `docs/dev-requests/`
- Historical snapshots: `docs/history/`
- Curated AFNM reference subset: `docs/reference/`
- Archived full reference/deprecated snapshots: `archive/` (traceability only)
- Agent entrypoint: `docs/project/START_HERE_FOR_AGENTS.md`

## License

MIT License
