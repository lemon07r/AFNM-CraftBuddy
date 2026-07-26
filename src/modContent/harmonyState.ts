import {
  clampForgeHeat,
  getForgeRecommendedTechniqueTypes,
  HarmonyData,
  HarmonyType,
  TechniqueType,
  TrackedBuff,
} from '../optimizer';

export type HarmonyDataSource =
  | 'progressState'
  | 'nativeVariables'
  | 'buffs'
  | 'missing';

function sanitizeTechniqueTypes(value: unknown): TechniqueType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is TechniqueType =>
      entry === 'fusion' ||
      entry === 'refine' ||
      entry === 'stabilize' ||
      entry === 'support',
  );
}

function cloneHarmonyData(harmonyData: HarmonyData): HarmonyData {
  const clone: HarmonyData = {
    recommendedTechniqueTypes: sanitizeTechniqueTypes(
      harmonyData.recommendedTechniqueTypes,
    ),
  };

  if (harmonyData.forgeWorks) {
    clone.forgeWorks = { ...harmonyData.forgeWorks };
  }
  if (harmonyData.alchemicalArts) {
    clone.alchemicalArts = {
      charges: [...harmonyData.alchemicalArts.charges],
      lastCombo: [...harmonyData.alchemicalArts.lastCombo],
    };
  }
  if (harmonyData.inscribedPatterns) {
    clone.inscribedPatterns = {
      currentBlock: [...harmonyData.inscribedPatterns.currentBlock],
      completedBlocks: harmonyData.inscribedPatterns.completedBlocks,
      stacks: harmonyData.inscribedPatterns.stacks,
    };
  }
  if (harmonyData.resonance) {
    clone.resonance = { ...harmonyData.resonance };
  }
  if (harmonyData.additionalData !== undefined) {
    clone.additionalData = JSON.parse(
      JSON.stringify(harmonyData.additionalData),
    ) as Record<string, unknown>;
  }

  return clone;
}

function normalizeBuffKey(name: string | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function getForgeHeatFromNativeVariables(
  nativeVariables: Record<string, number> | undefined,
): number | undefined {
  if (!nativeVariables) {
    return undefined;
  }

  const exactKeys = ['Heat', 'heat'];
  for (const key of exactKeys) {
    const value = nativeVariables[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return clampForgeHeat(value);
    }
  }

  for (const [key, value] of Object.entries(nativeVariables)) {
    if (normalizeBuffKey(key) !== 'heat') {
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return clampForgeHeat(value);
    }
  }

  return undefined;
}

function getForgeHeatFromBuffs(
  buffs: Map<string, TrackedBuff> | undefined,
): number | undefined {
  if (!buffs) {
    return undefined;
  }

  let recoveredHeat: number | undefined;
  buffs.forEach((buff, key) => {
    if (recoveredHeat !== undefined) {
      return;
    }
    if (normalizeBuffKey(buff.name || key) !== 'heat') {
      return;
    }
    if (typeof buff.stacks === 'number' && Number.isFinite(buff.stacks)) {
      recoveredHeat = clampForgeHeat(buff.stacks);
    }
  });

  return recoveredHeat;
}

function canonicalizeForgeHarmonyData(
  harmonyData: HarmonyData,
  nativeVariables: Record<string, number> | undefined,
  buffs: Map<string, TrackedBuff> | undefined,
): HarmonyData {
  const clone = cloneHarmonyData(harmonyData);
  const recoveredHeat =
    clone.forgeWorks?.heat ??
    getForgeHeatFromNativeVariables(nativeVariables) ??
    getForgeHeatFromBuffs(buffs);

  if (recoveredHeat !== undefined) {
    clone.forgeWorks = { heat: clampForgeHeat(recoveredHeat) };
    clone.recommendedTechniqueTypes = getForgeRecommendedTechniqueTypes(
      clone.forgeWorks.heat,
    );
  } else if (!clone.recommendedTechniqueTypes.length) {
    clone.recommendedTechniqueTypes = ['fusion'];
  }

  return clone;
}

export function hydrateHarmonyData(params: {
  isSublimeCraft: boolean;
  craftingType?: HarmonyType | null;
  progressHarmonyData?: HarmonyData | null;
  nativeVariables?: Record<string, number>;
  buffs?: Map<string, TrackedBuff>;
}): { harmonyData?: HarmonyData; source: HarmonyDataSource } {
  const {
    isSublimeCraft,
    craftingType,
    progressHarmonyData,
    nativeVariables,
    buffs,
  } = params;

  if (!isSublimeCraft || !craftingType) {
    return { harmonyData: undefined, source: 'missing' };
  }

  if (progressHarmonyData) {
    return {
      harmonyData:
        craftingType === 'forge'
          ? canonicalizeForgeHarmonyData(
              progressHarmonyData,
              nativeVariables,
              buffs,
            )
          : cloneHarmonyData(progressHarmonyData),
      source: 'progressState',
    };
  }

  if (craftingType !== 'forge') {
    return { harmonyData: undefined, source: 'missing' };
  }

  const nativeHeat = getForgeHeatFromNativeVariables(nativeVariables);
  if (nativeHeat !== undefined) {
    return {
      harmonyData: {
        forgeWorks: { heat: nativeHeat },
        recommendedTechniqueTypes: getForgeRecommendedTechniqueTypes(
          nativeHeat,
        ),
      },
      source: 'nativeVariables',
    };
  }

  const buffHeat = getForgeHeatFromBuffs(buffs);
  if (buffHeat !== undefined) {
    return {
      harmonyData: {
        forgeWorks: { heat: buffHeat },
        recommendedTechniqueTypes: getForgeRecommendedTechniqueTypes(buffHeat),
      },
      source: 'buffs',
    };
  }

  return { harmonyData: undefined, source: 'missing' };
}
