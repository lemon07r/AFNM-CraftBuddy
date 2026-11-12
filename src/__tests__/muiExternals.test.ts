import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// webpack externalizes only the root `@mui/material` and `@mui/icons-material`
// packages onto the game's `window.MaterialUI`/`window.MaterialUIIcons`. A
// subpath import (e.g. `@mui/material/styles`) is bundled as a second MUI copy
// with its own theme context, so the game's components silently fall back to
// MUI's default light theme instead of CraftBuddy's.
const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'generated'
        ? []
        : sourceFiles(path);
    }
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('MUI externals', () => {
  it('imports MUI only through the externalized root packages', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      const pattern = /from\s+['"](@mui\/[^'"]+|@emotion\/[^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        if (
          match[1] !== '@mui/material' &&
          match[1] !== '@mui/icons-material'
        ) {
          offenders.push(`${relative(SRC, file)}: ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
