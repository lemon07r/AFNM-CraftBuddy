---
name: craftbuddy-release
description: Use when bumping versions, packaging a release, changing Workshop copy, uploading to Workshop, or pushing release tags.
---

# Release CraftBuddy

This is the release procedure. Validation details live in `docs/DEVELOPMENT.md`, not a second release checklist.

## Prepare

- Update `package.json`, add a concise newest-first section to `CHANGELOG.md`, and refresh `docs/WORKSHOP_DESCRIPTION.md` when public copy changes. The UI harness reads the package version automatically.
- A major bump fits incompatible mechanics/scoring/terminal semantics; a minor bump fits a game retarget that keeps the architecture. Historical examples are in the changelog.
- For a retarget, update the current contracts and append runtime evidence; keep dated performance measurements dated instead of presenting them as new speed claims.
- Keep one rolling “What's New” Workshop section. `bun run docs:check` checks version/changelog agreement and the **8,000-character body limit**; the upload wrapper also refuses oversized descriptions before building/uploading.

## Publish in this order

1. Validate the finished tree:
   ```bash
   bun run release:validate
   ```
   For mechanics/Rust changes, regenerate the differential corpus and run both sides plus `bun run optimizer:bench` as described in the development matrix. The release gate compiles Rust/WASM (through `build`) but does not run `cargo test` (`bun run wasm:test`) or `bun run optimizer:bench`. A harness build is useful for UI changes; live testing is an escalation, not an automatic release step.
2. Review the diff and commit the release (for example `chore(release): vX.Y.Z`). Keep generated outputs and local Steam files out of the commit.
3. Push the release commit on main:
   ```bash
   git push origin main
   ```
4. With **Steam running and logged into the owning account**, and sibling repo **`../ModUploader-AFNM`** available, upload:
   ```bash
   bun run workshop:upload -- --change-note "vX.Y.Z - What changed" --description-file docs/WORKSHOP_DESCRIPTION.md
   ```
   The wrapper rebuilds CraftBuddy, prepares the sibling uploader, and updates item `3661729323`. Description sync is explicit: omit `--description-file` if the existing public body should stay unchanged. `--skip-build` / `--skip-uploader-prepare` are useful only when those artifacts are already current.
5. After Workshop succeeds, tag the pushed release commit:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
   `.github/workflows/release.yml` checks the tag matches `package.json`, runs `release:validate` plus `wasm:test`, and creates the GitHub Release with the zip. Pushing main alone does not create that release or upload to Workshop.
6. Confirm package version, tag, Workshop change note and uploaded build agree.

## Failure clues

- Steam's `GenericFailure` / “a parameter is invalid” followed by uploader usage text has previously meant an oversized description, not a bad CLI flag.
- A stale copied zip can mask a source fix during installed-client checks; rebuild and recopy when using the runtime skill's escalation path.
