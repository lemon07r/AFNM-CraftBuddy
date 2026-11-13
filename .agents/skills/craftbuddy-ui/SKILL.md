---
name: craftbuddy-ui
description: Use for overlay or settings UI changes, harness work, screenshots, layout regressions, HUD overlap, or native UI integration.
---

# UI work

The committed harness gives repeatable visual evidence without launching AFNM. The adapter/module map and validation matrix are in `docs/DEVELOPMENT.md`.

## Harness workflow

```bash
bun run ui:harness:build
bun run ui:harness:serve
agent-browser open http://127.0.0.1:4173
agent-browser snapshot -i
agent-browser screenshot
```

For HUD overlap, use:

```bash
agent-browser open "http://127.0.0.1:4173/?scene=gamehud&viewport=975x768"
```

That scene simulates a box, not the real viewport's `100vh`. To check height clamping, return to the default scene and set the actual viewport:

```bash
agent-browser open http://127.0.0.1:4173
agent-browser set viewport 975 768
agent-browser screenshot
```

Harness query params (see `scripts/ui/agent-browser-harness.tsx`): `?state=` picks a fixture (for example `outcome-setup`, `outcome-autofinish`, `outcome-legacy`, `auto-ready`, `auto-stopping`, `auto-native-autouse`, `loading`), `?harmony=` selects the harmony type, `?compact=`, `?scene=game`, `?scene=gamehud`, `?scene=options` and `?viewport=WxH` set layout. Capture the changed panel states (settings, auto, loading/stop) as well as normal recommendations.

`?scene=game` renders the panel full-window with the real overlay layout controller, so drag, bottom-left resize, double-click reset and viewport clamping behave as in game; `agent-browser set viewport` the common resolutions (1280x720, 1600x900, 1920x1080, 2560x1440). Copy game art into gitignored `tmp/game-assets/` (for example `crafting-fusion.webp`) for a realistic backdrop; without it the scene uses a dark gradient.

CraftBuddy ships its own typography inside `mod.js` (`src/ui/fonts/`, inlined as data URLs because the mod runs as an inline script): Inter for all functional text and Marcellus (`fonts.display`) only for the brand title. Size text with `tokens.type.*` or `fs(px)` so the Appearance › Text size setting (`uiTextScale`, a CSS variable on the document root) scales the panel, dialog and portalled tooltips together. The game's `normalFont`/`fancyFont` are only used by the harness's fake game HUD; extract them with `bunx --bun @electron/asar extract-file "<game>/resources/app.asar" dist-electron/AfnmNormalFont.ttf` into `tmp/game-fonts/` if needed.

## Integration clues

- Prefer shared styling in `src/ui/theme.ts`, `src/ui/ThemeProvider.tsx` and `src/ui/components/StyledComponents.tsx`; preserve pointer events so the overlay does not block unrelated game controls.
- Consume `SearchResult.outcomeProjection` through `src/utils/outcomeSummary.ts` rather than deriving bands in the UI; this keeps thresholds consistent. Older snapshots without a projection still need their legacy layout.
- Put testable presentation derivations in pure `src/utils/` modules: Jest is configured for Node and `.test.ts`, not component rendering.
- Labels go through `techniqueDisplayName()`, so internal “False Fusion” displays as “Strive for Completion”. Auto-finish wording avoids suggesting a nonexistent manual finish control.
- Decree's readout is an end-state snapshot, not a once-per-turn harmony award. Recheck short-window scroll/height after adding sections.
- Keep React/ReactDOM aligned and respect webpack externals; the standalone harness may catch dependency problems the game bundle does not.
- Import MUI only from the root `@mui/material` / `@mui/icons-material` packages, which webpack maps to the game's `window.MaterialUI` / `window.MaterialUIIcons`. A subpath such as `@mui/material/styles` is bundled as a second MUI copy whose `ThemeProvider` the game's components never see, so in game they fall back to MUI's default light theme (dark text on the dark panel, white dialogs, blue controls). The harness bundles a single copy and cannot show this; `muiExternals.test.ts` guards it, and only icons the game ships are usable (e.g. `HelpOutlineOutlined`, not `HelpOutline`).
- For native options/injection, inspect the runtime APIs and upstream components before building a duplicate host. CraftBuddy's present palette/font choices are not proof of matching the game's theme.

If the harness cannot answer a live integration question, use the runtime skill's escalation path. A successful static audit is not a live UI smoke test.
