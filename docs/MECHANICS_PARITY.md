# Mechanics parity

Current contracts for AFNM **0.7.19-ac29603**, plus explicit model gaps. Installed-runtime evidence wins over local tests or prose. [Runtime evidence](RUNTIME_EVIDENCE.md#current-state) indexes the audits; [Development](DEVELOPMENT.md#validation-matrix) explains validation.

## Evidence and scope

Formula/transition checks live in `gameAccuracy.test.ts`, `runtimeParity.test.ts`, `skills.test.ts`, `runtime0717.test.ts`, `returningCycle.test.ts` and harmony suites. Outcome/projection suites test bands and termination; simulations and exported replays test multi-turn behavior.

The generated differential corpus compares TypeScript and Rust states, legal/illegal actions, buffs/internal state, items, counters and harmony digests. Its sources are `src/__tests__/fixtures/differentialCorpus.ts` and `crates/craftbuddy-engine/tests/differential_corpus.json`. Cross-engine agreement proves covered engines agree, **not** that unsupported effects match the game. Current counts come from the generator/test output rather than a duplicated table here.

## Execution contract

The 0.7.17 order, re-audited in 0.7.19, is:

1. Pay toxicity, droplets and buff costs.
2. Capture success chance.
3. Apply effect masteries, including on failure.
4. Recompute/pay Qi and stability.
5. Apply success-only technique effects.
6. Run type-specific and ordinary effects for **pre-action buff names**. A new name survives its creation turn; a refreshed existing name still ticks.
7. Resolve harmony with reported payment, advance/generate conditions, then decay/cap/floor resources in turn cleanup.

Stability may remain negative or above its maximum through effects, buffs and harmony; **only final cleanup clamps it**. Example: start 1, pay 10, buff restore 7 → -9 → -2 → final 0, not 7. Start 8/max 10, technique +5 then buff -5 → final 8, not 5. Qi is different: ordinary spending/restoration clamps immediately to zero/derived maxpool and tracks actual clamped deltas. The current simulator's earlier stability bounds are a known gap being fixed in v7.

| Surface | Contract/model |
| --- | --- |
| Cost channels | Independent zero-based Qi/stability reduction and penalty channels; stack-scaled contributions folded once, with runtime flat/condition/harmony order. Legacy compatibility must not floor untouched fractional modern baselines. |
| Droplets | Preserve current/max droplets, technique `dropletCost`, `noQiCost`, legality/payment and replay/worker/native wire fields. |
| Masteries/scaling | Keep effect mastery entries separate from construction-time static upgrades; preserve multipliers, rounding, room-effectiveness opt-in, buff `additionalVariables`, `setState.keys` and sequential state writes. |
| Chance payment buffs | Current expected payment uses transient independent branches; not persistent stochastic future-buff state. |
| Item effectiveness | Additive live stat, neutral 0; `isItem` scales by `1 + itemEffectiveness / 100`, including worker and native wire paths. |
| Buffs | Generic definitions, stat fold, effect conditions, type/per-turn effects, stack consumption and internal-state seeding/cloning/keying. Unknown effect kinds may still be skipped. |
| Resource/bar triggers | Six resource/bar events dispatch general buff effects with numeric `amount` and bar `percentGained`; re-entry guard prevents recursive loops, running bars feed nested triggers. Stack mutation events are a separate unsupported surface below. |
| Illume Crucible seal | `sealedMaxStability` forces normal maximum decay and blocks positive maximum restoration. |
| Turbid Qi | First stack after the step bump to 100, then every three steps, taxing subsequent actions. |
| Boost stats | Completion/perfection/stability/Qi boosts affect positive gains after crit with flooring, not costs/max-stability/harmony. Completion Bonus adds **10 `perfectionBoost` per stack** once; skip its generic stat fold to avoid double application. |
| Quality caps | `bonusMaximumQuality` is summed in `src/modContent/qualityCap.ts` with equations stripped, stacks fixed at one and per-buff floors, then passed to native cap getters as the fourth argument. |

## Outcomes and harmony

`src/optimizer/outcome.ts` owns the TS conjunction, band thresholds and auto-finish. Rust `outcome.rs` is an independent parity-tested mirror. Basic requires one completion band; perfect one of each; sublime two of each and a sublime item. Widths grow by 1.3×. Termination is stability <= 0 or **both actual caps**, never the five-band refund ceiling. Overcraft extras are independent per-bar rewards gated on the secured tier; terminal scores include bonus-roll fractions. Goal/bias settings change search ambition, not game thresholds.

Harmony is **player-selected**, not derived from recipe/item kind; a recipe override is the forced exception. Complexity multiplies sublime targets only. Static registry values live in `src/optimizer/harmonyRegistry.ts`.

| Harmony | Important behavior |
| --- | --- |
| Forge Works | Heat **4–6** gives ×1.5 control/intensity; 2–3 is a control penalty, 7–9 an intensity penalty. At heat 1 the runtime does not refresh the Heat buff; `lastBuffedHeat` preserves the prior modifier. |
| Alchemical Arts | Charge/reaction sequencing through the harmony state. |
| Inscribed Patterns | Stack/block progression and invalid-colour stack-halving penalty. |
| Spiritual Resonance | Mismatch costs **9 harmony / 3 stability**, with pending-switch exemption; the old log text saying 15 is not the formula. |
| Formless Way | Pins harmony at its starting 33 instead of accumulating deltas. |
| Enhancing Echo | Attunement state and live Qi/stability action-cost scaling. |
| Eccentric Decree | Per-bar-application ordered fold, +5 focused or **−15 harmony / −15 Qi** stray; focus can switch several times in a turn. |
| Captivating Cadence | Different types extend the chain, +3×chain harmony after entry one and +2% control/intensity per point. Repetition clears it, costs 50 harmony and 1 max stability. |
| Returning Cycle | Fixed `chargeSize = max(1, raw starting maxpool × .1)`. Reported payment accrues even on failure. Each charge drains 3 harmony and 30% of charge size in Qi per action; stabilize drains first, then releases for +10 harmony/+5 Returned Precision per charge, retaining the partial remainder. |

Returned Precision is an ordinary +1 crit-point/stack buff. Existing stacks tick before release; newly released stacks do not decay or improve that release action. Cycle hydration preserves fixed size, charges, stored Qi, pulse key and last outcome; missing/invalid data reinitializes rather than producing invalid arithmetic.

### Decree event construction

`processEccentricDecree` in `src/optimizer/harmony.ts` and the Rust fold in `crates/craftbuddy-engine/src/lib.rs` consume ordered bar changes. `needsBarContributions()` / `needs_bar_contributions()` collect events only for sublime Decree crafts, avoiding event-list work elsewhere. Each event floors/clamps both running bars, compares focused/stray deltas, then flips focus when its guaranteed band increases; the label alone does not decide scoring. No events falls back to an end-of-turn delta for older inputs.

Absent live state seeds from the **current bars**, matching runtime lazy seeding; attaching mid-craft must not retro-charge harmony. Remaining discrete-event/intra-turn-scaling approximations are below.

## Integration contracts

- Read live techniques and buffs rather than hardcoding magnitudes; display names use `techniqueDisplayName()`, canonical lookups use internal `name`.
- Preserve all harmony variants/provenance, cost channels, droplets, buff definitions/state, mastery entries and item state across clones, caches, extraction, replay and both bridges.
- Native auto-use is the real technique-handler prehook, using the ordinary item reducer/effects. CraftBuddy executes through that UI control when active; direct dispatch would bypass consumption. Manual pills, auto pills and reagents share the per-round counter.
- Native selection uses inventory/item-name limits, cumulative toxicity and conservative slot-condition handling locally. That conservative projection is not an exact future auto-use simulator.
- Native condition/cap/precheck paths retain guarded fallbacks. `getNativeActionCost` is declared/imported but not called; local costs remain the model. A helper's existence is not adoption.

## Known gaps

These describe the worktree before the parallel v7 mechanics changes land; the owning implementation should move a gap into the contract only with regression evidence.

1. **Stability overdraft/ceiling timing — being fixed in v7.** `applySkillTransition` bounds stability before ordinary buff recovery; runtime delays both bounds until cleanup. The separate survivability floor also bounds early and moves max decay earlier.
2. **Finish-to-Wait — being removed in v7.** Search has a synthetic finish action; `src/modContent/autoCraftExecutor.ts` maps a finish request to `WAIT_TECHNIQUE`/a Wait control. Wait advances a real turn and costs 10 stability; it is not equivalent to instant craft-end EV. No manual Finish exists.
3. **Survivability floor phase divergence.** `calculateActionSurvivabilityFloor` pays before buff consumption and omits effect masteries (observed floor 1 vs transition 0, and floor 0 vs transition 16). The real forced-failure transition check does not repair this helper.
4. **Stack-change events.** Runtime fires `stackGained.<name>` / `stackLost.<name>` synchronously at specific mutation helpers. Local dispatch accepts string blocks but does not emit those stack events; Forge Compression's Pressure listener is therefore affected. Live extraction alone did not automatically adopt the 0.7.9 rework.
5. **`modifyBuffGroup`.** Elixir Renewal's +3 Pill extension is not executed. Runtime matches exact buff type **or name**, selects all/highest/lowest/random (ties first), evaluates amount once in source scope, then applies ordinary per-target stack mutations/events.
6. **Companion interception/prevention.** Su Lianhua's positive technique/mastery bar interceptor and Han Weiguang's first-two stability-loss prevention are stock affected behaviors, not only hypothetical mod compatibility. Technique-level triggered effects are a latent unsupported surface; no stock technique with its own trigger definition was found in the audit.
7. **Discordance ordering/distribution.** Runtime takes the maximum held positive discordance **before every queue branch**; local search applies a later neutral-gate adjustment. Runtime has a separate 0.18 extreme branch and a different mild-condition split; this is more than a changed neutral probability.
8. **Decree approximation.** Events distribute aggregate expected gains over raw contributions, not runtime discrete integer applications; a mid-technique focus flip does not rescale that same technique's later effects. Legacy scalar/Disciplined Touch synthesize completion then perfection events.
9. **Stochastic approximation.** Hidden success/crit/bonus rolls are EV, not predicted RNG; future chance-buff state is not probability-aware. Fixed wall-clock settings do not guarantee fixed work or recommendations.
10. **Expression coercion.** The game's evaluator coerces some unexpected text to zero; the constrained local evaluator does not normalize every malformed input identically. No realistic stock payload proving a divergence was established.
11. **Fallbacks/auto-use.** Forge recovery, constrained expressions, fallback condition tables and DOM recovery remain heuristic-sensitive; native slot conditions conservatively assume consumption rather than execute arbitrary game expressions.

Finished-item `harmonyAugment`/bonus-quality effects and actual material-return calculation are deliberately not simulated as transitions: they resolve after play. Search values verified extra-band rewards but does not forecast inventory payout. Absolute Rust/TS scores differ by design; rankings and transitions, not score magnitudes, are the parity surface. Combat systems remain out of scope.
