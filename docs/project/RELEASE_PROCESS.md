---
title: Release Process
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.9-b8ef246
last_verified: 2026-08-23
source_of_truth: package.json, scripts/workshop-upload.ts, scripts/installed-game-runtime.js, .github/workflows/release.yml, ../ModUploader-AFNM/package.json, ../ModUploader-AFNM/electron/main/cli.ts
review_cycle_days: 30
related_files:
  - AGENTS.md
  - docs/project/TESTING.md
  - scripts/workshop-upload.ts
  - docs/project/WORKSHOP_DESCRIPTION.md
  - docs/project/RELEASE_NOTES_6.1.0.md
  - docs/project/RELEASE_NOTES_6.0.0.md
  - .github/workflows/release.yml
---

# Release Process

Use this pipeline after code changes are complete and validation is finished. Before publishing, do a lean docs pass for any behavior, workflow, or tooling changed by the task: update stale or inaccurate docs if needed, but keep additions concise.

## 1. Bump the version

Update both version strings together:

- `package.json`
- `scripts/ui/agent-browser-harness.tsx`

Use the same semantic version in both places, for example `3.5.22`.

Bump the **major** version when the mechanics model, scoring architecture or terminal-state semantics change incompatibly (`v5.0.0` for ModAPI adoption, `v6.0.0` for the 0.7.5 rework).

Bump the **minor** version for a game-version retarget that keeps the scoring architecture intact, even when it changes how a mechanic is modelled (`v6.1.0` for 0.7.6, whose one mechanics change was Eccentric Decree moving to a per-bar-change hook).

## 1b. Write the release notes

A major or feature release gets `docs/project/RELEASE_NOTES_<version>.md` covering what changed, what was measured and rejected, and the limitations that genuinely remain. Follow the structure of the newest existing notes: frontmatter, a short framing intro, `## Changed` with `###` subsections, `## Known limitations`, `## Upgrading`.

Mirror the player-facing subset into [`WORKSHOP_DESCRIPTION.md`](./WORKSHOP_DESCRIPTION.md)'s single rolling `[h1]What's New in vN[/h1]` section. Update that section in place for minor and patch releases instead of adding a separate block for every version; for the current major series, use `[h1]What's New in v6[/h1]`. Keep the full per-release history in `RELEASE_NOTES_<version>.md`. Also refresh the "Updated for game version" line near the top when the release retargets the game.

When a release retargets the game version, `docs/project/RUNTIME_EVIDENCE.md` and `docs/project/ENGINE_PERFORMANCE.md` are updated **in place** — their filenames deliberately carry no version, so a new game build is a content edit rather than a rename.

## 2. Run validation

Minimum release gate:

```bash
bun run release:validate
```

If docs changed, regenerate inventory before the release gate:

```bash
bun run docs:inventory
bun run release:validate
```

For a release that touches optimizer mechanics or the Rust engine, also run:

```bash
bun run wasm:test && bun run wasm:build
bun run optimizer:bench
```

`release:validate` does not cover the Rust crate or the benchmark contracts.

If the task changed behavior or workflow but the docs did not need edits after review, explicitly confirm that no authoritative docs became stale before continuing.

If the change touched `src/modContent/`, UI integration, craft-entry behavior, or anything runtime-sensitive in the installed game, run the installed-runtime oracle flow in [`docs/project/TESTING.md`](./TESTING.md) before publishing. Use live UI verification only when explicitly requested or when a non-disruptive automated path exists.

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
bun run workshop:upload -- --change-note "vX.Y.Z - What changed"
```

Include the pushed release tag in the Workshop change note itself. Example: `v3.5.22 - Fix CraftBuddy not appearing after the loading-screen timing update.`

When the public Workshop description needs to change, update [`WORKSHOP_DESCRIPTION.md`](./WORKSHOP_DESCRIPTION.md) and pass it through the wrapper:

```bash
bun run workshop:upload -- --change-note "vX.Y.Z - What changed" --description-file docs/project/WORKSHOP_DESCRIPTION.md
```

**Steam caps the description at 8,000 characters**, counted on the body only — the wrapper strips the frontmatter before sending it. Going over fails *after* the zip has already uploaded, and Steam reports only `a parameter is invalid` (`GenericFailure`), after which the uploader prints its usage text. That looks like a rejected flag and is not; check the length first:

```bash
bun -e 'const t=require("fs").readFileSync("docs/project/WORKSHOP_DESCRIPTION.md","utf8").trim();const b=t.startsWith("---")?t.slice(t.indexOf("\n---",3)+4).trim():t;console.log(b.length,"/ 8000")'
```

What that wrapper does:

- rebuilds CraftBuddy unless `--skip-build` is passed
- runs `bun run cli:prepare` in `../ModUploader-AFNM` unless `--skip-uploader-prepare` is passed
- runs the uploader CLI against workshop item `3661729323` by default

Equivalent explicit uploader commands:

```bash
cd ../ModUploader-AFNM
bun run cli:prepare
bun run cli:upload -- --workshop-id 3661729323 --zip /absolute/path/to/AFNM-CraftBuddy/builds/afnm-craftbuddy.zip --change-note "vX.Y.Z - What changed"
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
- Steam Workshop change note starts with `vX.Y.Z`
- Steam Workshop uploaded build

If the GitHub Release needs to be created, do not skip the tag push. The workflow is tag-driven, not branch-push-driven.
