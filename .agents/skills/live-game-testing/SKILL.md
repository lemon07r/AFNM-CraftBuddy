---
name: live-game-testing
description: Safe CraftBuddy installed-client testing workflow. Activate only when runtime oracle and harness checks are insufficient and visual/runtime behavior must be validated in the actual AFNM Electron client.
---

# Live Game Testing

Live UI testing is manual/opt-in. Prefer `runtime-oracle` for API checks and `craftbuddy-ui-validation` for harness checks.

## Before Launching

```bash
bun run build
```

Copy `builds/afnm-craftbuddy.zip` into the installed game's `mods/` directory. Do this after every rebuild.

## Safe Launch Rules

- Do not launch through Steam by default.
- Do not use the repo as the working directory; the game can write `settings.json` there.
- Create the installed-game `disable_steam` sentinel before direct launch.
- Delete `disable_steam` immediately after testing, even on failure.
- Use `--remote-debugging-port=9222` only when browser/CDP inspection is needed.

## Typical Linux Launch

```bash
"/home/lamim/.local/share/Steam/steamapps/common/Ascend From Nine Mountains/launch-native.sh" --remote-debugging-port=9222
```

Run from the installed game directory or another non-repo working directory.

## Automated Evidence

When CDP is available, use `agent-browser` to capture screenshots/snapshots or evaluate CraftBuddy debug state. Keep this optional; not every environment has `agent-browser`.

## Gotchas

1. **`disable_steam` left behind disables Workshop mods**: always clean it up.
2. **Stale zip masks fixes**: rebuild and recopy before retesting.
3. **Mod Manager requires its own CONTINUE**: apply mod enable/disable state before loading a save.
4. **Use live UI only for questions the oracle/harness cannot answer**.

## References

- `docs/project/TESTING.md`
- `craftbuddy-ui-validation` skill
- `runtime-oracle` skill
