---
layout: default
title: Exit Step
parent: Event Step Types
grand_parent: Events System
nav_order: 25
description: 'Exit the current event immediately'
---

# Exit Step

## Introduction

The Exit Step immediately terminates the current event, useful for conditional early exits and branching logic.

## Interface

```typescript
interface ExitStep {
  kind: 'exit';
  condition?: string;
}
```

## Properties

**`kind`** - Always `'exit'`

**`condition`** (optional) - Conditional execution

## Example

```typescript
{
  kind: 'exit',
  condition: 'questCompleted == 1'
}
```

```typescript
// Early exit to avoid nested branching
[
  {
    kind: 'combat',
    enemies: [ratascar],
    victory: [],
    defeat: [
      {
        kind: 'text',
        text: 'You flee, barely escaping with your life.',
      },
      {
        kind: 'exit',
      },
    ],
  },
  {
    kind: 'text',
    text: 'You triumph over the beast.',
  },
  //... Event continues for the victory branch
];
```
