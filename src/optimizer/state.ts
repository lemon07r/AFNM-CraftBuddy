/**
 * CraftBuddy - Crafting State Management
 *
 * Game-accurate state management for crafting optimization.
 * Based on authoritative CraftingStuff game source code.
 */

import {
  ActiveBuff,
  BuffDefinition,
  CraftingCondition,
  TechniqueType,
  HarmonyType,
  HarmonyData,
  RecipeConditionEffectType,
  ScalingVariables,
  getBonusAndChance,
  evaluateScaling,
} from './gameTypes';

export enum BuffType {
  NONE = 0,
  CONTROL = 1, // +40% to control stat
  INTENSITY = 2, // +40% to intensity stat
}

/**
 * Active buff tracking with full buff data.
 */
export interface TrackedBuff {
  name: string;
  stacks: number;
  /** Full buff definition for effect processing */
  definition?: BuffDefinition;
}

export interface CraftingStateData {
  qi: number;
  stability: number;
  /** Initial max stability from recipe */
  initialMaxStability: number;
  /** @deprecated Use initialMaxStability instead. Alias for backwards compatibility. */
  maxStability?: number;
  /** Accumulated stability penalty (max stability = initial - penalty) */
  stabilityPenalty: number;
  completion: number;
  perfection: number;
  /** Base crit chance percentage (0-100+). */
  critChance: number;
  /** Base crit multiplier percentage (e.g., 150 for 1.5x). */
  critMultiplier: number;
  /** Bonus added to technique success chance (0-1). */
  successChanceBonus: number;
  /** Pool cost percentage modifier (100 = normal). */
  poolCostPercentage: number;
  /** Stability cost percentage modifier (100 = normal). */
  stabilityCostPercentage: number;
  controlBuffTurns: number;
  intensityBuffTurns: number;
  /** Multiplier for control buff (e.g., 1.4 for 40% boost) - read from game */
  controlBuffMultiplier: number;
  /** Multiplier for intensity buff (e.g., 1.4 for 40% boost) - read from game */
  intensityBuffMultiplier: number;
  /** Toxicity for alchemy crafting (0 for non-alchemy) */
  toxicity: number;
  /** Max toxicity threshold */
  maxToxicity: number;
  /** Map of skill keys to their current cooldown turns remaining */
  cooldowns: Map<string, number>;
  /**
   * Active buffs with stacks and optional definitions.
   * Keyed by normalized buff name.
   */
  buffs: Map<string, TrackedBuff>;
  /**
   * @deprecated Use buffs instead. Legacy alias for backwards compatibility.
   * Map of buff names to stack counts.
   */
  buffStacks?: Map<string, number>;
  /** Harmony value (-100 to 100) for sublime crafts */
  harmony: number;
  /** Harmony type data for sublime craft mechanics */
  harmonyData?: HarmonyData;
  /** Current turn/step number */
  step: number;
  /** Completion bonus stacks (from exceeding completion thresholds) */
  completionBonus: number;
  history: string[];
}

// Legacy alias for backwards compatibility
export type BuffStacks = Map<string, number>;

/**
 * Immutable crafting state for optimization calculations.
 * All mutations return new state instances.
 *
 * Now game-accurate with proper buff tracking and completion bonus system.
 */
export class CraftingState implements CraftingStateData {
  readonly qi: number;
  readonly stability: number;
  readonly initialMaxStability: number;
  readonly stabilityPenalty: number;
  readonly completion: number;
  readonly perfection: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  readonly successChanceBonus: number;
  readonly poolCostPercentage: number;
  readonly stabilityCostPercentage: number;
  readonly controlBuffTurns: number;
  readonly intensityBuffTurns: number;
  readonly controlBuffMultiplier: number;
  readonly intensityBuffMultiplier: number;
  readonly toxicity: number;
  readonly maxToxicity: number;
  readonly cooldowns: Map<string, number>;
  readonly buffs: Map<string, TrackedBuff>;
  readonly harmony: number;
  readonly harmonyData?: HarmonyData;
  readonly step: number;
  readonly completionBonus: number;
  readonly history: string[];

  private _cacheKey?: string;

  constructor(data: Partial<CraftingStateData> = {}) {
    this.qi = data.qi ?? 0;
    this.stability = data.stability ?? 0;
    // Support both initialMaxStability and legacy maxStability
    this.initialMaxStability = data.initialMaxStability ?? data.maxStability ?? 60;
    this.stabilityPenalty = data.stabilityPenalty ?? 0;
    this.completion = data.completion ?? 0;
    this.perfection = data.perfection ?? 0;
    this.critChance = data.critChance ?? 0;
    this.critMultiplier = data.critMultiplier ?? 150; // 150% = 1.5x multiplier
    this.successChanceBonus = data.successChanceBonus ?? 0;
    this.poolCostPercentage = data.poolCostPercentage ?? 100;
    this.stabilityCostPercentage = data.stabilityCostPercentage ?? 100;
    this.controlBuffTurns = data.controlBuffTurns ?? 0;
    this.intensityBuffTurns = data.intensityBuffTurns ?? 0;
    this.controlBuffMultiplier = data.controlBuffMultiplier ?? 1.4;
    this.intensityBuffMultiplier = data.intensityBuffMultiplier ?? 1.4;
    this.toxicity = data.toxicity ?? 0;
    this.maxToxicity = data.maxToxicity ?? 100;
    this.cooldowns = data.cooldowns ? new Map(data.cooldowns) : new Map();
    // Support both buffs and legacy buffStacks
    if (data.buffs) {
      this.buffs = new Map(data.buffs);
    } else if (data.buffStacks) {
      // Convert legacy buffStacks to buffs
      this.buffs = new Map();
      data.buffStacks.forEach((stacks, name) => {
        this.buffs.set(name, { name, stacks });
      });
    } else {
      this.buffs = new Map();
    }
    this.harmony = data.harmony ?? 0;
    this.harmonyData = data.harmonyData ? { ...data.harmonyData } : undefined;
    this.step = data.step ?? 0;
    this.completionBonus = data.completionBonus ?? 0;
    this.history = data.history ? [...data.history] : [];
  }

  /**
   * Get the current max stability (initial - penalty).
   * This matches game's calculation.
   */
  get maxStability(): number {
    return Math.max(0, this.initialMaxStability - this.stabilityPenalty);
  }

  /**
   * Legacy getter for buffStacks - returns stacks from buffs map.
   */
  get buffStacks(): Map<string, number> {
    const result = new Map<string, number>();
    this.buffs.forEach((buff, name) => {
      result.set(name, buff.stacks);
    });
    return result;
  }

  /**
   * Create a copy with optional overrides
   */
  copy(overrides: Partial<CraftingStateData> = {}): CraftingState {
    // Support both initialMaxStability and legacy maxStability in overrides
    const newInitialMaxStability =
      overrides.initialMaxStability ?? overrides.maxStability ?? this.initialMaxStability;
    return new CraftingState({
      qi: overrides.qi ?? this.qi,
      stability: overrides.stability ?? this.stability,
      initialMaxStability: newInitialMaxStability,
      stabilityPenalty: overrides.stabilityPenalty ?? this.stabilityPenalty,
      completion: overrides.completion ?? this.completion,
      perfection: overrides.perfection ?? this.perfection,
      critChance: overrides.critChance ?? this.critChance,
      critMultiplier: overrides.critMultiplier ?? this.critMultiplier,
      successChanceBonus: overrides.successChanceBonus ?? this.successChanceBonus,
      poolCostPercentage: overrides.poolCostPercentage ?? this.poolCostPercentage,
      stabilityCostPercentage: overrides.stabilityCostPercentage ?? this.stabilityCostPercentage,
      controlBuffTurns: overrides.controlBuffTurns ?? this.controlBuffTurns,
      intensityBuffTurns: overrides.intensityBuffTurns ?? this.intensityBuffTurns,
      controlBuffMultiplier: overrides.controlBuffMultiplier ?? this.controlBuffMultiplier,
      intensityBuffMultiplier: overrides.intensityBuffMultiplier ?? this.intensityBuffMultiplier,
      toxicity: overrides.toxicity ?? this.toxicity,
      maxToxicity: overrides.maxToxicity ?? this.maxToxicity,
      cooldowns: overrides.cooldowns ?? this.cooldowns,
      buffs: overrides.buffs ?? this.buffs,
      harmony: overrides.harmony ?? this.harmony,
      harmonyData: overrides.harmonyData ?? this.harmonyData,
      step: overrides.step ?? this.step,
      completionBonus: overrides.completionBonus ?? this.completionBonus,
      history: overrides.history ?? this.history,
    });
  }

  /** Get current stacks for a normalized buff name */
  getBuffStacks(buffName: string): number {
    return this.buffs.get(buffName)?.stacks ?? 0;
  }

  /** Get a tracked buff by name */
  getBuff(buffName: string): TrackedBuff | undefined {
    return this.buffs.get(buffName);
  }

  /** Check if a buff is active */
  hasBuff(buffName: string): boolean {
    const buff = this.buffs.get(buffName);
    return buff !== undefined && buff.stacks > 0;
  }

  /**
   * Get effective control value with buff applied.
   * Uses the buff multiplier read from game data.
   */
  getControl(baseControl: number): number {
    if (this.controlBuffTurns > 0) {
      return Math.floor(baseControl * this.controlBuffMultiplier);
    }
    return baseControl;
  }

  /**
   * Get effective intensity value with buff applied.
   * Uses the buff multiplier read from game data.
   */
  getIntensity(baseIntensity: number): number {
    if (this.intensityBuffTurns > 0) {
      return Math.floor(baseIntensity * this.intensityBuffMultiplier);
    }
    return baseIntensity;
  }

  /**
   * Calculate score based on progress toward targets.
   * If targets are 0, falls back to min(completion, perfection).
   */
  getScore(targetCompletion: number = 0, targetPerfection: number = 0): number {
    if (targetCompletion === 0 && targetPerfection === 0) {
      return Math.min(this.completion, this.perfection);
    }
    const compProgress = Math.min(this.completion, targetCompletion);
    const perfProgress = Math.min(this.perfection, targetPerfection);
    return compProgress + perfProgress;
  }

  /**
   * Check if both targets have been reached
   */
  targetsMet(targetCompletion: number, targetPerfection: number): boolean {
    return this.completion >= targetCompletion && this.perfection >= targetPerfection;
  }

  /**
   * Get total of completion and perfection
   */
  getTotal(): number {
    return this.completion + this.perfection;
  }

  /**
   * Check if control buff is active
   */
  hasControlBuff(): boolean {
    return this.controlBuffTurns > 0;
  }

  /**
   * Check if intensity buff is active
   */
  hasIntensityBuff(): boolean {
    return this.intensityBuffTurns > 0;
  }

  /**
   * Check if a skill is on cooldown
   */
  isOnCooldown(skillKey: string): boolean {
    return (this.cooldowns.get(skillKey) ?? 0) > 0;
  }

  /**
   * Get remaining cooldown for a skill
   */
  getCooldown(skillKey: string): number {
    return this.cooldowns.get(skillKey) ?? 0;
  }

  /**
   * Check if toxicity is at dangerous levels (>= 80% of max)
   */
  hasDangerousToxicity(): boolean {
    return this.maxToxicity > 0 && this.toxicity >= this.maxToxicity * 0.8;
  }

  /**
   * Create a cache key for memoization.
   * Includes all state that affects skill outcomes:
   * - Resources: qi, stability, stabilityPenalty, toxicity
   * - Buffs: all tracked buffs with stacks
   * - Cooldowns: which skills are available
   * - Modifiers: crit, success, cost percentages
   * - Completion bonus (affects control calculations)
   */
  getCacheKey(): string {
    if (this._cacheKey) {
      return this._cacheKey;
    }

    // Convert cooldowns to a sorted string for consistent caching
    const cooldownStr = Array.from(this.cooldowns.entries())
      .filter(([_, v]) => v > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    // Include buff multipliers in cache key - different multipliers produce different gains
    // Round multipliers to 2 decimal places to avoid floating point comparison issues
    const ctrlMult = this.controlBuffTurns > 0 ? this.controlBuffMultiplier.toFixed(2) : '0';
    const intMult = this.intensityBuffTurns > 0 ? this.intensityBuffMultiplier.toFixed(2) : '0';

    // Include all tracked buffs (sorted) because they can:
    // - gate skill availability (requirements)
    // - scale skill gains (per-stack effects)
    // - provide stat modifiers
    const buffStr = Array.from(this.buffs.entries())
      .filter(([_, v]) => v.stacks > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v.stacks}`)
      .join(',');

    // Include crit/success values because they change expected gains for most techniques.
    const critChanceKey = Math.floor(this.critChance);
    const critMultKey = Math.floor(this.critMultiplier);
    const successBonusKey = this.successChanceBonus.toFixed(3);

    // Include cost modifiers
    const poolCostKey = this.poolCostPercentage;
    const stabCostKey = this.stabilityCostPercentage;

    // Include completion bonus (affects control via +10% per stack)
    const compBonusKey = this.completionBonus;

    this._cacheKey = `${this.qi}:${this.stability}:${this.stabilityPenalty}:${this.controlBuffTurns}:${ctrlMult}:${this.intensityBuffTurns}:${intMult}:${this.toxicity}:${critChanceKey}:${critMultKey}:${successBonusKey}:${poolCostKey}:${stabCostKey}:${compBonusKey}:${cooldownStr}:${buffStr}`;
    return this._cacheKey;
  }

  toString(): string {
    return `Qi: ${this.qi}, Stability: ${this.stability}, Completion: ${this.completion}, Perfection: ${this.perfection}`;
  }
}

/**
 * Options for creating a CraftingState from game data.
 */
export interface CreateStateOptions {
  pool: number;
  stability: number;
  initialMaxStability: number;
  stabilityPenalty?: number;
  completion: number;
  perfection: number;
  controlBuffTurns?: number;
  intensityBuffTurns?: number;
  controlBuffMultiplier?: number;
  intensityBuffMultiplier?: number;
  toxicity?: number;
  maxToxicity?: number;
  cooldowns?: Map<string, number>;
  buffs?: Map<string, TrackedBuff>;
  critChance?: number;
  critMultiplier?: number;
  successChanceBonus?: number;
  poolCostPercentage?: number;
  stabilityCostPercentage?: number;
  harmony?: number;
  harmonyData?: HarmonyData;
  step?: number;
  completionBonus?: number;
}

/**
 * Create a CraftingState from game's ProgressState and buff data.
 * Now supports full game-accurate state initialization.
 */
export function createStateFromGame(options: CreateStateOptions): CraftingState;
/**
 * @deprecated Use options object instead
 */
export function createStateFromGame(
  pool: number,
  stability: number,
  maxStability: number,
  completion: number,
  perfection: number,
  controlBuffTurns?: number,
  intensityBuffTurns?: number,
  controlBuffMultiplier?: number,
  intensityBuffMultiplier?: number,
  toxicity?: number,
  maxToxicity?: number,
  cooldowns?: Map<string, number>
): CraftingState;
export function createStateFromGame(
  poolOrOptions: number | CreateStateOptions,
  stability?: number,
  maxStability?: number,
  completion?: number,
  perfection?: number,
  controlBuffTurns: number = 0,
  intensityBuffTurns: number = 0,
  controlBuffMultiplier: number = 1.4,
  intensityBuffMultiplier: number = 1.4,
  toxicity: number = 0,
  maxToxicity: number = 100,
  cooldowns: Map<string, number> = new Map()
): CraftingState {
  // Handle options object form
  if (typeof poolOrOptions === 'object') {
    const opts = poolOrOptions;
    return new CraftingState({
      qi: opts.pool,
      stability: opts.stability,
      initialMaxStability: opts.initialMaxStability,
      stabilityPenalty: opts.stabilityPenalty ?? 0,
      completion: opts.completion,
      perfection: opts.perfection,
      controlBuffTurns: opts.controlBuffTurns ?? 0,
      intensityBuffTurns: opts.intensityBuffTurns ?? 0,
      controlBuffMultiplier: opts.controlBuffMultiplier ?? 1.4,
      intensityBuffMultiplier: opts.intensityBuffMultiplier ?? 1.4,
      toxicity: opts.toxicity ?? 0,
      maxToxicity: opts.maxToxicity ?? 100,
      cooldowns: opts.cooldowns ?? new Map(),
      buffs: opts.buffs ?? new Map(),
      critChance: opts.critChance ?? 0,
      critMultiplier: opts.critMultiplier ?? 150,
      successChanceBonus: opts.successChanceBonus ?? 0,
      poolCostPercentage: opts.poolCostPercentage ?? 100,
      stabilityCostPercentage: opts.stabilityCostPercentage ?? 100,
      harmony: opts.harmony ?? 0,
      harmonyData: opts.harmonyData,
      step: opts.step ?? 0,
      completionBonus: opts.completionBonus ?? 0,
      history: [],
    });
  }

  // Legacy signature support
  return new CraftingState({
    qi: poolOrOptions,
    stability: stability!,
    initialMaxStability: maxStability!,
    stabilityPenalty: 0,
    completion: completion!,
    perfection: perfection!,
    controlBuffTurns,
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier,
    toxicity,
    maxToxicity,
    cooldowns,
    buffs: new Map(),
    critChance: 0,
    critMultiplier: 150,
    successChanceBonus: 0,
    poolCostPercentage: 100,
    stabilityCostPercentage: 100,
    harmony: 0,
    step: 0,
    completionBonus: 0,
    history: [],
  });
}

/**
 * Build ScalingVariables from a CraftingState and config.
 * Used for evaluating Scaling expressions.
 */
export function buildScalingVariables(
  state: CraftingState,
  baseControl: number,
  baseIntensity: number,
  maxPool: number
): ScalingVariables {
  // Apply completion bonus to control (+10% per stack)
  const controlWithBonus = baseControl * (1 + state.completionBonus * 0.1);

  return {
    control: state.getControl(controlWithBonus),
    intensity: state.getIntensity(baseIntensity),
    critchance: state.critChance,
    critmultiplier: state.critMultiplier,
    pool: state.qi,
    maxpool: maxPool,
    toxicity: state.toxicity,
    maxtoxicity: state.maxToxicity,
    resistance: 0,
    itemEffectiveness: 100,
    pillsPerRound: 1,
    poolCostPercentage: state.poolCostPercentage,
    stabilityCostPercentage: state.stabilityCostPercentage,
    successChanceBonus: state.successChanceBonus,
    stacks: 0, // Set per-buff when evaluating buff effects
  };
}
