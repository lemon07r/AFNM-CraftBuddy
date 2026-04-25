---
name: pre-commit-validation
description: CraftBuddy verification workflow before claiming work is complete or committing. Activate after edits, before commits, and before releases to choose the correct typecheck, test, docs, build, runtime, and Rust/WASM checks.
---

# Pre-Commit Validation

Evidence before claims. Choose checks by touched area, then run the final relevant set before committing.

## Common Check Matrix

| Touched area | Run |
| --- | --- |
| Docs/skills only | `bun run docs:inventory` then `bun run docs:check` |
| TypeScript source | `bun run typecheck`, `bun run test` |
| UI source | `bun run typecheck`, `bun run test`, `bun run ui:harness:build` |
| Optimizer/search behavior | focused Jest file, then `bun run test` |
| Build/package behavior | `bun run build` |
| Rust/WASM engine | `bun run wasm:test`, `bun run wasm:build`, `bun run build` |
| Runtime/ModAPI assumptions | `bun run runtime:oracle` and targeted `runtime:grep` |
| Release | `bun run release:validate` plus release-specific checks |

## Commit Gate

```bash
git status
git diff
git diff --cached
```

Inspect diffs for secrets, local paths that should not be committed, generated artifacts, and stale docs.

## Rules

- Do not claim a command passed unless it was run in this worktree.
- Fix failures before committing unless the user explicitly approves skipping.
- If docs changed, run docs inventory/check after the final edit.
- If behavior changed but docs did not, explicitly confirm no authoritative docs are stale.
- Do not commit `dist/`, `builds/`, `coverage/`, `tmp/`, or local runtime artifacts.

## References

- `AGENTS.md`
- `docs/project/TESTING.md`
- `docs/project/RELEASE_PROCESS.md`
- `package.json`
