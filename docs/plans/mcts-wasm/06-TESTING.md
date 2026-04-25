# Phase 6: Testing and Validation

## Goal

Prove three things separately:

1. the Rust deterministic engine is semantically correct
2. the WASM bridge and integration preserve current TS behavior/contracts
3. the new search quality/performance is actually better where it matters

## Testing order

### 1. Deterministic parity first

Before evaluating MCTS quality, lock parity for:

- scaling
- state serde
- condition generation
- `canApplySkill()`
- `applySkill()`
- harmony transitions
- finish-outcome scoring

### 2. Bridge/integration compatibility second

Then validate:

- inline WASM init in tests/build
- DTO serialization stability
- JS fallback behavior on WASM failure
- `SearchResult` hydration compatibility

### 3. Search quality/performance third

Only after the first two layers are green should MCTS quality comparisons matter.

## Fixture generation

Do not add temporary instrumentation to production logic just to capture fixtures.

Preferred approach:

- add a dedicated script under `scripts/wasm/`
- import the current TS optimizer
- generate checked-in JSON fixture files for deterministic parity tests

Recommended fixture sets:

- `golden_scaling.json`
- `golden_conditions.json`
- `golden_transitions.json`
- `golden_finish_outcomes.json`
- representative replay-derived scenario fixtures

## Rust tests

### Deterministic engine tests

- serde round-trip tests
- transition parity tests
- harmony subsystem tests
- scoring/finish tests

### MCTS tests

Use fixed seeds and fixed budgets for deterministic CI behavior.

Test for:

- stable chosen action on known scenarios
- no illegal actions returned
- sane handling of stochastic risk
- time budget compliance within a tolerance

Do **not** require monotonic score improvement with more simulations.

## TypeScript tests

Add bridge/integration tests for:

- DTO serialization
- WASM init success/failure path
- WASM result hydration into `SearchResult`
- fallback to JS when bridge/search fails

## Benchmarking

Use criterion for Rust benchmarks rather than unstable `#[bench]`.

Benchmark at two levels:

1. deterministic hot paths
   - scaling evaluation
   - `apply_skill`
   - condition generation
2. search-level paths
   - representative short craft
   - representative long craft
   - representative sublime craft

Measure relative gains against the current JS baseline where possible. Relative speedup is more useful here than fragile absolute nanosecond promises.

## Product-level evaluation

Run A/B comparisons on representative scenarios:

- simple craft
- long late-realm craft
- sublime craft with harmony setup
- risk-heavy craft with success/crit dependence
- item-enabled craft if supported

Compare:

- recommendation time
- chosen root action
- terminal outcome quality across repeated seeded runs
- whether known bad JS cases improve

## Acceptance criteria

- deterministic Rust parity fixtures pass
- bridge/integration tests pass
- JS fallback tests still pass unchanged
- representative search scenarios are not worse on known regression cases
- at least one important long-craft class shows clear improvement in speed, quality, or both
