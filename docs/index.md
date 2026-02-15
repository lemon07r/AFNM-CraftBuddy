---
title: Docs Index
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-15
source_of_truth: docs/project/*
review_cycle_days: 30
related_files:
  - docs/project/START_HERE_FOR_AGENTS.md
---

# Documentation Home

This repository uses a layered docs model to keep implementation context clean and accurate.

## Primary entrypoints

- `docs/project/START_HERE_FOR_AGENTS.md` — fastest technical onboarding path
- `AGENTS.md` — repository guidelines and optimizer design principles (read by AI agents automatically)

## Documentation sections

- `docs/project/` — authoritative implementation docs
- `docs/dev-requests/` — game developer API exposure requests + status
- `docs/history/` — historical snapshots (non-authoritative)
- `docs/reference/` — curated AFNM reference subset (reference-only)
- `archive/` — full imported snapshots/deprecated docs (traceability only; excluded from docs checks)

## Working rule

For implementation decisions, always prefer:

1. code/tests
2. `AGENTS.md` (for optimizer design principles)
3. `docs/project/*`
4. `docs/dev-requests/*` (for dependency status)

Use `docs/history/*` and `docs/reference/*` only as supporting context. Use `archive/*` only when curated/active docs are insufficient.
