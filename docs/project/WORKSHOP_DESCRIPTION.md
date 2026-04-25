---
title: Workshop Description
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-04-25
source_of_truth: Steam Workshop item 3661729323, package.json, src/settings/index.ts, src/optimizer/search.ts, crates/craftbuddy-engine/*
review_cycle_days: 30
related_files:
  - docs/project/RELEASE_PROCESS.md
  - docs/project/OPTIMIZER_DESIGN.md
  - scripts/workshop-upload.ts
---

CraftBuddy v5.0.0

CraftBuddy calculates and displays the recommended next crafting action in Ascend From Nine Mountains. It watches the live craft state, evaluates available techniques, previews expected gains/costs, and can show alternatives, predicted rotations, final state estimates, and upcoming conditions.

v5 adds the new engine selector:

- Legacy engine (default): the established TypeScript lookahead optimizer with deterministic expected-value scoring, condition branching, and parity-tested game mechanics.
- Experimental engine: an opt-in Rust/WASM Monte Carlo Tree Search policy prior for difficult late-game, sublime, and harmony-heavy crafts. TypeScript scoring remains authoritative; the native MCTS engine only helps choose among near-tied root branches.

Recommended use:

- Keep Legacy selected for stable everyday crafting.
- Try Experimental on late-game, harmony, or sublime crafts where previous versions had weak recommendations.
- If Experimental ever looks suspicious, switch back to Legacy from CraftBuddy settings and export an optimizer snapshot for debugging.

v5 also bundles the Rust/WASM engine into the mod build, adds Rust and TypeScript bridge tests, and keeps the legacy optimizer available as the safe default while the experimental path is validated against more real craft data.
