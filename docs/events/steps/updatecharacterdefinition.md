---
layout: default
title: Update Character Definition Step
parent: Event Step Types
grand_parent: Events System
nav_order: 78
description: 'Force re-evaluation of character definitions and switch active character state'
---

# Update Character Definition Step

## Introduction

The Update Character Definition Step forces re-evaluation of which character definition should be active for a character based on current flag conditions. Characters can have multiple definitions with different behaviors, and this step ensures they switch to the appropriate definition when game state changes.

## Interface

```typescript
interface UpdateCharacterDefinitionStep {
  kind: 'updateCharacterDefinition';
  condition?: string;
  character: string;
}
```

## Properties

**`kind`** - Always `'updateCharacterDefinition'`

**`character`** - Name of the character to update

- Must reference an existing character by name
- The character must have multiple definitions with varying conditions
- Triggers re-evaluation of which definition should be active

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for the update to occur
- Step is skipped if condition fails

## Examples

### Quest Progression Update

```typescript
[
  {
    kind: 'flag',
    flag: 'forgeSpiritCoreGiven',
    value: '1',
    global: true,
  },
  {
    kind: 'updateCharacterDefinition',
    character: 'Forge Spirit',
  },
];
```

### Character Evolution

```typescript
[
  {
    kind: 'flag',
    flag: 'juniorDiscipleAdvanced',
    value: '1',
    global: true,
  },
  {
    kind: 'updateCharacterDefinition',
    character: 'Junior Disciple',
  },
];
```
