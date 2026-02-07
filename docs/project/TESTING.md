---
title: Testing Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/__tests__/*, package.json, scripts/docs/*
review_cycle_days: 30
related_files:
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

- verified 2026-02-07: 6 suites, 256 tests passing

## Test ownership by area

- `gameAccuracy.test.ts`: formula/mechanics parity
- `harmony.test.ts`: harmony subsystem behavior
- `skills.test.ts`: transition logic + buffs/masteries/effects
- `search.test.ts`: recommendation/search behavior
- `state.test.ts`: state invariants/cache key behavior
- `largeNumbers.test.ts`: numeric safety

## Required validation for mechanics changes

1. update/add relevant tests
2. run full suite
3. run docs checks if docs touched
4. include at least one regression scenario when recommendation behavior changes intentionally
