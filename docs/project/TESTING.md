---
title: Testing Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-08
source_of_truth: src/__tests__/*, package.json, scripts/docs/*, scripts/installed-game-runtime.js
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/OPTIMIZER_DESIGN.md
---

# Testing Guide

## Commands

See `AGENTS.md` → "Build, Test, and Development Commands" for the full list. Key commands:

- `bun run test` — full suite
- `bun run test:watch` — watch mode
- `bun run jest src/__tests__/<file>.test.ts` — focused file
- `bun run ui:harness:build` — build the committed browser harness into `tmp/ui-harness/`
- `bun run ui:harness:serve` — serve the harness at `http://127.0.0.1:4173`
- `bun run runtime:oracle` — cached extraction/parity summary for the installed game bundle
- `bun run runtime:extract` — print the extracted installed-runtime directory
- `bun run runtime:grep -- "<pattern>"` — grep the extracted installed runtime without launching the game UI

## Test ownership by area

| Test file | Covers |
| --- | --- |
| `craftSimulation.test.ts` | End-to-end multi-turn craft simulations |
| `search.test.ts` | Recommendation/search behavior, scoring, move ordering |
| `skills.test.ts` | Transition logic, buffs, masteries, effects |
| `gameAccuracy.test.ts` | Formula/mechanics parity |
| `harmony.test.ts` | Harmony subsystem |
| `state.test.ts` | State invariants, cache key behavior |
| `gameTypes.test.ts` | Expression evaluation, helper behavior |
| `largeNumbers.test.ts` | Numeric safety |
| `configStats.test.ts` | Config statistics calculation |
| `settings.test.ts` | Settings persistence |
| `autoCraftController.test.ts` | Auto-mode controller policy gating, auto-finish completion latch, stop/reset behavior, and state-advance waits |
| `modContentHarmonyState.test.ts` | Harmony hydration, replay snapshot parity, integration regressions |

## Simulation tests (`craftSimulation.test.ts`)

`simulateCraft()` runs a complete multi-turn craft using the optimizer's `findBestSkill()` to choose each action. These catch bugs that per-turn unit tests miss:

- neutral conditions: basic crafts complete within turn budgets
- condition exploitation: positive conditions steer toward the right skills
- buff utilization: buff setup → payoff sequences preferred over raw progress
- survivability: stabilize when critical, skip when a finisher is available
- finish policy: impossible-craft or no-action-alive scenarios can end with `Finish Craft`; goal-priority bias tests should prove balanced mode stays neutral while completion/perfection bias steers the chosen line in the expected direction
- probabilistic survivability: when chance-based stability recovery exists, the optimizer should still prefer a guaranteed stabilize over a proc-dependent line if both keep goals alive
- mixed conditions: varied/all-negative sequences don't cause craft death
- harmony sub-systems: forge works crafts use fusion to raise heat before refining, complete without wasting turns on zero-gain skills

**Add a simulation test when:** a scoring/ordering change affects multi-turn behavior, or a bug describes "optimizer does X instead of Y over several turns."

**Use a unit test when:** single-turn scoring, specific function I/O, or helper edge cases.

## Replay-parity regressions

Exported optimizer snapshots are only useful for bug reproduction if they preserve search-relevant state. Snapshot regressions should cover:

- runtime-shaped config fields that affect gains/search (`mastery`, `masteryEntries`, granted buff payloads)
- active buff definitions when current-state buffs change stats/costs
- craft-context provenance (`craftingTypeSource`, sublime-detection signals, raw recipe/recipeStats fields) when a bug may be caused by hydration/integration drift
- replay parity: round-tripped snapshot input should be exercised through the canonical replay helpers in `src/modContent/replaySnapshot.ts` so tests share the same serializer/reviver contract as production
- result snapshots should preserve `actionKind` and `projectedSuccessChance` for finish recommendations so bug reports stay explainable
- real-user regressions should prefer full exported snapshots checked into `src/__tests__/__fixtures__/replay-snapshots/`; use reduced hand-shaped fixtures only when the raw export is unavailable

Because search is wall-clock-budgeted, CI/browser/live runs can reach different frontiers before cutoff. Real-user regressions should use exported snapshot fixtures or explicit constrained budgets instead of assuming one machine's timing behavior generalizes.

For search-budget regressions, prefer deterministic node-budget cutoffs over wall-clock-only assertions when the behavior under test is iterative-deepening stability rather than raw responsiveness. Assert against the last fully completed depth/frontier, not mixed partial-pass results.

For chance-based survivability bugs, cover both layers:

- `skills.test.ts`: unit-test the guaranteed survivability floor (`calculateActionSurvivabilityFloor(...)`) so probabilistic stability recovery does not masquerade as guaranteed runway
- `search.test.ts` / `craftSimulation.test.ts`: add replay or simulation regressions proving the optimizer chooses the guaranteed-safe line when one exists
- For sublime/overcraft regressions, pair those with replay fixtures that confirm base-success continuation still values heat/harmony recovery instead of collapsing into shallow “safe” support loops once the base craft is already secured

For community-guide parity claims:

- add `gameAccuracy.test.ts` coverage for runtime-shaped stat math before changing formulas
- add `skills.test.ts` coverage for multi-turn buff/effect behavior before changing transition logic
- document the outcome in `docs/project/MECHANICS_PARITY.md` and, if still useful, label it in `docs/reference/afnm-crafting-guide/agent_considerations.md`

## UI checks with `agent-browser`

For visual/UI changes, do not rely only on static code review. Use the committed harness with `agent-browser`:

1. `bun run ui:harness:build`
2. `bun run ui:harness:serve`
3. `agent-browser open http://127.0.0.1:4173`
4. capture `agent-browser snapshot -i` / `agent-browser screenshot`

The harness renders a stable recommendation/settings fixture that is good enough for layout regressions like card overflow, tooltip placement, settings panel size, and open/close cover transitions.

When the change touches auto mode, capture at least:

- a normal recommendation fixture with the auto panel visible
- a loading fixture that shows auto status + stop button

Keep `react` and `react-dom` on the same version. Standalone browser verification will fail fast on mismatched versions even if the mod webpack build still succeeds.

For `src/modContent/index.ts` and other runtime-sensitive work, the default validation path is the installed-runtime oracle below, not launching the installed game UI.

For `src/modContent/autoCraftController.ts` / `src/modContent/autoCraftExecutor.ts`, keep validation split:

- unit tests cover controller state transitions, policy gating, stop requests, craft-end reset, and timeout/error behavior
- harness checks cover panel layout/status rendering
- rebuild `dist/` / `builds/afnm-craftbuddy.zip` from the current worktree before any in-game validation; stale artifacts can still be running older action-bridge code even when source fixes exist locally
- installed-runtime/manual validation confirms the one-action bridge triggers exactly one live craft action, that synthesized `Finish Craft` recommendations resolve to the native `Wait` technique, and that auto mode still waits for an observed craft-state change before continuing

## Optional live UI verification

Live UI automation against the installed Electron app is currently **manual/opt-in only**, not part of the default validation flow.

Reasons:

- direct app launch is disruptive on the desktop unless a separate virtual display/Xvfb-style path is available
- the installed app restarts through Steam by default unless a `disable_steam` sentinel file exists next to the binary
- if launched from the repo as the current working directory, the game writes its own `./settings.json` there

If live UI verification is explicitly requested in the future, use a non-repo working directory, prefer a hidden display/virtual display, and only proceed if the flow is actually automated and non-disruptive.

## Installed runtime oracle

When UI text, historical notes, and live behavior disagree, verify against the installed Electron bundle before changing mechanics or tests. The executable is authoritative, and this is the default parity path.

1. Print the runtime summary:

   ```bash
   bun run runtime:oracle
   ```

2. If needed, locate the cached extraction directory:

   ```bash
   bun run runtime:extract
   ```

3. Grep the compiled runtime for a mechanic or API symbol:

   ```bash
   bun run runtime:grep -- "forgeWorks\\.heat>=2&&t\\.forgeWorks\\.heat<=3|recommendedTechniqueTypes|itemTypeToHarmonyType"
   ```

The summary includes the installed game version, whether the app writes a relative `settings.json`, whether Steam restart can be disabled via sentinel file, forge heat-band signals, and key ModAPI crafting exposures.

This is the recommended parity check when older curated/history docs or on-screen text drift. Example: the installed runtime verified on March 6, 2026 uses Forge low-control penalties at heat `2-3`, not `1-3`.

## Validation requirements

For any mechanics change: see `AGENTS.md` → "How to safely change the optimizer" for the full workflow. Summary:

1. Add/update relevant tests
2. Run `bun run test` — all must pass
3. Run `bun run docs:check` if docs touched
4. Include regression scenario when recommendation behavior changes intentionally
