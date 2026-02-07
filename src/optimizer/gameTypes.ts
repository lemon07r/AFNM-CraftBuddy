/**
 * CraftBuddy - Game-Accurate Type Definitions
 *
 * These types match the authoritative game code from CraftingStuff.
 * Used to ensure the optimizer accurately models game mechanics.
 */

/**
 * Crafting condition types matching the game.
 */
export type CraftingCondition =
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'veryPositive'
  | 'veryNegative';

/**
 * Technique action types.
 */
export type TechniqueType = 'fusion' | 'refine' | 'stabilize' | 'support';

/**
 * Recipe condition effect types - each affects different stats.
 */
export type RecipeConditionEffectType =
  | 'perfectable' // Control
  | 'fuseable' // Intensity
  | 'flowing' // Both Control and Intensity
  | 'energised' // Pool Cost
  | 'stable' // Stability Cost
  | 'fortuitous'; // Success Chance

/**
 * Harmony types for sublime crafts.
 */
export type HarmonyType = 'forge' | 'alchemical' | 'inscription' | 'resonance';

/**
 * Scaling definition matching game's Scaling type.
 * Used for calculating effect amounts with various modifiers.
 */
export interface Scaling {
  /** Base value */
  value: number;
  /** Stat to multiply by (control, intensity, stacks, etc.) */
  stat?: string;
  /** Additional scaling variable name */
  scaling?: string;
  /** Custom equation string */
  eqn?: string;
  /** Custom scaling with multiplier */
  customScaling?: { multiplier: number; scaling: string };
  /** Additive equation */
  additiveEqn?: string;
  /** Maximum value cap */
  max?: Scaling;
}

/**
 * Buff effect kinds matching the game.
 */
export type BuffEffectKind =
  | 'completion'
  | 'perfection'
  | 'stability'
  | 'maxStability'
  | 'pool'
  | 'negate'
  | 'createBuff'
  | 'addStack'
  | 'changeToxicity';

/**
 * Buff effect definition.
 */
export interface BuffEffect {
  kind: BuffEffectKind;
  amount?: Scaling;
  stacks?: Scaling;
  buff?: BuffDefinition;
}

/**
 * Buff stat modifiers.
 */
export interface BuffStats {
  control?: Scaling;
  intensity?: Scaling;
  critchance?: Scaling;
  critmultiplier?: Scaling;
  poolCostPercentage?: Scaling;
  stabilityCostPercentage?: Scaling;
  successChanceBonus?: Scaling;
  [key: string]: Scaling | undefined;
}

/**
 * Complete buff definition matching game structure.
 */
export interface BuffDefinition {
  name: string;
  icon?: string;
  canStack: boolean;
  maxStacks?: number;
  /** Stat modifiers provided by this buff */
  stats?: BuffStats;
  /** Effects executed every turn */
  effects: BuffEffect[];
  /** Effects executed on fusion actions */
  onFusion?: BuffEffect[];
  /** Effects executed on refine actions */
  onRefine?: BuffEffect[];
  /** Effects executed on stabilize actions */
  onStabilize?: BuffEffect[];
  /** Effects executed on support actions */
  onSupport?: BuffEffect[];
  displayLocation?: 'player' | 'recipe';
}

/**
 * Active buff instance with stacks.
 */
export interface ActiveBuff {
  definition: BuffDefinition;
  stacks: number;
}

/**
 * Technique effect kinds matching the game.
 */
export type TechniqueEffectKind =
  | 'completion'
  | 'perfection'
  | 'stability'
  | 'maxStability'
  | 'pool'
  | 'createBuff'
  | 'consumeBuff'
  | 'cleanseToxicity';

/**
 * Technique effect definition.
 */
export interface TechniqueEffect {
  kind: TechniqueEffectKind;
  amount?: Scaling;
  stacks?: Scaling;
  buff?: BuffDefinition;
}

/**
 * Mastery definition matching the game.
 */
export type TechniqueMastery =
  | { kind: 'control'; percentage: number }
  | { kind: 'intensity'; percentage: number }
  | { kind: 'critchance'; percentage: number }
  | { kind: 'critmultiplier'; percentage: number }
  | { kind: 'effect'; effects: TechniqueEffect[] }
  | { kind: 'poolcost'; change: number }
  | { kind: 'stabilitycost'; change: number }
  | { kind: 'successchance'; change: number }
  | { kind: 'upgrade'; upgradeKey: string; change: number; shouldMultiply?: boolean };

/**
 * Complete technique definition matching game structure.
 */
export interface TechniqueDefinition {
  name: string;
  key: string;
  icon?: string;
  poolCost: number;
  toxicityCost?: number;
  stabilityCost: number;
  noMaxStabilityLoss?: boolean;
  successChance: number; // 0-1
  cooldown: number;
  currentCooldown: number;
  buffCost?: { buff: BuffDefinition; amount: number };
  buffRequirement?: { buff: BuffDefinition; amount: number };
  conditionRequirement?: CraftingCondition;
  effects: TechniqueEffect[];
  type: TechniqueType;
  mastery?: TechniqueMastery[];
}

/**
 * Condition effect for a specific condition type.
 */
export interface ConditionEffect {
  kind: 'control' | 'intensity' | 'pool' | 'stability' | 'chance';
  multiplier?: number; // For control/intensity/pool/stability
  bonus?: number; // For chance (flat bonus)
}

/**
 * Recipe condition effects structure.
 */
export interface RecipeConditionEffects {
  conditionEffects: {
    [key in CraftingCondition]: {
      effects: ConditionEffect[];
    };
  };
}

/**
 * Harmony type data for sublime crafts.
 */
export interface HarmonyData {
  /** Forge Works: current heat level 0-10 */
  heat?: number;
  /** Alchemical Arts: last 3 action types */
  lastActions?: TechniqueType[];
  /** Inscribed Patterns: current pattern index and stacks */
  patternIndex?: number;
  patternStacks?: number;
  /** Spiritual Resonance: current resonance type and strength */
  resonanceType?: TechniqueType;
  resonanceStrength?: number;
  consecutiveDifferent?: number;
}

/**
 * Variables object passed to scaling calculations.
 */
export interface ScalingVariables {
  control: number;
  intensity: number;
  critchance: number;
  critmultiplier: number;
  pool: number;
  maxpool: number;
  toxicity: number;
  maxtoxicity: number;
  resistance: number;
  itemEffectiveness: number;
  pillsPerRound: number;
  poolCostPercentage: number;
  stabilityCostPercentage: number;
  successChanceBonus: number;
  stacks: number;
  [key: string]: number;
}

/**
 * Exponential scaling factor for bonus thresholds.
 */
export const EXPONENTIAL_SCALING_FACTOR = 1.3;

/**
 * Calculate bonus count and chance from completion/perfection progress.
 * Matches game's getBonusAndChance function.
 */
export function getBonusAndChance(
  value: number,
  target: number
): { guaranteed: number; bonusChance: number; nextThreshold: number } {
  if (target <= 0) {
    return { guaranteed: 0, bonusChance: 0, nextThreshold: 0 };
  }

  let currentTarget = target;
  let remainingValue = value;
  let guaranteed = 0;

  while (remainingValue > 0 && currentTarget > 0 && remainingValue >= currentTarget) {
    remainingValue -= currentTarget;
    guaranteed++;
    currentTarget = Math.floor(currentTarget * EXPONENTIAL_SCALING_FACTOR);
  }

  const bonusChance = currentTarget > 0 ? remainingValue / currentTarget : 0;
  const nextThreshold = value + (currentTarget - remainingValue);

  return { guaranteed, bonusChance, nextThreshold };
}

/**
 * Calculate crafting overcrit (excess crit > 100% converts to bonus multiplier).
 * Matches game's calculateCraftingOvercrit function.
 *
 * @param critChance - Crit chance percentage (0-100+)
 * @param critMultiplier - Base crit multiplier percentage (e.g., 150 for 1.5x)
 * @returns Expected multiplier for deterministic simulation
 */
export function calculateExpectedCritMultiplier(
  critChance: number,
  critMultiplier: number
): number {
  // Excess crit chance (>100%) converts to bonus multiplier at 1:3 ratio
  const excessCritChance = Math.max(0, critChance - 100);
  const bonusCritMultiplier = excessCritChance * 3;
  const effectiveCritMultiplier = critMultiplier + bonusCritMultiplier;

  // For deterministic simulation, use expected value
  const actualCritChance = Math.min(critChance, 100) / 100;
  const critMultiplierAsRatio = effectiveCritMultiplier / 100;

  // Expected value: (1 - critChance) * 1 + critChance * multiplier
  return 1 - actualCritChance + actualCritChance * critMultiplierAsRatio;
}

/**
 * Safe recursive descent parser for simple arithmetic expressions.
 * Supports: +, -, *, /, parentheses, and numeric literals.
 * No eval() -- prevents code injection.
 */
function safeParseMath(expr: string): number {
  let pos = 0;
  const s = expr.replace(/\s+/g, '');

  function parseExpr(): number {
    let result = parseTerm();
    while (pos < s.length && (s[pos] === '+' || s[pos] === '-')) {
      const op = s[pos++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < s.length && (s[pos] === '*' || s[pos] === '/')) {
      const op = s[pos++];
      const right = parseFactor();
      result = op === '*' ? result * right : (right !== 0 ? result / right : 0);
    }
    return result;
  }

  function parseFactor(): number {
    if (s[pos] === '(') {
      pos++;
      const result = parseExpr();
      if (s[pos] === ')') pos++;
      return result;
    }
    if (s[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    const start = pos;
    while (pos < s.length && (s[pos] >= '0' && s[pos] <= '9' || s[pos] === '.')) {
      pos++;
    }
    const num = parseFloat(s.slice(start, pos));
    return isNaN(num) ? 0 : num;
  }

  const result = parseExpr();
  return isFinite(result) ? result : 0;
}

/**
 * Expression evaluator for game equations with variable substitution.
 * Uses a safe recursive descent parser instead of eval().
 */
export function evalExpression(eqn: string, variables: ScalingVariables): number {
  if (!eqn) return 1;

  // Sort variable names by length descending to prevent partial matches
  // (e.g., 'maxpool' must be replaced before 'pool')
  const sortedKeys = Object.keys(variables).sort((a, b) => b.length - a.length);

  let expr = eqn;
  for (const key of sortedKeys) {
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    expr = expr.replace(regex, String(variables[key]));
  }

  // Check that all variables were substituted (only numbers and operators remain)
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    console.warn(`[CraftBuddy] Unresolved variables in expression: ${eqn} -> ${expr}`);
    return 1;
  }

  try {
    return safeParseMath(expr);
  } catch {
    console.warn(`[CraftBuddy] Failed to evaluate expression: ${eqn}`);
    return 1;
  }
}

/**
 * Evaluate a Scaling object to get the final value.
 * Matches game's evaluateScaling function.
 */
export function evaluateScaling(
  scaling: Scaling | undefined,
  variables: ScalingVariables,
  defaultValue: number = 0
): number {
  if (!scaling) return defaultValue;

  let result = scaling.value;

  // Multiply by stat value if specified
  if (scaling.stat && scaling.stat in variables) {
    result *= variables[scaling.stat];
  }

  // Multiply by scaling variable if specified
  if (scaling.scaling && scaling.scaling in variables) {
    result *= variables[scaling.scaling];
  }

  // Apply custom equation
  if (scaling.eqn) {
    result *= evalExpression(scaling.eqn, variables);
  }

  // Apply custom scaling with multiplier
  if (scaling.customScaling) {
    const scaleValue = variables[scaling.customScaling.scaling] || 0;
    result *= 1 + scaling.customScaling.multiplier * scaleValue;
  }

  // Add additive equation result
  if (scaling.additiveEqn) {
    result += evalExpression(scaling.additiveEqn, variables);
  }

  // Apply max cap
  if (scaling.max) {
    const maxValue = evaluateScaling(scaling.max, variables, Infinity);
    result = Math.min(result, maxValue);
  }

  return result;
}

/**
 * Parse a game RecipeConditionEffect object into a map of condition -> ConditionEffect[].
 * This extracts the real multiplier values from game data so we don't rely on hardcoded tables.
 */
export function parseRecipeConditionEffects(
  conditionEffects: Record<string, { effects?: Array<{ kind: string; multiplier?: number; bonus?: number }> }>
): Record<CraftingCondition, ConditionEffect[]> {
  const result: Record<CraftingCondition, ConditionEffect[]> = {
    neutral: [],
    positive: [],
    negative: [],
    veryPositive: [],
    veryNegative: [],
  };

  const conditions: CraftingCondition[] = ['neutral', 'positive', 'negative', 'veryPositive', 'veryNegative'];
  for (const cond of conditions) {
    const data = conditionEffects[cond];
    if (!data?.effects) continue;
    result[cond] = data.effects
      .filter(e => e && e.kind)
      .map(e => {
        const effect: ConditionEffect = { kind: e.kind as ConditionEffect['kind'] };
        if (e.kind === 'chance') {
          effect.bonus = e.bonus;
        } else {
          effect.multiplier = e.multiplier;
        }
        return effect;
      });
  }

  return result;
}

/**
 * Get condition effects for a given condition and recipe type.
 * Hardcoded fallback table -- used when real game data is not available.
 */
export function getConditionEffects(
  conditionType: RecipeConditionEffectType,
  condition: CraftingCondition
): ConditionEffect[] {
  // Default condition effects by type
  const effects: Record<RecipeConditionEffectType, Record<CraftingCondition, ConditionEffect[]>> = {
    perfectable: {
      neutral: [],
      positive: [{ kind: 'control', multiplier: 0.5 }],
      negative: [{ kind: 'control', multiplier: -0.5 }],
      veryPositive: [{ kind: 'control', multiplier: 1.0 }],
      veryNegative: [{ kind: 'control', multiplier: -1.0 }],
    },
    fuseable: {
      neutral: [],
      positive: [{ kind: 'intensity', multiplier: 0.5 }],
      negative: [{ kind: 'intensity', multiplier: -0.5 }],
      veryPositive: [{ kind: 'intensity', multiplier: 1.0 }],
      veryNegative: [{ kind: 'intensity', multiplier: -1.0 }],
    },
    flowing: {
      neutral: [],
      positive: [
        { kind: 'control', multiplier: 0.25 },
        { kind: 'intensity', multiplier: 0.25 },
      ],
      negative: [
        { kind: 'control', multiplier: -0.25 },
        { kind: 'intensity', multiplier: -0.25 },
      ],
      veryPositive: [
        { kind: 'control', multiplier: 0.5 },
        { kind: 'intensity', multiplier: 0.5 },
      ],
      veryNegative: [
        { kind: 'control', multiplier: -0.5 },
        { kind: 'intensity', multiplier: -0.5 },
      ],
    },
    energised: {
      neutral: [],
      positive: [{ kind: 'pool', multiplier: 0.7 }], // -30%
      negative: [{ kind: 'pool', multiplier: 1.3 }], // +30%
      veryPositive: [{ kind: 'pool', multiplier: 0.4 }], // -60%
      veryNegative: [{ kind: 'pool', multiplier: 1.6 }], // +60%
    },
    stable: {
      neutral: [],
      positive: [{ kind: 'stability', multiplier: 0.7 }], // -30%
      negative: [{ kind: 'stability', multiplier: 1.3 }], // +30%
      veryPositive: [{ kind: 'stability', multiplier: 0.4 }], // -60%
      veryNegative: [{ kind: 'stability', multiplier: 1.6 }], // +60%
    },
    fortuitous: {
      neutral: [],
      positive: [{ kind: 'chance', bonus: 0.25 }],
      negative: [{ kind: 'chance', bonus: -0.25 }],
      veryPositive: [{ kind: 'chance', bonus: 0.5 }],
      veryNegative: [{ kind: 'chance', bonus: -0.5 }],
    },
  };

  return effects[conditionType]?.[condition] || [];
}