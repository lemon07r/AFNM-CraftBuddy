---
name: craftbuddy-runtime
description: Use for ModAPI lookup, craft-state extraction, auto-craft execution, replay payloads, runtime parity audits, or installed-client testing.
---

# Runtime integration

`docs/DEVELOPMENT.md` maps the adapter and its validation; `docs/MECHANICS_PARITY.md` lists contracts and gaps. `docs/RUNTIME_EVIDENCE.md` is an on-demand evidence log, with a current-state index.

## Lookup and implementation

```bash
bun run runtime:oracle
bun run runtime:extract
bun run runtime:grep -- "getGameStateSnapshot|onReduxAction|injectUI"
```

- Prefer a targeted bundle lookup over launching the game to check a symbol. Cache provenance comes from the installed ASAR; `AFNM_GAME_DIR` can select another install. Minified aliases change between builds, so follow exports rather than reusing an old identifier.
- Upstream examples/docs are in the AfnmExampleMod repository (usually a sibling checkout, `../AfnmExampleMod`); declarations are in `node_modules/afnm-types`. Community crafting guides are hypotheses until checked against runtime code.
- Keep drift-prone access in `src/modContent/`, optional-chain APIs, and retain fallbacks that are still needed. Live scaling providers are not automatically safe for hypothetical optimizer states.
- Prefer `subscribe()` / `getGameStateSnapshot()` for normal reads. `onReduxAction` is reducer-time: read-only observation there avoids nested dispatch/reducer hazards.
- Harmony is player-selected, not item-derived. Preserve all nine hydration variants, droplets, cost channels, mastery entries, buff definitions/internal state and replay provenance; missing fields have silently restarted state machines before.
- User-facing labels use `techniqueDisplayName()`; matching and dispatch use internal `name`. The DOM fallback needs both aliases (“False Fusion” / “Strive for Completion”).
- Native auto-use runs in the technique's UI handler before dispatch. With an active loadout, use that control rather than a direct technique dispatch that skips the items. Unknown slot conditions conservatively withhold duplicate CraftBuddy item actions.
- `trainingMode !== undefined` suppresses inventory removal; it is not a truthiness check. Consumed pills belong to the crafting slice, not progress state.
- On an auto-mode stall, inspect revision verification, native-auto-use policy/settling, then the state-advance latch. A stale state recalculates; an unreadable state pauses. A late advance resumes, unchanged state retries once, then an armed pause is recoverable rather than a crash.
- There is no manual Finish. Automation never invents one: an auto-resolved result stops without input, and `Wait` is dispatched like any other technique.

## Live testing: escalate only for unanswered runtime/visual questions

Prefer static oracle checks and the UI harness first because launching the installed client can disrupt a running session. When live testing is warranted:

1. `bun run build`, then copy `builds/afnm-craftbuddy.zip` into the install's `mods/` directory; the game reads that zip, not the worktree.
2. Launch from the **game directory**, not the repo (the launcher writes relative `settings.json`). For an isolated direct launch, create the install's `disable_steam` sentinel and arrange cleanup even on failure; leaving it behind disables Workshop mods. Avoid a default Steam launch.
3. A typical Linux direct command is `./launch-native.sh --remote-debugging-port=9222` from the install. The port is needed only for CDP inspection; shared `agent-browser` / Electron skills cover that tooling.
4. Apply Mod Manager changes with its own CONTINUE before loading a save. Capture the relevant screenshot/replay, then remove `disable_steam` immediately after testing.

`modAPI.gameData.registerOptionsUI` and top-level `modAPI.injectUI` exist, but CraftBuddy currently mounts its own overlay. Verify their signatures before adopting them; availability is not adoption.
