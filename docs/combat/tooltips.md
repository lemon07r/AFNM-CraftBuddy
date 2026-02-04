---
layout: default
title: Buff Tooltips
parent: Combat System
nav_order: 5
description: 'Dynamic tooltip generation system for buffs'
---

# Buff Tooltips

AFNM automatically generates comprehensive tooltips for buffs. Understanding this system helps create buffs with clear, informative tooltips.

## Tooltip Components

Buff tooltips consist of several sections:

1. **Header** - Name, icon, and enhancement level
2. **Effect Hint** - Brief description of the buff's purpose
3. **Conditions** - When the buff's effects are active
4. **Stats** - Passive stat modifications
5. **Effects** - Detailed description of what the buff does
6. **Footer** - Stack information and buff type

## Automatic Generation

When no custom `tooltip` is provided, the system automatically generates one based on the buff's effects:

### Effect Timing Blocks

The system creates readable descriptions for each timing:

- **"Before each technique..."** - `onTechniqueEffects`
- **"After each technique..."** - `onTechniqueEffects` with `afterTechnique: true`
- **"At the start of each round..."** - `onRoundStartEffects`
- **"At the end of each round..."** - `onRoundEffects`
- **"At the start of combat..."** - `onCombatStartEffects`

### Effect Descriptions

Each effect type gets a natural language description:

```typescript
// This effect
{
  kind: 'damage',
  amount: { value: 1.2, stat: 'power' }
}

// Becomes: "deal 120 damage"
```

```typescript
// This effect
{
  kind: 'heal',
  amount: { value: 0.25, stat: 'power' },
  hits: { value: 2, stat: undefined }
}

// Becomes: "heal for 25 2 times"
```

## Custom Tooltips

You can override automatic generation with a custom `tooltip`:

```typescript
export const profaneExchangeBuff: Buff = {
  name: 'Profane Exchange',
  // ...
  tooltip:
    'You no longer gain {buff}. Instead, lose <num>3%</num> health as <name>True Damage</name> per stack you would have gained.',
  interceptBuffEffects: [
    {
      buff: bloodCorruption,
      // ...
    },
  ],
};
```

## Template System

Tooltips support a rich template system for dynamic content:

### Placeholders

- **`{amount}`** - Effect amount with formatting
- **`{amount.scaling}`** - Scaling description
- **`{buff}`** - Buff name with styling
- **`{condition}`** - Condition description

### Styling Tags

- **`<num>value</num>`** - Numbers with highlight color
- **`<name>text</name>`** - Names with special formatting
- **`<n>text</n>`** - Short form name styling

### Block References

For multiple effects, use indexed references:

- **`{technique.[0].amount}`** - First technique effect amount
- **`{round.damage.amount}`** - Round effect damage amount
- **`{[1].condition}`** - Second effect condition

## Stats Tooltips

Stat modifications get special formatting:

### Percentage Stats

```typescript
stats: {
  critchance: { value: 10, stat: undefined }
}
// Displays: "Critical Chance: +10%"
```

### Power Scaling Stats

```typescript
stats: {
  power: { value: 0.3, stat: 'power' }
}
// Displays: "Power: +30%" (of current power)
```

### Fixed Value Stats

```typescript
stats: {
  defense: { value: 50, stat: undefined }
}
// Displays: "Defense: +50"
```

### Custom Stats Tooltip

Override the automatic stats description:

```typescript
stats: {
  celestialBoost: { value: 5, stat: undefined, scaling: 'stacks' }
},
statsTooltip: 'Celestial Boost: +{celestialBoost} per stack'
```

## Condition Tooltips

Conditions automatically generate readable descriptions:

### Buff Conditions

```typescript
condition: {
  kind: 'buff',
  buff: moonlight,
  count: 1,
  mode: 'more'
}
// Displays: "If you have more than 1 Moonlight then"
```

### HP Conditions

```typescript
condition: {
  kind: 'hp',
  percentage: 50,
  mode: 'less'
}
// Displays: "If you have less than 50% health then"
```

### Custom Conditions

```typescript
condition: {
  kind: 'condition',
  condition: 'custom_flag > 0',
  tooltip: 'If the custom condition is met then'
}
// Uses the custom tooltip text
```

## Special Tooltips

### Damage Types

Special damage types get explanatory tooltips:

- **True Damage** - "True Damage ignores barrier and defense."
- **Corrupt Damage** - "Corrupt Damage ignores defense."
- **Disruption Damage** - "Disruption Damage only affects barrier, not health."

### Buff Types

Custom buff types can have explanatory tooltips:

```typescript
buffType: 'Stance',
buffTypeTooltip: 'Stance buffs provide ongoing tactical advantages but can be disrupted by certain effects.'
```

### Trigger Explanations

Trigger effects can include explanatory tooltips:

```typescript
{
  kind: 'trigger',
  triggerKey: 'bloodSacrifice',
  amount: { value: 1, stat: undefined },
  triggerTooltip: 'Blood Sacrifice triggers when taking damage from your own techniques.'
}
```
