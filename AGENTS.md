# CraftBuddy

Crafting assistant mod for Ascend From Nine Mountains (AFNM). It reads the live craft, searches ahead and recommends, or optionally plays, the next technique. Modelled game build: the `afnm-types` version in `package.json`.

## Where things are

- `src/optimizer/`: pure simulation and search (`skills.ts` transitions, `search/` search/scoring/ranking behind the `search.ts` facade, `outcome.ts` bands/tiers/auto-finish). Integration code uses it through `src/optimizer/index.ts`.
- `src/modContent/`: everything that touches the game (state extraction, ModAPI, auto-craft dispatch).
- `src/ui/`, `src/settings/`: overlay and settings. `src/worker/`: background search.
- `docs/`: design, mechanics, runtime evidence, development guide. Commands live in `package.json`.

## Skills (load when the task needs them)

- `craftbuddy-optimizer`: recommendations, scoring, mechanics, transition goldens, performance.
- `craftbuddy-runtime`: ModAPI lookups, checking behavior in the installed game, live-client testing.
- `craftbuddy-ui`: overlay/settings changes and browser-harness validation.
- `craftbuddy-release`: version bumps, Workshop upload, tags.

## Things that are easy to get wrong

- The installed game is the source of truth. When docs, types and tests disagree with it, check the bundle (`bun run runtime:grep`) and fix whichever is wrong.
- Mechanics changes need the TypeScript transition golden kept current: `bun run optimizer:transition-corpus`, inspect the expected-output diff, then run `transitionCorpus.test.ts`.
- Scoring constants and benchmark contracts should move because of evidence about the game or a reproduced bug, not to make a check pass.
- Refactors and performance work should leave `bun run optimizer:digest -- --compare <baseline>` unchanged; record a baseline first.
- `src/optimizer/outcome.ts` is the one place that computes bands, tiers and auto-finish; UI and search consume it instead of recomputing thresholds.
- User-facing technique names go through `techniqueDisplayName()`; keys and lookups use `name`.
- When you change behavior, update the doc that describes it in the same change.
- Before committing, `bun run typecheck` and `bun run test` are the baseline, plus `bun run docs:check` after docs or skill edits; the validation table in `docs/DEVELOPMENT.md` lists what else each kind of change needs.

## Conventions

Strict TypeScript (`unknown` plus narrowing rather than `any`), Prettier per `.prettierrc`, commit prefixes such as `feat:`/`fix:`/`docs:`/`perf:`/`chore(release):`. Generated output (`dist/`, `builds/`, `tmp/`, `coverage/`) stays uncommitted.
