---
name: agent-browser
description: Browser automation CLI for agents. Use for opening pages, clicking, filling forms, taking screenshots, reading DOM snapshots, testing local harnesses, or connecting to AFNM/Electron DevTools sessions.
---

# Agent Browser

Use `agent-browser` when browser or Electron UI evidence is needed. Prefer project-specific UI skills first (`craftbuddy-ui-validation` or `spirit-ring-ui`) so you know which harness or DevTools target to use.

## Activate When

- Testing a local browser harness
- Capturing screenshots or accessibility/DOM snapshots
- Clicking through UI flows or forms
- Connecting to an Electron app via Chrome DevTools Protocol
- Collecting visual evidence for regressions

## Core Workflow

```bash
agent-browser open http://127.0.0.1:4173
agent-browser snapshot -i
agent-browser screenshot
```

For Electron/AFNM DevTools sessions, launch the app with `--remote-debugging-port=9222`, then connect or target that port according to the command reference.

## Rules

1. Prefer stable selectors and accessible text over pixel coordinates.
2. Capture a snapshot before and after key interactions.
3. Keep screenshots local to the repo's ignored temp/output path unless the task asks for committed assets.
4. Do not make live Electron testing mandatory when a project harness or runtime oracle can answer the question.
5. Never put credentials, session tokens, or private screenshots in commits.

## AFNM Notes

- CraftBuddy UI work should usually use `bun run ui:harness:build` and `bun run ui:harness:serve` before `agent-browser`.
- ElderGPT UI work should use its committed harness for overlay/session/settings checks.
- Installed-client AFNM testing is opt-in and must follow the repo's live-testing skill/docs, including `disable_steam` cleanup.

## References

- `references/commands.md` — CLI command reference
- `references/session-management.md` — sessions and target reuse
- `references/snapshot-refs.md` — interpreting snapshots
- `references/video-recording.md` — recordings when needed
- `references/authentication.md` — auth/session patterns
- `references/proxy-support.md` — proxy setup
- `references/profiling.md` — performance profiling
- `templates/` — reusable command snippets
