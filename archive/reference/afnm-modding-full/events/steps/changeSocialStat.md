---
layout: default
title: Change Social Statistic Step
parent: Event Step Types
grand_parent: Events System
nav_order: 48
description: "Increase player's Social statistics"
---

# Change Social Statistic Step

## Introduction

The Change Social Statistic Step modifies the players Social statistics (lifespan, battlesense, charisma, etc)

## Interface

```typescript
interface ChangeSocialStatStep {
  kind: 'changeSocialStat';
  condition?: string;
  stat: SocialStatistic;
  amount: string;
}
```

## Properties

**`kind`** - Always `'changeSocialStat'`

**`amount`** - Amount change expression

- String expression that evaluates to the amount to add or remove (if negative)

**`stat`** - The stat to modify. Must be one of `age`,`lifespan`,`charisma`,`battlesense`,`craftskill`,`artefactslots`,`talismanslots`,`condenseEfficiency`,`pillsPerRound`

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for change to occur
- Step is skipped if condition fails

## Examples

```typescript
{
  kind: 'changeSocialStat',
  stat: 'lifespan',
  amount: '-50'
}
```
