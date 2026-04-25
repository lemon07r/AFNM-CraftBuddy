# Repository Guidelines

## Code Search

Use Vera before opening many files or running broad text search when you need to find where logic lives or how a feature works.

- `vera search "query"` for semantic code search. Describe behavior: "JWT validation", not "auth". If one phrasing misses, try 2-3 varied queries or add `--intent "goal"`.
- `vera grep "pattern"` for exact text or regex in indexed files
- `vera references <symbol>` for callers and callees
- `vera overview` for a project summary (languages, entry points, hotspots)
- `vera search --deep "query"` for RAG-fusion query expansion + merged ranking
- Narrow `vera search` or `vera grep` with `--lang`, `--path`, `--type`, or `--scope docs`
- `vera watch .` to auto-update the index, or `vera update .` after edits (`vera index .` if `.vera/` is missing)
- For detailed usage, query patterns, and troubleshooting, read the Vera skill file installed by `vera agent install`

## Project Structure & Module Organization

- `src/mod.ts` is the entry point for mod metadata and bootstrapping.
- `src/modContent/` contains game integration and runtime wiring.
- `src/optimizer/` holds core crafting logic (`state.ts`, `skills.ts`, `search.ts`, `harmony.ts`).
- `src/ui/` contains React panels like `RecommendationPanel.tsx` and `SettingsPanel.tsx`.
- `src/settings/` and `src/utils/` contain configuration and shared helpers.
- `src/__tests__/` contains unit tests, with mocks under `src/__tests__/__mocks__/`.
- `docs/project/` is authoritative project documentation; `docs/dev-requests/` tracks API requests; `docs/history/` is historical context; `docs/reference/` is a curated non-authoritative reference subset.
- `archive/` stores large/deprecated documentation snapshots (for traceability only) and is intentionally excluded from active docs checks/inventory.
- `scripts/zip-dist.js` handles packaging.
- Generated outputs (`dist/`, `builds/`, `coverage/`) are build artifacts and are gitignored.

## Build, Test, and Development Commands

- `bun install`: install dependencies.
- `bun run build`: run webpack production build and package the mod zip to `builds/`.
- `bun run wasm:build`: compile the Rust engine and generate the inline WASM module used by the Experimental optimizer engine.
- `bun run wasm:test`: run Rust unit tests for the native MCTS engine.
- `bun run workshop:upload -- --change-note "..."`: build CraftBuddy and upload `builds/afnm-craftbuddy.zip` to the configured Steam Workshop item via the sibling `../ModUploader-AFNM` repo. Add `--description-file docs/project/WORKSHOP_DESCRIPTION.md` when the public Workshop description changes. Requires Steam running locally.
- `bun run test`: run all Jest tests once.
- `bun run test:watch`: run tests in watch mode while iterating.
- `bun run test:coverage`: generate coverage reports in `coverage/` (text, lcov, html).
- `bun run ui:harness:build`: build the browser UI harness into `tmp/ui-harness/`.
- `bun run ui:harness:serve`: serve the UI harness at `http://127.0.0.1:4173` for `agent-browser`.
- `bun run runtime:oracle`: extract/cache the installed game's `app.asar` and print a parity summary (version, forge bands, ModAPI exposures, Steam/settings behaviors).
- `bun run runtime:extract`: print the cached extracted runtime directory for the installed game.
- `bun run runtime:grep -- "<pattern>"`: grep the extracted installed runtime without launching the game UI.
- `"/home/lamim/.local/share/Steam/steamapps/common/Ascend From Nine Mountains/launch-native.sh" --remote-debugging-port=9222`: optional manual live UI path only; do not use by default because it is disruptive and not standardized for headless automation in this repo.
- `bun run docs:check`: validate docs links/freshness/authority.
- `bun run docs:inventory`: regenerate `docs/DOC_INVENTORY.md`.
- `bun run jest src/__tests__/search.test.ts`: run a focused test file.

## Documentation Workflow

- Start technical onboarding at `docs/project/START_HERE_FOR_AGENTS.md`.
- Treat `docs/project/*` as implementation source of truth, then verify against code/tests.
- Use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` before opening any other reference docs.
- Use `archive/` only when the curated/active docs are insufficient.
- When a task is finished, do a lean docs pass for any changed behavior, workflow, or tooling. Update stale/inaccurate docs if needed, but keep additions concise and avoid padding.
- If patch notes, documentation, and runtime behavior disagree, verify against the installed-runtime oracle before changing mechanics/tests, then update the authoritative docs to match the observed runtime.
- If you change docs, run `bun run docs:inventory` and `bun run docs:check` before committing.
- Use `docs/project/RELEASE_PROCESS.md` for the concrete version bump, commit, push, tag, GitHub release, and Workshop upload pipeline.
- See `docs/project/DOCS_GOVERNANCE.md` for the full docs model, metadata requirements, and update policy.

## Coding Style & Naming Conventions

- Use TypeScript (`strict` mode) and React TSX.
- Formatting is controlled by `.prettierrc`: 2 spaces, single quotes, trailing commas, LF endings, no tabs.
- Use `PascalCase` for React components (`SettingsPanel.tsx`), `camelCase` for utility/module files (`largeNumbers.ts`), and `*.test.ts` for tests.
- Keep optimizer/game-state logic pure where possible; keep side effects inside integration modules in `src/modContent/`.

## Testing Guidelines

- Framework: Jest + `ts-jest` with `testEnvironment: 'node'`.
- Add tests in `src/__tests__/` and mirror feature names (`skills.test.ts`, `state.test.ts`, etc.).
- For changes in `src/optimizer/`, include cases for target completion, stability/Qi limits, and condition or buff interactions.
- Run `bun run test` before pushing; use coverage checks for larger refactors.
- For `src/ui/` layout or interaction changes, also use the committed browser harness with `agent-browser`; see `docs/project/TESTING.md`.
- For runtime/mechanics parity work, prefer the installed-runtime oracle in `docs/project/TESTING.md`; do not launch the installed game UI by default.
- For ModAPI/localization/integration work, prefer documented root-state APIs (`window.modAPI.subscribe`, `window.modAPI.getGameStateSnapshot`) over DOM/fiber probing. If DOM fallback is unavoidable, prefer structural selectors and numeric `X/Y` parsing over English-only labels.
- Any change to scoring or move ordering in `search.ts` must pass **both** the simulation tests (`craftSimulation.test.ts`) and the regression tests at the bottom of `search.test.ts`.
- See `docs/project/TESTING.md` for simulation vs. unit test guidance, test ownership by area, and validation requirements.

## Commit & Pull Request Guidelines

- Follow established commit prefixes: `feat:`, `fix:`, `docs:`, `perf:`, `chore(release):`.
- Keep commits scoped to one logical change and use imperative summaries.
- PRs should include a clear change summary, linked issue (if available), test evidence (commands run), and screenshots for UI updates in `src/ui/`.
- Explicitly call out gameplay-impacting changes (search scoring, harmony behavior, config defaults).

## Release Workflow

- After implementation and validation are complete, do the docs pass above, then follow this release workflow unless the user explicitly says not to publish yet.
- Bump `package.json` and `scripts/ui/agent-browser-harness.tsx` together before cutting a release tag.
- Run `bun run test` and `bun run build` before release; if docs changed, also run `bun run docs:inventory` and `bun run docs:check`.
- Push the release commit to `origin/main` before tagging.
- Use `bun run workshop:upload -- --change-note "vX.Y.Z - ..."` for the normal Workshop publish path, or the underlying `../ModUploader-AFNM` CLI when debugging the uploader itself. Include the release tag in the Workshop change note.
- Push `git tag vX.Y.Z` to trigger `.github/workflows/release.yml`, which creates the GitHub Release and uploads `builds/afnm-craftbuddy.zip`.

## Project Skills

Project skills live in `.agents/skills/` and are tracked with the repo. Use them for task workflows; keep `AGENTS.md` as the compact always-loaded orientation.

- `afnm-modding`: first stop for CraftBuddy work and task routing.
- `craftbuddy-optimizer`: optimizer/search/MCTS scoring guardrails and anti-patterns.
- `craftbuddy-runtime-integration`: `src/modContent/*`, ModAPI/root-state, DOM fallback, auto-action bridge.
- `craftbuddy-ui-validation`: overlay/settings UI, browser harness, optional live UI checks.
- `craftbuddy-release`: version bump, validation, Workshop upload, tag/GitHub release order.
- `pre-commit-validation`, `runtime-oracle`, `modapi-lookup`, `live-game-testing`: reusable AFNM validation and runtime workflows.

## Optimizer Work

Load `craftbuddy-optimizer` before changing `src/optimizer/*`, `crates/craftbuddy-engine/*`, or recommendation behavior. Keep `docs/project/OPTIMIZER_DESIGN.md` as the detailed source of truth.

Minimum guardrails:

- Add a failing simulation/replay test before changing search scoring or move ordering.
- Use proportional scoring terms tied to craft target magnitude; avoid magic constants.
- Never hard-filter legal skills before search evaluates them.
- Keep `buildOrderedMoveCandidates()` as the single beam-ordering path.
- `findOptimalPath()` should follow transposition-table `bestMove` entries, not greedily re-decide each step.
- Run `bun run test`; run `bun run build` for code changes and `bun run docs:check` for docs changes.
