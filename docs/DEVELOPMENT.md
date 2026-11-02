# Development

## Setup

Use Bun, Rust stable with the `wasm32-unknown-unknown` target, and wasm-pack **0.14** (the release workflow pins 0.14.0). Python 3 serves the optional browser harness.

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked --version 0.14.0
bun install
```

`bun run build` compiles Rust/WASM, generates the inline module, builds the worker and mod, and packages `builds/afnm-craftbuddy.zip`. Build outputs are reproducible and uncommitted. AFNM cannot fetch a separate WASM file through `mod://`; the feasibility evidence is in [Engine decisions](ENGINE_DECISIONS.md).

## Module map and boundaries

| Surface | Owns |
| --- | --- |
| `src/mod.ts` | Bootstrap, metadata; imports integration for its side effects |
| `src/optimizer/index.ts` | Facade used by integration/UI; workers and tests may import internal modules |
| `src/optimizer/` | Pure state transitions, search and scoring; no runtime, DOM, Redux or settings storage access |
| `src/optimizer/outcome.ts` | TS bands, conjunctive tiers and auto-finish; UI consumes its projection rather than recomputing thresholds |
| `crates/craftbuddy-engine/` | Independent Rust mechanics/outcome mirror, tested against the TS corpus; root-policy prior, not final ranking authority |
| `src/modContent/index.ts` | Polling/session lifecycle, config construction, search and auto-mode wiring |
| `src/modContent/craftStateExtraction.ts`, `modApiProviders.ts` | Runtime normalization and optional provider probes |
| `src/modContent/craftingContext.ts`, `harmonyState.ts`, `configStats.ts` | Craft/recipe context, all harmony-state hydration, effective stats |
| `src/modContent/craftingStoreState.ts`, `craftSession.ts` | Root-state/session helpers and shared integration diagnostics |
| `src/modContent/nativeAutoUse.ts`, `craftStateSignature.ts` | Native item coexistence and live state revisions |
| `src/modContent/recommendationContext.ts` | Settings freshness and cross-step score-cache scope |
| `src/modContent/autoCraftController.ts`, `autoCraftExecutor.ts`, `autoCraftErrors.ts` | Policy/state machine, verified dispatch, typed refusal/recovery |
| `src/modContent/replaySnapshot.ts`, `debugHooks.ts` | Replay serializer and debug export |
| `src/modContent/overlayMount.ts` | React mounting, paint scheduling, HUD geometry |
| `src/ui/`, `src/utils/outcomeSummary.ts`, `src/utils/overlayLayout.ts` | Panels/theme and pure presentation/geometry helpers |
| `src/settings/index.ts`, `src/settings/autoCraft.ts` | Persisted settings, presets/config mapping, auto policy/UI state |
| `src/worker/searchWorker.ts` | Background search and its own cache/engine instance |

Dependency direction: integration → optimizer facade/settings/UI/utils; UI → optimizer facade/settings/utils; optimizer → pure utils. Settings **does** depend on `src/utils/searchGoalPriority.ts` and its own auto-craft policy module. It is not dependency-free.

The mutable auto-craft lifecycle remains beside the polling loop intentionally: splitting it would require threading a live view through many stateful closures, not a neutral file move. Harmony selection/hydration already have their own modules; another context wrapper would add indirection.

## Runtime adapter

Normal reads use `window.modAPI?.subscribe?.()` / `getGameStateSnapshot?.()`. Direct store access is reserved for synchronous dispatch observation; hook payloads provide context, structural DOM `X/Y` reads recover missing visible progress, then caches support mid-craft restoration. English labels are not the primary craft-open signal: root state checks the recipe screen plus a live crafting slice. Compact HUD values such as `31K` need reconciliation with exact non-overcraft caps.

Harmony is **player-selected**, with `recipe.harmonyTypeOverride` as the forced case. Missing subsystem state stays missing rather than being inferred from item kind; forge heat alone has verified native-variable/buff mirrors. Hydration/cloning/replay must preserve every known variant, especially Cycle's fixed starting charge size. Lost Echo/Decree clone fields previously reset their state machines on every poll.

### Native helpers: availability is not adoption

Condition transitions, known-technique resolution, completion-bonus naming, overcrit, action prechecks, cap getters and max toxicity have guarded native paths. `getMaxCompletion` / `getMaxPerfection` receive the live `bonusMaximumQuality` sum as their fourth argument (`src/modContent/qualityCap.ts`); a three-argument call silently loses raised caps.

`getNativeActionCost` is defined and imported, and availability/error diagnostics exist, but it is **not invoked** by production code. Costs remain locally simulated. Native `getActionCost` is an individual preview, not the finalized mastery-aware payment oracle requested in [API requests](API_REQUESTS.md). Likewise, declaration/probe presence for condition/stat helpers is not proof that a production path calls them. Native scaling is deliberately not used inside search because a live provider can disagree on hypothetical future-state variables.

`onReduxAction` runs during the reducer; read-only observation there avoids nested-dispatch hazards. `modAPI.gameData.registerOptionsUI` and top-level `modAPI.injectUI` are available, but current mounting uses `overlayMount.ts`, not those APIs. Localization through `actions.addTranslation` and a native overlay host are candidates, not completed migrations.

### Automation

- Re-read the live revision immediately before dispatch. `stale` means recalculate; `unverifiable` means pause and dispatch nothing. The signature includes resources, conditions/queue, buffs, cooldowns, inventory, harmony/state digest, roster and consumed pills.
- Native auto-use executes **before** each technique in the game's UI handler. When active, click that control; direct technique dispatch would skip the loadout. Covered items are withheld from CraftBuddy, and unknown slot conditions conservatively assume native consumption.
- `craftingAutoUseEnabled === false` disables the loadout. `consumedPills` is on the crafting slice. Training uses definedness (`trainingMode !== undefined`), so applying an item without inventory removal is expected.
- Item settlement is distinct from a technique state advance. On timeout, a changed signature resumes; unchanged state resends once; unreadable state never retries. Repeated rejection leaves a recoverable armed pause until a real craft change.
- No manual Finish exists. The current synthetic finish-to-`Wait` execution mismatch is listed in [known gaps](MECHANICS_PARITY.md#known-gaps), being removed in v7.

## TypeScript and build conventions

Strict TypeScript, type-only AFNM imports where appropriate, `unknown` plus narrowing at runtime boundaries, and optional chaining for drift-prone APIs keep failures localized. Globals belong in `src/global.d.ts`. Formatting follows `.prettierrc` (single quotes, trailing commas, LF). React/ReactDOM/MUI/MUI Icons are game externals in `webpack.config.js`; avoid bundling second copies.

## Validation matrix

Choose checks by the changed surface. This is the shared iteration/hand-off/release matrix; focused suite selection for optimizer work lives in its skill.

| Change | Iterate | Hand-off | Release |
| --- | --- | --- | --- |
| Docs/skills | `bun run docs:check` | Same after final edit | Included in `release:validate` |
| TS behavior | Focused Jest, `bun run typecheck` | Typecheck + `bun run test`; build if shipping/runtime code changed | `bun run release:validate` |
| Optimizer ranking | Focused search/replay/simulation test; before/after replay evidence | Full tests + `bun run optimizer:bench`; neutral refactors compare `optimizer:digest` | Release gate + benchmark |
| Mechanics in either engine | Regenerate `optimizer:differential-corpus`, inspect diff; focused TS/Rust tests | `engineDifferential.test.ts` + `bun run wasm:test`, full TS tests + build | Release gate + both parity sides + benchmark |
| Rust/WASM or bridge | `bun run wasm:test`, `nativeMcts.test.ts` | Same + `bun run build` (rebuilds inline WASM) | Release gate + Cargo; benchmark for search changes |
| Runtime/automation | Oracle/targeted bundle grep; relevant extraction, signature, native-auto-use, controller/executor suites | Typecheck + full tests + build; runtime evidence for changed assumptions | Release gate + relevant runtime checks |
| UI/settings/harness | `bun run ui:harness:build`, harness screenshots; pure helper tests | Typecheck + tests + harness build; short viewport and affected states | Release gate + harness build |
| Packaging/dependencies/check scripts | Focused script tests; typecheck | Production build + harness build for dependency changes; docs checks | Release gate |

`release:validate` runs typecheck, Jest, production build and docs checks. It does **not** run Cargo tests or replay contracts. Publishing order and commands live only in `.agents/skills/craftbuddy-release/SKILL.md`.

### Test/evidence details

- Jest matches `.test.ts` in a Node environment, not `.tsx`; pure presentation helpers get unit tests, layout gets harness screenshots. Full simulations take several minutes.
- A multi-turn recommendation report deserves a simulation or exported replay, not just a single-score assertion. Test both guaranteed survival floors and actual failure transitions; their known divergence is not repaired by an EV test.
- The differential corpus is generated from `src/__tests__/fixtures/differentialCorpus.ts` into `crates/craftbuddy-engine/tests/differential_corpus.json`. Unknown effects can be skipped identically by both engines: cross-engine agreement is not proof of game fidelity. Run final recorded-corpus checks without a scratch `CRAFTBUDDY_DIFFERENTIAL_INPUT` override.
- `bun run optimizer:parity` runs the Cargo and focused Jest parity suites, grouped by toolchain; it does not regenerate the corpus or replace the full suite. Native MCTS is disabled in Jest unless `CRAFTBUDDY_ENABLE_WASM_MCTS_TESTS=1`.
- Keep the seeded random harmony pool stable; cover new harmonies with explicit matrices instead of silently remapping old random inputs.
- For neutral refactors/performance work, record `bun run optimizer:digest -- --out tmp/baseline.json` before editing, then compare with `bun run optimizer:digest -- --compare tmp/baseline.json`. It fixes node budgets and gives time a nonbinding ceiling. Ordinary presets stop on the clock too, so equal sliders do not guarantee identical work or recommendations.
- Run wall-clock benchmarks separately from CPU-heavy checks. Preserve runtime-evidenced contracts rather than tuning scoring constants to pass them. Historical measurements and reproduction commands are in [Engine decisions](ENGINE_DECISIONS.md).
- `window.craftBuddyDebug.exportOptimizerReplaySnapshot()` supplies runtime-shaped techniques/masteries, buff definitions/internal state, harmony plus provenance, context, current turn, bounded history and auto state. Prefer a complete export in `src/__tests__/__fixtures__/replay-snapshots/` to a hand-shaped approximation; test through the production serializer/reviver.
- `bun run docs:check` scans tracked Markdown (including skills) for local links/path references and checks changelog version/Workshop size. `node --test scripts/docs/checks.test.js` exercises the checkers themselves.

UI harness commands and installed-client escalation are in the UI/runtime skills. Static bundle inspection does not certify a live UI smoke test.
