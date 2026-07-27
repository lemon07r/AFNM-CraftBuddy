---
title: Roadmap
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-27
source_of_truth: src/optimizer/*, src/modContent/*, docs/dev-requests/STATUS.md, docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md
  - docs/dev-requests/STATUS.md
---

# Roadmap

Priorities against the current target, AFNM **0.7.6**. Anything the 0.7.5 rework settled is recorded in `docs/project/OPTIMIZER_NEXT_STEPS_HANDOFF.md` and is not a roadmap item.

## Active priorities

### P1: Accuracy evidence, not accuracy guesses

- grow the replay corpus with real high-realm and sublime snapshots, especially for `formless`, `enhancingEcho` and `eccentricDecree` — the last of these is now the most valuable, since 0.7.6 made its scoring per bar application and no exported fixture exercises that yet
- add a benchmark contract per new fixture, then compare against the player's stated rationale before touching search
- keep `bun run optimizer:bench` and the differential corpus green; a contract change needs recorded runtime evidence
- acceptance: a reported bad recommendation can be reproduced from a checked-in fixture rather than argued about

### P2: Native API cutover

- keep the native overcrit, all-depth `canUseAction`, condition-transition, cap getter and cost-preview paths enabled **with** their fallbacks
- adopt game-native finalized post-modifier cost helpers when exposed
- require a documented pure hypothetical-state scaling contract before reconsidering native scaling inside search
- retire a fallback only after one full release proves the native path stable
- see `docs/dev-requests/STATUS.md` for API status and open questions

### P3: Localization and UI host

- keep the locale-safe root-state craft-visibility path as the primary fix for non-English clients
- adopt `injectUI` when it can replace the manual overlay container without losing layout control
- ship CraftBuddy-owned translations through `actions.addTranslation` instead of English-only panel copy

### P4: Auto-mode confidence

- extend coexistence coverage as the game's auto-use system evolves (loadout switching mid-craft, new slot condition forms such as 0.7.6's `(This Effect)` self-reference)
- surface why automation paused or recalculated in the panel, so a pause reads as a decision rather than a stall
- acceptance: no automated dispatch can be traced to state the executor did not verify

### P5: Integration observability

- structured diagnostics for fallback-path usage, native precheck call/block/error counters, and condition-provider fallback rates
- missing-field counters so a game update's breakage is triaged from output rather than by reading code
- acceptance: debug output identifies fallback reliance by category

## Deferred by design

- heuristic features that are not grounded in game behaviour
- removing fallbacks before the native path is proven over a release
- modelling post-craft outcomes (per-harmony `harmonyAugment` effects, material returns): they cannot change which action is best this turn
- combat-side systems, including the combat auto-use path
