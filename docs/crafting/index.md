---
layout: default
title: Crafting System
nav_order: 5
has_children: true
description: 'Documentation for the AFNM crafting system'
---

# Crafting System

The crafting system in Ascend from Nine Mountains allows cultivators to create pills, forge weapons, inscribe formations, weave robes, prepare spiritual cuisine, and refine artifacts. Each crafting discipline offers unique mechanics, challenges, and rewards that complement the cultivation journey.

## Overview

Crafting is an essential part of progression, providing:

- **Equipment** for combat and cultivation
- **Consumables** for healing and buffs
- **Materials** for further crafting
- **Income** through market sales
- **Reputation** with crafting halls and sects

## Core Concepts

### Technique Types

Four core technique types that drive all crafting:

- **Fusion** - Increases completion progress
- **Refine** - Increases perfection progress
- **Stabilize** - Restores stability and creates stability buffs
- **Support** - Creates helpful buffs and utility effects

### Resource Management

- **Qi Pool** - Primary resource spent on techniques
- **Current Stability** - Active stability that depletes with technique use
- **Max Stability** - Upper limit for current stability (also depletes unless protected)
- **Toxicity** - Accumulates from certain techniques and items

**Understanding Stability:**
- Most techniques reduce BOTH current and max stability when used
- Current reaching 0 = craft failure
- Max stability sets the ceiling for current stability
- The `noMaxStabilityLoss` flag on techniques preserves max (only current drops)
- Different effects target current vs max separately

## Key Systems

### [Buffs](buffs.md)

Temporary states and conditions affecting the crafting process

### [Techniques](techniques.md)

Active abilities used during crafting to manipulate materials and outcomes
