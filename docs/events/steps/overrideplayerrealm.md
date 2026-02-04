---
layout: default
title: Override Player Realm Step
parent: Event Step Types
grand_parent: Events System
nav_order: 91
description: "Temporarily override player's cultivation realm for game systems"
---

# Override Player Realm Step

## Introduction

The Override Player Realm Step temporarily overrides the player's cultivation realm for game systems without affecting actual cultivation progress. This allows for narrative based advancement in shops without a true breakthrough.

## Interface

```typescript
interface OverridePlayerRealmStep {
  kind: 'overridePlayerRealm';
  condition?: string;
  realm: Realm;
}
```

## Properties

**`kind`** - Always `'overridePlayerRealm'`

**`realm`** - Target realm to override to

- Must be a valid `Realm` type value
- Affects all game systems that check player realm

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for override to activate

## Examples

```typescript
{
  kind: 'overridePlayerRealm',
  realm: 'coreFormation'
}
```
