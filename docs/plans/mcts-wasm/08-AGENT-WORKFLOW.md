# AI-Agent Execution Workflow

## Goal

Reduce implementation risk by giving an AI coding agent a narrow, testable sequence of steps instead of one large rewrite.

## Rules

1. Do not mix deterministic parity work and new search behavior in the same change.
2. Do not change the public TS optimizer API until the Rust engine can prove deterministic parity.
3. Every slice must end with a concrete command-based validation step.
4. Prefer checked-in fixtures over prose reasoning.
5. Keep write scopes small and disjoint when delegating to multiple agents.

## Recommended slice order

### Slice 1: Packaging only

Deliver:

- Rust crate skeleton
- inline WASM build script
- trivial WASM export wired into the bundle

Validate:

- `bun run wasm:build`
- `bun run build`

### Slice 2: Fixture generation

Deliver:

- `scripts/wasm/generate-golden-fixtures.*`
- checked-in deterministic fixture files

Validate:

- fixture script runs
- fixture files are stable and reviewed

### Slice 3: Deterministic Rust engine

Deliver:

- scaling/state/skills/harmony/scoring parity in Rust

Validate:

- `bun run wasm:test`
- deterministic fixture suite passes

### Slice 4: Bridge DTOs + hydration shell

Deliver:

- explicit bridge DTOs
- inline init path
- TS hydration from a stub or deterministic Rust result

Validate:

- TS bridge tests
- build still passes
- JS fallback still works

### Slice 5: MCTS engine

Deliver:

- sampled search
- fixed-seed MCTS tests
- benchmark harness

Validate:

- `bun run wasm:test`
- `bun run wasm:bench`

### Slice 6: Full integration

Deliver:

- `findBestSkill(...)` dispatch
- settings toggle
- optional engine metadata display

Validate:

- `bun run test`
- `bun run build`

### Slice 7: Product validation

Deliver:

- replay-based A/B comparisons
- docs updates for final behavior

Validate:

- targeted scenario comparisons recorded in the PR or release notes

## If multiple AI agents are used

Safe parallel split:

- Agent A: packaging/build scripts
- Agent B: fixture generation and deterministic parity tests
- Agent C: Rust deterministic modules

Do not parallelize edits to the same contract files until the bridge DTOs are stable.

## Stop conditions

Pause implementation and resolve the plan first if any of these happen:

- the inline WASM init path needs a new runtime assumption
- DTO fields start being guessed instead of traced from current code
- MCTS work starts before deterministic parity is green
- the integration path proposes replacing the current `SearchResult` contract wholesale
