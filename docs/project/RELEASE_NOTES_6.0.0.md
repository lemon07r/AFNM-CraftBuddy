---
title: Release Notes 6.0.0
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-26
source_of_truth: git history on main, package.json, src/optimizer/outcome.ts, src/modContent/nativeAutoUse.ts, crates/craftbuddy-engine/*
review_cycle_days: 90
related_files:
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/RUNTIME_EVIDENCE_075.md
  - docs/project/RELEASE_PROCESS.md
  - docs/project/WORKSHOP_DESCRIPTION.md
---

# Release Notes 6.0.0

CraftBuddy rebuilt for AFNM **0.7.5**. This is a major version because the harmony model, the scoring architecture and the terminal-state semantics all changed incompatibly with 5.x — the same reason `v5.0.0` was a major bump for the ModAPI adoption.

## Why players asked for this

Community feedback on 5.x, and what was actually wrong:

| Report | Cause | Now |
| --- | --- | --- |
| "solid on simple crafts, poor on nearly any Sublime Craft" | The scorer was an additive weighted sum of ~30 tuned constants. Sublime success is _conjunctive_. | Outcome tiers are decided by band gates on both bars. |
| "tendency to go excessively for completion" | Same additive sum — whichever term happened to dominate won. | Once a bar's requirement is met, more of it cannot raise the score's gate. |
| "pumps Perfection and neglects Harmony and Completion" | `HARMONY_BONUS_WEIGHT` of `0.15` could never compete. | Harmony is valued through its effect on the reachable tier. |
| "couldn't evaluate lines that rush 100% completion to enable False Fusion" | There was no False Fusion logic and no delayed-payoff buff model. | Generic active buffs plus a goal-unlock heuristic, surfaced as a `setupFor` hint. |
| "manually using False Fusion changed nothing" | The Rust engine tracked only two hardcoded buff timers. | Generic buffs in both engines. |
| "Disciplined Touch doesn't scale perfection off intensity" | Real bug: it used control. | Fixed against the 0.7.5 tooltip. |
| "ignores harmonious and brilliant conditions" | They were small additive nudges. | Routed through reachable tier. |
| "doesn't stop one action short of finishing; spams perfection with leftover qi" | Terminal states were not modelled. | `willAutoFinish` makes those states terminal. |
| "does it account for stability loss from soulflame triggers?" | It did not — soulflame existed only in a test fixture. | Modelled through the definition-driven buff path, with a runtime-parity test. |
| Praise: "good at juggling Qi Pool and Stability" | — | Protected: the guaranteed survivability floor and its replays are regression assets. |

## Changed

### Harmony (0.7.5 rework)

- Harmony is the **player's choice**, read from live craft state. Item-kind inference is gone, along with the removed `itemTypeToHarmonyType` ModAPI utility.
- All **seven** harmonies are modelled: Forge Works, Alchemical Arts, Inscribed Patterns, Spiritual Resonance, and the new Formless Way, Enhancing Echo and Eccentric Decree.
- Each harmony's **complexity multiplier** scales sublime recipe targets (`0.9x` to `1.5x`), so goals match what the game actually asks for.
- Corrected against the runtime: the Forge heat-1 quirk, and the Spiritual Resonance mismatch penalty being `-9` harmony (the in-game log text saying `-15` is stale).

### Scoring

- The additive weighted scorer is gone. Tier value, the binding-bar gate, bar balance, bonus-roll credit and residual shortfall now compose one conjunctive goal score with documented commensurability: banking a tier always beats margin polish, and dying never beats the progress made on the way there.
- Sublime goals come from real band thresholds instead of cap-derived multipliers, which used to overshoot the true two-band requirement.

### Terminal states

- 0.7.5 has **no manual finish action**; the craft resolves itself. CraftBuddy detects that with the runtime's own predicate and presents it as "will auto-finish". The stale "you can finish crafting now" copy is gone, and auto mode no longer dispatches a synthesized finish — `Wait` is a real technique costing 10 stability, not a finish button.

### Auto mode

- **Coexists with the native crafting auto-use loadout.** When one is active, CraftBuddy stops proposing items the loadout covers, `Full Action Space` degrades to techniques + finish with a visible reason, and techniques are executed through the in-game control so the game's pre-technique hook still applies your pills.
- **Verifies at dispatch time.** Every automated action re-checks the live craft signature — including harmony, harmony subsystem data and the available technique set — immediately before acting. If the craft moved, it recalculates; if the state cannot be read, it pauses and explains instead of guessing.
- A post-consumption settle phase means a pill the game consumed is never mistaken for the technique advancing the craft.

### Panel

- Shows the projected outcome tier against the tier you are aiming at, per-bar band counts with points to the next band, an explicit marker on the bar holding you back, the selected harmony, an auto-finish badge, and a setup note when an action's value is unlocking a gated technique.
- Every number comes from the shared evaluator; the UI contains no thresholds of its own.
- The panel now clamps to the game window height and scrolls instead of running off-screen on short windows.

### Engine

- The Rust engine models the **same action space** as TypeScript: effect trees, generic buffs, mastery, Soulflame, toxicity and pill/reagent actions. Proven by a 129-scenario / 1,417-transition differential corpus, up from 65 / 585.
- **The native policy prior was silently dead on every real craft** — one `null` field (188 of the game's 226 skills carry `mastery: null`) failed the whole payload. Fixed: benchmark runs carrying a native policy went from 0 of 98 to 42 of 98.
- **The recommendation was not deterministic**; a hash-ordered condition merge could flip the policy between identical runs. Fixed and now directly tested.
- Native search is **1.90x faster at an identical search shape**, with byte-identical ranked scores.

## Measured and rejected

Recorded so nobody re-attempts them without new data:

- **Compact Rust state with mutate/undo** — `EngineState::clone` is 4.70% of a transition, so the whole ceiling was under 5%, against a high divergence risk when unwinding harmony, buffs, items and cooldowns. Three measured redundancies were removed instead, for 47.4%.
- **Packed numeric transposition-cache key** — stringified keys measured at 1.0-1.4% of the search budget; the collision risk is unjustified.
- **More MCTS iterations / wider beams** — both measured as net-negative inside a 1-4 s shared budget.

## Known limitations

- Per-harmony item effects (`harmonyAugment`) and craft-result material returns are not modelled: they resolve after the craft and cannot change which action is best this turn.
- One benchmark contract (`user-report-resonance-regression`) still flags a 0.29% ranking tie between two alternatives that are not the recommendation. The resonance model itself is verified byte-for-byte against the runtime.
- Native auto-use slot conditions cannot be evaluated without the game's condition engine, so CraftBuddy assumes a configured slot will fire — the safe direction, since it withholds a duplicate rather than causing one.
- The panel is English-only; localization is a roadmap item.

## Upgrading

No user action is required. Settings, presets and the engine selector are preserved. Replay snapshots exported by 5.x still load — they simply render the pre-6.0 layout, since they carry no outcome projection.
