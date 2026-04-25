---
name: craftbuddy-release
description: CraftBuddy release and Workshop publishing workflow. Activate when bumping versions, packaging, uploading to Steam Workshop item 3661729323, pushing release commits, tagging GitHub releases, or changing Workshop description copy.
---

# CraftBuddy Release

Use this for release operations only after implementation validation is complete.

## Version Sources

Update both version strings together:

- `package.json`
- `scripts/ui/agent-browser-harness.tsx`

## Release Order

1. Finish code/docs and do a lean docs pass.
2. Run validation:
   ```bash
   bun run test
   bun run build
   bun run docs:inventory   # if docs changed
   bun run docs:check       # if docs changed
   ```
3. Commit the release changes, then push `main`.
4. Upload to Workshop item `3661729323`:
   ```bash
   bun run workshop:upload -- --change-note "vX.Y.Z - What changed"
   ```
   Add `--description-file docs/project/WORKSHOP_DESCRIPTION.md` only when public Workshop copy changes.
5. Push tag `vX.Y.Z` to trigger `.github/workflows/release.yml` and GitHub Release artifact upload.
6. Confirm package version, tag, Workshop note, and uploaded zip all match.

## Workshop Wrapper Facts

- Builds CraftBuddy unless `--skip-build` is passed.
- Prepares sibling `../ModUploader-AFNM` unless `--skip-uploader-prepare` is passed.
- Uses Workshop item `3661729323` by default.
- Requires Steam running and logged into the owning account.

## Gotchas

1. **Do not tag before Workshop upload is ready**: the GitHub workflow only creates GitHub artifacts, not Workshop uploads.
2. **Push the release commit before tagging**: tags must point at the committed release state on `origin/main`.
3. **Version strings must match**: package and UI harness are both user-visible release surfaces.
4. **Description sync is explicit**: do not pass `--description-file` unless Workshop copy intentionally changed.

## References

- `docs/project/RELEASE_PROCESS.md`
- `scripts/workshop-upload.ts`
- `docs/project/WORKSHOP_DESCRIPTION.md`
- `../ModUploader-AFNM`
