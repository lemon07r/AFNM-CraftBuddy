import type { CraftingRecipeStats, RecipeItem } from 'afnm-types';

import {
  applyComplexityMultiplier,
  getComplexityMultiplier,
  normalizeHarmonyType,
} from '../optimizer';
import type { HarmonyType } from '../optimizer';

/**
 * The active harmony system for a craft.
 *
 * In 0.7.5 harmony is no longer derived from the item being crafted: the player
 * selects any unlocked harmony before a sublime craft, and the game records that
 * selection on `recipeStats.harmonyType` (via `recipe.harmonyTypeOverride`).
 * The ModAPI's `itemTypeToHarmonyType` utility was removed in the same patch.
 */
export type CraftingType = HarmonyType;

export type CraftingTypeDetectionSource =
  | 'recipeStats.harmonyType'
  | 'recipe.harmonyTypeOverride'
  | 'recipe.harmonyType'
  | 'unchanged';

export type SublimeDetectionSignal =
  | 'explicitTrue'
  | 'craftingMode'
  | 'usesHarmony'
  | 'sublimeOutput'
  | 'capMultiplier';

export interface CraftingTypeResolution {
  craftingType?: CraftingType;
  source: CraftingTypeDetectionSource;
}

export interface SublimeCraftResolution {
  isSublimeCraft: boolean;
  sublimeTargetMultiplier: number;
  isEquipmentCraft: boolean;
  signals: SublimeDetectionSignal[];
  /**
   * Complexity multiplier of the selected harmony. The game multiplies recipe
   * completion/perfection by this at craft start, but only for sublime crafts,
   * so it is 1 for normal crafts.
   */
  complexityMultiplier: number;
}

function getExplicitSublimeFlag(
  recipe: Record<string, unknown> | undefined,
  recipeStats: Record<string, unknown> | undefined,
): boolean | undefined {
  return (
    [recipe?.isSublimeCraft, recipe?.isSublime, recipe?.sublime].find(
      (entry) => typeof entry === 'boolean',
    ) ??
    [recipeStats?.isSublime, recipeStats?.sublime].find(
      (entry) => typeof entry === 'boolean',
    )
  ) as boolean | undefined;
}

export function normalizeCraftingType(
  value: unknown,
): CraftingType | undefined {
  return normalizeHarmonyType(value);
}

export function shouldUseCapAsTargetFallback(params: {
  recipe: RecipeItem | undefined;
  recipeStats: CraftingRecipeStats | undefined;
}): boolean {
  const recipeAny = params.recipe as Record<string, unknown> | undefined;
  const recipeStatsAny = params.recipeStats as Record<string, unknown> | undefined;
  const explicitSublimeFlag = getExplicitSublimeFlag(recipeAny, recipeStatsAny);

  if (recipeAny?.canOvercraft === true || recipeStatsAny?.canOvercraft === true) {
    return false;
  }
  if (recipeAny?.canOvercraft === false || recipeStatsAny?.canOvercraft === false) {
    return true;
  }

  return explicitSublimeFlag === false;
}

/**
 * Resolve the active harmony from the player's selection in craft state.
 *
 * Priority mirrors the game: `mC(recipe, gameFlags)` writes the selected harmony
 * (or `recipe.harmonyTypeOverride` when the recipe forces one) onto
 * `recipeStats.harmonyType`, which the crafting engine then reads for every
 * harmony lookup. Nothing here consults the item being crafted - 0.7.5 removed
 * that mapping - so an unknown selection leaves the previous value in place
 * instead of silently guessing a wrong harmony.
 */
export function resolveCraftingType(params: {
  recipe: RecipeItem | undefined;
  recipeStats: CraftingRecipeStats | undefined;
  previousCraftingType?: CraftingType;
}): CraftingTypeResolution {
  const { recipe, recipeStats, previousCraftingType } = params;
  const recipeAny = recipe as Record<string, unknown> | undefined;
  const recipeStatsAny = recipeStats as Record<string, unknown> | undefined;

  const candidates: Array<{
    value: unknown;
    source: Exclude<CraftingTypeDetectionSource, 'unchanged'>;
  }> = [
    {
      value: recipeStatsAny?.harmonyType,
      source: 'recipeStats.harmonyType',
    },
    {
      value: recipeAny?.harmonyTypeOverride,
      source: 'recipe.harmonyTypeOverride',
    },
    {
      value: recipeAny?.harmonyType,
      source: 'recipe.harmonyType',
    },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeCraftingType(candidate.value);
    if (normalized) {
      return {
        craftingType: normalized,
        source: candidate.source,
      };
    }
  }

  return {
    craftingType: previousCraftingType,
    source: 'unchanged',
  };
}

export function resolveSublimeCraftState(params: {
  recipe: RecipeItem | undefined;
  recipeStats: CraftingRecipeStats | undefined;
  targetCompletion: number;
  targetPerfection: number;
  maxCompletionCap?: number;
  maxPerfectionCap?: number;
  craftingType?: CraftingType;
}): SublimeCraftResolution {
  const {
    recipe,
    recipeStats,
    targetCompletion,
    targetPerfection,
    maxCompletionCap,
    maxPerfectionCap,
    craftingType,
  } = params;
  const recipeAny = recipe as Record<string, unknown> | undefined;
  const recipeStatsAny = recipeStats as Record<string, unknown> | undefined;

  const signals: SublimeDetectionSignal[] = [];
  const explicitSublimeSignal = getExplicitSublimeFlag(
    recipeAny,
    recipeStatsAny,
  );

  if (explicitSublimeSignal === true) {
    signals.push('explicitTrue');
  }

  const craftingMode = String(recipeAny?.craftingMode || '').toLowerCase();
  const hasModeSignal =
    craftingMode === 'sublime' || craftingMode === 'harmony';
  if (hasModeSignal) {
    signals.push('craftingMode');
  }

  const hasHarmonySignal =
    !!recipeAny?.usesHarmony || !!recipeStatsAny?.harmonyBased;
  if (hasHarmonySignal) {
    signals.push('usesHarmony');
  }

  const hasSublimeOutputSignal =
    !!recipeAny?.sublimeItem || !!recipeAny?.canOvercraft;
  if (hasSublimeOutputSignal) {
    signals.push('sublimeOutput');
  }

  const completionCapRatio =
    targetCompletion > 0 && maxCompletionCap !== undefined
      ? maxCompletionCap / targetCompletion
      : 1;
  const perfectionCapRatio =
    targetPerfection > 0 && maxPerfectionCap !== undefined
      ? maxPerfectionCap / targetPerfection
      : 1;
  const inferredCapMultiplier = Math.max(
    1,
    completionCapRatio,
    perfectionCapRatio,
  );
  const capSuggestsSublime = inferredCapMultiplier >= 1.8;
  if (capSuggestsSublime) {
    signals.push('capMultiplier');
  }

  const isSublimeCraft =
    explicitSublimeSignal === true ||
    (explicitSublimeSignal !== false && signals.length > 0);

  const isEquipmentCraft =
    !!recipeAny?.isEquipment ||
    recipeAny?.category === 'equipment' ||
    recipeAny?.type === 'equipment' ||
    recipeAny?.resultType === 'equipment';
  const minimumMultiplier = isEquipmentCraft ? 3.0 : 2.0;

  return {
    isSublimeCraft,
    sublimeTargetMultiplier: isSublimeCraft
      ? Math.max(minimumMultiplier, inferredCapMultiplier)
      : 1.0,
    isEquipmentCraft,
    signals,
    complexityMultiplier: isSublimeCraft
      ? getComplexityMultiplier(craftingType)
      : 1,
  };
}

/**
 * Apply the selected harmony's complexity multiplier to raw recipe targets.
 *
 * The game applies this in `initCrafting`, *after* `deriveRecipeDifficulty` and
 * the `onBeforeCraft` hooks have run:
 *
 *   if (recipe.isSublimeCraft) {
 *     recipeStats.completion = Math.round(recipeStats.completion * cm);
 *     recipeStats.perfection = Math.round(recipeStats.perfection * cm);
 *   }
 *
 * Targets read from live `crafting.recipeStats` are therefore already scaled and
 * must NOT be passed through here. Only pre-init sources need it: the
 * `onDeriveRecipeDifficulty` hook payload and raw `recipe.*` fallbacks.
 */
export function applyHarmonyComplexityToTargets(params: {
  targetCompletion: number;
  targetPerfection: number;
  craftingType: CraftingType | undefined;
  isSublimeCraft: boolean;
}): { targetCompletion: number; targetPerfection: number } {
  return {
    targetCompletion: applyComplexityMultiplier(
      params.targetCompletion,
      params.craftingType,
      params.isSublimeCraft,
    ),
    targetPerfection: applyComplexityMultiplier(
      params.targetPerfection,
      params.craftingType,
      params.isSublimeCraft,
    ),
  };
}
