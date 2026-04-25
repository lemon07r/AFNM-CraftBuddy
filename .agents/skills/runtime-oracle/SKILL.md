---
name: runtime-oracle
description: Verify CraftBuddy assumptions against the installed AFNM runtime. Activate when ModAPI fields, hooks, launcher behavior, crafting parity, root-state APIs, or docs/types disagree.
---

# Runtime Oracle

Use the installed AFNM bundle before trusting docs, types, historical notes, or screenshots.

## Commands

```bash
bun run runtime:oracle
bun run runtime:extract
bun run runtime:grep -- "getGameStateSnapshot|injectUI|onReduxAction"
bun run runtime:grep -- "basicBestCompletion|perfectBestCompletion|sublimeBestCompletion|poolCostFlat"
bun run runtime:grep -- "forgeWorks\\.heat>=2&&t\\.forgeWorks\\.heat<=3|recommendedTechniqueTypes|itemTypeToHarmonyType"
```

## Use For

- Checking ModAPI root-state methods, hooks, utility functions, and injected UI support.
- Resolving docs vs runtime disagreements in crafting mechanics.
- Verifying launcher behavior before any live UI test.
- Auditing game updates without launching the desktop client.

## Rules

- Installed runtime wins when docs/types disagree.
- Do not launch the full game to confirm a symbol exists; grep the extracted bundle.
- Cache invalidates by installed `app.asar` size and mtime.
- Override path only when needed: `AFNM_GAME_DIR="/path/to/game" bun run runtime:oracle`.

## Gotchas

1. **Minified code still contains useful symbols**: grep for multiple nearby names when one symbol is transformed.
2. **Launcher behavior matters**: `disable_steam` support and relative `settings.json` writes affect live-test safety.
3. **Runtime parity can invalidate tests**: update tests/docs to match installed behavior, not old reference notes.
