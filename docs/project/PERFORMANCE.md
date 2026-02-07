---
title: Performance Guide
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/optimizer/search.ts, src/settings/index.ts
review_cycle_days: 30
related_files:
  - docs/project/OPTIMIZER_DESIGN.md
  - docs/project/ROADMAP.md
---

# Performance Guide

## User-tunable controls

- `lookaheadDepth` (`1-96`, default `32`)
- `searchTimeBudgetMs` (`10-500`, default `200`)
- `searchMaxNodes` (`1,000-100,000`, default `100,000`)
- `searchBeamWidth` (`3-15`, default `6`)

## Internal search defaults

- iterative deepening: enabled
- adaptive beam width: enabled
- condition branching beyond forecast: enabled
- branch limit: `2`
- branch min probability: `0.15`

## Cost/quality tuning order

1. raise `searchMaxNodes`
2. raise `lookaheadDepth`
3. adjust `searchBeamWidth`
4. raise `searchTimeBudgetMs` only as needed

## Long-craft guidance (~90 turns)

- increase depth gradually and validate responsiveness
- avoid maxing depth + beam simultaneously on slower machines
- prefer keeping time budget bounded for UI responsiveness
