import type {
  CraftingCondition,
  CraftingRecipeStats,
  RecipeConditionEffect,
} from 'afnm-types';

import { parseRecipeConditionEffects, type ConditionEffect } from '../optimizer';

type ParsedConditionEffects = Record<CraftingCondition, ConditionEffect[]>;

function getLiveConditionEffectSource(
  recipeStats?: CraftingRecipeStats,
): RecipeConditionEffect | undefined {
  const liveConditionType = (recipeStats as any)?.conditionType as
    | RecipeConditionEffect
    | undefined;
  if (!liveConditionType?.conditionEffects) {
    return undefined;
  }
  return liveConditionType;
}

export function resolveConditionEffectsData(
  recipeStats?: CraftingRecipeStats,
  cachedConditionEffects?: RecipeConditionEffect | null,
): ParsedConditionEffects | undefined {
  const liveConditionEffects = getLiveConditionEffectSource(recipeStats);
  if (liveConditionEffects?.conditionEffects) {
    return parseRecipeConditionEffects(liveConditionEffects.conditionEffects);
  }

  if (cachedConditionEffects?.conditionEffects) {
    return parseRecipeConditionEffects(cachedConditionEffects.conditionEffects);
  }

  return undefined;
}
