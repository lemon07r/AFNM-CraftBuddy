import type { CraftingRecipeStats, RecipeItem } from 'afnm-types';

export type CraftingType = 'forge' | 'alchemical' | 'inscription' | 'resonance';

export type CraftingTypeDetectionSource =
  | 'recipeStats.harmonyType'
  | 'recipe.harmonyType'
  | 'recipe.harmonyTypeOverride'
  | 'recipe.baseItem.kind'
  | 'recipe.perfectItem.kind'
  | 'recipe.sublimeItem.kind'
  | 'recipe.type'
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
  mappedItemKind?: string;
}

export interface SublimeCraftResolution {
  isSublimeCraft: boolean;
  sublimeTargetMultiplier: number;
  isEquipmentCraft: boolean;
  signals: SublimeDetectionSignal[];
}

type ItemHarmonyTypeMap = Partial<Record<string, CraftingType>>;

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
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  switch (normalized) {
    case 'forge':
    case 'alchemical':
    case 'inscription':
    case 'resonance':
      return normalized as CraftingType;
    default:
      return undefined;
  }
}

export function sanitizeItemTypeHarmonyMap(raw: unknown): ItemHarmonyTypeMap {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result: ItemHarmonyTypeMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedType = normalizeCraftingType(value);
    if (!normalizedType) {
      continue;
    }
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey) {
      continue;
    }
    result[normalizedKey] = normalizedType;
  }

  return result;
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

function getMappedCraftingTypeFromItemKind(
  item: unknown,
  mapping: ItemHarmonyTypeMap,
): CraftingType | undefined {
  const kind = String((item as { kind?: unknown } | undefined)?.kind || '')
    .trim()
    .toLowerCase();
  if (!kind) {
    return undefined;
  }
  return mapping[kind];
}

export function resolveCraftingType(params: {
  recipe: RecipeItem | undefined;
  recipeStats: CraftingRecipeStats | undefined;
  itemTypeToHarmonyType?: unknown;
  previousCraftingType?: CraftingType;
}): CraftingTypeResolution {
  const { recipe, recipeStats, itemTypeToHarmonyType, previousCraftingType } =
    params;
  const recipeAny = recipe as Record<string, unknown> | undefined;
  const recipeStatsAny = recipeStats as Record<string, unknown> | undefined;
  const mapping = sanitizeItemTypeHarmonyMap(itemTypeToHarmonyType);

  const directCandidates: Array<{
    value: unknown;
    source: Exclude<CraftingTypeDetectionSource, 'unchanged' | 'recipe.baseItem.kind' | 'recipe.perfectItem.kind' | 'recipe.sublimeItem.kind'>;
  }> = [
    {
      value: recipeStatsAny?.harmonyType,
      source: 'recipeStats.harmonyType',
    },
    {
      value: recipeAny?.harmonyType,
      source: 'recipe.harmonyType',
    },
    {
      value: recipeAny?.harmonyTypeOverride,
      source: 'recipe.harmonyTypeOverride',
    },
    {
      value: recipeAny?.type,
      source: 'recipe.type',
    },
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeCraftingType(candidate.value);
    if (normalized) {
      return {
        craftingType: normalized,
        source: candidate.source,
      };
    }
  }

  const mappedCandidates: Array<{
    item: unknown;
    source:
      | 'recipe.baseItem.kind'
      | 'recipe.perfectItem.kind'
      | 'recipe.sublimeItem.kind';
  }> = [
    {
      item: recipeAny?.baseItem,
      source: 'recipe.baseItem.kind',
    },
    {
      item: recipeAny?.perfectItem,
      source: 'recipe.perfectItem.kind',
    },
    {
      item: recipeAny?.sublimeItem,
      source: 'recipe.sublimeItem.kind',
    },
  ];

  for (const candidate of mappedCandidates) {
    const normalized = getMappedCraftingTypeFromItemKind(
      candidate.item,
      mapping,
    );
    if (normalized) {
      return {
        craftingType: normalized,
        source: candidate.source,
        mappedItemKind: String(
          (candidate.item as { kind?: unknown } | undefined)?.kind || '',
        )
          .trim()
          .toLowerCase(),
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
}): SublimeCraftResolution {
  const {
    recipe,
    recipeStats,
    targetCompletion,
    targetPerfection,
    maxCompletionCap,
    maxPerfectionCap,
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
  };
}
