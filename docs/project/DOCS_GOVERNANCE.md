---
title: Docs Governance
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-02-28
source_of_truth: package.json, scripts/docs/*
review_cycle_days: 30
related_files:
  - docs/DOC_INVENTORY.md
  - docs/project/START_HERE_FOR_AGENTS.md
---

# Docs Governance

## Documentation model

For implementation decisions, always prefer: code/tests → `AGENTS.md` → `docs/project/*` → `docs/dev-requests/*`. Use `docs/history/*` and `docs/reference/*` only as supporting context. Use `archive/*` only when curated docs are insufficient.

### Documentation classes

| Path | Authority | Purpose |
| --- | --- | --- |
| `docs/project/*` | authoritative | Implementation docs |
| `docs/dev-requests/*` | authoritative | External dependency tracking |
| `docs/history/*` | non-authoritative | Historical snapshots |
| `docs/reference/*` | non-authoritative | Curated AFNM reference subset |
| `archive/*` | non-authoritative | Archival snapshots (excluded from docs checks) |

## Mandatory metadata fields

For `docs/project/*`, `docs/dev-requests/*`, and `docs/history/*`:

`title`, `status`, `authoritative`, `owner`, `last_verified`, `source_of_truth`, `review_cycle_days`, `related_files`

## Required checks

- `bun run docs:check` (runs link, freshness, and authority checks)
- `bun run docs:inventory` (regenerates `docs/DOC_INVENTORY.md`)

## Context hygiene

- Do not bulk-load `docs/reference/*` unless blocked.
- Do not use `archive/*` by default.
- Never cite historical docs as current truth without re-verification.

## Update policy

- Mechanics behavior change → update corresponding `docs/project/*` in same PR.
- Unresolved assumptions → mark explicitly as unresolved, do not assert as fact.
