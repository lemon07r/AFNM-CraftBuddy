# AFNM-CraftBuddy - Improvements Checklist

This document tracks planned improvements and their implementation status.

## High Priority - Core Functionality

- [x] **Support alchemical/inscription/resonance harmony types** - ✅ Now registers for all four harmony types (forge, alchemical, inscription, resonance)
- [x] **Handle toxicity for alchemy crafting** - ✅ Tracks toxicity, reads toxicityCost from techniques, supports cleanseToxicity effect, UI shows toxicity with warnings
- [x] **Support for mastery bonuses on techniques** - ✅ Reads mastery array from techniques (control, intensity, poolcost, stabilitycost, critchance, critmultiplier bonuses)

## Medium Priority - Enhanced Features

- [x] **Show full optimal rotation, not just next skill** - ✅ Displays suggested rotation (up to 5 skills) with arrows between them
- [x] **Configurable lookahead depth** - ✅ Settings panel allows adjusting search depth (1-6, default: 3)
- [x] **Settings panel for customization** - ✅ In-game settings panel with lookahead depth, display options, and reset button
- [x] **Handle technique cooldowns** - ✅ Reads currentCooldown from techniques, tracks cooldowns in state, prevents using skills on cooldown

## Lower Priority - Polish & UX

- [x] **Visual indicator for buff-consuming skills** - ✅ Shows "⚡ Uses Buff" chip when Disciplined Touch or similar skills are recommended
- [x] **Show expected final state** - ✅ Displays projected completion/perfection/stability after following the rotation
- [x] **Keyboard shortcut to toggle panel** - ✅ Ctrl+Shift+C toggles panel visibility, Ctrl+Shift+M toggles compact mode
- [x] **Compact mode for UI** - ✅ Smaller panel showing only essential info (skill name, gains, progress)
- [x] **Color-coded skill recommendations** - ✅ Quality ratings (0-100%) with color coding from green (optimal) to red (poor)

## Technical Improvements

- [ ] **Unit tests for optimizer logic** - Test state transitions, scoring, and search algorithms
- [ ] **Performance optimization for deep lookahead** - Consider iterative deepening or alpha-beta pruning for deeper searches
- [ ] **Handle edge cases** - Skills with special conditions, equipment bonuses, realm-specific modifiers
- [ ] **Conflict detection with other mods** - Warn if another mod also overrides the same harmony type

---

## What's Already Working (v1.3.0)

- ✅ Reads all character stats from game (control, intensity, qi, maxtoxicity)
- ✅ Reads all technique data from game (costs, effects, scaling, cooldowns, mastery)
- ✅ Reads buff multipliers from game data
- ✅ Tracks max stability decay per turn
- ✅ Uses forecasted conditions in lookahead search
- ✅ Fresh values every turn (no stale data)
- ✅ Enhanced scoring with target bonuses and resource efficiency
- ✅ React UI panel with recommendations and alternatives
- ✅ **All harmony types supported** (forge, alchemical, inscription, resonance)
- ✅ **Toxicity tracking** for alchemy crafting with UI display
- ✅ **Mastery bonuses** applied to skill calculations
- ✅ **Cooldown tracking** prevents recommending skills on cooldown
- ✅ **Optimal rotation display** shows suggested sequence of skills
- ✅ **Expected final state** shows projected outcome after rotation
- ✅ **Quality ratings** color-coded skill alternatives (0-100%)
- ✅ **Buff consumer indicator** highlights skills that use active buffs
- ✅ **Settings panel** with configurable lookahead depth and display options
- ✅ **Keyboard shortcuts** Ctrl+Shift+C (toggle panel), Ctrl+Shift+M (compact mode)
- ✅ **Compact mode** smaller panel for less screen obstruction
- ✅ **Persistent settings** saved to localStorage
