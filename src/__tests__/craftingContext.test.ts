import type { CraftingRecipeStats, RecipeItem } from 'afnm-types';
import {
  applyHarmonyComplexityToTargets,
  normalizeCraftingType,
  resolveCraftingType,
  resolveSublimeCraftState,
  shouldUseCapAsTargetFallback,
} from '../modContent/craftingContext';

describe('crafting context resolution', () => {
  it('normalizes all seven harmony types', () => {
    expect(normalizeCraftingType(' Forge ')).toBe('forge');
    expect(normalizeCraftingType('ALCHEMICAL')).toBe('alchemical');
    expect(normalizeCraftingType('formless')).toBe('formless');
    expect(normalizeCraftingType('enhancingecho')).toBe('enhancingEcho');
    expect(normalizeCraftingType('eccentricDecree')).toBe('eccentricDecree');
    expect(normalizeCraftingType('equipment')).toBeUndefined();
    expect(normalizeCraftingType(undefined)).toBeUndefined();
  });

  it('reads the player-selected harmony from recipeStats over the recipe override', () => {
    const recipe = {
      baseItem: { kind: 'pill' },
      harmonyTypeOverride: 'resonance',
    } as unknown as RecipeItem;
    const recipeStats = {
      harmonyType: 'inscription',
    } as unknown as CraftingRecipeStats;

    expect(
      resolveCraftingType({
        recipe,
        recipeStats,
      }),
    ).toEqual({
      craftingType: 'inscription',
      source: 'recipeStats.harmonyType',
    });
  });

  it('uses recipe.harmonyTypeOverride as the forced case', () => {
    const recipe = {
      baseItem: { kind: 'pill' },
      harmonyTypeOverride: 'eccentricDecree',
    } as unknown as RecipeItem;

    expect(
      resolveCraftingType({
        recipe,
        recipeStats: undefined,
      }),
    ).toEqual({
      craftingType: 'eccentricDecree',
      source: 'recipe.harmonyTypeOverride',
    });
  });

  it('never infers harmony from the item kind (0.7.5 removed that mapping)', () => {
    const recipe = {
      baseItem: { kind: 'pill' },
      perfectItem: { kind: 'pill' },
      sublimeItem: { kind: 'pill' },
    } as unknown as RecipeItem;

    expect(
      resolveCraftingType({
        recipe,
        recipeStats: undefined,
      }),
    ).toEqual({
      craftingType: undefined,
      source: 'unchanged',
    });
  });

  it('keeps the previous crafting type when no authoritative signal is present', () => {
    expect(
      resolveCraftingType({
        recipe: undefined,
        recipeStats: undefined,
        previousCraftingType: 'forge',
      }),
    ).toEqual({
      craftingType: 'forge',
      source: 'unchanged',
    });
  });

  it('infers sublime crafts from live recipe outputs and cap multipliers', () => {
    const recipe = {
      sublimeItem: { kind: 'artefact' },
      canOvercraft: true,
    } as unknown as RecipeItem;

    expect(
      resolveSublimeCraftState({
        recipe,
        recipeStats: undefined,
        targetCompletion: 100,
        targetPerfection: 100,
        maxCompletionCap: 200,
        maxPerfectionCap: 100,
      }),
    ).toEqual({
      isSublimeCraft: true,
      sublimeTargetMultiplier: 2,
      isEquipmentCraft: false,
      signals: ['sublimeOutput', 'capMultiplier'],
      complexityMultiplier: 1,
    });
  });

  it('reports the selected harmony complexity multiplier for sublime crafts', () => {
    const recipe = {
      isSublimeCraft: true,
    } as unknown as RecipeItem;

    expect(
      resolveSublimeCraftState({
        recipe,
        recipeStats: undefined,
        targetCompletion: 100,
        targetPerfection: 100,
        craftingType: 'formless',
      }).complexityMultiplier,
    ).toBe(1.5);

    expect(
      resolveSublimeCraftState({
        recipe,
        recipeStats: undefined,
        targetCompletion: 100,
        targetPerfection: 100,
        craftingType: 'inscription',
      }).complexityMultiplier,
    ).toBe(0.9);
  });

  it('respects explicit false sublime flags over weaker inferred signals', () => {
    const recipe = {
      isSublimeCraft: false,
      sublimeItem: { kind: 'artefact' },
      canOvercraft: true,
    } as unknown as RecipeItem;

    expect(
      resolveSublimeCraftState({
        recipe,
        recipeStats: undefined,
        targetCompletion: 100,
        targetPerfection: 100,
        maxCompletionCap: 100,
        maxPerfectionCap: 100,
      }),
    ).toEqual({
      isSublimeCraft: false,
      sublimeTargetMultiplier: 1,
      isEquipmentCraft: false,
      signals: ['sublimeOutput'],
      complexityMultiplier: 1,
    });
  });

  it('scales unscaled sublime targets by the harmony complexity multiplier', () => {
    expect(
      applyHarmonyComplexityToTargets({
        targetCompletion: 175,
        targetPerfection: 121,
        craftingType: 'formless',
        isSublimeCraft: true,
      }),
    ).toEqual({
      targetCompletion: 263,
      targetPerfection: 182,
    });
  });

  it('leaves non-sublime targets untouched', () => {
    expect(
      applyHarmonyComplexityToTargets({
        targetCompletion: 175,
        targetPerfection: 121,
        craftingType: 'formless',
        isSublimeCraft: false,
      }),
    ).toEqual({
      targetCompletion: 175,
      targetPerfection: 121,
    });
  });

  it('degrades unknown harmonies to a neutral multiplier', () => {
    expect(
      applyHarmonyComplexityToTargets({
        targetCompletion: 175,
        targetPerfection: 121,
        craftingType: undefined,
        isSublimeCraft: true,
      }),
    ).toEqual({
      targetCompletion: 175,
      targetPerfection: 121,
    });
  });

  it('uses exact cap targets as a fallback only for non-overcraft crafts', () => {
    expect(
      shouldUseCapAsTargetFallback({
        recipe: { canOvercraft: false } as unknown as RecipeItem,
        recipeStats: undefined,
      }),
    ).toBe(true);

    expect(
      shouldUseCapAsTargetFallback({
        recipe: { canOvercraft: true } as unknown as RecipeItem,
        recipeStats: undefined,
      }),
    ).toBe(false);

    expect(
      shouldUseCapAsTargetFallback({
        recipe: { isSublimeCraft: false } as unknown as RecipeItem,
        recipeStats: undefined,
      }),
    ).toBe(true);

    expect(
      shouldUseCapAsTargetFallback({
        recipe: { isSublimeCraft: true } as unknown as RecipeItem,
        recipeStats: undefined,
      }),
    ).toBe(false);
  });
});
