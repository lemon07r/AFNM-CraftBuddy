# CraftBuddy Future Work

Remaining features, improvements, and tech debt for planning purposes.
Items are grouped by category and ordered by impact within each group.

Last updated: Feb 2026 (after commit `73f7876`)
Current state: 197 tests passing, build clean.

---

## 1. Harmony System Simulation (Large -- High Impact)

**What:** The 4 harmony types for sublime crafts have completely different mechanics that significantly affect optimal play. The optimizer currently ignores harmony entirely during search, meaning sublime craft recommendations are based only on raw completion/perfection gains.

**Why it matters:** Sublime crafts are where experienced players spend the most effort. Bad harmony play causes huge stat penalties and wasted turns.

**Game data available:** `modAPI.gameData.harmonyConfigs` (typed `Record<RecipeHarmonyType, HarmonyTypeConfig>`), `progressState.harmonyTypeData` (live state during crafts).

**Sub-tasks:**

### 1a. Forge Works (320 lines of game code)
- Heat gauge 0-10. Stabilize cools (-1), fusion/refine heats (+1 or +2).
- Sweet spot 4-6: bonus harmony + intensity. 7-9: penalty. 10: catastrophic (-20 harmony, -1000% intensity).
- Optimizer needs: track heat in `HarmonyData`, penalize/reward heat-aware skill choices in scoring.

### 1b. Alchemical Arts (492 lines)
- Combo system tracking last 3 action types.
- Specific 3-action sequences (e.g., fusion-refine-stabilize) give large bonuses (+30 harmony, +25% intensity).
- Invalid combos: -20 harmony, -25% control.
- Optimizer needs: track action history in `HarmonyData`, recognize valid combos, score paths that set up combos.

### 1c. Inscribed Patterns (256 lines)
- Block-based pattern system. Must follow specific action type sequences within blocks.
- Valid actions: +10 harmony, stacking +2% intensity and control.
- Invalid: -20 harmony, lose half stacks, -1 max stability, -25 qi.
- Optimizer needs: track current block and stacks, heavily penalize breaking patterns.

### 1d. Resonance (269 lines)
- Using same action type repeatedly builds resonance strength.
- +3% crit chance and +3% success chance per resonance point.
- Switching types: -9 harmony, -1 resonance point, -3 stability (first switch only; second same-type use changes resonance without penalty).
- Optimizer needs: track resonance type/strength, factor crit/success bonuses into gain calculations.

**Integration approach:** Reimplement each `processEffect` as a deterministic simulation function in `src/optimizer/harmony.ts`. Hook into `applySkill()` to update `HarmonyData` on state after each simulated action. Add harmony-aware scoring bonuses/penalties in `scoreState()`.

---

## 2. Buff Per-Turn Effect Simulation (Medium -- Medium Impact)

**What:** The game's `doExecuteBuff()` runs buff effects every turn and also has action-type-specific blocks (`onFusion`, `onRefine`, `onStabilize`, `onSupport`). Our optimizer does not simulate these during lookahead.

**Why it matters:** Buffs like Empower stacks grant completion per turn, Pressure stacks modify costs. Without simulating these, the optimizer undervalues buff-creating skills and misses multi-turn synergies.

**Game data available:** Full buff definitions from `entity.techniques[].effects` (confirmed by dev). Our types already define `BuffDefinition.effects`, `onFusion`, `onRefine`, `onStabilize`, `onSupport` fields -- they're just not processed during simulation.

**Sub-tasks:**
- In `applySkill()`, after applying the technique, iterate `state.buffs` and execute each buff's `effects[]` block (per-turn effects).
- Execute action-type-specific blocks (e.g., `onFusion` if the technique type is `'fusion'`).
- Requires calling `evaluateScaling()` on each buff effect's `amount` with the current `ScalingVariables`.
- Handle buff effect kinds: `completion`, `perfection`, `stability`, `maxStability`, `pool`, `negate`, `createBuff`, `addStack`, `changeToxicity`.
- Add integration tests with real buff definitions from game data.

**Blocker:** Needs our `evaluateScaling()` to be accurate. When the game exposes this via modAPI (coming), we should switch to it.

---

## 3. Item/Pill Integration (Medium -- Low Impact)

**What:** Consumable items (pills, elixirs) can be used during crafting. They're not included in the optimizer search space.

**Why it matters:** Recovery pills restore qi, combat pills can buff stats. Niche but affects some builds.

**Game data available:** Dev confirmed "all defined on the item itself." Items available via `entity.craftingQuickAccess` or inventory during crafts.

**Sub-tasks:**
- Define an `ItemAction` type similar to `SkillDefinition` for consumable items.
- Parse item effects from game data (item definitions available on the items themselves).
- Add items as possible actions in the search space (separate from techniques).
- Track consumable count (limited uses per craft).
- UI: show item recommendations when optimal (e.g., "Use Qi Pill" before continuing).

---

## 4. Completion/Perfection Caps (Small -- Medium Impact)

**What:** The game caps completion and perfection via `getMaxCompletion()` and `getMaxPerfection()`. The optimizer doesn't know these caps and may recommend skills that overshoot with no benefit.

**Status:** Coming in modAPI (confirmed by dev).

**When available:**
- Read caps from modAPI.
- In `scoreState()`, penalize progress beyond caps more heavily.
- In `calculateSkillGains()`, clamp predicted gains at cap.
- Show caps in the UI progress bars.

---

## 5. Use Game's `evaluateScaling()` When Available (Small -- High Impact)

**What:** We reimplement `evaluateScaling()` in `gameTypes.ts`. The game will expose this via modAPI.

**Status:** Coming in modAPI (confirmed by dev).

**When available:**
- Replace our `evaluateScaling()` with a call to the game's version.
- Remove the `LARGE_GAIN_THRESHOLD` heuristic in `modContent/index.ts` (lines 433-444) that works around not knowing if values are pre-scaled. With the game's function, we can compute gains directly from `Scaling` objects.
- Enables accurate buff per-turn effect simulation (item 2 above).

---

## 6. Use Game's `calculateCraftingOvercrit()` When Available (Small -- Medium Impact)

**What:** We reimplement the overcrit formula. The game will expose this via modAPI.

**Status:** Coming in modAPI (confirmed by dev).

**When available:**
- Replace our `calculateExpectedCritMultiplier()` with the game's function.
- Removes risk of formula drift if the game changes the 1:3 excess crit ratio.

---

## 7. Use Game's `canUseAction()` When Available (Small -- Medium Impact)

**What:** We reimplement technique availability checks. The game will expose this via modAPI.

**Status:** Coming in modAPI (confirmed by dev).

**When available:**
- Replace our `canApplySkill()` with the game's pre-check.
- Catches edge cases we may miss (e.g., new condition types, new buff requirements).

---

## 8. Training Mode Differentiation (Small -- Low Impact)

**What:** The game has a training mode where failure has no real consequences. The optimizer doesn't distinguish this from real crafting.

**Game data available:** `CraftingState.trainingMode` exists in game types (has `flagKey`, `tier`, `recipeTypeId`).

**When implemented:**
- Detect training mode from Redux state.
- Adjust risk tolerance: recommend more aggressive strategies in training (lower stability margins, riskier combos).
- UI: indicate training mode in the panel.

---

## 9. Legacy Code Cleanup (Small -- No Impact on Users)

Tech debt that can be cleaned up when convenient:

### 9a. Deprecate `controlCondition` number parameter
- `findBestSkill()` and `lookaheadSearch()` still accept a legacy `controlCondition: number` parameter.
- With `conditionEffectsData` on config, this is ignored. Can be removed once all test call sites are updated.
- Also remove `forecastedConditionMultipliers: number[]` parameter.

### 9b. Remove legacy `maxStability` / `buffStacks` aliases
- `CraftingStateData` has deprecated `maxStability` (use `initialMaxStability`) and `buffStacks` (use `buffs`).
- These are kept for backwards compatibility. Can be removed once all consumers are migrated.

### 9c. Remove legacy `createStateFromGame` positional overload
- The function has a deprecated positional-argument overload alongside the options-object form.
- Can be removed once no call sites use the old signature.

### 9d. Hardcoded condition effects fallback table
- `getConditionEffects()` in `gameTypes.ts` has a hardcoded table of condition multipliers.
- Now only used as fallback when real game data is unavailable (tests, offline).
- Keep for now; consider removing if/when all tests use real data fixtures.

---

## 10. Confirm Completion Bonus Buff Reliability (Tiny -- Blocking Question)

**What:** We read completion bonus stacks from `entity.buffs.find(b => b.name === 'Completion Bonus')`. The dev marked this as "unknown" in their response.

**Action:** Ask dev to confirm if the buff name `'Completion Bonus'` is stable across game versions, or if there's a better way to read this value.

---

## Priority Summary

| # | Item | Size | Impact | Blocked By |
|---|------|------|--------|------------|
| 1 | Harmony system simulation | Large | High | Nothing (data available) |
| 2 | Buff per-turn effects | Medium | Medium | Accurate `evaluateScaling` (item 5) |
| 3 | Item/pill integration | Medium | Low | Nothing |
| 4 | Completion/perfection caps | Small | Medium | modAPI release |
| 5 | Game's `evaluateScaling()` | Small | High | modAPI release |
| 6 | Game's `calculateCraftingOvercrit()` | Small | Medium | modAPI release |
| 7 | Game's `canUseAction()` | Small | Medium | modAPI release |
| 8 | Training mode | Small | Low | Nothing |
| 9 | Legacy cleanup | Small | None | Nothing |
| 10 | Confirm completion bonus buff | Tiny | Blocking | Dev response |

**Recommended order:**
1. Items 5-7 when modAPI ships (quick wins, high reliability improvement)
2. Item 1 (harmony) -- biggest user-facing improvement for sublime crafts
3. Item 2 (buff effects) -- unblocked after item 5
4. Items 4, 8, 3 -- lower priority, implement when convenient
5. Item 9 -- cleanup pass after major features land


## Agent implementation results

⛬  All phases complete. Here's the summary of what was implemented in this session:

   Phase 1 - Harmony System (largest feature): Created src/optimizer/harmony.ts (460 lines) with full simulation for all 4 harmony types (Forge Works, Alchemical Arts, Inscribed Patterns, Spiritual Resonance). Integrated into applySkill(), calculateSkillGains(), and scoreState(). Added 32 new tests.

   Phase 2 - Legacy Cleanup: Removed controlCondition/forecastedConditions number params from search functions, removed deprecated maxStability/buffStacks aliases from CraftingStateData, removed positional createStateFromGame overload, removed legacy number overload from calculateSkillGains/applySkill. Updated 75+ call sites across test files.

   Phase 3 - Training Mode: Added trainingMode to OptimizerConfig, reduces stability penalty weight in scoring (3 vs 10) and threshold (10 vs 25) for more aggressive strategies.

   Phase 4 - Buff Per-Turn Effects: Added buff effect processing in applySkill() -- executes per-turn effects[] and action-type-specific blocks (onFusion, onRefine, etc.) using evaluateScaling(). 4 new tests.

   Final state: 233 tests passing, build succeeds, 2 commits made.
