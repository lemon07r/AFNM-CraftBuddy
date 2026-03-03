---
title: Testing Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-02
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

## Validation requirements

For any mechanics change: see `AGENTS.md` → "How to safely change the optimizer" for the full workflow. Summary:

1. Add/update relevant tests
2. Run `bun run test` — all must pass
3. Run `bun run docs:check` if docs touched
4. Include regression scenario when recommendation behavior changes intentionally
