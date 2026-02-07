---
layout: default
title: Speech Step
parent: Event Step Types
grand_parent: Events System
nav_order: 2
description: 'Character dialogue and conversations'
---

# Speech Step

Creates character dialogue by displaying text attributed to a specific character.

## Interface

```typescript
interface SpeechStep {
  kind: 'speech';
  condition?: string;
  character: string;
  text: string;
}
```

## Properties

**`kind`** - Always `'speech'`

**`character`** - Name of the speaking character. Must match the character name as defined in your mod.

**`text`** - The dialogue content. Supports HTML formatting and templates like `{forename}`, `{surname}`, `{fullname}`, and gender-specific text using `{male option|female option}`.

**`condition`** _(optional)_ - Flag expression that must evaluate to true for the speech to occur.

## Examples

### Basic Dialogue

```typescript
{
  kind: 'speech',
  character: 'Elder Chen',
  text: `"Welcome to our humble sect, young cultivator. Your journey begins now."`
}
```

### Multi-Character Conversation

```typescript
[
  {
    kind: 'speech',
    character: 'Elder Li',
    text: `"Welcome to our sect. Disciple Wang will show you around."`,
  },
  {
    kind: 'speech',
    character: 'Disciple Wang',
    text: `"Master, should I show them to the training grounds first?"`,
  },
  {
    kind: 'speech',
    character: 'Elder Li',
    text: `"Yes, and make sure they understand our rules."`,
  },
];
```

### Using Templates

```typescript
{
  kind: 'speech',
  character: 'Sect Recruiter',
  text:  `"Welcome to our ranks, {young man/young lady}. Training begins at dawn."`
}
```

```typescript
{
  kind: 'speech',
  character: 'Pi Lip',
  text:  `"Great to see you {forename}"`
}
```
