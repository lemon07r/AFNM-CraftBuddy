---
title: Documentation Home
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: docs/project/*
review_cycle_days: 30
related_files:
  - README.md
  - docs/index.md
  - docs/project/START_HERE_FOR_AGENTS.md
---

# Documentation Home

This repository uses a layered docs model to keep implementation context clean and accurate.

## Sections

- `docs/project/`
  - authoritative technical docs for this mod
- `docs/dev-requests/`
  - API exposure requests and status tracking with the game developer
- `docs/history/`
  - historical analyses/changelogs preserved for traceability only
- `docs/reference/`
  - curated AFNM reference subset (non-authoritative)
- `archive/`
  - full imported snapshots and deprecated docs kept for traceability (excluded from active docs checks)

## Working rule

For implementation decisions, always prefer:

1. code/tests
2. `docs/project/*`
3. `docs/dev-requests/*` (for dependency status)

Use `docs/history/*` and `docs/reference/*` only as supporting context.
Use `archive/*` only when curated/active docs are insufficient.

## Agent start point

`docs/project/START_HERE_FOR_AGENTS.md`
