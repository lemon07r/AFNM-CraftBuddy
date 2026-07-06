---
title: Roadmap
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-06
source_of_truth: src/optimizer/*, src/modContent/index.ts, docs/dev-requests/STATUS.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
  - docs/dev-requests/STATUS.md
---

# Roadmap

## Active priorities

### P1: Native API cutover

- keep native overcrit/all-depth can-use-action precheck path enabled with fallback
- keep guarded native condition-transition provider enabled with fallback
- keep the root-state ModAPI path (`subscribe` / `getGameStateSnapshot`) as the primary store/session source; treat DOM/fiber probing as fallback only
- require a documented pure hypothetical-state scaling contract before reconsidering native scaling in search
- switch to game-native finalized post-modifier cost helpers when exposed
- validate all-depth native precheck parity in live crafts
- retire fallback only after one full release proves stable
- see `docs/dev-requests/STATUS.md` for API status and open questions

### P2: Localization and UI-host migration

- keep the current locale-safe root-state craft visibility path as the primary fix for non-English clients
- adopt `injectUI` when it can replace the manual overlay container without losing layout control
- add CraftBuddy-owned translations via ModAPI instead of shipping English-only panel copy
- evaluate `onReduxAction` as a replacement for some polling/manual transition observation once action contracts are documented

### P3: Cap-aware scoring and gains

- keep native max completion/perfection getter path enabled with fallback
- clamp/score with canonical caps
- acceptance: cap regression tests prove no-value overshoot is de-prioritized

### P4: Item action expansion hardening

- broaden item action normalization
- add mixed technique+item sequence regression tests
- acceptance: deterministic recommendations in representative item-enabled scenarios

### P5: Integration observability

- add structured diagnostics for fallback path usage
- track native precheck call/block/error counters and condition-provider fallback rates
- surface missing-field counters for faster breakage triage after game updates
- acceptance: debug output identifies fallback reliance by category

## Deferred by design

- aggressive heuristic features outside game-aligned behavior
- removal of all fallbacks before native API path is proven stable
