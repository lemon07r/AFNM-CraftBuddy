import { CraftingTechnique, KnownCraftingTechnique } from 'afnm-types';

export interface ResolveLiveCraftingTechniqueArgs {
  liveTechnique: CraftingTechnique;
  knownTechniqueByName?: ReadonlyMap<string, KnownCraftingTechnique>;
  resolveTechniqueFromKnown?:
    | ((known: KnownCraftingTechnique | undefined) => CraftingTechnique)
    | undefined;
}

export interface ResolvedLiveCraftingTechnique {
  technique: CraftingTechnique;
  source: 'known' | 'live';
  matchedKnownTechnique?: KnownCraftingTechnique;
}

function getCanonicalTechniqueNameKey(
  name: string | undefined,
): string | undefined {
  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildKnownCraftingTechniqueNameMap(
  knownTechniques: KnownCraftingTechnique[] | undefined,
): Map<string, KnownCraftingTechnique> {
  const techniquesByName = new Map<string, KnownCraftingTechnique>();

  for (const knownTechnique of knownTechniques ?? []) {
    const techniqueName = getCanonicalTechniqueNameKey(
      knownTechnique?.technique,
    );
    if (!techniqueName || techniquesByName.has(techniqueName)) {
      continue;
    }
    techniquesByName.set(techniqueName, knownTechnique);
  }

  return techniquesByName;
}

function mergeLiveCraftingTechniqueState(
  resolvedTechnique: CraftingTechnique,
  liveTechnique: CraftingTechnique,
): CraftingTechnique {
  const liveCurrentCooldown = Number(liveTechnique.currentCooldown);

  return {
    ...resolvedTechnique,
    name: liveTechnique.name || resolvedTechnique.name,
    currentCooldown: Number.isFinite(liveCurrentCooldown)
      ? liveTechnique.currentCooldown
      : resolvedTechnique.currentCooldown,
    justClicked: liveTechnique.justClicked ?? resolvedTechnique.justClicked,
  };
}

export function resolveLiveCraftingTechnique({
  liveTechnique,
  knownTechniqueByName,
  resolveTechniqueFromKnown,
}: ResolveLiveCraftingTechniqueArgs): ResolvedLiveCraftingTechnique {
  const liveTechniqueName = getCanonicalTechniqueNameKey(liveTechnique?.name);
  if (
    !liveTechniqueName ||
    !knownTechniqueByName ||
    !resolveTechniqueFromKnown
  ) {
    return {
      technique: liveTechnique,
      source: 'live',
    };
  }

  const matchedKnownTechnique = knownTechniqueByName.get(liveTechniqueName);
  if (!matchedKnownTechnique) {
    return {
      technique: liveTechnique,
      source: 'live',
    };
  }

  const resolvedTechnique = resolveTechniqueFromKnown(matchedKnownTechnique);
  if (!resolvedTechnique) {
    return {
      technique: liveTechnique,
      source: 'live',
      matchedKnownTechnique,
    };
  }

  return {
    technique: mergeLiveCraftingTechniqueState(
      resolvedTechnique,
      liveTechnique,
    ),
    source: 'known',
    matchedKnownTechnique,
  };
}
