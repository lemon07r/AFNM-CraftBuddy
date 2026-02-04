---
layout: default
title: Add Guild Approval Step
parent: Event Step Types
grand_parent: Events System
nav_order: 5
description: 'Add approval points to specific guilds'
---

# Add Guild Approval Step

## Introduction

The Add Guild Approval Step increases a player's approval rating with specific guilds in AFNM. Guild approval represents standing, reputation, and respect within an organization, affecting access to guild-specific benefits like shops, quests, and promotions.

This step is essential for implementing guild progression systems, quest rewards that build faction reputation, and any content where players need to earn their way through guild hierarchies.

## Interface

```typescript
interface AddGuildApprovalStep {
  kind: 'addGuildApproval';
  condition?: string;
  guild: string;
  amount: string;
}
```

## Properties

### Required Properties

**`kind`** - Always `'addGuildApproval'`

- Identifies this as a guild approval addition step

**`guild`** - Guild name to modify approval for

- Must match an existing guild name exactly

**`amount`** - Approval points to add

- String expression that evaluates to the number of approval points

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must be true for approval to be added
- Step is skipped if condition fails
- Useful for conditional rewards based on player actions or state

## Basic Examples

### Simple Mission Reward

```typescript
{
  kind: 'addGuildApproval',
  guild: 'Immortal Fang Society',
  amount: '3'
}
```
