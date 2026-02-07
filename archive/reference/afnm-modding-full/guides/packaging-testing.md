---
layout: default
title: Packaging & Testing
parent: Guides
nav_order: 3
description: 'Building and testing your AFNM mod'
---

# Packaging & Testing

## What This Guide Covers

Now that you've created mod content, you need to package it into a format the game can understand and test it thoroughly. This guide will show you how to:

- Build your mod into a distributable package
- Install and test your mod in the actual game
- Debug common issues and verify everything works
- Set up a smooth development workflow

Think of packaging as "exporting" your mod from development format into something the game can load and run.

## Building Your Mod Package

### The Build Process Explained

When you run the build command, several automated steps happen:

1. **TypeScript Compilation** - Your `.ts` code files become a single `.js` file
2. **Asset Processing** - Images and resources are optimized and included
3. **ZIP Package Creation** - Everything gets packaged into a mod file
4. **Metadata Generation** - Game-readable information is added

This process transforms your development project into a single file that players can install.

### Building Your Mod

**In VS Code terminal:**

```bash
npm run build
```

**What you should see:**

```
> your-mod@1.0.0 build
> vite build

✓ built in 2.34s

Build completed! Check the builds/ folder.
```

**Success indicators:**

- ✅ No red error messages
- ✅ New `builds/` folder appears in your project
- ✅ ZIP file inside like `mystic-tea-cultivation-1.0.0.zip`

### Understanding Build Output

After building, your `builds/` folder contains:

```
builds/
└── mystic-tea-cultivation-1.0.0.zip    # ← This is your mod!
    ├── mod.js                           # Your compiled TypeScript code
    ├── assets/                          # Your images and resources
    │   └── mystic-tea.png
    └── package.json                     # Mod information for the game
```

**The ZIP file is your complete mod** - this is what you'll install in the game and eventually upload to Steam Workshop.

### Build Configuration Files

Your build process is controlled by several files. Usually you won't need to change these, but here's what they do:

**`package.json`** - Your mod's identity card:

```json
{
  "name": "mystic-tea-cultivation",    # Mod's technical name
  "version": "1.0.0",                  # Version number
  "description": "Adds tea-based...",  # What your mod does
  "author": { "name": "TeaMaster" }    # Your name
}
```

**`tsconfig.json`** - TypeScript compiler settings (rarely needs changes)

**`vite.config.mts`** - Build tool configuration (advanced users only)

### Common Build Issues

**"Cannot find module '../assets/my-image.png'"**

- Your image file path is wrong or the file doesn't exist
- Solution: Check the file exists and the import path is correct

**"Build failed with TypeScript errors"**

- There are syntax errors in your code
- Solution: Look at the error messages, fix the red underlines in VS Code

**"Out of memory" or very slow builds**

- Your image files might be too large
- Solution: Resize images to recommended sizes (64x64 for items)

## Installing Your Mod for Testing

### Step 1: Find Your Game Installation

**Steam version:**

1. Open Steam Library
2. Right-click "Ascend from Nine Mountains"
3. Properties → Installed Files → Browse
4. This opens your game directory

**Typical locations:**

- **Steam:** `C:\Program Files (x86)\Steam\steamapps\common\Ascend from Nine Mountains\`
- **Direct download:** Wherever you installed it

**You should see:** `Ascend from Nine Mountains.exe` in this folder

### Step 2: Create Mods Folder

**In your game directory:**

1. Create a new folder called `mods` (lowercase, no spaces)
2. **Final structure should be:**
   ```
   Ascend from Nine Mountains/           # ← Game directory
   ├── Ascend from Nine Mountains.exe    # ← Game executable
   └── mods/                             # ← New folder you create
   ```

### Step 3: Install Your Mod

1. **Copy your mod ZIP file** from your project's `builds/` folder
2. **Paste it into the `mods/` folder** you just created
3. **Do NOT unzip it** - the game loads ZIP files directly

**Final structure:**

```
Ascend from Nine Mountains/
├── Ascend from Nine Mountains.exe
└── mods/
    └── mystic-tea-cultivation-1.0.0.zip    # ← Your mod
```

## Testing Your Mod In-Game

### Step 1: Launch the Game

1. **Start the game** normally (from Steam or by double-clicking the exe)
2. **Check the main menu** - you should see mod loading messages
3. **Look for your mod name** in the loading text

**Signs your mod loaded successfully:**

- No error popups on startup
- Mod name appears in loading messages
- Game starts normally

### Step 2: Test Your Content

**If you created an item (like our Mystic Tea example):**

1. **Start a new game** or load an existing save
2. **Visit the shop** where you added your item (e.g., Liang Tiao Village)
3. **Look for your item** in the shop inventory
4. **Try purchasing and using it**

**What to verify:**

- ✅ Item appears in shop with correct name and icon
- ✅ Item can be purchased (if you have enough money)
- ✅ Item effects work when consumed
- ✅ No error messages or crashes

### Enabling Debug Mode (Highly Recommended)

Debug mode shows detailed information about what's happening, making it much easier to troubleshoot issues.

**To enable debug mode:**

1. **Go to your game directory** (same folder as the exe)
2. **Create a new file** called `devMode` (no file extension)
   - Right-click in empty space → New → Text Document
   - Name it `devMode` (delete the `.txt` part)
3. **Restart the game**

**With debug mode enabled:**

- Console window appears showing detailed logs
- Mod loading information is visible
- Error messages are more descriptive
- You can see exactly what your mod is doing

**Structure with debug mode:**

```
Ascend from Nine Mountains/
├── Ascend from Nine Mountains.exe
├── devMode                              # ← Empty file, no extension
└── mods/
    └── mystic-tea-cultivation-1.0.0.zip
```

### Reading Debug Output

**Good signs in debug console:**

```
Loading mod: mystic-tea-cultivation-1.0.0.zip
Mod loaded successfully: mystic-tea-cultivation
Added item: Mystic Tea
Added item to shop: Mystic Tea at Liang Tiao Village
```

**Warning signs:**

```
Error loading mod: mystic-tea-cultivation-1.0.0.zip
TypeError: Cannot read property 'addItem' of undefined
Image not found: ../assets/missing-image.png
```

## Troubleshooting Common Issues

### Mod Not Loading

**"Mod doesn't appear in loading messages"**

- Check ZIP file is in correct `mods/` folder
- Ensure file isn't corrupted (try rebuilding: `npm run build`)
- Verify game directory is correct

**"Mod loads but content doesn't appear"**

- Enable debug mode to see error messages
- Check your `package.json` has correct mod name
- Verify you're calling `window.modAPI.actions.addItem()` etc.

### Content Not Working

**"Item doesn't appear in shop"**

- Verify the location name is spelled correctly ('Liang Tiao Village')
- Check you called both `addItem()` and `addItemToShop()`
- Ensure your realm requirement isn't too high

**"Images not showing"**

- Check image files exist in `src/assets/`
- Verify import paths are correct (`../assets/my-image.png`)
- Try rebuilding your mod

**"Effects not working"**

- Check effect names are spelled correctly ('restoreQi' not 'restoreQI')
- Verify syntax matches the examples
- Enable debug mode to see runtime errors

### Performance Issues

**"Game is slow/laggy with mod"**

- Check image file sizes (should be small, <100KB each)
- Avoid creating too many items/NPCs at once
- Use `npm run build` not `npm run dev` for testing

## Development Workflow

### Efficient Testing Cycle

**For quick iteration:**

1. **Make changes** to your mod code
2. **Build:** `npm run build`
3. **Copy new ZIP** to game's `mods/` folder (overwrite old one)
4. **Restart game** to test changes
5. **Repeat**

**Pro tip:** Keep both VS Code and the game folder open in separate windows for quick file copying.

### Version Management

**Before major changes:**

```bash
# Save your current work
git add .
git commit -m "Working tea item before adding NPCs"
```

**When releasing updates:**

```json
// In package.json, bump the version
"version": "1.0.1"  // Increment for bug fixes
"version": "1.1.0"  // Increment for new features
```

## Next Steps

🎉 **Excellent!** Your mod is now working in-game. You've successfully:

**✅ Completed the full development cycle:**

- Created mod content with the ModAPI
- Built a distributable package
- Installed and tested in the actual game
- Learned to debug issues when they arise

**Ready to share your creation?** The final step is publishing to Steam Workshop so other players can enjoy your mod.

Continue to: **[Publishing Your Mod](publishing)**
