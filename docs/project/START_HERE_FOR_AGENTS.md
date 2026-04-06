---
title: Start Here For Agents
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-04-04
source_of_truth: src/modContent/index.ts, src/optimizer/*, src/__tests__/*
review_cycle_days: 14
related_files:
  - AGENTS.md
  - docs/project/ARCHITECTURE.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/RELEASE_PROCESS.md
---

# Start Here For Agents

Fast, low-noise onboarding for implementation work on AFNM-CraftBuddy.

## Critical first read

`AGENTS.md` — repository conventions, build/test commands, and **optimizer design principles** (anti-patterns, scoring rules, validation workflow). Loaded automatically by most AI agent frameworks.

## Recommended load order

1. `AGENTS.md` (conventions + optimizer guardrails)
2. `docs/project/ARCHITECTURE.md` (module map + dependency direction)
3. `docs/project/MECHANICS_PARITY.md` (what's implemented, what's pending)
4. `docs/project/OPTIMIZER_DESIGN.md` (search, scoring, performance tuning)
5. `docs/project/ROADMAP.md` (active priorities)

## Task-specific docs

- testing + harness + installed runtime oracle + optional live UI verification: `docs/project/TESTING.md`
- ModAPI/root-state integration, runtime migration targets, and locale-safe fallback rules: `docs/project/INTEGRATION_MODAPI.md`
- release/version bump/tag/workshop flow: `docs/project/RELEASE_PROCESS.md`

## Community guide context

- `docs/reference/afnm-crafting-guide/` is available as a hypothesis source for optimizer and parity work.
- Treat `docs/reference/afnm-crafting-guide/agent_considerations.md` as triage input only; it labels each claim as implemented, under-tested, product policy, or unverified.
- Before acting on any guide claim, confirm its status in `docs/project/MECHANICS_PARITY.md` and the matching tests.

## Key code entrypoints

- integration: `src/modContent/index.ts`
- root-state/session helpers: `src/modContent/craftingStoreState.ts`
- search: `src/optimizer/search.ts`
- transitions: `src/optimizer/skills.ts`
- formulas/types: `src/optimizer/gameTypes.ts`
- harmony logic: `src/optimizer/harmony.ts`

## Context rules

- `docs/project/*` is authoritative; `docs/history/*` and `docs/reference/*` are non-authoritative context only.
- Do not bulk-load the reference corpus; use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` first.
- See `docs/project/DOCS_GOVERNANCE.md` for the full docs model, metadata requirements, and update policy.
