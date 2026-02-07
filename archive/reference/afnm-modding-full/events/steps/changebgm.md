---
layout: default
title: Change BGM Step
parent: Event Step Types
grand_parent: Events System
nav_order: 17
description: 'Override location-based background music with specific tracks'
---

# Change BGM Step

## Introduction

The Change BGM Step overrides the game's location-based background music system with a specific music track for the duration of an event sequence. This step is essential for creating atmospheric moments, enhancing dramatic scenes, and providing appropriate musical accompaniment for special encounters in your cultivation world.

Use this step to set the mood for important story beats, combat encounters, character interactions, or exploration sequences that require specific musical atmosphere beyond what the default location music provides.

## Interface

```typescript
interface ChangeBGMStep {
  kind: 'changeBGM';
  condition?: string;
  bgm: MusicName;
}
```

## Properties

### Required Properties

**`kind`** - Always `'changeBGM'`

- Identifies this as a background music change step

**`bgm`** - Music track to play

- Must be a valid `MusicName` from the game's music library, or one added via the `window.modAPI.action.addBGM` function
- Overrides location-based music until cleared or event ends
- See [Available Music Names](#available-music-names) for complete list

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must be true for the music change to occur
- Step is skipped if condition fails
- Useful for context-sensitive music based on player state or story progress

## Basic Examples

### Simple Music Override

```typescript
{
  kind: 'changeBGM',
  bgm: 'Combat'
}
```
