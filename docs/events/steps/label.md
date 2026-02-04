---
layout: default
title: Label Step
parent: Event Step Types
grand_parent: Events System
nav_order: 36
description: 'Create jump points for goto navigation'
---

# Label Step

## Introduction

The Label Step creates named jump points in events that can be targeted by [Goto Label Step](gotolabel) for non-linear flow.

## Interface

```typescript
interface LabelStep {
  kind: 'label';
  condition?: string;
  label: string;
}
```

## Properties

**`kind`** - Always `'label'`

**`label`** - Unique label name

**`condition`** (optional) - Conditional execution

## Example

```typescript
{
  kind: 'label',
  label: 'retry_point'
}
```
