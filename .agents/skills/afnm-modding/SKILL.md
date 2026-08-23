---
name: afnm-modding
description: CraftBuddy orientation for Ascend From Nine Mountains mod work. Activate first for AFNM-CraftBuddy tasks to route into optimizer, runtime integration, UI validation, ModAPI lookup, validation, and release skills without bulk-loading docs.
---

# AFNM-CraftBuddy Orientation

Use this as the entry skill for CraftBuddy work. It routes to narrower skills and keeps always-loaded context small. Target game version: AFNM **0.7.8**.

## Activate When

- Starting any task in `AFNM - CraftBuddy`
- Unsure which docs or skill apply
- Working with AFNM ModAPI, runtime state, crafting optimizer behavior, UI overlay, or releases

## Repository Map

| Path | Role |
| --- | --- |
| `src/mod.ts` | mod bootstrap and metadata export |
| `src/modContent/` | game/runtime integration boundary, auto-craft controller/executor |
| `src/optimizer/` | pure TypeScript crafting simulation and search, behind the `index.ts` facade |
| `src/optimizer/outcome.ts` | the single authority for bands, outcome tiers and the auto-finish predicate |
| `crates/craftbuddy-engine/` | Rust/WASM engine: full mechanics parity, used as an MCTS root-policy prior |
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

1. Keep optimizer logic pure in `src/optimizer/*`; game access belongs in `src/modContent/*`, and everything outside the optimizer imports only `src/optimizer/index.ts`.
2. Installed runtime output is authoritative when docs, types, and behavior disagree.
3. Use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` before opening broader reference docs.
4. Do not launch the installed game UI by default. Use `runtime-oracle` first; live UI is opt-in.
5. Fix stale/wrong docs and skills in the same change instead of deferring.

## Gotchas

1. **`onReduxAction` is reducer-time**: keep it read-only and side-effect-free; prefer `subscribe()` or delayed dispatch for reactions.
2. **`disable_steam` breaks Workshop mods if left behind**: live testing must delete the sentinel after launch testing.
3. **Search fixes need regression proof**: recommendation changes should have simulation/replay tests, not just tuned constants.
4. **Wall-clock budgets are machine-dependent**: assert completed depth/frontier or node-budget behavior, not one machine's partial frontier.
5. **The 0.7.5 rework set the fundamentals, still true in 0.7.8**: harmony is player-selected across seven types with complexity multipliers, outcome tiers are conjunctive band gates, there is no manual Finish Craft, and the game applies its own crafting auto-use loadout before every technique. Any note saying otherwise predates 0.7.5.
6. **Thresholds live in one place**: never recompute a band, tier or auto-finish check outside `src/optimizer/outcome.ts`.
7. **Harmony no longer always resolves once per turn**: since 0.7.6, Eccentric Decree scores per individual bar change (`onBarChange`), so one turn can award several harmony steps (+5 focused, -15 stray since 0.7.8) and switch its focused bar mid-turn. Model it as an ordered fold over bar-change events, and leave the `needsBarContributions()` / `needs_bar_contributions()` gate alone — it is a live allocation guard, not dead code.
8. **Display names diverge from internal names**: key `false_fusion`, internal `name` `False Fusion`, shown to players as "Strive for Completion". User-facing strings must go through `techniqueDisplayName()` (from `src/optimizer/index.ts`); keys, lookups and tests keep using `name`. The auto-craft DOM click fallback is the one place that needs both spellings, since the button carries the display name.
9. **Band ambition is a user setting, the outcome model is not**: since 6.4.0 `perfectionBandGoal` and `completionBandCeiling` (`0` = auto) let the player aim past or stop short of the tier requirement. They only change the goal the search works toward — tier requirements, band thresholds and `willAutoFinish` still come solely from `src/optimizer/outcome.ts`.
10. **Auto mode recovers instead of dying**: an unobserved state advance re-reads the live signature, resumes if the action landed, resends once if it did not, and otherwise degrades to a recoverable armed pause. Any note claiming auto mode hard-errors on a missed state advance predates 6.4.0.

## References

- `AGENTS.md` — commands and hard rules
- `docs/project/START_HERE_FOR_AGENTS.md` — doc load order and code entrypoints
- `docs/project/ARCHITECTURE.md` — module map
- `docs/project/RUNTIME_EVIDENCE.md` — verified runtime behaviour
- `docs/project/RELEASE_NOTES_6.3.0.md` — the 0.7.8 retarget
- `docs/project/RELEASE_NOTES_6.1.0.md` — the 0.7.6 retarget (historical)
- `docs/project/RELEASE_NOTES_6.4.0.md` — latest release: ambition targets and auto-mode recovery
- `docs/project/RELEASE_NOTES_6.0.0.md` — what the 0.7.5 rework changed (historical)
