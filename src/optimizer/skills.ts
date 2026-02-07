/**
 * CraftBuddy - Skill Definitions and Application
 *
 * Game-accurate skill application logic based on CraftingStuff source.
 * Handles technique effects, buff interactions, and expected value calculations.
 */

import { CraftingState, BuffType } from './state';
import { safeFloor, safeAdd, safeMultiply } from '../utils/largeNumbers';
import {
  TechniqueEffect,
  BuffDefinition,
  CraftingCondition,
  TechniqueType,
  RecipeConditionEffectType,
  ConditionEffect,
  HarmonyType,
  calculateExpectedCritMultiplier,
  getConditionEffects,
  getBonusAndChance,
} from './gameTypes';

/**
 * Simplified skill definition for optimizer.
 * Can be constructed from game's TechniqueDefinition or manually defined.
 */
export interface SkillDefinition {
  name: string;
  key: string;
  qiCost: number;
  stabilityCost: number;
  /** Base success chance for this technique (0-1). If omitted, treated as 1. */
  successChance?: number;
  baseCompletionGain: number;
  basePerfectionGain: number;
  stabilityGain: number;
  /** Max stability change from this skill (negative = loss, positive = gain) */
  maxStabilityChange: number;
  buffType: BuffType;
  buffDuration: number;
  /** Buff multiplier value (e.g., 1.4 for 40% boost) - read from game buff data */
  buffMultiplier: number;
  type: TechniqueType;
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
  /** Required crafting condition to use this skill */
  conditionRequirement?: CraftingCondition | string;
  /** Requires a specific stack-based buff to be present (does not consume it) */
  buffRequirement?: { buffName: string; amount: number };
  /** Consumes a specific stack-based buff when used (can also scale gains per stack) */
  buffCost?: { buffName: string; amount?: number; consumeAll?: boolean };
  /** Whether this skill restores Qi (for tracking Qi recovery skills) */
  restoresQi?: boolean;
  /** Amount of Qi restored */
  qiRestore?: number;
  /** Whether this skill restores max stability to the craft's maximum */
  restoresMaxStabilityToFull?: boolean;

  /**
   * Full technique effects from game data (optional).
   * If provided, these are used for accurate gain calculations.
   */
  effects?: TechniqueEffect[];

  /**
   * Full buff definition for buff-granting skills (optional).
   * Used for accurate buff stat calculations.
   */
  grantedBuff?: BuffDefinition;
}

/**
 * Normalize condition string to canonical CraftingCondition type.
 * Handles various game/UI representations.
 */
function normalizeCondition(condition: string | undefined): CraftingCondition | undefined {
  if (!condition) return undefined;
  const c = String(condition).toLowerCase();
  // Accept both the canonical enum keys and common label/synonym variants.
  switch (c) {
    case 'neutral':
    case 'balanced':
      return 'neutral';
    case 'positive':
    case 'harmonious':
      return 'positive';
    case 'negative':
    case 'resistant':
      return 'negative';
    case 'verypositive':
    case 'brilliant':
    case 'excellent':
      return 'veryPositive';
    case 'verynegative':
    case 'corrupted':
      return 'veryNegative';
    default:
      // Try exact match for already-canonical values
      if (['neutral', 'positive', 'negative', 'veryPositive', 'veryNegative'].includes(condition)) {
        return condition as CraftingCondition;
      }
      return undefined;
  }
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
  craftingType?: HarmonyType;
  /**
   * Recipe condition effect type (affects which stat conditions modify).
   * Used as fallback when conditionEffectsData is not available.
   */
  conditionEffectType?: RecipeConditionEffectType;
  /**
   * Actual condition effects data from the game's RecipeConditionEffect object.
   * When present, used directly instead of the hardcoded fallback table.
   */
  conditionEffectsData?: Record<CraftingCondition, ConditionEffect[]>;
  /**
   * Whether this is sublime/harmony crafting mode.
   * Sublime crafting allows exceeding normal target limits.
   */
  isSublimeCraft?: boolean;
  /**
   * Target multiplier for sublime crafting.
   * Default: 1.0 (normal), 2.0 (sublime), higher for equipment.
   */
  targetMultiplier?: number;
  /**
   * Target completion for completion bonus calculation.
   */
  targetCompletion?: number;
  /**
   * Target perfection value.
   */
  targetPerfection?: number;
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
  // The game allows using skills until stability reaches 0.
  // Keep this at 0 to avoid incorrectly showing "No Valid Actions" at low stability.
  minStability: 0,
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
 * @param conditionEffects - Current condition effects
 */
export function calculateDisciplinedTouchGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = []
): SkillGains {
  // Calculate control and intensity multipliers from conditions
  let controlMult = 1;
  let intensityMult = 1;
  for (const effect of conditionEffects) {
    if (effect.kind === 'control' && effect.multiplier !== undefined) {
      controlMult *= 1 + effect.multiplier;
    }
    if (effect.kind === 'intensity' && effect.multiplier !== undefined) {
      intensityMult *= 1 + effect.multiplier;
    }
  }

  // Apply completion bonus to control (+10% per stack)
  const controlWithBonus = config.baseControl * (1 + state.completionBonus * 0.1);

  // Get effective stats with buffs applied
  const effectiveIntensity = state.getIntensity(config.baseIntensity) * intensityMult;
  const effectiveControl = state.getControl(controlWithBonus) * controlMult;

  // Use skill's multipliers (baseCompletionGain and basePerfectionGain)
  // These are typically 0.5 each for Disciplined Touch
  const completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, effectiveIntensity));
  const perfectionGain = safeFloor(safeMultiply(skill.basePerfectionGain, effectiveControl));

  // Apply crit (only to positive gains)
  const critMultiplier = calculateExpectedCritMultiplier(state.critChance, state.critMultiplier);

  return {
    completion: safeFloor(safeMultiply(completionGain, critMultiplier)),
    perfection: safeFloor(safeMultiply(perfectionGain, critMultiplier)),
    stability: 0,
  };
}

/**
 * Calculate the gains from applying a skill to the current state.
 *
 * Game-accurate implementation based on CraftingStuff source:
 * 1. Apply mastery bonuses to base stats
 * 2. Apply condition effects to stats
 * 3. Calculate gains using scaling formulas
 * 4. Apply expected crit multiplier (excess crit > 100% → bonus multiplier at 1:3)
 * 5. Apply success chance for expected value
 *
 * @param state - Current crafting state
 * @param skill - Skill being applied
 * @param config - Optimizer config with base stats
 * @param conditionEffectsOrMultiplier - Current condition effects or legacy control multiplier
 */
export function calculateSkillGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffectsOrMultiplier: ConditionEffect[] | number = []
): SkillGains {
  // Handle legacy number parameter (controlCondition multiplier)
  let conditionEffects: ConditionEffect[];
  if (typeof conditionEffectsOrMultiplier === 'number') {
    const mult = conditionEffectsOrMultiplier;
    if (mult !== 1.0) {
      conditionEffects = [{ kind: 'control', multiplier: mult - 1 }];
    } else {
      conditionEffects = [];
    }
  } else {
    conditionEffects = conditionEffectsOrMultiplier;
  }
  // Handle Disciplined Touch specially - it uses both intensity and control with buffs
  if (skill.isDisciplinedTouch) {
    return calculateDisciplinedTouchGains(state, skill, config, conditionEffects);
  }

  // Get mastery bonuses
  const mastery = skill.mastery || {};
  const controlMasteryBonus = 1 + (mastery.controlBonus || 0);
  const intensityMasteryBonus = 1 + (mastery.intensityBonus || 0);

  // Calculate condition multipliers
  let controlCondMult = 1;
  let intensityCondMult = 1;
  let successChanceBonus = 0;
  for (const effect of conditionEffects) {
    if (effect.kind === 'control' && effect.multiplier !== undefined) {
      controlCondMult *= 1 + effect.multiplier;
    }
    if (effect.kind === 'intensity' && effect.multiplier !== undefined) {
      intensityCondMult *= 1 + effect.multiplier;
    }
    if (effect.kind === 'chance' && effect.bonus !== undefined) {
      successChanceBonus += effect.bonus;
    }
  }

  // Apply completion bonus to control (+10% per stack) as per game mechanics
  const baseControlWithBonus = config.baseControl * (1 + state.completionBonus * 0.1);
  const controlWithMastery = baseControlWithBonus * controlMasteryBonus;
  const intensityWithMastery = config.baseIntensity * intensityMasteryBonus;

  // Get effective stats with buffs applied
  const effectiveControl = state.getControl(controlWithMastery) * controlCondMult;
  const effectiveIntensity = state.getIntensity(intensityWithMastery) * intensityCondMult;

  let completionGain = skill.baseCompletionGain;
  let perfectionGain = skill.basePerfectionGain;
  let stabilityGain = skill.stabilityGain;
  let toxicityCleanse = skill.toxicityCleanse || 0;

  // Stack-based buff scaling for techniques that consume buffs
  if (skill.buffCost && !skill.scalesWithControl && !skill.scalesWithIntensity) {
    const have = state.getBuffStacks(skill.buffCost.buffName);
    const stacksUsed = skill.buffCost.consumeAll ? have : Math.min(have, skill.buffCost.amount ?? 0);
    if (stacksUsed > 1) {
      completionGain = safeMultiply(completionGain, stacksUsed);
      perfectionGain = safeMultiply(perfectionGain, stacksUsed);
      stabilityGain = safeMultiply(stabilityGain, stacksUsed);
      toxicityCleanse = safeMultiply(toxicityCleanse, stacksUsed);
    }
  }

  // Apply stat scaling
  if (skill.scalesWithControl) {
    perfectionGain = safeFloor(safeMultiply(skill.basePerfectionGain, effectiveControl));
    if (skill.baseCompletionGain > 0) {
      completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, effectiveControl));
    } else {
      completionGain = 0;
    }
  }

  if (skill.scalesWithIntensity && skill.type === 'fusion') {
    completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, effectiveIntensity));
  }

  // Calculate expected crit multiplier using game-accurate formula
  // Excess crit chance (>100%) converts to bonus multiplier at 1:3 ratio
  const effectiveCritChance = state.critChance + (mastery.critChanceBonus || 0);
  const effectiveCritMultiplier = state.critMultiplier + (mastery.critMultiplierBonus || 0);
  const critFactor = calculateExpectedCritMultiplier(effectiveCritChance, effectiveCritMultiplier);

  // Calculate success chance (0-1)
  const baseSuccessChance = skill.successChance ?? 1;
  const totalSuccessChance = Math.min(
    1,
    Math.max(0, baseSuccessChance + (mastery.successChanceBonus || 0) + state.successChanceBonus + successChanceBonus)
  );

  // Expected value = successChance * (gains with crit)
  // Note: Only positive gains can crit (matching game behavior)
  const expectedFactor = totalSuccessChance;

  return {
    completion: safeFloor(safeMultiply(safeMultiply(completionGain, critFactor), expectedFactor)),
    perfection: safeFloor(safeMultiply(safeMultiply(perfectionGain, critFactor), expectedFactor)),
    stability: safeFloor(safeMultiply(stabilityGain, expectedFactor)),
    toxicityCleanse: safeFloor(safeMultiply(toxicityCleanse, expectedFactor)),
  };
}

/**
 * Check if a condition requirement is met by the current condition.
 * Skills require EXACT condition match - e.g., Harmonious skills only work during Harmonious (positive),
 * NOT during Brilliant (veryPositive). This matches the game's behavior.
 */
export function checkConditionRequirement(
  requirement: string,
  current: string
): boolean {
  const req = normalizeCondition(requirement);
  const cur = normalizeCondition(current);
  if (!req || !cur) return false;

  // Exact match required - skills with condition requirements only work during that exact condition
  // e.g., Harmonious (positive) skills do NOT work during Brilliant/Excellent (veryPositive)
  return req === cur;
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
  currentCondition?: string
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

  // Check buff requirements (stack-based buffs)
  if (skill.buffRequirement) {
    const have = state.getBuffStacks(skill.buffRequirement.buffName);
    if (have < skill.buffRequirement.amount) {
      return false;
    }
  }

  // Check buff costs (consumed on use)
  if (skill.buffCost) {
    const have = state.getBuffStacks(skill.buffCost.buffName);
    const required = skill.buffCost.consumeAll ? 1 : (skill.buffCost.amount ?? 0);
    if (required > 0 && have < required) {
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
  // The crafting UI allows acting down to 0 stability (but not below 0).
  const requiredPostStability = Math.max(0, minStability);
  if (effectiveStabilityCost > 0 && state.stability - effectiveStabilityCost < requiredPostStability) {
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
 * Game-accurate implementation based on CraftingStuff source:
 * 1. Apply toxicity cost
 * 2. Consume buff costs
 * 3. Apply pool/stability costs
 * 4. Execute technique effects
 * 5. Process turn (cooldowns, buff effects, condition advance, max stability decay)
 * 6. Update completion bonus
 *
 * @param state - Current crafting state
 * @param skill - Skill to apply
 * @param config - Optimizer config
 * @param conditionEffectsOrMultiplier - Current condition effects or legacy control multiplier
 * @param targetCompletion - Target completion for completion bonus calculation
 */
export function applySkill(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffectsOrMultiplier: ConditionEffect[] | number = [],
  targetCompletion: number = 0
): CraftingState | null {
  // Handle legacy number parameter (controlCondition multiplier)
  let conditionEffects: ConditionEffect[];
  if (typeof conditionEffectsOrMultiplier === 'number') {
    // Convert legacy control multiplier to condition effect
    const mult = conditionEffectsOrMultiplier;
    if (mult !== 1.0) {
      conditionEffects = [{ kind: 'control', multiplier: mult - 1 }];
    } else {
      conditionEffects = [];
    }
  } else {
    conditionEffects = conditionEffectsOrMultiplier;
  }
  const maxToxicity = config.maxToxicity || 0;

  // Validate skill can be applied
  if (!canApplySkill(state, skill, config.minStability, maxToxicity)) {
    return null;
  }

  // Calculate gains BEFORE applying buffs from this skill
  const gains = calculateSkillGains(state, skill, config, conditionEffects);

  // Get effective costs after mastery reductions
  let effectiveQiCost = getEffectiveQiCost(skill);
  let effectiveStabilityCost = getEffectiveStabilityCost(skill);

  // Pool cost: game applies condition THEN percentage (doExecuteTechnique)
  for (const effect of conditionEffects) {
    if (effect.kind === 'pool' && effect.multiplier !== undefined) {
      effectiveQiCost = Math.floor(effectiveQiCost * effect.multiplier);
    }
  }
  if (state.poolCostPercentage !== 100) {
    effectiveQiCost = Math.floor((effectiveQiCost * state.poolCostPercentage) / 100);
  }

  // Stability cost: game applies percentage THEN condition (changeStability)
  if (state.stabilityCostPercentage !== 100) {
    effectiveStabilityCost = Math.ceil((effectiveStabilityCost * state.stabilityCostPercentage) / 100);
  }
  for (const effect of conditionEffects) {
    if (effect.kind === 'stability' && effect.multiplier !== undefined) {
      effectiveStabilityCost = Math.floor(effectiveStabilityCost * effect.multiplier);
    }
  }

  // Calculate new resource values
  let newQi = state.qi - effectiveQiCost;
  if (skill.restoresQi && skill.qiRestore && skill.qiRestore > 0) {
    newQi = Math.min(config.maxQi, newQi + skill.qiRestore);
  }

  // Handle max stability using game's penalty system:
  // 1. Apply standard decay of 1 per turn (unless skill prevents it)
  // 2. Apply any direct max stability change from the skill effect
  // 3. Apply any full restore effect
  let newStabilityPenalty = state.stabilityPenalty;

  // Standard max stability decay: increases penalty by 1 each turn unless skill prevents it
  if (!skill.preventsMaxStabilityDecay) {
    newStabilityPenalty++;
  }

  // Cap penalty at initial max stability
  newStabilityPenalty = Math.min(newStabilityPenalty, state.initialMaxStability);

  // Calculate the new max stability
  let newMaxStability = state.initialMaxStability - newStabilityPenalty;

  // Apply max stability changes from skill
  if (skill.maxStabilityChange) {
    // Negative changes to max stability increase the penalty
    // Positive changes decrease the penalty (restore max stability)
    newStabilityPenalty = Math.max(0, newStabilityPenalty - skill.maxStabilityChange);
    newMaxStability = state.initialMaxStability - newStabilityPenalty;
  }

  if (skill.restoresMaxStabilityToFull) {
    newStabilityPenalty = 0;
    newMaxStability = state.initialMaxStability;
  }

  // Calculate new stability (current stability, not max)
  let newStability = state.stability - effectiveStabilityCost + gains.stability;

  // Clamp stability
  newStability = Math.floor(newStability);
  if (newStability < 0) newStability = 0;
  if (newStability > newMaxStability) newStability = newMaxStability;

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
  if (skill.isDisciplinedTouch) {
    newControlBuffTurns = 0;
    newIntensityBuffTurns = 0;
  }

  // Apply NEW buffs from this skill (active next turn)
  let newControlBuffMultiplier = state.controlBuffMultiplier;
  let newIntensityBuffMultiplier = state.intensityBuffMultiplier;

  if (skill.buffType === BuffType.CONTROL) {
    newControlBuffTurns = skill.buffDuration;
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      newControlBuffMultiplier = skill.buffMultiplier;
    } else if (config.defaultBuffMultiplier) {
      newControlBuffMultiplier = config.defaultBuffMultiplier;
    }
  } else if (skill.buffType === BuffType.INTENSITY) {
    newIntensityBuffTurns = skill.buffDuration;
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      newIntensityBuffMultiplier = skill.buffMultiplier;
    } else if (config.defaultBuffMultiplier) {
      newIntensityBuffMultiplier = config.defaultBuffMultiplier;
    }
  }

  // Update cooldowns
  const newCooldowns = new Map<string, number>();
  state.cooldowns.forEach((turns, key) => {
    if (turns > 1) {
      newCooldowns.set(key, turns - 1);
    }
  });
  if (skill.cooldown && skill.cooldown > 0) {
    newCooldowns.set(skill.key, skill.cooldown);
  }

  // Update stack-based buffs
  const newBuffs = new Map(state.buffs);

  // Consume buff costs
  if (skill.buffCost) {
    const buff = state.getBuff(skill.buffCost.buffName);
    if (buff) {
      const have = buff.stacks;
      const consume = skill.buffCost.consumeAll ? have : Math.min(have, skill.buffCost.amount ?? 0);
      const remaining = Math.max(0, have - consume);
      if (remaining > 0) {
        newBuffs.set(skill.buffCost.buffName, { ...buff, stacks: remaining });
      } else {
        newBuffs.delete(skill.buffCost.buffName);
      }
    }
  }

  // Calculate new completion/perfection
  const newCompletion = safeAdd(state.completion, gains.completion);
  const newPerfection = safeAdd(state.perfection, gains.perfection);

  // Update completion bonus (game mechanic: +10% control per guaranteed bonus tier)
  let newCompletionBonus = state.completionBonus;
  if (targetCompletion > 0) {
    const bonusInfo = getBonusAndChance(newCompletion, targetCompletion);
    // Completion bonus stacks are guaranteed - 1 (first threshold doesn't count)
    newCompletionBonus = Math.max(0, bonusInfo.guaranteed - 1);
  }

  // Create new state with all updates
  return state.copy({
    qi: newQi,
    stability: newStability,
    stabilityPenalty: newStabilityPenalty,
    completion: newCompletion,
    perfection: newPerfection,
    controlBuffTurns: newControlBuffTurns,
    intensityBuffTurns: newIntensityBuffTurns,
    controlBuffMultiplier: newControlBuffMultiplier,
    intensityBuffMultiplier: newIntensityBuffMultiplier,
    toxicity: newToxicity,
    cooldowns: newCooldowns,
    buffs: newBuffs,
    step: state.step + 1,
    completionBonus: newCompletionBonus,
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
  currentCondition?: CraftingCondition | string
): SkillDefinition[] {
  const maxToxicity = config.maxToxicity || 0;
  const normalizedCondition = typeof currentCondition === 'string' ? normalizeCondition(currentCondition) : currentCondition;
  return config.skills.filter(skill =>
    canApplySkill(state, skill, config.minStability, maxToxicity, normalizedCondition)
  );
}

/**
 * Check if the state is terminal (no valid actions possible).
 */
export function isTerminalState(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: CraftingCondition | string
): boolean {
  return getAvailableSkills(state, config, currentCondition).length === 0;
}

/**
 * Get condition effects for the current condition and recipe type.
 * Prefers real game data (conditionEffectsData) over the hardcoded fallback table.
 */
export function getConditionEffectsForConfig(
  config: OptimizerConfig,
  condition: CraftingCondition | string | undefined
): ConditionEffect[] {
  if (!condition) {
    return [];
  }
  const normalizedCondition = normalizeCondition(condition as string);
  if (!normalizedCondition) {
    return [];
  }
  // Prefer real game data when available
  if (config.conditionEffectsData) {
    return config.conditionEffectsData[normalizedCondition] || [];
  }
  // Fall back to hardcoded table
  if (!config.conditionEffectType) {
    return [];
  }
  return getConditionEffects(config.conditionEffectType, normalizedCondition);
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
  currentCondition?: string
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
