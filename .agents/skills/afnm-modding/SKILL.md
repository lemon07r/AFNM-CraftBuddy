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

## Validation Routing

Use `pre-commit-validation` to choose checks by touched area. For docs/skills-only changes, the default path is `bun run docs:inventory` followed by `bun run docs:check`.

## Project Rules

1. Keep optimizer logic pure in `src/optimizer/*`; game access belongs in `src/modContent/*`.
2. Use the direct Redux store only where synchronous dispatch notifications are required; otherwise prefer `modAPI.subscribe()` / `getGameStateSnapshot()`, hook payloads, controlled DOM fallback, then local cache fallback.
3. Treat installed runtime output as authoritative when docs, types, and behavior disagree.
4. Use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` before opening broader reference docs.
5. Do not launch the installed game UI by default. Use runtime oracle first; live UI is opt-in.

## Documentation And Skill Stewardship

Docs and skills are editable working assets. If this skill, another skill, or any project doc is wrong, stale, duplicated, or unclear, correct it as soon as you notice it instead of deferring it to a later agent. Verify against the installed runtime, code, tests, or package scripts; keep skill bodies concise and move long details to references when needed.

## Gotchas

1. **Template skills can be stale in this repo**: use CraftBuddy-specific skills for optimizer, runtime, UI, and release tasks.
2. **`onReduxAction` is reducer-time**: keep it read-only and side-effect-free; prefer `subscribe()` or delayed dispatch for reactions.
3. **`disable_steam` breaks Workshop mods if left behind**: live testing must delete the sentinel after launch testing.
4. **Search fixes need regression proof**: recommendation changes should have simulation/replay tests, not just tuned constants.
5. **Wall-clock budgets are machine-dependent**: assert completed depth/frontier or node-budget behavior, not one machine's partial frontier.

## References

- `AGENTS.md` — compact repo conventions and commands
- `docs/project/START_HERE_FOR_AGENTS.md` — skill/doc routing
- `docs/project/ARCHITECTURE.md` — module map
- `docs/project/TESTING.md` — validation details
- `docs/project/DOCS_GOVERNANCE.md` — documentation policy
