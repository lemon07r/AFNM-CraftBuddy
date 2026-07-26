# Phase 2: Rust Deterministic Engine Parity

> **Historical plan — superseded.** See the banner in `00-PLAN.md`. Parity shipped differently: `crates/craftbuddy-engine/src/effects.rs` plus a generated differential corpus, and the compact fixed-layout state with mutate/undo was measured and rejected (`docs/project/OPTIMIZER_ENGINE_FINDINGS.md`).

## Goal

Port the deterministic optimizer core from TypeScript to Rust before adding MCTS:

- state model
- scaling/expression evaluation
- skill availability checks
- gain calculation
- full `apply_skill`
- harmony subsystem transitions
- deterministic scoring and finish-outcome scoring

This phase is about semantic parity, not search innovation.

## Source files to port from

| TypeScript source | Rust module |
| --- | --- |
| `src/optimizer/gameTypes.ts` | `types.rs`, `scaling.rs` |
| `src/optimizer/state.ts` | `state.rs` |
| `src/optimizer/skills.ts` | `skills.rs` |
| `src/optimizer/harmony.ts` | `harmony.rs` |
| scoring + finish logic from `src/optimizer/search.ts` | `scoring.rs`, `condition.rs` |

## Porting rules

### 1. Preserve behavior before optimizing representation

Do not redesign formulas during the Rust port. The first Rust engine should be boring and correct.

### 2. Port the fields the engine actually depends on

The Rust DTOs must preserve engine-relevant fields already present in the TS contracts, including:

- `nativeVariables`
- `conditionEffectsData`
- `masteryEntries`
- `grantedBuff`
- `consumesTurn`
- `reagentOnlyAtStepZero`
- `maxCompletion`
- `maxPerfection`
- `targetMultiplier`
- `trainingMode`

Those fields are not optional nice-to-haves; several late-game and replay-parity paths depend on them.

### 3. Omit `history` from the Rust state

`CraftingState.history` exists in TS for debug/display purposes. Do not include it in the Rust search state. It is not needed for deterministic semantics and makes cloning slower.

### 4. Keep bridge DTOs explicit

Do not serialize raw internal TS instances with `any`.

Create explicit bridge structs for:

- state
- skill/config payload
- search request
- search response

The TypeScript bridge must serialize only those DTOs, and Rust must deserialize only those DTOs.

## Recommended Rust module structure

```text
crates/craftbuddy-engine/src/
  lib.rs
  bridge.rs
  types.rs
  scaling.rs
  state.rs
  skills.rs
  harmony.rs
  scoring.rs
  condition.rs
  mcts.rs
```

## Suggested implementation order inside this phase

1. `types.rs` and DTO serde scaffolding
2. `scaling.rs`
3. `state.rs`
4. `skills.rs` deterministic transition path
5. `harmony.rs`
6. `scoring.rs`
7. checked-in parity fixtures for all above

Do not start `mcts.rs` until those layers are covered by tests.

## Fixture strategy

Before porting complex logic, add fixture generation from the current TS engine. Prefer a dedicated script under `scripts/wasm/` over temporary logging edits inside production code.

Minimum fixture families:

- scaling evaluation fixtures
- state serde round-trip fixtures
- `canApplySkill()` fixtures
- `applySkill()` golden transitions
- finish-outcome scoring fixtures
- representative harmony transition fixtures

## Acceptance criteria

- Rust deterministic transitions match checked-in TS golden fixtures.
- Rust finish-outcome scoring matches the current TS finish logic.
- Rust condition generation matches the current TS distribution logic.
- `cargo test` passes for deterministic engine tests before MCTS work begins.

## Verification

```bash
cd crates/craftbuddy-engine && cargo test
bun run wasm:build
```
