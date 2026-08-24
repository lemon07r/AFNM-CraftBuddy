---
name: runtime-oracle
description: Verify CraftBuddy assumptions against the installed AFNM runtime. Activate when ModAPI fields, hooks, launcher behavior, crafting parity, root-state APIs, or docs/types disagree.
---

# Runtime Oracle

Use the installed AFNM bundle before trusting docs, types, historical notes, or screenshots. Current target: **0.7.9**.

## Commands

```bash
bun run runtime:oracle
bun run runtime:extract
bun run runtime:grep -- "getGameStateSnapshot|injectUI|onReduxAction"
bun run runtime:grep -- "basicBestCompletion|perfectBestCompletion|sublimeBestCompletion|poolCostFlat"
bun run runtime:grep -- "forgeWorks\\.heat>=2&&t\\.forgeWorks\\.heat<=3|recommendedTechniqueTypes"
bun run runtime:grep -- "complexityMultiplier|harmonyAugment|startingHarmony"
bun run runtime:grep -- "currentCraftingAutoUseLoadout|pillsPerRound|pillTracking"
```

Already extracted and written down — read `docs/project/RUNTIME_EVIDENCE.md` instead of re-deriving: the native auto-use hook and its 10-rule slot selector, the absence of a `Finish Craft` action, `Wait`'s 10 stability cost, the Spiritual Resonance formulas (`-9`, not the `-15` in the log text), and the 0.7.6 Eccentric Decree `onBarChange` hook.

## Use For

- Checking ModAPI root-state methods, hooks, utility functions, and injected UI support.
- Resolving docs vs runtime disagreements in crafting mechanics.
- Verifying launcher behavior before any live UI test.
- Auditing game updates without launching the desktop client.

## Rules

- Installed runtime wins when docs/types disagree.
- Symbol names are minified and **not stable across builds**. Resolve them through re-export aliases (`rg -o "[A-Za-z_$]{1,10} as <alias>"`) rather than reusing identifiers from an older transcript.
- Do not launch the full game to confirm a symbol exists; grep the extracted bundle.
- Cache invalidates by installed `app.asar` size and mtime.
- Override path only when needed: `AFNM_GAME_DIR="/path/to/game" bun run runtime:oracle`.

## Gotchas

1. **Minified code still contains useful symbols**: grep for multiple nearby names when one symbol is transformed.
2. **Launcher behavior matters**: `disable_steam` support and relative `settings.json` writes affect live-test safety.
3. **Runtime parity can invalidate tests**: update tests/docs to match installed behavior, not old reference notes.
4. **Removed APIs are findings too**: 0.7.5 deleted the item-type → harmony-type mapping utility and 0.7.9 has not brought it back (`hasItemTypeToHarmonyType` is still false). If a grep for a helper comes back empty, check whether the game dropped it before assuming a bad pattern.
5. **Record what you extract**: a verified snippet belongs in `docs/project/RUNTIME_EVIDENCE.md`, because `tmp/` is not committed and the next agent cannot see your terminal.
6. **Harmony hook timing changed in 0.7.6**: Eccentric Decree scores from an `onBarChange` hook fired inside every completion/perfection application, not once per turn from `processEffect`. When auditing a harmony, grep for the per-application hook before assuming end-of-turn resolution.
7. **Display names are a separate field**: 0.7.6 renamed "False Fusion" to "Strive for Completion" via `displayName` only. Grep by internal `name`/key (`False Fusion`, `false_fusion`); a UI-string search will miss it.

## References

- `docs/project/RUNTIME_EVIDENCE.md`
- `docs/project/MECHANICS_PARITY.md`
