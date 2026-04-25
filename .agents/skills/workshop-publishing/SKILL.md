---
name: workshop-publishing
description: Steam Workshop publishing workflow for AFNM mods. Activate when uploading, setting Workshop metadata, or preparing Workshop release notes; for CraftBuddy releases prefer craftbuddy-release.
---

# Workshop Publishing

For CraftBuddy, prefer `craftbuddy-release` because it includes repo-specific version and tag order. Use this skill for generic Workshop upload mechanics.

## Requirements

- Steam is running and logged into the owning account.
- Sibling `../ModUploader-AFNM` exists.
- The mod zip has been rebuilt from the current worktree.
- A descriptive `--change-note` includes the version.

## CraftBuddy Upload

```bash
bun run workshop:upload -- --change-note "vX.Y.Z - What changed"
```

When public Workshop copy changed:

```bash
bun run workshop:upload -- --change-note "vX.Y.Z - What changed" --description-file docs/project/WORKSHOP_DESCRIPTION.md
```

## Rules

- Do not sync title/description unless explicitly intended.
- Do not tag GitHub releases until the release commit and Workshop upload state are correct.
- Preview images should stay small; the uploader can compress large images.
- Never commit Steam credentials, login files, or local uploader artifacts.

## Related Skills

- `craftbuddy-release` — CraftBuddy-specific release order and item `3661729323`
- `pre-commit-validation` — validation before publishing
- `conventional-git` — release commit/tag naming
