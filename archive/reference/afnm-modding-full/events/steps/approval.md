---
layout: default
title: Approval Step
parent: Event Step Types
grand_parent: Events System
nav_order: 12
description: "Modify character's approval rating toward player"
---

# Approval Step

## Introduction

The Approval Step modifies a character's approval rating toward the player, forming the foundation of relationship progression in AFNM. It handles approval gains from helpful actions, quest completions, and thoughtful choices, as well as approval losses from poor decisions or conflicting values.

This step is essential for creating meaningful character relationships where player actions have lasting consequences on how NPCs perceive and interact with them throughout their cultivation journey.

## Interface

```typescript
interface ApprovalStep {
  kind: 'approval';
  condition?: string;
  character: string;
  amount: string;
}
```

## Properties

### Required Properties

**`kind`** - Always `'approval'`

- Identifies this as an approval modification step

**`character`** - Character name

- String identifying which character's approval changes
- Must reference an existing character in the game

**`amount`** - Approval change expression

- String expression that evaluates to the approval amount to add or remove

### Optional Properties

**`condition`** - Conditional execution

- [Flag expression](../../concepts/flags) that must be true for approval change to occur
- Step is skipped if condition fails
- Useful for conditional approval based on player actions or character state

## Basic Examples

### Quest Completion Reward

```typescript
{
  kind: 'approval',
  character: 'Lingxi Gian',
  amount: '4'
}
```

### Disapproval from Poor Choice

```typescript
{
  kind: 'approval',
  character: 'Master Chen',
  amount: '-2'
}
```
