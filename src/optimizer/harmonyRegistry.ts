/**
 * CraftBuddy - Harmony Registry (AFNM 0.7.5)
 *
 * Static, data-only description of every harmony type the game supports.
 *
 * Ground truth: installed runtime 0.7.5-d764178, harmony config registry
 * (`GH` in `dist-electron/_rolldown_dynamic_import_helper.js`). Verified via
 * `bun run runtime:oracle` / `bun run runtime:extract`.
 *
 * The 0.7.5 harmony rework decoupled harmony from item kind: the player picks
 * any unlocked harmony before a sublime craft, and the chosen harmony scales the
 * recipe's completion/perfection targets by its own complexity multiplier.
 *
 * Runtime observations that this module encodes:
 *
 *   initCrafting(recipe, recipeStats):
 *     if (recipe.isSublimeCraft) {
 *       const cm = GH[recipeStats.harmonyType].complexityMultiplier;
 *       recipeStats.completion = Math.round(recipeStats.completion * cm);
 *       recipeStats.perfection = Math.round(recipeStats.perfection * cm);
 *     }
 *     let harmony = 25;
 *     if (recipe.isSublimeCraft) harmony = GH[harmonyType].startingHarmony ?? 0;
 *     else if (recipe.realm === 'bodyForging') harmony = 50;
 *
 * Dynamic (state dependent) behaviour - the per-harmony state machines and the
 * Enhancing Echo cost multipliers - lives in `./harmony.ts`; this module stays
 * free of state so it can be consumed by config derivation and the UI.
 */

import { HarmonyType } from './gameTypes';

/** Every harmony type available in 0.7.5, in the game's own registry order. */
export const HARMONY_TYPES: readonly HarmonyType[] = [
  'forge',
  'alchemical',
  'inscription',
  'resonance',
  'formless',
  'enhancingEcho',
  'eccentricDecree',
];

/** Harmony value Formless Way holds for the whole craft (runtime `dRa`). */
export const FORMLESS_HARMONY = 33;

/** Starting harmony for a normal (non-sublime) craft. */
export const DEFAULT_STARTING_HARMONY = 25;

/** Starting harmony for a non-sublime Body Forging craft. */
export const BODY_FORGING_STARTING_HARMONY = 50;

/**
 * Static definition of a harmony type.
 *
 * `qiCostMultiplier` / `stabilityCostMultiplier` are intentionally absent here:
 * in 0.7.5 they are functions of `(technique, harmonyData)` rather than
 * constants, so they are resolved by `getHarmonyCostMultipliers` in
 * `./harmony.ts`. `modifiesActionCosts` flags the harmonies that define them.
 */
export interface HarmonyDefinition {
  readonly id: HarmonyType;
  /** Player-facing name, matching `recipeHarmonyTypeToName` in afnm-types. */
  readonly name: string;
  /** Multiplies recipe completion/perfection targets on sublime crafts. */
  readonly complexityMultiplier: number;
  /**
   * Harmony value forced at the start of a sublime craft.
   *
   * The game reads `startingHarmony ?? 0`, so every harmony except Formless Way
   * begins a sublime craft at 0.
   */
  readonly startingHarmony: number;
  /** True when the harmony scales live Qi Pool / Stability action costs. */
  readonly modifiesActionCosts: boolean;
  /**
   * True when the harmony pins the harmony value every action rather than
   * accumulating deltas (Formless Way holds its tide at its peak).
   */
  readonly pinsHarmony: boolean;
}

const DEFINITIONS: Readonly<Record<HarmonyType, HarmonyDefinition>> = {
  forge: {
    id: 'forge',
    name: 'Forge Works',
    complexityMultiplier: 1.2,
    startingHarmony: 0,
    modifiesActionCosts: false,
    pinsHarmony: false,
  },
  alchemical: {
    id: 'alchemical',
    name: 'Alchemical Arts',
    complexityMultiplier: 1.2,
    startingHarmony: 0,
    modifiesActionCosts: false,
    pinsHarmony: false,
  },
  inscription: {
    id: 'inscription',
    name: 'Inscribed Patterns',
    complexityMultiplier: 0.9,
    startingHarmony: 0,
    modifiesActionCosts: false,
    pinsHarmony: false,
  },
  resonance: {
    id: 'resonance',
    name: 'Spiritual Resonance',
    complexityMultiplier: 1.3,
    startingHarmony: 0,
    modifiesActionCosts: false,
    pinsHarmony: false,
  },
  formless: {
    id: 'formless',
    name: 'Formless Way',
    complexityMultiplier: 1.5,
    startingHarmony: FORMLESS_HARMONY,
    modifiesActionCosts: false,
    pinsHarmony: true,
  },
  enhancingEcho: {
    id: 'enhancingEcho',
    name: 'Enhancing Echo',
    complexityMultiplier: 1.3,
    startingHarmony: 0,
    modifiesActionCosts: true,
    pinsHarmony: false,
  },
  eccentricDecree: {
    id: 'eccentricDecree',
    name: 'Eccentric Decree',
    complexityMultiplier: 1,
    startingHarmony: 0,
    modifiesActionCosts: false,
    pinsHarmony: false,
  },
};

const warnedUnknownHarmonies = new Set<string>();

export function isHarmonyType(value: unknown): value is HarmonyType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(DEFINITIONS, value)
  );
}

/**
 * Normalize an arbitrary runtime value into a known harmony type.
 *
 * Comparison is case-insensitive so DOM-scraped labels still resolve, but no
 * item-kind inference happens here: 0.7.5 removed that mapping entirely.
 */
export function normalizeHarmonyType(value: unknown): HarmonyType | undefined {
  if (isHarmonyType(value)) {
    return value;
  }
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return HARMONY_TYPES.find((type) => type.toLowerCase() === normalized);
}

/**
 * Definition for a harmony type, or `undefined` for unknown/modded ids.
 */
export function getHarmonyDefinition(
  harmonyType: HarmonyType | undefined,
): HarmonyDefinition | undefined {
  return harmonyType ? DEFINITIONS[harmonyType] : undefined;
}

/**
 * Complexity multiplier for a harmony type.
 *
 * Unknown or modded harmonies degrade to a neutral 1.0 and log once, so a new
 * harmony type shipped by the game does not silently distort every target.
 */
export function getComplexityMultiplier(
  harmonyType: HarmonyType | undefined,
): number {
  if (harmonyType === undefined) {
    return 1;
  }
  const definition = DEFINITIONS[harmonyType];
  if (definition) {
    return definition.complexityMultiplier;
  }
  if (!warnedUnknownHarmonies.has(harmonyType)) {
    warnedUnknownHarmonies.add(harmonyType);
    console.warn(
      `[CraftBuddy] Unknown harmony type "${harmonyType}"; using a neutral complexity multiplier of 1.`,
    );
  }
  return 1;
}

/**
 * Apply a harmony's complexity multiplier to a recipe stat.
 *
 * Mirrors `initCrafting`: the multiplier only applies to sublime crafts, and a
 * non-positive multiplier is treated as neutral (the game guards the inverse
 * operation with the same `n <= 0` check).
 */
export function applyComplexityMultiplier(
  stat: number,
  harmonyType: HarmonyType | undefined,
  isSublimeCraft: boolean,
): number {
  if (!isSublimeCraft || !Number.isFinite(stat)) {
    return stat;
  }
  const multiplier = getComplexityMultiplier(harmonyType);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return stat;
  }
  return Math.round(stat * multiplier);
}

/**
 * Recover the unscaled recipe stat from an already-scaled one.
 *
 * Mirrors the runtime's inverse helper, which the game uses when displaying
 * base recipe numbers outside a craft.
 */
export function removeComplexityMultiplier(
  scaledStat: number,
  harmonyType: HarmonyType | undefined,
  isSublimeCraft: boolean,
): number {
  if (!isSublimeCraft || !Number.isFinite(scaledStat)) {
    return scaledStat;
  }
  const multiplier = getComplexityMultiplier(harmonyType);
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return scaledStat;
  }
  return Math.round(scaledStat / multiplier);
}

/**
 * Harmony value a craft starts at.
 *
 * Sublime crafts use the harmony's own `startingHarmony` (0 for everything
 * except Formless Way); normal crafts start at 25, or 50 in Body Forging.
 */
export function resolveStartingHarmony(params: {
  harmonyType: HarmonyType | undefined;
  isSublimeCraft: boolean;
  realm?: string;
}): number {
  if (params.isSublimeCraft) {
    return getHarmonyDefinition(params.harmonyType)?.startingHarmony ?? 0;
  }
  return params.realm === 'bodyForging'
    ? BODY_FORGING_STARTING_HARMONY
    : DEFAULT_STARTING_HARMONY;
}
