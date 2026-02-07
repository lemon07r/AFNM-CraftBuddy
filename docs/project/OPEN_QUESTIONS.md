---
title: Open Questions
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: docs/dev-requests/STATUS.md, src/modContent/index.ts
review_cycle_days: 14
related_files:
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
  - docs/project/ROADMAP.md
---

# Open Questions

## Q1: Stable completion-bonus identifier

- Question: is the completion-bonus buff key/name stable across versions and locales?
- Why this matters: reliable completion bonus extraction.
- Current handling: buff-first extraction with computed fallback only when buff is unavailable.
- Unblock criteria: optional; explicit key/field would reduce diagnostics noise, but no longer blocks parity.

## Q2: Canonical availability/cost hooks

- Question: what disagreement/error thresholds should trigger automatic rollback from all-depth native `canUseAction` enforcement?
- Why this matters: removes duplicated edge-case logic and reduces drift risk.
- Current handling: native all-depth precheck with native-variable seeding/propagation + local fallback on failures.
- Unblock criteria: finalize release gate thresholds for fallback retirement and rollback alarms.

## Q3: Completion/perfection cap API timeline

- Question: when should heuristic cap extraction be fully retired in favor of native cap getters?
- Why this matters: cap-aware scoring and gain clamping.
- Current handling: native cap getter path with local extraction fallback.
- Unblock criteria: one stable release with no native cap regressions.

## Q4: Final post-modifier cost preview helpers

- Question: when will canonical post-modifier pool/stability cost preview helpers be exposed?
- Why this matters: removes uncertainty in modifier stacking/order and improves availability parity.
- Current handling: internal cost modeling and validation tests.
- Unblock criteria: API availability + integration cutover tests.
