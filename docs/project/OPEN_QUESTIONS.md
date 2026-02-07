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

- Question: when will game-native availability/final-cost helpers be exposed?
- Why this matters: removes duplicated edge-case logic and reduces drift risk.
- Current handling: internal parity implementation.
- Unblock criteria: API availability + integration cutover.

## Q3: Completion/perfection cap API timeline

- Question: when will max completion/perfection cap getters be exposed?
- Why this matters: cap-aware scoring and gain clamping.
- Current handling: local model without canonical cap getter.
- Unblock criteria: API availability + regression tests.

## Q4: Final post-modifier cost preview helpers

- Question: when will canonical post-modifier pool/stability cost preview helpers be exposed?
- Why this matters: removes uncertainty in modifier stacking/order and improves availability parity.
- Current handling: internal cost modeling and validation tests.
- Unblock criteria: API availability + integration cutover tests.
