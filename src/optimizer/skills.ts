/**
 * CraftBuddy - Skill Definitions and Application
 * 
 * Defines skill structures and the logic for applying skills to crafting state.
 * Ports the Python skill application logic to TypeScript.
 */

import { CraftingState, BuffType } from './state';

export interface SkillDefinition {
  name: string;
  key: string;
  qiCost: number;
  stabilityCost: number;
  baseCompletionGain: number;
  basePerfectionGain: number;
  stabilityGain: number;
  /** Max stability change from this skill (negative = loss, positive = gain) */
  maxStabilityChange: number;
  buffType: BuffType;
  buffDuration: number;
  /** Buff multiplier value (e.g., 1.4 for 40% boost) - read from game buff data */
  buffMultiplier: number;
  type: 'fusion' | 'refine' | 'stabilize' | 'support';
  /** Whether this skill scales with control */
  scalesWithControl?: boolean;
  /** Whether this skill scales with intensity */
  scalesWithIntensity?: boolean;
  /** Special skill that converts buffs to gains */
  isDisciplinedTouch?: boolean;
  /** Whether this skill prevents the normal max stability decay of 1 per turn */
  preventsMaxStabilityDecay?: boolean;
  /** Toxicity cost for alchemy crafting */
  toxicityCost?: number;
  /** Toxicity cleanse amount (for cleanse skills) */
  toxicityCleanse?: number;
  /** Cooldown in turns after use */
  cooldown?: number;
  /** Mastery bonuses applied to this skill */
  mastery?: SkillMastery;
}

/**
 * Mastery bonuses that modify skill effectiveness.
 * Read from CraftingTechnique.mastery array.
 */
export interface SkillMastery {
  /** Percentage bonus to control scaling (e.g., 0.1 = +10%) */
  controlBonus?: number;
  /** Percentage bonus to intensity scaling (e.g., 0.1 = +10%) */
  intensityBonus?: number;
  /** Flat reduction to qi cost */
  poolCostReduction?: number;
  /** Flat reduction to stability cost */
  stabilityCostReduction?: number;
  /** Bonus to success chance */
  successChanceBonus?: number;
  /** Bonus to crit chance */
  critChanceBonus?: number;
  /** Bonus to crit multiplier */
  critMultiplierBonus?: number;
}

export interface SkillGains {
  completion: number;
  perfection: number;
  stability: number;
  toxicityCleanse?: number;
}

export interface OptimizerConfig {
  maxQi: number;
  maxStability: number;
  baseIntensity: number;
  baseControl: number;
  minStability: number;
  skills: SkillDefinition[];
  /** Default buff multiplier if not specified per-skill (e.g., 1.4 for 40%) */
  defaultBuffMultiplier: number;
  /** Max toxicity for alchemy crafting (0 for non-alchemy) */
  maxToxicity?: number;
  /** Crafting type: forge, alchemical, inscription, resonance */
  craftingType?: 'forge' | 'alchemical' | 'inscription' | 'resonance';
}

/**
 * Default skill definitions based on the Python optimizer config.
 * These can be overridden with actual game data at runtime.
 */
export const DEFAULT_SKILLS: SkillDefinition[] = [
  {
    name: 'Simple Fusion',
    key: 'simple_fusion',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 12,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Energised Fusion',
    key: 'energised_fusion',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 21,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Cycling Fusion',
    key: 'cycling_fusion',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 9,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.CONTROL,
    buffDuration: 2,
    buffMultiplier: 1.4,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Disciplined Touch',
    key: 'disciplined_touch',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'support',
    isDisciplinedTouch: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Cycling Refine',
    key: 'cycling_refine',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 0,
    basePerfectionGain: 12,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.INTENSITY,
    buffDuration: 2,
    buffMultiplier: 1.4,
    type: 'refine',
    scalesWithControl: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Simple Refine',
    key: 'simple_refine',
    qiCost: 18,
    stabilityCost: 10,
    baseCompletionGain: 0,
    basePerfectionGain: 16,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'refine',
    scalesWithControl: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Stabilize',
    key: 'stabilize',
    qiCost: 10,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 20,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'stabilize',
    preventsMaxStabilityDecay: true,
  },
];

/**
 * Default optimizer configuration
 */
export const DEFAULT_CONFIG: OptimizerConfig = {
  maxQi: 194,
  maxStability: 60,
  baseIntensity: 12,
  baseControl: 16,
  minStability: 10,
  skills: DEFAULT_SKILLS,
  defaultBuffMultiplier: 1.4,
};

/**
 * Calculate gains for Disciplined Touch skill.
 * Converts existing buffs into completion and perfection gains.
 */
export function calculateDisciplinedTouchGains(
  state: CraftingState,
  baseIntensity: number
): SkillGains {
  const intensity = state.getIntensity(baseIntensity);
  // Base is 6 at 12 intensity, scales proportionally
  const gain = Math.floor((6 * intensity) / 12);
  return {
    completion: gain,
    perfection: gain,
    stability: 0,
  };
}

/**
 * Calculate the gains from applying a skill to the current state.
 * Important: Uses CURRENT state's buffs, not buffs granted by this skill.
 * Now includes mastery bonuses for control/intensity scaling.
 */
export function calculateSkillGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  controlCondition: number = 1.0
): SkillGains {
  // Handle Disciplined Touch specially
  if (skill.isDisciplinedTouch) {
    return calculateDisciplinedTouchGains(state, config.baseIntensity);
  }

  let completionGain = skill.baseCompletionGain;
  let perfectionGain = skill.basePerfectionGain;
  let stabilityGain = skill.stabilityGain;
  let toxicityCleanse = skill.toxicityCleanse || 0;

  // Get mastery bonuses
  const mastery = skill.mastery || {};
  const controlMasteryBonus = 1 + (mastery.controlBonus || 0);
  const intensityMasteryBonus = 1 + (mastery.intensityBonus || 0);

  // Apply control scaling for refine skills (with mastery bonus)
  if (skill.scalesWithControl) {
    const baseControl = config.baseControl * controlMasteryBonus;
    const control = Math.floor(state.getControl(baseControl) * controlCondition);
    // Scale based on base control of 16
    perfectionGain = Math.floor((skill.basePerfectionGain * control) / 16);
    completionGain = 0;
  }

  // Apply intensity scaling for fusion skills (with mastery bonus)
  if (skill.scalesWithIntensity && skill.type === 'fusion') {
    const baseIntensity = config.baseIntensity * intensityMasteryBonus;
    const intensity = state.getIntensity(baseIntensity);
    // Scale based on base intensity of 12
    completionGain = Math.floor((skill.baseCompletionGain * intensity) / 12);
  }

  return {
    completion: completionGain,
    perfection: perfectionGain,
    stability: stabilityGain,
    toxicityCleanse,
  };
}

/**
 * Get effective qi cost after mastery reductions.
 */
export function getEffectiveQiCost(skill: SkillDefinition): number {
  const mastery = skill.mastery || {};
  return Math.max(0, skill.qiCost - (mastery.poolCostReduction || 0));
}

/**
 * Get effective stability cost after mastery reductions.
 */
export function getEffectiveStabilityCost(skill: SkillDefinition): number {
  const mastery = skill.mastery || {};
  return Math.max(0, skill.stabilityCost - (mastery.stabilityCostReduction || 0));
}

/**
 * Check if a skill can be applied given the current state.
 * Now handles cooldowns, toxicity, and mastery cost reductions.
 */
export function canApplySkill(
  state: CraftingState,
  skill: SkillDefinition,
  minStability: number,
  maxToxicity: number = 0
): boolean {
  // Check cooldown
  if (state.isOnCooldown(skill.key)) {
    return false;
  }

  // Get effective costs after mastery reductions
  const effectiveQiCost = getEffectiveQiCost(skill);
  const effectiveStabilityCost = getEffectiveStabilityCost(skill);

  // Check qi requirement
  if (state.qi < effectiveQiCost) {
    return false;
  }

  // Check stability requirement - must stay >= minStability after action
  if (effectiveStabilityCost > 0 && state.stability - effectiveStabilityCost < minStability) {
    return false;
  }

  // Check toxicity requirement for alchemy crafting
  // Skill cannot be used if it would push toxicity over max
  if (maxToxicity > 0 && skill.toxicityCost) {
    if (state.toxicity + skill.toxicityCost > maxToxicity) {
      return false;
    }
  }

  return true;
}

/**
 * Apply a skill to the state and return the new state.
 * Returns null if the skill cannot be applied.
 * 
 * IMPORTANT: This function now properly handles:
 * - Max stability decay (decreases by 1 each turn unless skill prevents it)
 * - Max stability changes from skill effects
 * - Buff multipliers read from game data
 * - Toxicity costs and cleansing for alchemy
 * - Cooldowns for skills
 * - Mastery cost reductions
 */
export function applySkill(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  controlCondition: number = 1.0
): CraftingState | null {
  const maxToxicity = config.maxToxicity || 0;
  
  // Validate skill can be applied
  if (!canApplySkill(state, skill, config.minStability, maxToxicity)) {
    return null;
  }

  // Calculate gains BEFORE applying buffs from this skill
  const gains = calculateSkillGains(state, skill, config, controlCondition);

  // Get effective costs after mastery reductions
  const effectiveQiCost = getEffectiveQiCost(skill);
  const effectiveStabilityCost = getEffectiveStabilityCost(skill);

  // Calculate new resource values
  let newQi = state.qi - effectiveQiCost;
  
  // Handle max stability changes:
  // 1. Apply any direct max stability change from the skill effect
  // 2. Apply the standard decay of 1 per turn (unless skill prevents it)
  let newMaxStability = state.maxStability + (skill.maxStabilityChange || 0);
  
  // Standard max stability decay: decreases by 1 each turn unless skill prevents it
  if (!skill.preventsMaxStabilityDecay) {
    newMaxStability = Math.max(0, newMaxStability - 1);
  }
  
  // Calculate new stability (current stability, not max)
  let newStability = state.stability - effectiveStabilityCost + gains.stability;

  // Cap stability at new max stability
  if (newStability > newMaxStability) {
    newStability = newMaxStability;
  }

  // Handle toxicity for alchemy crafting
  let newToxicity = state.toxicity;
  if (skill.toxicityCost) {
    newToxicity += skill.toxicityCost;
  }
  // Apply toxicity cleanse
  if (gains.toxicityCleanse && gains.toxicityCleanse > 0) {
    newToxicity = Math.max(0, newToxicity - gains.toxicityCleanse);
  }

  // Decrement existing buff durations
  let newControlBuffTurns = state.controlBuffTurns > 0 ? state.controlBuffTurns - 1 : 0;
  let newIntensityBuffTurns = state.intensityBuffTurns > 0 ? state.intensityBuffTurns - 1 : 0;

  // Apply NEW buffs from this skill (active next turn)
  // Also update buff multipliers if the skill provides them
  let newControlBuffMultiplier = state.controlBuffMultiplier;
  let newIntensityBuffMultiplier = state.intensityBuffMultiplier;
  
  if (skill.buffType === BuffType.CONTROL) {
    newControlBuffTurns = skill.buffDuration;
    // Use skill's buff multiplier if provided, otherwise use config default
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      newControlBuffMultiplier = skill.buffMultiplier;
    } else if (config.defaultBuffMultiplier) {
      newControlBuffMultiplier = config.defaultBuffMultiplier;
    }
  } else if (skill.buffType === BuffType.INTENSITY) {
    newIntensityBuffTurns = skill.buffDuration;
    // Use skill's buff multiplier if provided, otherwise use config default
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      newIntensityBuffMultiplier = skill.buffMultiplier;
    } else if (config.defaultBuffMultiplier) {
      newIntensityBuffMultiplier = config.defaultBuffMultiplier;
    }
  }

  // Update cooldowns: decrement all existing cooldowns by 1, then set this skill's cooldown
  const newCooldowns = new Map<string, number>();
  state.cooldowns.forEach((turns, key) => {
    if (turns > 1) {
      newCooldowns.set(key, turns - 1);
    }
  });
  // Set cooldown for the skill just used
  if (skill.cooldown && skill.cooldown > 0) {
    newCooldowns.set(skill.key, skill.cooldown);
  }

  // Create new state with all updates
  return state.copy({
    qi: newQi,
    stability: newStability,
    maxStability: newMaxStability,
    completion: state.completion + gains.completion,
    perfection: state.perfection + gains.perfection,
    controlBuffTurns: newControlBuffTurns,
    intensityBuffTurns: newIntensityBuffTurns,
    controlBuffMultiplier: newControlBuffMultiplier,
    intensityBuffMultiplier: newIntensityBuffMultiplier,
    toxicity: newToxicity,
    cooldowns: newCooldowns,
    history: [...state.history, skill.name],
  });
}

/**
 * Get all skills that can be applied in the current state.
 * Now considers cooldowns and toxicity limits.
 */
export function getAvailableSkills(
  state: CraftingState,
  config: OptimizerConfig
): SkillDefinition[] {
  const maxToxicity = config.maxToxicity || 0;
  return config.skills.filter(skill => canApplySkill(state, skill, config.minStability, maxToxicity));
}

/**
 * Check if the state is terminal (no valid actions possible).
 */
export function isTerminalState(
  state: CraftingState,
  config: OptimizerConfig
): boolean {
  return getAvailableSkills(state, config).length === 0;
}
