---
title: Start Here For Agents
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/modContent/index.ts, src/optimizer/*, src/__tests__/*
review_cycle_days: 14
related_files:
  - docs/project/ARCHITECTURE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/ROADMAP.md
---

# Start Here For Agents

## Goal

Fast, low-noise onboarding for implementation work on AFNM-CraftBuddy.

## Minimal load order (recommended)

1. `README.md`
2. `docs/project/ARCHITECTURE.md`
3. `docs/project/MECHANICS_PARITY.md`
4. `docs/project/OPTIMIZER_DESIGN.md`
5. `docs/project/ROADMAP.md`
6. `docs/project/OPEN_QUESTIONS.md`

## High-value code entrypoints

- integration: `src/modContent/index.ts`
- search: `src/optimizer/search.ts`
- transitions: `src/optimizer/skills.ts`
- formulas/types: `src/optimizer/gameTypes.ts`
- harmony logic: `src/optimizer/harmony.ts`

## Fast guardrails

- treat `docs/project/*` as authoritative
- treat `docs/history/*` as historical only
- treat `docs/reference/*` as reference-only context
- do not bulk-load the full reference corpus; use curated shortlist first:
  - `docs/reference/afnm-modding/README.md`
  - `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md`

## Verified baseline

- branch context at refresh: `main`
- tests at refresh: 270 passing (`bun run test`, verified 2026-02-07)
