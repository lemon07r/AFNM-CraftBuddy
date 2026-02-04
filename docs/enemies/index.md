---
layout: default
title: Enemies
nav_order: 7
has_children: true
permalink: /enemies
---

# Enemy Entities

This section covers the implementation of enemy entities in Ascend from Nine Mountains. Learn how to transform your enemy concepts into working combat encounters using the game's stance and rotation systems.

## Overview

Enemy entities in AFNM represent all hostile combatants that players encounter throughout their cultivation journey. This documentation focuses on helping you transform your enemy concepts into working implementations using the game's stance and rotation systems.

## Core Systems

### Entity Structure

Every enemy follows a consistent structure defined by the `EnemyEntity` interface, which includes combat stats, stance rotations, and conditional behaviors.

### Stance System

Enemies cycle through stances containing technique sequences, using rotation rules and conditional overrides to create dynamic combat patterns.

### Implementation Focus

The documentation emphasizes practical implementation details, showing how to build setup rounds, phase transitions, and adaptive behaviors.

## Quick Navigation

- [Enemy Structure](enemy-structure.md) - Detailed breakdown of the EnemyEntity interface
- [Design Guide](design-guide.md) - Transform concepts into working enemy implementations
- [Behavior Patterns](behavior-patterns.md) - Stance rotations and AI behavior
- [Examples](examples.md) - Complete enemy implementation examples

## Key Implementation Concepts

### Rotation Overrides

Use `rotationOverrides` with `repeatable: false` to create setup rounds and one-time behaviors.

### Conditional Logic

Stance switches based on health, round count, buffs, or other combat state using mathematical expressions.

### Pattern Building

Combine cyclic rotations, random selections, and conditional overrides to create complex behaviors.

## Enemy Registration

Enemies are not directly registered through the ModAPI. Instead, they are integrated into the game through events and locations:

### Integration Methods

- **Event Combat Steps**: Use `combat` event steps to trigger enemy encounters
- **Location Enemies**: Add enemies to locations as exploration encounters or specific combat events
- **Quest Integration**: Incorporate enemies into quest objectives and storylines

See the [Events](../events/) documentation for combat step implementation and [Locations](../locations/) for enemy placement strategies.

## Getting Started

To implement your enemy concept:

1. Review the [Enemy Structure](enemy-structure.md) for the interface definition
2. Use the [Design Guide](design-guide.md) to translate your concept into stance rotations
3. Study [Behavior Patterns](behavior-patterns.md) for advanced conditional logic
4. Check [Examples](examples.md) for complete implementations
5. Integrate your enemy through [Events](../events/) or location encounters
