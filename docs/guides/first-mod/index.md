---
layout: default
title: Your First Mod
parent: Guides
nav_order: 1
has_children: true
description: 'Complete step-by-step tutorial for creating your first AFNM mod'
---

# Your First Mod: Tea House Tutorial

This comprehensive tutorial walks you through creating your first AFNM mod from scratch. You'll build a complete Tea House feature that uses all the core modding concepts and game systems.

## What You'll Build

By the end of this tutorial, you'll have created:

- **Custom Items** - Tea leaves and brewed teas with cultivation buffs
- **Interactive NPC** - Master Chen with dialogue trees and a shop
- **Quest Chain** - Multi-step storyline to discover and restore the tea house
- **Custom Building** - Tea house location with interactive brewing system
- **Event System** - Automatic quest distribution based on player actions

## Prerequisites

- Basic TypeScript knowledge
- AFNM game familiarity
- Text editor with TypeScript support
- Node.js and npm installed

## Tutorial Structure

The tutorial follows a **dependency-first approach** - we build foundational elements before the systems that depend on them:

### [1. Project Setup](01-project-setup.md)

Understanding mod structure, initialization order, and development workflow

### [2. Creating Items](02-creating-items.md)

Build tea items with buffs - the foundation everything else uses

### [3. Adding Characters](03-adding-characters.md)

Create Master Chen NPC with dialogue, shop, and interactions

### [4. Building Locations](04-building-locations.md)

Add the tea house building with interactive systems

### [5. Quest System](05-quest-system.md)

Create multi-step quests with events, choices, and progression

### [6. Quest Distribution](06-quest-distribution.md)

Set up triggered events to automatically give quests to players

### [7. Testing & Polish](07-testing-polish.md)

Debug your mod, handle edge cases, and add finishing touches

## Learning Path

Each step builds on the previous ones:

```
Items → Characters → Locations → Quests → Events → Testing
  ↓         ↓          ↓         ↓        ↓        ↓
Foundation  NPCs    Buildings  Stories  Triggers  Polish
```

Ready to start? Begin with [Project Setup](01-project-setup.md)!
