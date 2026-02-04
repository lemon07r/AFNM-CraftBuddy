---
layout: default
title: Advance Guild Rank Step
parent: Event Step Types
grand_parent: Events System
nav_order: 4
description: 'Promote player to the next rank within a guild'
---

# Advance Guild Rank Step

## Introduction

The Advance Guild Rank Step promotes the player to the next rank within a specified guild, forming a core part of guild progression systems. This step handles rank promotions, unlocks new guild features and shops, and resets guild approval back to zero for the next promotion cycle.

Guild ranks define the player's standing within organizations and affect available interactions, shop items, and story content. Each guild has its own progression path with meaningful rank names and associated benefits.

## Interface

```typescript
interface AdvanceGuildRankStep {
  kind: 'advanceGuildRank';
  condition?: string;
  guild: string;
}
```

## Properties

### Required Properties

**`kind`** - Always `'advanceGuildRank'`

- Identifies this as a guild rank advancement step

**`guild`** - Guild identifier

- String matching the guild's unique name

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must be true for promotion to occur
- Step is skipped if condition fails
- Useful for additional promotion requirements beyond the standard system

## Guild System Overview

### How Guild Ranks Work

1. **Rank Progression**: Players start at rank 0 and advance through numbered ranks
2. **Approval System**: Players earn approval through completed quests and activities
3. **Promotion Requirements**: Each rank requires a certain approval threshold
4. **Rank Benefits**: Higher ranks unlock new shop items, interactions, and content
5. **Rank Reset**: Upon promotion, approval resets to 0 for the next cycle

### Automatic Effects

When this step executes, it automatically:

- Increases the player's rank by 1 for the specified guild
- Resets guild approval to 0 (starting fresh for next promotion)
- Displays a promotion message with the new rank title
- Unlocks new guild features based on the new rank

## Basic Examples

### Simple Guild Promotion

```typescript
{
  kind: 'advanceGuildRank',
  guild: 'Celadon Flame Brewers'
}
```
