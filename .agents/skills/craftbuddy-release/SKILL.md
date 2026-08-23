---
name: craftbuddy-release
description: CraftBuddy release and Workshop publishing workflow. Activate when bumping versions, packaging, uploading to Steam Workshop item 3661729323, pushing release commits, tagging GitHub releases, changing Workshop description copy, or for any Steam Workshop upload mechanics.
---

# CraftBuddy Release

Use this for release operations only after implementation validation is complete. See `docs/project/RELEASE_PROCESS.md` for the full detailed reference.

## Version Sources

Update both version strings together:

- `package.json`
- `scripts/ui/agent-browser-harness.tsx`

## Release Order

1. Finish code/docs and do a lean docs pass.
2. Run validation:
   ```bash
   bun run docs:inventory   # first, if docs changed
   bun run release:validate
   ```
3. Commit the release changes, then push `main`.
4. Upload to Workshop item `3661729323`:
   ```bash
   bun run workshop:upload -- --change-note "vX.Y.Z - What changed"
   ```
   Add `--description-file docs/project/WORKSHOP_DESCRIPTION.md` only when public Workshop copy changes.
5. Push tag `vX.Y.Z` to trigger `.github/workflows/release.yml` and GitHub Release artifact upload.
6. Confirm package version, tag, Workshop note, and uploaded zip all match.

## Workshop Upload Mechanics

- The wrapper builds CraftBuddy unless `--skip-build` is passed.
- Prepares sibling `../ModUploader-AFNM` unless `--skip-uploader-prepare` is passed.
- Uses Workshop item `3661729323` by default.
- Requires Steam running and logged into the owning account.
- Never commit Steam credentials, login files, or local uploader artifacts.
- Do not sync title/description unless explicitly intended.
- Preview images should stay small; the uploader can compress large images.
- **Steam caps the description at 8,000 characters.** Exceeding it fails late, with Steam reporting only `a parameter is invalid` / `GenericFailure` after the zip has already uploaded - the uploader then prints its usage text, which looks like a bad flag but is not. Check the length of `WORKSHOP_DESCRIPTION.md`'s body (frontmatter excluded) before uploading:
  ```bash
  bun -e 'const t=require("fs").readFileSync("docs/project/WORKSHOP_DESCRIPTION.md","utf8").trim();const b=t.startsWith("---")?t.slice(t.indexOf("\n---",3)+4).trim():t;console.log(b.length,"/ 8000")'
  ```
  Keep the rolling `What's New in v6` section concise rather than adding a separate block for every v6.x release; the full per-release history lives in `docs/project/RELEASE_NOTES_*.md`.

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
- `pre-commit-validation` skill — validation before publishing
- `conventional-git` skill — release commit/tag naming
