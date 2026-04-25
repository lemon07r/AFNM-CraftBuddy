---
name: craftbuddy-ui-validation
description: CraftBuddy UI and validation workflow. Activate for src/ui changes, overlay layout, settings panels, harness work, screenshots, visual regressions, HUD overlap, and optional installed-client UI checks.
---

# CraftBuddy UI Validation

Use the committed browser harness first for UI work. Live game UI validation is optional and disruptive.

## Activate When

- Editing `src/ui/*`, `src/settings/*`, or UI-facing `src/modContent/*`
- Investigating overlay placement, HUD overlap, settings layout, auto-mode panel behavior, or screenshots
- Needing browser automation evidence for visual behavior

## Local Harness Workflow

```bash
bun run ui:harness:build
bun run ui:harness:serve
agent-browser open http://127.0.0.1:4173
agent-browser snapshot -i
agent-browser screenshot
```

For the narrow HUD-overlap regression scene:

```bash
agent-browser open "http://127.0.0.1:4173/?scene=gamehud&viewport=975x768"
```

## What To Capture

- Normal recommendation fixture.
- Settings panel if settings layout changed.
- Auto panel visible for auto-mode UI changes.
- Loading/stop state when auto-mode status changes.
- HUD constrained scene for overlap/safe-lane changes.

## Runtime UI Rules

- Keep `react` and `react-dom` versions aligned.
- Standalone harness failure is meaningful even if webpack still builds.
- For runtime-sensitive integration, use `runtime-oracle` before launching the installed app.
- Rebuild `dist/`/zip before installed-client validation; stale artifacts can mask source fixes.

## Optional Live Game Path

Only use live UI when explicitly requested or when harness/oracle cannot answer the question. Follow `live-game-testing`; never launch through Steam by default, never launch from the repo cwd, and always remove `disable_steam` afterward.

## Gotchas

1. **The harness is the default UI proof**: do not rely on static review for visual/layout changes.
2. **Stale zip risk**: the installed game loads the copied zip, not the latest source tree.
3. **DevTools launch is disruptive**: use a non-repo working directory and only when the path is actually automated.
4. **Auto-mode needs both UI and behavior checks**: pair panel screenshots with unit tests for controller/executor logic.

## References

- `docs/project/TESTING.md`
- `scripts/ui/agent-browser-harness.tsx`
- `src/ui/RecommendationPanel.tsx`
- `src/ui/SettingsPanel.tsx`
