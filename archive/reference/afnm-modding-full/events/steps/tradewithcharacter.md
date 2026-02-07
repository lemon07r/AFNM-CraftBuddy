---
layout: default
title: Trade With Character Step
parent: Event Step Types
grand_parent: Events System
nav_order: 19
description: 'Open trading interface with specific character'
---

# Trade With Character Step

## Introduction

Opens the trading interface with a specific character.

## Interface

```typescript
interface TradeWithCharacterStep {
  kind: 'tradeWithCharacter';
  condition?: string;
  character: string;
}
```

## Properties

- **`kind`** - Always `'tradeWithCharacter'`

- **`character`** - Character to trade with. Must have a shop interaction

- **`condition`** (optional) - Conditional execution

## Examples

### Basic Trading

```typescript
{
  kind: 'tradeWithCharacter',
  character: 'MerchantWang'
}
```
