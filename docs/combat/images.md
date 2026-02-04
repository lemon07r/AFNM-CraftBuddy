---
layout: default
title: Combat Images
parent: Combat System
nav_order: 4
description: 'Visual representation system for buffs in combat'
---

# Combat Images

Buffs can display visual effects during combat through the `combatImage` property. These images provide visual feedback about active buffs and their intensity.

## Base Combat Image Properties

All combat images share these properties:

```typescript
interface BaseCombatImage {
  image: string; // Image asset path
  imageOverrides?: { stacks: number; image: string }[]; // Different images at stack thresholds
  position:
    | 'scatter'
    | 'arc'
    | 'floating'
    | 'overlay'
    | 'companion'
    | 'ground'
    | 'formation';
  animations?: ('buff' | 'bump' | 'attack' | 'debuff')[]; // Trigger animations
  animateOnEntity?: boolean; // Whether to animate the entity
}
```

## Position Types

### Floating

Buffs that orbit appear above the characters head

```typescript
combatImage: {
  position: 'floating',
  image: sunIcon,
  entrance: 'rotate' | 'grow',     // How the image appears
  stacksScale?: 0.15,              // Scale increase per stack
  mergedImage?: {                  // Special combined image
    image: eclipseIcon,
    otherBuff: 'Moonlight'
  }
}
```

**Example from Sunlight:**

```typescript
combatImage: {
  image: sunIcon,
  position: 'floating',
  entrance: 'rotate',
  stacksScale: 0.15
}
```

**Example from Moonlight (with merge):**

```typescript
combatImage: {
  image: moonIcon,
  position: 'floating',
  entrance: 'rotate',
  stacksScale: 0.15,
  mergedImage: {
    image: eclipseIcon,
    otherBuff: sunlight.name  // Shows eclipse when both exist
  }
}
```

### Overlay

Images that appear over the character model.

```typescript
combatImage: {
  position: 'overlay',
  image: overlayImage,
  baseOpacity?: 0.3,          // Starting opacity
  stacksOpacity?: 0.05,       // Opacity increase per stack
  baseScale?: 1.0,            // Starting scale
  stacksScale?: 0.1,          // Scale increase per stack
  scroll?: {                  // Scrolling animation
    direction: 'up' | 'down',
    duration: 2000,           // Animation duration in ms
    stacksSpeedUp?: 0.1       // Speed increase per stack
  }
}
```

**Example from Flow:**

```typescript
combatImage: {
  position: 'overlay',
  image: overlayImage,
  baseOpacity: 0.6,
  stacksOpacity: 0.05
}
```

**Example from Moonchill:**

```typescript
combatImage: {
  position: 'overlay',
  image: moonchillOverlay,
  baseOpacity: 0.3,
  stacksOpacity: 0.05
}
```

### Arc

Images arranged in an arc pattern.

```typescript
combatImage: {
  position: 'arc',
  image: arcImage,
  showSingleInstance?: true,   // Only show one regardless of stacks
  baseScale?: 1.0,
  stacksScale?: 0.1
}
```

### Scatter

Randomly positioned images above the character.

```typescript
combatImage: {
  position: 'scatter',
  image: scatterImage
}
```

### Companion

Images that act like combat companions, standing behind the character.

```typescript
combatImage: {
  position: 'companion',
  image: companionImage,
  scale?: 1.0,
  stacksScale?: 0.1
}
```

### Ground

Images that appear on the ground surface.

```typescript
combatImage: {
  position: 'ground',
  image: groundImage,
  scale?: 1.0,
  stacksScale?: 0.1
}
```

### Formation

Images arranged in formation patterns.

```typescript
combatImage: {
  position: 'formation',
  image: formationImage,
  scale?: 1.0,
  showSingleInstance?: true
}
```

## Advanced Features

### Image Overrides

Display different images based on stack count:

```typescript
combatImage: {
  position: 'floating',
  image: baseImage,
  imageOverrides: [
    { stacks: 5, image: tier1Image },
    { stacks: 10, image: tier2Image },
    { stacks: 20, image: maxImage }
  ]
}
```

### Merge Images

Show special combined visuals when multiple buffs are present:

```typescript
combatImage: {
  position: 'floating',
  image: moonIcon,
  mergedImage: {
    image: eclipseIcon,
    otherBuff: 'Sunlight'  // When both Moonlight and Sunlight exist
  }
}
```

## Scaling Mechanics

### Stack-Based Scaling

Many images scale their visual properties based on stack count:

- **`stacksScale`** - Size increase per stack
- **`stacksOpacity`** - Opacity increase per stack
- **`stacksSpeedUp`** - Animation speed increase per stack

### Base Properties

Set the baseline visual properties:

- **`baseScale`** - Starting size
- **`baseOpacity`** - Starting opacity
- **`scale`** - Fixed size (doesn't change with stacks)
