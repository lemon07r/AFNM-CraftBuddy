# Phase 5: Integration

## Goal

Integrate the Rust/WASM engine into CraftBuddy without breaking the current TypeScript-facing contracts used by:

- UI panels
- replay snapshots
- auto-craft controller
- tests
- JS fallback search

## Most important rule

Keep the current public signature of `findBestSkill(...)` intact.

See the current function in `src/optimizer/search.ts` around `findBestSkill(...)`.

Do not replace it with a new simplified API.

## Actual files to modify

| File | Purpose |
| --- | --- |
| `src/optimizer/search.ts` | dispatch to WASM for non-greedy search when enabled |
| `src/settings/index.ts` | engine settings and persistence |
| `src/ui/SettingsPanel.tsx` | engine toggle / engine-specific controls |
| `src/ui/RecommendationPanel.tsx` | optional engine metadata display |
| `src/modContent/index.ts` | warm engine initialization and status logging |

The old plan referenced `src/settings/settingsTypes.ts`; that file does not exist in this repo.

## Dispatch rules

Recommended dispatch behavior:

- if `useGreedy === true`, stay on the current TS greedy path
- if WASM is unavailable or disabled, use the current TS lookahead path
- otherwise use WASM for the main recommendation

The fallback logic should be quiet and reliable. A WASM error must not break recommendation updates.

## SearchResult compatibility requirements

The current `SearchResult` contract includes much more than a chosen key. It already contains:

- `recommendation`
- `alternativeSkills`
- `optimalRotation`
- `expectedFinalState`
- `blockedReasons`
- `searchMetrics`

and `SkillRecommendation` itself includes gains, costs, reasoning, follow-up metadata, finish flags, and success projections.

See `src/optimizer/search.ts` around `SearchResult` and `SkillRecommendation`.

The WASM integration should **hydrate** that existing shape, not replace it.

## Hydration strategy

Recommended approach:

1. Rust returns ranked `skillKey`s plus engine metrics.
2. TypeScript resolves each `skillKey` back to the current `SkillDefinition`.
3. TypeScript computes display-facing fields for the chosen/alternative actions using existing preview helpers and reasoning paths.
4. TypeScript fills `searchMetrics` and optional engine metadata fields.

This keeps replay snapshots and auto-craft logic compatible with minimal churn.

## Settings strategy

Add settings in `src/settings/index.ts`, not a new settings file.

Recommended new persisted settings:

- `useWasmEngine: boolean`
- `mctsMaxSimulations: number`
- `mctsExplorationConstant: number`
- optional `mctsRolloutDepth: number`

Reuse the existing `searchTimeBudgetMs` as the shared wall-clock budget where possible.

## UI strategy

The settings UI should make the engine split clear:

- shared settings
- JS fallback settings
- WASM/MCTS settings

Do not silently reinterpret every existing JS-only knob as a WASM knob without explaining it.

## Compatibility hotspots to keep working

Pay attention to these existing consumers:

- auto-craft policy decisions in `src/modContent/autoCraftController.ts`
- replay snapshot shaping in `src/modContent/replaySnapshot.ts`

If the WASM path stops providing `reasoning`, finish metadata, or projected gains/costs, these areas degrade immediately.

## Done when

- `findBestSkill(...)` remains signature-compatible
- greedy search still works
- JS fallback still works
- replay snapshot output still has compatible structure
- auto-craft still sees the recommendation fields it needs
