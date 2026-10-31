---
title: Optimizer Design
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.17-d8ae6ce
last_verified: 2026-10-31
source_of_truth: src/optimizer/outcome.ts, src/optimizer/search.ts, src/optimizer/constrainedPlanner.ts, src/optimizer/searchBackend.ts, src/optimizer/skills.ts, src/optimizer/stochastic.ts, src/optimizer/transitionValidation.ts, src/optimizer/nativeAvailability.ts, src/optimizer/state.ts, src/optimizer/index.ts
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - docs/project/TESTING.md
  - scripts/optimizer/benchmark-engines.ts
---

# Optimizer Design

The October 2026 audit found that the 6.8.0 expected-value beam search could exhaust stability below the requested quality, restore an already full bar, and change its objective when evaluating a deeper terminal action. The revised production planner treats requested completion and perfection as joint goals, with explicit stochastic action outcomes and bounded planning.

The installed game inspected during that audit was **0.7.18-97c093b**. Historical runtime parity evidence targets **0.7.17-d8ae6ce**; those test results do not establish exhaustive parity with every 0.7.18 mechanic. Report current validation separately from the 6.8.0 release results.

## Module boundary

`src/optimizer/index.ts` is the public boundary for integration and UI code. The optimizer is pure: no DOM, Redux or live game reads occur inside it.

| Module | Owns |
| --- | --- |
| `outcome.ts` | Band thresholds, actual item tiers, actual auto-finish rule, `resolvePlanningGoals` |
| `constrainedPlanner.ts` | Production `constrainedSearch`, bounded stochastic planning and policy metadata |
| `skills.ts` | Action legality and transition phases, discrete action outcomes and survival checks |
| `transitionValidation.ts` | Conservative payload/schema preflight for certified transitions; unsupported mechanics remain unresolved |
| `nativeAvailability.ts` | Audited native technique schema and pure availability gates, shared by workers and synchronous planning |
| `stochastic.ts` | Bounded decision enumeration with unresolved probability mass retained explicitly |
| `state.ts` | Resources, cooldowns, buffs/internal state, harmony, inventory and step |
| `gameTypes.ts` | Scaling, effect definitions, condition data and band-count formulas |
| `harmony.ts`, `harmonyRegistry.ts` | Harmony subsystem transitions and definitions |
| `search.ts` | Public `findBestSkill` route; retained legacy greedy/lookahead and scoring for reference tests |
| `searchBackend.ts` | Worker serialization and combination of public recommendations |

## The conjunctive outcome model

The game's item tier and the player's requested goal are distinct:

```text
basic   = 1 completion band
perfect = 1 completion band AND 1 perfection band
sublime = 2 completion bands AND 2 perfection bands, if a sublime item exists
```

Band widths grow by 1.3 with flooring at each step. `bandThreshold(100, n)` produces 100, 230, 399, 618 and 902 for the first five bands. `classifyOutcome` reports the actual guaranteed tier and the possible craft-end bonus roll. Requesting eight bands does not redefine perfect or sublime.

## Requested goals

`resolvePlanningGoals(config, targetCompletion, targetPerfection, settings)` is the shared authority for the two requested flat targets. Its result also carries ordinary tier baselines and unchanged `OutcomeBands`.

| Setting | Meaning |
| --- | --- |
| Explicit completion or perfection value 1-8 | Request that many bands on that bar, clipped to its reported actual cap |
| Auto (0) with Push Extra Bands enabled | Request the actual caps on both bars |
| Auto (0) with Push Extra Bands disabled | Request ordinary tier requirements |
| Missing or non-finite cap | Fall back to the ordinary tier requirement; do not invent a larger reachable cap |
| Absent recipe bar or actual zero cap | No work is required on that bar |

The persisted key `completionBandCeiling` remains compatible with saved settings, but its UI label is **Completion Band Goal** and an explicit value is now a requested goal. Values may be below a sublime requirement; the resulting item tier is still classified honestly. Requests exceeding the cap are clipped, not treated as proof that the higher request is achievable.

Goals feed progress, remaining work, termination assessment and every terminal scoring path. Banking the baseline tier does not satisfy a higher request. Retained legacy scorers also use selected goals for remaining work, overshoot, progress margins and terminal shortfall; no scoring constant was tuned.

## Terminal states: there is no manual finish

`willAutoFinish` is the game's terminal predicate. Stability zero resolves the craft; it does not necessarily destroy the item, but prevents further work. A terminal state below the selected goals is a premature ending even if the game awards a basic, perfect or sublime item.

The installed 0.7.18 game also auto-finishes when both actual cap flats are reached. Its predicate has no five-completion-band shortcut; the older shortcut was removed after inspection of `Eho` (`RUNTIME_EVIDENCE.md` section 18).

Meeting selected goals while the game remains live is not yet a completed item. Planning continues with real legal actions toward a resolution that preserves both requested bars; no imaginary Finish action is introduced.

There is no actionable Finish Craft button. The legacy internal finish marker represents resolution, never an automation command. Wait is a real technique with a stability cost. See `RUNTIME_EVIDENCE.md` for extracted rules.

## State and action transitions

State includes resources/caps, step, cooldowns, inventory, buffs with stacks and internal state, condition forecast and harmony. State identity must include every field affecting legality, transitions or future value.

The 0.7.17 phases remain: toxicity/droplets/buff payment; capture success chance; effect masteries; recompute/pay Qi and stability; success-only effects; pre-action-name buff ticks; harmony; decay/cap cleanup. Failed actions still pay and retain mastery effects. Cost-reduction and penalty channels remain independent. Returning Cycle drains reported payment before stabilization releases charges. Planning and survival checks must share these rules.

Native auto-use is a pre-technique transition, not permission to double-consume an item. Unavailable or unmodelled information must remain explicit rather than silently certifying safety.

## Production search

`findBestSkill` routes to `constrainedSearch`. It builds a sparse, bounded AND/OR graph: player choices are decision nodes; each action's possible outcomes are chance branches. Bellman backups evaluate contingent continuations rather than scoring one averaged state as if it occurred.

All policies use one transitive lexicographic ordering:

1. Minimize the bound on premature endings below the selected goals.
2. Maximize the lower bound on reaching **both** selected goals.
3. Maximize normalized frontier progress, with Goal Priority Bias applied only to its secondary average-progress term.
4. Prefer fewer expected turns, then greater resource reserve.

For fully resolved policies with exact probabilities, goal and premature-ending probabilities are complements, so the first two criteria agree. With unresolved outcomes or hidden PRD probabilities, the fields are conservative bounds. The ordering never switches depending on which two policies are compared. An unresolved continuation with no known ending risk can outrank a partly successful gamble; this is not proof that the continuation is feasible or globally optimal. The scoped inert-recovery guard prevents proven resource-wasting restore loops from exploiting that preference.

This is not an unbounded global optimality claim. Time, node and horizon budgets limit planning. An unexpanded future or truncated action distribution contributes unresolved probability, not free success. Exact per-call state caching does not reuse stale scored entries across changed goals or runtime context.

Worker partitions filter starting actions before validation, availability and transition expansion, so another partition's actions cannot consume their root budget. Deeper continuations still use the full skill roster. Root expansion does not populate the continuation cache with a restricted or partial action list. `rootEvaluation` records whether root enumeration finished and the keys of completed eligible action evaluations (including unresolved or pruned actions); replay output retains that diagnostic evidence. If any partition exhausts its root budget, the merged result stays paused with no actionable candidate, alternatives or final-state preview. Completed partial evaluations do not establish a ranking over unevaluated roots. This coverage flag is separate from continuation probability uncertainty, and partitioned searches with different total effort need not produce identical deeper policies.

Merged coverage keys and blocked diagnostics have a canonical order independent of worker completion timing. Diagnostics are deduplicated and sorted by the full reason/name/details tuple, preserving distinct explanations. This ordering affects presentation and replay output only, not policy ranking or the incomplete-coverage pause.

### Probability handling

Technique success, critical rolls and supported chance-conditioned effects are action branches. They are not converted into fractional progress, restoration or persistent buff state before terminal rules are applied. Bounded enumeration retains unresolved mass explicitly, without renormalizing the explored subset into certainty.

The visible three-condition forecast is used where known. Future queue entries retain their generation-time harmony and dependencies, but branch only when consumed; observed entries are substituted into dependent rolls. This avoids expanding invisible condition combinations prematurely without changing their probabilities. All resulting condition probabilities are retained.

The installed 0.7.18 success model uses a persistent failure streak. When a recorded success establishes the current streak, the planner uses the actual calibrated PRD coefficient. Unknown carry-over streaks use robust outcome bounds, not guessed probabilities. If their enumeration omits any outcomes, those outcomes contribute a zero goal lower bound and unit risk/unknown bounds; nominal enumeration weights cannot establish a positive probability guarantee. The `probabilityUncertain` flag propagates through every selected continuation, including deterministic ancestors and worker transport. Exact success percentages are published only when both omitted/horizon uncertainty and hidden-probability uncertainty are absent. Critical chains use the live overcrit stat. The native RNG helper is never invoked to estimate an average.

### Stability and resource budgeting

A plan pays simulated action costs, including state-dependent modifiers and restoration effects, along each branch. A restore is useful when it enables a preferable continuation or has another real modeled effect; adding stability to an already full bar provides no recovery value.

Resource estimates can order unfinished work, but averages do not certify that a complete rotation fits. Reaching a search horizon does not establish feasibility of the remaining quality. Uncertainty must remain visible in the result and execution boundary.

### Result contract

Actual item tier, selected-goal achievement and planning uncertainty are separate. `recommendation.planning` carries `goalProbabilityLowerBound`, `prematureEndProbability`, `frontierProgress`, `resourceReserve` and `expectedSteps`. Worker merging uses those same objective fields rather than reordering safety decisions by a legacy raw score.

A high heuristic score or baseline tier is not a verified full-goal plan. A displayed rotation is one conditional projection, not a promise that all random outcomes follow it. Integration revalidates state and action safety before dispatch.

## Retained legacy search and Rust engine

`greedySearch` and `lookaheadSearch` remain exported for reference and regression tests. They use expected-value transitions, beam search, iterative deepening and heuristic scoring. Their survival floors and penalties do not provide a general safety proof. The old cross-step cache, probability pruning and MCTS near-tie prior belong to this legacy path, not production planning.

The Rust/WASM engine and historical differential corpus remain evidence for the previously modeled transition surface. They do not establish parity for the new discrete stochastic planner. The legacy Experimental setting does not make Rust the production planning authority. Do not claim new parity without appropriate checks. Historical measurements remain in `OPTIMIZER_ENGINE_FINDINGS.md` and `ENGINE_PERFORMANCE.md`.

## Determinism and validation

Use fixed node/horizon budgets and deterministic fixtures to test decisions. Wall-clock truncation is machine-dependent; larger search settings cannot repair incorrect transitions or objectives. Report resolved and unresolved coverage separately. Not every requested goal is achievable.

Focused coverage includes `planningGoals.test.ts`, `outcome.test.ts`, `auditSearch.test.ts`, stochastic transition tests and execution tests. Run the full TypeScript suite and production build before shipping. Label Rust/replay benchmarks historical or reference until validated under the new objective. Never change a constant merely to reproduce an old pick.

## PR #4 review validation

See [the review report](PR4_REVIEW_VALIDATION.md) for the initial 26 Cubic findings and two Revera findings, subsequent review rounds, scoped runtime evidence, regression coverage and current validation results. Native pre-use branches supply the cost and tooltip-preview input states. Stability gains exclude payment and turn decay; expected progress retains triggered buffs and harmony from the action transitions. Display values are estimates, not policy certificates. Unknown immediate transitions remain undispatchable; budget exhaustion and unsupported outcomes have explicit pause diagnostics, including across worker merges.

Goal Priority Bias weights only the secondary average-progress term, after the joint minimum progress and the failure/goal-probability checks. A conservative dominance check rejects simple full-bar recovery only when every immediate outcome proves no modeled benefit; dynamic expressions, useful cooldown waits, buffs, native item hooks and condition/harmony changes prevent that proof.

The independent artifact review supplied a sublime full-bar recovery counterexample. The recovery proof now accepts eligible sublime and recognized-harmony states when their complete harmony/subsystem state remains unchanged across every outcome. A useful change in heat, charges, patterns, attunement or release effects prevents pruning. Unknown or unidentified harmony implementations remain excluded. See the supplied fixture and `sublimeRecovery.test.ts`, linked in [the validation report](PR4_REVIEW_VALIDATION.md#independent-artifact-review-sublime-recovery-loop).

### Certification and presentation boundaries

A technique must pass the original state's availability predicate before its native item hook is projected. Items cannot unlock a disabled button needed to trigger their own use. The post-item transition is still checked; an action unavailable on a projected branch remains unresolved rather than being silently credited as executable.

`applySkillOutcomes` preflights technique/mastery effects, active/resolved and nested buff definitions, trigger kinds, condition kinds/modes, scaling forms and supported expression syntax. Unknown payloads return no certified outcomes, unresolved probability one, and an explanatory reason. Native item plans use the same preflight. This is conservative: an unsupported section can pause a plan even if that section would be inactive this turn. It is not an exhaustive runtime parity proof. Permissive `applySkill`/EV helpers remain estimates; their skipped unknown data cannot be republished as an outcome certificate. Optional null metadata used by older replay transport retains its absent/default meaning.

`OutcomeProjection` again describes the actual item tier and its required bands. Its separate optional `requestedGoals` section carries selected flat targets, band counts, attainment, binding bar and whether a met goal still needs craft resolution. The panel displays selected goals separately, retaining eight-band target visibility without claiming those bands are required for Perfect/Sublime. The automation-facing `targetsMet` still requires actual resolution.

The follow-up certification boundary rejects active buffs that remain without a definition after roster resolution. Historical snapshots missing those definitions can now pause instead of returning an uncertifiable recommendation. Expression certification recognizes numeric/boolean formula syntax and supported numeric calls; object literals, bare function values, update operators and unsupported syntax are not certified through the legacy zero fallback.

Raw `nativeTechnique` fields are part of recommendation identity. Workers locally enforce the inspected first-action, strict minimum-stability, maximum-stack, exact-condition, resource and buff gates; they do not rely on a live callback. Unknown native fields or malformed gates remain unresolved, and directly copied native payment fields must agree with the projected transition. This schema is scoped to the inspected runtime; new fields require inspection. Native item preflight runs after selection: a provably skipped unsupported item does not block a technique, while an unknown selection or an unsupported selected item still prevents certification.

Exact planner keys omit `history` and `_cacheKey` only when owned by the root CraftingState. Nested fields with those names, including buff internal-state counters, remain part of both action-cache and policy-cache identity. A probabilistic state write must not merge different continuation payoffs into a guaranteed route.

Sublime certification requires a known selected harmony and an established harmony envelope. After step zero, the active stateful subsystem must also be present; Formless has no subsystem. The live adapter does not pass presentation defaults marked as a missing observation into search. Forge data reconstructed from observed heat/buffs remains valid, but missing data is not exempted merely because a harmony implementation has permissive defaults. These checks preserve uncertainty; they do not claim exhaustive validation of every subsystem field.

The production `expectedFinalState` preview is populated for fully resolved deterministic routes. Every traversed policy action must have one probability-one child, no missing mass and no hidden probability uncertainty, and the resulting state must be terminal. A most-likely rotation through a stochastic policy is not used as an expected final state. The preview is presentation-only and does not affect ranking or execution certification; the winning worker partition supplies it.

PRD bookkeeping distinguishes an actual success trial from a guaranteed action. When the stated chance is already one, the native game makes no trial and preserves prior known or hidden failure streaks. A real PRD trial still resets on success even when its streak-adjusted probability reaches one. Preserving this distinction prevents a temporarily guaranteed action from making a later hidden streak appear observed.

Native numeric mechanics fields must be finite numbers when present: success chance, stability/pool (Qi, native `poolCost`)/toxicity/droplet costs, static/current cooldown and minimum stability. Explicit null is rejected because JSON converts nonfinite numbers to null; omission/undefined remains distinct. Buff gate amounts and maximum stacks also require finite values. This preserves the strict certificate boundary through extraction, replay and worker transport without changing valid numeric normalization or permissive nonnumeric metadata handling.

The native mechanics flags `firstActionOnly`, `disableAtMaxStacks`, `noQiCost` and `noMaxStabilityLoss` require actual booleans when present. Truthy numbers/strings and explicit null are not accepted as substitutes. This prevents the native truthiness rules and extraction's literal-true checks from disagreeing inside a certified transition; omitted/undefined flags and both boolean values remain supported.

### Celadon Cycle

The four `stackGained.<Ember>` events used by Flickering Celadon Flame are modeled at the stack mutation. Positive additions follow native emission rules: an existing non-stacking ember ignores a repeat, while a real addition publishes its requested floored stack count. A trigger reads fresh, case-preserving native ember aliases and current stats, then keeps that captured condition scope for its whole effect block. Consequently, consuming the first ember does not incorrectly cancel consumption of the remaining three.

The payout uses the live effect data (currently 10% maximum Qi and 10 stability), boost stats, caps and native per-event/per-owner re-entry guard. Qi-restored hooks receive the actual capped delta, including zero; downstream hooks see the current payout state. Negative buff `createBuff` effects consume stacks even from non-stacking embers. Normal maximum-stability decay and stability overdraft remain intact. Failed techniques still execute their action-type buff effects.

Certification accepts only the verified Celadon stack-gain block shape: the all-four-embers condition, maximum-Qi/literal-stability payout, and one consumption of each ember. Other stack events, stack-loss listeners and unverified stack-trigger programs remain unresolved. This is scoped support for the native Celadon mechanic, not a blanket relaxation of trigger validation. No planner score or risk ordering was changed.

### Resource boundaries and event order

Qi and stability do not share a clamping rule. Each pool operation applies its native floor or cap before its handler runs; a mastery cannot carry excess restored Qi into payment. Resource handlers receive actual deltas, including zero and native signed edge cases. Stability debt survives payment and restoration until final action cleanup. Concrete changes execute in native order, while retained EV stability calculations remain weighted previews.

Masteries capture pool/maxpool/Qi-boost variables for their effect list, then payment obtains fresh stats. Buff effects and resource events use current resource state. Items do not perform a technique turn's final Qi flooring. The native-derived oracle and phase tests cover these boundaries without changing policy comparison or search budgets.

Progress gains still have a reconstruction boundary. Certification rejects affected live progress checks, resource callbacks requiring an unmodeled intermediate bar value, cross-mastery captured-progress observations and unsupported bar-trigger subscription changes within a block. Such actions stay unresolved and cannot supply a probability-one route or final-state preview. Captured expressions and ordinary stat-buff frames, including Strive for Perfection and False Fusion, remain eligible. Known Celadon blocks remain eligible; unrelated unsupported orderings are not silently approximated into certificates.
