# Repository Guidelines

## Code Search

Use Vera before opening many files when you need to locate behavior: `vera search "goal"`, `vera grep "pattern"`, `vera references <symbol>`, or `vera overview`. Use normal text search for small, known scopes.

## Project Structure

- `src/mod.ts`: mod metadata and bootstrap.
- `src/modContent/`: AFNM runtime boundary, ModAPI/root-state adapters, auto-craft controller/executor, replay snapshot export.
- `src/optimizer/`: pure crafting simulation/search logic; no runtime, DOM, or UI access.
- `crates/craftbuddy-engine/`: Rust/WASM MCTS engine used by the Experimental optimizer setting.
- `src/ui/`: React/MUI recommendation, settings, and overlay UI.
- `src/settings/`, `src/utils/`: persisted settings and shared helpers.
- `src/__tests__/`: Jest unit, simulation, replay, and integration regressions.
- `docs/project/`: authoritative docs; `docs/reference/`: curated non-authoritative AFNM/crafting references; `archive/`: historical snapshots only.
- Generated outputs (`dist/`, `builds/`, `coverage/`, `tmp/`) are artifacts and should not be committed.

## Project Skills

Skills in `.agents/skills/` are tracked with this repo and should carry detailed workflow guidance. Start with `afnm-modding`, then route by task:

- `craftbuddy-optimizer`: scoring, search, move ordering, replay/simulation regressions, Rust/WASM MCTS.
- `craftbuddy-runtime-integration`: `src/modContent/*`, ModAPI/root-state, DOM fallback, replay snapshots, auto-action bridge.
- `craftbuddy-ui-validation`: overlay/settings UI and browser harness evidence.
- `craftbuddy-release`: version bump, Workshop item `3661729323`, tag/GitHub release order.
- `pre-commit-validation`: choose final validators before claiming completion or committing.
- `runtime-oracle`, `modapi-lookup`, `live-game-testing`: installed-runtime checks and optional live validation.
- `typescript-afnm`, `typescript-best-practices`: TypeScript conventions.

## Build, Test, and Development Commands

- `bun install`: install dependencies.
- `bun run typecheck`: TypeScript strict-mode check.
- `bun run test` / `bun run jest src/__tests__/<file>.test.ts`: full or focused Jest tests.
- `bun run wasm:test`: Rust engine unit tests.
- `bun run wasm:build`: compile Rust/WASM and regenerate the inline WASM module.
- `bun run build`: production webpack build and package `builds/afnm-craftbuddy.zip`.
- `bun run ui:harness:build` then `bun run ui:harness:serve`: browser harness at `http://127.0.0.1:4173`.
- `bun run runtime:oracle`, `bun run runtime:extract`, `bun run runtime:grep -- "<pattern>"`: installed-game runtime verification without launching the game UI.
- `bun run docs:inventory` then `bun run docs:check`: required after docs/skills changes.
- `bun run release:validate`: release gate (`typecheck`, `test`, `build`, `docs:check`); run `docs:inventory` first if docs changed.
- `bun run workshop:upload -- --change-note "vX.Y.Z - ..."`: upload to Workshop after release validation and commit/push.

## Workflow Rules

- Keep optimizer/search logic pure in `src/optimizer/*`; game access belongs in `src/modContent/*`.
- Runtime data-source priority: use the direct Redux store only where synchronous dispatch notifications are required, otherwise prefer `window.modAPI.subscribe()` / `window.modAPI.getGameStateSnapshot()`, then hook payloads, controlled DOM fallback, and local cache fallback.
- Treat the installed runtime as authoritative when docs, types, and observed behavior disagree.
- Use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` before opening broad reference docs.
- Do not launch the installed game UI by default. Use `runtime:oracle` first; live UI is opt-in and must avoid leaving `disable_steam` behind.
- Use strict TypeScript, optional chaining for ModAPI access, and `unknown` + narrowing instead of `any`.
- Formatting follows `.prettierrc`: 2 spaces, single quotes, trailing commas, LF endings.

## Documentation And Skill Stewardship

Docs and skills are editable working assets. If any doc or `.agents/skills/*` file is wrong, stale, duplicated, or misleading, fix it in the same change instead of leaving traps for later agents. Keep additions concise; move long procedures to task-specific skills or `docs/project/*`.

## Validation Expectations

Use `pre-commit-validation` for the exact matrix. Minimum defaults:

- Source changes: `bun run typecheck` and relevant Jest tests; run `bun run test` before finalizing behavior changes.
- Optimizer/search changes: add or update simulation/replay coverage and run the focused test plus `bun run test`.
- Runtime/ModAPI changes: run `bun run runtime:oracle` and targeted `runtime:grep` in addition to tests.
- UI changes: build the harness and capture browser evidence when layout/interaction changed.
- Docs/skills changes: run `bun run docs:inventory` and `bun run docs:check`.
- Build/package/release changes: run `bun run build`; for releases run `bun run release:validate`.

## Commit, PR, and Release Notes

Use established commit prefixes (`feat:`, `fix:`, `docs:`, `perf:`, `chore(release):`) and keep commits scoped. PRs should include summary, validation evidence, screenshots for UI work, and explicit notes for gameplay-impacting changes. For publishing, follow `craftbuddy-release` and `docs/project/RELEASE_PROCESS.md`; push the release commit before Workshop upload/tagging.
