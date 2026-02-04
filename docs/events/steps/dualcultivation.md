---
layout: default
title: Dual Cultivation Step
parent: Event Step Types
grand_parent: Events System
nav_order: 17
description: 'Initiate intimate cultivation sessions between partners'
---

# Dual Cultivation Step

## Introduction

The Dual Cultivation Step initiates intimate cultivation sessions between partners with compatibility testing and branching outcomes.

## Interface

```typescript
interface DualCultivationStep {
  kind: 'dualCultivation';
  condition?: string;
  character: string;
  traits: IntimateTrait[];
  success: EventStep[];
  failure: EventStep[];
}
```

## Properties

- **`kind`** - Always `'dualCultivation'`

- **`character`** - Partner character for dual cultivation

- **`traits`** - Array of intimate traits to test compatibility

- **`success`** - Steps to execute on successful cultivation

- **`failure`** - Steps to execute on failed cultivation

- **`condition`** (optional) - Conditional execution requirements

## Examples

### Basic Dual Cultivation

```typescript
{
  kind: 'dualCultivation',
  character: 'Pi Lip',
  traits: ['passionate', 'focused'],
  success: [
    { kind: 'text', text: 'Your cultivation energies harmonize perfectly.' },
    { kind: 'qi', amount: '100' }
  ],
  failure: [
    { kind: 'text', text: 'The cultivation session yields poor results.' }
  ]
}
```
