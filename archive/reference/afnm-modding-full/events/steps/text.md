---
layout: default
title: Text Step
parent: Event Step Types
grand_parent: Events System
nav_order: 1
description: 'Display narrative text and descriptions'
---

# Text Step

Displays narrative text, descriptions, and atmospheric details to create immersive storytelling experiences.

## Interface

```typescript
interface TextStep {
  kind: 'text';
  condition?: string;
  text: string;
  sfx?: SoundEffectName;
}
```

## Properties

**`kind`** - Always `'text'`

**`text`** - The content to display. Supports HTML formatting and templates like `{forename}`, `{surname}`, `{fullname}`, and gender-specific text using `{male option|female option}`.

**`condition`** _(optional)_ - Flag expression that must evaluate to true for the step to execute.

**`sfx`** _(optional)_ - Sound effect to play when text appears.

## Examples

### Basic Text

```typescript
{
  kind: 'text',
  text: 'You stride towards the edge of the bubbling lake, heat rising with each step.'
}
```

### Using Templates

```typescript
{
  kind: 'text',
  text: 'Welcome to our sect, {forename}. You are regarded as a promising {young man/young woman} with great potential.'
}
```
