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
  readonly history: string[];

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
      history: overrides.history ?? this.history,
    });
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
   * Create a cache key for memoization.
   * Includes maxStability since it changes during crafting.
   */
  getCacheKey(): string {
    return `${this.qi}:${this.stability}:${this.maxStability}:${this.controlBuffTurns}:${this.intensityBuffTurns}`;
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
  intensityBuffMultiplier: number = 1.4
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
    history: [],
  });
}
