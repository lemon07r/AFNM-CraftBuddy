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
  Scaling,
  BuffDefinition,
  BuffEffect,
  CraftingTechniqueCondition,
  ConditionEvaluation,
  CraftingCondition,
  TechniqueType,
  RecipeConditionEffectType,
  ConditionEffect,
  HarmonyType,
  ScalingVariables,
  calculateExpectedCritMultiplier,
  getConditionEffects,
  getBonusAndChance,
  evaluateScaling,
} from './gameTypes';
import { processHarmonyEffect, getHarmonyStatModifiers } from './harmony';

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
  /** Distinguishes technique actions from consumable item actions. */
  actionKind?: 'skill' | 'item';
  /** Optional raw game technique payload for native availability prechecks. */
  nativeTechnique?: unknown;
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
  /** Raw mastery entries from game data (used for conditional mastery checks). */
  masteryEntries?: Array<Record<string, any>>;
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
  /** Items can be consumed without advancing the turn. */
  consumesTurn?: boolean;
  /** Optional item identifier for inventory tracking. */
  itemName?: string;
  /** True for reagents that are only usable on step 0. */
  reagentOnlyAtStepZero?: boolean;

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

interface MasteryUpgradeRule {
  additive: number;
  multiplier: number;
}

type MasteryUpgradeMap = Record<string, MasteryUpgradeRule>;

interface ResolvedMasteryBonuses {
  bonuses: SkillMastery;
  upgrades: MasteryUpgradeMap;
}

const EMPTY_MASTERY_UPGRADES: MasteryUpgradeMap = Object.freeze({});

function hasMasteryUpgrades(upgrades: MasteryUpgradeMap): boolean {
  return Object.keys(upgrades).length > 0;
}

function applyMasteryUpgradesToScaling(
  scaling: Scaling | undefined,
  upgrades: MasteryUpgradeMap
): Scaling | undefined {
  if (!scaling || !hasMasteryUpgrades(upgrades)) {
    return scaling;
  }

  const visited = new WeakMap<object, unknown>();
  const applyRecursively = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') {
      return value;
    }

    const cached = visited.get(value as object);
    if (cached !== undefined) {
      return cached;
    }

    if (Array.isArray(value)) {
      let arrayChanged = false;
      const upgradedArray = value.map((entry) => {
        const upgradedEntry = applyRecursively(entry);
        if (upgradedEntry !== entry) {
          arrayChanged = true;
        }
        return upgradedEntry;
      });
      const arrayResult = arrayChanged ? upgradedArray : value;
      visited.set(value as object, arrayResult);
      return arrayResult;
    }

    const source = value as Record<string, unknown>;
    const clone: Record<string, unknown> = {};
    visited.set(value as object, clone);

    let changed = false;
    for (const [key, child] of Object.entries(source)) {
      const upgradedChild = applyRecursively(child);
      clone[key] = upgradedChild;
      if (upgradedChild !== child) {
        changed = true;
      }
    }

    const upgradeKey = String(source.upgradeKey || '').trim();
    const rule = upgradeKey ? upgrades[upgradeKey] : undefined;
    if (rule) {
      for (const [key, child] of Object.entries(clone)) {
        if (typeof child !== 'number' || !Number.isFinite(child)) {
          continue;
        }
        const upgradedNumber = (child + rule.additive) * rule.multiplier;
        if (upgradedNumber !== child) {
          clone[key] = upgradedNumber;
          changed = true;
        }
      }
    }

    const objectResult = changed ? clone : source;
    visited.set(value as object, objectResult);
    return objectResult;
  };

  return applyRecursively(scaling) as Scaling;
}

function evaluateScalingWithMasteryUpgrades(
  scaling: Scaling | undefined,
  upgrades: MasteryUpgradeMap,
  variables: ScalingVariables,
  defaultValue: number
): number {
  return evaluateScaling(applyMasteryUpgradesToScaling(scaling, upgrades), variables, defaultValue);
}

export interface SkillGains {
  completion: number;
  perfection: number;
  stability: number;
  toxicityCleanse?: number;
}

export interface SkillGainOptions {
  /**
   * Include expected-value random factors (crit/success) in predicted gains.
   * Disable for tooltip-parity "immediate" gain previews.
   */
  includeExpectedValue?: boolean;
}

export interface OptimizerConfig {
  maxQi: number;
  maxStability: number;
  /** Optional hard completion cap for this craft (game max completion). */
  maxCompletion?: number;
  /** Optional hard perfection cap for this craft (game max perfection). */
  maxPerfection?: number;
  baseIntensity: number;
  baseControl: number;
  minStability: number;
  skills: SkillDefinition[];
  /** Default buff multiplier if not specified per-skill (e.g., 1.4 for 40%) */
  defaultBuffMultiplier: number;
  /** Maximum item usages per turn (mirrors pillsPerRound in game vars). */
  pillsPerRound?: number;
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
  /**
   * Whether this is a training craft (no real consequences on failure).
   * When true, optimizer uses more aggressive strategies with lower stability margins.
   */
  trainingMode?: boolean;
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
  pillsPerRound: 1,
};

export interface NativeCanUseActionContext {
  state: CraftingState;
  skill: SkillDefinition;
  currentCondition?: string;
  conditionEffects: ConditionEffect[];
  maxToxicity: number;
  minStability: number;
  pillsPerRound: number;
  effectiveQiCost: number;
  variables: Record<string, number>;
}

export type NativeCanUseActionProvider = (
  context: NativeCanUseActionContext
) => boolean | undefined;

let activeNativeCanUseActionProvider: NativeCanUseActionProvider | undefined;
let warnedNativeCanUseActionFailure = false;

export function setNativeCanUseActionProvider(
  provider: NativeCanUseActionProvider | undefined
): void {
  activeNativeCanUseActionProvider = provider;
  warnedNativeCanUseActionFailure = false;
}

function normalizeBuffName(name: string | undefined): string {
  return String(name || '').toLowerCase().trim().replace(/\s+/g, '_');
}

function buildNativeAvailabilityVariables(
  state: CraftingState,
  maxToxicity: number,
  pillsPerRound: number
): Record<string, number> {
  const seededVariables: Record<string, number> = {};
  if (state.nativeVariables) {
    for (const [key, value] of Object.entries(state.nativeVariables)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        seededVariables[key] = value;
      }
    }
  }

  const maxPool = Number.isFinite(seededVariables.maxpool)
    ? Math.max(1, seededVariables.maxpool)
    : Math.max(1, state.qi);
  const derivedMaxToxicity = maxToxicity > 0
    ? maxToxicity
    : Number.isFinite(seededVariables.maxtoxicity)
      ? Math.max(1, seededVariables.maxtoxicity)
      : Math.max(1, state.maxToxicity);

  const variables: Record<string, number> = {
    ...seededVariables,
    pool: state.qi,
    maxpool: maxPool,
    completion: state.completion,
    perfection: state.perfection,
    stability: state.stability,
    maxstability: state.maxStability,
    stabilitypenalty: state.stabilityPenalty,
    toxicity: state.toxicity,
    maxtoxicity: derivedMaxToxicity,
    consumedPills: state.consumedPillsThisTurn,
    consumedPillsThisTurn: state.consumedPillsThisTurn,
    pillsPerRound: Math.max(1, Math.floor(pillsPerRound || 1)),
    step: state.step,
  };

  state.buffs.forEach((tracked, buffKey) => {
    variables[buffKey] = tracked.stacks;
    const normalized = normalizeBuffName(tracked.name || buffKey);
    if (!(normalized in variables)) {
      variables[normalized] = tracked.stacks;
    }
  });

  return variables;
}

function runNativeCanUseActionPrecheck(
  context: Omit<NativeCanUseActionContext, 'variables'>
): boolean | undefined {
  if (!activeNativeCanUseActionProvider) {
    return undefined;
  }

  const variables = buildNativeAvailabilityVariables(
    context.state,
    context.maxToxicity,
    context.pillsPerRound
  );

  try {
    return activeNativeCanUseActionProvider({
      ...context,
      variables,
    });
  } catch (error) {
    if (!warnedNativeCanUseActionFailure) {
      console.warn(
        '[CraftBuddy] Native canUseAction provider failed, using local fallback:',
        error
      );
      warnedNativeCanUseActionFailure = true;
    }
  }

  return undefined;
}

function propagateNativeVariablesAfterAction(
  state: CraftingState,
  nextState: {
    qi: number;
    completion: number;
    perfection: number;
    stability: number;
    maxStability: number;
    stabilityPenalty: number;
    toxicity: number;
    consumedPillsThisTurn: number;
    step: number;
  },
  nextBuffs: Map<string, { name: string; stacks: number; definition?: BuffDefinition }>,
  maxToxicity: number,
  pillsPerRound: number
): Record<string, number> | undefined {
  if (!activeNativeCanUseActionProvider && !state.nativeVariables) {
    return undefined;
  }

  const variables = buildNativeAvailabilityVariables(
    state,
    maxToxicity,
    pillsPerRound
  );

  variables.pool = nextState.qi;
  variables.completion = nextState.completion;
  variables.perfection = nextState.perfection;
  variables.stability = nextState.stability;
  variables.maxstability = nextState.maxStability;
  variables.stabilitypenalty = nextState.stabilityPenalty;
  variables.toxicity = nextState.toxicity;
  variables.consumedPills = nextState.consumedPillsThisTurn;
  variables.consumedPillsThisTurn = nextState.consumedPillsThisTurn;
  variables.pillsPerRound = Math.max(1, Math.floor(pillsPerRound || 1));
  variables.step = nextState.step;
  variables.maxtoxicity = maxToxicity > 0
    ? maxToxicity
    : Math.max(1, state.maxToxicity);

  const keysToRefresh = new Set<string>();
  state.buffs.forEach((tracked, buffKey) => {
    keysToRefresh.add(buffKey);
    keysToRefresh.add(normalizeBuffName(tracked.name || buffKey));
  });
  nextBuffs.forEach((tracked, buffKey) => {
    keysToRefresh.add(buffKey);
    keysToRefresh.add(normalizeBuffName(tracked.name || buffKey));
  });
  keysToRefresh.forEach((key) => {
    if (key) {
      delete variables[key];
    }
  });
  nextBuffs.forEach((tracked, buffKey) => {
    if (tracked.stacks <= 0) return;
    variables[buffKey] = tracked.stacks;
    const normalized = normalizeBuffName(tracked.name || buffKey);
    if (!(normalized in variables)) {
      variables[normalized] = tracked.stacks;
    }
  });

  return variables;
}

function buildTechniqueScalingVariables(
  state: CraftingState,
  config: OptimizerConfig,
  control: number,
  intensity: number,
  critChance: number,
  critMultiplier: number
): ScalingVariables {
  const vars: ScalingVariables = {
    control,
    intensity,
    critchance: critChance,
    critmultiplier: critMultiplier,
    pool: state.qi,
    maxpool: config.maxQi,
    toxicity: state.toxicity,
    maxtoxicity: state.maxToxicity,
    resistance: 0,
    itemEffectiveness: 100,
    pillsPerRound: config.pillsPerRound || 1,
    poolCostPercentage: state.poolCostPercentage,
    stabilityCostPercentage: state.stabilityCostPercentage,
    successChanceBonus: state.successChanceBonus,
    stacks: 0,
    completion: state.completion,
    perfection: state.perfection,
    stability: state.stability,
    maxcompletion: config.targetCompletion ?? 0,
    maxperfection: config.targetPerfection ?? 0,
    maxstability: state.initialMaxStability,
    stabilitypenalty: state.stabilityPenalty,
  };

  state.buffs.forEach((tracked, buffName) => {
    vars[buffName] = tracked.stacks;
    const normalized = normalizeBuffName(buffName);
    if (!(normalized in vars)) {
      vars[normalized] = tracked.stacks;
    }
  });

  return vars;
}

function applyBuffStatContributions(
  state: CraftingState,
  vars: ScalingVariables,
  masteryUpgrades: MasteryUpgradeMap = EMPTY_MASTERY_UPGRADES
): ScalingVariables {
  const buffDefinitions = Array.from(state.buffs.values())
    .map((tracked) => tracked.definition)
    .filter((definition): definition is BuffDefinition => Boolean(definition));
  const hasExplicitControlBuff = buffDefinitions.some(
    (definition) => definition.stats?.control !== undefined
  );
  const hasExplicitIntensityBuff = buffDefinitions.some(
    (definition) => definition.stats?.intensity !== undefined
  );

  // Backward-compatible fallback for legacy turn-based control/intensity buffs.
  // Do not apply these when explicit buff stat definitions are present.
  let control = vars.control;
  let intensity = vars.intensity;
  if (state.controlBuffTurns > 0 && !hasExplicitControlBuff) {
    control *= state.controlBuffMultiplier;
  }
  if (state.intensityBuffTurns > 0 && !hasExplicitIntensityBuff) {
    intensity *= state.intensityBuffMultiplier;
  }

  let critchance = vars.critchance;
  let critmultiplier = vars.critmultiplier;
  let successChanceBonus = vars.successChanceBonus;
  let poolCostPercentage = vars.poolCostPercentage;
  let stabilityCostPercentage = vars.stabilityCostPercentage;

  state.buffs.forEach((tracked, buffKey) => {
    const definition = tracked.definition;
    if (!definition?.stats) return;
    const evalVars: ScalingVariables = { ...vars, stacks: tracked.stacks };
    const normalizedKey = normalizeBuffName(definition.name || tracked.name || buffKey);
    if (normalizedKey) {
      evalVars[normalizedKey] = tracked.stacks;
    }
    evalVars[buffKey] = tracked.stacks;

    for (const [statKey, scaling] of Object.entries(definition.stats)) {
      if (!scaling) continue;
      const raw = evaluateScalingWithMasteryUpgrades(scaling, masteryUpgrades, evalVars, 0);
      switch (statKey) {
        case 'control':
          control += raw;
          break;
        case 'intensity':
          intensity += raw;
          break;
        case 'critchance':
          critchance += raw;
          break;
        case 'critmultiplier':
          critmultiplier += raw;
          break;
        case 'successChanceBonus':
          successChanceBonus += raw;
          break;
        case 'poolCostPercentage':
          poolCostPercentage = poolCostPercentage === 0
            ? raw
            : Math.floor((poolCostPercentage / 100) * (raw / 100) * 100);
          break;
        case 'stabilityCostPercentage':
          stabilityCostPercentage = stabilityCostPercentage === 0
            ? raw
            : Math.floor((stabilityCostPercentage / 100) * (raw / 100) * 100);
          break;
      }
    }
  });

  return {
    ...vars,
    control,
    intensity,
    critchance,
    critmultiplier,
    successChanceBonus,
    poolCostPercentage,
    stabilityCostPercentage,
  };
}

function applyConditionEffectsToVariables(
  vars: ScalingVariables,
  conditionEffects: ConditionEffect[]
): ScalingVariables {
  let control = vars.control;
  let intensity = vars.intensity;
  let successChanceBonus = vars.successChanceBonus;
  let poolCostPercentage = vars.poolCostPercentage;
  let stabilityCostPercentage = vars.stabilityCostPercentage;

  for (const effect of conditionEffects) {
    if (effect.kind === 'control' && effect.multiplier !== undefined) {
      control *= 1 + effect.multiplier;
    } else if (effect.kind === 'intensity' && effect.multiplier !== undefined) {
      intensity *= 1 + effect.multiplier;
    } else if (effect.kind === 'chance' && effect.bonus !== undefined) {
      successChanceBonus += effect.bonus;
    } else if (effect.kind === 'pool' && effect.multiplier !== undefined) {
      poolCostPercentage = Math.floor(poolCostPercentage * effect.multiplier);
    } else if (effect.kind === 'stability' && effect.multiplier !== undefined) {
      stabilityCostPercentage = Math.floor(stabilityCostPercentage * effect.multiplier);
    }
  }

  return {
    ...vars,
    control,
    intensity,
    successChanceBonus,
    poolCostPercentage,
    stabilityCostPercentage,
  };
}

export function evaluateEffectCondition(
  condition: CraftingTechniqueCondition | undefined,
  state: CraftingState,
  variables: ScalingVariables,
  selfStacks: number,
  currentCondition?: string
): ConditionEvaluation {
  if (!condition) {
    return { met: true, probability: 1 };
  }

  switch (condition.kind) {
    case 'buff': {
      const buffKey =
        condition.buff === 'self' ? 'self' : normalizeBuffName(condition.buff?.name);
      const count = buffKey === 'self' ? selfStacks : state.getBuffStacks(buffKey);
      let met = false;
      if (condition.mode === 'more') {
        met = count >= condition.count;
      } else if (condition.mode === 'less') {
        met = count < condition.count;
      } else {
        met = count === condition.count;
      }
      return { met, probability: met ? 1 : 0 };
    }
    case 'pool': {
      const poolPct = variables.maxpool > 0 ? (variables.pool / variables.maxpool) * 100 : 0;
      const met = condition.mode === 'more'
        ? poolPct >= condition.percentage
        : poolPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'perfection': {
      const maxPerf = Math.max(1, variables.maxperfection || 1);
      const perfPct = (variables.perfection / maxPerf) * 100;
      const met = condition.mode === 'more'
        ? perfPct >= condition.percentage
        : perfPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'stability': {
      const maxStability = Math.max(1, variables.maxstability || 1);
      const stabilityPct = (variables.stability / maxStability) * 100;
      const met = condition.mode === 'more'
        ? stabilityPct >= condition.percentage
        : stabilityPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'completion': {
      const maxCompletion = Math.max(1, variables.maxcompletion || 1);
      const completionPct = (variables.completion / maxCompletion) * 100;
      const met = condition.mode === 'more'
        ? completionPct >= condition.percentage
        : completionPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'toxicity': {
      const maxTox = Math.max(1, variables.maxtoxicity || 1);
      const toxicityPct = (variables.toxicity / maxTox) * 100;
      const met = condition.mode === 'more'
        ? toxicityPct >= condition.percentage
        : toxicityPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'condition': {
      const result = evaluateScaling(
        { value: 1, eqn: condition.condition },
        { ...variables, stacks: selfStacks },
        0
      );
      const met = result > 0;
      // Direct condition-expression checks are deterministic in optimizer simulation.
      if (currentCondition) {
        return { met, probability: met ? 1 : 0 };
      }
      return { met, probability: met ? 1 : 0 };
    }
    case 'chance': {
      const probability = Math.max(0, Math.min(1, condition.percentage / 100));
      return { met: probability > 0, probability };
    }
    default:
      return { met: true, probability: 1 };
  }
}

function resolveMasteryBonuses(
  state: CraftingState,
  skill: SkillDefinition,
  variables: ScalingVariables
): ResolvedMasteryBonuses {
  if (!skill.masteryEntries || skill.masteryEntries.length === 0) {
    return {
      bonuses: skill.mastery || {},
      upgrades: EMPTY_MASTERY_UPGRADES,
    };
  }

  const bonuses: SkillMastery = {
    controlBonus: 0,
    intensityBonus: 0,
    poolCostReduction: 0,
    stabilityCostReduction: 0,
    successChanceBonus: 0,
    critChanceBonus: 0,
    critMultiplierBonus: 0,
  };
  const upgrades: MasteryUpgradeMap = {};

  for (const mastery of skill.masteryEntries) {
    if (!mastery || typeof mastery !== 'object') continue;
    const conditionResult = evaluateEffectCondition(
      mastery.condition as CraftingTechniqueCondition | undefined,
      state,
      variables,
      0
    );
    if (!conditionResult.met || conditionResult.probability <= 0) continue;
    const factor = conditionResult.probability;

    switch (mastery.kind) {
      case 'control':
        bonuses.controlBonus = (bonuses.controlBonus || 0) + (Number(mastery.percentage || 0) * factor);
        break;
      case 'intensity':
        bonuses.intensityBonus = (bonuses.intensityBonus || 0) + (Number(mastery.percentage || 0) * factor);
        break;
      case 'critchance':
        bonuses.critChanceBonus = (bonuses.critChanceBonus || 0) + (Number(mastery.percentage || 0) * factor);
        break;
      case 'critmultiplier':
        bonuses.critMultiplierBonus = (bonuses.critMultiplierBonus || 0) + (Number(mastery.percentage || 0) * factor);
        break;
      case 'upgrade': {
        const upgradeKey = String(mastery.upgradeKey || '').trim();
        if (!upgradeKey) break;

        const rawChange = Number(mastery.change || 0);
        if (!Number.isFinite(rawChange) || rawChange === 0) break;

        const existing = upgrades[upgradeKey] || { additive: 0, multiplier: 1 };
        if (mastery.shouldMultiply) {
          const multiplier = rawChange;
          if (Number.isFinite(multiplier) && multiplier !== 0) {
            existing.multiplier *= multiplier;
          }
        } else {
          existing.additive += rawChange;
        }
        upgrades[upgradeKey] = existing;
        break;
      }
    }
  }

  return {
    bonuses,
    upgrades,
  };
}

function buildPreMasteryActionVariables(
  state: CraftingState,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[],
  harmonyMods: ReturnType<typeof getHarmonyStatModifiers>,
  masteryUpgrades: MasteryUpgradeMap = EMPTY_MASTERY_UPGRADES
): ScalingVariables {
  const baseVars = buildTechniqueScalingVariables(
    state,
    config,
    config.baseControl * (1 + state.completionBonus * 0.1),
    config.baseIntensity,
    state.critChance,
    state.critMultiplier
  );
  const withBuffs = applyBuffStatContributions(state, baseVars, masteryUpgrades);
  const withConditions = applyConditionEffectsToVariables(withBuffs, conditionEffects);

  return {
    ...withConditions,
    control: withConditions.control * harmonyMods.controlMultiplier,
    intensity: withConditions.intensity * harmonyMods.intensityMultiplier,
    critchance: withConditions.critchance + harmonyMods.critChanceBonus,
    successChanceBonus: withConditions.successChanceBonus + harmonyMods.successChanceBonus,
    poolCostPercentage: Math.floor(
      (withConditions.poolCostPercentage / 100) * (harmonyMods.poolCostPercentage / 100) * 100
    ),
    stabilityCostPercentage: Math.floor(
      (withConditions.stabilityCostPercentage / 100) * (harmonyMods.stabilityCostPercentage / 100) * 100
    ),
  };
}

export interface EffectiveActionCosts {
  qiCost: number;
  stabilityCost: number;
  requiredPostStability: number;
}

/**
 * Calculate actual action costs after all modifiers using game order/rounding:
 * - Pool: condition pool multiplier -> poolCostPercentage
 * - Stability: percentage on negative delta with ceil -> condition multiplier with floor
 */
export function calculateEffectiveActionCosts(
  state: CraftingState,
  skill: SkillDefinition,
  minStability: number,
  conditionEffects: ConditionEffect[] = []
): EffectiveActionCosts {
  let qiCost = getEffectiveQiCost(skill);
  let stabilityDelta = -getEffectiveStabilityCost(skill);

  for (const effect of conditionEffects) {
    if (effect.kind === 'pool' && effect.multiplier !== undefined) {
      qiCost = Math.floor(qiCost * effect.multiplier);
    }
  }
  if (state.poolCostPercentage !== 100) {
    qiCost = Math.floor((qiCost * state.poolCostPercentage) / 100);
  }

  if (stabilityDelta < 0 && state.stabilityCostPercentage !== 100) {
    stabilityDelta = Math.ceil((stabilityDelta * state.stabilityCostPercentage) / 100);
  }
  for (const effect of conditionEffects) {
    if (effect.kind === 'stability' && effect.multiplier !== undefined) {
      stabilityDelta = Math.floor(stabilityDelta * effect.multiplier);
    }
  }

  return {
    qiCost: Math.max(0, qiCost),
    stabilityCost: Math.max(0, -stabilityDelta),
    requiredPostStability: Math.max(0, minStability),
  };
}

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
  conditionEffects: ConditionEffect[] = [],
  options: SkillGainOptions = {}
): SkillGains {
  const baseVars = buildTechniqueScalingVariables(
    state,
    config,
    config.baseControl * (1 + state.completionBonus * 0.1),
    config.baseIntensity,
    state.critChance,
    state.critMultiplier
  );
  const effectiveVars = applyConditionEffectsToVariables(
    applyBuffStatContributions(state, baseVars),
    conditionEffects
  );

  // Use skill's multipliers (baseCompletionGain and basePerfectionGain)
  // These are typically 0.5 each for Disciplined Touch
  const completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, effectiveVars.intensity));
  const perfectionGain = safeFloor(safeMultiply(skill.basePerfectionGain, effectiveVars.control));

  // Apply crit (only to positive gains)
  const includeExpectedValue = options.includeExpectedValue ?? true;
  const critMultiplier = includeExpectedValue
    ? calculateExpectedCritMultiplier(
        effectiveVars.critchance,
        effectiveVars.critmultiplier
      )
    : 1;

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
 * @param conditionEffects - Current condition effects
 */
export function calculateSkillGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  options: SkillGainOptions = {}
): SkillGains {
  const includeExpectedValue = options.includeExpectedValue ?? true;
  const clampPredictedProgressGain = (
    gain: number,
    current: number,
    cap: number | undefined
  ): number => {
    if (cap === undefined || !Number.isFinite(cap) || gain <= 0) {
      return gain;
    }
    const remaining = cap - current;
    if (remaining <= 0) {
      return 0;
    }
    return Math.min(gain, remaining);
  };

  // Handle Disciplined Touch specially - it uses both intensity and control with buffs
  if (skill.isDisciplinedTouch) {
    const disciplined = calculateDisciplinedTouchGains(
      state,
      skill,
      config,
      conditionEffects,
      options
    );
    return {
      ...disciplined,
      completion: safeFloor(
        clampPredictedProgressGain(disciplined.completion, state.completion, config.maxCompletion)
      ),
      perfection: safeFloor(
        clampPredictedProgressGain(disciplined.perfection, state.perfection, config.maxPerfection)
      ),
    };
  }

  const harmonyMods = getHarmonyStatModifiers(state.harmonyData, config.craftingType);
  let preMasteryVars = buildPreMasteryActionVariables(
    state,
    config,
    conditionEffects,
    harmonyMods
  );
  let resolvedMastery = resolveMasteryBonuses(state, skill, preMasteryVars);
  if (hasMasteryUpgrades(resolvedMastery.upgrades)) {
    preMasteryVars = buildPreMasteryActionVariables(
      state,
      config,
      conditionEffects,
      harmonyMods,
      resolvedMastery.upgrades
    );
    resolvedMastery = resolveMasteryBonuses(state, skill, preMasteryVars);
  }

  const mastery = resolvedMastery.bonuses;
  const masteryUpgrades = resolvedMastery.upgrades;

  const scalingVars: ScalingVariables = {
    ...preMasteryVars,
  };

  // Mastery stat bonuses apply to action variables before effect scaling.
  scalingVars.control *= 1 + (mastery.controlBonus || 0);
  scalingVars.intensity *= 1 + (mastery.intensityBonus || 0);
  scalingVars.critchance += mastery.critChanceBonus || 0;
  scalingVars.critmultiplier += mastery.critMultiplierBonus || 0;
  scalingVars.successChanceBonus += mastery.successChanceBonus || 0;

  const critFactor = includeExpectedValue
    ? calculateExpectedCritMultiplier(
        scalingVars.critchance,
        scalingVars.critmultiplier
      )
    : 1;

  const baseSuccessChance = skill.successChance ?? 1;
  const totalSuccessChance = Math.min(
    1,
    Math.max(0, baseSuccessChance + scalingVars.successChanceBonus)
  );

  // Expected value = successChance * (gains with crit).
  // Note: Only positive gains can crit (matching game behavior).
  const expectedFactor = includeExpectedValue ? totalSuccessChance : 1;

  // Preferred path: evaluate authoritative technique effects.
  if (skill.effects && skill.effects.length > 0) {
    let completionGain = 0;
    let perfectionGain = 0;
    let stabilityGain = 0;
    let toxicityCleanse = 0;

    for (const effect of skill.effects) {
      if (!effect) continue;
      const conditionResult = evaluateEffectCondition(effect.condition, state, scalingVars, 0);
      if (!conditionResult.met || conditionResult.probability <= 0) {
        continue;
      }
      const conditionFactor = conditionResult.probability;

      switch (effect.kind) {
        case 'completion': {
          let amount =
            evaluateScalingWithMasteryUpgrades(effect.amount, masteryUpgrades, scalingVars, 0) *
            conditionFactor;
          if (amount < 0 && (effect.amount?.value ?? 0) > 0) {
            amount = 0;
          }
          completionGain += amount;
          break;
        }
        case 'perfection': {
          let amount =
            evaluateScalingWithMasteryUpgrades(effect.amount, masteryUpgrades, scalingVars, 0) *
            conditionFactor;
          if (amount < 0 && (effect.amount?.value ?? 0) > 0) {
            amount = 0;
          }
          perfectionGain += amount;
          break;
        }
        case 'stability':
          stabilityGain +=
            evaluateScalingWithMasteryUpgrades(effect.amount, masteryUpgrades, scalingVars, 0) *
            conditionFactor;
          break;
        case 'cleanseToxicity':
          toxicityCleanse +=
            evaluateScalingWithMasteryUpgrades(effect.amount, masteryUpgrades, scalingVars, 0) *
            conditionFactor;
          break;
      }
    }

    const completionWithCrit = completionGain > 0 ? completionGain * critFactor : completionGain;
    const perfectionWithCrit = perfectionGain > 0 ? perfectionGain * critFactor : perfectionGain;

    const predictedCompletion = safeFloor(safeMultiply(completionWithCrit, expectedFactor));
    const predictedPerfection = safeFloor(safeMultiply(perfectionWithCrit, expectedFactor));

    return {
      completion: safeFloor(
        clampPredictedProgressGain(predictedCompletion, state.completion, config.maxCompletion)
      ),
      perfection: safeFloor(
        clampPredictedProgressGain(predictedPerfection, state.perfection, config.maxPerfection)
      ),
      stability: safeFloor(safeMultiply(stabilityGain, expectedFactor)),
      toxicityCleanse: safeFloor(safeMultiply(toxicityCleanse, expectedFactor)),
    };
  }

  // Legacy fallback path for tests/offline fixtures that only provide scalar fields.
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

  if (skill.scalesWithControl) {
    perfectionGain = safeFloor(safeMultiply(skill.basePerfectionGain, scalingVars.control));
    completionGain = skill.baseCompletionGain > 0
      ? safeFloor(safeMultiply(skill.baseCompletionGain, scalingVars.control))
      : 0;
  }
  if (skill.scalesWithIntensity && skill.type === 'fusion') {
    completionGain = safeFloor(safeMultiply(skill.baseCompletionGain, scalingVars.intensity));
  }

  const predictedCompletion = safeFloor(
    safeMultiply(safeMultiply(completionGain, critFactor), expectedFactor)
  );
  const predictedPerfection = safeFloor(
    safeMultiply(safeMultiply(perfectionGain, critFactor), expectedFactor)
  );

  return {
    completion: safeFloor(
      clampPredictedProgressGain(predictedCompletion, state.completion, config.maxCompletion)
    ),
    perfection: safeFloor(
      clampPredictedProgressGain(predictedPerfection, state.perfection, config.maxPerfection)
    ),
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
  const reduction = mastery.poolCostReduction || 0;
  if (Math.abs(reduction) <= 1) {
    return Math.max(0, Math.ceil(skill.qiCost * (1 - reduction)));
  }
  return Math.max(0, skill.qiCost - reduction);
}

/**
 * Get effective stability cost after mastery reductions.
 */
export function getEffectiveStabilityCost(skill: SkillDefinition): number {
  const mastery = skill.mastery || {};
  const reduction = mastery.stabilityCostReduction || 0;
  if (Math.abs(reduction) <= 1) {
    return Math.max(0, Math.ceil(skill.stabilityCost * (1 - reduction)));
  }
  return Math.max(0, skill.stabilityCost - reduction);
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
  currentCondition?: string,
  conditionEffects: ConditionEffect[] = [],
  pillsPerRound: number = 1
): boolean {
  const isItemAction = skill.actionKind === 'item';

  // Game requires current stability to be above 0 to perform actions.
  if (state.stability <= 0) {
    return false;
  }

  // Check cooldown (techniques only)
  if (!isItemAction && state.isOnCooldown(skill.key)) {
    return false;
  }

  // Check condition requirement (e.g., Harmonious skills require specific conditions)
  if (!isItemAction && skill.conditionRequirement && currentCondition) {
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
  if (!isItemAction && skill.buffRequirement) {
    const have = state.getBuffStacks(skill.buffRequirement.buffName);
    if (have < skill.buffRequirement.amount) {
      return false;
    }
  }

  // Check buff costs (consumed on use)
  if (!isItemAction && skill.buffCost) {
    const have = state.getBuffStacks(skill.buffCost.buffName);
    const required = skill.buffCost.consumeAll ? 1 : (skill.buffCost.amount ?? 0);
    if (required > 0 && have < required) {
      return false;
    }
  }

  if (isItemAction) {
    const itemKey = normalizeBuffName(skill.itemName || skill.key);
    const remaining = state.items.get(itemKey) ?? 0;
    if (remaining <= 0) {
      return false;
    }

    if (skill.reagentOnlyAtStepZero && state.step !== 0) {
      return false;
    }

    const perTurnLimit = Math.max(1, Math.floor(pillsPerRound || 1));
    if (state.consumedPillsThisTurn >= perTurnLimit) {
      return false;
    }
  }

  const effectiveCosts = calculateEffectiveActionCosts(state, skill, minStability, conditionEffects);

  // Check qi requirement
  if (state.qi < effectiveCosts.qiCost) {
    return false;
  }

  // Check toxicity requirement for alchemy crafting
  // Skill cannot be used if it would push toxicity over max
  if (maxToxicity > 0 && skill.toxicityCost) {
    if (state.toxicity + skill.toxicityCost > maxToxicity) {
      return false;
    }
  }

  if (!isItemAction) {
    const nativeCanUse = runNativeCanUseActionPrecheck({
      state,
      skill,
      currentCondition,
      conditionEffects,
      maxToxicity,
      minStability,
      pillsPerRound,
      effectiveQiCost: effectiveCosts.qiCost,
    });
    if (nativeCanUse === false) {
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
 * @param conditionEffects - Current condition effects
 * @param targetCompletion - Target completion for completion bonus calculation
 */
export function applySkill(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  targetCompletion: number = 0,
  currentCondition?: string
): CraftingState | null {
  const maxToxicity = config.maxToxicity || 0;

  // Validate skill can be applied
  if (!canApplySkill(
    state,
    skill,
    config.minStability,
    maxToxicity,
    currentCondition,
    conditionEffects,
    config.pillsPerRound || 1
  )) {
    return null;
  }

  const isItemAction = skill.actionKind === 'item';
  const consumesTurn = skill.consumesTurn ?? !isItemAction;
  const nextStep = state.step + (consumesTurn ? 1 : 0);
  const qiCap = Math.max(0, config.maxQi);
  const clampQi = (value: number): number =>
    Math.max(0, Math.min(qiCap, value));

  // Calculate gains BEFORE applying buffs from this skill
  const gains = calculateSkillGains(state, skill, config, conditionEffects);

  const effectiveCosts = calculateEffectiveActionCosts(state, skill, config.minStability, conditionEffects);
  const effectiveQiCost = effectiveCosts.qiCost;
  const effectiveStabilityCost = effectiveCosts.stabilityCost;

  // Calculate new resource values
  let newQi = clampQi(state.qi - effectiveQiCost);
  const hasExplicitPoolEffect =
    Array.isArray(skill.effects) &&
    skill.effects.some((effect) => effect?.kind === 'pool');
  if (
    !hasExplicitPoolEffect &&
    skill.restoresQi &&
    skill.qiRestore &&
    skill.qiRestore > 0
  ) {
    newQi = clampQi(newQi + skill.qiRestore);
  }

  // Handle max stability using game's penalty system:
  // 1. Apply standard decay of 1 per turn (unless skill prevents it)
  // 2. Apply any direct max stability change from the skill effect
  // 3. Apply any full restore effect
  let newStabilityPenalty = state.stabilityPenalty;

  // Standard max stability decay: increases penalty by 1 each turn unless skill prevents it
  if (consumesTurn && !skill.preventsMaxStabilityDecay) {
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
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - skill.maxStabilityChange)
    );
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
  let newControlBuffTurns = consumesTurn && state.controlBuffTurns > 0 ? state.controlBuffTurns - 1 : state.controlBuffTurns;
  let newIntensityBuffTurns = consumesTurn && state.intensityBuffTurns > 0 ? state.intensityBuffTurns - 1 : state.intensityBuffTurns;

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
  if (consumesTurn) {
    state.cooldowns.forEach((turns, key) => {
      if (turns > 1) {
        newCooldowns.set(key, turns - 1);
      }
    });
    if (!isItemAction && skill.cooldown && skill.cooldown > 0) {
      newCooldowns.set(skill.key, skill.cooldown);
    }
  } else {
    state.cooldowns.forEach((turns, key) => {
      if (turns > 0) {
        newCooldowns.set(key, turns);
      }
    });
  }

  // Update stack-based buffs
  const newBuffs = new Map(state.buffs);
  const newItems = new Map(state.items);

  if (isItemAction) {
    const itemKey = normalizeBuffName(skill.itemName || skill.key);
    const currentCount = newItems.get(itemKey) ?? 0;
    if (currentCount <= 1) {
      newItems.delete(itemKey);
    } else {
      newItems.set(itemKey, currentCount - 1);
    }
  }

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

  // Process per-turn buff effects (game's doExecuteBuff runs after technique)
  let buffCompletion = 0;
  let buffPerfection = 0;
  let buffStabilityDelta = 0;
  let buffPoolDelta = 0;
  let buffToxicityDelta = 0;
  let buffMaxStabilityDelta = 0;

  const upsertBuffFromDefinition = (definition: BuffDefinition | undefined, stacksDelta: number): void => {
    if (!definition || !Number.isFinite(stacksDelta)) return;
    const delta = Math.floor(stacksDelta);
    if (delta === 0) return;

    const buffKey = normalizeBuffName(definition.name);
    if (!buffKey) return;

    const existing = newBuffs.get(buffKey);
    const canStack = definition.canStack ?? existing?.definition?.canStack ?? true;
    const maxStacks = definition.maxStacks ?? existing?.definition?.maxStacks;

    if (existing) {
      if (!canStack) {
        return;
      }
      let nextStacks = existing.stacks + delta;
      if (maxStacks !== undefined) {
        nextStacks = Math.min(nextStacks, maxStacks);
      }
      if (nextStacks > 0) {
        newBuffs.set(buffKey, {
          ...existing,
          definition: existing.definition ?? definition,
          stacks: Math.floor(nextStacks),
        });
      } else {
        newBuffs.delete(buffKey);
      }
      return;
    }

    if (delta > 0) {
      let nextStacks = delta;
      if (maxStacks !== undefined) {
        nextStacks = Math.min(nextStacks, maxStacks);
      }
      newBuffs.set(buffKey, {
        name: buffKey,
        stacks: Math.floor(nextStacks),
        definition,
      });
    }
  };

  const adjustExistingBuffStacks = (buffKey: string, stacksDelta: number): void => {
    const existing = newBuffs.get(buffKey);
    if (!existing || !Number.isFinite(stacksDelta)) return;

    const delta = Math.floor(stacksDelta);
    if (delta === 0) return;

    let nextStacks = existing.stacks + delta;
    const maxStacks = existing.definition?.maxStacks;
    if (maxStacks !== undefined) {
      nextStacks = Math.min(nextStacks, maxStacks);
    }
    if (nextStacks > 0) {
      newBuffs.set(buffKey, { ...existing, stacks: Math.floor(nextStacks) });
    } else {
      newBuffs.delete(buffKey);
    }
  };

  const harmonyMods = getHarmonyStatModifiers(state.harmonyData, config.craftingType);
  let preMasteryActionVars = buildPreMasteryActionVariables(
    state,
    config,
    conditionEffects,
    harmonyMods
  );
  let resolvedActionMastery = resolveMasteryBonuses(state, skill, preMasteryActionVars);
  if (hasMasteryUpgrades(resolvedActionMastery.upgrades)) {
    preMasteryActionVars = buildPreMasteryActionVariables(
      state,
      config,
      conditionEffects,
      harmonyMods,
      resolvedActionMastery.upgrades
    );
    resolvedActionMastery = resolveMasteryBonuses(state, skill, preMasteryActionVars);
  }

  const mastery = resolvedActionMastery.bonuses;
  const actionMasteryUpgrades = resolvedActionMastery.upgrades;
  const actionVars = {
    ...preMasteryActionVars,
  };
  actionVars.control *= 1 + (mastery.controlBonus || 0);
  actionVars.intensity *= 1 + (mastery.intensityBonus || 0);
  actionVars.critchance += mastery.critChanceBonus || 0;
  actionVars.critmultiplier += mastery.critMultiplierBonus || 0;
  actionVars.successChanceBonus += mastery.successChanceBonus || 0;

  const actionSuccessChance = isItemAction
    ? 1
    : Math.max(0, Math.min(1, (skill.successChance ?? 1) + actionVars.successChanceBonus));

  let techniquePoolDelta = 0;
  let techniqueMaxStabilityDelta = 0;
  if (skill.effects && skill.effects.length > 0) {
    for (const effect of skill.effects) {
      if (!effect) continue;
      const conditionResult = evaluateEffectCondition(effect.condition, state, actionVars, 0);
      if (!conditionResult.met || conditionResult.probability <= 0) continue;
      const factor = actionSuccessChance * conditionResult.probability;
      if (factor <= 0) continue;

      switch (effect.kind) {
        case 'pool':
          techniquePoolDelta +=
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              actionMasteryUpgrades,
              actionVars,
              0
            ) * factor;
          break;
        case 'maxStability':
          techniqueMaxStabilityDelta +=
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              actionMasteryUpgrades,
              actionVars,
              0
            ) * factor;
          break;
        case 'createBuff': {
          const stacksToAdd =
            evaluateScalingWithMasteryUpgrades(
              effect.stacks,
              actionMasteryUpgrades,
              actionVars,
              1
            ) * factor;
          upsertBuffFromDefinition(effect.buff, stacksToAdd);
          break;
        }
        case 'consumeBuff': {
          const buffKey = normalizeBuffName(effect.buff?.name);
          if (!buffKey) break;
          const stacksToConsume =
            evaluateScalingWithMasteryUpgrades(
              effect.stacks,
              actionMasteryUpgrades,
              actionVars,
              1
            ) * factor;
          if (stacksToConsume > 0) {
            adjustExistingBuffStacks(buffKey, -Math.floor(stacksToConsume));
          }
          break;
        }
      }
    }
  }

  const executeBuffEffect = (
    effect: BuffEffect,
    ownerBuffKey: string,
    ownerBuff: { name: string; stacks: number; definition?: BuffDefinition },
    scalingVars: ScalingVariables
  ): void => {
    const conditionResult = evaluateEffectCondition(
      effect.condition,
      state,
      scalingVars,
      ownerBuff.stacks
    );
    if (!conditionResult.met || conditionResult.probability <= 0) {
      return;
    }
    const conditionFactor = conditionResult.probability;
    const amount =
      evaluateScalingWithMasteryUpgrades(
        effect.amount,
        actionMasteryUpgrades,
        scalingVars,
        0
      ) * conditionFactor;
    switch (effect.kind) {
      case 'completion':
        buffCompletion += amount;
        break;
      case 'perfection':
        buffPerfection += amount;
        break;
      case 'stability':
        buffStabilityDelta += amount;
        break;
      case 'pool':
        buffPoolDelta += amount;
        break;
      case 'maxStability':
        buffMaxStabilityDelta += amount;
        break;
      case 'changeToxicity':
        buffToxicityDelta += amount;
        break;
      case 'negate':
        newBuffs.delete(ownerBuffKey);
        break;
      case 'createBuff': {
        const stacksToAdd =
          evaluateScalingWithMasteryUpgrades(
            effect.stacks,
            actionMasteryUpgrades,
            scalingVars,
            1
          ) * conditionFactor;
        upsertBuffFromDefinition(effect.buff, stacksToAdd);
        break;
      }
      case 'addStack': {
        const stackChange =
          evaluateScalingWithMasteryUpgrades(
            effect.stacks,
            actionMasteryUpgrades,
            scalingVars,
            1
          ) * conditionFactor;
        if (stackChange !== 0) {
          adjustExistingBuffStacks(ownerBuffKey, stackChange);
        }
        break;
      }
    }
  };

  if (consumesTurn) {
    for (const [buffKey, buff] of Array.from(newBuffs.entries())) {
      if (!buff.definition) continue;
      const scalingVars: ScalingVariables = {
        ...actionVars,
        pool: newQi,
        maxpool: config.maxQi,
        toxicity: newToxicity,
        maxtoxicity: config.maxToxicity || 0,
        poolCostPercentage: state.poolCostPercentage,
        stabilityCostPercentage: state.stabilityCostPercentage,
        stacks: buff.stacks,
      };
      // Execute per-turn effects
      if (buff.definition.effects) {
        for (const effect of buff.definition.effects) {
          executeBuffEffect(effect, buffKey, buff, scalingVars);
        }
      }
      // Execute action-type-specific effects
      const actionEffects: BuffEffect[] | undefined =
        skill.type === 'fusion' ? buff.definition.onFusion :
        skill.type === 'refine' ? buff.definition.onRefine :
        skill.type === 'stabilize' ? buff.definition.onStabilize :
        skill.type === 'support' ? buff.definition.onSupport :
        undefined;
      if (actionEffects) {
        for (const effect of actionEffects) {
          executeBuffEffect(effect, buffKey, buff, scalingVars);
        }
      }
    }
  }

  // Calculate new completion/perfection (including buff per-turn contributions)
  let newCompletion = safeAdd(state.completion, gains.completion + buffCompletion);
  let newPerfection = safeAdd(state.perfection, gains.perfection + buffPerfection);
  newQi = clampQi(newQi + techniquePoolDelta);

  // Clamp to optional hard craft caps when available.
  if (config.maxCompletion !== undefined && Number.isFinite(config.maxCompletion)) {
    newCompletion = Math.min(newCompletion, config.maxCompletion);
  }
  if (config.maxPerfection !== undefined && Number.isFinite(config.maxPerfection)) {
    newPerfection = Math.min(newPerfection, config.maxPerfection);
  }

  // Update completion bonus (game mechanic: +10% control per guaranteed bonus tier)
  let newCompletionBonus = state.completionBonus;
  if (consumesTurn && targetCompletion > 0) {
    const bonusInfo = getBonusAndChance(newCompletion, targetCompletion);
    // Completion bonus stacks are guaranteed - 1 (first threshold doesn't count)
    newCompletionBonus = Math.max(0, bonusInfo.guaranteed - 1);
  }

  if (techniqueMaxStabilityDelta !== 0) {
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - techniqueMaxStabilityDelta)
    );
    const newMax = state.initialMaxStability - newStabilityPenalty;
    if (newStability > newMax) newStability = newMax;
  }

  // Apply buff per-turn state changes
  newStability = Math.max(0, newStability + buffStabilityDelta);
  newQi = clampQi(newQi + buffPoolDelta);
  newToxicity = Math.max(0, newToxicity + buffToxicityDelta);
  if (buffMaxStabilityDelta !== 0) {
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - buffMaxStabilityDelta)
    );
    const newMax = state.initialMaxStability - newStabilityPenalty;
    if (newStability > newMax) newStability = newMax;
  }

  // Process harmony effects for sublime crafts (runs in processTurn after technique)
  let newHarmony = state.harmony;
  let newHarmonyData = state.harmonyData;
  if (consumesTurn && !isItemAction && config.isSublimeCraft && config.craftingType && state.harmonyData) {
    const harmonyResult = processHarmonyEffect(state.harmonyData, config.craftingType, skill.type);
    newHarmonyData = harmonyResult.harmonyData;
    newHarmony = Math.max(-100, Math.min(100, state.harmony + harmonyResult.harmonyDelta));

    // Apply direct state changes from harmony (e.g., Inscription penalty, Resonance stability loss)
    if (harmonyResult.stabilityDelta !== 0) {
      newStability = Math.max(0, newStability + harmonyResult.stabilityDelta);
    }
    if (harmonyResult.poolDelta !== 0) {
      newQi = clampQi(newQi + harmonyResult.poolDelta);
    }
    if (harmonyResult.stabilityPenaltyDelta !== 0) {
      newStabilityPenalty += harmonyResult.stabilityPenaltyDelta;
      newStabilityPenalty = Math.min(newStabilityPenalty, state.initialMaxStability);
      // Reclamp stability after penalty increase
      const newMax = state.initialMaxStability - newStabilityPenalty;
      if (newStability > newMax) newStability = newMax;
    }
  }

  // Create new state with all updates
  const nextConsumedPillsThisTurn = consumesTurn
    ? 0
    : state.consumedPillsThisTurn + (isItemAction ? 1 : 0);
  const propagatedNativeVariables = propagateNativeVariablesAfterAction(
    state,
    {
      qi: newQi,
      completion: newCompletion,
      perfection: newPerfection,
      stability: newStability,
      maxStability: state.initialMaxStability - newStabilityPenalty,
      stabilityPenalty: newStabilityPenalty,
      toxicity: newToxicity,
      consumedPillsThisTurn: nextConsumedPillsThisTurn,
      step: nextStep,
    },
    newBuffs,
    maxToxicity,
    config.pillsPerRound || 1
  );

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
    items: newItems,
    consumedPillsThisTurn: nextConsumedPillsThisTurn,
    buffs: newBuffs,
    harmony: newHarmony,
    harmonyData: newHarmonyData,
    step: nextStep,
    completionBonus: newCompletionBonus,
    nativeVariables: propagatedNativeVariables,
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
  const conditionEffects = getConditionEffectsForConfig(config, normalizedCondition);
  return config.skills.filter(skill =>
    canApplySkill(
      state,
      skill,
      config.minStability,
      maxToxicity,
      normalizedCondition,
      conditionEffects,
      config.pillsPerRound || 1
    )
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
  const normalizedCondition = currentCondition ? normalizeCondition(currentCondition) : undefined;
  const conditionEffects = getConditionEffectsForConfig(config, normalizedCondition);

  for (const skill of config.skills) {
    const isItemAction = skill.actionKind === 'item';

    if (state.stability <= 0) {
      reasons.push({
        skillName: skill.name,
        reason: 'stability',
        details: 'Requires stability above 0',
      });
      continue;
    }

    // Check cooldown
    if (!isItemAction && state.isOnCooldown(skill.key)) {
      const turnsLeft = state.cooldowns.get(skill.key) || 0;
      reasons.push({
        skillName: skill.name,
        reason: 'cooldown',
        details: `On cooldown (${turnsLeft} turn${turnsLeft > 1 ? 's' : ''} left)`,
      });
      continue;
    }

    // Check condition requirement
    if (!isItemAction && skill.conditionRequirement && currentCondition) {
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

    if (isItemAction) {
      const itemKey = normalizeBuffName(skill.itemName || skill.key);
      const available = state.items.get(itemKey) ?? 0;
      if (available <= 0) {
        reasons.push({
          skillName: skill.name,
          reason: 'qi',
          details: 'No remaining item uses',
        });
        continue;
      }

      const perTurnLimit = Math.max(1, Math.floor(config.pillsPerRound || 1));
      if (state.consumedPillsThisTurn >= perTurnLimit) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: `Item usage limit reached (${state.consumedPillsThisTurn}/${perTurnLimit})`,
        });
        continue;
      }

      if (skill.reagentOnlyAtStepZero && state.step !== 0) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: 'Reagents can only be used on step 0',
        });
        continue;
      }
    }

    const effectiveCosts = calculateEffectiveActionCosts(
      state,
      skill,
      config.minStability,
      conditionEffects
    );

    // Check qi requirement
    if (state.qi < effectiveCosts.qiCost) {
      reasons.push({
        skillName: skill.name,
        reason: 'qi',
        details: `Need ${effectiveCosts.qiCost} Qi (have ${state.qi})`,
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

    if (!isItemAction) {
      const nativeCanUse = runNativeCanUseActionPrecheck({
        state,
        skill,
        currentCondition,
        conditionEffects,
        maxToxicity,
        minStability: config.minStability,
        pillsPerRound: config.pillsPerRound || 1,
        effectiveQiCost: effectiveCosts.qiCost,
      });
      if (nativeCanUse === false) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: 'Blocked by game-native canUseAction precheck',
        });
        continue;
      }
    }
  }

  return reasons;
}
