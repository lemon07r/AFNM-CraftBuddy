---
layout: default
title: Goto Label Step
parent: Event Step Types
grand_parent: Events System
nav_order: 37
description: 'Jump to labeled points in events'
---

# Goto Label Step

## Introduction

The Goto Label Step jumps to a previously defined label in the event, enabling loops and non-linear event flow. See [Label Step](label) for details on setting a label.

## Interface

```typescript
interface GotoLabelStep {
  kind: 'gotoLabel';
  condition?: string;
  label: string;
}
```

## Properties

**`kind`** - Always `'gotoLabel'`

**`label`** - Target label name

**`condition`** (optional) - Conditional execution

## Example

```typescript
{
  kind: 'gotoLabel',
  label: 'retry_point',
  condition: 'attempts < 3'
}
```
