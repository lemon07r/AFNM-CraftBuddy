/**
 * CraftBuddy - Skill Definitions and Application
 * 
 * Defines skill structures and the logic for applying skills to crafting state.
 * Ports the Python skill application logic to TypeScript.
 */

import { CraftingState, BuffType } from './state';
import { safeFloor, safeAdd, safeMultiply, checkPrecision } from '../utils/largeNumbers';

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
  /** Icon/image path for the skill (from game's CraftingTechnique.icon) */
  icon?: string;
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
  /** Required crafting condition to use this skill (e.g., 'veryPositive' for Harmonious skills) */
  conditionRequirement?: 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative';
  /** Whether this skill restores Qi (for tracking Qi recovery skills) */
  restoresQi?: boolean;
  /** Amount of Qi restored */
  qiRestore?: number;
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
  /** 
   * Whether this is sublime/harmony crafting mode.
   * Sublime crafting allows exceeding normal target limits:
   * - Standard sublime: 2x normal targets
   * - Equipment crafting: potentially higher multipliers
   */
  isSublimeCraft?: boolean;
  /**
   * Target multiplier for sublime crafting.
   * Default: 1.0 (normal), 2.0 (sublime), higher for equipment.
   * This affects how the optimizer evaluates "overshoot" penalties.
   */
  targetMultiplier?: number;
}

/**
 * Default skill definitions based on the Python optimizer config.
 * These can be overridden with actual game data at runtime.
 * 
 * Note: baseCompletionGain and basePerfectionGain are MULTIPLIERS, not raw values.
 * The actual gain is calculated as: multiplier * stat (intensity or control).
 * For example: Simple Fusion with multiplier 1.0 and intensity 12 gives 1.0 * 12 = 12 completion.
 */
export const DEFAULT_SKILLS: SkillDefinition[] = [
  {
    name: 'Simple Fusion',
    key: 'simple_fusion',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 1.0, // Multiplier: 1.0 * intensity
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
    baseCompletionGain: 1.8, // Multiplier: 1.8 * intensity (matches game data)
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
    baseCompletionGain: 0.75, // Multiplier: 0.75 * intensity (matches game data)
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
    baseCompletionGain: 0.5, // Multiplier for completion (matches game data)
    basePerfectionGain: 0.5, // Multiplier for perfection (matches game data)
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    isDisciplinedTouch: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Cycling Refine',
    key: 'cycling_refine',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 0,
    basePerfectionGain: 0.75, // Multiplier: 0.75 * control (matches game data)
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
    basePerfectionGain: 1.0, // Multiplier: 1.0 * control
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
    stabilityGain: 20, // Flat value, not a multiplier
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
 * 
 * The skill uses the current buff states to calculate gains:
 * - Completion gain scales with intensity (boosted by intensity buff if active)
 * - Perfection gain scales with control (boosted by control buff if active)
 * 
 * @param state - Current crafting state with buff information
 * @param skill - The Disciplined Touch skill definition with multipliers
 * @param config - Optimizer config with base stats
 * @param controlCondition - Current condition multiplier for control
 */
export function calculateDisciplinedTouchGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  controlCondition: number = 1.0
): SkillGains {
  // Get effective stats with buffs applied
  const effectiveIntensity = state.getIntensity(config.baseIntensity);
  const effectiveControl = state.getControl(config.baseControl) * controlCondition;
  
  // Use skill's multipliers (baseCompletionGain and basePerfectionGain)
  // These are typically 0.5 each for Disciplined Touch
  // Use safe arithmetic to handle large late-game values
  const completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, effectiveIntensity));
  const perfectionGain = safeFloor(safeMultiply(skill.basePerfectionGain, effectiveControl));
  
  return {
    completion: completionGain,
    perfection: perfectionGain,
    stability: 0,
  };
}

/**
 * Calculate the gains from applying a skill to the current state.
 * Important: Uses CURRENT state's buffs, not buffs granted by this skill.
 * Now includes mastery bonuses for control/intensity scaling.
 * 
 * The game's technique data provides a multiplier value (e.g., 2.0 for Harmonious Fusion).
 * The actual gain is calculated as: multiplier * stat (intensity or control).
 * For example: Harmonious Fusion with value=2 and intensity=20 gives 2*20=40 completion.
 */
export function calculateSkillGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  controlCondition: number = 1.0
): SkillGains {
  // Handle Disciplined Touch specially - it uses both intensity and control with buffs
  if (skill.isDisciplinedTouch) {
    return calculateDisciplinedTouchGains(state, skill, config, controlCondition);
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
  // The baseXxxGain is actually a multiplier from the game data
  // Actual gain = multiplier * control * condition * mastery
  // Use safe arithmetic to handle large late-game values
  if (skill.scalesWithControl) {
    const baseControl = safeMultiply(config.baseControl, controlMasteryBonus);
    const control = safeMultiply(state.getControl(baseControl), controlCondition);
    // basePerfectionGain is the multiplier (e.g., 2.0 for Harmonious Refine)
    perfectionGain = safeFloor(safeMultiply(skill.basePerfectionGain, control));
    // Some refine skills also give completion (like Disciplined Touch)
    if (skill.baseCompletionGain > 0) {
      completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, control));
    } else {
      completionGain = 0;
    }
  }

  // Apply intensity scaling for fusion skills (with mastery bonus)
  // The baseXxxGain is actually a multiplier from the game data
  // Actual gain = multiplier * intensity * mastery
  // Use safe arithmetic to handle large late-game values
  if (skill.scalesWithIntensity && skill.type === 'fusion') {
    const baseIntensity = safeMultiply(config.baseIntensity, intensityMasteryBonus);
    const intensity = state.getIntensity(baseIntensity);
    // baseCompletionGain is the multiplier (e.g., 2.0 for Harmonious Fusion)
    completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, intensity));
  }

  return {
    completion: completionGain,
    perfection: perfectionGain,
    stability: stabilityGain,
    toxicityCleanse,
  };
}

/**
 * Check if a condition requirement is met by the current condition.
 * Skills require EXACT condition match - e.g., Harmonious skills only work during Harmonious (positive),
 * NOT during Brilliant (veryPositive). This matches the game's behavior.
 */
export function checkConditionRequirement(
  requirement: 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative',
  current: 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative'
): boolean {
  // Exact match required - skills with condition requirements only work during that exact condition
  // e.g., Harmonious (positive) skills do NOT work during Brilliant (veryPositive)
  return requirement === current;
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
 * Now handles cooldowns, toxicity, mastery cost reductions, and condition requirements.
 */
export function canApplySkill(
  state: CraftingState,
  skill: SkillDefinition,
  minStability: number,
  maxToxicity: number = 0,
  currentCondition?: 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative'
): boolean {
  // Check cooldown
  if (state.isOnCooldown(skill.key)) {
    return false;
  }

  // Check condition requirement (e.g., Harmonious skills require specific conditions)
  if (skill.conditionRequirement && currentCondition) {
    // Check if current condition meets the requirement
    // veryPositive requirement: only veryPositive works
    // positive requirement: positive or veryPositive works
    // negative requirement: negative or veryNegative works
    // veryNegative requirement: only veryNegative works
    const conditionMet = checkConditionRequirement(skill.conditionRequirement, currentCondition);
    if (!conditionMet) {
      return false;
    }
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

  // Disciplined Touch consumes all active buffs after using them for gains
  // This is the key mechanic - buffs are converted to gains and then removed
  if (skill.isDisciplinedTouch) {
    newControlBuffTurns = 0;
    newIntensityBuffTurns = 0;
  }

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
  // Use safe arithmetic for completion/perfection to handle large late-game values
  return state.copy({
    qi: newQi,
    stability: newStability,
    maxStability: newMaxStability,
    completion: safeAdd(state.completion, gains.completion),
    perfection: safeAdd(state.perfection, gains.perfection),
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
 * Now considers cooldowns, toxicity limits, and condition requirements.
 */
export function getAvailableSkills(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative'
): SkillDefinition[] {
  const maxToxicity = config.maxToxicity || 0;
  return config.skills.filter(skill => canApplySkill(state, skill, config.minStability, maxToxicity, currentCondition));
}

/**
 * Check if the state is terminal (no valid actions possible).
 */
export function isTerminalState(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative'
): boolean {
  return getAvailableSkills(state, config, currentCondition).length === 0;
}

/**
 * Diagnostic info for why a skill is blocked.
 */
export interface SkillBlockedReason {
  skillName: string;
  reason: 'cooldown' | 'qi' | 'stability' | 'toxicity' | 'condition';
  details: string;
}

/**
 * Get diagnostic information about why each skill is blocked.
 * Returns an array of reasons for all skills that cannot be used.
 */
export function getBlockedSkillReasons(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative'
): SkillBlockedReason[] {
  const reasons: SkillBlockedReason[] = [];
  const maxToxicity = config.maxToxicity || 0;

  for (const skill of config.skills) {
    // Check cooldown
    if (state.isOnCooldown(skill.key)) {
      const turnsLeft = state.cooldowns.get(skill.key) || 0;
      reasons.push({
        skillName: skill.name,
        reason: 'cooldown',
        details: `On cooldown (${turnsLeft} turn${turnsLeft > 1 ? 's' : ''} left)`,
      });
      continue;
    }

    // Check condition requirement
    if (skill.conditionRequirement && currentCondition) {
      const conditionMet = checkConditionRequirement(skill.conditionRequirement, currentCondition);
      if (!conditionMet) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: `Requires ${skill.conditionRequirement} condition (current: ${currentCondition})`,
        });
        continue;
      }
    }

    // Get effective costs after mastery reductions
    const effectiveQiCost = getEffectiveQiCost(skill);
    const effectiveStabilityCost = getEffectiveStabilityCost(skill);

    // Check qi requirement
    if (state.qi < effectiveQiCost) {
      reasons.push({
        skillName: skill.name,
        reason: 'qi',
        details: `Need ${effectiveQiCost} Qi (have ${state.qi})`,
      });
      continue;
    }

    // Check stability requirement
    if (effectiveStabilityCost > 0 && state.stability - effectiveStabilityCost < config.minStability) {
      const stabilityAfter = state.stability - effectiveStabilityCost;
      reasons.push({
        skillName: skill.name,
        reason: 'stability',
        details: `Would drop stability to ${stabilityAfter} (min: ${config.minStability})`,
      });
      continue;
    }

    // Check toxicity requirement
    if (maxToxicity > 0 && skill.toxicityCost) {
      if (state.toxicity + skill.toxicityCost > maxToxicity) {
        reasons.push({
          skillName: skill.name,
          reason: 'toxicity',
          details: `Would exceed max toxicity (${state.toxicity} + ${skill.toxicityCost} > ${maxToxicity})`,
        });
        continue;
      }
    }
  }

  return reasons;
}
