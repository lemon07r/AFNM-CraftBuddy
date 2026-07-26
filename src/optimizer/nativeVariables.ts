import type { HarmonyData } from './gameTypes';
import type { TrackedBuff } from './state';
import { normalizeIdentifier } from './nameNormalization';

const DERIVED_NATIVE_VARIABLE_KEYS = new Set([
  'pool',
  'maxpool',
  'completion',
  'perfection',
  'stability',
  'maxstability',
  'stabilitypenalty',
  'toxicity',
  'maxtoxicity',
  'poolcostflat',
  'poolcostpercentage',
  'stabilitycostpercentage',
  'consumedpills',
  'consumedpillsthisturn',
  'pillsperround',
  'step',
  'maxcompletion',
  'maxperfection',
  'completionpercentage',
  'perfectionpercentage',
  'heat',
]);

function normalizeNativeVariableKey(key: string | undefined): string {
  return normalizeIdentifier(key);
}

function clampForgeHeat(value: number): number {
  return Math.max(0, Math.min(10, Math.floor(value)));
}

function collectBuffVariableAliases(
  buffs: Map<string, TrackedBuff> | undefined,
): Set<string> {
  const aliases = new Set<string>();
  if (!buffs) {
    return aliases;
  }

  buffs.forEach((tracked, key) => {
    const normalizedKey = normalizeNativeVariableKey(key);
    if (normalizedKey) {
      aliases.add(normalizedKey);
    }
    const normalizedName = normalizeNativeVariableKey(tracked.name || key);
    if (normalizedName) {
      aliases.add(normalizedName);
    }
  });

  return aliases;
}

function collectHarmonyVariableAliases(
  harmonyData: HarmonyData | undefined,
): Set<string> {
  const aliases = new Set<string>();

  const forgeHeat = harmonyData?.forgeWorks?.heat;
  if (typeof forgeHeat === 'number' && Number.isFinite(forgeHeat)) {
    aliases.add('Heat');
    aliases.add('heat');
  }

  const additionalData = harmonyData?.additionalData;
  if (!additionalData) {
    return aliases;
  }

  for (const [key, value] of Object.entries(additionalData)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }

    aliases.add(key);
    const normalizedKey = normalizeNativeVariableKey(key);
    if (normalizedKey) {
      aliases.add(normalizedKey);
    }
  }

  return aliases;
}

export function collectDerivedNativeVariableAliases(params: {
  buffs?: Map<string, TrackedBuff>;
  harmonyData?: HarmonyData;
}): Set<string> {
  const aliases = new Set<string>();

  params.buffs?.forEach((tracked, buffKey) => {
    if (buffKey) {
      aliases.add(buffKey);
    }

    const normalizedKey = normalizeNativeVariableKey(buffKey);
    if (normalizedKey) {
      aliases.add(normalizedKey);
    }

    const rawName = String(tracked.name || '').trim();
    if (rawName) {
      aliases.add(rawName);
    }

    const normalizedName = normalizeNativeVariableKey(tracked.name || buffKey);
    if (normalizedName) {
      aliases.add(normalizedName);
    }
  });

  collectHarmonyVariableAliases(params.harmonyData).forEach((alias) => {
    aliases.add(alias);
  });

  return aliases;
}

export function buildCanonicalNativeVariables(params: {
  nativeVariables?: Record<string, number>;
  buffs?: Map<string, TrackedBuff>;
  harmonyData?: HarmonyData;
}): Record<string, number> | undefined {
  const { nativeVariables, buffs, harmonyData } = params;
  if (!nativeVariables) {
    return undefined;
  }

  const buffAliases = collectBuffVariableAliases(buffs);
  const harmonyAliases = collectHarmonyVariableAliases(harmonyData);
  const canonical: Record<string, number> = {};

  for (const [key, value] of Object.entries(nativeVariables)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }

    const normalizedKey = normalizeNativeVariableKey(key);
    if (!normalizedKey) {
      continue;
    }
    if (DERIVED_NATIVE_VARIABLE_KEYS.has(normalizedKey)) {
      continue;
    }
    if (buffAliases.has(normalizedKey)) {
      continue;
    }
    if (harmonyAliases.has(key) || harmonyAliases.has(normalizedKey)) {
      continue;
    }

    canonical[key] = value;
  }

  return Object.keys(canonical).length > 0 ? canonical : undefined;
}

export function applyDerivedNativeVariableAliases(
  variables: Record<string, number>,
  params: {
    buffs?: Map<string, TrackedBuff>;
    harmonyData?: HarmonyData;
  },
): void {
  const { buffs, harmonyData } = params;

  buffs?.forEach((tracked, buffKey) => {
    if (!Number.isFinite(tracked.stacks) || tracked.stacks <= 0) {
      return;
    }

    if (!(buffKey in variables)) {
      variables[buffKey] = tracked.stacks;
    }

    const rawName = String(tracked.name || '').trim();
    if (rawName && !(rawName in variables)) {
      variables[rawName] = tracked.stacks;
    }

    const normalizedName = normalizeNativeVariableKey(tracked.name || buffKey);
    if (normalizedName && !(normalizedName in variables)) {
      variables[normalizedName] = tracked.stacks;
    }
  });

  const forgeHeat = harmonyData?.forgeWorks?.heat;
  if (typeof forgeHeat === 'number' && Number.isFinite(forgeHeat)) {
    const heat = clampForgeHeat(forgeHeat);
    variables.Heat = heat;
    variables.heat = heat;
  }

  const additionalData = harmonyData?.additionalData;
  if (!additionalData) {
    return;
  }

  for (const [key, value] of Object.entries(additionalData)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (!(key in variables)) {
      variables[key] = value;
    }
    const normalizedKey = normalizeNativeVariableKey(key);
    if (normalizedKey && !(normalizedKey in variables)) {
      variables[normalizedKey] = value;
    }
  }
}
