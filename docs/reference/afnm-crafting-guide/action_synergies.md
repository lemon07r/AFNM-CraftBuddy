---
title: Action Synergies & Optimization Loops
status: active
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-03-20
source_of_truth: docs/reference/afnm-crafting-guide/action_synergies.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
---

# Action Synergies & Optimization Loops

Optimizing crafts in AFNM relies heavily on exploiting interaction loops between specific actions, states, and buff modifiers. Simulators must accurately model these loops to find optimal sequences.

## 1. Resource Cost Halving

Certain actions exist entirely to set up heavy, expensive actions:

- **`Efficient Fusion`**: Cuts the Qi Pool cost of the _next_ action by 50%. Essential before expensive stabilize actions like `Forceful Stabilize` or Insight-heavy actions.
- **`Stabilizing Refinement`**: Cuts the Stability cost of the _next_ action by 50%. Essential before using Golden Path actions (which inherently cost high stability).

## 2. Golden Path Mechanics

The Golden Path buffs radically alter resource economy.

- **First Peak:** Base effect restores 7 Qi on Refine actions. Mastery upgrades can raise that further.
- **Second Peak:** Restores 5 Stability on Stabilize actions. This turns cheap, low-yield stabilize actions (like `Harmonious Stabilize` or `Restoring Brilliance`) into massive net-positive stability generators.
- **Third Peak:** Increases Perfection on Support actions.
- **Fourth Peak:** Grants +15% Qi Control for every 100% Completion achieved.

## 3. Crafting Conditions Dependent Actions

Actions that check the current crafting condition (Balanced, Harmonious, Brilliant, Resistant, Corrupted).

- **`Harmonious Stabilize`**: Restores 20 Stability for very low cost when in Harmonious.
- **`Restoring Brilliance`**: Restores 25 Stability when in Brilliant.
- _Optimizer Note:_ The simulator's condition transition provider (`getNextCondition` path probing) must accurately project future states so the AI can queue these condition-dependent actions exactly when the state aligns.

## 4. Insight and Focus Mechanics

- **Insight:** Progressively buffs Qi Control based on the number of Refine actions used, but _increases_ the Qi cost of all actions.
  - **Loop:** Pair with `Golden Path: First Peak` (base +7 Qi on Refine, higher with mastery) and `Efficient Fusion` to offset the massive Qi drain.
  - **Cash Out:** Use `Insightful Restoration` at the end of a chain. It consumes all Insight stacks to restore **+20 Qi per stack**.
- **Focus:** Gather focus via Support actions, then spend it.
  - **`Focused Recirculation`**: Costs 0 Qi, 5 Stability, and 2 Focus; restores up to 50 Qi based on completion.
  - **`Focused Stabilization`**: Very cheap stabilize action that also restores maximum stability. Highly synergistic with `Golden Path: Second Peak`.

## 5. Pressure and Risky Actions

- **Pressure (`Pressurized Forging`):** Accumulates stacks over time, buffing both Intensity and Control. However, it increases the Stability cost of all actions.
- **Risky Actions:** Have extremely high scaling but low base success rates.
  - **Loop:** Use `Blessed Reagent` (+7% chance) + `Harmonious Precision` (+5% chance per use) to artificially push risky actions to 100% success rate while massively boosting crit chance.
