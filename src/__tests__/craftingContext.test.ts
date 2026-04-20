import type { CraftingRecipeStats, RecipeItem } from 'afnm-types';
import {
  normalizeCraftingType,
  resolveCraftingType,
  resolveSublimeCraftState,
  sanitizeItemTypeHarmonyMap,
  shouldUseCapAsTargetFallback,
} from '../modContent/craftingContext';

describe('crafting context resolution', () => {
  it('normalizes only supported crafting types', () => {
    expect(normalizeCraftingType(' Forge ')).toBe('forge');
    expect(normalizeCraftingType('ALCHEMICAL')).toBe('alchemical');
    expect(normalizeCraftingType('equipment')).toBeUndefined();
    expect(normalizeCraftingType(undefined)).toBeUndefined();
  });

  it('sanitizes runtime item-to-harmony mappings', () => {
    expect(
      sanitizeItemTypeHarmonyMap({
        pill: 'alchemical',
        artefact: 'forge',
        invalid: 'equipment',
        empty: '',
      }),
    ).toEqual({
      pill: 'alchemical',
      artefact: 'forge',
    });
  });

  it('prefers explicit harmony type fields over item-kind mapping', () => {
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
        itemTypeToHarmonyType: {
          pill: 'alchemical',
        },
      }),
    ).toEqual({
      craftingType: 'inscription',
      source: 'recipeStats.harmonyType',
    });
  });

  it('falls back to runtime item-kind harmony mapping when explicit fields are missing', () => {
    const recipe = {
      baseItem: { kind: 'pill' },
    } as unknown as RecipeItem;

    expect(
      resolveCraftingType({
        recipe,
        recipeStats: undefined,
        itemTypeToHarmonyType: {
          pill: 'alchemical',
        },
      }),
    ).toEqual({
      craftingType: 'alchemical',
      source: 'recipe.baseItem.kind',
      mappedItemKind: 'pill',
    });
  });

  it('keeps the previous crafting type when no authoritative signal is present', () => {
    expect(
      resolveCraftingType({
        recipe: undefined,
        recipeStats: undefined,
        itemTypeToHarmonyType: undefined,
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
    });
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
