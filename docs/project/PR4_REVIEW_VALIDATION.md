---
title: PR 4 Review Validation
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.18-97c093b
last_verified: 2026-10-31
source_of_truth: src/__tests__/prReviewRegressions.test.ts, src/__tests__/nativeAutoUsePlan.test.ts, docs/project/RUNTIME_EVIDENCE.md
review_cycle_days: 90
related_files:
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/RUNTIME_EVIDENCE.md
---

# PR #4 review follow-up

The first round covered 26 Cubic findings and two Revera findings. Five native-selector claims in that round were contradicted by the installed **0.7.18-97c093b** runtime; the other findings led to fixes, documentation corrections, or explicit pause diagnostics. A second round covered six further Cubic findings and three Revera findings, documented below. Review comment IDs below identify the original threads on [PR #4](https://github.com/lemon07r/AFNM-CraftBuddy/pull/4).

## Safety policy retained

Requested completion and perfection remain conjunctive goals. Discrete outcomes and unresolved probability mass remain separate. Unknown immediate transitions are excluded from executable recommendations; the executor's independent veto is unchanged. Exhausting the root budget or filtering unsupported transitions now reports a visible reason, propagated through worker merges. The comparator and its conservative preference against premature endings are unchanged.

Display previews use the same native pre-use branches as the technique transition. Costs and direct stability recovery are shown separately; expected progress still includes triggered buffs and harmony. Weighted preview values are estimates, not policy certificates. These changes do not assert global optimality, feasibility of every goal, or complete runtime parity.

## Finding dispositions

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4411971293 | Persisted experimental engine | Migrated to the compatibility value `legacy` on load/save, persisted on load without resetting budgets; MCTS flags disabled. The claimed live MCTS route was already absent: `findBestSkill` always calls `constrainedSearch`. Settings regression covers both migration paths. |
| 4411971300 | Missing satisfied-effects check | Disagree. Native `hEl(fEl(...))` checks active non-stacking createBuff effects, exactly as the existing selector does. Tests cover skipping these and allowing other effects. Broader resource/stack-cap heuristics would diverge from native consumption. |
| 4411971308 | Native rule format | Disagree. Runtime `eR/iho/rho` use `condition/check/value`, not `kind/comparison`. Tests cover legacy, single-row and grouped AND/OR forms. Unsupported conditions stay unresolved. |
| 4411971314 | Accept every pill | Disagree. Native `scu` explicitly requires `pillKind === 'crafting'`. Added extraction coverage rejecting combat pills. |
| 4411971351 | Registry is a keyed object | Disagree. ModAPI exports `recipeConditionEffects: eu`, where `eu` is an array. Regression preserves array order; guessing object enumeration order could change indexed rule meanings. |
| 4411971356 | WASM excluded from development bundles | Gated both IgnorePlugins to production. Developer builds can include the generated reference artifact; production still excludes it and never switches planner. |
| 4411971369 | Old runtime reproduction coordinates | Marked 0.7.10 coordinates historical; added current fingerprint, bundle hash, commands and scoped evidence in Runtime Evidence §19. Fixed nested ASAR lookup separators on Windows. |
| 4411971379 | Presets ignore engine argument | Removed the obsolete parameter/call sites and dead engine-switch handler. Migrated settings use the sole production planner while preserving custom budgets. |
| 4411971389 | Missing current validation report | This report separates current checks from historical 6.8.0 release results. Mechanics Parity links here. |
| 4411971398 | Zero caps inconsistent | Explicit finite zero caps now stay zero in TS/Rust finish bands as in planning goals. Non-finite/absent caps retain fallback behavior. Regression checks goal/terminal agreement. |
| 4411971402 | Nested companion override missing | Signature uses the same top-level then nested `game.gameEvent` fallback as recommendation construction. Regression changes nested companion without advancing the turn. |
| 4411971412 | Stale output in ZIP | Enabled webpack output cleaning for main and worker compilations. Package verification seeds stale output and checks it is removed. |
| 4411971413 | Stability gain includes cost | Direct stability gains now use the gain-preview contract; payment and turn decay are separate. Tests cover spending-only actions and restoration. |
| 4411971420 | Preview ignores native pre-use | Cost and gain previews run on projected pre-technique states; stochastic pre-use previews retain branch weights. Tests cover deterministic and chance-based cost reduction. |
| 4411971427 | All unresolved roots disappear | Added explicit unresolved/budget pause reasons instead of weakening the execution gate. Tests cover empty safe candidate sets, exhausted root budgets, worker merges and executor refusal. |
| 4411971434 | Resistance not aggregated | Disagree. `getCraftingActionVariables` already folds buff stats onto the extracted raw base. Tests cover one-fold resistance and changing resistance between items. Passing an aggregate base would double-count buffs. Runtime condition modifiers do not modify resistance. |
| 4411971439 | Zero pill limit becomes one | Preserved zero through extraction, selector variables, availability and TS/Rust item payment. Added native-plan regression and cross-engine zero-budget corpus case. |
| 4411971446 | Stale five-band finish guidance | Updated the mechanics summary; also removed the leftover shortcut from the Rust reference predicate and added zero-cap/five-band tests. |
| 4411971448 | Signature encoding collisions | Canonical encoding now escapes keys/strings and tags primitive types. Adversarial regressions cover delimiter collisions, types and key-order stability. |
| 4411971451 | Bun lockfile stale | Regenerated with Bun; declared `@types/react` dependency and resolved version are synchronized. Frozen install checked. |
| 4411971458 | Old publishing command | Explicitly labeled the command and Workshop description as historical 6.8.0 release material. This PR has not been published to Workshop. |
| 4411971463 | Combined signature mutations | Split assertions and restore the cost penalty before mutating droplets, so either missing dependency fails independently. |
| 4411971469 | Vague test-selection entry | Listed concrete stochastic, planner, comparator, native-use and review regression suites. |
| 4411971472 | Unconditional audit logging | Removed all three diagnostic console calls. Assertions remain. |
| 4411971478 | Harness version stale | Harness version now matches `6.9.0`. |
| 4411971487 | Authoritative source list incomplete | Added `constrainedPlanner.ts` and `searchBackend.ts` to Optimizer Design metadata. |

## Revera follow-up

Revera completed with a neutral/partial result and two additional findings. Its stated gaps were installed-runtime verification and executable/UI validation; the scoped runtime checks and executable results here address those gaps without claiming a live visual test.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4412064184 | Inert recovery hides risk beyond the horizon | Added a conservative dominance check in shared node expansion, before recursive/root ranking. For full-bar recovery in a time-independent context, every resolved branch must leave the modeled state unchanged except for a turn and non-improving Qi/stability. Native item hooks, active buffs, expressions/callbacks, condition dependencies and beneficial cooldown changes prevent pruning. The initial proof also excluded sublime/harmony states; the independent-review follow-up below replaces that blanket exclusion with complete harmony-state comparison. This is a sufficient proof for simple inert recovery, not a claim to detect all dominated actions. Tests cover horizons 1/4/96, useful cooldown waits/buffs, and step-dependent effects. The only productive gamble remains marked risky; pruning waste does not certify it as safe. |
| 4412064200 | Goal Priority Bias ignored | Applied the clamped setting only to the secondary average-progress term. The joint minimum progress term and the safety/goal-probability ordering remain ahead of preference. Production-path tests cover -100/0/+100 and ensure a biased unsafe action still loses to a safe continuation. |

The proposed PR version is now **6.9.0** in package metadata, README and the browser harness; this does not rename or replace the already-installed local UAT artifact.

## First-round validation (dbfb996)

Results on the PR branch at commit `dbfb996`, 2026-10-29:

- Full Jest run: **49 suites / 1,088 tests passed** (one complete green run after both Revera fixes). The new review suite contains 31 cases, including native PRD inert-recovery coverage. Earlier red runs reproduced the valid findings and caught a triggered-progress preview regression, which was fixed before this final run.
- Strict TypeScript check passed as part of the final production build.
- Rust: **94 passed, 3 profiling tests intentionally ignored**. Regenerated TS/Rust corpus: **178 scenarios / 1,555 cases**, adding a zero-pill-budget case without changing the preceding cases. Both differential checks passed.
- Production mod/worker and UI harness built successfully at **6.9.0**. Webpack reports its three existing bundle-size warnings. A VM smoke test of the packaged worker chose guaranteed completion over a fatal gamble.
- Seeded stale files in main and worker output were removed by webpack; the ZIP contained no stale probe and worker cleaning preserved its tracked ignore file. Both development configs omit IgnorePlugin; both production configs retain it. A developer WASM build was not claimed.
- Bun frozen installation passed against the regenerated lockfile. Documentation inventory, link, freshness and authority checks passed.
- Seven fixed-node-budget production replays were compared with the reviewed commit `c132693`: recommendations and planning metadata were identical. New targeted regressions establish the intended changes for inert recovery and nonzero priority bias; these replay samples do not prove global quality or optimality.
- Additional legacy-only benchmark (`lookaheadSearch`, `legacy_fast`): **12 contracts passed, 3 failed, 1 fixture has no contract**, identically on the reviewed commit and this revision. Failures are the old exact-pick contracts for `forge-heat-runway-step-2`, `forge-heat-runway-step-3`, and `user-report-overcraft-endgame`. This historical reference benchmark is not production-planner certification; no constant or contract was changed to hide those failures.

Runtime evidence is scoped to the selector, rule schema, resistance fold, item budget, and termination behavior described in [Runtime Evidence §19](RUNTIME_EVIDENCE.md#19-pr-4-native-selector-verification-0718). Live visual/gameplay validation was not repeated. The installed UAT build has not been replaced by this review follow-up.

## Second review round (reviewed head dbfb996)

Eight findings were addressed; the harmony-index suggestion was rejected using fresh installed-runtime evidence. Probability certificates now account for omitted outcomes even when PRD probabilities are hidden, and hidden probability uncertainty propagates through deterministic ancestors and worker transport. The immediate-outcome execution veto and the transitive policy comparator are unchanged. The package remains **6.9.0**.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4412593381 | Recovery documentation too broad | Mechanics Parity now distinguishes provably inert full-bar recovery from useful cooldown waits or buff-granting recovery. |
| 4412593395 | Duplicate worker diagnostics | Merge deduplicates the tuple of reason, skill name and details, preserving distinct explanations. Regression combines repeated empty partitions plus distinct details/reasons. |
| 4412593401 | Zero-budget comment stale | Corrected the comment: an absent pill budget defaults to one; explicit zero remains valid. No behavior change. |
| 4412593408 | Review scope undercounted | Optimizer Design names the initial 26 Cubic and two Revera findings and links subsequent rounds, instead of treating 26 as the complete scope. |
| 4412593418 | Contradictory ordering documentation | Aligned Optimizer Design and the skill with the implementation's single lexicographic order: premature-ending bound, goal lower bound, frontier progress, expected turns, resource reserve. Exact fully resolved probabilities are complementary; unresolved/hidden-probability policies retain conservative bounds. The comparator itself is unchanged. |
| 4412593430 | Inert diagnostics leak across partitions | Inert root diagnostics are recorded only when the skill belongs to rootSkillKeys (or no partition filter exists). Regression checks owning and non-owning partitions. |
| 4412704622 | Native harmony rule list has seven entries | Disagree. The freshly checked installed 0.7.18 bundle has a seven-entry Wmo rule whitelist even though gameplay has nine harmonies. rho compiles an absent index to expression 0, including for !=. Expanding to HARMONY_TYPES would predict consumption the game skips. Named/documented the native whitelist and added invalid-index and valid equality/inequality tests across all nine playable harmonies. Runtime Evidence §19 records the exact distinction. |
| 4412704642 | Truncated hidden-PRD branch can certify success | Fixed conservatively: any omitted hidden-probability outcome contributes zero to the goal lower bound and unit risk/unknown bounds. We do not multiply by nominal enumeration mass, because those weights are not calibrated probabilities when the prior PRD streak is hidden. A deterministic setup plus a 128-outcome failure subtree reproduces the false certificate; a larger enumeration exposes a missed failing outcome. The bounded planner now refuses certification and still blocks dispatch of the incomplete follow-up. |
| 4412704664 | Descendant hidden PRD displayed as exact percentage | Added policy-level probabilityUncertain metadata, OR-ed through every backup and preserved by JSON/worker merge. Success percentages require both complete coverage and no hidden probability anywhere in the selected continuation. Regression distinguishes a hidden-streak descendant from a known calibrated streak. |

### Second-round validation

Final results for the second round, 2026-10-29:

- **50 Jest suites / 1,098 tests passed** in one complete run after the fixes. The 10 new review cases cover omitted hidden-PRD outcomes, descendant uncertainty, exact known-streak probabilities, worker diagnostics and native harmony rule indices.
- Strict TypeScript and production build passed at **6.9.0**, with the three existing webpack size warnings. The compiled worker passed the guaranteed-vs-fatal smoke and both new probability-certificate checks: no false guarantee from omitted hidden-PRD outcomes and no exact percentage from a hidden-streak descendant.
- Seven fixed-budget production replay recommendations remained unchanged versus reviewed head `dbfb996`. The new hostile regressions specifically exercise the corrected probability paths absent from those replay samples.
- Fresh installed-runtime verification confirmed **0.7.18-97c093b** and the same Game.js hash recorded in Runtime Evidence §19. Native Wmo remains seven entries; the gameplay registry has nine. Valid equality/inequality cases and absent indices are covered separately.
- Documentation inventory, link, freshness and authority checks passed. Rust source and its corpus were unchanged in this round; the first-round Rust and historical benchmark results above remain separately scoped evidence.

The immediate-outcome execution gate was retained. No live gameplay/visual validation or installed-mod replacement was performed in this round.

## Third review round (reviewed head 82f64b1)

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4413441610 | Valid harmony indices 1–5 missing from the regression matrix | Expanded the native harmony-rule matrix from boundary indices 0/6 to every valid index 0–6, across all nine playable harmonies and both equality/inequality operators (126 combinations). Retained the separate invalid-index cases. This changes test coverage only; production behavior and version 6.9.0 are unchanged. |

Validation on 2026-10-29: `prReviewRound2.test.ts` passed all 10 tests, including the expanded 126-combination matrix and retained invalid-index cases. Documentation inventory, link, freshness and authority checks passed. Production files are unchanged from the second-round full-suite/build validation above.

## Independent artifact review: sublime recovery loop

The user supplied an independently executed artifact comparison and a machine-readable fixture for a remaining full-bar recovery loop. The archived **6.9.0 / 5158eec** package was rerun with the reviewer's inspected, unmodified extraction and fixture probe scripts. It reproduced **Restore ×5 → Gamble**, consuming 100 Qi without changing stability, progress, buffs or cooldowns. The original 6.8.0 also does so; this is a residual defect, not evidence of a new regression.

The supplied [fixture](../../src/__tests__/fixtures/full-stability-sublime.json) is preserved byte-for-byte (SHA-256 `ab830c5c23994dd0a477cc1b2ed67aafa7bb8750db763db9273583100eff3d36`). It uses 200 Qi, full 60 stability, 100/100 progress, 3,000/3,000 caps, 8/8 requested bands and depth 6. Only the restore and a terminal 50/50 gamble are available. The original probe scripts stay outside the production repository; [the regression suite](../../src/__tests__/sublimeRecovery.test.ts) loads the supplied fixture with matching skill defaults.

### Correction and boundaries

The no-benefit proof no longer rejects a state merely because the craft is sublime or has a known harmony type. It compares the complete harmony value and subsystem state on every evaluated outcome. The known pure harmony processors consume retained subsystem state and action context, not absolute turn/history. Cooling, charges, pattern progress, attunement and charge-release effects keep recovery available whenever they change that state. Unknown harmony types, unidentified harmony data, dynamic dependencies, active buffs, native item hooks and condition dependencies remain outside the proof. Cooldown progress and other modeled changes are still compared. The ranking and execution safety gates are unchanged.

This extends a sufficient no-benefit proof; it does not claim to eliminate every wasted recovery policy. The corrected fixture selects **Gamble immediately at 200 Qi**, explicitly marked risky with 0.5 goal probability. No guaranteed alternative exists in that fixture. Tests also preserve useful forge cooling, Returning Cycle release, evolving harmony states, cooldown/forecast waits, active buff ticks and turn-dependent effects.

### Independent-review follow-up validation

Validated on 2026-10-29:

- The reviewer's inspected, unmodified extractor and fixture runner reproduced five restores before the gamble on the archived 5158eec package. Against the rebuilt package, the same scripts select the gamble immediately. The original 6.8.0 control still performs the five restores.
- The actual worker strings extracted from both package main bundles independently reproduce the before/after sequence. The corrected worker starts the gamble with **200 Qi**, sets probabilistic-survival risk, and reports goal probability 0.5 / premature-ending probability 0.5. No gamble outcome was sampled to choose the result.
- **51 Jest suites / 1,118 tests passed** in one complete run. Twenty new cases cover depths 1/6/96, repeated replanning, the sublime flag control, worker partition merging, unchanged Forge/Formless/Decree states, evolving states across the other harmonies, useful cooling and Cycle release, cooldown/forecast waits, buffs, dynamic expressions and unknown harmony implementations.
- Strict TypeScript and the production build passed at **6.9.0**, with the three existing webpack size warnings. The packaged-worker guaranteed-finish and hidden-PRD uncertainty smoke tests also passed.
- Seven fixed-budget production replay recommendations and policy metadata stayed identical versus the preceding source. The supplied residual fixture specifically exercises the corrected path.
- Documentation inventory, link, freshness and authority checks passed. Transition arithmetic, Rust source and the differential corpus were unchanged; prior scoped Rust results above were not rerun or relabeled as a fresh run.

This is executable synthetic/source/artifact validation, not new live-game acceptance. The previously installed mod and preserved comparison archives were not modified.

## Fourth review follow-up (fixes shipped in 772c680)

Three valid findings were fixed, including a carried-over pre-auto-use gate finding. The proposed step-zero-reagent exception was rejected with a regression showing the actual availability change and why it cannot benefit an inert wait.

Those findings were raised against cf73ce2; the implementation and validation below belong to 772c680. The older revision is the comparison baseline.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4413767132 | Preserve pre-auto-use technique availability | Fixed. Candidate admission now uses canApplySkill against the pre-hook state (the same predicate used by getAvailableSkills), before lazily projecting native items. A 5-Qi state cannot trigger a 10-Qi technique through an auto-use Qi-restoring pill. Enabled alternatives still receive the projected item effects; unavailable post-item branches remain unresolved. Runtime Evidence §19 records the enabled-control/callback order. |
| 4415878062 | Step-zero reagent expiry should disable inert-recovery pruning | Disagree with this example and remedy. A reagent in the planner's ordinary action roster is optional. Advancing the turn only removes that choice; skipping the inert restore keeps at least those options and more Qi. The regression confirms the reagent is available before the restore and unavailable afterward, while the no-benefit restore is correctly pruned. Adding a blanket exclusion would permit wasted restores again. Forced native item plans are already excluded from this proof, and cooldowns, forecast conditions and genuine turn-dependent expressions remain protected. |
| 4416024351 | Unknown effects can receive complete transition certificates | Fixed with conservative certificate preflight for known effect/mastery/trigger kinds, condition modes, scaling shapes and supported expression syntax, including nested and active/resolved buff definitions. Unsupported payloads return unresolved mass one plus a reason, and cannot pass root/dispatch certification. Unknown native item effects use the same boundary. Legacy EV estimates remain permissive. Nullable optional metadata from legacy replay transport remains supported. |
| 4416024360 | Selected goals overwrite tier requirements and binding bar | Fixed. Tier requiredBands and bindingBar now come from TIER_REQUIREMENTS/classifyOutcome. A separate requestedGoals projection and UI section retain selected flat/band targets, attainment, binding and live-resolution status. Perfect can be secured while an eight-band goal is still pending; met goals have no binding bar even while the craft remains active. |

### Fourth-follow-up validation

- Full Jest run: **52 suites / 1,143 tests passed**. The two affected presentation/certification suites were also rerun after the final compatibility/presentation adjustments (**46 tests passed**).
- Strict TypeScript, production build and UI harness build passed at **6.9.0**. The three existing webpack size warnings remain. The new harness scenes are `?state=outcome-goals` and `?state=outcome-goals-met`.
- Compiled-worker checks cover unsupported-effect refusal, pre-hook affordability, separate eight-band goal projection, preserved sublime inert-recovery behavior, guaranteed finish versus gamble, and hidden-PRD uncertainty handling.
- Seven fixed-budget production replay recommendations and planning fields remain unchanged versus cf73ce2. Initial probing exposed optional null metadata in two legacy skills; compatibility was corrected and regressed before the final results.
- Documentation inventory/link/freshness/authority checks passed. Existing Rust transition arithmetic and differential data were not modified.
- Visual inspection was attempted, but the app browser timed out reaching the localhost harness. No visual or live-game acceptance claim is made; the temporary server was stopped. The installed mod remains unchanged.

## Fifth review follow-up (findings on 772c680)

Four implementation findings and one documentation clarification were addressed. The terminal-label finding was rejected with a full planner-to-summary regression. Ranking, risk ordering, probability accounting and dispatch snapshot verification were preserved.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4416939157 | Native availability payload | Fixed. This was a real worker gap: the inspected 0.7.18 dcu checks firstActionOnly, strict minStability and disableAtMaxStacks, and the game contains techniques using all three. Workers now enforce these gates plus exact native condition/resource/buff requirements without relying on the live callback. Raw native fields are schema-checked before certification; unknown fields and malformed gates remain unresolved. Directly copied payment fields must match the projected transition, and native payload changes invalidate recommendation context. Simulated cooldowns remain authoritative. The local gate matched the extracted native function across 486 cases. |
| 4416939168 | Terminal goals label | Disagree for the reviewed head. buildOutcomeSummary already chooses “Selected goals not reached” when goals are unmet and projection.willAutoFinish is true; the panel renders that status directly. Added an end-to-end source regression through findBestSkill with zero stability and unmet goals, verifying no recommendation and the stopped label. No production UI change was needed. |
| 4416939182 | Unsupported expression values | Fixed. Certification now parses a restricted numeric/boolean formula grammar before compilation. Object literals, bare function values, comma expressions, null, empty numeric calls, nonfinite literals and update operators are rejected. Supported arithmetic, comparisons, logical operators, parentheses and numeric calls remain accepted. The permissive EV evaluator is unchanged; rejected formulas become unresolved transitions instead of certificates based on its zero fallback. |
| 4416939188 | Unsupported unselected native items | Fixed. Native selection now precedes payload preflight. An unsupported item proven skipped by inventory, rule, pill budget, max count or toxicity no longer blocks an otherwise enabled technique. Unknown selection and unsupported selected items remain unresolved. Selector structural guards preserve conservative handling of malformed effect arrays. Regression cases cover all five skip reasons and the unresolved controls. |
| 4416939200 | Unresolved active buff definitions | Fixed. After roster-based buff resolution, any remaining active buff without a definition returns an explicit unresolved reason. A buff successfully resolved from the roster remains supported. This exposed one historical replay that saved only names/stacks for nine active buffs; its fixture is preserved, and the regression now requires a pause naming Spirit Cauldron Construct rather than an uncertifiable pick. Seven other fixed-budget replay recommendations and policy fields stayed unchanged. |
| 4416939210 | Validation revision label | Clarified. The fourth-follow-up heading now says “fixes shipped in 772c680”, and the text explicitly identifies cf73ce2 as the revision against which the findings were raised and the comparison baseline. The 52-suite validation is attributed to the implementation in 772c680. |

### Fifth-follow-up validation

Full Jest: **53 suites / 1,182 tests passed**. Strict TypeScript and production build passed at 6.9.0 (three existing webpack size warnings). Rust: **94 passed, 3 profiling tests ignored**; the regenerated 178-scenario / 1,555-transition corpus is unchanged. Compiled-worker checks cover the new native gates, missing buffs, unsupported expressions and unselected items, plus previous guaranteed-finish, hidden-PRD, eight-band and inert-recovery checks. The installed-runtime gate comparison passed **486 cases**. Seven fixed-budget replay recommendations and planning fields remained identical to 772c680; the separate incomplete historical replay now correctly pauses. Documentation checks passed. No new live-game or visual acceptance claim is made.

## Sixth review follow-up (findings on 7700a58)

All three findings were reproduced and fixed. Ranking and probability ordering remain unchanged; the fixes preserve branch identity and refuse certificates when required mechanics are missing.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4422548176 | Malformed native createBuff payloads | Fixed. The selector structural guard now requires createBuff.buff to be an object with a nonempty string name before it evaluates stack checks or self-reference rules. The registry scan also checks the name type before normalization, including malformed unselected entries examined while matching another slot. Invalid selected payloads remain unresolved rather than throwing. Tests cover absent/null/empty buff payloads, numeric/empty names, and the registry-scan path. |
| 4422591221 | Nested fields lost from exact state identity | Fixed. The JSON replacer now strips history and _cacheKey only when their owner is the root CraftingState object. Nested fields with either name remain in the shared action/policy cache identity. The reported setup/conditional-counter/fusion reproduction failed before the fix by publishing goal probability 1; both history and _cacheKey variants now publish goal probability 0.5 and premature-ending probability 0.5. The same counterexamples pass through the compiled worker. |
| 4422591232 | Missing sublime harmony data certified as complete | Fixed conservatively. Certification now requires a recognized selected harmony and an established harmony envelope; after step zero it also requires the active stateful subsystem. There is no blanket Forge or Returning Cycle exemption: observed Forge fallbacks are already hydrated, while missing-source presentation defaults are withheld by the live adapter. The Resonance counterexample now pauses instead of certifying two actions; the observed fusion-resonance state correctly pays the extra 3 stability and ends early. Tests cover all nine types, initialized controls and an empty midcraft envelope. Unknown/unspecified harmonies also pause. Old synthetic tests now specify Formless explicitly; the supplied incomplete recovery fixture remains unchanged and gets its own refusal regression. |

### Sixth-follow-up validation

Full Jest: **54 suites / 1,201 tests passed**. Strict TypeScript and production build passed at 6.9.0 with the three existing webpack size warnings. Rust: **94 passed, 3 profiling tests ignored**; regeneration left the 178-scenario / 1,555-transition differential corpus unchanged. The compiled worker passes both nested-counter 50% risk cases, missing-harmony refusal and malformed-item refusal, alongside prior guaranteed-finish, hidden-PRD, native-gate and eight-band checks. Inert recovery remains pruned in an explicitly established Formless craft. Seven fixed-budget replay recommendations and planning fields remain identical to 7700a58. Documentation checks passed. This is source/artifact validation, not live-game acceptance; the installed 7700a58 package was not changed in this follow-up.

## Seventh review follow-up and independent sweep (findings on 8162df4)

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4422832675 | Inherited Formless harmony in fixtures | Fixed the inherited value in the parameterized evolving-state tests and the Forge-cooling/Returning-Cycle scenarios: these now explicitly use harmony 0. The separate Forge lower-clamp test intentionally retains -100, with a comment explaining that boundary; setting it to zero would introduce a real harmony change and invalidate that no-benefit proof. Formless remains 33. The recovery assertions are unchanged. |
| 4422832681 | Hydration source versus completeness | Clarified. source: missing is described as absence of a non-forge progress payload. Empty/incomplete payloads can be labeled progressState; the source tag is not a completeness proof. The text identifies certification as the check on the resulting envelope and missing active stateful subsystem after step zero. |
| 4422880376 | Production final-state preview | Fixed. Production search now supplies expectedFinalState for fully resolved deterministic terminal routes, including one-action and multi-action finishes. Every traversed action must have one probability-one child, no omitted mass and no hidden probability uncertainty. Stochastic or truncated routes do not turn a most-likely rotation into a final-state expectation. The existing panel setting can display the preview again; worker transport/merge retains the winning partition’s preview. This is presentation-only and does not alter safety ranking. |

### Independent sweep and adjudication

At the user’s request, GPT-6.1 Sol and GPT-6 Astra were explicitly dispatched as independent read-only auditors against the same frozen post-review patch and wider production path. Both dispatches were accepted; this records the requested models, not hidden runtime metadata. They did not edit source or share reports with each other. Sol reported no actionable findings after 159 focused tests. Astra reported one validated PRD carry-over defect after 35 focused tests and a source/runtime probe. Root independently reran the reproduction and inspected the native trial block before editing.

The accepted defect was unconditional PRD streak reset after guaranteed actions. Native stated chance >=1 performs no trial and preserves known/hidden carry-over. The repair captures that distinction before resolution; actual PRD trials still reset on success, including adjusted-probability-one trials. Eight regressions cover preservation, future policy uncertainty, known streak probability, real certainty trials, zero-chance trials and a guaranteed finish. The before case manufactured exact 30.2103% after unknown carry-over and understated known streak two (30.2103% instead of 90.6309%).

Both auditors independently rechecked the applied repair and preview interaction: each passed 34 focused tests and reported no further actionable findings; Astra also reran independent edge probes. Their scope covered planner/cache/probability handling, certification, native availability/auto-use, selected simulator phases, worker transport/merge, extraction/hydration, dispatch verification and UI consumption. They did not claim full-suite, build, live-game or exhaustive runtime-parity verification. Those limits are separate from the root validation below.

### Seventh-follow-up validation

Full Jest: **56 suites / 1,214 tests passed**. Strict TypeScript and production build passed at 6.9.0 with the three existing webpack size warnings. Rust: **94 passed, 3 profiling tests ignored**; regenerated differential data remained unchanged (178 scenarios / 1,555 transitions). Compiled-worker checks cover final preview, hidden/known PRD carry-over and the preceding safety regressions. Seven fixed-budget replay picks and planning metrics remained identical to 8162df4. Documentation checks passed. No new live-game/visual acceptance is claimed, and the installed 8162df4 package remains unchanged.

## Eighth review follow-up (finding on bcdaa30)

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4423250996 | Malformed native numeric fields | Fixed. successChance, stabilityCost and cooldown now join the existing five numeric native fields in the finite-number check. All eight reject explicit null as well: JSON turns NaN/Infinity into null, so treating it as omitted could bypass certification after replay/worker transport. Omitted/undefined fields and finite zero values retain their existing behavior. Related buffCost/buffRequirement amounts and maxStacks already had finite checks; regression coverage now includes them. Tests exercise the actual technique extractor, unresolved distributions/blocked recommendations, JSON replay and worker transport, valid 0/0.5/1 success chances, and an invalid unused alternative alongside a valid action. Valid-input scoring, probability normalization and safety ordering are unchanged. |

### Eighth-follow-up validation

Full Jest: **57 suites / 1,299 tests passed**, including 85 new numeric-boundary cases. Strict TypeScript and production build passed at 6.9.0 with the three existing webpack size warnings. The compiled worker rejects malformed values across all eight native numeric fields, and prior PRD carry, hidden uncertainty, cache identity, missing harmony, final-preview and guaranteed-finish checks pass. Seven fixed-budget replay picks and planning metrics remain identical to bcdaa30. Documentation checks passed. Rust arithmetic and differential data are unchanged; the previously recorded Rust results were not rerun for this validation-only boundary change. No new live-game acceptance is claimed; the installed 8162df4 package is unchanged.

## Ninth review follow-up (findings on ca88204)

The incoming documentation commit ca88204 was fast-forwarded and preserved before the repair.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4423660056 | Native Qi field name in documentation | Preserved the documentation update already pushed in ca88204 and made the exact native key poolCost explicit alongside its Qi label. The finite-number check and regression matrix already cover this field. |
| 4423970128 | Malformed native mechanics flags | Fixed. noMaxStabilityLoss now joins firstActionOnly, disableAtMaxStacks and noQiCost in strict boolean validation. All four distinguish omission/undefined from explicit null; strings, numbers, objects and nonfinite values cannot become certified flags through truthiness or JSON conversion. New regressions exercise actual extraction, unresolved recommendations, replay/worker JSON transport, valid true/false max-stability outcomes and a valid alternative beside a malformed action. Valid transition arithmetic and safety ordering are unchanged. |

### Ninth-follow-up validation

Full Jest: **58 suites / 1,317 tests passed**. Strict TypeScript and production build passed at 6.9.0 with the three existing webpack size warnings. Local compiled-worker artifact smoke checks (separate from the committed Jest suite) rejected malformed values in all four mechanics flags and preserved true/false max-stability behavior. At this checkpoint, the committed JSON replay/worker transport cases covered only `noMaxStabilityLoss`; coverage for all four flags is added in the tenth follow-up below. Seven fixed-budget replay recommendations and planning metrics remain unchanged versus ca88204. Documentation checks passed. Rust arithmetic and differential data are unchanged; prior Rust results were not rerun for this validation-only change. The installed d6912ed package was not changed.

### Celadon compatibility comparison (diagnosis only)

The current runtime Flickering Celadon Flame grants Celadon Cycle, whose four `stackGained.<Ember>` listeners restore 10% maximum Qi and 10 stability and consume all four embers. The untouched original 6.8.0 artifact also lacks these stack-change events. A synthetic four-action sequence with maximum Qi 200, initial Qi 100/stability 40 and action costs 10 Qi/5 stability ended at 60 Qi/20 stability with all four embers retained in the original simulator; native rules imply 80 Qi/30 stability with the embers consumed. The original still returned a recommendation. The strict trigger preflight introduced in 772c680 instead pauses with Unsupported crafting trigger: stackGained.Fusion Ember. Thus the visible pause is new, while the missing simulation predates it. This comparison is not a replay of the player’s full character and does not establish recipe feasibility. At that diagnostic checkpoint Celadon stack-trigger support was unimplemented; the implementation below supersedes that limitation. The guard was not bypassed.

## Celadon Cycle implementation (after eb3f768)

Implemented the verified Flickering Celadon Flame cycle through named stack-gain events, not a score bonus or a whitelist bypass. Accepted Ember additions dispatch synchronously; repeats of a held non-stacking Ember do not. The trigger captures current native-case Ember aliases and stats, pays the payload-defined Qi/stability recovery, and consumes all four non-stacking Embers using the native negative-createBuff semantics. Its captured condition scope survives the removal sequence. Native per-event/per-owner re-entry behavior, capped Qi delta (including zero), boost stats, current maximum Qi and stability overdraft are preserved.

Certification is scoped to the four known Ember gain events and the verified all-four-condition/payout/consumption block shape. Other stack events, stack-loss listeners and unverified programs remain unresolved. Tests cover all 24 orders, repeated cycles/actions, failure, chance branches, caps, low stability, fresh stats, nested hooks, immutability and retained conservative refusal. No goal, ranking or risk-threshold constants changed.

### Celadon validation

Full Jest: **59 suites / 1,358 tests passed**, including 41 Celadon cases. Strict TypeScript and production build passed at 6.9.0 with the three existing webpack size warnings. **96 isolated comparisons** against the native Celadon definition and extracted stack/trigger/resource functions passed. The compiled worker accepts the native payload, returns ordinary recommendations, calculates the exact fourth-ember finishing state and propagates fresh state to downstream hooks. Seven fixed-budget replay picks and planning metrics remain unchanged versus eb3f768. Rust: **94 passed, 3 profiling tests ignored**; the regenerated historical corpus remains unchanged (178 scenarios / 1,555 transitions), and is not claimed as Celadon parity evidence. Documentation checks passed. These are source/artifact checks; the player’s full character and Ashglass Ward feasibility remain in-game UAT.

## Tenth review follow-up (findings on b5acbb7)

Revera reported no new accepted finding with partial coverage. Three Cubic documentation/coverage comments were addressed without production-code changes.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4424563336 | Minimum-stability checklist | Fixed. The finite-number checklist now explicitly includes minimum-stability requirements (minStability), matching the existing native validator and numeric regression matrix. No production validation changed. |
| 4424563374 | Transport versus compiled-worker evidence | Clarified the historical evidence: the all-four compiled-worker statement referred to local artifact smoke scripts, not the committed Jest transport tests. At that checkpoint the committed JSON transport cases covered only noMaxStabilityLoss. Expanded those committed cases to all four mechanics flags for NaN/Infinity/-Infinity -> JSON null rejection, with flag-specific diagnostics, and added true/false worker-transport controls for every flag. Local compiled-worker smoke checks were rerun separately. No production code changed. |
| 4424563381 | Markdown trigger placeholder | Fixed. The `stackGained.<Ember>` expression is now enclosed in inline code formatting, so Markdown cannot treat the placeholder as an HTML tag. |

### Tenth-follow-up validation

This follow-up changes documentation and tests only. **Six focused suites / 225 tests passed**, covering all four flags through JSON replay/worker transport, numeric certification, Celadon Cycle, PRD carry and state-identity boundaries. Strict TypeScript and production build passed with the three existing webpack size warnings. Local compiled-worker artifact checks and all **96 native-function Celadon comparisons** passed. The production mod.js SHA-256 remains **42D6EBC7C6A4CE0F2D2376C3CD01F2B4D53DF275379CCE68DF3E4A079EA7421B**, identical to the validated b5acbb7 Celadon build. The prior full 59-suite / 1,358-test and Rust results remain historical evidence, not fresh full runs for this test/documentation-only update. Documentation checks passed. The package remains version 6.9.0.

## Eleventh review follow-up (finding on d5fec94)

Revera reported one accepted finding with partial review coverage. Cubic reported no new inline finding on this head.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4426264372 | Worker partitions spend budget on every root before filtering | Fixed. Apply assigned root keys before payload validation, availability checks and transition work. An empty partition spends no expansion budget; later roots can use their own partition budget. Deeper continuations retain the full roster, and restricted root action lists never populate the full continuation cache. Completed eligible root evaluations survive exhaustion as explicit rootEvaluation diagnostics, including in JSON replay output. An incomplete root still publishes no actionable partial ranking: an unexamined root might be the guaranteed alternative to a gamble. Merging any exhausted partition preserves that pause and clears candidate alternatives and final-state previews. |

Nine committed regressions cover late/empty partitions, a four-partition shallow safe selection, genuine exhaustion, cancellation, merged refusal with and without a budget diagnostic, cross-partition continuation skills, replay diagnostics and a late-partition fourth-ember Celadon finish. The shallow comparison uses equal total root work; it does not claim that differently budgeted multi-worker searches produce identical deeper policies.

### Eleventh-follow-up validation

Full Jest: **60 suites / 1,384 tests passed**. Strict TypeScript and the 6.9.0 production build passed with the three existing webpack size warnings. The compiled-worker artifact passed real partition-index checks for assigned root budgets, complete and incomplete merges, full continuation access and the exact fourth-ember Celadon finish. Earlier compiled-worker safety probes also passed. All **96 isolated Celadon comparisons** against extracted native functions passed. Seven fixed-node-budget production replay picks, planning fields and explored-node counts remained identical to d5fec94. Documentation checks passed. No simulator arithmetic or Rust code changed; prior Rust/corpus results remain historical and were not rerun. These checks do not establish live acceptance of the player's full Ashglass Ward loadout.

## Twelfth review follow-up (finding on e75fd13)

Cubic reported one diagnostic-ordering finding. Revera marked the previous worker-budget finding resolved and reported no new accepted findings, with two unconfirmed and incomplete review coverage. Its posted summary did not provide actionable details for the unconfirmed candidates.

| Review comment | Finding | Disposition and evidence |
| --- | --- | --- |
| 4426631815 | Worker completion order changes merged diagnostics | Fixed. Sort the deduplicated root evaluation keys and blocked-reason tuples before publishing a multi-partition result. Default string/code-unit ordering avoids locale-dependent comparison. Preserve distinct reason/name/details tuples, input arrays, candidate ranking and incomplete-coverage refusal. Two regressions exercise all six arrival orders for three complete or incomplete partitions, including repeated keys, repeated messages and differences in every diagnostic field. Serialized result snapshots must match across all permutations. |

Validation exposed two pre-existing legacy-search checks that also failed in isolation: iterative deepening assumed a minimum completed depth within 500 ms, and the scaled sublime simulation assumed adequate progress with a 1,000 ms per-turn budget. Neither invokes the modified worker merge. Both pass with generous 120-second time guards, preserving their existing 200,000-node caps, horizons, targets and assertions. Only these two test configurations changed; production search budgets and scoring are untouched.

### Twelfth-follow-up validation

The full run exercised **60 suites / 1,386 tests**: **1,384 passed**, with only the two timing failures described above. Both corrected tests passed in a focused rerun; no single all-green full rerun is claimed. The new arrival-order regressions, Celadon Cycle and prior merge regressions also passed together (**3 focused suites / 62 tests**). Strict TypeScript, formatting, documentation checks and the 6.9.0 production build passed (three existing webpack size warnings). Generated-worker partition/safety probes and all **96 isolated Celadon native-function comparisons** passed. Production changes only canonicalize diagnostics; no simulation arithmetic, policy comparison, runtime search budgets or Rust code changed. Earlier benchmark/Rust evidence remains historical; neither was rerun for this presentation-only change. No live-game acceptance is claimed.

## Thirteenth review follow-up (finding on 7208130)

Revera finding **4428274494** is valid. With Qi 95/max 100, a mastery restoring 20 must leave 100 before the technique pays 10, hence 90 afterward. The discrete simulator instead deferred the cap, left 100 after final cleanup, and could certify a subsequent 100-Qi finisher. The new regression checks the intermediate state, follow-up availability, goal probability and absence of a false deterministic preview.

### Origin and review failure

| Defect | Origin | Evidence |
| --- | --- | --- |
| Deferred Qi cap with a chance resolver | Introduced by our planner rewrite in c132693 | That commit changed the unconditional Qi clamp to bypass it whenever a resolver was present. Stability needed deferred clamping; Qi has different rules. |
| Worker root filtering after expansion | Introduced with the new planner in c132693; fixed in e75fd13 | Budget was spent before applying rootSkillKeys. |
| Arrival-ordered root coverage diagnostics | Introduced with rootEvaluation in e75fd13; fixed in 7208130 | Permutation tests were missing from the original coverage change. |
| Aggregated technique pool effects | Predates the fork and v6.8.0, introduced in 903f10d | Netting restoration and spending loses per-operation caps, floors and event deltas. |

The recent failures are a mixture of introduced regressions and inherited modeling gaps. The local review process was too narrow: targeted fixes and passing suite counts did not establish native phase fidelity. The historical Rust corpus is generated from TypeScript, so agreement can retain the same mistake. This follow-up adds independent native-derived expectations and negative certification tests rather than treating cross-engine agreement as proof of game correctness.

### Resource audit and repair

Pool changes now apply in order and dispatch actual deltas synchronously, including zero and signed deltas permitted by the native applier. Spending floors at zero; restoration applies its captured cap; final turn cleanup is separate. Mastery pool/maxpool/Qi-boost fields retain the native captured frame, payment recomputes its frame, and buff/resource handlers read current state. Item transitions retain fractional pool values until a technique turn ends. Raw operation sign is retained when negative boosts change the effective gain.

Concrete stability changes remain ordered with Qi events: Qi payment precedes stability payment, and later stability restoration cannot be visible to an earlier pool handler. Stability debt remains unclamped until the appropriate action boundary. Legacy EV stability projections retain their historical weighting and are not certificates. The Rust EV helper mirrors the numerical pool-boundary corrections; the regenerated historical corpus changes **24 Qi expectations** in over-cap starting-state cases, with no remaining stability changes.

The sweep also reproduced unsupported intermediate progress observations and bar-listener creation/removal order. Those compound programs now produce unresolved diagnostics rather than a false complete route. Ordinary Celadon Cycle remains supported. This is a deliberate conservative boundary, not a claim that arbitrary effect programs have been fully modeled.

The committed oracle contains **1,440 native WLc cases** across mastery, technique, buff and item contexts, cap/underflow boundaries, zero changes, fractional amounts and positive/negative boosts. Tests also compare encoded event order, actual deltas and the observed pool. The generator executes only the SHA-256-verified native function and imports no optimizer code. Its caller ordering is explicit and isolated; it does not bootstrap the full game or prove unrelated stats, formulas, harmonies or complete character/loadout parity.

Positive controls preserve captured progress expressions and ordinary Strive for Perfection / False Fusion stat frames. The guard distinguishes these from native live-progress checks and fresh callback observations; it does not reject stat buffs merely because their formulas mention a progress bar. All seven sampled production replays retain their recommendations and planning fields at an equal 500-node budget, without hitting the 120-second time guard. Earlier 2,000-node probes hit wall-clock limits and are not used as fixed-work equivalence evidence. Timing varied under local load and is not presented as a throughput benchmark or a global quality guarantee.

Two historical harmony assertions subtracted the stray penalty from an already-capped baseline. Native spending occurs before turn cleanup: an initial 200 Qi, cap 194 and 15-Qi stray loss leave 185, not 179. Those expectations now use the original pool and the final cap, with the harmony penalties retained. No scoring constant or production budget was changed.

### Thirteenth-follow-up validation

The final, uninterrupted release run passed **62 Jest suites / 2,863 tests** on the final source. Strict TypeScript, formatting, documentation checks and the 6.9.0 production build passed (three existing webpack size warnings). Rust passed **96 tests**, with **3 profiling tests intentionally ignored**; the WASM helper was rebuilt and inlined. The historical corpus remains 178 scenarios / 1,555 transitions, with the 24 documented Qi corrections.

The generated worker rejects the false 100-Qi continuation, retains the funded 90-Qi route, preserves fractional-item continuations and ordinary False Fusion frames, and pauses unsupported progress ordering. Previous worker partition, native-field, hidden-PRD, preview and goal checks pass. All **96 isolated native Celadon comparisons** pass, alongside the committed **1,440 native pool expectations**. Seven equal-500-node production replay recommendations and planning fields match 7208130. These scoped checks do not establish exhaustive native parity or replace in-game acceptance.
