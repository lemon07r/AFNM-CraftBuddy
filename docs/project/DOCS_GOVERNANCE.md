---
title: Docs Governance
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-07
source_of_truth: package.json, scripts/docs/*
review_cycle_days: 30
related_files:
  - docs/DOC_INVENTORY.md
  - docs/project/START_HERE_FOR_AGENTS.md
---

# Docs Governance

## Documentation classes

- `docs/project/*`: authoritative implementation docs
- `docs/dev-requests/*`: authoritative external dependency tracking
- `docs/history/*`: historical snapshots (non-authoritative)
- `docs/reference/*`: curated external reference subset (non-authoritative)
- `archive/*`: archival snapshots/deprecated docs (traceability only; excluded from docs checks)

## Mandatory metadata fields

For `docs/project/*`, `docs/dev-requests/*`, `docs/history/*`, and top-level docs index files:

- `title`
- `status`
- `authoritative`
- `owner`
- `last_verified`
- `source_of_truth`
- `review_cycle_days`
- `related_files`

## Required checks

- `bun run docs:check-links`
- `bun run docs:check-freshness`
- `bun run docs:check-authority`

## Context hygiene policy

- Do not bulk-load `docs/reference/*` unless blocked.
- Do not use `archive/*` by default; escalate to archive only when curated docs are insufficient.
- Prefer project docs + code/tests first.
- Keep historical docs clearly marked and never cited as current truth without re-verification.

## Update policy

- mechanics behavior change -> update corresponding `docs/project/*` in same PR
- unresolved assumptions -> mark explicitly as unresolved, do not assert as fact
