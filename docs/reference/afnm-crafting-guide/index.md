---
title: AFNM Crafting Guide Analysis
status: active
authoritative: false
owner: craftbuddy-maintainers
last_verified: 2026-03-20
source_of_truth: docs/reference/afnm-crafting-guide/index.md
review_cycle_days: 30
related_files:
  - docs/project/MECHANICS_PARITY.md
---

# AFNM Crafting Guide Analysis

This directory contains distilled, high-signal information extracted from community crafting guides (specifically Igor-panin10 and Anatheme's guides on Sublime Crafting and Harmonies). This information aims to help coding agents improve the AFNM CraftBuddy mod by ensuring calculations and mechanics simulation function true to the game.

These notes are reference-only. Treat `docs/project/*`, code, and tests as the source of truth.

## Table of Contents

- [Mechanics & Calculations](./mechanics_calculations.md) - Deep dive into math, stats, and flat vs. percentage buff ordering.
- [Sublime Crafting Harmonies](./harmonies.md) - Rules and penalties for the four Harmony minigames.
- [Action Synergies](./action_synergies.md) - Key mechanics interactions and resource optimization loops.
- [Advanced Sublime Builds](./advanced_sublime_builds.md) - Runtime-verified sublime action facts plus guide-reported infinite-crafting rotation ideas.
- [Realm Progression Constraints](./realm_progressions.md) - High-level goals and strategies expected per cultivation realm.
- [Agent Considerations](./agent_considerations.md) - Critical edge cases, blind spots, and pitfalls for future agents to review.

## High-Level Insights for the Optimizer

Based on the guide, the following areas might be potential blind spots or edge cases for the current simulation and optimizer logic:

1. **Percentage Buff Stat Base:** The game strictly applies percentage buffs (like those from the Empower Intensity technique) _only_ to pre-crafting base stats (Base + Cauldron + Flame). They do NOT scale the flat stats added mid-craft from Reagents or Pills. The simulator's evaluation pipeline (`scaling evaluation pipeline`) must mirror this exact sequence.
2. **Harmony Penalties & State Transitions:** Inscribed Patterns destroys HALF of all stacks on an invalid action. If the lookahead search doesn't prune invalid Inscribed Pattern actions, it might severely miscalculate EV. Spiritual Resonance changes target color if a new color is used twice in a row.
3. **Chance-based Completion:** Completion and perfection are both resolved as independent craft-end ladder rolls, not hard deterministic bars. Partial progress can still finish successfully, but the odds are nonlinear and over-target progress matters for both success and finish quality.
