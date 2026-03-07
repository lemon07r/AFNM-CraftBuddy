---
title: Realm Progression & Constraints
status: active
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-03-07
source_of_truth: docs/reference/afnm-crafting-guide/realm_progressions.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
---

# Realm Progression & Constraints

The complexity of crafting in AFNM scales exponentially with cultivation realms. The simulator must be capable of handling the specific constraints and available mechanics at each stage of the game.

## Body Forging (BF)
- **Primary Goal:** Basic survival and introductory crafting (Healing/Regeneration pills, Breakthrough pills).
- **Mechanics:** Focused heavily on filling the Completion bar. Perfection is desirable but often reliant on RNG (chance-based rolls when perfection is under 100%).
- **Builds:** Pure Intensity (using `Disciplined Touch`) or Balanced.
- **Constraints:** Very limited Qi Pool and Stability. Reliant on basic Cauldrons (e.g., `Simplified Insertion Cauldron`).

## Meridian Opening (MO)
- **Primary Goal:** Upgraded Bottleneck pills and Cleansing Needles.
- **Mechanics:** Introduces basic condition-dependent actions (`Harmonious Stabilize`) and simple Qi regeneration loops (`Repurpose Qi`, `Siphon Qi`).
- **Builds:** Pure Intensity, Pure Control, and "Explosive Refinement" (relying on `Blessed Reagent` for success chance).
- **Constraints:** Starts requiring specific elemental Flames (`Bifang Flame`).

## Qi Condensation (QC)
- **Primary Goal:** Gear crafting and the introduction of **Sublime Crafting**.
- **Mechanics:** 
  - Sublime minigames (Forge Works, Alchemical Arts, Spiritual Resonance, Inscribed Patterns) become active.
  - Stacking Completion > 200% for Sublime Artefacts.
  - Heavy reliance on buff layers: Character Stats + Cauldron + Reagent + Room Buff + Flame Enchantment + Cauldron Enchantment.
- **Builds:** Builds start explicitly targeting Sublime Harmony types (e.g., Forge Works requires specific heat management loops).

## Core Formation (CF)
- **Primary Goal:** Maximum star/quality output on highly complex recipes.
- **Mechanics:** Introduction of advanced sub-systems:
  - **Insight:** High Control, High Qi cost.
  - **Focus:** Cheap support actions that allow bursts of Qi/Stability regen.
  - **Pressure:** Slow ramping buffs with increasing Stability costs.
  - **Golden Path:** Extremely powerful synergistic buffs that define the core loop of the craft.
- **Builds:** Highly specialized (e.g., Pure Control + Insight + Focus). Requires executing specific 5-10 action loops repeatedly while managing Harmony minigames.
- **Constraints:** Requires managing a massive action pool (67+ actions available). The optimizer's search space explodes here and must rely on aggressive pruning or recognizing established loops (like the `Efficient Fusion` -> `Forceful Stabilize` pattern).
