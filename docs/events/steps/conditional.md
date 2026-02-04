---
layout: default
title: Conditional Step
parent: Event Step Types
grand_parent: Events System
nav_order: 5
description: 'Execute steps based on game state conditions'
---

# Conditional Step

Executes different step sequences based on game state conditions, enabling dynamic, responsive events. Only the FIRST matching branch will run.

## Interface

```typescript
interface ConditionalStep {
  kind: 'conditional';
  condition?: string;
  branches: { condition: string; children: EventStep[] }[];
}
```

## Properties

**`kind`** - Always `'conditional'`

**`condition`** _(optional)_ - Flag expression that must evaluate to true for the step to execute.

**`branches`** - Array of conditional branches. Each branch has a `condition` string and `children` array of steps to execute if the condition is true. Only the first branch with a true condition will run

## Examples

### Simple Conditional override

```typescript
{
  kind: 'conditional',
  branches: [
    {
      condition: 'realm >= qiCondensation',
      children: [
        { kind: 'text', text: 'Your cultivation is sufficient for this challenge.' }
      ]
    },
    {
      condition: '1',
      children: [
        { kind: 'text', text: 'You need more cultivation to proceed safely.' }
      ]
    }
  ]
}
```

### Multiple Branches

```typescript
{
  kind: 'conditional',
  branches: [
    {
      condition: 'realm >= pillarCreation', // First valid branch executes, so put more specific ones earlier
      children: [
        { kind: 'speech', character: 'Elder', text: 'A true powerhouse! Welcome, honored one.' }
      ]
    },
    {
      condition: 'realm >= coreFormation',
      children: [
        { kind: 'speech', character: 'Elder', text: 'A Core Formation cultivator. Impressive.' }
      ]
    },
    {
      condition: '1', // Put general case last
      children: [
        { kind: 'speech', character: 'Elder', text: 'Still in the early stages. Keep training.' }
      ]
    }
  ]
}
```
