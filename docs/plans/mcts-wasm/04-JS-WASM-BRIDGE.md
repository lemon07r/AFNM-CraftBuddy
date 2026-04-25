# Phase 4: JS-WASM Bridge

## Goal

Create a bridge that:

1. initializes the WASM engine from inline bytes
2. serializes explicit request DTOs
3. calls the Rust search core
4. returns a minimal search-core result for TypeScript hydration

## Constraints from Phase 0

The bridge must not rely on:

- `asyncWebAssembly`
- `fetch()` to load `.wasm`
- `import('../wasm-pkg')` as a runtime loading mechanism for the binary
- localhost HTTP/WS services

## Files

Recommended files:

| File | Purpose |
| --- | --- |
| `src/optimizer/wasmBridge.ts` | runtime bridge and init |
| `src/optimizer/wasmTypes.ts` | explicit TS bridge DTOs |
| `src/optimizer/wasm/generated/*` | generated inline WASM bytes module |
| `crates/craftbuddy-engine/src/bridge.rs` | Rust serde DTOs |
| `crates/craftbuddy-engine/src/lib.rs` | wasm-bindgen entry points |

## Initialization path

Use an inline byte path:

1. Rust build outputs the raw `.wasm` and JS glue.
2. A build script generates a TS module exporting inline bytes/base64.
3. `wasmBridge.ts` decodes the bytes and initializes the generated wasm-bindgen glue synchronously.

That means the search call itself can stay synchronous after initialization, which matters because `findBestSkill(...)` is currently synchronous.

## Bridge API design

### Do not return a UI-shaped result from Rust

Rust should return a minimal engine result, not the final TypeScript `SearchResult`.

Recommended result shape from Rust:

- ranked root action stats by `skillKey`
- principal variation as `skillKey[]`
- projected final state
- engine timing/simulation metrics
- optional stochastic summary stats

TypeScript should then hydrate that into the existing recommendation shape using local skill metadata and preview helpers.

### Do not use `any` bridge DTOs

`OptimizerConfigJson = any` is not acceptable for this bridge.

Instead:

- define explicit TS DTO interfaces
- define matching Rust serde structs
- add tests that fail when property names drift

## Serialization rules

The bridge must serialize all engine-relevant fields, including:

- state resource values and cooldowns/items/buffs
- `nativeVariables`
- harmony data
- condition queue
- recipe condition effect data
- mastery-derived fields and raw mastery entries where needed
- config caps and target metadata (`maxCompletion`, `maxPerfection`, `targetMultiplier`, etc.)

Prefer dedicated serializer functions:

- `serializeState(state: CraftingState): BridgeState`
- `serializeConfig(config: OptimizerConfig): BridgeConfig`

Do not spread raw internal objects and hope the shapes line up.

## Error handling

The bridge should handle these cases cleanly:

- init failure -> mark WASM unavailable and fall back to JS
- search panic/exception -> catch in TS, log once, fall back to JS
- DTO parse mismatch -> return/throw a clear bridge error and fall back to JS

## Recommended Rust exports

Keep the Rust surface minimal:

- `version()`
- `search(json_input: &str) -> String`

Optional:

- `self_check()` or tiny deterministic smoke export for tests

Avoid a wide export surface until the bridge is stable.

## Done when

- WASM initializes from inline bytes in the target renderer
- the bridge serializes explicit DTOs with tests
- Rust returns a minimal core result
- TypeScript can consume that result without changing the public optimizer API
