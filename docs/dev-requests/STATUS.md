---
title: API Request Status
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-27
source_of_truth: docs/dev-requests/API_EXPOSURE_REQUESTS.md
review_cycle_days: 30
related_files:
  - docs/dev-requests/API_EXPOSURE_REQUESTS.md
  - docs/project/ROADMAP.md
  - docs/project/INTEGRATION_MODAPI.md
  - docs/project/RUNTIME_EVIDENCE.md
---

# API Request Status

Verified against the installed AFNM **0.7.6** runtime (`0.7.6-7c586da`). Extraction details are in `docs/project/RUNTIME_EVIDENCE.md`.

## 0.7.6 API changes

| Change | Effect on CraftBuddy |
| --- | --- |
| `gameData.buffs` buff registry | **Available, not adopted.** CraftBuddy hydrates buff definitions from the live skill and craft payloads, which already covers every buff it simulates. |
| `getCoreFormationAltarStats` | **Available, not adopted.** Present in the 0.7.6 bundle and absent from 0.7.5; unrelated to crafting. |
| Buff-interceptor stat filters | **Available, not adopted.** CraftBuddy observes state rather than intercepting it. |
| Crafting loadouts now name their paired auto-use loadout (`craftingLoadout.craftingAutoUseLoadoutId`) | No change needed: the game resolves the pairing before CraftBuddy reads `currentCraftingAutoUseLoadout`. |
| New `(This Effect)` self-reference auto-use slot condition | Unmodelled; falls to the conservative "will fire" default in `src/modContent/nativeAutoUse.ts`, which withholds a duplicate rather than causing one. Strengthens follow-up request 3 at the end of this document. |
| `afnm-types` `0.7.6` | Pinned in `package.json`. |

The Eccentric Decree per-bar-change hook and the Fallen Soulflame re-balance are mechanics changes, not API changes; see `docs/project/MECHANICS_PARITY.md`.

## 0.7.5 API changes (still in force)

| Change | Effect on CraftBuddy |
| --- | --- |
| `modAPI.gameData.itemTypeToHarmonyType` **removed** | No longer needed: harmony is a player selection read from live craft state. All references were deleted; no replacement heuristic is allowed. The runtime oracle still reports `hasItemTypeToHarmonyType: false` on 0.7.6. |
| Harmony types extended to seven, each with a complexity multiplier | Modelled in `src/optimizer/harmonyRegistry.ts`. Multipliers re-verified as unchanged in 0.7.6. |
| Native crafting auto-use loadout (`player.player.currentCraftingAutoUseLoadout`, `storedCraftingAutoUseLoadouts`) | Read-only consumer. CraftBuddy detects it and steps back from item consumption; no API request needed. The read path is structurally unchanged in 0.7.6. |
| No manual finish action; craft auto-resolves | Terminal handling moved to `willAutoFinish`. |

## Status snapshot

| Request | Status | Notes |
| --- | --- | --- |
| Game-native scaling evaluator | Available | Not wired into optimizer search; local evaluator remains authoritative because the live provider is not hypothetical-state-safe |
| Game-native overcrit helper | Available | Native provider wired with EV-preserving fallback |
| Game-native action availability precheck | Available | All-depth native precheck wired with local fallback on errors |
| Completion/perfection cap getters | Available | ModAPI cap getters wired in integration with heuristic fallback |
| Root-state subscribe/snapshot APIs | Available | `window.modAPI.subscribe(...)` / `getGameStateSnapshot()` are now the primary crafting-session/store path |
| UI injection host | Available | Not adopted yet; candidate replacement for the manual overlay container |
| Redux action hook (`onReduxAction`) | Available | Not adopted; `subscribe()` + snapshots remain the recommended state-observation path |
| Redux payload interceptor (`onReduxActionPayload`) | Available | Intercepts/modifies action payloads before reducer. Not adopted; not needed for CraftBuddy's read-only observation pattern |
| Native action cost preview (`getActionCost`) | Available | Native post-modifier action cost preview |
| Native condition evaluator (`evaluateCraftingCondition`) | Available | Native crafting condition evaluation |
| Native stat resolver (`getActualCraftingStat`) | Available | Native crafting stat resolution |
| Translation utils (`t`/`tPlural`/`tr`) | Available | Runtime i18n helpers. Not adopted; CraftBuddy UI is English-only |
| Save/load APIs (`makeSave`/`loadSave`/`listSaves`) | Available | Character-scoped backup saves. Not relevant for crafting optimizer |
| GameIconButton `tooltip` prop | Available | Native tooltip on game icon buttons. CraftBuddy uses MUI Tooltip directly instead |
| Finalized post-modifier cost preview helpers | **Pending** | Internal runtime cost modeling + cost-order/parity checks active |
| Harmony state/config data | Available | Integrated into optimizer simulation |
| Buff definitions/effects payloads | Available | Integrated into buff simulation |
| Condition effect payloads | Available | Integrated into condition handling |
| Condition transition (`getNextCondition`) | Available | Primary wiring now uses `modAPI.utils.getNextCondition`; legacy fallback probing remains for older runtimes |
| Technique resolution via known-technique name matching | Available | Primary wiring now matches live `CraftingTechnique.name` to `player.player.craftingTechniques[*].technique` and resolves via `modAPI.utils.craftingTechniqueFromKnown`, with live fallback for missing matches |
| Stable completion-bonus identifier | Available | Wired via `modAPI.utils.completionBonusBuffName` with heuristic fallback |
| Max toxicity getter (`getMaxToxicity`) | Available | Wired for alchemy crafts |
| Item type → harmony type mapping utility | **Removed in 0.7.5** | Correctly obsolete; harmony is player-selected |
| Crafting auto-use loadout state | Available | Read defensively in `src/modContent/nativeAutoUse.ts`; drives the item-policy downgrade |

## Open questions (dependency-gated)

These unresolved questions block specific improvements:

**Q1: Native precheck rollback thresholds** — What disagreement/error thresholds should trigger automatic rollback from all-depth native `canUseAction` enforcement? Current: native all-depth precheck with native-variable seeding + local fallback on failures. Unblock: finalize release gate thresholds.

**Q2: Cap getter retirement** — When should heuristic cap extraction be fully retired? Current: native cap getter path with local extraction fallback. Unblock: one stable release with no native cap regressions.

**Q3: Post-modifier cost preview helpers** — When will canonical post-modifier pool/stability cost preview helpers be exposed? Current: internal runtime cost modeling with parity checks. Unblock: API availability + integration cutover tests.

## Developer follow-up packet

1. Request timeline for finalized post-modifier cost preview helpers.
2. Request docs that `CraftingTechnique.name` is a stable, non-localized canonical key matching `KnownCraftingTechnique.technique` and `modAPI.gameData.craftingTechniques`.
3. Request a documented, stable shape for crafting auto-use slots (condition group, `maxCount`, item reference) so `projectNativeAutoUse` can evaluate slot conditions instead of conservatively assuming they fire.

## Update rule

When developer feedback arrives: update status here and in `API_EXPOSURE_REQUESTS.md` if scope changed.
