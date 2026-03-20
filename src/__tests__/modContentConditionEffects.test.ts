import type { CraftingRecipeStats, RecipeConditionEffect } from 'afnm-types';

import { resolveConditionEffectsData } from '../modContent/conditionEffects';

function createConditionEffects(
  kind: 'control' | 'intensity',
): RecipeConditionEffect {
  return {
    name: kind === 'control' ? 'Perfectable' : 'Fuseable',
    colour: '#ffffff',
    conditionEffects: {
      neutral: { effects: [] },
      positive: { effects: [{ kind, multiplier: 0.5 }] },
      negative: { effects: [{ kind, multiplier: -0.5 }] },
      veryPositive: { effects: [{ kind, multiplier: 1 }] },
      veryNegative: { effects: [{ kind, multiplier: -1 }] },
    },
  } as unknown as RecipeConditionEffect;
}

describe('modContent condition effect resolution', () => {
  it('prefers live recipeStats condition effects over the stale cache', () => {
    const liveRecipeStats = {
      conditionType: createConditionEffects('intensity'),
    } as CraftingRecipeStats;
    const staleCache = createConditionEffects('control');

    const resolved = resolveConditionEffectsData(liveRecipeStats, staleCache);

    expect(resolved?.positive).toEqual([
      {
        kind: 'intensity',
        multiplier: 0.5,
      },
    ]);
  });

  it('falls back to the cached condition effects when live recipeStats are unavailable', () => {
    const cached = createConditionEffects('control');

    const resolved = resolveConditionEffectsData(undefined, cached);

    expect(resolved?.positive).toEqual([
      {
        kind: 'control',
        multiplier: 0.5,
      },
    ]);
  });
});
