---
layout: default
title: Adding Screens
parent: Advanced mods
nav_order: 3
---

# Adding Screens

This guide explains how modders can add custom screens to Afnm using the mod API.

## Overview

Mod screens allow you to create custom interfaces that integrate seamlessly with the game beyond what you can achieve through an event. A screen takes over the full UI, with the responsibility being on you to ensure the game flow continues to work, and no softlocks occur. You can interact with core game functionality through the `screenAPI` prop that will be passed in.

## Understanding Screen Architecture

### What is a Screen?

In Afnm, a screen is a full-page interface component that completely replaces the current view. Examples of built-in screens include:

- The main town/location screen
- The market screen
- Combat screens
- Event dialogue screens

When you create a mod screen, you're creating a React functional component that receives special props allowing it to interact with the game's systems.

### The screenAPI Prop

Every mod screen receives a `screenAPI` prop containing three main categories of functionality:

1. **Hooks** - React hooks for accessing game state and functionality
2. **Actions** - Functions to modify game state and trigger events
3. **Components** - Pre-styled UI components that match the game's visual theme

### Basic Screen Lifecycle

1. Your screen component is registered with `api.addScreen()`
2. When navigated to (via action or event), your component mounts
3. Your component renders the UI and handles user interactions
4. When the user navigates away, your component unmounts

## Key Concepts

### Hooks for Game State

Hooks let you read current game state reactively - when the underlying data changes, your component automatically re-renders:

```typescript
const { useSelector, usePlaySfx, useGameFlags, useKeybinding } = screenAPI;

// Access player data
const player = useSelector((state) => state.player.player);
const spiritStones = useSelector((state) => state.inventory.money);

// Play sound effects
const playSfx = usePlaySfx();

// Access game flags
const { flags } = useGameFlags();
```

### Actions for Game Changes

Actions are functions that let you modify game state safely:

```typescript
const { actions } = screenAPI;

// Navigate between screens
actions.setScreen('location');

// Modify player resources
actions.changeMoney(100);
actions.addItem({ name: 'Recuperation Pill (III)', stacks: 5 });

// Progress game time
actions.advanceDays(1);
```

### Components for Consistent UI

The game provides pre-styled components that match the visual theme:

```typescript
const { components } = screenAPI;
const { GameDialog, GameButton, BackgroundImage, PlayerComponent } = components;

// Use these instead of raw HTML or unstyled components
<GameButton onClick={handleClick}>My Button</GameButton>
<GameDialog title="My Dialog">Dialog content</GameDialog>
```

## Standard Screen Layout

Most screens follow this general structure:

```typescript
export const MyModScreen: ModScreenFC = ({ screenAPI }) => {
  // 1. Extract what you need from screenAPI
  const { useSelector, actions, components } = screenAPI;
  const { GameDialog, BackgroundImage, PlayerComponent } = components;

  // 2. Access game state
  const player = useSelector((state) => state.player.player);

  // 3. Return the screen layout
  return (
    <Box position="relative" flexGrow={1} display="flex" flexDirection="column">
      {/* Background layer */}
      <BackgroundImage image="path/to/background.png" screenEffect="sun"  />

      {/* Main content dialog */}
      <GameDialog title="My Screen" onClose={() => actions.setScreen('location')}>
        {/* Your screen content goes here */}
      </GameDialog>

      {/* Player component */}
      <Box position="absolute" width="100%" height="100%" display="flex" flexDirection="column">
        <Box flexGrow={1} />
        <Box display="flex">
          <PlayerComponent />
        </Box>
      </Box>
    </Box>
  );
};
```

### Why This Structure?

- **BackgroundImage**: Provides visual atmosphere and consistency with the game
- **GameDialog**: Main content container with built-in styling and close functionality
- **PlayerComponent**: Shows the player character - always include this unless you intend to render the player through other means
- **Layered layout**: Background behind, dialog in middle, player component on top

## Your First Screen

Let's create a simple screen to demonstrate the concepts:

```typescript
import { ModScreenFC } from 'afnm-types';
import { Box, Typography } from '@mui/material';

export const SimpleWelcomeScreen: ModScreenFC = ({ screenAPI }) => {
  // Extract what we need from the screenAPI
  const { useSelector, usePlaySfx, actions, components } = screenAPI;
  const { GameDialog, GameButton, BackgroundImage, PlayerComponent } = components;

  // Get some game state
  const player = useSelector((state) => state.player.player);
  const playSfx = usePlaySfx();

  // Handle button click
  const handleGreeting = () => {
    playSfx('Click'); // Play sound effect
    actions.changeMoney(10); // Give player 10 spirit stones
  };

  return (
    <Box position="relative" flexGrow={1} display="flex" flexDirection="column">
      {/* Background */}
      <BackgroundImage image="town_square.png" screenEffect="sun" />

      {/* Main dialog */}
      <GameDialog
        title="Welcome Screen"
        onClose={() => actions.setScreen('location')}
      >
        <Typography>Hello, {player.name}!</Typography>
        <Typography>You are at cultivation level {player.realm}.</Typography>

        <GameButton onClick={handleGreeting}>
          Receive Greeting Gift
        </GameButton>
      </GameDialog>

      {/* Player component */}
      <Box position="absolute" width="100%" height="100%" display="flex" flexDirection="column">
        <Box flexGrow={1} />
        <Box display="flex">
          <PlayerComponent />
        </Box>
      </Box>
    </Box>
  );
};
```

### Registering Your Screen

To make your screen available in the game, register it during mod initialization:

```typescript
export default function (api: ModAPI) {
  api.addScreen({
    key: 'welcomeScreen', // Screen identifier. Use `setScreen('welcomeScreen')` to navigate to it.
    component: SimpleWelcomeScreen, // Your component
    music: 'peaceful_theme', // Optional background music
    ambience: 'nature_sounds', // Optional ambient sounds
  });
}
```

### Navigating to Your Screen

Once registered, you can navigate to your screen from events, other screens, or buttons:

```typescript
// From an event step
{
  type: 'navigate',
  screen: 'welcomeScreen'
}

// From another screen
actions.setScreen('welcomeScreen');

// From a button click
<GameButton onClick={() => actions.setScreen('welcomeScreen')}>
  Open Welcome Screen
</GameButton>
```

## Understanding the screenAPI in Detail

The `screenAPI` is your gateway to interacting with the game. Let's break down each part:

### Available Hooks

Hooks let you access game state and functionality in a React-friendly way:

```typescript
// Access any part of the game's Redux state (the current player save)
const player = useSelector((state) => state.player.player);
const inventory = useSelector((state) => state.inventory);
const currentLocation = useSelector((state) => state.location);
const gameTime = useSelector((state) => state.calendar);

// Play sound effects
const playSfx = usePlaySfx();
playSfx('Click'); // Button clicks
playSfx('Hover'); // Mouse hover
playSfx('BuildingLeave'); // Closing screens
playSfx('ItemReceived'); // Getting items

// Access custom game flags. Use this instead of gameData to get all flags the game collates
const { flags, flagsJSON } = useGameFlags();
const tutorialComplete = flags['tutorial_complete'] || 0;

// Handle keyboard shortcuts
useKeybinding(
  1, // priority (higher = more important)
  {
    Escape: () => actions.setScreen('location'),
    i: () => actions.setScreen('inventory'),
  },
);
```

### Available Actions

Actions are functions that safely modify the game state:

```typescript
// Screen navigation
actions.setScreen('location'); // Go to a specific screen
actions.setLocation('Liang Tiao Village'); // Change the game location

// Save data management
actions.setFlag('my_custom_flag', 1); // Set a persistent flag
actions.setModData('myMod', 'key', data); // Store mod-specific data

// Time and progression
actions.advanceDays(7); // Skip forward in time
actions.addQuest('quest_id'); // Start a quest

// Inventory and resources
actions.changeMoney(100); // Add/remove spirit stones
actions.addItem({
  // Add items to inventory
  name: 'Healing Pill (I)',
  stacks: 5,
});
actions.removeItem('Healing Pill (I)', 1); // Remove items

// Player progression
actions.learnRecipe('Healing Pill (I) Recipe'); // Teach player a recipe
actions.learnTechnique('Gale Blast'); // Teach combat technique
actions.changeQi(50); // Modify player's qi
```

### Available Components

Use these pre-styled components for consistency with the game's UI:

#### GameDialog

The main container for your screen content:

```typescript
<GameDialog
  title="Dialog Title"
  onClose={() => actions.setScreen('location')}  // Close handler. Omit to disable the close button
  removePad={false}        // Remove default padding
  showBackdrop={true}      // Show darkened backdrop
  width="md"               // Size: 'sm', 'md', or 'lg'. Default 'lg'
>
  Your content here
</GameDialog>
```

#### GameButton

Styled button matching the game theme:

```typescript
<GameButton
  onClick={() => handleClick()}
  disabled={false}
  keybinding={"Enter"} // Keybinding that will click the button when pressed
  keyPriority={1} // Optional priority for the keybinding
  fancyBorder={false} // When true, shows animated border like the combat fight button
>
  Button Text
</GameButton>
```

#### GameIconButton

Button with an icon:

```typescript
<GameIconButton onClick={() => handleClick()}>
  <CloseIcon />
</GameIconButton>
```

#### BackgroundImage

Screen background with optional particle effects:

```typescript
<BackgroundImage
  image="path/to/background.png"
  screenEffect="dust"      // 'dust', 'snow', 'rain', etc.
/>
```

#### PlayerComponent

Shows the player character (always include this unless you are custom rendering the character elsewhere):

```typescript
<PlayerComponent />
```

## Building More Complex Screens

Now that you understand the basics, let's explore more advanced patterns:

### Managing Local State

Your screens can have their own state using standard React hooks:

```typescript
export const ShopScreen: ModScreenFC = ({ screenAPI }) => {
  const { useSelector, actions, components } = screenAPI;
  const { GameDialog, GameButton } = components;

  // Local component state
  const [selectedItem, setSelectedItem] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Game state
  const playerMoney = useSelector((state) => state.inventory.money);

  const handlePurchase = (item) => {
    if (playerMoney >= item.cost) {
      actions.changeMoney(-item.cost);
      actions.addItem({ name: item.name, stacks: 1 });
      setShowConfirmation(false);
      setSelectedItem(null);
    }
  };

  return (
    <GameDialog title="Shop" onClose={() => actions.setScreen('location')}>
      {/* Shop interface */}
      {showConfirmation && (
        <Box>
          <Typography>Buy {selectedItem.name} for {selectedItem.cost}?</Typography>
          <GameButton onClick={() => handlePurchase(selectedItem)}>
            Confirm
          </GameButton>
        </Box>
      )}
    </GameDialog>
  );
};
```

### Conditional Rendering Based on Game State

Show different content based on the player's progress:

```typescript
export const GuildScreen: ModScreenFC = ({ screenAPI }) => {
  const { useSelector, actions, components } = screenAPI;
  const { GameDialog, GameButton } = components;

  const player = useSelector((state) => state.player.player);
  const { flags } = useGameFlags();

  const isGuildMember = flags['joined_guild'] || 0;
  const playerRealm = player.realm;

  return (
    <GameDialog title="Cultivator Guild" onClose={() => actions.setScreen('location')}>
      {!isGuildMember ? (
        // Not a member - show join option
        <Box>
          <Typography>Join the Cultivator Guild?</Typography>
          {playerRealm >= 3 ? (
            <GameButton onClick={() => {
              actions.setFlag('joined_guild', 1);
              actions.startEvent({ name: 'guild_initiation' });
            }}>
              Join Guild
            </GameButton>
          ) : (
            <Typography color="error">
              Minimum realm 3 required
            </Typography>
          )}
        </Box>
      ) : (
        // Is a member - show guild features
        <Box>
          <Typography>Welcome back, guild member!</Typography>
          <GameButton onClick={() => actions.setScreen('guild_missions')}>
            View Missions
          </GameButton>
        </Box>
      )}
    </GameDialog>
  );
};
```

### Handling User Input

For screens that need text input or complex forms:

```typescript
export const NamingScreen: ModScreenFC = ({ screenAPI }) => {
  const { actions, components } = screenAPI;
  const { GameDialog, GameButton } = components;

  const [petName, setPetName] = useState('');

  const handleSubmit = () => {
    if (petName.trim()) {
      actions.setModData('petMod', 'petName', petName);
      actions.setScreen('location');
    }
  };

  return (
    <GameDialog title="Name Your Pet" onClose={() => actions.setScreen('location')}>
      <TextField
        value={petName}
        onChange={(e) => setPetName(e.target.value)}
        placeholder="Enter pet name"
        fullWidth
      />
      <GameButton
        onClick={handleSubmit}
        disabled={!petName.trim()}
      >
        Confirm Name
      </GameButton>
    </GameDialog>
  );
};
```

## Custom data

When making a new screen, often you will need to store data about the new mechanics on that screen in the player's save game. This is where `modData` comes in.

```typescript
// Pull data from the save state
const myData = useSelector(state => state.mod.data["myMod"]?.["myField"]); // Always use ?. to ensure type safe handling

// Write data to the save state
actions.setModData("myMod", "myField", 4)
```

This supports arbitrarily objects, so you can store whole data structures in your mods particular data area. You can even inspect and build off data from other mods, if you desire.
