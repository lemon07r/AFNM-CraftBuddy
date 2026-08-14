---
title: Release Notes 6.3.1
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.8-24a8210
last_verified: 2026-08-14
source_of_truth: git history on main, package.json, src/optimizer/search.ts, src/optimizer/outcome.ts, crates/craftbuddy-engine/src/outcome.rs
review_cycle_days: 90
related_files:
  - docs/project/RELEASE_NOTES_6.3.0.md
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/RELEASE_PROCESS.md
---

# Release Notes 6.3.1

CraftBuddy 6.3.1 fixes the "stuck at 200%" endgame: on crafts that can
overcraft, the optimizer could end the craft early with a zero-gain action
instead of pushing deeper into the bonus bands. A player snapshot
(`user-report-overcraft-endgame`) pinned the bug; the fixed search now finds
a strictly better line on that exact craft, banking roughly 2.4k more
perfection.

## Fixed

### Craft-ending actions no longer tie at one identical score

- Once the target tier was secured, terminal scoring only counted **full**
  extra bands. Every craft-ending action that didn't cross a whole band
  boundary scored bit-identically, and the tie-breakers (lower qi spent,
  then the MCTS prior's resource nudge) preferred the cheapest ender — even
  a support action with zero direct gains over a refine banking most of the
  next band.
- Terminal scoring now prices each bar's craft-end **bonus-roll fraction** as
  expected value, which is exactly what the game rolls when the craft
  finishes. The Rust engine already evaluated finished crafts this way (it
  enumerates the roll branches), so this also restores parity between the
  two engines at terminal states.
- Tier gating is unchanged: extras still count only after the tier is
  secured on guaranteed bands, so a tempting fraction can never make an
  early finish outrank a line that still secures the tier. Live (mid-search)
  scoring stays guaranteed-band-only, where fractional noise measurably hurt
  strategy.

### Overcraft extras are bounded by the real bar clamp

- The game clamps both bars at the finish flats, so overshoot past the flat
  is unbankable. Extras are now capped at the flat's band count even when
  the game exposes no explicit cap (previously such configs were treated as
  uncapped), mirrored in the Rust engine's `build_outcome_bands`.

### Gain previews and reasoning tell the truth on proc plays

- Expected completion/perfection gains are now read from the simulated
  post-action state, so triggered buff procs count (previously a proc-driven
  play such as Golden Path's Third Peak trigger displayed "+0" gains).
  Stability stays on the direct readout.
- A craft-ending action's reasoning now says it ends the craft instead of
  advertising buffs "for next turns" that will never happen.

## Notes for players

The in-game bar percentage is not linear: it floors the guaranteed bands
plus the bonus-roll chance, and each band costs 1.3x the previous one. The
sublime gate (2 bands) displays as ~200%, so pushing maximum perfection past
it shows as slow, sub-100% creep even when every action is gaining value.
After this fix the optimizer prices that creep correctly at craft end.
