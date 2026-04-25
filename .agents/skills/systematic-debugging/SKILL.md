---
name: systematic-debugging
description: CraftBuddy debugging methodology. Activate when typecheck/build/runtime/test failures occur, optimizer behavior regresses, auto-craft stalls, or repeated fix attempts start to thrash.
---

# Systematic Debugging

Use this to prove the root cause before changing code.

## Activate When

- TypeScript, Jest, build, docs, runtime, or harness checks fail
- Optimizer recommendations differ from expected replay/simulation behavior
- `src/modContent/*` extraction, replay snapshots, or auto-craft state advance is suspect
- A fix attempt fails and you are about to try another

## Phase 1: Capture Evidence

1. Copy the exact error, stack trace, failing test, or replay snapshot symptom.
2. Identify the smallest owning surface: optimizer, runtime adapter, auto-craft, UI, docs, or release tooling.
3. For runtime/API questions, run `bun run runtime:oracle` and targeted `bun run runtime:grep -- "<symbol>"` before trusting old notes.
4. For optimizer questions, reproduce with a focused Jest file or exported replay fixture before tuning constants.
5. Form one concrete hypothesis that names the broken assumption.

## Phase 2: Check CraftBuddy Patterns

- Runtime boundary drift? Load `craftbuddy-runtime-integration` and inspect `src/modContent/*` plus `docs/project/INTEGRATION_MODAPI.md`.
- Search/scoring drift? Load `craftbuddy-optimizer`, then check `docs/project/OPTIMIZER_DESIGN.md`, `search.test.ts`, and `craftSimulation.test.ts`.
- UI/layout drift? Load `craftbuddy-ui-validation` and use the browser harness.
- Auto-craft stalled? Verify the one-action bridge, synthesized `Finish Craft` -> native `Wait`, and the observed state-advance latch.
- Debug state needed? Use or extend `window.craftBuddyDebug`; keep exported replay snapshots parity-grade.

## Phase 3: Test One Hypothesis

- Change one cause at a time.
- Prefer focused validators during iteration: targeted Jest file, `bun run typecheck`, `bun run runtime:grep`, or harness build.
- Keep wall-clock search behavior deterministic in tests by asserting completed depth/frontier or node-budget behavior instead of one machine's partial frontier.
- Preserve a failing fixture/test before fixing user-visible recommendation changes.

## Phase 4: Fix and Backfill Evidence

- Fix the root cause, not the symptom.
- Add or update the regression test, replay fixture, oracle note, docs, or skill that would have prevented the miss.
- Run the relevant final validators through `pre-commit-validation` before claiming completion.

## Rules

- Stop after three failed attempts and re-check the runtime/code/test evidence.
- Do not patch optimizer constants without a named scenario and regression proof.
- Do not add runtime assumptions outside `src/modContent/*`.
- Do not launch the installed game UI unless the user explicitly requests live validation or a non-disruptive automated path exists.

## References

- `docs/project/TESTING.md`
- `docs/project/OPTIMIZER_DESIGN.md`
- `docs/project/INTEGRATION_MODAPI.md`
- `.agents/skills/craftbuddy-optimizer/SKILL.md`
- `.agents/skills/craftbuddy-runtime-integration/SKILL.md`
