---
title: Roadmap
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/optimizer/*, src/modContent/index.ts, docs/dev-requests/STATUS.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
  - docs/project/OPEN_QUESTIONS.md
---

# Roadmap

## Completed in current branch line

- harmony simulation integrated in runtime path
- buff per-turn + action-specific effect execution integrated
- mastery upgrade handling integrated
- training-mode-aware scoring integrated
- probabilistic condition branching beyond forecast integrated
- legacy compatibility cleanup completed

## Active priorities

### P1: Native API cutover

- keep native scaling/overcrit/all-depth can-use-action precheck path enabled with fallback
- keep guarded native condition-transition provider enabled with fallback
- switch to game-native finalized post-modifier cost helpers when exposed
- validate all-depth native precheck parity in live crafts
- retire fallback only after one full release proves stable

### P2: Cap-aware scoring and gains

- keep native max completion/perfection getter path enabled with fallback
- clamp/score with canonical caps
- acceptance: cap regression tests prove no-value overshoot is de-prioritized

### P3: Item action expansion hardening

- broaden item action normalization
- add mixed technique+item sequence regression tests
- acceptance: deterministic recommendations in representative item-enabled scenarios

### P4: Integration observability

- add structured diagnostics for fallback path usage
- track native precheck call/block/error counters and condition-provider fallback rates
- surface missing-field counters for faster breakage triage after game updates
- acceptance: debug output identifies fallback reliance by category

## Deferred by design

- aggressive heuristic features outside game-aligned behavior
- removal of all fallbacks before native API path is proven stable
