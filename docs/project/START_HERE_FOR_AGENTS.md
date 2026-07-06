---
title: Start Here For Agents
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-06
source_of_truth: src/modContent/index.ts, src/optimizer/*, src/__tests__/*
review_cycle_days: 14
related_files:
  - AGENTS.md
  - .agents/skills/afnm-modding/SKILL.md
  - docs/project/ARCHITECTURE.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md
  - docs/project/RELEASE_PROCESS.md
---

# Start Here For Agents

## Critical first read

1. `AGENTS.md` — commands and hard rules (always loaded).
2. Load the `afnm-modding` skill — task routing, project rules, repo map.
3. Load only the task-specific skill routed by `afnm-modding`; avoid bulk-loading docs.

## When no skill applies

1. `docs/project/ARCHITECTURE.md` — module map and dependency direction.
2. `docs/project/MECHANICS_PARITY.md` — implemented/pending mechanics parity.
3. `docs/project/ROADMAP.md` — active priorities.

## Key code entrypoints

- integration: `src/modContent/index.ts`
- root-state/session helpers: `src/modContent/craftingStoreState.ts`
- search: `src/optimizer/search.ts`
- transitions: `src/optimizer/skills.ts`
- formulas/types: `src/optimizer/gameTypes.ts`
- harmony logic: `src/optimizer/harmony.ts`
- Rust MCTS policy prior: `crates/craftbuddy-engine/`
- optimizer engine performance and Rust/WASM follow-up: `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`
- optimizer improvement handoff and next workstreams: `docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md`

## Context rules

- `docs/project/*` is authoritative; `docs/reference/*` is non-authoritative context only.
- Start with `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` only when modding reference docs are needed.
- Community guide (`docs/reference/afnm-crafting-guide/`) is a hypothesis source only. Confirm claims in `docs/project/MECHANICS_PARITY.md` and tests before acting.
- If any doc or skill is wrong, stale, duplicated, or misleading, correct it in the same change.
- See `docs/project/DOCS_GOVERNANCE.md` for metadata and update policy.
