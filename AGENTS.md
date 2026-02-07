# Repository Guidelines

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
- `bun run test`: run all Jest tests once.
- `bun run test:watch`: run tests in watch mode while iterating.
- `bun run test:coverage`: generate coverage reports in `coverage/` (text, lcov, html).
- `bun run docs:check`: validate docs links/freshness/authority.
- `bun run docs:inventory`: regenerate `docs/DOC_INVENTORY.md`.
- `bun run jest src/__tests__/search.test.ts`: run a focused test file.

## Documentation Workflow
- Start technical onboarding at `docs/project/START_HERE_FOR_AGENTS.md`.
- Treat `docs/project/*` as implementation source of truth, then verify against code/tests.
- Use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` before opening any other reference docs.
- Use `archive/` only when the curated/active docs are insufficient.
- If you change docs, run `bun run docs:inventory` and `bun run docs:check` before committing.

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

## Commit & Pull Request Guidelines
- Follow established commit prefixes: `feat:`, `fix:`, `docs:`, `perf:`, `chore(release):`.
- Keep commits scoped to one logical change and use imperative summaries.
- PRs should include a clear change summary, linked issue (if available), test evidence (commands run), and screenshots for UI updates in `src/ui/`.
- Explicitly call out gameplay-impacting changes (search scoring, harmony behavior, config defaults).
