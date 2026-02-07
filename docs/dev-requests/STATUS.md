---
title: API Request Status
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: docs/dev-requests/API_EXPOSURE_REQUESTS.md
review_cycle_days: 14
related_files:
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
  - docs/project/ROADMAP.md
---

# API Request Status

## Snapshot

| Request | Status | Last Verified | Next Follow-Up | Branch Impact |
|---|---|---|---|---|
| Game-native scaling evaluator | Pending | 2026-02-07 | Ask release window | Keep internal evaluator; prepare cutover wrapper |
| Game-native overcrit helper | Pending | 2026-02-07 | Ask release window | Keep internal overcrit EV helper |
| Game-native action availability precheck | Pending | 2026-02-07 | Ask release window | Keep internal `canApplySkill` path |
| Completion/perfection cap getters | Pending | 2026-02-07 | Ask release window | Caps remain locally modeled |
| Finalized post-modifier cost preview helpers | Pending | 2026-02-07 | Ask release window | Keep internal cost-order/parity checks |
| Harmony state/config data | Available | 2026-02-07 | None | Integrated into optimizer simulation |
| Buff definitions/effects payloads | Available | 2026-02-07 | None | Integrated into buff simulation |
| Condition effect payloads | Available | 2026-02-07 | None | Integrated into condition handling |
| Stable completion-bonus identifier | Unknown | 2026-02-07 | Ask explicit key/field guidance | Remains open reliability question |

## Developer follow-up packet

1. Request timeline for the four pending high-impact APIs.
2. Ask for stable completion-bonus identifier/key.
3. Ask whether final post-modifier cost preview helpers can be exposed.

## Update rule

Whenever developer feedback arrives:

- update `Last Verified`
- update `Next Follow-Up`
- update status text in this file and `API_EXPOSURE_REQUESTS.md` if scope changed
