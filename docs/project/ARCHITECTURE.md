---
title: Architecture
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-08-23
source_of_truth: src/mod.ts, src/modContent/*, src/optimizer/*, crates/craftbuddy-engine/*, src/ui/*, src/settings/*, src/utils/*
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/INTEGRATION_MODAPI.md
  - docs/project/MECHANICS_PARITY.md
---

# Architecture

## Layers

```text
AFNM 0.7.6 runtime  ──►  src/modContent/*  ──►  src/optimizer (facade)  ──►  search + Rust engine
                                │                        │
                                └──►  src/ui/*  ◄─────────┘  (via SearchResult.outcomeProjection)
```

Four rules define the shape:

1. `src/optimizer/*` is pure. No runtime, DOM, Redux or settings access.
2. `src/modContent/*` is the only place that touches the game.
3. Everything outside `src/optimizer/*` imports **only** `src/optimizer/index.ts`.
4. Thresholds live once, in `src/optimizer/outcome.ts`. No other module — least of all the UI — recomputes a band, a tier or the auto-finish predicate.

## Optimizer (`src/optimizer/`)

| Module | Role |
| --- | --- |
| `index.ts` | the facade: the public API surface, including the outcome evaluator and the two native bridges |
| `outcome.ts` | conjunctive outcome model: band widths, `TIER_REQUIREMENTS`, `willAutoFinish` |
| `search.ts` | move ordering, bounded lookahead, scoring, `OutcomeProjection`, `setupFor` hints |
| `skills.ts` | transition engine: gains, legality, masteries, buff effects, harmony application |
| `state.ts` | immutable `CraftingState`, generic tracked buffs, cache keys |
| `gameTypes.ts` | game-aligned types and shared formulas (scaling, expressions, conditions, crit EV, `getBonusAndChance`) |
| `harmony.ts` | deterministic simulation of all seven harmony subsystems |
| `harmonyRegistry.ts` | static per-harmony data: complexity multiplier, starting harmony, cost/pinning flags |
| `nativeVariables.ts` | canonical native-variable storage and re-derivation of buff/harmony aliases |
| `nameNormalization.ts` | memoized identifier normalization used across state keys and lookups |
| `nativeMcts.ts` | bridge to the Rust engine: payload construction, `stripNullish`, policy extraction, fallback |

## Rust engine (`crates/craftbuddy-engine/`)

| File | Role |
| --- | --- |
| `lib.rs` | engine state, MCTS search, WASM entry points |
| `effects.rs` | effect-tree evaluation, scaling/mastery, buffs, items, toxicity — the transition parity layer |
| `outcome.rs` | mirror of `outcome.ts` |
| `differential_tests.rs` | corpus replay plus the determinism property |
| `effects_tests.rs` | unit tests for each ported mechanic |
| `profiling.rs` | Cargo-feature-gated counters, compiled out of the shipped artefact |

`bun run wasm:build` compiles it and regenerates the inline WASM module embedded in the bundle; `mod://` and localhost loading are both unavailable in the game's renderer, so inline is the only viable form.

## Runtime integration (`src/modContent/`)

`src/mod.ts` is the bootstrap entrypoint and metadata export; it imports `src/modContent/index.ts` for its side effects.

| Module | Role |
| --- | --- |
| `index.ts` | the polling loop and wiring: craft detection, session state, config construction, search invocation, auto-craft sync, overlay and hotkey registration |
| `craftSession.ts`, `craftStateExtraction.ts`, `modApiProviders.ts`, `overlayMount.ts`, `debugHooks.ts` | the seams extracted from `index.ts` — see [modContent seams](#modcontent-seams) |
| `craftingContext.ts` | recipe/craft-type/harmony-selection resolution from live craft state |
| `harmonyState.ts` | harmony hydration and canonicalization from authoritative payloads, with verified forge-only fallback |
| `configStats.ts` | base crafting stat resolution from game entities |
| `craftingStoreState.ts` | root-state/session helpers over `subscribe` / `getGameStateSnapshot` |
| `craftingActivity.ts`, `craftingUiDetection.ts` | craft-activity identification and locale-safe craft-screen detection |
| `conditionEffects.ts` | recipe condition-effect resolution and cache invalidation across craft transitions |
| `techniqueResolution.ts` | canonical live-technique matching via `craftingTechniqueFromKnown`, with fallback |
| `hotkeys.ts` | panel/compact/snapshot keyboard shortcuts |
| `nativeAutoUse.ts` | the native crafting auto-use contract: loadout status, covered items, and a projection mirroring the runtime slot selector |
| `craftStateSignature.ts` | canonical live-craft signature, its diff, and the monotonic `craftStateRevision` |
| `autoCraftController.ts` | auto-mode state machine: arming, policy resolution, settle/wait phases, state-advance timeout recovery, recalculate-vs-retry-vs-pause decisions |
| `autoCraftExecutor.ts` | the dispatch bridge, including dispatch-time state verification and execution-path selection |
| `autoCraftErrors.ts` | typed failures: `StaleCraftStateError`, `UnverifiableCraftStateError`, `NativeAutoUseConflictError`, `NativeAutoUseUnreachableError` |
| `replaySnapshot.ts` | replay snapshot serialization for bug reports and regression fixtures |

### modContent seams

`index.ts` is the craft polling loop plus wiring. 6.0.0 moved 1,478 lines of it — everything that does not read or write live session state — into five seams, verbatim, as one behaviour-neutral commit:

| Seam | Owns |
| --- | --- |
| `craftSession.ts` | the integration-diagnostics record and its types: the session state more than one seam shares |
| `craftStateExtraction.ts` | pure runtime/DOM shape readers: signature serializers, numeric normalisers, cap/toxicity resolution, buff and mastery extraction, technique and item conversion |
| `modApiProviders.ts` | optional-ModAPI-helper lookup (`getPathValue`, `findFirstFunction`, next-condition / technique-from-known / action-cost probes) and the shared buff-key normaliser |
| `overlayMount.ts` | React root commit, paint scheduling, HUD anchor geometry, title-screen indicator |
| `debugHooks.ts` | clipboard/file export and the debug toast behind the snapshot hotkeys |

`src/__tests__/modContentSeams.test.ts` pins each extracted contract.

Two seams from the original 6.0.0 proposal were deliberately **not** created, and this is the intended end state rather than pending work:

- **`harmonyContextResolution.ts`** — harmony selection and hydration already live in `craftingContext.ts` and `harmonyState.ts`, each with their own suite. A third module would only add indirection.
- **`executorLifecycle.ts`** — the auto-craft snapshot, fingerprint and arm/stop helpers read about fifteen mutable variables that the polling loop writes on every tick. Moving them means either threading a live-craft view through them or converting the polling loop's 59 module-level `let`s (~600 references) into an accessor object; both are rewrites, not moves, and neither is worth the risk of a silent behaviour change in the dispatch-safety path. They stay next to the loop that owns their state.

What remains in `index.ts` is therefore intentional: the polling loop, the session state it mutates, config construction, search invocation, the auto-craft wiring, and every import-time side effect.

## UI (`src/ui/`, `src/utils/`)

| Module | Role |
| --- | --- |
| `RecommendationPanel.tsx` | recommendation, alternatives, outcome/band rows, auto-mode status |
| `SettingsPanel.tsx` | settings slide-over |
| `components/StyledComponents.tsx` | shared styled primitives, including the height-clamped panel container |
| `theme.ts`, `ThemeProvider.tsx`, `animations.ts` | MUI theme, provider, shared motion |
| `src/utils/outcomeSummary.ts` | **pure** derivation of outcome/band/binding-bar/setup display rows from `SearchResult.outcomeProjection` |
| `src/utils/overlayLayout.ts` | safe-lane overlay geometry |
| `src/utils/searchGoalPriority.ts` | goal-priority bias → completion/perfection weight mapping shared by settings and search |
| `src/utils/largeNumbers.ts`, `debug.ts` | late-game numeric safety, debug logging |

Presentation logic that needs testing goes into `src/utils/*` with a plain Jest test, because the Jest environment is `node` and does not match `.tsx`. The panel renders rows and maps tones to theme colours; it contains no band logic.

## Settings (`src/settings/`)

- `index.ts` — persisted user settings and the optimizer search-config mapping, including presets and the engine selector.
- `autoCraft.ts` — auto-mode policy values, `resolveEffectiveAutoCraftPolicy` (the native auto-use downgrade), and the shared `AutoCraftUiState`.

## Runtime lifecycle

1. Detect the craft from root state (`screen.screen === 'recipe'` plus a live crafting slice).
2. Convert live payloads into optimizer config/state/actions: harmony selection and hydration, complexity-multiplied targets, canonical native variables, available techniques, quick-access items minus anything the native auto-use loadout covers.
3. Optionally request a Rust MCTS root policy (Experimental engine, large or sublime craft, inline WASM available).
4. Run the search; attach the `OutcomeProjection`.
5. Sync auto mode: resolve the effective policy, publish a snapshot carrying the `craftStateRevision` and a `verifyRevision()` callback.
6. Render the panel.
7. Repeat on craft-state change.

Auto mode adds one hard rule: **verify at dispatch time**. The executor re-reads the live signature immediately before acting; a mismatch recalculates (`StaleCraftStateError`), an unreadable state pauses (`UnverifiableCraftStateError`), and nothing is dispatched in either case.

The same verification decides what a silent wait means *after* dispatch. When no snapshot carrying the executed action arrives before `STATE_ADVANCE_TIMEOUT_MS`, the controller re-reads the live signature rather than erroring out: a changed signature means the action landed and the run resumes (`resumeAfterLateStateAdvance`, with the executed fingerprint pinned so a lagging snapshot cannot re-dispatch it), an unchanged signature means the action never landed and is resent exactly once (`MAX_STATE_ADVANCE_RETRIES = 1`), and an unreadable signature proves nothing and is never retried. A second failure, or an unverifiable state, degrades to a **recoverable armed pause** (`pauseAfterRejectedAction`): auto mode stays armed but idle on the fingerprint it could not move, so the next real craft change resumes it without a restart. Auto mode only reaches a terminal error state for genuine execution failures.

## Dependency direction

```text
modContent -> optimizer (facade) + settings + ui + utils
ui         -> optimizer (facade) + settings + utils
optimizer  -> utils
settings   -> (nothing internal)
```

`optimizer` never depends on `modContent`, `ui` or `settings`.
