---
layout: default
title: Money Step
parent: Event Step Types
grand_parent: Events System
nav_order: 7
description: "Modify player's spirit stones"
---

# Money Step

Modifies the player's spirit stones (money).

## Interface

```typescript
interface ChangeMoneyStep {
  kind: 'money';
  condition?: string;
  amount: string;
}
```

## Properties

**`kind`** - Always `'money'`

**`amount`** - String expression for amount to add/remove. Use negative values to remove money.

**`condition`** *(optional)* - Flag expression that must evaluate to true for the step to execute.

## Examples

### Add Money
```typescript
{
  kind: 'money',
  amount: '500'
}
```

### Remove Money
```typescript
{
  kind: 'money',
  amount: '-200'
}
```

### Variable Amount
```typescript
{
  kind: 'money',
  amount: 'realm * 100'
}
```