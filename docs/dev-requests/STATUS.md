---
title: API Request Status
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-20
source_of_truth: docs/dev-requests/API_EXPOSURE_REQUESTS.md
review_cycle_days: 14
related_files:
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
  - docs/project/ROADMAP.md
---

# API Request Status

## Status snapshot

| Request | Status | Notes |
| --- | --- | --- |
| Game-native scaling evaluator | Available (`afnm-types@0.6.45`) | Not wired into optimizer search; local evaluator remains authoritative because the live provider is not hypothetical-state-safe |
| Game-native overcrit helper | Available (`afnm-types@0.6.45`) | Native provider wired with EV-preserving fallback |
| Game-native action availability precheck | Available (`afnm-types@0.6.45`) | All-depth native precheck wired with local fallback on errors |
| Completion/perfection cap getters | Available (`afnm-types@0.6.45`) | ModAPI cap getters wired in integration with heuristic fallback |
| Finalized post-modifier cost preview helpers | **Pending** | Internal runtime cost modeling + cost-order/parity checks active |
| Harmony state/config data | Available | Integrated into optimizer simulation |
| Buff definitions/effects payloads | Available | Integrated into buff simulation |
| Condition effect payloads | Available | Integrated into condition handling |
| Condition transition (`getNextCondition`) | Available (`afnm-types@0.6.45`) | Primary wiring now uses `modAPI.utils.getNextCondition`; legacy fallback probing remains for older runtimes |
| Technique upgrade helper | Investigating (`afnm-types@0.6.45`) | `modAPI.utils.craftingTechniqueFromKnown` is documented, but live-technique conversion still lacks a strict known-technique mapping |
| Stable completion-bonus identifier | Available (`afnm-types@0.6.45`) | Wired via `modAPI.utils.completionBonusBuffName` with heuristic fallback |

## Open questions (dependency-gated)

These unresolved questions block specific improvements:

**Q1: Native precheck rollback thresholds** — What disagreement/error thresholds should trigger automatic rollback from all-depth native `canUseAction` enforcement? Current: native all-depth precheck with native-variable seeding + local fallback on failures. Unblock: finalize release gate thresholds.

**Q2: Cap getter retirement** — When should heuristic cap extraction be fully retired? Current: native cap getter path with local extraction fallback. Unblock: one stable release with no native cap regressions.

**Q3: Post-modifier cost preview helpers** — When will canonical post-modifier pool/stability cost preview helpers be exposed? Current: internal runtime cost modeling with parity checks. Unblock: API availability + integration cutover tests.

## Developer follow-up packet

1. Request timeline for finalized post-modifier cost preview helpers.
2. Confirm whether a direct live-technique upgrade helper is planned beyond `craftingTechniqueFromKnown`.

## Update rule

When developer feedback arrives: update status here and in `API_EXPOSURE_REQUESTS.md` if scope changed.
