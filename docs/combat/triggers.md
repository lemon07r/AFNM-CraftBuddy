---
layout: default
title: Triggers
parent: Combat System
nav_order: 7
description: 'How to hook buffs into the combat lifecycle'
---


# Combat Triggers

Buffs can trigger effects off the back of a variety of other parts of the combat lifecycle. Building off these allows you to create rich and detailed combat effects.

## Table of Contents

1. [Buff Timing Triggers](#buff-timing-triggers)
2. [Action-Based Triggers](#action-based-triggers)
3. [Resource Management Triggers](#resource-management-triggers)
4. [Damage and Healing Triggers](#damage-and-healing-triggers)
5. [Special System Triggers](#special-system-triggers)
6. [Custom Triggers](#custom-triggers)

---

## Buff Timing Triggers

These triggers are related to when buffs are processed during combat rounds.

### `onTechniqueEffects`
- **When it triggers:** Before any technique is executed by the buff owner
- **Condition:** Automatically triggered when the entity with this buff uses any technique
- **Usage:** Used for pre-technique modifications, costs, requirements, and effects
- **Examples:** Enhancing damage, modifying technique properties, applying costs

### `onRoundEffects` 
- **When it triggers:** At the end of each combat round
- **Condition:** Automatically triggered at round end for all entities with buffs that have these effects
- **Usage:** End-of-round processing like DoT damage, healing over time, buff decay, stack management
- **Examples:** Poison damage, regeneration, buff duration reduction

### `onRoundStartEffects`
- **When it triggers:** At the beginning of each combat round
- **Condition:** Automatically triggered at round start for all entities with buffs that have these effects
- **Usage:** Start-of-round effects like barrier restoration, buff application, preparation effects
- **Examples:** Shield regeneration, stance preparation, round-based buff application

### `onCombatStartEffects`
- **When it triggers:** At the very beginning of combat
- **Condition:** Automatically triggered when combat begins for entities with buffs that have these effects
- **Usage:** Combat initialization effects, stance setup, initial preparations
- **Examples:** Initial barrier application, combat preparation buffs

---

## Action-Based Triggers

These triggers are based on specific actions taken during combat.

### `use.{techniqueType}`
- **When it triggers:** When a technique of a specific type is used
- **Condition:** Triggered when the entity uses any technique matching the specified type
- **Usage:** Type-specific bonuses and effects based on technique element
- **Examples:** 
  - `use.fist` - Triggers when using fist techniques
  - `use.blood` - Triggers when using blood techniques

### `use.{specificEffect}`
- **When it triggers:** When a technique with a specific effect type is used
- **Condition:** Triggered based on the technique's effect kinds
- **Usage:** Effect-specific bonuses and reactions
- **Examples:**
  - `use.damage` - When using techniques that deal damage
  - `use.heal` - When using techniques that heal
  - `use.buffSelf` - When using techniques that apply buffs
  - `use.buffTarget` - When using techniques that buff the target

---

## Resource Management Triggers

These triggers relate to spending and consuming resources during combat.

### `spend.{resourceName}`
- **When it triggers:** When a specific resource is spent as a technique cost
- **Condition:** Triggered when techniques consume specific resources through their cost requirements
- **Usage:** Resource-spending bonuses, cost reductions, spending-based effects
- **Examples:**
  - `spend.Qi Vial` - Triggers when Qi Vials are consumed for technique costs
  - `spend.{buffName}` - Triggers when specific buffs are consumed as costs

### `consume.{buffName}`
- **When it triggers:** When a specific buff is consumed/removed
- **Condition:** Triggered when buffs are removed through consumption, expiration, or manual removal
- **Usage:** Buff consumption effects, cleanup effects, consume-based bonuses
- **Examples:** Special effects when certain buffs expire or are consumed

---

## Damage and Healing Triggers

These triggers relate to taking or dealing damage and healing.

### `takeDamage`
- **Condition:** Triggered every time the entity receives unblocked damage from any source (after defense calculations)
- **Usage:** Damage-based reactions, defensive responses, damage-triggered effects

### `blockDamage`
- **Condition:** Triggered every time the entity fully blocks damage from a hit (using barrier or damage resistance)
- **Usage:** Reflection effects, counters, parry mechanics

### `damageHp`
- **Condition:** Triggered every time the entity deals damage to the opponents health (so not blocked by barrier or damage resistance)
- **Usage:** Poison effects, leech mechanics

### `damageBlocked`
- **Condition:** Triggered every time the entity fails to break through barrier or damage resistance, and does 0 damage
- **Usage:** Recoil effects, powerup mechanics

### `damageSelf`
- **Condition:** Triggered for each 1% of max HP dealt as self-damage
- **Usage:** Self-harm penalties, masochistic bonuses, self-damage reactions

### `damageSelf-{damageType}`
- **Condition:** Triggered for each 1% of max HP dealt as self-damage of the specified type
- **Usage:** Type-specific self-damage reactions

### `fullHeal`
- **Condition:** Triggered when the entity heals itself from less than full health to full health
- **Usage:** Overheal effects, Healthy buff activations

### `fullBarrier`
- **Condition:** Triggered when the entity refills its barrier from less than full to full
- **Usage:** Overbarrier effects

---

## Special System Triggers

These triggers are related to specific game systems and mechanics.

### `interceptBuffEffects`
- **When it triggers:** When specific buffs are about to be applied
- **Condition:** Triggered when buffs matching the interception criteria are being applied
- **Usage:** Buff interception, application modification, buff blocking
- **Properties:**
  - `cancelApplication: true` - Prevents the buff from being applied
  - `cancelApplication: false` - Triggers effects but allows buff application
- **Examples:** Immunity effects, buff transformation, application penalties

### `triggeredBuffEffects`
- **When it triggers:** Based on custom trigger strings
- **Condition:** Triggered when the specified trigger string is activated
- **Usage:** Custom trigger-based effects, complex conditional interactions
- **Examples:** Formation triggers, contingency effects, custom reaction systems

---

## Custom Triggers

These are specific custom triggers used by various systems in the game.

### `contingency`
- **When it triggers:** Special trigger used by Immortal Fang techniques
- **Condition:** Activated by specific Immortal Fang technique interactions
- **Usage:** Contingency-based effects in the Immortal Fang technique school
- **Examples:** Emergency responses, backup effects, failure contingencies

### `Formation` (formationCoreFlag)
- **When it triggers:** When formation-based effects are activated
- **Condition:** Triggered by formation system interactions
- **Usage:** Formation-specific bonuses and effects
- **Examples:** Formation technique synergies, group combat bonuses

---

## Implementation Notes

### Trigger Processing Order
1. **Pre-Technique:** `onTechniqueEffects` are processed before technique execution
2. **Technique Execution:** Main technique effects with embedded triggers
3. **Post-Technique:** Various action-based triggers (`use.*`, `spend.*`)
4. **Damage/Healing:** `takeDamage`, `damageSelf` triggers during damage processing
5. **End of Round:** `onRoundEffects` at round conclusion
6. **Start of Round:** `onRoundStartEffects` at round beginning

### Priority System
- Buffs with lower `priority` values are processed first
- Default priority is 0 if not specified
- Negative priorities process before positive ones

### Parent Buff Prevention
- Triggers cannot activate buffs that are already in the parent chain
- Prevents infinite recursion in buff trigger chains
- Each trigger call maintains a list of parent buff names to avoid cycles

### Condition Evaluation
- All triggers respect buff conditions (`TechniqueCondition`)
- Failed conditions may remove buffs if `removeOnConditionFailed` is true
- Condition types include: `chance`, `buff`, `hp`, and `condition`

---

## Usage Examples

### Basic Damage Reaction
```typescript
triggeredBuffEffects: [
  {
    trigger: 'takeDamage',
    effects: [
      {
        kind: 'heal',
        amount: { value: 10, stat: "power" }
      }
    ]
  }
]
```

### Resource Spending Bonus
```typescript
triggeredBuffEffects: [
  {
    trigger: 'spend.Qi Vial',
    effects: [
      {
        kind: 'buff',
        buff: strengthBuff,
        amount: { value: 1, stat: undefined }
      }
    ]
  }
]
```

### Technique Type Synergy
```typescript
triggeredBuffEffects: [
  {
    trigger: 'use.fist',
    effects: [
      {
        kind: 'damage',
        amount: { value: 1, stat: 'power' },
      }
    ]
  }
]
```