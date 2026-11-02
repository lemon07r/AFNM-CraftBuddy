---
title: Release Notes 6.9.0
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.19-ac29603
last_verified: 2026-11-02
source_of_truth: package.json, src/optimizer/*, src/modContent/*, crates/craftbuddy-engine/*, scripts/installed-game-runtime.js, scripts/optimizer/benchmark-engines.ts
review_cycle_days: 90
related_files:
  - CHANGELOG.md
  - docs/project/RELEASE_NOTES_6.8.0.md
  - docs/project/RUNTIME_EVIDENCE.md
  - docs/project/MECHANICS_PARITY.md
  - docs/project/WORKSHOP_DESCRIPTION.md
  - docs/project/RELEASE_PROCESS.md
---

# Release Notes 6.9.0

CraftBuddy 6.9.0 targets **AFNM 0.7.19-ac29603** with **afnm-types 0.7.19**.
This retarget carries focused recommendation and integration fixes reported
in [issue #3](https://github.com/lemon07r/AFNM-CraftBuddy/issues/3) by
**PommesMitChips**, not a scoring redesign. No scoring constants or benchmark
contracts changed.

## Changed

- **Correct auto-finish:** both engines now end only on stability <= 0 or both
  actual bar caps. The five-completion-band shortcut was a pre-existing
  mismatch, not a new 0.7.19 mechanic; runtime evidence §18.4 supersedes §12.5.
- **Keep ambition through craft end:** every terminal score honors Perfection
  Band Goal and Completion Band Ceiling. Changing either, or Push Extra Bands,
  marks recommendations stale and changes the cross-step score-cache scope.
- **Prefer secured routes:** techniques whose failure ends below target are
  flagged as requiring probabilistic survival. Worker-partition merging keeps
  survival precedence before score rather than promoting a higher-EV gamble.
- **Respect native auto-use state:** a disabled crafting auto-use toggle makes
  the configured loadout inactive; the live revision signature reads consumed
  pills from the crafting state, not progress state.
- **Preserve release history:** superseded notes are historical and no longer
  expire under the docs freshness check; their dates and narrative stay intact.
- The constrained stochastic planner from PR #4 is **not shipped**. Under the
  same replay budgets its production path reached depth 1–2 versus main's
  4–30, returned no recommendation on two user-report fixtures with incomplete
  buff definitions, overran a 1 s budget to about 9.9 s, and failed four
  forge-heat contracts. Targeted fixes from its report were ported instead.

## Runtime audit

`RUNTIME_EVIDENCE.md` §18 records the bundle identity and byte anchors. The
recorded §14–§17 crafting phases, costs, buffs, harmonies, conditions, outcomes
and droplets remain present. Crafting declarations are unchanged from 0.7.17.
Shared expression text-to-number hardening has no established stock crafting
divergence. Combat barrier debt does not affect crafting droplets. Practice
prep gains the normal loadout selector; additive reharmonizing hooks are
equipment-only and need no CraftBuddy adoption.

This is a static audit, not a direct 0.7.17 bundle diff, exhaustive parity
certification or live game UI test.

## Validation

- `bun run release:validate`: **passed** — strict TypeScript, **991 Jest tests /
  39 suites**, production build/package (6.9.0, five zip entries), docs links,
  freshness and authority over 64 Markdown files.
- Rust: **91 passed / 3 intentionally ignored** profiling harnesses.
- Benchmark: **105 contracts passed / 0 failed / 7 uncontracted**.
- Differential corpus: **177 scenarios / 1,554 cases unchanged**, including
  1,352 legal transitions and 202 rejected actions.

## Known limitations

- **Survivability-floor payment phases remain incomplete:** the separate helper
  computes payment before buff consumption and omits effect masteries. Its
  stability can disagree with the real transition (1 vs 0, or 0 vs 16). The new
  fatal-failure check does not fix that helper.
- Existing `modifyBuffGroup`, companion interceptors/stability-loss prevention
  and technique-level triggered-effect gaps remain; they predate this retarget.
  Discordance fallback ordering, Decree EV/mid-technique approximations and
  future chance-buff state are also unchanged; see `MECHANICS_PARITY.md`.
- Hidden RNG, post-craft item effects/material returns and machine-independent
  search depth are not promised. No live game UI smoke test is claimed.

## Upgrading

Replace the installed mod zip or update through Workshop after publication.
No settings reset is required. Package and UI harness versions are 6.9.0.
