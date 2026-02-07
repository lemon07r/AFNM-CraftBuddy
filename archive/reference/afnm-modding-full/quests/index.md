---
layout: default
title: Quest System
nav_order: 6
has_children: true
description: 'Documentation for the AFNM quest system'
---

# Quest System

The quest system provides structured storylines, character development, and progression goals that guide players through their cultivation journey.

## Documentation

### [Quest Structure](quest-structure.md)
Quest interfaces, categories, rewards, and failure conditions

### [Quest Steps](quest-steps.md)
All 8 quest step types with usage patterns and examples


### [Quest Examples](examples.md)
Complete, annotated quest implementations

## Quick Reference

### Quest Categories
- **`main`** - Core storyline progression
- **`side`** - Optional character stories and world building
- **`missionHall`** - Sect-based combat and exploration missions
- **`craftingHall`** - Artisan skill development and technique learning
- **`requestBoard`** - Community-driven tasks with quick turnaround
- **`guild`** - Organization-specific storylines and advancement

### Step Types
- **`event`** - Interactive storylines with dialogue and choices
- **`condition`** - Wait for specific game state conditions
- **`collect`** - Gather items or resources
- **`kill`** - Defeat specific enemies
- **`missionHall`** - Complete sect missions
- **`speakToCharacter`** - Have conversations with NPCs
- **`flagValue`** - Wait for flag to reach target value
- **`wait`** - Time-based delays for story pacing

### Event System Integration

Quests are tightly integrated with the [Event System](../events/):
- Event steps contain full [GameEvents](../events/events.md)
- Completion conditions often use [EventStep flags](../events/events.md#setflagstep)
- Events can [add quests](../events/events.md#addqueststep) to start storylines