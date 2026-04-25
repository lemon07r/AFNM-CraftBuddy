---
name: frontend-mod-ui
description: AFNM/CraftBuddy mod UI guidance. Activate for settings panels, injected UI, persistent overlays, React/MUI components, browser harness checks, or visual integration with the AFNM Electron runtime.
---

# Frontend Mod UI

CraftBuddy uses a persistent React/MUI overlay for recommendations and settings. AFNM game components are useful for screen/options integrations, but CraftBuddy's main UI should stay aligned with `src/ui/*` and the committed harness.

## Activate When

- Editing `src/ui/*` or UI-facing settings
- Adding settings/options/injected UI
- Fixing overlay size, z-index, pointer events, HUD overlap, or visual regressions

## CraftBuddy UI Rules

- Keep shared styling in `src/ui/theme.ts`, `ThemeProvider.tsx`, and `src/ui/components/StyledComponents.tsx`.
- Keep panel state and settings boundaries clear; do not push game extraction logic into UI components.
- Preserve pointer-event behavior so the overlay is interactive without blocking unrelated game UI.
- Use the harness for visual validation before live installed-client checks.
- Keep React and ReactDOM versions matched.

## AFNM Game UI Components

When implementing native settings/options/screen affordances, prefer game-provided components where available:

- `GameDialog` for dialog containers
- `GameButton` / `GameIconButton` for actions
- `BackgroundImage` and `PlayerComponent` for full screens
- `window.React.createElement` in options contexts where JSX is unavailable

## Validation

```bash
bun run ui:harness:build
bun run ui:harness:serve
agent-browser open http://127.0.0.1:4173
```

Use `craftbuddy-ui-validation` for screenshot/snapshot expectations and live-test escalation.

## Gotchas

1. **Harness first**: static code review is not enough for layout changes.
2. **Game React surface differs from bundler imports**: respect webpack externals and runtime globals.
3. **Options UI can lack JSX conveniences**: use `window.React.createElement` when required.
4. **Live testing is opt-in**: use runtime oracle/harness before launching AFNM.

## Related Skills

- `craftbuddy-ui-validation`
- `frontend-design`
- `live-game-testing`
