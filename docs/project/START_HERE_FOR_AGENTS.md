---
title: Start Here For Agents
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-26
source_of_truth: src/modContent/index.ts, src/optimizer/*, src/__tests__/*
review_cycle_days: 30
related_files:
  - AGENTS.md
  - .agents/skills/afnm-modding/SKILL.md
  - docs/project/ARCHITECTURE.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/RUNTIME_EVIDENCE_075.md
---

# Start Here For Agents

CraftBuddy targets AFNM **0.7.5**. If you read a claim about four harmony types, item-kind harmony inference, a manual `Finish Craft` action, or a Rust engine that cannot see item actions, it is pre-0.7.5 and wrong.

## Critical first read

1. `AGENTS.md` — commands and hard rules (always loaded).
2. Load the `afnm-modding` skill — task routing, project rules, repo map.
3. Load only the task-specific skill it routes you to; avoid bulk-loading docs.

## When no skill applies

1. `docs/project/ARCHITECTURE.md` — module map, layer rules, dependency direction.
2. `docs/project/OPTIMIZER_DESIGN.md` — how the recommendation is produced.
3. `docs/project/MECHANICS_PARITY.md` — what is modelled, how it is proven, what is not.
4. `docs/project/ROADMAP.md` — active priorities.

## The four rules everything else follows from

1. Pure search in `src/optimizer/*`; all game access in `src/modContent/*`.
2. Outside `src/optimizer/*`, import only `src/optimizer/index.ts`.
3. `src/optimizer/outcome.ts` is the only place band thresholds, tier requirements and the auto-finish predicate exist.
4. The installed runtime outranks docs, types, tooltips and patch notes.

## Key code entrypoints

- integration: `src/modContent/index.ts`
- root-state/session helpers: `src/modContent/craftingStoreState.ts`
- auto mode: `src/modContent/autoCraftController.ts`, `autoCraftExecutor.ts`, `craftStateSignature.ts`, `nativeAutoUse.ts`
- optimizer facade: `src/optimizer/index.ts`
- outcome/band model: `src/optimizer/outcome.ts`
- search: `src/optimizer/search.ts`
- transitions: `src/optimizer/skills.ts`
- formulas/types: `src/optimizer/gameTypes.ts`
- harmony: `src/optimizer/harmony.ts`, `harmonyRegistry.ts`
- Rust engine: `crates/craftbuddy-engine/` (`effects.rs` is the parity layer)
- outcome presentation: `src/utils/outcomeSummary.ts`

## 0.7.5 reference docs

- `docs/project/RUNTIME_EVIDENCE_075.md` — extracted runtime source for the auto-use hook, the absence of a manual finish, and the resonance formulas. Authoritative; do not re-derive these from tooltips.
- `docs/project/ENGINE_PERFORMANCE_075.md` — engine measurements, the profiling harness, and the optimizations rejected with data.
- `docs/project/OPTIMIZER_ENGINE_FINDINGS.md` — engine decision record.
- `docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md` — what is settled vs open.
- `docs/project/RELEASE_NOTES_6.0.0.md` — what the 0.7.5 rework changed.

## Context rules

- `docs/project/*` is authoritative; `docs/reference/*` is context only.
- Start with `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` when modding reference is needed; do not bulk-load the rest.
- The community guide (`docs/reference/afnm-crafting-guide/`) is a hypothesis source. Confirm against `MECHANICS_PARITY.md`, tests, or the runtime before acting on it.
- `docs/plans/*` is historical planning, not current truth.
- If a doc or skill is wrong, stale, duplicated or misleading, fix it in the same change. See `docs/project/DOCS_GOVERNANCE.md`.
