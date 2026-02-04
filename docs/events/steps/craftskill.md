---
layout: default
title: Craft Skill Step
parent: Event Step Types
grand_parent: Events System
nav_order: 25
description: "Increase player's craft skill"
---

# Craft Skill Step

## Introduction

The Craft Skill Step increases the player's craft skill.

## Interface

```typescript
interface CraftSkillStep {
  kind: 'craftSkill';
  condition?: string;
  amount: string;
}
```

## Properties

**`kind`** - Always `'craftSkill'`

**`amount`** - Skill increase expression

- String expression that evaluates to the craft skill amount to add

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for skill gain to occur
- Step is skipped if condition fails

## Examples

```typescript
{
  kind: 'craftSkill',
  amount: '3'
}
```
