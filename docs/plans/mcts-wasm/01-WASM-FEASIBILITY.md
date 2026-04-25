# Phase 0: WASM Feasibility

## Status

Completed on 2026-04-23 against the target Electron renderer profile.

## Result summary

| Test | Result | Meaning |
| --- | --- | --- |
| `WebAssembly.instantiate(bytes)` | PASS | Raw inline bytes work |
| wasm-bindgen-generated Rust module | PASS with imports/glue | Normal and expected |
| `fetch('mod://...')` | FAIL | Async webpack WASM loading is not viable |
| `fetch('http://localhost:...')` | FAIL | Local HTTP sidecar is not viable |
| `new WebSocket('ws://localhost:...')` | FAIL | Local WS sidecar is not viable |
| Node globals/APIs | FAIL | No Node-side process/file access in renderer |

## Locked conclusions

1. **Inline-loaded WASM is viable.**
2. **Async webpack WASM loading is not viable in the shipping environment.**
3. **Localhost service fallback is not viable in the shipping environment.**
4. **The existing JS optimizer is the only supported runtime fallback.**

## Required implementation approach

Use this build/init shape:

1. Build Rust with `wasm-pack --target web`.
2. Post-process the generated `.wasm` into an inline asset exported from TypeScript.
3. Initialize the wasm-bindgen glue from decoded bytes at runtime.

The exact packaging mechanism can be either:

- base64 encoded bytes in a generated TS module, or
- a generated `Uint8Array` module

but it must not depend on `fetch()` or a separately served `.wasm` file.

## What this changes in later phases

- Project setup must use the inline path, not `--target bundler`.
- The bridge must initialize from bytes, not `import('../wasm-pkg')` network loading.
- Any mention of localhost fallback should be removed from the migration plan.

## Non-goals

This phase did **not** validate search quality or performance. It only validated that a Rust/WASM engine can physically run in the target renderer.
