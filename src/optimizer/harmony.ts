/**
 * CraftBuddy - Harmony System Simulation
 *
 * Deterministic simulation of the 4 harmony types for sublime crafts.
 * Based on authoritative game code from CraftingCode/harmony/*.tsx.
 *
 * Each harmony type has a processEffect function that updates HarmonyData
 * and returns stat modifiers + harmony changes. These are pure functions
 * with no UI dependencies.
 */

import {
  TechniqueType,
  HarmonyType,
  HarmonyData,
  ForgeWorksData,
  AlchemicalArtsData,
  InscribedPatternsData,
  ResonanceData,
} from './gameTypes';

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
  /** Direct pool (qi) change (Inscription penalty) */
  poolDelta: number;
  /** Direct stability penalty increase (Inscription penalty) */
  stabilityPenaltyDelta: number;
}

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

function getForgeWorksStatModifiers(heat: number): HarmonyStatModifiers {
  const mods = { ...DEFAULT_MODIFIERS };
  if (heat >= 4 && heat <= 6) {
    mods.controlMultiplier = 1.5;
    mods.intensityMultiplier = 1.5;
  } else if (heat >= 2 && heat <= 3) {
    mods.controlMultiplier = 0.5;
  } else if (heat >= 7 && heat <= 9) {
    mods.intensityMultiplier = 0.5;
  } else if (heat === 0) {
    mods.controlMultiplier = -9; // -1000% = 1 + (-10) = -9 (effectively zeroes out)
  } else if (heat === 10) {
    mods.intensityMultiplier = -9;
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
  fw.heat = Math.max(0, Math.min(10, fw.heat));

  let harmonyDelta = 0;
  if (fw.heat >= 4 && fw.heat <= 6) {
    harmonyDelta = 10;
  } else if ((fw.heat >= 2 && fw.heat <= 3) || (fw.heat >= 7 && fw.heat <= 9)) {
    harmonyDelta = -10;
  } else if (fw.heat === 0 || fw.heat === 10) {
    harmonyDelta = -20;
  }

  const recommended: TechniqueType[] = fw.heat <= 4
    ? ['fusion']
    : ['refine', 'support', 'stabilize'];

  return {
    harmonyData: { ...harmonyData, forgeWorks: fw, recommendedTechniqueTypes: recommended },
    harmonyDelta,
    statModifiers: getForgeWorksStatModifiers(fw.heat),
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
  let nextReaction = existingReaction;

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
// Public API
// ============================================================

/**
 * Process harmony effect for a technique action.
 * Returns the updated harmony data, harmony delta, and stat modifiers.
 *
 * @param harmonyData - Current harmony sub-system state
 * @param harmonyType - Which harmony system is active
 * @param techniqueType - The technique type being used
 */
export function processHarmonyEffect(
  harmonyData: HarmonyData,
  harmonyType: HarmonyType,
  techniqueType: TechniqueType,
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
      base.forgeWorks = { heat: 0 };
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
  }

  return base;
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
    case 'forge': {
      const heat = harmonyData.forgeWorks?.heat ?? 0;
      return getForgeWorksStatModifiers(heat);
    }
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
    default:
      return { ...DEFAULT_MODIFIERS };
  }
}
