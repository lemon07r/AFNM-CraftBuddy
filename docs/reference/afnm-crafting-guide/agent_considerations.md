---
title: Agent Considerations & Potential Blind Spots
status: active
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-03-09
source_of_truth: docs/reference/afnm-crafting-guide/agent_considerations.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
  - src/optimizer/harmony.ts
  - src/optimizer/skills.ts
  - src/optimizer/search.ts
---

# Agent Considerations & Potential Blind Spots

This document is reference-only triage input for future coding agents. Do not implement guide claims from here without confirming them against `docs/project/MECHANICS_PARITY.md`, code, and tests.

## Validation labels

- `Implemented and covered` means the claim is already represented in code and explicit tests.
- `Implemented but under-tested` means the mechanic exists in code and is worth checking if a related bug report appears.
- `Chosen product behavior` means the optimizer now intentionally behaves this way even if the guide framed it as a missing mechanic.
- `Unverified` means do not implement directly from this doc without checking runtime/code/tests first.

## 1. Percentage Buff Order Of Operations

Status: `Implemented and covered`

- Runtime-shaped percent buffs such as `stats.intensity = { value: 0.5, stat: 'intensity' }` already scale only the pre-craft base stat.
- Flat in-craft stat bonuses remain additive and are not multiplied by those percent buffs.
- Coverage: `src/__tests__/gameAccuracy.test.ts`

## 2. Inscribed Patterns Stack Destruction

Status: `Implemented and covered`

- Invalid-color actions already trigger the catastrophic stack-halving penalty in harmony simulation.
- Coverage: `src/__tests__/harmony.test.ts`

## 3. Spiritual Resonance Target Shifting

Status: `Implemented and covered`

- The harmony state already tracks the double-switch behavior where repeating a new color twice changes the target.
- Coverage: `src/__tests__/harmony.test.ts`

## 4. Chance-Based Completion (Partial Success)

Status: `Chosen product behavior`

- Search now models `Finish Craft` directly as a voluntary action with runtime-faithful craft-end ladders for both completion and perfection, not a linear `completion / target` proxy.
- A persisted `searchGoalPriorityBias` slider now lets users bias the same underlying scorer toward perfection (`-100`) or completion (`100`), with balanced (`0`) as the default neutral policy.
- Coverage: `src/__tests__/search.test.ts`, `src/__tests__/craftSimulation.test.ts`, `src/__tests__/modContentHarmonyState.test.ts`

## 5. Toxicity Vs. Detoxification Math

Status: `Implemented and covered`

- Active buff effects already support per-turn `changeToxicity` adjustments, and those buffs now have explicit multi-turn coverage.
- Coverage: `src/__tests__/skills.test.ts`

## Summary Checklist For Agents

- [ ] Confirm the guide claim status here before changing code.
- [ ] Verify mechanics against `docs/project/MECHANICS_PARITY.md` and tests, not this reference doc alone.
- [ ] Use this directory to seed regressions or parity checks, not to justify new heuristics by itself.
