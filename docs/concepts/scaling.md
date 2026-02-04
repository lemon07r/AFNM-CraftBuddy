---
layout: default
title: Scaling System
parent: Core Concepts
nav_order: 2
description: 'Mathematical foundations for dynamic values in AFNM'
---

# Scaling System

## Introduction

The Scaling system is the mathematical engine that powers all dynamic value calculations in Ascend from Nine Mountains. Whether you're creating techniques that deal damage, buffs that modify stats, or crafting effects that scale with player progression, understanding scaling is essential for creating balanced, engaging content.

Every damage number, healing amount, buff strength, and stat modifier flows through this system, creating the progression curves that make cultivation feel meaningful.

## Core Architecture

### The Scaling Interface

```typescript
interface Scaling {
  value: number; // Base multiplier
  stat?: string; // Stat to multiply by
  scaling?: string; // Special scaling mode
  eqn?: string; // Custom equation
  max?: Scaling; // Cap the final value
  upgradeKey?: string; // Links to mastery upgrades
}
```

### Evaluation Formula

The system follows a predictable pattern: **Base × Stat × Scaling × Equation**

```
Final Value = value × [stat] × [scaling] × [eqn result]
```

Each component is optional, allowing for simple flat values or complex multi-variable calculations.

## Deep Dive: Scaling Patterns

### Pattern 1: Flat Values

**When to use**: Fixed effects, utility abilities, resource generation that shouldn't scale with combat stats.

```typescript
// Always grants exactly 3 stacks
{
  value: 3,
  stat: undefined  // No stat multiplication
}

// Fixed damage (rare, usually for utility)
{
  value: 100,
  stat: undefined
}

// Equation-only calculation
{
  value: 1,
  stat: undefined,
  eqn: 'toxicity * 2'  // Result comes entirely from equation
}
```

**Real Example**: Concentrate Force scales only with Ripple Force stacks:

```typescript
amount: {
  value: 1,
  stat: undefined,
  scaling: rippleForce.name,  // 1 damage per stack, no stat scaling
  max: { value: 7, upgradeKey: 'maxStacks' }
}
```

### Pattern 2: Basic Stat Scaling

**When to use**: Standard techniques, straightforward damage/healing effects.

```typescript
// 150% of player's power as damage
{
  value: 1.5,
  stat: 'power'
}

// Barrier equal to 300% of defense
{
  value: 3,
  stat: 'defense'
}

// Crafting perfection based on control
{
  value: 0.8,
  stat: 'control'
}
```

**Real Example**: Sun Blast technique:

```typescript
amount: {
  value: 2,              // 200% of power
  stat: 'power',
  upgradeKey: 'power'    // Improves with mastery
}
```

### Pattern 3: Stack-Based Scaling

**When to use**: Buff effects that scale with accumulated stacks, combo systems.

```typescript
// Damage per buff stack
{
  value: 0.3,        // 30% power per stack
  stat: 'power',
  scaling: 'stacks'
}

// Fixed amount per stack (no stat scaling)
{
  value: 10,         // 10 damage per stack
  scaling: 'stacks'
}
```

**Real Example**: Blossom technique scaling with Vitality:

```typescript
amount: {
  value: 0.3,
  stat: 'power',
  scaling: 'stacks'  // 30% power × Vitality stacks
}
```

### Pattern 4: Game State Scaling

**When to use**: Effects that respond to dynamic game conditions like toxicity, stability, or qi levels.

```typescript
// Power increases with risk (toxicity)
{
  value: 0.1,
  stat: 'power',
  scaling: 'toxicity'  // More toxic = more powerful
}

// Cost scales with current stability
{
  value: -50,
  scaling: 'stability'  // Costs current stability
}
```

**Real Example**: Lianjin Bandolier toxicity scaling:

```typescript
stats: {
  power: {
    value: 0.005,        // 0.5% power per toxicity point
    stat: 'power',
    scaling: 'toxicity',
    max: { value: 1, stat: 'power' }  // Capped at 100% bonus
  }
}
```

### Pattern 5: Cross-Buff Scaling

**When to use**: Synergies between different buffs, combo effects that reward specific buff combinations.

```typescript
// Scale with specific buff stacks
{
  value: 1,
  scaling: specificBuffName  // Uses that buff's current stacks
}

// Scale with target's debuffs
{
  value: 2,
  stat: 'power',
  scaling: 'target.' + debuffName  // Enemy's debuff stacks
}
```

**Real Example**: Celestial Discordance:

```typescript
amount: {
  value: 1,
  scaling: 'target.' + harmonicDiscord.name  // Damage per target's discord
}
```

### Pattern 6: Complex Equations

**When to use**: Percentage calculations, conditional logic, multi-variable formulas.

```typescript
// Toxicity percentage bonus
{
  value: 3,
  stat: 'power',
  eqn: 'toxicity/maxtoxicity'  // Scales with toxicity %
}

// Conditional damage boost
{
  value: 1,
  stat: 'power',
  eqn: 'qi < maxqi * 0.3 ? 2 : 1'  // Double power when low on qi
}

// Multi-buff synergy
{
  value: 4,
  eqn: `${flag(buff1.name)} + ${flag(buff2.name)}`  // Sum of two buffs
}
```

### Pattern 7: Capped Scaling

**When to use**: Preventing runaway scaling, maintaining game balance.

```typescript
// Stat scaling with hard cap
{
  value: 0.05,         // 5% per stack
  stat: 'power',
  scaling: 'stacks',
  max: { value: 2, stat: 'power' }  // Max 200% power bonus
}

// Fixed numerical cap
{
  value: 10,
  scaling: 'stacks',
  max: { value: 100 }   // Never exceeds 100
}
```

**Real Example**: Ripple Force power bonus:

```typescript
stats: {
  power: {
    value: 0.05,          // 5% per stack
    stat: 'power',
    scaling: 'stacks',
    max: {
      value: 2,           // Caps at 200% power
      stat: 'power'
    }
  }
}
```

## Standard scaling

To keep numbers consistent, there are a few standard patterns for scaling you want to follow:

### For technique effects

Anything that creates a direct effect (damage, healing, barrier) on techniques should scale from power:

```typescript
{
  value: 1, // 100% of power
  stat: "power"
}
```

### For stacks of buffs

Anything that produces stacks of buffs should not scale off any stat, but can scale off other field to increase those stacks

```typescript
{
  value: 1, // Create 1 stack
  stat: undefined,
  scaling: "Flow" // Multiply by the flow stacks
}
```

### For items

Consumables should normally have a flat scaling to ensure that lower realm items are not excessively powerful in higher realms.

```typescript
{
  value: Math.floor(window.modAPI.utils.getExpectedHealth("bodyForging", "Late") * 0.5), // A flat 50% of the players expected hp in the Body Forging realm
  stat: undefined,
  eqn: '1 + (itemEffectiveness * 0.01)', // Multiplied by item effectiveness
}
```

### For artefacts / formation parts

Externally controlled / powered items like artefacts and formation parts should scale off artefact power, not power

```typescript
{
  value: 1,
  stat: 'artefactpower',
  eqn: '1 + (itemEffectiveness * 0.01)', // Only for formation parts scale by item effectiveness too
}
```

## Practical Examples by School

### Fist School: Stack Accumulation

```typescript
// Generate Flow stacks
{
  kind: 'buffSelf',
  buff: flow,
  amount: { value: 1 }  // Always 1 stack
}

// Convert Flow to damage
{
  kind: 'damage',
  amount: {
    value: 0.8,           // 80% power per Flow stack
    stat: 'power',
    scaling: flow.name
  }
}
```

### Weapon School: Progressive Momentum

```typescript
// Momentum builds over turns
stats: {
  power: {
    value: 0.02,          // 2% power per stack
    stat: 'power',
    scaling: 'stacks',
    max: { value: 0.5, stat: 'power' }  // 50% power cap
  }
}
```

### Celestial School: Dual Attunement

```typescript
// Power from both light and dark
stats: {
  celestialBoost: {
    value: 4,
    eqn: `${flag(lunarAttunement.name)} + ${flag(solarAttunement.name)}`
  }
}
```

### Blood School: Risk/Reward

```typescript
// Low health = high power
{
  value: 2,
  stat: 'power',
  scaling: '1 - (hp / maxhp)',   // max power at 0 hp
}
```

## Advanced Techniques

### Upgrade Key Integration

Link scaling to mastery progression:

```typescript
{
  value: 0.65,
  stat: 'intensity',
  upgradeKey: 'completion'  // Improves as player masters technique
}

// Upgrade affects caps
{
  value: 3,
  scaling: 'stacks',
  max: {
    value: 5,
    upgradeKey: 'maxStacks'  // Max stacks increase with mastery
  }
}
```

### State-Dependent Effects

```typescript
// Desperation bonus
{
  kind: 'perfection',
  amount: {
    value: 20,
    eqn: '(stability < 30) * 20'  // Bonus when desperate
  }
}
```

## Tips and Best Practices

### Scaling Guidelines

**Damage Multipliers:**

- Basic attacks: 0.5-1.2× stat
- Strong techniques: 1.5-2.5× stat
- Ultimate abilities: 3.0-4.0× stat
- Per-stack scaling: 0.05-0.1× stat per stack

### When to Use Each Pattern

1. **Flat Values** (`stat: undefined`):

   - Utility effects (cleanse, dispel)
   - Resource generation/consumption
   - Equation-only calculations
   - Upgrade-driven progression

2. **Basic Stat Scaling**:

   - Standard damage and healing
   - Straightforward stat bonuses
   - Effects that should grow with character power

3. **Stack Scaling**:

   - Combo systems and buff interactions
   - Resource accumulation mechanics

4. **Equation Scaling**:
   - Complex conditional logic
   - Percentage-based effects
   - Multi-variable calculations

### Balance Considerations

- **Always cap percentage scaling** to prevent exponential growth
- **Use meaningful stat relationships** (power for damage, control for crafting)
- **Test edge cases thoroughly**, especially with equations
- **Consider upgrade keys** for meaningful progression
- **Make patterns intuitive** - players will optimize around your systems

### Common Pitfalls

1. **Uncapped scaling** - Leads to broken balance
2. **Illogical stat relationships** - Confuses players
3. **Overly complex equations** - Hard to debug and understand
4. **Missing progression** - Static effects feel unrewarding
5. **Inconsistent patterns** - Makes the system unpredictable

The scaling system is powerful and flexible. Master these patterns, and you'll create techniques and effects that feel both impactful and balanced, scaling naturally with player progression while maintaining strategic depth.
