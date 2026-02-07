---
title: Engineering Decisions
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: src/optimizer/*, src/modContent/index.ts
review_cycle_days: 45
related_files:
  - docs/project/ARCHITECTURE.md
  - docs/project/ROADMAP.md
---

# Engineering Decisions

## D-001: Optimizer core remains pure

- Decision: keep simulation and search in `src/optimizer/*` pure/testable.
- Rationale: deterministic validation and lower integration coupling.

## D-002: Expected-value modeling over stochastic rollout

- Decision: use EV for success/crit and future-condition branching.
- Rationale: stable quality with bounded runtime cost.

## D-003: Integration fallback isolation

- Decision: all fallback extraction stays in `src/modContent/index.ts`.
- Rationale: single drift boundary and clearer parity auditing.

## D-004: API exposure as feature gates

- Decision: keep internal implementations until game-native APIs are available.
- Rationale: preserve functionality while allowing clean cutover path.

## D-005: Reference corpus remains non-authoritative and curated

- Decision: keep only a curated AFNM reference subset under `docs/reference/`, with full snapshot retained in `archive/`.
- Rationale: reduce active context noise while preserving traceability.

## D-006: Docs quality checks are required

- Decision: enforce links/freshness/authority checks in docs workflow.
- Rationale: avoid stale claims and navigation breakage.
