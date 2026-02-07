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
| Game-native scaling evaluator | Available (`afnm-types@0.6.38`) | 2026-02-07 | None | Native provider wired with local fallback in `gameTypes` |
| Game-native overcrit helper | Available (`afnm-types@0.6.38`) | 2026-02-07 | None | Native provider wired with EV-preserving fallback in `gameTypes` |
| Game-native action availability precheck | Available (`afnm-types@0.6.38`) | 2026-02-07 | Monitor disagreement/error rates for fallback retirement | All-depth native precheck wired with local fallback on errors |
| Completion/perfection cap getters | Available (`afnm-types@0.6.38`) | 2026-02-07 | Observe cap parity over live crafts | ModAPI cap getters wired in integration with heuristic fallback |
| Finalized post-modifier cost preview helpers | Pending | 2026-02-07 | Ask release window | Keep internal cost-order/parity checks |
| Harmony state/config data | Available | 2026-02-07 | None | Integrated into optimizer simulation |
| Buff definitions/effects payloads | Available | 2026-02-07 | None | Integrated into buff simulation |
| Condition effect payloads | Available | 2026-02-07 | None | Integrated into condition handling |
| Condition transition entrypoint (`Store/turn handling/getNextCondition`) | Guarded Path Wired | 2026-02-07 | Confirm documented stable symbol/path | Guarded provider path active with local EV fallback |
| Technique upgrade helper (returns new technique) | Announced | 2026-02-07 | Wire to documented ModAPI symbol when published | Local mastery-upgrade evaluator remains default |
| Stable completion-bonus identifier | Deferred (Low Risk) | 2026-02-07 | Optional follow-up only | Buff-first extraction now primary path |

## Developer follow-up packet

1. Request timeline for the remaining pending API:
   - finalized post-modifier cost preview helpers
2. Capture final ModAPI symbol/path and signatures for:
   - `getNextCondition`
3. Confirm whether a documented technique-upgrade helper symbol should replace path probing.

## Update rule

Whenever developer feedback arrives:

- update `Last Verified`
- update `Next Follow-Up`
- update status text in this file and `API_EXPOSURE_REQUESTS.md` if scope changed
