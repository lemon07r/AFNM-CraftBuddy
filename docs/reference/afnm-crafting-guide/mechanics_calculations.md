---
title: Mechanics & Calculations
status: active
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-03-07
source_of_truth: docs/reference/afnm-crafting-guide/mechanics_calculations.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
---

# Mechanics & Calculations

This document covers raw math, stat calculation ordering, and base rules extracted from community crafting guides. Simulators and optimizers must respect these constraints for true-to-game accuracy.

## Core Stats
- **Qi Intensity (QI):** Scales Completion and specific Fusion actions.
- **Qi Control (QC):** Scales Perfection and specific Refine actions.
- **Stability:** Consumed by most actions. Dropping to 0 usually forces a craft finish or penalty.
- **Toxicity:** Limits the number of consumable items (Pills/Reagents) that can be used.
- **Qi Pool (Max Qi):** The energy spent to perform actions.

## Flat vs. Percentage Buffs

The evaluation order of stat buffs is a common trap for simulated math.

**The Golden Rule:** Percentage buffs applied during crafting DO NOT scale flat stats granted by Reagents and Pills mid-craft. They only scale the **Pre-Crafting Base Stats**.

### Evaluation Order
1. **Base Stats:** Character Base + Cauldron + Flame (including their enchantments).
2. **Percentage Buffs:** Multipliers like `Empower Intensity` (+50% QI) apply **only** to the stat total from Step 1.
3. **Mid-Craft Flat Buffs:** Flat values from Reagents (e.g., `Intensifying Reagent`) and Pills (e.g., `Refined Intensity Pill`) are added **after** the percentage multiplier is calculated.

*Example Math Scenario:*
- **Base (Step 1):** 217 QC, 295 QI (Char) + 666 QI (Cauldron) + 78 QI/QC (Flame) = **944 QI**, 295 QC.
- **Flat Reagents/Pills (Step 3):** +197 QI (Reagent) + 104 QI (Pill) = 301 flat QI.
- If an action grants a `+50% Qi Intensity` multiplier:
  - Valid: `(944 * 1.5) + 301 = 1416 QI` + 301 = `1717 QI`.
  - Invalid (Optimizer Bug): `(944 + 301) * 1.5 = 1867.5 QI`.

*Action/Technique scaling relies heavily on this sequence to prevent exponential stat blowouts.*

## Consumable Mechanics & Qi Regen

Pills provide buffs via "Stacks" (decremented on each action), while Reagents provide a permanent buff for the entire craft but cost high Toxicity.

### Toxicity Cleansing Math
Calculating true Qi regeneration requires balancing Qi Pool Pills against Detoxifying Pills.

- **Purple Tier:**
  - Qi Pool Pill: +70 Qi for 49 Toxicity
  - Detoxifying Pill: -11 Toxicity per turn
  - Net Regen: `(70 / 49) * 11` ≈ **15.7 Qi per turn**.
- **Red Tier:**
  - Qi Pool Pill: +88 Qi for 49 Toxicity
  - Detoxifying Pill: -18 Toxicity per turn
  - Net Regen: `(88 / 49) * 18` ≈ **32.3 Qi per turn**.

## Completion & Perfection Bars

1. **Chance-Based Success:** If the Completion Bar is under 100%, the success rate equals the completion percentage (e.g., 30% Completion = 30% Chance to succeed).
2. **Sublime Crafting:**
   - Unlocked at 200 Craft Skill via "Path of Sublime Crafting".
   - Allows going beyond 100% on both bars (often seen up to 600% in explosive builds).
   - **Consumables (Pills/Elixirs):** Filling Perfection grants bonus stacks. Filling Completion grants material returns.
   - **Artefacts (Equipment):** Perfection increases "Stars" (power). Completion *must* reach at least 200% to qualify for Sublime status.
