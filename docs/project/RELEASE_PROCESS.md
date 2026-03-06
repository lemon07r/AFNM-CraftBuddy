---
title: Release Process
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-03-06
source_of_truth: package.json, scripts/workshop-upload.ts, .github/workflows/release.yml, ../ModUploader-AFNM/package.json, ../ModUploader-AFNM/electron/main/cli.ts
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/TESTING.md
  - scripts/workshop-upload.ts
  - .github/workflows/release.yml
---

# Release Process

Use this pipeline after code changes are complete and validation is finished.

## 1. Bump the version

Update both version strings together:

- `package.json`
- `scripts/ui/agent-browser-harness.tsx`

Use the same semantic version in both places, for example `3.5.22`.

## 2. Run validation

Minimum release checks:

```bash
bun run test
bun run build
```

If docs changed, also run:

```bash
bun run docs:inventory
bun run docs:check
```

If the change touched `src/modContent/`, UI integration, craft-entry behavior, or anything runtime-sensitive in the installed game, consider running the live game verification flow in [`docs/project/TESTING.md`](./TESTING.md) before publishing.

## 3. Commit the release

Stage the release changes and create a release commit:

```bash
git add package.json scripts/ui/agent-browser-harness.tsx
git add src docs .github scripts
git commit -m "chore(release): vX.Y.Z"
```

Use the actual version in the commit message, for example `chore(release): v3.5.22`.

## 4. Sync the release commit to GitHub

Push the release commit on `main` first:

```bash
git push origin main
```

## 5. Upload the release to Steam Workshop

Preferred wrapper from this repo:

```bash
bun run workshop:upload -- --change-note "What changed in vX.Y.Z"
```

What that wrapper does:

- rebuilds CraftBuddy unless `--skip-build` is passed
- runs `bun run cli:prepare` in `../ModUploader-AFNM` unless `--skip-uploader-prepare` is passed
- runs the uploader CLI against workshop item `3661729323` by default

Equivalent explicit uploader commands:

```bash
cd ../ModUploader-AFNM
bun run cli:prepare
bun run cli:upload -- --workshop-id 3661729323 --zip /absolute/path/to/AFNM-CraftBuddy/builds/afnm-craftbuddy.zip --change-note "What changed in vX.Y.Z"
```

Requirements:

- Steam must be running and logged into the account that owns the workshop item
- the sibling repo `../ModUploader-AFNM` must exist locally

## 6. Tag the release to trigger the GitHub Release workflow

The GitHub release automation in [`.github/workflows/release.yml`](../../.github/workflows/release.yml) runs on pushed tags matching `v*`.

Create and push the tag after the release commit is on `origin/main`:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

That workflow:

- checks out the tagged commit
- runs `bun install`
- runs `bun run build`
- creates a GitHub Release named `AFNM-CraftBuddy vX.Y.Z`
- uploads `builds/afnm-craftbuddy.zip` as the release asset

## 7. Post-release sanity check

Confirm all three release surfaces match:

- `package.json` version
- pushed Git tag `vX.Y.Z`
- Steam Workshop change note / uploaded build

If the GitHub Release needs to be created, do not skip the tag push. The workflow is tag-driven, not branch-push-driven.
