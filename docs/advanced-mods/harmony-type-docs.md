---
layout: default
title: Add Harmony type
parent: Advanced mods
nav_order: 2
---

# Harmony Type

Harmony is one of the core features of the crafting system. In the base game, there are 4 variants of this defined, but new ones can be added by mods to even further flesh out this system. This can be done through the `window.modAPI.action.addHarmonyType` function.

```typescript
window.modAPI.action.addHarmonyType(harmonyType: RecipeHarmonyType, config: HarmonyTypeConfig)
```

- **harmonyType**: A unique string identifier for your harmony type (e.g., `'elemental'`, `'temporal'`, `'chaos'`). Note, as you are adding new and unknown harmony types you need to tell the compiler this is the case, by 'casting' the string to the RecipeHarmonyType `'elemental' as RecipeHarmonyType`
- **config**: An object containing all configuration for the harmony type:

## HarmonyTypeConfig Fields

### 1. `name` (string, required)
The display name of your harmony type shown to players.

**Example:** `"Elemental Balance"`

### 2. `description` (string, required)
HTML-formatted description explaining the harmony mechanics to players. Supports special formatting tags:
- `<name>text</name>` - Highlights important terms
- `<num>number</num>` - Highlights numbers
- `<li>item</li>` - Creates list items
- `<br/>` - Line breaks
- Standard HTML like `<span style="color: green">text</span>`

**Example:**
```typescript
description: `Balance the elements to maintain <name>Harmony</name>.
  <br/>
  Each action shifts the elemental balance:
  <li>Support: +<num>2</num> heat, -<num>1</num> cold</li>
  <li>Refine: +<num>2</num> cold, -<num>1</num> heat</li>`
```

### 3. `processEffect` (function, required)
Called after each crafting technique is executed. This is where you implement the core mechanics.

**Function Signature:**
```typescript
processEffect: (
  harmonyData: HarmonyData,
  technique: CraftingTechnique,
  progressState: ProgressState,
  entity: CraftingEntity,
  state: CraftingState
) => void
```

**Parameters:**
- `harmonyData`: Store custom data for your harmony type here, in the `additionalData` field.
- `technique`: The crafting action that was just executed
- `progressState`: Current crafting progress (completion, perfection, harmony, etc.)
- `entity`: The player's crafting entity with stats and buffs
- `state`: Overall crafting state including the log

**Common Operations:**
- Initialize custom data in `harmonyData.additionalData`. e.g. `harmonyData.additionalData = { heat: 0, cold: 0 }`
- Modify `progressState.harmony` based on player actions
- Add/remove buffs to `entity.buffs`
- Log messages to `state.craftingLog`
- Set `harmonyData.recommendedTechniqueTypes` to guide the player on the best crafting action types to use next (if relevant)

### 4. `initEffect` (function, required)
Called once when crafting begins to initialize your harmony type.

**Function Signature:**
```typescript
initEffect: (harmonyData: HarmonyData, entity: CraftingEntity) => void
```

**Common Operations:**
- Initialize your custom data structure in `harmonyData.additionalData`
- Apply starting buffs to the entity
- Set initial recommended techniques

### 5. `renderComponent` (function, required)
Returns a React component to display your harmony's visual state during crafting.

**Function Signature:**
```typescript
renderComponent: (harmonyData: HarmonyData) => ReactNode
```

**Guidelines:**
- Component should be positioned absolutely within the crafting interface
- Use Box components with proper positioning
- Access your custom data from `harmonyData.additionalData`
- Return visual feedback showing current state
- Can draw custom assets to be rendered, by drawing them on a blank image using the base cauldron background (below) as a guide. Do not include the cauldron itself in your new asset, simply use it as a guide for the image size and positioning of your new asset.
![Cauldron Image](./cauldron.png)

## Complete Example

```typescript
window.modAPI.actions.addHarmonyType('elemental', {
  name: 'Elemental Balance',

  description: `Balance fire and water elements to maintain <name>Harmony</name>.
    <br/>
    <br/>
    Actions affect element levels:
    <li>Fusion: +<num>3</num> fire</li>
    <li>Refine: +<num>3</num> water</li>
    <li>Support/Stabilize: +<num>1</num> to lower element</li>
    <br/>
    Perfect balance (both at 5): +<num>15</num> <name>Harmony</name>
    <br/>
    Imbalance: -<num>10</num> <name>Harmony</name> per point of difference`,

  processEffect: (harmonyData, technique, progressState, entity, state) => {
    // Initialize data if needed
    harmonyData.additionalData = harmonyData.additionalData || {
      fire: 5,
      water: 5
    };

    // Process technique effects
    if (technique.type === 'fusion') {
      harmonyData.additionalData.fire = Math.min(10, harmonyData.additionalData.fire + 3);
      state.craftingLog.push(`Fire element increased to ${harmonyData.elemenadditionalDatatal.fire}`);
    } else if (technique.type === 'refine') {
      harmonyData.additionalData.water = Math.min(10, harmonyData.additionalData.water + 3);
      state.craftingLog.push(`Water element increased to ${harmonyData.additionalData.water}`);
    } else {
      // Support/Stabilize boost the lower element
      if (harmonyData.additionalData.fire < harmonyData.additionalData.water) {
        harmonyData.additionalData.fire += 1;
      } else {
        harmonyData.additionalData.water += 1;
      }
    }

    // Calculate harmony based on balance
    const diff = Math.abs(harmonyData.additionalData.fire - harmonyData.additionalData.water);
    if (diff === 0 && harmonyData.additionalData.fire === 5) {
      progressState.harmony += 15;
      state.craftingLog.push(`Perfect balance! +15 harmony`);
    } else {
      progressState.harmony -= diff * 10;
      state.craftingLog.push(`Imbalance penalty: -${diff * 10} harmony`);
    }

    // Apply buffs based on dominant element
    if (harmonyData.additionalData.fire > harmonyData.additionalData.water) {
      entity.buffs = [{
        name: 'Fire Dominance',
        icon: 'flame.png',
        canStack: false,
        stats: {
          intensity: { value: 0.3, stat: 'intensity' }
        },
        effects: [],
        onFusion: [],
        onRefine: [],
        stacks: 1,
        displayLocation: 'none'
      }, ...entity.buffs.filter(b => b.name !== 'Fire Dominance' && b.name !== 'Water Dominance')];
    } else if (harmonyData.additionalData.water > harmonyData.additionalData.fire) {
      entity.buffs = [{
        name: 'Water Dominance',
        icon: 'water.png',
        canStack: false,
        stats: {
          control: { value: 0.3, stat: 'control' }
        },
        effects: [],
        onFusion: [],
        onRefine: [],
        stacks: 1,
        displayLocation: 'none'
      }, ...entity.buffs.filter(b => b.name !== 'Fire Dominance' && b.name !== 'Water Dominance')];
    }

    // Recommend techniques to balance
    if (harmonyData.additionalData.fire > harmonyData.additionalData.water + 2) {
      harmonyData.recommendedTechniqueTypes = ['refine'];
    } else if (harmonyData.additionalData.water > harmonyData.additionalData.fire + 2) {
      harmonyData.recommendedTechniqueTypes = ['fusion'];
    } else {
      harmonyData.recommendedTechniqueTypes = ['support', 'stabilize'];
    }
  },

  initEffect: (harmonyData, entity) => {
    harmonyData.additionalData = {
      fire: 5,
      water: 5
    };
    harmonyData.recommendedTechniqueTypes = ['fusion', 'refine'];
  },

  renderComponent: (harmonyData) => {
    const { fire = 5, water = 5 } = harmonyData.additionalData || {};

    return (
       <Box display="flex" mt={5.2} position="relative" justifyContent="center" id="elemental">
        {/* Fit to the bounds of the cauldron. These are the magic numbers for width/height used in the game */}
        <Box
          width="calc(min(35vw, 35vh))"
          height="calc(min(35vw, 35vh))"
          position="relative"
          sx={{ overflow: 'visible' }}
        >
           {/* The internal box that your styling should sit within, to prevent it going outside the bounds. zIndex is to ensure it renders over the cauldron */}
          <Box
            display="flex"
            position="absolute"
            sx={{ zIndex: 21, top: 0, left: 0, width: '100%', height: '100%' }}
          >
            {/* Fire meter, absolutely positioned on the left */}
            <Box
              flex={1}
              display="flex"
              flexDirection="column"
              alignItems="center"
              position="absolute"
              sx={{ zIndex: 21, top: 0, left: 0, width: '100%', height: '100%' }}
            >
              <Typography color="red">Fire: {fire}</Typography>
              <Box
                width="30px"
                height="60px"
                bgcolor="rgba(255,0,0,0.2)"
                border="1px solid red"
                position="relative"
              >
                <Box
                  position="absolute"
                  bottom={0}
                  width="100%"
                  height={`${fire * 10}%`}
                  bgcolor="red"
                />
              </Box>
            </Box>

            {/* Water meter, absolutely positioned on the right*/}
            <Box
              flex={1}
              display="flex"
              flexDirection="column"
              alignItems="center"
              position="absolute"
              sx={{ zIndex: 21, top: 0, right: 0, width: '100%', height: '100%' }}
            >
              <Typography color="blue">Water: {water}</Typography>
              <Box
                width="30px"
                height="60px"
                bgcolor="rgba(0,0,255,0.2)"
                border="1px solid blue"
                position="relative"
              >
                <Box
                  position="absolute"
                  bottom={0}
                  width="100%"
                  height={`${water * 10}%`}
                  bgcolor="blue"
                />
              </Box>
            </Box>

            {/* Custom border image overlay. The width/height/top/left are the magic numbers used in the game, but tweak to position your custom image perfectly */}
            <Box
              position="absolute"
              width={`128%`}
              height={`122%`}
              top={`-6.5%`}
              left={`-14%`}
              sx={{
                backgroundImage: `url(${{ '{' }}${safeUrlEncode(elementalImg)}})`, 
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                pointerEvents: 'none',
                zIndex: 21,
              }}
            />
          </Box>
        </Box>
      </Box>
    );
  }
});
```

## Item Type Mapping

To assign your harmony type to specific item types, use `overrideItemTypeToHarmonyType`:

```typescript
window.modAPI.actions.overrideItemTypeToHarmonyType({
  'artefacts': 'elemental' as RecipeHarmonyType,
  'cauldrons': 'elemental' as RecipeHarmonyType
});
```

Or you can add it to specific recipes instead.

```typescript
const elementalRecipe: RecipeItem = {
  kind: 'recipe',
  //... recipe fields
  harmonyTypeOverride: 'elemental' as RecipeHarmonyType,
}
```

## Best Practices

1. **Balance Risk/Reward**: Higher harmony bonuses should require more skill or risk
2. **Clear Visual Feedback**: Your render component should clearly show the current state
3. **Informative Logging**: Use `state.craftingLog.push()` to explain what's happening
4. **Buff Management**: Always filter out old buffs before applying new ones with the same name
5. **Recommended Techniques**: Use `harmonyData.recommendedTechniqueTypes` to guide players

## Utility Functions

Common utilities available in harmony implementations:

```typescript
// Color formatting for logs
const col = (content, color) => `<span style="color: ${color}">${content}</span>`;

// Technique type formatting
const fusion = `<span style="color: lime">Fusion</span>`;
const refine = `<span style="color: cyan">Refine</span>`;
const support = `<span style="color: #eb34db">Support</span>`;
const stabilize = `<span style="color: orange">Stabilize</span>`;
```