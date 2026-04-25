---
name: afnm-modding
description: CraftBuddy orientation for Ascend From Nine Mountains mod work. Activate first for AFNM-CraftBuddy tasks to route into optimizer, runtime integration, UI validation, ModAPI lookup, validation, and release skills without bulk-loading docs.
---

# AFNM-CraftBuddy Orientation

Use this as the entry skill for CraftBuddy work. It routes to narrower skills and keeps always-loaded context small.

## Activate When

- Starting any task in `AFNM - CraftBuddy`
- Unsure which docs or skill apply
- Working with AFNM ModAPI, runtime state, crafting optimizer behavior, UI overlay, or releases

## Repository Map

| Path | Role |
| --- | --- |
| `src/mod.ts` | mod bootstrap and metadata export |
| `src/modContent/` | game/runtime integration boundary, auto-craft controller/executor |
| `src/optimizer/` | pure TypeScript crafting simulation and search |
| `crates/craftbuddy-engine/` | Rust/WASM MCTS root-policy prior |
| `src/ui/` | React/MUI recommendation, settings, and overlay UI |
| `src/settings/` | persisted user settings and search config mapping |
| `src/__tests__/` | Jest unit, simulation, replay, and integration regressions |
| `docs/project/` | authoritative project documentation |
| `docs/reference/` | curated non-authoritative AFNM/crafting references |

## Route By Task

| Task | Skill |
| --- | --- |
| Search scoring, move ordering, MCTS, optimizer regressions | `craftbuddy-optimizer` |
| `src/modContent/*`, ModAPI/root-state, DOM fallback, action execution | `craftbuddy-runtime-integration` |
| Overlay/settings UI, browser harness, screenshots, visual checks | `craftbuddy-ui-validation` |
| Hook/action/util signatures or ModAPI availability | `modapi-lookup`, then `runtime-oracle` |
| Build/type/test/docs checks before claiming done | `pre-commit-validation` |
| Live installed-client validation | `live-game-testing` |
| Workshop/GitHub release | `craftbuddy-release` |
| General TS work | `typescript-afnm`, then `typescript-best-practices` |
| Debugging failures or regressions | `systematic-debugging` |

## Project Rules

1. Keep optimizer logic pure in `src/optimizer/*`; game access belongs in `src/modContent/*`.
2. Installed runtime output is authoritative when docs, types, and behavior disagree.
3. Use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` before opening broader reference docs.
4. Do not launch the installed game UI by default. Use `runtime-oracle` first; live UI is opt-in.
5. Fix stale/wrong docs and skills in the same change instead of deferring.

## Gotchas

1. **`onReduxAction` is reducer-time**: keep it read-only and side-effect-free; prefer `subscribe()` or delayed dispatch for reactions.
2. **`disable_steam` breaks Workshop mods if left behind**: live testing must delete the sentinel after launch testing.
3. **Search fixes need regression proof**: recommendation changes should have simulation/replay tests, not just tuned constants.
4. **Wall-clock budgets are machine-dependent**: assert completed depth/frontier or node-budget behavior, not one machine's partial frontier.

## References

- `AGENTS.md` — commands and hard rules
- `docs/project/START_HERE_FOR_AGENTS.md` — doc load order and code entrypoints
- `docs/project/ARCHITECTURE.md` — module map
