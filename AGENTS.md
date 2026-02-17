# Repository Guidelines

## Project Structure & Module Organization

- `src/mod.ts` is the entry point for mod metadata and bootstrapping.
- `src/modContent/` contains game integration and runtime wiring.
- `src/optimizer/` holds core crafting logic (`state.ts`, `skills.ts`, `search.ts`, `harmony.ts`).
- `src/ui/` contains React panels like `RecommendationPanel.tsx` and `SettingsPanel.tsx`.
- `src/settings/` and `src/utils/` contain configuration and shared helpers.
- `src/__tests__/` contains unit tests, with mocks under `src/__tests__/__mocks__/`.
- `docs/project/` is authoritative project documentation; `docs/dev-requests/` tracks API requests; `docs/history/` is historical context; `docs/reference/` is a curated non-authoritative reference subset.
- `archive/` stores large/deprecated documentation snapshots (for traceability only) and is intentionally excluded from active docs checks/inventory.
- `scripts/zip-dist.js` handles packaging.
- Generated outputs (`dist/`, `builds/`, `coverage/`) are build artifacts and are gitignored.

## Build, Test, and Development Commands

- `bun install`: install dependencies.
- `bun run build`: run webpack production build and package the mod zip to `builds/`.
- `bun run test`: run all Jest tests once.
- `bun run test:watch`: run tests in watch mode while iterating.
- `bun run test:coverage`: generate coverage reports in `coverage/` (text, lcov, html).
- `bun run docs:check`: validate docs links/freshness/authority.
- `bun run docs:inventory`: regenerate `docs/DOC_INVENTORY.md`.
- `bun run jest src/__tests__/search.test.ts`: run a focused test file.

## Documentation Workflow

- Start technical onboarding at `docs/project/START_HERE_FOR_AGENTS.md`.
- Treat `docs/project/*` as implementation source of truth, then verify against code/tests.
- Use `docs/reference/afnm-modding/CRAFTING_SHORTLIST.md` before opening any other reference docs.
- Use `archive/` only when the curated/active docs are insufficient.
- If you change docs, run `bun run docs:inventory` and `bun run docs:check` before committing.

## Coding Style & Naming Conventions

- Use TypeScript (`strict` mode) and React TSX.
- Formatting is controlled by `.prettierrc`: 2 spaces, single quotes, trailing commas, LF endings, no tabs.
- Use `PascalCase` for React components (`SettingsPanel.tsx`), `camelCase` for utility/module files (`largeNumbers.ts`), and `*.test.ts` for tests.
- Keep optimizer/game-state logic pure where possible; keep side effects inside integration modules in `src/modContent/`.

## Testing Guidelines

- Framework: Jest + `ts-jest` with `testEnvironment: 'node'`.
- Add tests in `src/__tests__/` and mirror feature names (`skills.test.ts`, `state.test.ts`, etc.).
- For changes in `src/optimizer/`, include cases for target completion, stability/Qi limits, and condition or buff interactions.
- Run `bun run test` before pushing; use coverage checks for larger refactors.

### Simulation tests vs. unit tests

- **`craftSimulation.test.ts`** uses `simulateCraft()` to run full multi-turn crafts end-to-end. Use these when testing behavior that spans multiple turns (e.g., "does the optimizer use buffs before payoff skills?", "does it exploit positive conditions?", "does it stabilize instead of dying?").
- **`search.test.ts`** unit tests cover single-turn scoring, ordering, and per-skill recommendation behavior. Use these for isolated concerns (e.g., "does scoreState penalize overshoot?", "does ordering prioritize buff-consuming skills?").
- Any change to scoring or move ordering in `search.ts` must pass **both** the simulation tests and the regression tests at the bottom of `search.test.ts`.

## Commit & Pull Request Guidelines

- Follow established commit prefixes: `feat:`, `fix:`, `docs:`, `perf:`, `chore(release):`.
- Keep commits scoped to one logical change and use imperative summaries.
- PRs should include a clear change summary, linked issue (if available), test evidence (commands run), and screenshots for UI updates in `src/ui/`.
- Explicitly call out gameplay-impacting changes (search scoring, harmony behavior, config defaults).

## Optimizer Design Principles

These principles exist because past agents introduced compounding heuristic patches that made the optimizer produce poor recommendations. Follow these rules when modifying anything in `src/optimizer/search.ts`.

### Scoring (`scoreState`)

- **Proportional, not magic numbers.** Bonuses and penalties must scale with the craft's target magnitude (e.g., `totalTargetMagnitude * 2`) — never use inline unnamed constants like `+200`, `+300`, `+50`. All scoring weights, ordering priorities, and waste thresholds are defined in named constant blocks (`SCORING`, `ORDERING`, `WASTE`, `STALL_PENALTY_MULTIPLIER`) at the top of `search.ts`; add new constants there with a rationale comment.
- **Layered architecture.** The scorer has numbered layers (progress → target-met bonus → buffs → resources → overshoot → survivability → toxicity/harmony). New terms belong in an existing layer or a clearly documented new one.
- **No stability penalties when targets are met.** If `baseTargetsMet` is true the craft is done — survivability penalties must not apply.
- **Step efficiency.** Penalise `state.step` so shorter paths beat longer ones when both reach the same goal.
- **Tiny resource tiebreakers when targets are met.** Use `*0.001` (not `*0.05`) so leftover qi/stability never justifies an extra turn.

### Move Ordering & Filtering

- **No hard filters.** Never remove a skill from the search tree before evaluation. Use `computeStallPenalties()` → soft penalties folded into `orderSkillsForSearch()` instead. Skills with penalties sink in the beam but remain reachable if nothing else is viable.
- **Condition-aware ordering.** `orderSkillsForSearch()` must use `calculateSkillGains()` with the current condition effects — never raw `baseCompletionGain`/`basePerfectionGain`.
- **Stall penalties apply at recommendation level.** In greedy search and the lookahead first-move evaluation, stall penalties are added to `scoreState` results. Inside the recursive tree search, only ordering is affected.

### Anti-patterns (DO NOT repeat)

These are real mistakes from past optimizer work. Each one degraded recommendation quality and took significant effort to diagnose and fix.

**1. Hardcoded bonus/penalty constants**

```typescript
// BAD — magic number that works for one craft size but breaks others
if (baseTargetsMet) score += 200;
if (state.stability < 20) score -= 45;
if (state.stability <= 0) score -= 200;

// GOOD — scales with the craft's actual target magnitude
const targetMetBonus = totalTargetMagnitude * 2;
if (baseTargetsMet) score += targetMetBonus;
const penaltyWeight = Math.max(45, totalTargetMagnitude * 0.45);
if (state.stability < threshold) score -= risk * risk * penaltyWeight;
```

**2. Hard-filtering skills out of the search tree**

```typescript
// BAD — permanently removes a skill before the tree can evaluate it
const filtered = skills.filter(s => !isWastefulStabilize(s));
return filtered; // if the heuristic is wrong, the optimal move is gone

// GOOD — soft penalty that sinks the skill in ordering but keeps it reachable
const penalties = computeStallPenalties(state, skills, ...);
// penalties are folded into orderSkillsForSearch() priority scores
```

**3. Ignoring condition effects in move ordering**

```typescript
// BAD — uses raw base gains, ignoring that conditions double/halve them
priority += skill.baseCompletionGain * 2;

// GOOD — uses actual condition-modified gains
const gains = calculateSkillGains(state, skill, config, conditionEffects, ...);
priority += gains.completion * 2;
```

**4. Applying stability penalties when targets are already met**

```typescript
// BAD — penalises a state where comp=50/50, perf=50/50, stability=0
// This makes the optimizer prefer Stabilize over an immediate finish
if (state.stability <= 0) score -= 200; // always applied

// GOOD — skip survivability when the craft is done
if (!baseTargetsMet) {
  if (state.stability <= 0) score -= targetMetBonus;
}
```

**5. Adding one-off `if` branches for specific scenarios**

```typescript
// BAD — patching a symptom without understanding the root cause
if (
  state.completion > 40 &&
  state.perfection < 10 &&
  condition === 'positive'
) {
  score += 50; // "fix" for one specific craft scenario
}

// GOOD — write a simulation test that reproduces the scenario, then fix
// the underlying scoring/ordering layer so it handles the class of cases
```

**6. Heuristics that override the tree search**

The tree search (`search()`) evaluates future states turn-by-turn and is the authoritative evaluator. Heuristics added outside the tree (e.g., stall penalties added to the first-move score) can override the tree's verdict. This is dangerous because the tree sees the actual consequences while the heuristic is a guess.

```typescript
// BAD — stall penalty overrides the tree search's survival detection
// The tree correctly sees that stabilize leads to survival and progress
// leads to death. But the proportional stall penalty is added AFTER the
// tree search score, reversing the tree's judgment.
rec.score = evaluateFutureScoreAfterSkill(...) + stallPenalty; // -totalTargetMagnitude × STALL_PENALTY_MULTIPLIER

// BAD — heuristic penalizes stabilize based on single-turn waste/cost,
// ignoring that the craft needs multiple more turns of stability to survive
if (wasteRatio >= 0.35) penalize(stabilize);     // doesn't check runway
if (qiPerStability >= 2.2) penalize(stabilize);  // doesn't check runway

// GOOD — heuristic checks multi-turn survival before penalizing
const turnsToFinish = estimateRemainingTurns(state, targets);
const turnsOfRunway = state.stability / ctx.avgStabilityCostPerTurn;
if (turnsToFinish > turnsOfRunway) {
  // Craft will die without stabilize — never penalize it
  return;
}
// Only now check waste/cost for optional stabilization
```

**7. Heuristic soup: patches compensating for other patches**

When a fix requires adding a new heuristic to counteract the effects of an existing heuristic, the design is wrong. Each added heuristic interacts with all existing heuristics, creating exponentially more edge cases.

```typescript
// BAD — three heuristics fighting each other:
// 1. Runway penalty says "stabilize!" (+15 score for stabilize path)
// 2. Stall penalty says "don't stabilize!" (large negative proportional to craft size)
// 3. New "critical stabilize override" to compensate (+2500 when critical)
// Each patch was "reasonable" in isolation but they interact unpredictably.

// GOOD — one mechanism makes the decision:
// The tree search simulates future states. scoreState() evaluates them.
// If stabilize leads to survival and progress leads to death,
// the tree's evaluation is the final answer — no heuristic overrides it.
```

Signs you are creating heuristic soup:

- You are adding a heuristic to counteract another heuristic
- Your fix requires tuning 3+ existing constants to avoid regressions
- Your fix works for the reported scenario but you can't explain why it won't break other scenarios
- The same concern (e.g., "should I stabilize?") is evaluated in 3+ different places with different logic

### When to add a new scoring term

1. **First**, write a `craftSimulation.test.ts` test that reproduces the bad behavior. If you cannot write a test that fails, you probably do not need a new term.
2. **Check if an existing layer already handles the concern.** If so, adjust its parameters — do not add a duplicate.
3. **New terms must scale proportionally** with the craft's target magnitude. No hardcoded constants.
4. **New terms must not interact unpredictably** with existing layers. If adding a term requires adjusting 3 other terms to compensate, the design is wrong.

### Stabilize penalty rules

The stall penalty system in `computeStallPenalties()` must **never** penalize stabilize when the craft needs it to survive. The `stabilizeProtected` flag gates this:

- `allProgressWouldEndCraft`: single-turn check — every progress skill would drop stability to 0.
- `stabilityRunwayInsufficient`: multi-turn check — estimated turns to finish exceeds estimated turns of stability remaining.

When either is true, `isWastefulStabilize()` returns false and no stall penalty is applied. **Never bypass or weaken these protections.**

The stall penalty (`-totalTargetMagnitude × STALL_PENALTY_MULTIPLIER`, e.g. −2000 for targets=200) is applied to the first-move score in `evaluateFirstMoves()`, which means it can override the tree search's verdict. This is acceptable when stabilize is genuinely wasteful (stability near max, craft almost done). It is catastrophic when stabilize is needed for survival — the stall penalty can make stabilize score lower than progress even though the tree search correctly sees that progress leads to death.

### How to safely change the optimizer

Follow this workflow for any change to `search.ts` scoring or ordering:

1. Read `docs/project/OPTIMIZER_DESIGN.md` and this section of `AGENTS.md`.
2. Write a failing simulation test in `craftSimulation.test.ts` that reproduces the problem.
3. Implement the fix in the correct scoring layer — do not add a new layer unless clearly justified.
4. Run `bun run test` — **all tests must pass**.
5. Run `bun run build` — must compile without errors.
6. If the change affects scoring or ordering, verify the existing simulation tests still pass. If any regress, investigate whether the regression reveals a real problem or a test that needs updating.

### Testing

- **End-to-end simulation tests** (`craftSimulation.test.ts`) simulate full multi-turn crafts. Any scoring or ordering change must pass these.
- **Regression tests** at the bottom of `search.test.ts` cover specific past bugs (stabilize filtering, condition exploitation, stall blocking).
- Run `bun run test` before every commit. All tests must pass.
