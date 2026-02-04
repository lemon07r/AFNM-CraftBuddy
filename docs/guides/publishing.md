---
layout: default
title: Publishing Your Mod
parent: Guides
nav_order: 4
description: 'Releasing your AFNM mod to the Steam Workshop'
---

# Publishing Your Mod

## Introduction

🎉 **Congratulations!** You've created, tested, and polished your AFNM mod. Now it's time to share it with the cultivation community through Steam Workshop. This guide covers the publishing process, optimizing your mod page, and managing updates.

Steam Workshop integration makes it incredibly easy for players to find, install, and automatically update your mods. It's the primary way AFNM players discover new content.

## Before You Publish - Checklist

Make sure your mod is ready for the community:

**Technical Requirements:**

- ✅ Mod builds without errors (`npm run build` works)
- ✅ Tested thoroughly in-game (no crashes, content works as expected)
- ✅ Version number is appropriate (start with "1.0.0" for first release)
- ✅ Package.json has clear name, description, and author info

**Content Quality:**

- ✅ Content is balanced and fits the game's theme
- ✅ Item descriptions and names are polished
- ✅ No placeholder text or debug content
- ✅ Images are appropriate resolution and style

**Community Considerations:**

- ✅ Mod adds meaningful content (not just test items)
- ✅ No copyrighted content from other games/media
- ✅ Content follows the game's mature but not explicit tone

## Steam Workshop Publishing

### Prerequisites

Before you can publish:

**Required:**

- **Steam Account** with Ascend from Nine Mountains in your library
- **Finished Mod** that's been tested and works correctly
- **Built Mod Package** (ZIP file from `npm run build`)

**Important:** You need to own the game on Steam to upload Workshop content, even if you developed the mod elsewhere.

### Getting the Mod Uploader Tool

AFNM provides a dedicated uploader tool that handles Steam Workshop integration:

**Download Location:**

1. Navigate to your forked repository (or the original example mod repo)
2. Look for `/uploader/Mod Uploader 1.0.0 Portable.exe`
3. Download this tool to your computer

### Publishing Process - Step by Step

#### 1. Launch the Uploader

- Run `Mod Uploader 1.0.0 Portable.exe`
- The tool should automatically detect your Steam installation
- If prompted, log into Steam

#### 2. Create New Workshop Entry

- Click **"Upload New Mod"** or similar button
- **Select your mod's ZIP file** from your project's `builds/` folder

#### 3. Configure Workshop Listing

**Essential Fields:**

- **Title:** Usually matches your mod's name from `package.json`
- **Description:** Detailed explanation of what your mod adds (see writing tips below)
- **Preview Image:** Eye-catching screenshot or logo representing your mod
- **Visibility:** Start with "Friends Only" for initial testing, then set to "Public"

**Tags** (select relevant ones):

- Content types: "Items", "Characters", "Locations", "Techniques"
- Themes: "Cultivation", "Tea", "Combat", "Exploration"
- Difficulty: "Beginner Friendly", "Challenging"

#### 4. Upload and Process

- Click **"Upload"** to begin the process
- The uploader packages and sends your content to Steam
- **Wait for completion** - this may take a few minutes depending on your mod size
- Steam will process and validate your submission

#### 5. Workshop Page Finalization

- Once uploaded, Steam automatically creates your Workshop page
- You can edit additional details in Steam's Workshop interface
- Add extra screenshots, detailed changelogs, etc.

### Updating Your Published Mod

When you want to release updates:

1. **Update your mod code** and test the changes
2. **Bump the version** in `package.json` (e.g., "1.0.0" → "1.0.1")
3. **Build the updated mod:** `npm run build`
4. **Open the uploader tool**
5. **Select your existing mod** from the list
6. **Choose the new ZIP file**
7. **Click "Update"**

Steam Workshop will automatically notify subscribers and update their local copies.

## Writing an Effective Workshop Page

### Description Template

Here's a proven template for mod descriptions:

```markdown
# [Mod Name] - Brief Tagline

[2-3 sentence overview of what your mod adds and why it's interesting]

## ✨ Features

**Items & Equipment:**

- 🍵 15+ New Tea-Based Consumables - Each with unique effects and cultivation benefits
- ⚔️ 3 Legendary Tea Sets - Artifact equipment for tea masters
- 🏮 Mystical Tea Tools - Brewing implements that enhance your abilities

**Characters & Story:**

- 👴 Master Chen - Wise tea cultivator with challenging quests
- 🏪 Hidden Tea Shop - Discover rare brews in the mountains
- 📚 Tea Cultivation Manual - Learn the ancient ways

**New Locations:**

- 🏔️ Celestial Tea Gardens - Peaceful cultivation ground
- 🏛️ Ancient Tea Ceremony Hall - Test your brewing skills

## 🎯 Gameplay Integration

- **Balanced Progression:** Content scales from Body Forging to Heavenly Realm
- **Save Compatible:** Works with existing saves and other mods
- **Quest Integration:** New storylines that tie into the main campaign
- **No Conflicts:** Tested with popular mod combinations

## 📋 Requirements

- Any cultivation realm (content scales appropriately)
- Compatible with save games and other mods
- No special installation - just subscribe and play!

## 🔄 Recent Updates

**v1.0.1 (Latest):**

- Fixed tea brewing animation timing
- Balanced rare tea drop rates
- Added compatibility with Expanded Cultivation mod

---

_Enjoy your journey into the mystical world of tea cultivation!_
```

### Key Elements for Success

**Essential Information:**

- **Feature list** with specific numbers ("15+ items" not "many items")
- **Compatibility info** (realm requirements, save compatibility, mod conflicts)
- **Screenshots** showing your content in action
- **Regular updates** in the description when you release new versions

**What Makes Players Subscribe:**

- Clear, organized presentation with headers and bullet points
- Emojis for visual appeal (but don't overuse)
- Specific examples of what they'll get
- Reassurance about balance and compatibility

## Building Your Modding Community

### Getting Initial Visibility

**At Launch:**

- Share in AFNM Discord/Reddit communities (follow their promotion rules)
- Ask friends to test and provide feedback
- Start with clear, descriptive screenshots
- Respond promptly to questions and bug reports

### Long-term Success

**Keep players engaged:**

- Regular updates with new content or fixes
- Listen to community feedback and implement requested features
- Collaborate with other modders for compatibility
- Document known issues and planned features

**Build trust:**

- Test thoroughly before releasing updates
- Use semantic versioning (1.0.0 → 1.0.1 for fixes, 1.1.0 for features)
- Be transparent about what changes between versions
- Maintain backwards compatibility when possible

## Common Publishing Mistakes to Avoid

❌ **Don't:**

- Upload without thorough testing
- Use placeholder descriptions like "My first mod"
- Promise features you haven't implemented yet
- Upload copyrighted content from other games
- Forget to update version numbers when releasing fixes

✅ **Do:**

- Test with a fresh save and existing saves
- Write clear, specific descriptions of what your mod adds
- Include screenshots that show your content
- Respond to user comments and bug reports
- Keep your Workshop page updated

## Troubleshooting Publishing Issues

**"Upload fails with network error"**

- Check Steam is running and you're logged in
- Try uploading during off-peak hours
- Ensure your mod ZIP file isn't corrupted

**"Mod appears but subscribers can't see content"**

- Verify your mod builds correctly (`npm run build`)
- Check that assets are included in the ZIP
- Test the uploaded version yourself by subscribing

**"Workshop page shows wrong information"**

- Update your `package.json` and rebuild before uploading
- Use the Steam Workshop web interface to edit details
- Remember changes may take a few minutes to appear

---

🎉 **Congratulations!** You've successfully completed the full AFNM modding journey from setup to Steam Workshop publication.

**You've learned:**

- ✅ Setting up a professional development environment
- ✅ Using the ModAPI to create engaging content
- ✅ Building, testing, and debugging your mods
- ✅ Publishing and promoting your work to the community

**Welcome to the AFNM modding community!** Your contributions help make the cultivation journey richer and more diverse for all players. Whether you continue expanding this mod or start new projects, you now have all the tools and knowledge needed for successful modding.
