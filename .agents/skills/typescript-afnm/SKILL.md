---
name: typescript-afnm
description: TypeScript conventions and patterns specific to AFNM mod development. Activate when writing or reviewing TypeScript code, adding types or interfaces, or when about to use any or skip type safety.
---

# Skill: TypeScript for AFNM Mods

TypeScript conventions and patterns specific to AFNM mod development.

## When to activate

- When writing or reviewing TypeScript code in this project
- When adding new types or interfaces
- When the agent is about to use `any` or skip type safety

## Conventions

### Strict mode

This project uses `strict: true` in `tsconfig.json`. Never disable it.

### Defensive ModAPI access

Always use optional chaining. The API surface can change across game versions:

```typescript
// Good
window.modAPI?.hooks?.onLocationEnter?.((locationId, flags) => { });
const snap = window.modAPI?.getGameStateSnapshot?.() ?? null;
const flags = window.modAPI?.actions?.getGlobalFlags?.() ?? {};

// Bad — will crash if the method is removed in a future version
window.modAPI.hooks.onLocationEnter((locationId, flags) => { });
```

### Global type declarations

Extend `Window` in `src/global.d.ts` for any globals your mod exposes:

```typescript
declare global {
  interface Window {
    __myModInstalled?: Record<string, boolean>;
    __afnmModDebug?: Record<string, MyDebugApi>;
  }
}
```

### Externalized dependencies

React, ReactDOM, MUI, and MUI Icons are provided by the game runtime. They are configured as webpack externals — never bundle them:

```javascript
// webpack.config.js — already configured
externals: {
  react: 'React',
  'react-dom': 'ReactDOM',
  '@mui/material': 'MaterialUI',
  '@mui/icons-material': 'MaterialUIIcons',
}
```

### Flag types

Global flags are `number` only. Use patterns like:

```typescript
const enabled = (flags['myMod.enabled'] ?? 1) !== 0;  // boolean from number
window.modAPI?.actions?.setGlobalFlag?.('myMod.enabled', enabled ? 1 : 0);
```

### Import types from afnm-types

Use the `afnm-types` package for all game type imports:

```typescript
import type { ModAPI, ModOptionsFC, RootState, CombatEntity } from 'afnm-types';
import { GAME_VERSION } from 'afnm-types';
```

## Rules

- Never use `any`. Use `unknown` and narrow with type guards.
- Never disable strict mode or add `@ts-ignore` without a comment explaining why.
- Run `bun run typecheck` before committing. The build script transpiles without full type checking.
- Keep game-shape assumptions in `src/modContent/` or a dedicated `src/integration/` folder.
- Formatting: 2 spaces, single quotes, trailing commas, LF endings (controlled by `.prettierrc`).
