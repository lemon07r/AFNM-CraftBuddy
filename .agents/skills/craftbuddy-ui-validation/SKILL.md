---
name: craftbuddy-ui-validation
description: CraftBuddy UI and validation workflow. Activate for src/ui changes, overlay layout, settings panels, harness work, screenshots, visual regressions, HUD overlap, and optional installed-client UI checks.
---

# CraftBuddy UI Validation

Use the committed browser harness first for UI work. Live game UI validation is optional and disruptive. Target game version: AFNM **0.7.10**.

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

The `gamehud` scene is a simulated box, so it does **not** exercise `100vh` clamping. To check the panel's height budget on a short window, use the default scene with a real viewport:

```bash
agent-browser set viewport 975 768
```

Outcome-row fixtures are available through harness params, including a perfection-bound state, an auto-finish state, a `setupFor` hint, a legacy result with no outcome projection, the native-auto-use notice state, and `?harmony=`.

## What To Capture

- Normal recommendation fixture.
- Settings panel if settings layout changed.
- Auto panel visible for auto-mode UI changes.
- Loading/stop state when auto-mode status changes.
- HUD constrained scene for overlap/safe-lane changes.
- Outcome rows: projected vs target tier, per-bar bands, the binding-bar marker, the auto-finish badge, and the legacy fixture that must render without them.

## Runtime UI Rules

- **No band logic in `src/ui`.** Tier, band counts, points-to-next-band, the binding bar and the auto-finish state all come from `SearchResult.outcomeProjection` via `src/utils/outcomeSummary.ts`. The panel maps tones to theme colours and nothing else.
- Presentation logic that needs tests goes in a pure `src/utils/*` module: Jest runs in `node` and does not match `.tsx`.
- A result without an `outcomeProjection` (a pre-6.0 replay fixture) must render the legacy layout instead of throwing.
- There is no manual finish, so copy says "will auto-finish" — never "you can finish crafting now".
- Render technique labels through `techniqueDisplayName()` from `src/optimizer/index.ts`; never print the internal `name` directly.
- The panel clamps to the game window height and scrolls; any new panel section needs a re-measurement on a short viewport.
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
5. **Display names diverge from internal names**: `false_fusion` / internal `name` `False Fusion` must show as "Strive for Completion". Any hardcoded technique string in `src/ui/*` is a bug; use `techniqueDisplayName()` and keep lookups keyed on `name`.
6. **Eccentric Decree resolves per bar change**: since 0.7.6 its harmony scoring and focused bar can change several times within one turn, so a harmony readout is a snapshot of the end state, not a per-turn constant. Do not label it as a once-per-turn value in copy or tooltips.

## References

- `docs/project/TESTING.md`
- `scripts/ui/agent-browser-harness.tsx`
- `src/ui/RecommendationPanel.tsx`
- `src/ui/SettingsPanel.tsx`
- `src/utils/outcomeSummary.ts`
