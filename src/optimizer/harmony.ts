/**
 * CraftBuddy - Harmony System Simulation
 *
 * Deterministic simulation of the 7 harmony types for sublime crafts.
 *
 * Ground truth: installed runtime 0.7.5-d764178 harmony configs (`GH` in
 * `dist-electron/_rolldown_dynamic_import_helper.js`). `CraftingCode/harmony/*`
 * and `0.7.3-nonMinifiedCode/` are readability aids only and are behind 0.7.5.
 *
 * Each harmony type has a processEffect function that updates HarmonyData
 * and returns stat modifiers + harmony changes. These are pure functions
 * with no UI dependencies.
 *
 * Static per-harmony data (complexity multipliers, starting harmony) lives in
 * `./harmonyRegistry.ts`.
 */

import {
  TechniqueType,
  HarmonyType,
  HarmonyData,
  ForgeWorksData,
  AlchemicalArtsData,
  InscribedPatternsData,
  ResonanceData,
  EnhancingEchoData,
  EccentricDecreeData,
  getBonusAndChance,
} from './gameTypes';
import { FORMLESS_HARMONY } from './harmonyRegistry';

/**
 * Result of processing a harmony effect for one action.
 */
export interface HarmonyEffectResult {
  /** Updated harmony data (new sub-system state) */
  harmonyData: HarmonyData;
  /** Change to harmony value (can be negative) */
  harmonyDelta: number;
  /** Stat modifiers applied by the harmony system */
  statModifiers: HarmonyStatModifiers;
  /** Direct stability change (Resonance penalty) */
  stabilityDelta: number;
  /** Direct pool (qi) change (Inscription / Eccentric Decree penalty) */
  poolDelta: number;
  /** Direct stability penalty increase (Inscription penalty) */
  stabilityPenaltyDelta: number;
  /**
   * Absolute harmony value forced by the harmony system, overriding
   * `harmonyDelta` entirely. Formless Way pins harmony every action.
   */
  harmonyOverride?: number;
}

/**
 * Post-action craft figures some harmony systems need in order to resolve.
 *
 * Eccentric Decree compares clamped completion/perfection against the previous
 * action to decide whether the decree was obeyed, and compares band counts
 * against the recipe targets to decide when the focus flips.
 */
export interface HarmonyProcessContext {
  /** Completion after the action resolved. */
  completion: number;
  /** Perfection after the action resolved. */
  perfection: number;
  /** Completion cap (the flat overcraft cap), used to clamp progress. */
  maxCompletion: number;
  /** Perfection cap (the flat overcraft cap), used to clamp progress. */
  maxPerfection: number;
  /** Recipe completion target - one band's width. */
  targetCompletion: number;
  /** Recipe perfection target - one band's width. */
  targetPerfection: number;
}

/** Qi Pool / Stability cost scaling a harmony applies to a single action. */
export interface HarmonyCostMultipliers {
  poolCostPercentage: number;
  stabilityCostPercentage: number;
}

const NEUTRAL_COST_MULTIPLIERS: HarmonyCostMultipliers = {
  poolCostPercentage: 100,
  stabilityCostPercentage: 100,
};

/**
 * Stat modifiers from harmony buffs.
 * These are multiplicative modifiers applied to base stats.
 */
export interface HarmonyStatModifiers {
  controlMultiplier: number;
  intensityMultiplier: number;
  critChanceBonus: number;
  successChanceBonus: number;
  poolCostPercentage: number;
  stabilityCostPercentage: number;
}

const DEFAULT_MODIFIERS: HarmonyStatModifiers = {
  controlMultiplier: 1,
  intensityMultiplier: 1,
  critChanceBonus: 0,
  successChanceBonus: 0,
  poolCostPercentage: 100,
  stabilityCostPercentage: 100,
};

// ============================================================
// Forge Works
// ============================================================

type ForgeHeatBand =
  | 'controlCollapse'
  | 'controlPenalty'
  | 'neutral'
  | 'optimal'
  | 'intensityPenalty'
  | 'intensityCollapse';

export function clampForgeHeat(value: number): number {
  return Math.max(0, Math.min(10, Math.floor(value)));
}

/**
 * Installed runtime verification (0.7.5-d764178) shows the low-control band is
 * heat 2-3, even though some older UI/reference text still says 1-3.
 *
 * Heat 1 falls in no band: the runtime's buff applicator is not called at all,
 * so it neither grants nor clears anything. `getForgeHeatBand` reports
 * `'neutral'` for it; callers that need the *active* buff must use
 * `getEffectiveForgeHeat` to fall back to the last buffed heat.
 */
function getForgeHeatBand(heat: number): ForgeHeatBand {
  if (heat >= 4 && heat <= 6) {
    return 'optimal';
  }
  if (heat >= 2 && heat <= 3) {
    return 'controlPenalty';
  }
  if (heat >= 7 && heat <= 9) {
    return 'intensityPenalty';
  }
  if (heat === 0) {
    return 'controlCollapse';
  }
  if (heat === 10) {
    return 'intensityCollapse';
  }
  return 'neutral';
}

/** True when the runtime refreshes the Heat buff at this heat value. */
function forgeHeatUpdatesBuff(heat: number): boolean {
  return heat !== 1;
}

/**
 * Heat whose buff is actually active.
 *
 * At heat 1 the runtime skips its buff update, leaving the previous band's Heat
 * buff in place. In practice heat 1 is only reachable from heat 2, so this
 * usually means the low-control penalty persists rather than clearing.
 */
export function getEffectiveForgeHeat(data: ForgeWorksData | undefined): number {
  const heat = clampForgeHeat(data?.heat ?? 0);
  if (forgeHeatUpdatesBuff(heat)) {
    return heat;
  }
  return clampForgeHeat(data?.lastBuffedHeat ?? heat);
}

export function getForgeRecommendedTechniqueTypes(
  heat: number,
): TechniqueType[] {
  return clampForgeHeat(heat) <= 4
    ? ['fusion']
    : ['refine', 'support', 'stabilize'];
}

function getForgeWorksStatModifiers(heat: number): HarmonyStatModifiers {
  const mods = { ...DEFAULT_MODIFIERS };
  switch (getForgeHeatBand(heat)) {
    case 'optimal':
      mods.controlMultiplier = 1.5;
      mods.intensityMultiplier = 1.5;
      break;
    case 'controlPenalty':
      mods.controlMultiplier = 0.5;
      break;
    case 'intensityPenalty':
      mods.intensityMultiplier = 0.5;
      break;
    case 'controlCollapse':
      mods.controlMultiplier = -9; // -1000% = 1 + (-10) = -9 (effectively zeroes out)
      break;
    case 'intensityCollapse':
      mods.intensityMultiplier = -9;
      break;
    case 'neutral':
      break;
  }
  return mods;
}

function processForgeWorks(
  harmonyData: HarmonyData,
  techniqueType: TechniqueType,
): HarmonyEffectResult {
  const fw: ForgeWorksData = harmonyData.forgeWorks
    ? { ...harmonyData.forgeWorks }
    : { heat: 0 };

  if (techniqueType === 'fusion') {
    fw.heat += 2;
  } else {
    fw.heat -= 1;
  }
  fw.heat = clampForgeHeat(fw.heat);
  if (forgeHeatUpdatesBuff(fw.heat)) {
    fw.lastBuffedHeat = fw.heat;
  }

  let harmonyDelta = 0;
  switch (getForgeHeatBand(fw.heat)) {
    case 'optimal':
      harmonyDelta = 10;
      break;
    case 'controlPenalty':
    case 'intensityPenalty':
      harmonyDelta = -10;
      break;
    case 'controlCollapse':
    case 'intensityCollapse':
      harmonyDelta = -20;
      break;
    case 'neutral':
      break;
  }

  const recommended = getForgeRecommendedTechniqueTypes(fw.heat);

  return {
    harmonyData: { ...harmonyData, forgeWorks: fw, recommendedTechniqueTypes: recommended },
    harmonyDelta,
    statModifiers: getForgeWorksStatModifiers(getEffectiveForgeHeat(fw)),
    stabilityDelta: 0,
    poolDelta: 0,
    stabilityPenaltyDelta: 0,
  };
}

// ============================================================
// Alchemical Arts
// ============================================================

interface AlchemicalCombo {
  charges: [TechniqueType, TechniqueType, TechniqueType];
  modifiers: Partial<HarmonyStatModifiers>;
}

const ALCHEMICAL_COMBOS: AlchemicalCombo[] = [
  { charges: ['fusion', 'refine', 'support'], modifiers: { stabilityCostPercentage: 75 } },
  { charges: ['fusion', 'refine', 'refine'], modifiers: { intensityMultiplier: 1.25 } },
  { charges: ['fusion', 'fusion', 'refine'], modifiers: { controlMultiplier: 1.25 } },
  { charges: ['fusion', 'refine', 'stabilize'], modifiers: { critChanceBonus: 25 } },
  { charges: ['refine', 'refine', 'support'], modifiers: { poolCostPercentage: 75 } },
  { charges: ['refine', 'stabilize', 'support'], modifiers: { successChanceBonus: 0.25 } },
];

function getNextValidChargeTypes(charges: TechniqueType[]): TechniqueType[] {
  if (charges.length >= 3 || charges.length === 0) return [];

  const validNext = new Set<TechniqueType>();
  for (const combo of ALCHEMICAL_COMBOS) {
    const comboCharges = [...combo.charges];
    let missingCharge = false;
    for (const c of charges) {
      const index = comboCharges.indexOf(c);
      if (index === -1) {
        missingCharge = true;
        break;
      }
      comboCharges.splice(index, 1);
    }
    if (!missingCharge) {
      comboCharges.forEach(c => validNext.add(c));
    }
  }
  return Array.from(validNext).sort();
}

function processAlchemicalArts(
  harmonyData: HarmonyData,
  techniqueType: TechniqueType,
): HarmonyEffectResult {
  const aa: AlchemicalArtsData = harmonyData.alchemicalArts
    ? { charges: [...harmonyData.alchemicalArts.charges], lastCombo: [...harmonyData.alchemicalArts.lastCombo] }
    : { charges: [], lastCombo: [] };
  const additionalData: Record<string, unknown> = harmonyData.additionalData
    ? { ...harmonyData.additionalData }
    : {};
  const existingReaction = additionalData.alchemicalReactionModifiers as Partial<HarmonyStatModifiers> | undefined;

  aa.charges.push(techniqueType);
  aa.charges.sort();

  let harmonyDelta = 0;
  let statModifiers = { ...DEFAULT_MODIFIERS, ...(existingReaction ?? {}) };
  let nextReaction: Partial<HarmonyStatModifiers>;

  if (aa.charges.length < 3) {
    const recommended = getNextValidChargeTypes(aa.charges);
    return {
      harmonyData: {
        ...harmonyData,
        alchemicalArts: aa,
        recommendedTechniqueTypes: recommended,
        additionalData,
      },
      harmonyDelta: 0,
      statModifiers,
      stabilityDelta: 0,
      poolDelta: 0,
      stabilityPenaltyDelta: 0,
    };
  }

  // 3 charges accumulated -- check combo
  const chargesKey = aa.charges.slice(-3).join(',');
  const matchingCombo = ALCHEMICAL_COMBOS.find(
    combo => [...combo.charges].sort().join(',') === chargesKey
  );

  if (matchingCombo) {
    harmonyDelta = 20;
    nextReaction = matchingCombo.modifiers;
    statModifiers = { ...DEFAULT_MODIFIERS, ...nextReaction };
  } else {
    harmonyDelta = -20;
    nextReaction = { controlMultiplier: 0.75 };
    statModifiers = { ...DEFAULT_MODIFIERS, ...nextReaction };
  }

  aa.lastCombo = aa.charges.slice(-3);
  aa.charges = [];
  additionalData.alchemicalReactionModifiers = nextReaction as Record<string, unknown>;

  return {
    harmonyData: {
      ...harmonyData,
      alchemicalArts: aa,
      recommendedTechniqueTypes: [],
      additionalData,
    },
    harmonyDelta,
    statModifiers,
    stabilityDelta: 0,
    poolDelta: 0,
    stabilityPenaltyDelta: 0,
  };
}

// ============================================================
// Inscribed Patterns
// ============================================================

export const INSCRIBED_PATTERN_BLOCK: TechniqueType[] = ['stabilize', 'support', 'fusion', 'refine', 'refine'];

function processInscribedPatterns(
  harmonyData: HarmonyData,
  techniqueType: TechniqueType,
): HarmonyEffectResult {
  const ip: InscribedPatternsData = harmonyData.inscribedPatterns
    ? {
        currentBlock: [...harmonyData.inscribedPatterns.currentBlock],
        completedBlocks: harmonyData.inscribedPatterns.completedBlocks,
        stacks: harmonyData.inscribedPatterns.stacks,
      }
    : { currentBlock: [...INSCRIBED_PATTERN_BLOCK], completedBlocks: 0, stacks: 0 };

  const techniqueIndex = ip.currentBlock.indexOf(techniqueType);
  let harmonyDelta = 0;
  let stabilityPenaltyDelta = 0;
  let poolDelta = 0;

  if (techniqueIndex !== -1) {
    // Valid action
    ip.currentBlock.splice(techniqueIndex, 1);
    ip.stacks += 1;
    harmonyDelta = 10;

    if (ip.currentBlock.length === 0) {
      ip.completedBlocks += 1;
      ip.currentBlock = [...INSCRIBED_PATTERN_BLOCK];
    }
  } else {
    // Invalid action -- penalty
    ip.stacks = Math.floor(ip.stacks * 0.5);
    harmonyDelta = -20;
    stabilityPenaltyDelta = 1;
    poolDelta = -25;
  }

  // Inscription buff: +2% control and intensity per stack
  const stackBonus = ip.stacks * 0.02;
  const statModifiers: HarmonyStatModifiers = {
    ...DEFAULT_MODIFIERS,
    controlMultiplier: 1 + stackBonus,
    intensityMultiplier: 1 + stackBonus,
  };

  return {
    harmonyData: {
      ...harmonyData,
      inscribedPatterns: ip,
      recommendedTechniqueTypes: [...ip.currentBlock],
    },
    harmonyDelta,
    statModifiers,
    stabilityDelta: 0,
    poolDelta,
    stabilityPenaltyDelta,
  };
}

// ============================================================
// Spiritual Resonance
// ============================================================

function processResonance(
  harmonyData: HarmonyData,
  techniqueType: TechniqueType,
): HarmonyEffectResult {
  const res: ResonanceData = harmonyData.resonance
    ? { ...harmonyData.resonance }
    : { resonance: undefined, strength: 0, pendingCount: 0 };

  let harmonyDelta = 0;
  let stabilityDelta = 0;

  if (!res.resonance) {
    // First action -- start resonance
    res.resonance = techniqueType;
    res.strength = 1;
    res.pendingCount = 0;
  } else if (res.resonance === techniqueType) {
    // Same type -- build strength
    res.strength += 1;
    res.pendingResonance = undefined;
    res.pendingCount = 0;
    harmonyDelta = 3 * res.strength;
  } else {
    // Different type
    const isContinuingChange = res.pendingResonance === techniqueType;
    const isSecondOfChange = isContinuingChange && res.pendingCount === 1;

    if (!isSecondOfChange) {
      // Apply penalty
      harmonyDelta = -9;
      stabilityDelta = -3;
      res.strength = Math.max(0, res.strength - 1);
    }

    if (isContinuingChange) {
      res.pendingCount += 1;
      if (res.pendingCount >= 2) {
        // Switch resonance
        res.resonance = techniqueType;
        res.pendingResonance = undefined;
        res.pendingCount = 0;
      }
    } else {
      // New pending type
      res.pendingResonance = techniqueType;
      res.pendingCount = 1;
    }
  }

  // Resonance buff: +3% critchance and +3% successChanceBonus per strength
  const statModifiers: HarmonyStatModifiers = {
    ...DEFAULT_MODIFIERS,
    critChanceBonus: res.strength * 3,
    successChanceBonus: res.strength * 0.03,
  };

  const recommended: TechniqueType[] = res.resonance ? [res.resonance] : [];

  return {
    harmonyData: { ...harmonyData, resonance: res, recommendedTechniqueTypes: recommended },
    harmonyDelta,
    statModifiers,
    stabilityDelta,
    poolDelta: 0,
    stabilityPenaltyDelta: 0,
  };
}

// ============================================================
// Formless Way
// ============================================================

/**
 * Formless Way has no sub-system state and no pattern to follow: it pins
 * harmony at 33 every action and instead demands 100% more completion and
 * perfection (complexity multiplier 1.5).
 */
function processFormless(harmonyData: HarmonyData): HarmonyEffectResult {
  return {
    harmonyData: { ...harmonyData, recommendedTechniqueTypes: [] },
    harmonyDelta: 0,
    harmonyOverride: FORMLESS_HARMONY,
    statModifiers: { ...DEFAULT_MODIFIERS },
    stabilityDelta: 0,
    poolDelta: 0,
    stabilityPenaltyDelta: 0,
  };
}

// ============================================================
// Enhancing Echo
// ============================================================

/** Cost scaling applied when the action echoes the current attunement. */
export const ENHANCING_ECHO_MATCH_COST_PERCENTAGE = 50;

/** Cost scaling applied when the action breaks the current attunement. */
export const ENHANCING_ECHO_DISCORD_COST_PERCENTAGE = 200;

function processEnhancingEcho(
  harmonyData: HarmonyData,
  techniqueType: TechniqueType,
): HarmonyEffectResult {
  const echo: EnhancingEchoData = harmonyData.enhancingEcho
    ? { ...harmonyData.enhancingEcho }
    : { attunedType: undefined };

  let harmonyDelta = 0;

  if (echo.attunedType) {
    if (echo.attunedType === techniqueType) {
      harmonyDelta = 10;
      echo.lastOutcome = 'echo';
    } else {
      harmonyDelta = -10;
      echo.lastOutcome = 'discord';
    }
    echo.attunedType = undefined;
  } else {
    echo.attunedType = techniqueType;
    echo.lastOutcome = 'attune';
  }

  return {
    harmonyData: {
      ...harmonyData,
      enhancingEcho: echo,
      recommendedTechniqueTypes: echo.attunedType ? [echo.attunedType] : [],
    },
    harmonyDelta,
    statModifiers: { ...DEFAULT_MODIFIERS },
    stabilityDelta: 0,
    poolDelta: 0,
    stabilityPenaltyDelta: 0,
  };
}

function getEnhancingEchoCostMultipliers(
  harmonyData: HarmonyData | undefined,
  techniqueType: TechniqueType,
): HarmonyCostMultipliers {
  const attunedType = harmonyData?.enhancingEcho?.attunedType;
  if (!attunedType) {
    return { ...NEUTRAL_COST_MULTIPLIERS };
  }
  const percentage =
    attunedType === techniqueType
      ? ENHANCING_ECHO_MATCH_COST_PERCENTAGE
      : ENHANCING_ECHO_DISCORD_COST_PERCENTAGE;
  return {
    poolCostPercentage: percentage,
    stabilityCostPercentage: percentage,
  };
}

// ============================================================
// Eccentric Decree
// ============================================================

/** Harmony gained when the focused bar advances. */
export const ECCENTRIC_DECREE_OBEY_HARMONY = 5;

/** Harmony lost when the unfocused bar advances. */
export const ECCENTRIC_DECREE_STRAY_HARMONY = -5;

/** Qi Pool lost when the unfocused bar advances. */
export const ECCENTRIC_DECREE_STRAY_POOL = -5;

function getEccentricDecreeStatModifiers(
  focusedBar: 'completion' | 'perfection',
): HarmonyStatModifiers {
  return focusedBar === 'completion'
    ? { ...DEFAULT_MODIFIERS, intensityMultiplier: 1.5 }
    : { ...DEFAULT_MODIFIERS, controlMultiplier: 1.5 };
}

function clampBarValue(value: number, cap: number): number {
  return Math.min(cap, Math.max(0, Math.floor(value)));
}

function processEccentricDecree(
  harmonyData: HarmonyData,
  context: HarmonyProcessContext | undefined,
): HarmonyEffectResult {
  const decree: EccentricDecreeData = harmonyData.eccentricDecree
    ? { ...harmonyData.eccentricDecree }
    : {
        focusedBar: 'completion',
        lastCompletion: 0,
        lastPerfection: 0,
      };

  if (!context) {
    // Without post-action progress we cannot evaluate the decree; leave state
    // untouched rather than inventing a harmony swing.
    return {
      harmonyData: {
        ...harmonyData,
        eccentricDecree: decree,
        recommendedTechniqueTypes:
          decree.focusedBar === 'completion' ? ['fusion'] : ['refine'],
      },
      harmonyDelta: 0,
      statModifiers: getEccentricDecreeStatModifiers(decree.focusedBar),
      stabilityDelta: 0,
      poolDelta: 0,
      stabilityPenaltyDelta: 0,
    };
  }

  const completion = clampBarValue(context.completion, context.maxCompletion);
  const perfection = clampBarValue(context.perfection, context.maxPerfection);
  const completionDelta = completion - decree.lastCompletion;
  const perfectionDelta = perfection - decree.lastPerfection;

  const focusedDelta =
    decree.focusedBar === 'completion' ? completionDelta : perfectionDelta;
  const strayDelta =
    decree.focusedBar === 'completion' ? perfectionDelta : completionDelta;

  let harmonyDelta = 0;
  let poolDelta = 0;
  if (focusedDelta > 0) {
    harmonyDelta += ECCENTRIC_DECREE_OBEY_HARMONY;
  }
  if (strayDelta > 0) {
    harmonyDelta += ECCENTRIC_DECREE_STRAY_HARMONY;
    poolDelta += ECCENTRIC_DECREE_STRAY_POOL;
  }

  const bandTarget =
    decree.focusedBar === 'completion'
      ? context.targetCompletion
      : context.targetPerfection;
  const previousFocusedValue =
    decree.focusedBar === 'completion'
      ? decree.lastCompletion
      : decree.lastPerfection;
  const nextFocusedValue =
    decree.focusedBar === 'completion' ? completion : perfection;

  decree.lastCompletion = completion;
  decree.lastPerfection = perfection;

  const clearedBand =
    getBonusAndChance(nextFocusedValue, bandTarget).guaranteed >
    getBonusAndChance(previousFocusedValue, bandTarget).guaranteed;
  if (clearedBand) {
    decree.focusedBar =
      decree.focusedBar === 'completion' ? 'perfection' : 'completion';
  }

  return {
    harmonyData: {
      ...harmonyData,
      eccentricDecree: decree,
      recommendedTechniqueTypes:
        decree.focusedBar === 'completion' ? ['fusion'] : ['refine'],
    },
    harmonyDelta,
    statModifiers: getEccentricDecreeStatModifiers(decree.focusedBar),
    stabilityDelta: 0,
    poolDelta,
    stabilityPenaltyDelta: 0,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Process harmony effect for a technique action.
 * Returns the updated harmony data, harmony delta, and stat modifiers.
 *
 * @param harmonyData - Current harmony sub-system state
 * @param harmonyType - Which harmony system is active
 * @param techniqueType - The technique type being used
 * @param context - Post-action craft figures, required by Eccentric Decree
 */
export function processHarmonyEffect(
  harmonyData: HarmonyData,
  harmonyType: HarmonyType,
  techniqueType: TechniqueType,
  context?: HarmonyProcessContext,
): HarmonyEffectResult {
  switch (harmonyType) {
    case 'forge':
      return processForgeWorks(harmonyData, techniqueType);
    case 'alchemical':
      return processAlchemicalArts(harmonyData, techniqueType);
    case 'inscription':
      return processInscribedPatterns(harmonyData, techniqueType);
    case 'resonance':
      return processResonance(harmonyData, techniqueType);
    case 'formless':
      return processFormless(harmonyData);
    case 'enhancingEcho':
      return processEnhancingEcho(harmonyData, techniqueType);
    case 'eccentricDecree':
      return processEccentricDecree(harmonyData, context);
    default:
      return {
        harmonyData,
        harmonyDelta: 0,
        statModifiers: { ...DEFAULT_MODIFIERS },
        stabilityDelta: 0,
        poolDelta: 0,
        stabilityPenaltyDelta: 0,
      };
  }
}

/**
 * Initialize harmony data for a new craft.
 */
export function initHarmonyData(harmonyType: HarmonyType): HarmonyData {
  const base: HarmonyData = { recommendedTechniqueTypes: [] };

  switch (harmonyType) {
    case 'forge':
      // Craft start applies the heat-0 buff, so heat 0 is the last buffed heat.
      base.forgeWorks = { heat: 0, lastBuffedHeat: 0 };
      base.recommendedTechniqueTypes = ['fusion'];
      break;
    case 'alchemical':
      base.alchemicalArts = { charges: [], lastCombo: [] };
      break;
    case 'inscription':
      base.inscribedPatterns = {
        currentBlock: [...INSCRIBED_PATTERN_BLOCK],
        completedBlocks: 0,
        stacks: 0,
      };
      base.recommendedTechniqueTypes = [...INSCRIBED_PATTERN_BLOCK];
      break;
    case 'resonance':
      base.resonance = { resonance: undefined, strength: 0, pendingCount: 0 };
      break;
    case 'formless':
      // No sub-system state: Formless Way simply holds harmony at its peak.
      break;
    case 'enhancingEcho':
      base.enhancingEcho = { attunedType: undefined };
      break;
    case 'eccentricDecree':
      base.eccentricDecree = {
        focusedBar: 'completion',
        lastCompletion: 0,
        lastPerfection: 0,
      };
      base.recommendedTechniqueTypes = ['fusion'];
      break;
  }

  return base;
}

/**
 * Qi Pool / Stability cost scaling the active harmony applies to one action.
 *
 * Only Enhancing Echo defines these in 0.7.5: echoing the attuned type halves
 * both costs, breaking the attunement doubles them. Resolved from the harmony
 * state *before* the action is processed, matching the game's live action cost.
 */
export function getHarmonyCostMultipliers(
  harmonyData: HarmonyData | undefined,
  harmonyType: HarmonyType | undefined,
  techniqueType: TechniqueType,
): HarmonyCostMultipliers {
  if (harmonyType === 'enhancingEcho') {
    return getEnhancingEchoCostMultipliers(harmonyData, techniqueType);
  }
  return { ...NEUTRAL_COST_MULTIPLIERS };
}

/**
 * Get current stat modifiers from harmony state (for UI display / gain calculation).
 * This reads the current harmony sub-system state and returns the active modifiers
 * WITHOUT processing a new action.
 */
export function getHarmonyStatModifiers(
  harmonyData: HarmonyData | undefined,
  harmonyType: HarmonyType | undefined,
): HarmonyStatModifiers {
  if (!harmonyData || !harmonyType) return { ...DEFAULT_MODIFIERS };

  switch (harmonyType) {
    case 'forge':
      return getForgeWorksStatModifiers(
        getEffectiveForgeHeat(harmonyData.forgeWorks),
      );
    case 'alchemical': {
      const mods = harmonyData.additionalData?.alchemicalReactionModifiers as
        | Partial<HarmonyStatModifiers>
        | undefined;
      return { ...DEFAULT_MODIFIERS, ...(mods ?? {}) };
    }
    case 'inscription': {
      const stacks = harmonyData.inscribedPatterns?.stacks ?? 0;
      const stackBonus = stacks * 0.02;
      return {
        ...DEFAULT_MODIFIERS,
        controlMultiplier: 1 + stackBonus,
        intensityMultiplier: 1 + stackBonus,
      };
    }
    case 'resonance': {
      const strength = harmonyData.resonance?.strength ?? 0;
      return {
        ...DEFAULT_MODIFIERS,
        critChanceBonus: strength * 3,
        successChanceBonus: strength * 0.03,
      };
    }
    case 'eccentricDecree': {
      const focusedBar =
        harmonyData.eccentricDecree?.focusedBar ?? 'completion';
      return getEccentricDecreeStatModifiers(focusedBar);
    }
    case 'formless':
    case 'enhancingEcho':
      // Formless Way grants no stat modifiers; Enhancing Echo only scales
      // action costs, resolved by getHarmonyCostMultipliers.
      return { ...DEFAULT_MODIFIERS };
    default:
      return { ...DEFAULT_MODIFIERS };
  }
}
