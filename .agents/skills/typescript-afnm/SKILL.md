---
name: typescript-afnm
description: CraftBuddy TypeScript conventions for AFNM ModAPI work. Activate when writing or reviewing TypeScript, adding interfaces, touching globals, or considering any/ts-ignore.
---

# TypeScript For CraftBuddy

This repo runs TypeScript in strict mode and uses runtime-shaped AFNM data. Keep type boundaries explicit.

## Activate When

- Writing or reviewing TypeScript/TSX
- Adding globals, ModAPI calls, replay snapshot shapes, or runtime adapters
- Considering `any`, `@ts-ignore`, unchecked casts, or bundled externals

## Rules

- Never disable `strict` or weaken `tsconfig.json`.
- Prefer `unknown` plus type guards over `any`.
- Keep game/runtime assumptions in `src/modContent/*`; optimizer modules should receive normalized data only.
- Keep React/MUI UI types in `src/ui/*` and do not let UI concerns enter search logic.
- Run `bun run typecheck`; build transpilation is not a substitute.

## Defensive ModAPI Access

AFNM runtime APIs can drift across game versions. Use optional chaining and stable fallbacks:

```typescript
const snapshot = window.modAPI?.getGameStateSnapshot?.() ?? null;
const unsubscribe = window.modAPI?.subscribe?.(() => {
  // observe state changes; dispatch side effects elsewhere
});
const getNextCondition = window.modAPI?.utils?.getNextCondition;
```

Never assume hook/util presence without a guard. Verify questionable APIs with `bun run runtime:grep -- "<symbol>"`.

## CraftBuddy Globals

Declare project globals in `src/global.d.ts`. CraftBuddy's public debug surface is `window.craftBuddyDebug`.

```typescript
declare global {
  interface Window {
    craftBuddyDebug?: CraftBuddyDebugApi;
    modAPI?: ModAPI;
  }
}
```

## AFNM Types

Use `afnm-types` for runtime contracts and import type-only symbols with `import type` when possible:

```typescript
import type { ModAPI, RootState, CraftingTechnique } from 'afnm-types';
import { GAME_VERSION } from 'afnm-types';
```

If installed runtime behavior disagrees with types, verify with `runtime-oracle` / `runtime:grep`, then narrow at the adapter boundary instead of spreading casts.

## Build Externals

React, ReactDOM, MUI, and MUI Icons are runtime externals in `webpack.config.js`; do not bundle duplicate copies.

## Style

Formatting is controlled by `.prettierrc`: 2 spaces, single quotes, trailing commas, LF endings, no tabs.

## Related Skills

- `craftbuddy-runtime-integration` — data-source priority and runtime boundary rules
- `typescript-best-practices` — general TypeScript patterns
