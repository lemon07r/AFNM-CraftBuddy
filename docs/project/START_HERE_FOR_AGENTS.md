---
title: Start Here For Agents
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-15
source_of_truth: src/modContent/index.ts, src/optimizer/*, src/__tests__/*
review_cycle_days: 14
related_files:
  - AGENTS.md
  - docs/project/ARCHITECTURE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/ROADMAP.md
---

# Start Here For Agents

## Goal

Fast, low-noise onboarding for implementation work on AFNM-CraftBuddy.

## Critical first read

- `AGENTS.md` — repository conventions, build/test commands, and **optimizer design principles** (anti-patterns, scoring rules, validation workflow). This file is loaded automatically by most AI agent frameworks.

## Recommended load order

1. `AGENTS.md` (conventions + optimizer guardrails)
2. `docs/project/ARCHITECTURE.md`
3. `docs/project/MECHANICS_PARITY.md`
4. `docs/project/OPTIMIZER_DESIGN.md`
5. `docs/project/ROADMAP.md`
6. `docs/project/OPEN_QUESTIONS.md`

## Project docs

- `ARCHITECTURE.md` — runtime module map and dependency direction
- `OPTIMIZER_DESIGN.md` — search modes, scoring architecture, caching
- `MECHANICS_PARITY.md` — what's implemented, what's pending API exposure
- `INTEGRATION_MODAPI.md` — game adapter layer responsibilities
- `PERFORMANCE.md` — user-tunable search controls and tuning guidance
- `TESTING.md` — test framework, suites, validation requirements
- `ROADMAP.md` — active priorities and deferred work
- `OPEN_QUESTIONS.md` — unresolved dependency questions
- `DECISIONS.md` — key engineering decisions and rationale
- `DOCS_GOVERNANCE.md` — metadata requirements and update policy

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
- tests at refresh: all passing (`bun run test`, verified 2026-02-15)
