---
title: Testing Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-17
source_of_truth: src/__tests__/*, package.json, scripts/docs/*
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_DESIGN.md
---

# Testing Guide

## Runtime tests

- full test suite: `bun run test`
- watch mode: `bun run test:watch`
- coverage: `bun run test:coverage`
- focused file: `bun run jest src/__tests__/search.test.ts`

## Documentation tests

- all docs checks: `bun run docs:check`
- inventory regeneration: `bun run docs:inventory`

## Current baseline

- verified 2026-02-15: 10 suites, all passing

## Test ownership by area

- `craftSimulation.test.ts`: end-to-end multi-turn craft simulations (see below)
- `search.test.ts`: recommendation/search behavior, scoring, move ordering
- `skills.test.ts`: transition logic + buffs/masteries/effects
- `gameAccuracy.test.ts`: formula/mechanics parity
- `harmony.test.ts`: harmony subsystem behavior
- `state.test.ts`: state invariants/cache key behavior
- `gameTypes.test.ts`: expression evaluation guardrails and helper behavior
- `largeNumbers.test.ts`: numeric safety
- `configStats.test.ts`: config statistics calculation
- `settings.test.ts`: settings persistence

## Simulation tests (`craftSimulation.test.ts`)

The `simulateCraft()` helper runs a complete multi-turn craft using the optimizer's own `findBestSkill()` to choose each action. These tests catch bugs that per-turn unit tests miss:

- **Neutral conditions**: basic crafts complete within turn budgets
- **Condition exploitation**: positive conditions steer the optimizer toward the right skills (Refine for perfectable, Fusion for fuseable)
- **Buff utilization**: buff setup → payoff sequences are preferred over raw progress
- **Survivability**: stabilize when stability is critical, but don't stabilize when a finisher is available
- **Mixed conditions**: varied/all-negative condition sequences don't cause craft death

**When to add a simulation test:**

- When a scoring or ordering change affects multi-turn behavior
- When a bug report describes "the optimizer does X instead of Y over several turns"
- When you need to verify that a fix doesn't regress other craft scenarios

**When to use a unit test instead:**

- Single-turn scoring or ordering concerns
- Testing a specific function's input/output
- Testing edge cases of a helper function

## Required validation for mechanics changes

1. update/add relevant tests
2. run full suite (`bun run test`)
3. run docs checks if docs touched (`bun run docs:check`)
4. include at least one regression scenario when recommendation behavior changes intentionally
5. for scoring/ordering changes: verify all simulation tests pass (see `AGENTS.md` → "How to safely change the optimizer")
