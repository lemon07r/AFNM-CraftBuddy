---
title: Sublime Crafting Harmonies
status: active
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-03-07
source_of_truth: docs/reference/afnm-crafting-guide/harmonies.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
---

# Sublime Crafting Harmonies

Sublime Crafting introduces minigame rules based on the "Harmony Type" of the recipe being crafted. When simulating crafting, the optimizer MUST accurately apply the buffs and penalties triggered by these sub-systems.

## 1. Spiritual Resonance (Elixir, Pill, Reagent)
*Rewards chaining the exact same action type (color). Punishes alternating.*

- **Mechanic:** The first action sets the resonance color. Repeating the same action type increments the resonance counter.
- **Buff:** High stacks grant Harmony and stacking Crit/Success Chance bonuses.
- **Penalty:** Using a *different* action type lowers the counter by 1, instantly consumes **3 Stability**, and reduces Harmony.
- **State Transition:** The resonance target color changes if you use a new action type **twice** in a row.
  - *Optimizer Note:* The lookahead search must be aware that an accidental transition (e.g., Support -> Stabilize -> Stabilize) will shift the resonance goal.

## 2. Alchemical Arts
*Requires matching specific combinations of 3 colors.*

- **Mechanic:** Every 3 actions, the combination of colors used is checked against a list of "working reactions".
- **Buff:** Valid sequences grant bonuses to the *next* action.
- **Penalty:** Invalid sequences cause a loss of Harmony and apply a **Qi Control penalty** to the next action.
- **Ordering:** The order of the 3 actions within a set does NOT matter (e.g., `Yellow -> Green -> Blue` triggers the same reaction as `Blue -> Green -> Yellow`).

## 3. Forge Works (Cauldrons and Artefacts)
*Heat gauge management.*

- **Mechanic:** The furnace starts cold (Heat = 0). The goal is to keep the heat within the "Sweet Spot" (Heat values between 4 and 6).
- **Controls:**
  - **Fusion (Green)** actions *increase* Heat.
  - **Refine (Blue)**, **Support (Purple)**, and **Stabilize (Yellow)** actions *decrease* or maintain Heat (relative to the cooling per turn).
- **Buff:** Maintaining the Sweet Spot grants bonus **Qi Intensity** for Fusion actions and **Qi Control** for Refine actions.
- **Penalty:** If Heat is too low (e.g., 2-3), low-control penalties apply, making Perfection extremely difficult. Overheating causes the craft to fail or take severe penalties.
- **Loop:** A typical stabilization loop requires 2 non-Fusion actions and 1 Fusion action in sequence to hover inside the Sweet Spot.

## 4. Inscribed Patterns (Clothing, Talismans)
*The most punishing Harmony. Requires using a balanced "salad" of colors.*

- **Mechanic:** There is a Pattern state wheel consisting of 5 slots representing required action types (e.g., 1 Fusion, 2 Refine, 1 Support, 1 Stabilize).
- **Rule:** You MUST use an action whose color is still "lit" on the wheel.
- **Buff:** Building the counter grants a stacking **+2% bonus to Intensity & Control**. This is arguably the strongest buff in the game.
- **Penalty (Critical for Optimizer):** Using an unlit (invalid) color triggers a catastrophic penalty:
  1. Loss of Qi Pool.
  2. Loss of Stability.
  3. **Loss of HALF of all current stacks.**
- *Optimizer Note:* The simulator's forecast queue must fiercely penalize or prune paths that trigger an invalid Inscribed Pattern action, as the stack destruction will cripple any expected value (EV) calculation.
