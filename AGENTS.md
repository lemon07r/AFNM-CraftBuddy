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
- Any change to scoring or move ordering in `search.ts` must pass **both** the simulation tests (`craftSimulation.test.ts`) and the regression tests at the bottom of `search.test.ts`.
- See `docs/project/TESTING.md` for simulation vs. unit test guidance, test ownership by area, and validation requirements.

## Commit & Pull Request Guidelines

- Follow established commit prefixes: `feat:`, `fix:`, `docs:`, `perf:`, `chore(release):`.
- Keep commits scoped to one logical change and use imperative summaries.
- PRs should include a clear change summary, linked issue (if available), test evidence (commands run), and screenshots for UI updates in `src/ui/`.
- Explicitly call out gameplay-impacting changes (search scoring, harmony behavior, config defaults).

## Optimizer Design Principles

These principles exist because past agents introduced compounding heuristic patches that made the optimizer produce poor recommendations. Follow these rules when modifying anything in `src/optimizer/search.ts`.

See `docs/project/OPTIMIZER_DESIGN.md` for the implementation details (scoring layers, search modes, caching, move ordering). This section covers the **design rules and anti-patterns** that constrain how changes should be made.

### Scoring rules

- **Proportional, not magic numbers.** Bonuses and penalties must scale with the craft's target magnitude (e.g., `totalTargetMagnitude * 2`). All weights are defined in named constant blocks (`SCORING`, `ORDERING`, `WASTE`, `STALL_PENALTY_MULTIPLIER`) at the top of `search.ts`; add new constants there with a rationale comment.
- **No stability penalties when targets are met.** If `baseTargetsMet` is true the craft is done — survivability penalties must not apply.
- **Step efficiency.** Penalise `state.step` so shorter paths beat longer ones when both reach the same goal.
- **Tiny resource tiebreakers when targets are met.** Use `*0.001` (not `*0.05`) so leftover qi/stability never justifies an extra turn.
- **Death must be worse than any progress path.** The death penalty (`SCORING.DEATH_PENALTY_MULTIPLIER`) must exceed `TARGET_MET_MULTIPLIER`. The runway penalty is proportional and **uncapped** — never cap runway penalties.

### Rotation display (`findOptimalPath`)

- **Uses transposition table best-move entries.** The cache stores `{ score, bestMove }` at each node. `findOptimalPath()` reconstructs the tree search's actual chosen path by looking up the cached `bestMove`, with greedy evaluation fallback for cache misses.
- **Never greedily re-decide.** Past versions re-evaluated all skills at each step, which diverged from the tree search (especially at shallow remaining depth). The transposition table approach ensures the rotation matches what the tree search computed.

### Move ordering & filtering

- **No hard filters.** Never remove a skill from the search tree before evaluation. Use `computeStallPenalties()` → soft penalties folded into `orderSkillsForSearch()` instead.
- **Condition-aware ordering.** `orderSkillsForSearch()` must use `calculateSkillGains()` with current condition effects — never raw `baseCompletionGain`/`basePerfectionGain`.
- **Stall penalties apply at recommendation level.** In greedy search and the lookahead first-move evaluation, stall penalties are added to `scoreState` results. Inside the recursive tree search, only ordering is affected.

### Stabilize penalty rules

The stall penalty system in `computeStallPenalties()` must **never** penalize stabilize when the craft needs it to survive. The `stabilizeProtected` flag gates this:

- `allProgressWouldEndCraft`: every progress skill would drop stability to 0.
- `stabilityRunwayInsufficient`: estimated turns to finish exceeds estimated turns of stability remaining. **Only applies when `canStabilizeHelpRunway` is true** (i.e., `stability < maxStability`, so stabilize would actually gain stability).

**Critical invariant**: `stabilityRunwayInsufficient` must be gated on whether stabilize can actually help. If stability equals maxStability (due to maxStability decay), stabilize gains 0 stability and cannot improve the runway. Protecting it in this case causes a **stabilize death spiral** — the optimizer recommends stabilize repeatedly (wasting qi and turns) because the runway check keeps protecting it, but each stabilize does nothing.

The stall penalty (`-totalTargetMagnitude × STALL_PENALTY_MULTIPLIER`) is applied to the first-move score in `evaluateFirstMoves()`, which can override the tree search's verdict. This is acceptable when stabilize is genuinely wasteful, but catastrophic when stabilize is needed for survival.

### Anti-patterns (DO NOT repeat)

These are real mistakes from past optimizer work. Each one degraded recommendation quality.

**1. Hardcoded bonus/penalty constants**

```typescript
// BAD — magic number that works for one craft size but breaks others
if (baseTargetsMet) score += 200;

// GOOD — scales with the craft's actual target magnitude
if (baseTargetsMet) score += totalTargetMagnitude * 2;
```

**2. Hard-filtering skills out of the search tree**

```typescript
// BAD — permanently removes a skill before the tree can evaluate it
const filtered = skills.filter(s => !isWastefulStabilize(s));

// GOOD — soft penalty that sinks the skill in ordering but keeps it reachable
const penalties = computeStallPenalties(state, skills, ...);
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
// BAD — penalises a completed craft (comp=50/50, perf=50/50, stability=0)
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
  score += 50;
}

// GOOD — write a simulation test that reproduces the scenario, then fix
// the underlying scoring/ordering layer so it handles the class of cases
```

**6. Heuristics that override or fight the tree search**

The tree search (`search()`) is the authoritative evaluator. Heuristics added outside the tree (e.g., stall penalties on the first-move score) can override its verdict. This is dangerous because the tree sees actual consequences while the heuristic is a guess.

When a fix requires adding a new heuristic to counteract an existing one, the design is wrong. Each added heuristic interacts with all others, creating exponentially more edge cases.

```typescript
// BAD — stall penalty overrides the tree search's survival detection
rec.score = evaluateFutureScoreAfterSkill(...) + stallPenalty;

// BAD — three heuristics fighting each other:
// 1. Runway penalty says "stabilize!"
// 2. Stall penalty says "don't stabilize!"
// 3. New "critical override" to compensate
// Each was "reasonable" in isolation but they interact unpredictably.

// GOOD — heuristic checks multi-turn survival before penalizing
const turnsToFinish = estimateRemainingTurns(state, targets);
const turnsOfRunway = state.stability / ctx.avgStabilityCostPerTurn;
if (turnsToFinish > turnsOfRunway) return; // never penalize survival-critical stabilize
```

Signs you are creating heuristic soup:

- You are adding a heuristic to counteract another heuristic
- Your fix requires tuning 3+ existing constants to avoid regressions
- Your fix works for the reported scenario but you can't explain why it won't break others
- The same concern (e.g., "should I stabilize?") is evaluated in 3+ places with different logic

**7. Greedy rotation reconstruction diverging from tree search**

```typescript
// BAD — re-evaluates all skills at each step; diverges at shallow remaining depth
for (const skill of orderedSkills) {
  const score = evaluateFutureScoreAfterSkill(nextState, maxDepth - step - 1, ...);
  if (score > bestScore) { bestSkill = skill; }
}

// GOOD — use transposition table bestMove entries
const cached = cache.get(cacheKey);
if (cached?.bestMove) {
  chosenSkill = skills.find(s => s.key === cached.bestMove);
}
```

### When to add a new scoring term

1. Write a `craftSimulation.test.ts` test that reproduces the bad behavior first. If you cannot write a failing test, you probably do not need a new term.
2. Check if an existing layer already handles the concern — adjust its parameters rather than duplicating.
3. New terms must scale proportionally with the craft's target magnitude.
4. If adding a term requires adjusting 3+ other terms to compensate, the design is wrong.

### How to safely change the optimizer

1. Read `docs/project/OPTIMIZER_DESIGN.md` and this section of `AGENTS.md`.
2. Write a failing simulation test in `craftSimulation.test.ts` that reproduces the problem.
3. Implement the fix in the correct scoring layer — do not add a new layer unless clearly justified.
4. Run `bun run test` — **all tests must pass**.
5. Run `bun run build` — must compile without errors.
6. If the change affects scoring or ordering, verify the existing simulation tests still pass.
