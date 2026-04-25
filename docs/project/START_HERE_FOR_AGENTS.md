---
title: Start Here For Agents
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-04-25
source_of_truth: src/modContent/index.ts, src/optimizer/*, src/__tests__/*
review_cycle_days: 14
related_files:
  - AGENTS.md
  - .agents/skills/afnm-modding/SKILL.md
  - docs/project/ARCHITECTURE.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/RELEASE_PROCESS.md
---

# Start Here For Agents

Fast, low-noise onboarding for AFNM-CraftBuddy.

## Critical first read

1. `AGENTS.md` — compact repo conventions, commands, and safety rules.
2. `.agents/skills/afnm-modding/SKILL.md` — task routing into project skills.
3. Load only the task-specific skill/doc below; avoid bulk-loading the reference corpus.

## Skill-first routing

| Task | Load this skill first | Then read |
| --- | --- | --- |
| Optimizer/search/MCTS behavior | `craftbuddy-optimizer` | `docs/project/OPTIMIZER_DESIGN.md` |
| Runtime state, ModAPI, auto-action bridge | `craftbuddy-runtime-integration` | `docs/project/INTEGRATION_MODAPI.md` |
| UI layout, harness, visual checks | `craftbuddy-ui-validation` | `docs/project/TESTING.md` |
| Release/Workshop publish | `craftbuddy-release` | `docs/project/RELEASE_PROCESS.md` |
| ModAPI surface verification | `runtime-oracle`, `modapi-lookup` | installed runtime grep output |

## Recommended doc load order when no skill applies

1. `docs/project/ARCHITECTURE.md` — module map and dependency direction.
2. `docs/project/MECHANICS_PARITY.md` — implemented/pending mechanics parity.
3. `docs/project/ROADMAP.md` — active priorities.

## Community guide context

- `docs/reference/afnm-crafting-guide/` is a hypothesis source for optimizer and parity work.
- Treat `docs/reference/afnm-crafting-guide/agent_considerations.md` as triage input only.
- Before acting on any guide claim, confirm its status in `docs/project/MECHANICS_PARITY.md` and tests.

## Key code entrypoints

- integration: `src/modContent/index.ts`
- root-state/session helpers: `src/modContent/craftingStoreState.ts`
- search: `src/optimizer/search.ts`
- transitions: `src/optimizer/skills.ts`
- formulas/types: `src/optimizer/gameTypes.ts`
- harmony logic: `src/optimizer/harmony.ts`
- Rust MCTS policy prior: `crates/craftbuddy-engine/`

## Context rules

- `docs/project/*` is authoritative; `docs/history/*` and `docs/reference/*` are non-authoritative context only.
- Do not bulk-load `archive/` or the full reference corpus. Start with `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` only when modding reference docs are needed.
- See `docs/project/DOCS_GOVERNANCE.md` for metadata and update policy.
