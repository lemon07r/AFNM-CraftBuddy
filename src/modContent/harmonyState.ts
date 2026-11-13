import {
  clampForgeHeat,
  getForgeRecommendedTechniqueTypes,
  HarmonyData,
  HarmonyType,
  HarmonyStatModifiers,
  TechniqueType,
  TrackedBuff,
  resolveReturningCycleData,
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
  // Enhancing Echo and Eccentric Decree arrived with the 0.7.5 harmony rework
  // and were missed here, so their authoritative runtime state was silently
  // dropped during hydration and the simulator restarted them from scratch every
  // poll. Eccentric Decree in particular then lost its focused bar and its
  // last-seen bar values, which 0.7.6 scoring depends on.
  if (harmonyData.enhancingEcho) {
    clone.enhancingEcho = { ...harmonyData.enhancingEcho };
  }
  if (harmonyData.eccentricDecree) {
    clone.eccentricDecree = { ...harmonyData.eccentricDecree };
  }
  if (harmonyData.captivatingCadence) {
    clone.captivatingCadence = { ...harmonyData.captivatingCadence };
  }
  if (harmonyData.returningCycle) {
    clone.returningCycle = { ...harmonyData.returningCycle };
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

const FORGE_BAND_BUFF_HEAT: Record<string, number> = {
  'heat_(frozen)': 0,
  'heat_(low)': 2,
  'heat_(perfect)': 5,
  'heat_(high)': 8,
  'heat_(burning)': 10,
};

/**
 * At heat 1 the runtime skips its band refresh, so the live `Heat (*)` buff
 * still reflects the previous band. Return a heat inside that band.
 */
function getForgeBandHeatFromBuffs(
  buffs: Map<string, TrackedBuff> | undefined,
): number | undefined {
  if (!buffs) {
    return undefined;
  }
  for (const [key, buff] of Array.from(buffs.entries())) {
    if (buff.stacks <= 0) {
      continue;
    }
    const bandHeat = FORGE_BAND_BUFF_HEAT[normalizeBuffKey(buff.name || key)];
    if (bandHeat !== undefined) {
      return bandHeat;
    }
  }
  return undefined;
}

function buildForgeWorks(
  rawHeat: number,
  lastBuffedHeat: number | undefined,
  buffs: Map<string, TrackedBuff> | undefined,
): NonNullable<HarmonyData['forgeWorks']> {
  const heat = clampForgeHeat(rawHeat);
  const bandHeat =
    heat === 1
      ? (lastBuffedHeat ?? getForgeBandHeatFromBuffs(buffs))
      : undefined;
  return bandHeat === undefined ? { heat } : { heat, lastBuffedHeat: bandHeat };
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
    clone.forgeWorks = buildForgeWorks(
      recoveredHeat,
      clone.forgeWorks?.lastBuffedHeat,
      buffs,
    );
    clone.recommendedTechniqueTypes = getForgeRecommendedTechniqueTypes(
      clone.forgeWorks.heat,
    );
  } else if (!clone.recommendedTechniqueTypes.length) {
    clone.recommendedTechniqueTypes = ['fusion'];
  }

  return clone;
}

/**
 * Seed missing Eccentric Decree state from the *current* bars.
 *
 * 0.7.6's `processEffect` / `onBarChange` both do
 * `harmonyData.eccentricDecree ||= { focusedBar: 'completion',
 * lastCompletion: progressState.completion, lastPerfection: ... }`, i.e. they
 * anchor on where the craft stands right now rather than on zero. Mirroring that
 * matters when CraftBuddy attaches to a craft already in progress from a
 * synthesized snapshot: anchoring at zero would credit the first observed turn
 * with every point of progress made before CraftBuddy saw the craft.
 */
function seedEccentricDecreeData(
  harmonyData: HarmonyData,
  completion: number | undefined,
  perfection: number | undefined,
): HarmonyData {
  if (harmonyData.eccentricDecree) {
    return harmonyData;
  }
  const clampBar = (value: number | undefined): number =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0;
  return {
    ...harmonyData,
    eccentricDecree: {
      focusedBar: 'completion',
      lastCompletion: clampBar(completion),
      lastPerfection: clampBar(perfection),
    },
  };
}

function seedCaptivatingCadenceData(harmonyData: HarmonyData): HarmonyData {
  if (harmonyData.captivatingCadence) {
    return harmonyData;
  }
  return {
    ...harmonyData,
    captivatingCadence: {
      lastAction: undefined,
      chain: 0,
    },
  };
}

/** Recognize only the runtime's seven literal Reaction stat payloads. */
function getReactionModifiers(
  buffs: Map<string, TrackedBuff> | undefined,
): Partial<HarmonyStatModifiers> | undefined {
  for (const [key, buff] of Array.from(buffs?.entries() ?? [])) {
    if (normalizeBuffKey(buff.name || key) !== 'reaction') continue;
    const stats = Object.entries(buff.definition?.stats ?? {}).filter(
      ([, value]) => value !== undefined,
    );
    if (stats.length !== 1) return undefined;
    const [stat, scaling] = stats[0];
    if (
      !scaling ||
      Object.entries(scaling).some(
        ([key, value]) =>
          value !== undefined && key !== 'value' && key !== 'stat',
      )
    )
      return undefined;
    if (stat === 'control' && scaling.stat === 'control') {
      if (scaling.value === 0.25) return { controlMultiplier: 1.25 };
      if (scaling.value === -0.25) return { controlMultiplier: 0.75 };
    }
    if (
      stat === 'intensity' &&
      scaling.stat === 'intensity' &&
      scaling.value === 0.25
    )
      return { intensityMultiplier: 1.25 };
    if (scaling.stat !== undefined) return undefined;
    if (scaling.value === 25) {
      if (stat === 'stabilityCostReduction')
        return { stabilityCostReduction: 25 };
      if (stat === 'qiCostReduction') return { qiCostReduction: 25 };
      if (stat === 'critchance') return { critChanceBonus: 25 };
    }
    if (stat === 'successChanceBonus' && scaling.value === 0.25)
      return { successChanceBonus: 0.25 };
    return undefined;
  }
  return undefined;
}

function hydrateAlchemicalReaction(
  data: HarmonyData,
  buffs: Map<string, TrackedBuff> | undefined,
): HarmonyData {
  if (data.additionalData?.alchemicalReactionModifiers !== undefined)
    return data;
  const modifiers = getReactionModifiers(buffs);
  return modifiers
    ? {
        ...data,
        additionalData: {
          ...data.additionalData,
          alchemicalReactionModifiers: modifiers,
        },
      }
    : data;
}

export function hydrateHarmonyData(params: {
  isSublimeCraft: boolean;
  craftingType?: HarmonyType | null;
  progressHarmonyData?: HarmonyData | null;
  nativeVariables?: Record<string, number>;
  rawMaxPool?: number;
  buffs?: Map<string, TrackedBuff>;
  /** Live completion, used to seed absent Eccentric Decree state. */
  completion?: number;
  /** Live perfection, used to seed absent Eccentric Decree state. */
  perfection?: number;
}): { harmonyData?: HarmonyData; source: HarmonyDataSource } {
  const {
    isSublimeCraft,
    craftingType,
    progressHarmonyData,
    nativeVariables,
    buffs,
    completion,
    perfection,
  } = params;

  if (!isSublimeCraft || !craftingType) {
    return { harmonyData: undefined, source: 'missing' };
  }

  if (craftingType === 'returningCycle') {
    const harmonyData = cloneHarmonyData(
      progressHarmonyData ?? { recommendedTechniqueTypes: [] },
    );
    harmonyData.returningCycle = resolveReturningCycleData(
      harmonyData.returningCycle,
      params.rawMaxPool ?? 0,
    );
    harmonyData.recommendedTechniqueTypes = [];
    return {
      harmonyData,
      source: progressHarmonyData ? 'progressState' : 'missing',
    };
  }

  if (progressHarmonyData) {
    if (craftingType === 'forge') {
      return {
        harmonyData: canonicalizeForgeHarmonyData(
          progressHarmonyData,
          nativeVariables,
          buffs,
        ),
        source: 'progressState',
      };
    }
    const cloned = cloneHarmonyData(progressHarmonyData);
    let seeded = cloned;
    if (craftingType === 'eccentricDecree') {
      seeded = seedEccentricDecreeData(cloned, completion, perfection);
    } else if (craftingType === 'captivatingCadence') {
      seeded = seedCaptivatingCadenceData(cloned);
    } else if (craftingType === 'alchemical') {
      seeded = hydrateAlchemicalReaction(cloned, buffs);
    }
    return {
      harmonyData: seeded,
      source: 'progressState',
    };
  }

  if (craftingType === 'alchemical') {
    const harmonyData = hydrateAlchemicalReaction(
      { recommendedTechniqueTypes: [] },
      buffs,
    );
    return harmonyData.additionalData?.alchemicalReactionModifiers !== undefined
      ? { harmonyData, source: 'buffs' }
      : { harmonyData: undefined, source: 'missing' };
  }

  if (craftingType !== 'forge') {
    return { harmonyData: undefined, source: 'missing' };
  }

  const nativeHeat = getForgeHeatFromNativeVariables(nativeVariables);
  if (nativeHeat !== undefined) {
    return {
      harmonyData: {
        forgeWorks: buildForgeWorks(nativeHeat, undefined, buffs),
        recommendedTechniqueTypes:
          getForgeRecommendedTechniqueTypes(nativeHeat),
      },
      source: 'nativeVariables',
    };
  }

  const buffHeat = getForgeHeatFromBuffs(buffs);
  if (buffHeat !== undefined) {
    return {
      harmonyData: {
        forgeWorks: buildForgeWorks(buffHeat, undefined, buffs),
        recommendedTechniqueTypes: getForgeRecommendedTechniqueTypes(buffHeat),
      },
      source: 'buffs',
    };
  }

  return { harmonyData: undefined, source: 'missing' };
}
