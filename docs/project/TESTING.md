---
title: Testing Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-06
source_of_truth: src/__tests__/*, package.json, scripts/docs/*
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
| `modContentHarmonyState.test.ts` | Harmony hydration, replay snapshot parity, integration regressions |

## Simulation tests (`craftSimulation.test.ts`)

`simulateCraft()` runs a complete multi-turn craft using the optimizer's `findBestSkill()` to choose each action. These catch bugs that per-turn unit tests miss:

- neutral conditions: basic crafts complete within turn budgets
- condition exploitation: positive conditions steer toward the right skills
- buff utilization: buff setup → payoff sequences preferred over raw progress
- survivability: stabilize when critical, skip when a finisher is available
- mixed conditions: varied/all-negative sequences don't cause craft death
- harmony sub-systems: forge works crafts use fusion to raise heat before refining, complete without wasting turns on zero-gain skills

**Add a simulation test when:** a scoring/ordering change affects multi-turn behavior, or a bug describes "optimizer does X instead of Y over several turns."

**Use a unit test when:** single-turn scoring, specific function I/O, or helper edge cases.

## Replay-parity regressions

Exported optimizer snapshots are only useful for bug reproduction if they preserve search-relevant state. Snapshot regressions should cover:

- runtime-shaped config fields that affect gains/search (`mastery`, `masteryEntries`, granted buff payloads)
- active buff definitions when current-state buffs change stats/costs
- replay parity: round-tripped snapshot input should keep the same first recommendation as the direct in-memory config/state for the same search budget

Because search is wall-clock-budgeted, CI/browser/live runs can reach different frontiers before cutoff. Real-user regressions should use exported snapshot fixtures or explicit constrained budgets instead of assuming one machine's timing behavior generalizes.

For search-budget regressions, prefer deterministic node-budget cutoffs over wall-clock-only assertions when the behavior under test is iterative-deepening stability rather than raw responsiveness.

## UI checks with `agent-browser`

For visual/UI changes, do not rely only on static code review. Use the committed harness with `agent-browser`:

1. `bun run ui:harness:build`
2. `bun run ui:harness:serve`
3. `agent-browser open http://127.0.0.1:4173`
4. capture `agent-browser snapshot -i` / `agent-browser screenshot`

The harness renders a stable recommendation/settings fixture that is good enough for layout regressions like card overflow, tooltip placement, settings panel size, and open/close cover transitions.

Keep `react` and `react-dom` on the same version. Standalone browser verification will fail fast on mismatched versions even if the mod webpack build still succeeds.

## Validation requirements

For any mechanics change: see `AGENTS.md` → "How to safely change the optimizer" for the full workflow. Summary:

1. Add/update relevant tests
2. Run `bun run test` — all must pass
3. Run `bun run docs:check` if docs touched
4. Include regression scenario when recommendation behavior changes intentionally
