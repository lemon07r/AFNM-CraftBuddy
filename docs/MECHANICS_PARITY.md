# Mechanics parity

Current contracts for AFNM **0.7.19-ac29603**, plus explicit model gaps. Installed-runtime evidence wins over local tests or prose. [Runtime evidence](RUNTIME_EVIDENCE.md#current-state) indexes the audits; [Development](DEVELOPMENT.md#validation-matrix) explains validation.

## Evidence and scope

Formula/transition checks live in `gameAccuracy.test.ts`, `runtimeParity.test.ts`, `skills.test.ts`, `runtime0717.test.ts`, `returningCycle.test.ts` and harmony suites. Outcome/projection suites test bands and termination; simulations and exported replays test multi-turn behavior.

The transition golden pins TypeScript states, legal/illegal actions, buffs/internal state, items, counters and harmony digests. Its sources are `src/__tests__/fixtures/differentialCorpus.ts` and `src/__tests__/fixtures/transition_corpus.json`; `transitionCorpus.test.ts` replays the stored inputs. A golden protects behavior, **not** fidelity to unsupported game effects. Current counts come from the generator/test output rather than a duplicated table here.

## Execution contract

The 0.7.17 order, re-audited in 0.7.19, is:

1. Pay toxicity, droplets and buff costs.
2. Capture success chance.
3. Apply effect masteries, including on failure.
4. Recompute/pay Qi and stability.
5. Apply success-only technique effects.
6. Run type-specific and ordinary effects for **pre-action buff names**. A new name survives its creation turn; a refreshed existing name still ticks.
7. Resolve harmony with reported payment, advance/generate conditions, then decay/cap/floor resources in turn cleanup.

Stability may remain negative or above its maximum through effects, buffs and harmony; **only final cleanup clamps it**. Example: start 1, pay 10, buff restore 7 → -9 → -2 → final 0, not 7. Start 8/max 10, technique +5 then buff -5 → final 8, not 5. Qi is different: ordinary spending/restoration clamps immediately to zero/derived maxpool and tracks actual clamped deltas. Cleanup increments the stability penalty (unless exempt), ceils and bounds it, bounds stability, then floors; the simulator applies that per realized outcome before averaging chance branches (`src/optimizer/stability.ts`).

Technique stability and maximum-stability effects share one action-success branch; their own chance conditions still branch independently inside that successful action. Thus start 1, pay 10, then successful +20 and −20 always ends at zero, not a mean containing impossible partial-success outcomes. This turn-local projection does not make future buff state or trigger dispatch fully branch-local.

| Surface | Contract/model |
| --- | --- |
| Cost channels | Independent zero-based Qi/stability reduction and penalty channels; stack-scaled contributions folded once, with runtime flat/condition/harmony order. Legacy compatibility must not floor untouched fractional modern baselines. |
| Droplets | Preserve current/max droplets, technique `dropletCost`, `noQiCost`, legality/payment and replay/worker wire fields. |
| Masteries/scaling | Keep effect mastery entries separate from construction-time static upgrades; preserve multipliers, rounding, room-effectiveness opt-in, buff `additionalVariables`, `setState.keys` and sequential state writes. |
| Chance payment buffs | Current expected payment uses transient independent branches; not persistent stochastic future-buff state. |
| Item effectiveness | Additive live stat, neutral 0; `isItem` scales by `1 + itemEffectiveness / 100`, including worker wire paths. |
| Buffs | Generic definitions, stat fold, effect conditions, type/per-turn effects, stack consumption and internal-state seeding/cloning/keying. Unknown effect kinds may still be skipped. |
| Nonpositive held buffs | Technique/mastery/item createBuff retains signed stacks until explicit consumption/negation; ordinary ticks, stat contributions and held flags still apply. Count aliases and triggered listeners omit nonpositive entries. Extraction and cache keys retain them. |
| Technique percentage conditions | Stability/completion/perfection gates read running progress after payment and earlier effects, with recipe targets as denominators (initial stability, not the decayed maximum). Pool and expression conditions retain the variable snapshot. |
| Resource/bar triggers | Six resource/bar events dispatch general buff effects with numeric `amount` and bar `percentGained`; re-entry guard prevents recursive loops, running bars feed nested triggers. |
| Buff stability conditions | Ordinary and triggered stability percentage gates use the running, unclamped stability projection (including earlier listener effects), divided by initial recipe stability. This is an expected-state gate, not per-outcome conditional branching. |
| Su Lianhua | Exact stock technique/mastery interception: positive completion/perfection ×1.5 on `step % 3 == 2`, floor each multiplication before crit/boost. First matching interceptor per held buff, in held order; payment, items and buff effects bypass it. Preview and transition share the ordered path; interceptor percentage triggers read live technique progress. |
| Han Weiguang | Certainty-only approximation: held-order prevention with integer `internalState.preventedStabilityLosses` (two stock uses), persisted through clone/replay. Certain negative payment, technique/mastery and ordinary/triggered buff applications are prevented before spend tracking/events. The survivability floor shares the transition's integer-use helper for certain stability payment; exhausted uses and uncertain payment losses remain charged. A success-gated loss requires captured success chance 1, even inside the shared success branch. |
| Scalar compatibility | Effect-less scalar techniques and the legacy Disciplined Touch calculation retain their gains and completion/perfection/stability-restored listeners while companions are held. Payment listeners dispatch once through their own path; fallback technique listeners are suppressed only when ordered effects already emitted them. Runtime techniques use an effect tree; Su interception is not applied to offline scalar fallback fields. |
| Companion previews | Effect-tree previews for either companion pay Qi/stability and run payment listeners/prevention before evaluating live technique gates; payment uses count before later Han losses. They omit ordinary end-turn ticks/cleanup and do not mutate the input state. |
| Scalar Qi restoration | Companion-ordered actions retain `restoresQi` listener dispatch, reporting the realized, boosted and pool-capped restored delta once; zero restoration emits no `poolRestored` event. |
| Companion bar caps | Technique bar applications and listeners retain uncapped overflow through later drains, as in runtime; actual caps apply at turn cleanup. Like the non-companion preview, cap the combined successful technique gain before applying the one shared success probability, not each application or the weighted mean. Starting at 90/cap 100, +20 then −10 ends at 100 (95 in expectation at 50% success). Two +100 effects from 0 at 50% success still gain 50, not 75. |
| Companion bar events | Keep probability-weighted application amounts fractional for listeners: two +1 effects at 50% success dispatch two 0.5 events, matching the non-companion contribution path. Aggregate technique progress is floored/capped once, separately from listener bookkeeping. |
| Companion transpositions | Normalized search keys include the full step whenever a held buff defines effect interceptors, since generic interceptor expressions can read arbitrary step values. Keys without effect interceptors, including Han-only states, remain byte-identical to the legacy format. |
| Stack events | `stackGained.<name>` / `stackLost.<name>` fire synchronously from the stack-mutation helpers: gains report the requested floored amount even when capped, losses clamp to held stacks, consumption and expiry count as losses, a negative technique-create differs from a negative buff-create, and Returning Cycle releases stay silent while ordinary decay emits a loss. Success chance is captured after buff-cost listeners run. |
| Buff groups | `modifyBuffGroup` matches exact buff type or name in source scope, evaluates the amount once, selects all/highest/lowest (stable ties) and applies ordinary per-target stack mutations and events (Elixir Renewal's +3 Pill extension). |
| Discordance | TS search computes the maximum held positive discordance once from the root state's buffs: stock Uncontrollable Flames is a permanent equipment-granted buff for the craft. Discordance precedes every queue branch. After the non-neutral gate, `0.18 / discordance` selects extreme rather than mild; the mild positive/negative split uses `0.5 + 0.25 * harmony / 100`, with 0.25 the harmony slope and pre-cleanup harmony. Runtime reads post-action buffs; dynamic discordance changes are a TS gap below. |
| Expressions | An empty expression evaluates to 0, as in the runtime evaluator. |
| Illume Crucible seal | `sealedMaxStability` forces normal maximum decay and blocks positive maximum restoration. |
| Turbid Qi | First stack after the step bump to 100, then every three steps, taxing subsequent actions. |
| Boost stats | Completion/perfection/stability/Qi boosts affect positive gains after crit with flooring, not costs/max-stability/harmony. Completion Bonus adds **10 `perfectionBoost` per stack** once; skip its generic stat fold to avoid double application. |
| Quality caps | `bonusMaximumQuality` is summed in `src/modContent/qualityCap.ts` with equations stripped, stacks fixed at one and per-buff floors, then passed to native cap getters as the fourth argument. |

## Outcomes and harmony

`src/optimizer/outcome.ts` owns the conjunction, band thresholds and auto-finish. Basic requires one completion band; perfect one of each; sublime two of each and a sublime item. Widths grow by 1.3×. Termination is stability <= 0 or **both actual caps**, never the five-band refund ceiling. Overcraft extras are independent per-bar rewards gated on the secured tier; terminal scores include bonus-roll fractions. Goal/bias settings change search ambition, not game thresholds.

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

`processEccentricDecree` in `src/optimizer/harmony.ts` consumes ordered bar changes. `needsBarContributions()` collects events only for sublime Decree crafts, avoiding event-list work elsewhere. Each event floors/clamps both running bars, compares focused/stray deltas, then flips focus when its guaranteed band increases; the label alone does not decide scoring. No events falls back to an end-of-turn delta for older inputs.

Absent live state seeds from the **current bars**, matching runtime lazy seeding; attaching mid-craft must not retro-charge harmony. Remaining discrete-event/intra-turn-scaling approximations are below.

## Integration contracts

- Read live techniques and buffs rather than hardcoding magnitudes; display names use `techniqueDisplayName()`, canonical lookups use internal `name`.
- Preserve all harmony variants/provenance, cost channels, droplets, buff definitions/state, mastery entries and item state across clones, caches, extraction, replay and worker wire inputs.
- Native auto-use is the real technique-handler prehook, using the ordinary item reducer/effects. CraftBuddy executes through that UI control when active; direct dispatch would bypass consumption. Manual pills, auto pills and reagents share the per-round counter.
- Native selection uses inventory/item-name limits, cumulative toxicity and conservative slot-condition handling locally. That conservative projection is not an exact future auto-use simulator.
- Native condition/cap/precheck paths retain guarded fallbacks. There is no native action-cost wrapper; local costs remain the model. A helper's existence is not adoption.

## Known gaps

The owning change should move a gap into the contract only with regression evidence.

1. **Survivability floor phase divergence.** `calculateActionSurvivabilityFloor` pays before buff consumption and omits effect masteries (observed floor 1 vs transition 0, and floor 0 vs transition 16). The real forced-failure transition check does not repair this helper. It also still clamps the maximum-stability penalty after each technique, buff and harmony step instead of carrying the signed penalty to turn cleanup, so a repair followed by an equal buff loss can read as fatal.
2. **Companion stochastic state.** Stock Su interception is exact within the existing crit/success EV model. Optional interceptor effects run synchronously only on certain applications with deterministic met conditions; stochastic triggers/side effects are skipped (stock Su has none). Han is certainty-only: probability-weighted/chance losses remain charged and consume no use, including buff losses reached through an uncertain trigger chain. No fractional counter or full branch-local companion state is used. After one certain loss and a 50% loss, runtime has counter 1 or 2; averaging to 1.5 would wrongly guarantee prevention of the next loss. The approximation instead charges the uncertain loss and keeps counter 1. **This is not a conservative survival bound:** at stability 5 with one use left, a 50%-chance −1 followed by certain −10 is modelled as 4.5 stability, but runtime cleans up to 0 or 5 with equal probability (mean 2.5). Saved uses can therefore overestimate stability and survival on later losses. The explicitly chosen counter policy is retained, not certified as safe stochastic simulation. Zero applied loss, direct harmony writes and maximum-stability decay do not consume uses. Technique-level triggered effects remain a latent unsupported surface; no stock technique with its own trigger definition was found in the audit.
3. **Random multi-target `modifyBuffGroup`.** Single-target random works; multi-target random is a no-op in the simulator. No stock definition uses it.
4. **Decree approximation.** Events distribute aggregate expected gains over raw contributions, not runtime discrete integer applications; a mid-technique focus flip does not rescale that same technique's later effects. Legacy scalar/Disciplined Touch synthesize completion then perfection events.
5. **Stochastic approximation.** Hidden success/crit/bonus rolls are EV, not predicted RNG; future chance-buff state is not probability-aware. Fixed wall-clock settings do not guarantee fixed work or recommendations.
6. **Expression coercion.** Beyond the empty-expression case, the game's evaluator coerces some unexpected text to zero; the constrained local evaluator keeps its finite-result and syntax guards. No realistic stock payload proving a divergence was established.
7. **Fallbacks/auto-use.** Forge recovery, constrained expressions, fallback condition tables and DOM recovery remain heuristic-sensitive; native slot conditions conservatively assume consumption rather than execute arbitrary game expressions.
8. **Payment-trigger ordering.** Outside the ordered companion path, the simulator defers Qi/stability payment listeners until after technique effects, while stack listeners execute during those effects. The companion path dispatches Qi payment listeners, then applies/prevents stability payment and its listeners before technique effects. Runtime payment appliers dispatch synchronously before the success roll/effect loop (`RUNTIME_EVIDENCE.md` §19). A technique stack listener can therefore remove a payment listener too early outside that path. Correcting the full phase boundary also requires rebuilding technique variables/gains after payment listeners and carrying their live progress through dispatch; moving only the callback does not establish general runtime order.
9. **Dynamic discordance.** TS freezes discordance for each search at the root maximum; runtime rereads held buffs after an action. The only stock discordance buff comes from equipped Flame of Discordance ranks at craft initialization and has no expiry effects. Custom createBuff/consumeBuff effects can nevertheless gain/remove such a buff mid-craft, which the TS future-condition forecast does not model. A new live search captures the updated root buffs.

Finished-item `harmonyAugment`/bonus-quality effects and actual material-return calculation are deliberately not simulated as transitions: they resolve after play. Search values verified extra-band rewards but does not forecast inventory payout. Combat systems remain out of scope.
