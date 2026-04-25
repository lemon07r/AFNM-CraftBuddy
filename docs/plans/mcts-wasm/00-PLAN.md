# Rust/WASM + MCTS Optimizer Upgrade Plan

## Goal

Replace the current beam-limited TypeScript lookahead search with a Rust optimizer compiled to WebAssembly, while preserving the existing CraftBuddy TypeScript integration surface.

This migration is meant to solve two real product problems:

1. Late-realm and sublime crafts have larger state spaces and more stochastic interactions than the current bounded EV search handles well.
2. Users want materially faster recommendations on long crafts.

## Why this path is still the right one

- Rust gives a much faster transition/search core than the current TS implementation.
- WASM keeps the engine inside the renderer with no extra install step.
- MCTS is a better fit than the current beam search for long stochastic crafts because it can keep spending budget on the most promising lines instead of truncating depth early.

## Confirmed runtime constraints

Phase 0 established a few constraints that are now final:

- Inline WASM works in the target Electron renderer.
- `mod://` fetch does not work for async webpack WASM loading.
- `http://localhost` and `ws://localhost` are blocked from the renderer origin.
- No Node APIs are available in the renderer.

The implementation plan must respect those facts. Do not reintroduce bundler-loaded WASM or localhost service fallbacks later in the migration.

See [01-WASM-FEASIBILITY.md](./01-WASM-FEASIBILITY.md).

## High-level architecture

```text
CraftBuddy TS integration/UI
  -> serialize explicit bridge DTOs
  -> call inline-loaded WASM engine synchronously
  -> receive ranked action keys + search metadata
  -> hydrate result back into the existing SearchResult contract
```

Important boundary choice:

- Rust owns deterministic simulation, stochastic sampled search, and raw action ranking.
- TypeScript keeps the public integration contract, UI-facing recommendation objects, replay snapshots, and fallback JS optimizer.

This avoids duplicating UI-oriented `SearchResult` shaping logic inside Rust.

## Final design decisions

1. **Language/runtime**: Rust compiled to WASM.
2. **Delivery**: `wasm-pack --target web` plus a post-build inline step. No async webpack WASM loading.
3. **Fallback**: the existing JS optimizer remains the only runtime fallback. Do not build a localhost sidecar path.
4. **Public TS API**: keep `findBestSkill(...)` synchronous and keep the existing `SearchResult` shape compatible with current callers.
5. **Bridge contract**: use explicit, minimal DTOs. Do not use `any` for serialized config/state contracts.
6. **Parity before search**: deterministic transition/scoring parity in Rust is a hard prerequisite for MCTS work.
7. **Search algorithm**: use expected-utility MCTS with sampled stochastic transitions and mean-value backpropagation.
8. **Tree reuse**: defer subtree reuse until the base engine is correct and benchmarked. Rebuild per recommendation initially.
9. **Workers**: defer worker/off-main-thread work until after correctness and first performance validation.

## Revised phase order

| Phase | Name | Purpose |
| --- | --- | --- |
| 0 | [WASM Feasibility](./01-WASM-FEASIBILITY.md) | Confirm renderer constraints |
| 1 | [Project Setup](./07-PROJECT-SETUP.md) | Add Rust toolchain, inline WASM build, agent-friendly repo helpers |
| 2 | [Rust State Model](./02-RUST-STATE-MODEL.md) | Port deterministic state, transitions, harmony, scoring with parity fixtures |
| 3 | [MCTS Engine](./03-MCTS-ENGINE.md) | Add stochastic search on top of the deterministic Rust core |
| 4 | [JS-WASM Bridge](./04-JS-WASM-BRIDGE.md) | Inline init path, explicit DTOs, minimal result contract |
| 5 | [Integration](./05-INTEGRATION.md) | Preserve current TS recommendation surface and wire WASM dispatch safely |
| 6 | [Testing & Validation](./06-TESTING.md) | Parity, search quality, benchmark, and regression validation |
| A | [Agent Workflow](./08-AGENT-WORKFLOW.md) | Slice the implementation for AI-agent execution |

Critical path: `0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6`

## Scope split that matters for implementation

### Rust owns

- `CraftingState`
- `SkillDefinition`/config DTOs used by the engine
- `apply_skill` and sampled `apply_skill_sampled`
- harmony subsystem state transitions
- deterministic scoring and finish-outcome evaluation
- MCTS search

### TypeScript keeps owning

- game-state extraction from ModAPI/runtime
- conversion from live game payloads into bridge DTOs
- `SearchResult` hydration for UI/auto-craft/replay compatibility
- settings persistence
- current JS optimizer fallback

## Main risks to avoid

### 1. Packaging drift

If later phases mention `--target bundler`, `asyncWebAssembly`, `import('../wasm-pkg')`, or localhost fallbacks, they are wrong unless the feasibility doc is re-run and proves otherwise.

### 2. Contract drift

The current TS surface is richer than a simple `{ bestSkill, score }` shape. `SearchResult` and `SkillRecommendation` already carry gains, costs, reasoning, finish metadata, alternatives, replay-friendly fields, and search metrics. The Rust bridge should not replace that contract.

### 3. Algorithm drift

Do not treat one lucky rollout as authoritative. This domain is stochastic, so root action ranking should be based on expected utility, not maximum observed rollout.

### 4. Simultaneous semantic and algorithm changes

Do not port state transitions and invent the new search behavior in the same step. Lock deterministic parity first, then change the search algorithm.

## Acceptance standard for the migration

The migration is only successful when all of the following are true:

- WASM initializes via the inline path in the target renderer.
- Rust deterministic transitions match the current TS engine on checked-in fixture sets.
- The existing TS callers continue to receive a compatible `SearchResult`.
- JS fallback remains working.
- Representative long-craft scenarios are faster or materially better than the JS optimizer, ideally both.

## Recommended implementation order for an AI coding agent

Use [08-AGENT-WORKFLOW.md](./08-AGENT-WORKFLOW.md). The short version:

1. Land build/packaging with a tiny stub engine.
2. Add fixture generation from the current TS optimizer.
3. Port deterministic engine pieces with parity tests.
4. Add bridge DTO serialization and hydration.
5. Add MCTS only after deterministic parity is stable.
6. Integrate behind a safe setting and preserve fallback behavior.
