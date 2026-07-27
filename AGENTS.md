# Repository Guidelines

## Quick Start

Load the `afnm-modding` skill for task routing, project rules, and the repo map. Load `pre-commit-validation` before committing. For deeper context, read `docs/project/START_HERE_FOR_AGENTS.md`.

## Code Search

Use Vera before opening many files: `vera search "goal"`, `vera grep "pattern"`, `vera references <symbol>`. Use normal text search for small, known scopes.

## Commands

- `bun install`: install dependencies.
- `bun run typecheck`: TypeScript strict-mode check.
- `bun run test` / `bun run jest src/__tests__/<file>.test.ts`: full or focused Jest tests.
- `bun run wasm:test`: Rust engine unit, effect-parity, and differential-corpus tests.
- `bun run wasm:build`: compile Rust/WASM and regenerate the inline WASM module.
- `bun run optimizer:differential-corpus`: regenerate the TypeScript/Rust parity corpus after any mechanics change.
- `bun run optimizer:bench`: replay-contract and recommendation-trend comparison.
- `bun run build`: production webpack build and package `builds/afnm-craftbuddy.zip`.
- `bun run ui:harness:build` then `bun run ui:harness:serve`: browser harness at `http://127.0.0.1:4173`.
- `bun run runtime:oracle`, `bun run runtime:extract`, `bun run runtime:grep -- "<pattern>"`: installed-game runtime verification without launching the game UI.
- `bun run docs:inventory` then `bun run docs:check`: required after docs/skills changes.
- `bun run release:validate`: release gate (`typecheck`, `test`, `build`, `docs:check`); run `docs:inventory` first if docs changed.
- `bun run workshop:upload -- --change-note "vX.Y.Z - ..."`: upload to Workshop after release validation and commit/push.

## Hard Rules

- Keep optimizer/search logic pure in `src/optimizer/*`; game access belongs in `src/modContent/*`. Outside the optimizer, import only `src/optimizer/index.ts`.
- `src/optimizer/outcome.ts` is the single authority for band thresholds, outcome tiers, and the auto-finish predicate. Never recompute one elsewhere, including in the UI.
- Target game version is **0.7.6**: harmony is player-selected across seven types, outcome tiers are conjunctive band gates, there is no manual Finish Craft, and the game applies its own crafting auto-use loadout before every technique.
- Eccentric Decree scores per individual bar change (`onBarChange`), not once per turn, so one turn can award several harmony steps and flip the focused bar mid-turn; keep the `needsBarContributions()` / `needs_bar_contributions()` gate and keep the TypeScript and Rust folds identical.
- Technique display names differ from internal names (`false_fusion` / `False Fusion` shows as "Strive for Completion"): user-facing strings use `techniqueDisplayName()`, keys and lookups stay on `name`.
- Never tune a scoring constant to make a benchmark contract pass; contracts change only with recorded runtime evidence.
- Use strict TypeScript, optional chaining for ModAPI access, and `unknown` + narrowing instead of `any`.
- Formatting follows `.prettierrc`: 2 spaces, single quotes, trailing commas, LF endings.
- Treat the installed runtime as authoritative when docs, types, and observed behavior disagree.
- Do not commit `dist/`, `builds/`, `coverage/`, `tmp/`, or generated outputs.
- Docs and skills are editable working assets. Fix stale/wrong/duplicated content in the same change.

## Commits

Use prefixes (`feat:`, `fix:`, `docs:`, `perf:`, `chore(release):`), keep commits scoped, imperative mood. PRs: summary, validation evidence, screenshots for UI, notes for gameplay-impacting changes. Releases: follow `craftbuddy-release` skill.
