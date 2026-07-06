---
title: Docs Governance
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-06
source_of_truth: package.json, scripts/docs/*
review_cycle_days: 30
related_files:
  - docs/DOC_INVENTORY.md
  - docs/project/START_HERE_FOR_AGENTS.md
---

# Docs Governance

## Documentation model

For implementation decisions, always prefer: code/tests → `AGENTS.md` → `docs/project/*` → `docs/dev-requests/*`. Use `docs/reference/*` only as supporting context.

### Documentation classes

| Path | Authority | Purpose |
| --- | --- | --- |
| `docs/project/*` | authoritative | Implementation docs |
| `docs/dev-requests/*` | authoritative | External dependency tracking |
| `docs/reference/*` | non-authoritative | Curated AFNM reference subset |

## Mandatory metadata fields

For `docs/project/*` and `docs/dev-requests/*`:

`title`, `status`, `authoritative`, `owner`, `last_verified`, `source_of_truth`, `review_cycle_days`, `related_files`

## Required checks

- `bun run docs:check` (runs link, freshness, and authority checks)
- `bun run docs:inventory` (regenerates `docs/DOC_INVENTORY.md`)

## Context hygiene

- Do not bulk-load `docs/reference/*` unless blocked.
- Do not leave generated scrape/output markdown (for example `.firecrawl/*`) in the worktree when running docs checks; docs validation is for repository docs, not transient research artifacts.

## Update policy

- Mechanics behavior change → update corresponding `docs/project/*` in same PR.
- Unresolved assumptions → mark explicitly as unresolved, do not assert as fact.
