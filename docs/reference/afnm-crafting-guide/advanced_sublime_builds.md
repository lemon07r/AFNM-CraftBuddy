---
title: Advanced Sublime Builds & Infinite Crafting
status: active
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-03-20
source_of_truth: community guide distillation cross-checked against installed runtime 0.6.45-d06ab6d
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
  - docs/reference/afnm-crafting-guide/agent_considerations.md
---

# Advanced Sublime Builds & Infinite Crafting

This note mixes two kinds of information:

- installed-runtime-verified action facts
- guide-reported rotations and loadout ideas from players

Treat the second category as hypothesis/input only. Do not turn guide thresholds or opener sequences into optimizer heuristics without reproducing them in code/tests first.

## Runtime-Verified Action Facts

- **Controlled Forging** grants a stack buff with `+20%` `successChanceBonus`. Its stacks are consumed only on fusion/refine actions.
- **Skillful Manipulation** and **Resourceful Manipulation** each create `10` stacks of a `75%` stability/pool cost multiplier buff. Their stacks are consumed only on fusion/refine actions.
- **Controlled Chaos** creates `5` stacks of a `25%` stability cost multiplier buff. Its stack-loss effect lives on the buff's generic `effects` block, so it ticks down on any action.
- **Focus** (`10` pool, `1` stability) and **Minute Repairs** (`26` pool, `0` stability) both set `noMaxStabilityLoss: true`.
- **Focused Stabilization** consumes all Focus, restores `5` stability per Focus stack, and restores `2` max stability.
- **Focused Opposition** consumes `3` Focus and restores `13%` of current `maxpool`.
- **Brilliant Respite** requires `veryPositive` and restores `20%` of current `maxpool`.
- **Restoring Brilliance** requires `veryPositive`, restores `25` stability, and restores `1` max stability.
- **Fairy's Blessing** restores `50%` of current `maxpool`.
- **Harmonious Expansion** adds `+5% maxpool` per stack and also sets `poolCostPercentage` to `100 - 5 * stacks`.

## Guide-Reported Rotation Ideas

### Early Sublime Setup

- Player guides recommend front-loading success/cost buffs such as **Efficient Fusion**, **Controlled Forging**, and **Skillful Manipulation** before leaning on low-base-success explosive or unstable actions.
- The reagent/cauldron/mastery-slot advice from those guides is useful player context, but it is not runtime authority and should not be copied directly into optimizer scoring.

### Infinite-Loop Families

- Guides describe support-spam loops built around no-max-stability-loss actions like **Focus** and **Minute Repairs** to farm Focus/Harmony windows.
- They also describe cash-out loops that convert enlarged max-pool states into qi via **Focused Opposition**, **Brilliant Respite**, and **Fairy's Blessing**.
- Exact break-even thresholds from guides are snapshot-dependent. They move with current buff stacks, mastery upgrades, and live max-pool modifiers.

## Optimizer Implications

- Cost-percentage buffs need sequential multiplicative application with flooring after each buff, matching runtime.
- Max-pool-changing buffs matter twice: they alter both `% of max pool` restore amounts and the effective qi cap.
- Support actions with `noMaxStabilityLoss` are legitimate bridge actions in sublime loops and should be evaluated, not hard-filtered.
