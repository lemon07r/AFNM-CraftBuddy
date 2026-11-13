# Changelog

## 7.2.0 — AFNM 0.7.21

- Retarget to 0.7.21-6b1d439. The crafting engine is unchanged; the 0.7.21 balance changes (Qi Pool boost, Consolidated Skill Gem, Numinous Muscles, Stellar Infusion/Refinement, Heavenjudging Eyes) are read live from the game. `afnm-types` stays at 0.7.20 because no 0.7.21 package exists.
- Simulate Lanternheart Flame: actions now see the game's condition and harmony flag variables (`Condition__Harmonious`, `Harmony__forge`, …), so refining while Harmonious or Brilliant grants Kindled Brilliance as it does in game. Before this the gate always read 0.
- Redesign the overlay and settings. The next action is a focal card with a gold Use button, gains as labelled chips, costs on their own row and an in-card warning for risky or craft-ending actions. The outcome shows secured and target tier chips with band pips per bar. Conditions read as a labelled sequence with glyphs, so they don't rely on colour. Plan, other actions and automation are one collapsible stack. Compact mode has its own denser layout, and the regular panel caps at 560px.
- Settings are grouped into cards with a sticky header: a segmented search-effort control showing each preset's time budget, value badges on the goal sliders, aligned toggles and number buttons for alternatives. Help opens on hover or focus, a click or tap pins it, and Escape closes it before the dialog.

## 7.1.0 — AFNM 0.7.20

- Retarget to 0.7.20-101cd1d and afnm-types 0.7.20.
- Fix unreadable in-game panels: since 7.0 the theme was imported through a bundled second copy of MUI, so the game's components fell back to MUI's default light theme (dark text on the dark panel, white dialogs, blue controls). The panel and settings now use the game's own MUI, and `mod.js` is about 200 KB smaller.
- Strip the live Forge Works heat band buffs, so heat applies once. At heat 0 the band was counted twice, which showed a "−100000% control" readout and made auto-craft spam Forceful Stabilize (bug report replay).
- Model 0.7.20 resource-scope interceptors (Han Weiguang's Assistance now also prevents item and buff stability losses) through one accessor with a legacy mapping for old replays.
- Apply harmony stat effects once and additively against base stats, matching the game's stat fold. Resonance and Decree Focus are no longer counted twice, and a live Alchemical Reaction is replaced rather than stacked by the next simulated one. Reaction Qi and stability discounts now combine with other cost reductions before rounding, and the stability discount also softens stability losses from effects.
- Survival-weight risky actions: a line whose stability floor can end the craft is scored as `p × surviving continuation + (1 − p) × craft end`, continuing from the surviving stability rather than discounting death twice. The planned end state replays the line that survives, so it never stops before a listed step.
- Compute crit expectation exactly, including 0.7.20 overcrit chains, cap bonus, chain growth, crit cycles and refinement crit chance, instead of sampling the game's random crit roll (which made live search scores noisy). Buff and item bar effects now crit the way the game does.
- Fire the new `actionResolved` trigger and certain `crit` triggers; extract the new crit stats (overcrit, overcrit cap bonus, refinement crit chance) and keep old replays loading with them as zero.

## 7.0.0 — AFNM 0.7.19

- Derive survival floors and projected survival odds from the actual action transition, fixing buff-consumption/mastery ordering and signed maximum-stability cleanup without a duplicate simulator.
- Model Su Lianhua's effect interception and Han Weiguang's stability-loss prevention when those companions are held.
- Apply technique and buff Qi changes individually with clamped event amounts (including zero), and match signed stability events and loss reductions with or without companions.
- Retire the opt-in Rust/WASM MCTS prior and engine selector; the established TypeScript search and its preset budgets are unchanged.
- Preserve old settings/replay compatibility and keep the transition corpus (now 1,670 transitions) as a TypeScript golden test. Builds no longer require Rust or wasm-pack.
- Redesign the panel and settings in the game's own style: one clear next action, the outcome being worked towards, and collapsible plan, other-action and automation sections. Settings use plain names, are keyboard and screen-reader friendly, and also appear in the game's mod options screen.
- Show "Craft failed" when a craft resolves below the lowest tier.
- Search evaluates techniques faster at identical recommendations (about 15% more search per second across the replay set, 1.22 to 1.40 nodes/ms at fixed work), so time-limited presets look further ahead on slower machines.
- Recalculate when only Qi droplets change, so automatic crafting no longer waits on a stale recommendation.
- Run the benchmark contracts at fixed node budgets in CI and release validation.

## 6.9.0 — AFNM 0.7.19

- Retarget to 0.7.19-ac29603 and afnm-types 0.7.19; retain the audited phase/Cycle model.
- Remove the five-band auto-finish shortcut in both engines: stability <= 0 or both actual caps decide termination.
- Preserve ambition settings through terminal scoring, recommendation freshness and cross-step cache scope.
- Prefer viable secured routes over fatal technique-failure gambles, including order-independent worker merges.
- Honor the native auto-use enabled toggle and read consumed pills from the crafting slice (issue #3, PommesMitChips).
- The constrained stochastic planner from PR #4 is not shipped; the separate survivability-floor phase divergence remains a known gap.

## 6.8.0 — AFNM 0.7.17

- Model independent zero-based Qi/stability cost channels, droplets, mastery-before-payment and success/failure execution phases.
- Tick only pre-action buff names; preserve scaling additions, buff variables and sequential triggered effects.
- Add Returning Cycle: fixed paid-Qi charges, drain-before-release, ordinary Returned Precision and full hydration/replay/bridge state.
- Preserve exhaustive worker state, additive item effectiveness and fractional modern cost channels; advance Rust running bars through recursive triggers.
- Normalize ASAR path separators for selective extraction. Runtime-evidenced buff timing replaced the depth-sensitive resonance runner-up contract; heat-one retains assertions at 6,000 nodes.

## 6.7.0 — AFNM 0.7.12

- Add Captivating Cadence: varied-type chains, repeat penalties and chain-derived control/intensity in both engines.
- Preserve Cadence through cloning, hydration, replay and native scaling aliases.
- Carry buff types and aggregate stack/unique-count variables through extraction and simulation.
- Selectively extract runtime JavaScript/JSON instead of buffering a multi-gigabyte art-heavy ASAR.

## 6.6.0 — AFNM 0.7.10

- Replace Completion Bonus's old control scaling with +10 Perfection Boost per stack.
- Carry completion/perfection/stability/Qi boosts through both engines and apply them to positive gains after crit/rounding, not costs.
- Recognize the new live buff signature while retaining compatibility with old replay shapes.

## 6.5.0 — AFNM 0.7.9

- Pass live `bonusMaximumQuality` into native cap getters so Purifying Flame's raised ceiling reaches goals and previews.
- Sum cap boosts with runtime-equivalent per-buff flooring and stacks fixed at one; retain bonus-quality fields without simulating finished-item stars.
- Read the revised Insight package and technique roster live instead of hardcoding patch data. Forge Compression's new stack listener was not actually dispatched; that limitation is documented in the current parity guide.
- Bind the heat-runway regression to node work instead of machine-dependent clock depth.

## 6.4.0 — AFNM 0.7.8

- Recover from missed auto-mode state advances: reverify, resume on a late advance, retry once if unchanged, otherwise remain in a recoverable armed pause.
- Match DOM technique controls by internal and display names, including Strive for Completion.
- Add Perfection Band Goal and Completion Band Ceiling without changing the game's tier gates; mirror them in the Rust bridge/model.

## 6.3.1

- Include fractional craft-end bonus-roll EV so different finishing gains no longer tie behind a tiny Qi preference.
- Bound overcraft extras by real bar flats even when explicit cap fields are absent.
- Derive gain previews from simulated post-action progress, including triggered procs; explain craft-ending moves without promising future buff value.

## 6.3.0 — AFNM 0.7.8

- Add definition-driven buff internal state, resource/bar triggers and sequential `setState` effects for Bifang/Azure Depths behavior.
- Model Illume Crucible's forced maximum decay and restoration seal in both engines.
- Add a discordance distribution adjustment; its late-neutral ordering remains an approximation, not exact runtime parity.
- Update Decree's stray penalty to −15 harmony/−15 Qi.
- Extract native buff costs/requirements so gated techniques are not recommended without their required buff; omit absent internal-state fields at the Rust boundary.

## 6.2.0 — AFNM 0.7.6

- Value extra completion/perfection bands independently after securing the tier; add Push Extra Bands.
- Reuse completed transposition passes across same-state/cross-budget searches without weakening condition-context keys.
- Make stable-recommendation early exit reachable while contested lines keep searching.
- Move search to blob workers with optional root partitioning, per-worker caches, cancellation and synchronous fallback.

## 6.1.0 — AFNM 0.7.6

- Fold Decree over ordered per-bar changes, with allocation gates for other harmonies and current-bar lazy seeding.
- Fix Echo/Decree hydration clones that had reset their subsystem state on every poll in 6.0.0.
- Display Strive for Completion while retaining False Fusion's internal key; read the Soulflame rebalance through live definitions.
- Document expected-value event and mid-technique scaling limitations rather than claiming discrete runtime equivalence.

## 6.0.0 — AFNM 0.7.5

- Replace additive “quality” scoring with conjunctive band gates and binding-bar outcome projections.
- Model seven player-selected harmonies and their sublime complexity multipliers; correct forge heat-one and resonance formulas.
- Add generic buffs/effect trees, mastery, Soulflame, toxicity and item-action parity to Rust, while TS retains final ranking.
- Correct Disciplined Touch intensity scaling and expected capped progress to `p * min(gain, headroom)`.
- Preserve native auto-use through UI execution and verify live revisions immediately before automated dispatch.
- Add setup hints, height-clamped scrolling and shared outcome rows; separate runtime extraction/provider/mount/export seams.
- Fix explicit-null native payload rejection and hash-ordered condition merging. Historical fixed-work Rust throughput improved 1.90× without ranked-policy changes.

Current limitations and evidence: [Mechanics parity](docs/MECHANICS_PARITY.md), [Engine decisions](docs/ENGINE_DECISIONS.md).
