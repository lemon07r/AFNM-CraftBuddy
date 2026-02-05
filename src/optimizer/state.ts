/**
 * CraftBuddy - Crafting State Management
 * 
 * Ports the Python State class to TypeScript for tracking crafting progress
 * and buff states during optimization calculations.
 */

export enum BuffType {
  NONE = 0,
  CONTROL = 1,    // +40% to control stat
  INTENSITY = 2,  // +40% to intensity stat
}

export interface CraftingStateData {
  qi: number;
  stability: number;
  maxStability: number;
  completion: number;
  perfection: number;
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
   * Additional crafting buffs (stack-based) keyed by normalized buff name.
   * Used for techniques that require/consume specific buffs (e.g., pressure stacks).
   */
  buffStacks: Map<string, number>;
  history: string[];
}

/**
 * Immutable crafting state for optimization calculations.
 * All mutations return new state instances.
 */
export class CraftingState implements CraftingStateData {
  readonly qi: number;
  readonly stability: number;
  readonly maxStability: number;
  readonly completion: number;
  readonly perfection: number;
  readonly controlBuffTurns: number;
  readonly intensityBuffTurns: number;
  readonly controlBuffMultiplier: number;
  readonly intensityBuffMultiplier: number;
  readonly toxicity: number;
  readonly maxToxicity: number;
  readonly cooldowns: Map<string, number>;
  readonly buffStacks: Map<string, number>;
  readonly history: string[];

  private _cacheKey?: string;

  constructor(data: Partial<CraftingStateData> = {}) {
    this.qi = data.qi ?? 0;
    this.stability = data.stability ?? 0;
    this.maxStability = data.maxStability ?? 60;
    this.completion = data.completion ?? 0;
    this.perfection = data.perfection ?? 0;
    this.controlBuffTurns = data.controlBuffTurns ?? 0;
    this.intensityBuffTurns = data.intensityBuffTurns ?? 0;
    this.controlBuffMultiplier = data.controlBuffMultiplier ?? 1.4;
    this.intensityBuffMultiplier = data.intensityBuffMultiplier ?? 1.4;
    this.toxicity = data.toxicity ?? 0;
    this.maxToxicity = data.maxToxicity ?? 100;
    this.cooldowns = data.cooldowns ? new Map(data.cooldowns) : new Map();
    this.buffStacks = data.buffStacks ? new Map(data.buffStacks) : new Map();
    this.history = data.history ? [...data.history] : [];
  }

  /**
   * Create a copy with optional overrides
   */
  copy(overrides: Partial<CraftingStateData> = {}): CraftingState {
    return new CraftingState({
      qi: overrides.qi ?? this.qi,
      stability: overrides.stability ?? this.stability,
      maxStability: overrides.maxStability ?? this.maxStability,
      completion: overrides.completion ?? this.completion,
      perfection: overrides.perfection ?? this.perfection,
      controlBuffTurns: overrides.controlBuffTurns ?? this.controlBuffTurns,
      intensityBuffTurns: overrides.intensityBuffTurns ?? this.intensityBuffTurns,
      controlBuffMultiplier: overrides.controlBuffMultiplier ?? this.controlBuffMultiplier,
      intensityBuffMultiplier: overrides.intensityBuffMultiplier ?? this.intensityBuffMultiplier,
      toxicity: overrides.toxicity ?? this.toxicity,
      maxToxicity: overrides.maxToxicity ?? this.maxToxicity,
      cooldowns: overrides.cooldowns ?? this.cooldowns,
      buffStacks: overrides.buffStacks ?? this.buffStacks,
      history: overrides.history ?? this.history,
    });
  }

  /** Get current stacks for a normalized buff name */
  getBuffStacks(buffName: string): number {
    return this.buffStacks.get(buffName) ?? 0;
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
   * - Resources: qi, stability, maxStability, toxicity
   * - Buffs: turns remaining AND multipliers (different multipliers = different gains)
   * - Cooldowns: which skills are available
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

    // Include additional buff stacks (sorted) because they can:
    // - gate skill availability (requirements)
    // - scale skill gains (per-stack effects)
    const buffStacksStr = Array.from(this.buffStacks.entries())
      .filter(([_, v]) => v > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');

    this._cacheKey = `${this.qi}:${this.stability}:${this.maxStability}:${this.controlBuffTurns}:${ctrlMult}:${this.intensityBuffTurns}:${intMult}:${this.toxicity}:${cooldownStr}:${buffStacksStr}`;
    return this._cacheKey;
  }

  toString(): string {
    return `Qi: ${this.qi}, Stability: ${this.stability}, Completion: ${this.completion}, Perfection: ${this.perfection}`;
  }
}

/**
 * Create a CraftingState from game's ProgressState and buff data.
 * Buff multipliers should be read from game's CraftingBuff.stats.
 */
export function createStateFromGame(
  pool: number,
  stability: number,
  maxStability: number,
  completion: number,
  perfection: number,
  controlBuffTurns: number = 0,
  intensityBuffTurns: number = 0,
  controlBuffMultiplier: number = 1.4,
  intensityBuffMultiplier: number = 1.4,
  toxicity: number = 0,
  maxToxicity: number = 100,
  cooldowns: Map<string, number> = new Map()
): CraftingState {
  return new CraftingState({
    qi: pool,
    stability,
    maxStability,
    completion,
    perfection,
    controlBuffTurns,
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier,
    toxicity,
    maxToxicity,
    cooldowns,
    history: [],
  });
}
