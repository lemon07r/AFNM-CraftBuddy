/**
 * CraftBuddy - Search Algorithms
 *
 * Implements greedy and lookahead search algorithms to find the optimal
 * next skill to use during crafting.
 *
 * Performance optimizations:
 * - Move ordering: Search promising skills first (buff skills when no buff, high-gain skills)
 * - Memoization: Cache search results by state key with progress bucketing for large numbers
 * - Alpha-beta pruning: Cut off branches that can't improve the result
 * - Beam search: Limit branches explored at each depth level
 * - Early termination: Stop when targets are met
 * - Time budget: Prevent UI freezes with configurable time limits
 * - Iterative deepening: For 90+ round scenarios, start shallow and deepen
 */

import { CraftingState, BuffType } from './state';
import {
  SkillDefinition,
  OptimizerConfig,
  applySkill,
  calculateActionSurvivabilityFloor,
  calculateEffectiveActionCosts,
  getAvailableSkills,
  calculateSkillGains,
  calculateDisplayedSkillGains,
  isTerminalState,
  getBlockedSkillReasons,
  getConditionEffectsForConfig,
} from './skills';
import { getHarmonyStatModifiers } from './harmony';
import {
  clampSearchGoalPriorityBias,
  DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  SEARCH_GOAL_PRIORITY_BIAS_MAX,
} from '../utils/searchGoalPriority';
import { getBonusAndChance, TechniqueType } from './gameTypes';
import { getNativeMctsPolicy, type NativeMctsPolicy } from './nativeMcts';

interface GainPreview {
  completion: number;
  perfection: number;
  stability: number;
}

interface ActionCostPreview {
  qi: number;
  stability: number;
}

export interface SkillRecommendation {
  skill: SkillDefinition;
  /** Projected expected-value gain (includes RNG EV). */
  expectedGains: GainPreview;
  /** Immediate tooltip-style gain (without RNG EV multipliers). */
  immediateGains: GainPreview;
  /** Effective action costs after runtime modifiers (buffs/condition/harmony). */
  effectiveCosts: ActionCostPreview;
  score: number;
  reasoning: string;
  /** Quality rating from 0-100 based on how close to optimal this choice is */
  qualityRating?: number;
  /** Whether this skill consumes buffs for gains (e.g., Disciplined Touch) */
  consumesBuff?: boolean;
  /** Suggested follow-up skill after this one */
  followUpSkill?: {
    name: string;
    type: string;
    actionKind?: SkillDefinition['actionKind'];
    icon?: string;
    expectedGains: GainPreview;
    immediateGains: GainPreview;
    effectiveCosts: ActionCostPreview;
    projectedSuccessChance?: number;
  };
  /** Success chance if this recommendation ends the craft immediately. */
  projectedSuccessChance?: number;
  /** Whether executing this action would resolve the craft immediately. */
  endsCraft?: boolean;
  /** Whether the line depends on probabilistic survival rather than a guaranteed floor. */
  requiresProbabilisticSurvival?: boolean;
}

/** Diagnostic info for why skills are unavailable */
export interface SkillBlockedReason {
  skillName: string;
  reason: 'cooldown' | 'qi' | 'stability' | 'toxicity' | 'condition';
  details: string;
}

export interface SearchResult {
  recommendation: SkillRecommendation | null;
  alternativeSkills: SkillRecommendation[];
  isTerminal: boolean;
  targetsMet: boolean;
  /** Diagnostic info for why no skills are available (when isTerminal is true) */
  blockedReasons?: SkillBlockedReason[];
  /** Full optimal rotation (sequence of skills) to reach targets */
  optimalRotation?: string[];
  /** Expected final state if following the optimal rotation */
  expectedFinalState?: {
    completion: number;
    perfection: number;
    stability: number;
    maxStability: number;
    qi: number;
    turnsRemaining: number;
    projectedSuccessChance?: number;
  };
  /** Search performance metrics */
  searchMetrics?: {
    /** Cache-miss frontier nodes that were actually expanded. */
    nodesExplored: number;
    cacheHits: number;
    timeTakenMs: number;
    /** Deepest fully completed frontier kept for the returned result set. */
    depthReached: number;
    pruned: number;
    /** Optional native MCTS root policy metrics when the WASM engine is available. */
    mcts?: {
      backend: string;
      iterations: number;
      nodes: number;
      rolloutDepth: number;
      bestSkillKey?: string;
      policyCount: number;
    };
  };
}

/**
 * Search configuration for performance tuning
 */
export interface SearchConfig {
  /** Maximum time budget in milliseconds (default: 500ms) */
  timeBudgetMs: number;
  /** Maximum cache-miss frontier nodes to expand before stopping (default: 200000) */
  maxNodes: number;
  /** Beam width - max branches to explore at each level (default: 8) */
  beamWidth: number;
  /**
   * Completion/perfection search bias.
   * -100 = perfection priority, 0 = balanced, 100 = completion priority.
   */
  goalPriorityBias: number;
  /** Whether to use alpha-beta pruning (default: true) */
  useAlphaBeta: boolean;
  /** Progress bucket size for cache key normalization (default: 100) */
  progressBucketSize: number;
  /**
   * Use iterative deepening for long crafts (default: true).
   * Starts with shallow search and increases depth incrementally.
   */
  useIterativeDeepening: boolean;
  /**
   * Minimum depth for iterative deepening (default: 3).
   */
  iterativeDeepeningMinDepth: number;
  /**
   * Adaptive beam width based on local remaining depth (default: true).
   * Narrows short-horizon subproblems without making cache validity depend on
   * the original root depth.
   */
  useAdaptiveBeamWidth: boolean;
  /**
   * Enable probability-weighted condition branching once forecast queue is exhausted.
   */
  enableConditionBranchingAfterForecast: boolean;
  /**
   * Max number of condition branches to keep per step when branching.
   */
  conditionBranchLimit: number;
  /**
   * Minimum branch probability retained before top-N fallback.
   */
  conditionBranchMinProbability: number;
  /**
   * Enable the native Rust/WASM Monte Carlo Tree Search root policy prior.
   * The TypeScript scorer remains authoritative; MCTS only influences
   * root ordering inside the normal score tie window.
   */
  useMonteCarloTreeSearch?: boolean;
  /** Number of MCTS iterations for the native root policy. */
  mctsIterations?: number;
  /** MCTS rollout depth. Defaults lower than lookahead depth for speed. */
  mctsRolloutDepth?: number;
  /** UCT exploration constant for native MCTS. */
  mctsExploration?: number;
  /** Native MCTS node cap. */
  mctsMaxNodes?: number;
}

/** Game UI + runtime always expose 3 future conditions. */
export const VISIBLE_CONDITION_QUEUE_LENGTH = 3;

/** Default search configuration — generous budget for turn-based gameplay */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  timeBudgetMs: 2000,
  maxNodes: 750000,
  beamWidth: 10,
  goalPriorityBias: DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  useAlphaBeta: true,
  progressBucketSize: 100,
  useIterativeDeepening: true,
  iterativeDeepeningMinDepth: 3,
  useAdaptiveBeamWidth: true,
  enableConditionBranchingAfterForecast: true,
  conditionBranchLimit: 2,
  conditionBranchMinProbability: 0.15,
  useMonteCarloTreeSearch: false,
  mctsIterations: 250,
  mctsRolloutDepth: 16,
  mctsExploration: 1.15,
  mctsMaxNodes: 5000,
};

const DIVERSITY_TIEBREAK_SCORE_WINDOW = 1;
const FINISH_CRAFT_KEY = '__finish_craft__';
const FINISH_CRAFT_NAME = 'Finish Craft';
const ZERO_GAINS: GainPreview = Object.freeze({
  completion: 0,
  perfection: 0,
  stability: 0,
});
const ZERO_COSTS: ActionCostPreview = Object.freeze({
  qi: 0,
  stability: 0,
});
const FINISH_CRAFT_SKILL: SkillDefinition = Object.freeze({
  name: FINISH_CRAFT_NAME,
  key: FINISH_CRAFT_KEY,
  qiCost: 0,
  stabilityCost: 0,
  baseCompletionGain: 0,
  basePerfectionGain: 0,
  stabilityGain: 0,
  maxStabilityChange: 0,
  buffType: BuffType.NONE,
  buffDuration: 0,
  buffMultiplier: 1,
  type: 'support',
  actionKind: 'finish',
  consumesTurn: false,
});

// ── Scoring weights ─────────────────────────────────────────────────────────
// Each constant documents its magnitude relative to other scoring layers.
// All penalties/bonuses that depend on craft size use totalTargetMagnitude
// as the base, so they scale proportionally to any craft.
const SCORING = {
  // Target-met bonus = totalTargetMagnitude × this.  2× is large enough
  // to clearly separate "met" from "almost met" without dwarfing progress.
  TARGET_MET_MULTIPLIER: 2,
  // Sublime targets-met gets an extra 1.5× on top of the base bonus,
  // rewarding the harder achievement of exceeding doubled targets.
  SUBLIME_MET_EXTRA: 1.5,
  // Intentionally tiny: tiebreaker only — never large enough to justify
  // spending an extra turn to preserve qi/stability.
  RESOURCE_TIEBREAKER: 0.001,
  // Per-step cost: gives the tree search a signal that shorter paths are
  // better, preventing stabilize spirals.  0.5 is small relative to
  // per-turn progress (typically 12–24 points) but enough to break ties.
  STEP_PENALTY: 0.5,
  // Live crafts can have thousand-point progress actions. Keep the dynamic
  // step penalty well below full-turn value so it remains a tiebreaker and
  // does not bulldoze harmony/setup lines that the tree search prefers.
  STEP_PENALTY_PROGRESS_FRACTION: 0.25,
  // Beyond-base bonus weight in sublime mode.  0.5× progress value
  // so the optimizer pursues sublime targets but doesn't overvalue them
  // relative to reaching base targets first.
  SUBLIME_BEYOND_BASE_WEIGHT: 0.5,
  // Buff valuation: converts (multiplier − 1) into a score contribution
  // per remaining buff turn.  At default 1.4× buff, this yields
  // 0.4 × 25 = 10 points per turn, comparable to one turn of progress.
  BUFF_VALUE_PER_MULTIPLIER_POINT: 25,
  // Base floor for buff need-share weighting.  Ensures buffs retain
  // some value even when the corresponding target is nearly met.
  BUFF_NEED_FLOOR: 0.5,
  // Full user bias shifts half a weight point from one goal to the other
  // while preserving the overall score scale. This is strong enough to
  // steer close calls without overwhelming the remaining-work model.
  GOAL_PRIORITY_WEIGHT_SHIFT: 0.5,
  // Qi value when targets not yet met: qi enables future progress actions.
  // 0.05 per qi ≈ 10 points at full qi (194), meaningful but secondary.
  QI_RESOURCE_WEIGHT: 0.05,
  // Base stability value when targets not yet met.  Stability enables
  // future turns, so its value scales with remaining work.
  STABILITY_BASE_WEIGHT: 0.01,
  STABILITY_WORK_WEIGHT: 0.01,
  // Overshoot penalty: discourages exceeding targets.  0.3× means
  // 10 points of overshoot costs 3 score — enough to steer the
  // optimizer but not so large it avoids finishing a nearly-met target.
  OVERSHOOT_PENALTY_WEIGHT: 0.3,
  // Finished-craft shortfall penalty: once the craft is ended, any remaining
  // unmet work is permanent. Penalize unresolved completion/perfection at
  // full weight so live states with runway outrank shallow partial finishes.
  FINISHED_UNMET_PENALTY_WEIGHT: 1,
  // Hard-cap violation is 3× overshoot weight — strong deterrent against
  // exceeding the recipe's absolute maximum.
  HARD_CAP_PENALTY_WEIGHT: 3,
  // Normal-mode stability threshold: the stability level below which
  // a quadratic penalty applies.  Expressed as turns of runway needed
  // (2 turns base + scaling with remaining work up to ~4 turns total),
  // multiplied by the actual average stability cost per turn.
  STABILITY_THRESHOLD_TURNS_BASE: 1.4,
  STABILITY_THRESHOLD_TURNS_SCALE: 2.6,
  // Training-mode stability threshold: more aggressive (less penalty)
  // because training crafts have lower stakes.
  STABILITY_THRESHOLD_TURNS_BASE_TRAINING: 0.8,
  STABILITY_THRESHOLD_TURNS_SCALE_TRAINING: 0.8,
  // Stability penalty weight as a fraction of totalTargetMagnitude.
  // Quadratic penalty = risk² × (totalTargetMagnitude × this fraction).
  STABILITY_PENALTY_FRACTION: 0.45,
  STABILITY_PENALTY_FRACTION_TRAINING: 0.08,
  // Minimum stability penalty weight floors — prevents the penalty from
  // becoming negligible on very small crafts.
  STABILITY_PENALTY_FLOOR: 45,
  STABILITY_PENALTY_FLOOR_TRAINING: 8,
  // Near-death linear penalty: below this many stability points,
  // an additional linear penalty ramps up urgency.
  NEAR_DEATH_STABILITY: 10,
  // Death penalty multiplier: when stability=0, the craft is dead.
  // Penalty = totalTargetMagnitude × this.  Must be larger than
  // TARGET_MET_MULTIPLIER so that dying is never worth the progress gained
  // on the way to death.  3× means: negate the target-met bonus (2×) plus
  // erase the progress score itself.
  DEATH_PENALTY_MULTIPLIER: 3,
  // Runway penalty: per-turn-gap fraction of totalTargetMagnitude.
  // Penalizes states where estimated turns to finish exceeds stability
  // runway.  No cap — the penalty scales with the severity of the shortfall.
  // 0.1× means each turn of shortfall costs 10% of totalTargetMagnitude.
  RUNWAY_GAP_FRACTION: 0.1,
  RUNWAY_GAP_FRACTION_TRAINING: 0.04,
  // Toxicity penalty as a fraction of totalTargetMagnitude.
  // Proportional so it scales correctly for small and large crafts.
  TOXICITY_PENALTY_FRACTION: 0.025,
  // Harmony bonus weight in sublime mode.  Small incentive to maintain
  // positive harmony for the harmony sub-system benefits.
  HARMONY_BONUS_WEIGHT: 0.15,
  // Harmony sub-system quality weight.  Scales with remaining work so
  // the tree search values being in a productive harmony state (e.g.,
  // forge heat 4-6) vs a terrible one (heat 0 or 10).  0.15× means at
  // full remaining work, optimal heat adds ~15% of totalTargetMagnitude.
  HARMONY_SUBSYSTEM_QUALITY_WEIGHT: 0.15,
} as const;

// ── Scoring context ─────────────────────────────────────────────────────────
// Carries precomputed craft-specific values into scoreState() so that
// survivability estimates use actual skill data instead of hardcoded guesses.
interface ScoringContext {
  /** Average stability cost per progress turn, from available skills. */
  avgStabilityCostPerTurn: number;
  /** Representative completion gain per productive turn. */
  avgCompletionGainPerTurn: number;
  /** Representative perfection gain per productive turn. */
  avgPerfectionGainPerTurn: number;
  /** Weighted overall gain per productive turn. */
  avgGainPerTurn: number;
  /** Average qi cost per progress turn, from available skills. */
  avgQiCostPerTurn: number;
}

/** Default scoring context used when callers don't provide one. */
const DEFAULT_SCORING_CONTEXT: ScoringContext = {
  avgStabilityCostPerTurn: 10,
  avgCompletionGainPerTurn: 16,
  avgPerfectionGainPerTurn: 16,
  avgGainPerTurn: 16,
  avgQiCostPerTurn: 0,
};

interface ProgressScoringSample {
  completionGain: number;
  perfectionGain: number;
  totalGain: number;
  qiCost: number;
  stabilityCost: number;
}

const SCORING_CONTEXT_PROGRESS_SAMPLE_SIZE = 2;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTopProgressAverage(
  values: number[],
  sampleSize: number = SCORING_CONTEXT_PROGRESS_SAMPLE_SIZE,
): number {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, sampleSize));
  return average(sorted);
}

function estimateWeightedProgressPerTurn(
  completionShare: number,
  perfectionShare: number,
  ctx: ScoringContext,
): number {
  const completionGain = Math.max(1, ctx.avgCompletionGainPerTurn);
  const perfectionGain = Math.max(1, ctx.avgPerfectionGainPerTurn);
  const totalShare =
    Math.max(0, completionShare) + Math.max(0, perfectionShare);
  if (totalShare <= 0) {
    return Math.max(1, ctx.avgGainPerTurn);
  }

  return (
    (Math.max(0, completionShare) * completionGain +
      Math.max(0, perfectionShare) * perfectionGain) /
    totalShare
  );
}

function estimateTurnsRemainingFromContext(
  completionRemaining: number,
  perfectionRemaining: number,
  completionShare: number,
  perfectionShare: number,
  ctx: ScoringContext,
): number {
  if (completionRemaining <= 0 && perfectionRemaining <= 0) {
    return 0;
  }

  if (completionRemaining > 0 && perfectionRemaining <= 0) {
    return Math.ceil(
      completionRemaining / Math.max(1, ctx.avgCompletionGainPerTurn),
    );
  }
  if (perfectionRemaining > 0 && completionRemaining <= 0) {
    return Math.ceil(
      perfectionRemaining / Math.max(1, ctx.avgPerfectionGainPerTurn),
    );
  }

  const weightedProgressPerTurn = estimateWeightedProgressPerTurn(
    completionShare,
    perfectionShare,
    ctx,
  );
  return Math.ceil(
    (completionRemaining + perfectionRemaining) /
      Math.max(1, weightedProgressPerTurn),
  );
}

/**
 * Build a ScoringContext from actual config values.
 * Callers that have access to OptimizerConfig should use this instead of
 * relying on DEFAULT_SCORING_CONTEXT.
 */
function buildScoringContext(
  config: OptimizerConfig,
  referenceState?: CraftingState,
  currentCondition: CraftingConditionType = 'neutral',
): ScoringContext {
  const baselineState =
    referenceState ||
    new CraftingState({
      qi: config.maxQi,
      stability: config.maxStability,
      initialMaxStability: config.maxStability,
      completion: 0,
      perfection: 0,
      maxToxicity: config.maxToxicity || 0,
    });
  const conditionEffects = getConditionEffectsForConfig(
    config,
    currentCondition,
  );
  const configuredSkills = config.skills || [];
  const availableSkills = getAvailableSkills(
    baselineState,
    config,
    currentCondition,
  );

  const collectSamples = (skills: SkillDefinition[]): ProgressScoringSample[] =>
    skills
      .map((skill) => {
        const consumesTurn =
          skill.consumesTurn !== undefined
            ? skill.consumesTurn
            : skill.actionKind !== 'item';
        if (!consumesTurn || skill.actionKind === 'finish') {
          return null;
        }

        const gains = calculateSkillGains(
          baselineState,
          skill,
          config,
          conditionEffects,
          { includeExpectedValue: false },
        );
        const completionGain = Math.max(0, gains.completion);
        const perfectionGain = Math.max(0, gains.perfection);
        const totalGain = completionGain + perfectionGain;
        if (totalGain <= 0) {
          return null;
        }

        const costs = calculateEffectiveActionCosts(
          baselineState,
          skill,
          config.minStability,
          conditionEffects,
          config,
        );

        return {
          completionGain,
          perfectionGain,
          totalGain,
          qiCost: Math.max(0, costs.qiCost),
          stabilityCost: Math.max(0, costs.stabilityCost),
        } satisfies ProgressScoringSample;
      })
      .filter((sample): sample is ProgressScoringSample => sample !== null);

  const samples = collectSamples(availableSkills);
  const fallbackSamples =
    samples.length > 0 ? samples : collectSamples(configuredSkills);

  if (fallbackSamples.length === 0) {
    const fallbackGain = Math.max(
      1,
      config.baseIntensity || 12,
      config.baseControl || 16,
    );
    return {
      avgStabilityCostPerTurn: DEFAULT_SCORING_CONTEXT.avgStabilityCostPerTurn,
      avgCompletionGainPerTurn: fallbackGain,
      avgPerfectionGainPerTurn: fallbackGain,
      avgGainPerTurn: fallbackGain,
      avgQiCostPerTurn: DEFAULT_SCORING_CONTEXT.avgQiCostPerTurn,
    };
  }

  const topOverallSamples = [...fallbackSamples]
    .sort((a, b) => b.totalGain - a.totalGain)
    .slice(0, Math.max(1, SCORING_CONTEXT_PROGRESS_SAMPLE_SIZE));

  const avgCompletionGainPerTurn = Math.max(
    1,
    getTopProgressAverage(
      fallbackSamples.map((sample) => sample.completionGain),
    ) || average(topOverallSamples.map((sample) => sample.totalGain)),
  );
  const avgPerfectionGainPerTurn = Math.max(
    1,
    getTopProgressAverage(
      fallbackSamples.map((sample) => sample.perfectionGain),
    ) || average(topOverallSamples.map((sample) => sample.totalGain)),
  );
  const avgGainPerTurn = Math.max(
    1,
    average(topOverallSamples.map((sample) => sample.totalGain)),
  );
  const avgStabilityCostPerTurn = Math.max(
    1,
    average(topOverallSamples.map((sample) => sample.stabilityCost)) ||
      DEFAULT_SCORING_CONTEXT.avgStabilityCostPerTurn,
  );
  const avgQiCostPerTurn = Math.max(
    0,
    average(topOverallSamples.map((sample) => sample.qiCost)),
  );

  return {
    avgStabilityCostPerTurn,
    avgCompletionGainPerTurn,
    avgPerfectionGainPerTurn,
    avgGainPerTurn,
    avgQiCostPerTurn,
  };
}

/**
 * Calculate adaptive beam width based only on local remaining depth.
 * This keeps the search policy stationary for a given subproblem, so
 * transposition-table entries remain reusable across iterative-deepening
 * passes instead of depending on the original root depth.
 */
function getAdaptiveBeamWidth(
  baseBeamWidth: number,
  remainingDepth: number,
): number {
  if (remainingDepth >= 12) {
    return baseBeamWidth;
  }

  if (remainingDepth >= 6) {
    return Math.max(3, Math.ceil(baseBeamWidth * 0.8));
  }

  if (remainingDepth >= 3) {
    return Math.max(3, Math.ceil(baseBeamWidth * 0.6));
  }

  return Math.max(2, Math.ceil(baseBeamWidth * 0.5));
}

function normalizeConditionType(
  condition: string | undefined,
): CraftingConditionType {
  if (!condition) return 'neutral';
  const c = String(condition).toLowerCase();
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
    case 'excellent':
    case 'brilliant':
      return 'veryPositive';
    case 'verynegative':
    case 'corrupted':
      return 'veryNegative';
    default:
      return c as CraftingConditionType;
  }
}

interface ConditionDistributionEntry {
  condition: CraftingConditionType;
  probability: number;
}

interface ConditionTransition {
  nextCondition: CraftingConditionType;
  nextQueue: CraftingConditionType[];
  probability: number;
}

export type ConditionTransitionProvider = (
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
  cfg: SearchConfig,
) => ConditionTransition[];

let activeConditionTransitionProvider: ConditionTransitionProvider | undefined;

export function setConditionTransitionProvider(
  provider: ConditionTransitionProvider | undefined,
): void {
  activeConditionTransitionProvider = provider;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeConditionDistribution(
  entries: ConditionDistributionEntry[],
): ConditionDistributionEntry[] {
  const merged = new Map<CraftingConditionType, number>();
  for (const entry of entries) {
    if (!entry?.condition) continue;
    const probability = clampProbability(entry.probability);
    if (probability <= 0) continue;
    merged.set(
      entry.condition,
      (merged.get(entry.condition) || 0) + probability,
    );
  }
  const total = Array.from(merged.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (total <= 0) {
    return [{ condition: 'neutral', probability: 1 }];
  }
  return Array.from(merged.entries())
    .map(([condition, probability]) => ({
      condition,
      probability: probability / total,
    }))
    .sort((a, b) => b.probability - a.probability);
}

function getGeneratedConditionDistribution(
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
): ConditionDistributionEntry[] {
  const current = normalizeConditionType(currentCondition);
  const queue = nextConditions.map(normalizeConditionType);
  const clampedHarmony = Math.max(-100, Math.min(100, harmony));
  const negativeDelta = clampedHarmony < 0 ? Math.abs(clampedHarmony) / 100 : 0;
  const positiveDelta = clampedHarmony > 0 ? Math.abs(clampedHarmony) / 100 : 0;
  const lastCondition = queue.length > 0 ? queue[queue.length - 1] : undefined;

  if (lastCondition === 'veryPositive' || lastCondition === 'veryNegative') {
    return [{ condition: 'neutral', probability: 1 }];
  }
  if (lastCondition === 'positive') {
    const upgradeChance = clampProbability(0.3 * positiveDelta);
    return normalizeConditionDistribution([
      { condition: 'veryPositive', probability: upgradeChance },
      { condition: 'neutral', probability: 1 - upgradeChance },
    ]);
  }
  if (lastCondition === 'negative') {
    const upgradeChance = clampProbability(0.3 * negativeDelta);
    return normalizeConditionDistribution([
      { condition: 'veryNegative', probability: upgradeChance },
      { condition: 'neutral', probability: 1 - upgradeChance },
    ]);
  }

  let changeProbability = 0;
  if (
    current === 'neutral' &&
    queue.every((condition) => condition === 'neutral')
  ) {
    changeProbability = 1;
  } else {
    let neutralCount = 0;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i] === 'neutral') {
        neutralCount++;
      } else {
        break;
      }
    }
    changeProbability = clampProbability(
      neutralCount * (0.15 + 0.15 * Math.max(negativeDelta, positiveDelta)),
    );
  }

  const positiveChance = clampProbability((clampedHarmony + 100) / 200);
  return normalizeConditionDistribution([
    { condition: 'neutral', probability: 1 - changeProbability },
    { condition: 'positive', probability: changeProbability * positiveChance },
    {
      condition: 'negative',
      probability: changeProbability * (1 - positiveChance),
    },
  ]);
}

function pickBranchConditionDistribution(
  distribution: ConditionDistributionEntry[],
  cfg: SearchConfig,
): ConditionDistributionEntry[] {
  if (!cfg.enableConditionBranchingAfterForecast) {
    const first = distribution[0] || { condition: 'neutral', probability: 1 };
    return [{ condition: first.condition, probability: 1 }];
  }

  const keptByProbability = distribution.filter(
    (entry) => entry.probability >= cfg.conditionBranchMinProbability,
  );
  const limited = (
    keptByProbability.length > 0 ? keptByProbability : distribution
  ).slice(0, Math.max(1, Math.floor(cfg.conditionBranchLimit)));

  return normalizeConditionDistribution(limited);
}

function getMostLikelyCondition(
  distribution: ConditionDistributionEntry[],
): CraftingConditionType {
  return (distribution[0]?.condition || 'neutral') as CraftingConditionType;
}

function getConditionTransitions(
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
  cfg: SearchConfig,
): ConditionTransition[] {
  const queue = nextConditions.map(normalizeConditionType);
  if (queue.length > 0) {
    const nextCondition = queue[0];
    const shiftedQueue = queue.slice(1);
    const appendedDistribution = getGeneratedConditionDistribution(
      nextCondition,
      shiftedQueue,
      harmony,
    );
    const appendedBranches = pickBranchConditionDistribution(
      appendedDistribution,
      cfg,
    );
    return appendedBranches.map((entry) => ({
      nextCondition,
      nextQueue: [...shiftedQueue, entry.condition],
      probability: entry.probability,
    }));
  }

  const generatedDistribution = getGeneratedConditionDistribution(
    currentCondition,
    queue,
    harmony,
  );
  const branchedDistribution = pickBranchConditionDistribution(
    generatedDistribution,
    cfg,
  );
  return branchedDistribution.map((entry) => {
    const appendedDistribution = getGeneratedConditionDistribution(
      entry.condition,
      [],
      harmony,
    );
    const appendedCondition = getMostLikelyCondition(appendedDistribution);
    return {
      nextCondition: entry.condition,
      nextQueue: [appendedCondition],
      probability: entry.probability,
    };
  });
}

function getConditionTransitionsWithProvider(
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
  cfg: SearchConfig,
): ConditionTransition[] {
  if (activeConditionTransitionProvider) {
    try {
      const provided = activeConditionTransitionProvider(
        currentCondition,
        nextConditions,
        harmony,
        cfg,
      );
      if (Array.isArray(provided) && provided.length > 0) {
        const normalized = provided
          .map((entry) => ({
            nextCondition: normalizeConditionType(entry?.nextCondition),
            nextQueue: Array.isArray(entry?.nextQueue)
              ? entry.nextQueue.map(normalizeConditionType)
              : [],
            probability: clampProbability(entry?.probability ?? 0),
          }))
          .filter((entry) => entry.probability > 0);
        const total = normalized.reduce(
          (sum, entry) => sum + entry.probability,
          0,
        );
        if (total > 0) {
          return normalized.map((entry) => ({
            ...entry,
            probability: entry.probability / total,
          }));
        }
      }
    } catch (error) {
      console.warn(
        '[CraftBuddy] Condition transition provider failed, using local fallback:',
        error,
      );
    }
  }
  return getConditionTransitions(
    currentCondition,
    nextConditions,
    harmony,
    cfg,
  );
}

export function normalizeForecastConditionQueue(
  currentConditionType: CraftingConditionType | undefined,
  forecastedConditionTypes: CraftingConditionType[],
  harmony: number,
  visibleQueueLength: number = VISIBLE_CONDITION_QUEUE_LENGTH,
): CraftingConditionType[] {
  const targetLength = Math.max(0, Math.floor(visibleQueueLength));
  const normalizedCurrent = normalizeConditionType(currentConditionType);
  const queue = forecastedConditionTypes
    .map(normalizeConditionType)
    .slice(0, targetLength);

  while (queue.length < targetLength) {
    const distribution = getGeneratedConditionDistribution(
      normalizedCurrent,
      queue,
      harmony,
    );
    queue.push(getMostLikelyCondition(distribution));
  }

  return queue;
}

function actionConsumesTurn(skill: SkillDefinition): boolean {
  if (skill.actionKind === 'finish') {
    return false;
  }
  if (skill.consumesTurn !== undefined) {
    return skill.consumesTurn;
  }
  return skill.actionKind !== 'item';
}

function isFinishAction(skill: SkillDefinition): boolean {
  return skill.actionKind === 'finish' || skill.key === FINISH_CRAFT_KEY;
}

/**
 * Bucket a progress value for cache key normalization.
 * Large numbers are grouped into buckets to improve cache hit rates.
 *
 * For values < 1000: exact value (fine-grained for early game)
 * For values >= 1000: bucketed by progressBucketSize
 *
 * This dramatically improves cache efficiency in late game where
 * completion/perfection values can be in the millions.
 */
function bucketProgress(value: number, bucketSize: number = 100): number {
  if (value < 1000) {
    return value;
  }
  return Math.floor(value / bucketSize) * bucketSize;
}

function getProgressCacheComponent(
  value: number,
  goal: number,
  bucketSize: number,
): string {
  const hasGoal = Number.isFinite(goal) && goal > 0;
  if (!hasGoal) {
    return String(bucketProgress(value, bucketSize));
  }

  if (value < goal) {
    // Use finer buckets when close to the goal to avoid merging states
    // that are meaningfully different (e.g., 1 skill away from finishing
    // vs. 2 skills away).
    const distanceToGoal = goal - value;
    const nearGoalThreshold = Math.min(200, goal * 0.1);
    const effectiveBucket =
      distanceToGoal <= nearGoalThreshold
        ? Math.max(1, Math.floor(bucketSize / 10))
        : bucketSize;
    return String(bucketProgress(value, effectiveBucket));
  }

  // Distinguish post-target overshoot to avoid collapsing materially different
  // "target met" states into the same cache entry.
  const overshoot = Math.max(0, value - goal);
  return `MET+${bucketProgress(overshoot, bucketSize)}`;
}

function goalsMet(
  state: CraftingState,
  completionGoal: number,
  perfectionGoal: number,
): boolean {
  const hasCompletionGoal =
    Number.isFinite(completionGoal) && completionGoal > 0;
  const hasPerfectionGoal =
    Number.isFinite(perfectionGoal) && perfectionGoal > 0;

  if (!hasCompletionGoal && !hasPerfectionGoal) {
    return false;
  }

  return (
    (!hasCompletionGoal || state.completion >= completionGoal) &&
    (!hasPerfectionGoal || state.perfection >= perfectionGoal)
  );
}

function hasAnyActiveGoal(
  completionGoal: number,
  perfectionGoal: number,
): boolean {
  return (
    (Number.isFinite(completionGoal) && completionGoal > 0) ||
    (Number.isFinite(perfectionGoal) && perfectionGoal > 0)
  );
}

interface TerminalStateClassification {
  isTerminal: boolean;
  isTerminalUnmet: boolean;
}

interface BonusTierProgress {
  guaranteed: number;
  bonusChance: number;
  total: number;
  nextThreshold: number;
}

interface BonusTierOutcome {
  guaranteed: number;
  probability: number;
  threshold: number;
}

interface CraftEndOutcomeDistribution {
  completion: BonusTierProgress;
  perfection: BonusTierProgress;
  completionOutcomes: BonusTierOutcome[];
  perfectionOutcomes: BonusTierOutcome[];
  failChance: number;
  successChance: number;
  basicChance: number;
  perfectChance: number;
  sublimeChance: number;
  perfectOrBetterChance: number;
}

function classifyTerminalState(
  state: CraftingState,
  config: OptimizerConfig,
  condition: CraftingConditionType,
  completionGoal: number,
  perfectionGoal: number,
): TerminalStateClassification {
  const isTerminal = isTerminalState(state, config, condition);
  const isTerminalUnmet =
    isTerminal &&
    hasAnyActiveGoal(completionGoal, perfectionGoal) &&
    !goalsMet(state, completionGoal, perfectionGoal);
  return { isTerminal, isTerminalUnmet };
}

interface UnsafeCandidateClassification extends TerminalStateClassification {
  requiresProbabilisticSurvival?: boolean;
}

function filterUnfinishedTerminalCandidates<
  T extends UnsafeCandidateClassification,
>(candidates: T[]): T[] {
  // Terminal branches are now scored through the same authoritative craft-end
  // outcome model used by Finish Craft. Do not hard-filter them out before the
  // scorer can compare their actual forced-resolution EV against live lines.
  return candidates;
}

function getBonusTierProgress(
  value: number,
  target: number,
): BonusTierProgress {
  if (!Number.isFinite(target) || target <= 0) {
    return {
      guaranteed: 0,
      bonusChance: 0,
      total: 0,
      nextThreshold: 0,
    };
  }

  const safeValue = Math.max(0, value);
  const result = getBonusAndChance(safeValue, target);
  const bonusChance = Math.max(0, Math.min(1, result.bonusChance));
  return {
    guaranteed: Math.max(0, result.guaranteed),
    bonusChance,
    total: Math.max(0, result.guaranteed) + bonusChance,
    nextThreshold: Math.max(0, result.nextThreshold),
  };
}

function getThresholdForGuaranteedBonusCount(
  target: number,
  guaranteedCount: number,
): number {
  if (
    !Number.isFinite(target) ||
    target <= 0 ||
    !Number.isFinite(guaranteedCount) ||
    guaranteedCount <= 0
  ) {
    return 0;
  }

  let threshold = 0;
  let currentTarget = target;
  const cappedCount = Math.max(0, Math.floor(guaranteedCount));

  for (let index = 0; index < cappedCount; index++) {
    threshold += currentTarget;
    currentTarget = Math.floor(currentTarget * 1.3);
  }

  return threshold;
}

function getProgressTowardRawGoal(
  value: number,
  rawGoal: number,
  baseTarget: number,
): number {
  if (!Number.isFinite(rawGoal) || rawGoal <= 0) {
    return 0;
  }

  const safeValue = Math.max(0, value);
  if (!Number.isFinite(baseTarget) || baseTarget <= 0) {
    return Math.min(rawGoal, safeValue);
  }

  const goalProgress = getBonusTierProgress(rawGoal, baseTarget).total;
  if (!(goalProgress > 0)) {
    return Math.min(rawGoal, safeValue);
  }

  const currentProgress = getBonusTierProgress(safeValue, baseTarget).total;
  return Math.min(1, currentProgress / goalProgress) * rawGoal;
}

function calculateImmediateProgressTowardGoals(
  currentState: CraftingState,
  nextState: CraftingState,
  completionGoal: number,
  perfectionGoal: number,
  targetCompletion: number,
  targetPerfection: number,
): number {
  const completionBefore =
    completionGoal > 0
      ? getProgressTowardRawGoal(
          currentState.completion,
          completionGoal,
          targetCompletion,
        )
      : currentState.completion;
  const perfectionBefore =
    perfectionGoal > 0
      ? getProgressTowardRawGoal(
          currentState.perfection,
          perfectionGoal,
          targetPerfection,
        )
      : currentState.perfection;
  const completionAfter =
    completionGoal > 0
      ? getProgressTowardRawGoal(
          nextState.completion,
          completionGoal,
          targetCompletion,
        )
      : nextState.completion;
  const perfectionAfter =
    perfectionGoal > 0
      ? getProgressTowardRawGoal(
          nextState.perfection,
          perfectionGoal,
          targetPerfection,
        )
      : nextState.perfection;

  return (
    Math.max(0, completionAfter - completionBefore) +
    Math.max(0, perfectionAfter - perfectionBefore)
  );
}

interface CandidateTieBreakMetrics {
  immediateProgress: number;
  isStabilize: boolean;
  requiresProbabilisticSurvival: boolean;
  qiSpent: number;
  skillKey: string;
}

function compareTieBreakMetrics(
  a: CandidateTieBreakMetrics,
  b: CandidateTieBreakMetrics,
): number {
  const progressDiff = a.immediateProgress - b.immediateProgress;
  if (progressDiff !== 0) {
    return progressDiff;
  }

  if (a.isStabilize !== b.isStabilize) {
    return a.isStabilize ? -1 : 1;
  }

  if (a.requiresProbabilisticSurvival !== b.requiresProbabilisticSurvival) {
    return a.requiresProbabilisticSurvival ? -1 : 1;
  }

  if (a.qiSpent !== b.qiSpent) {
    return b.qiSpent - a.qiSpent;
  }

  return b.skillKey.localeCompare(a.skillKey);
}

function buildBonusTierOutcomeDistribution(
  value: number,
  target: number,
): BonusTierOutcome[] {
  if (!Number.isFinite(target) || target <= 0) {
    return [
      {
        guaranteed: 0,
        probability: 1,
        threshold: 0,
      },
    ];
  }

  const progress = getBonusTierProgress(value, target);
  const outcomes: BonusTierOutcome[] = [];
  const baseProbability = Math.max(0, 1 - progress.bonusChance);
  outcomes.push({
    guaranteed: progress.guaranteed,
    probability: baseProbability,
    threshold: getThresholdForGuaranteedBonusCount(target, progress.guaranteed),
  });

  if (progress.bonusChance > 0) {
    outcomes.push({
      guaranteed: progress.guaranteed + 1,
      probability: progress.bonusChance,
      threshold: getThresholdForGuaranteedBonusCount(
        target,
        progress.guaranteed + 1,
      ),
    });
  }

  return outcomes.filter((outcome) => outcome.probability > 0);
}

function evaluateCraftEndOutcomeDistribution(params: {
  state: CraftingState;
  targetCompletion: number;
  targetPerfection: number;
  hasDistinctSublimeOutcome: boolean;
}): CraftEndOutcomeDistribution {
  const {
    state,
    targetCompletion,
    targetPerfection,
    hasDistinctSublimeOutcome,
  } = params;
  const completion = getBonusTierProgress(state.completion, targetCompletion);
  const perfection = getBonusTierProgress(state.perfection, targetPerfection);
  const completionOutcomes = buildBonusTierOutcomeDistribution(
    state.completion,
    targetCompletion,
  );
  const perfectionOutcomes = buildBonusTierOutcomeDistribution(
    state.perfection,
    targetPerfection,
  );

  let failChance = 0;
  let basicChance = 0;
  let perfectChance = 0;
  let sublimeChance = 0;

  for (const completionOutcome of completionOutcomes) {
    for (const perfectionOutcome of perfectionOutcomes) {
      const probability =
        completionOutcome.probability * perfectionOutcome.probability;
      if (probability <= 0) {
        continue;
      }

      const craftSucceeded =
        targetCompletion <= 0 || completionOutcome.guaranteed > 0;
      if (!craftSucceeded) {
        failChance += probability;
        continue;
      }

      const hasPerfection =
        targetPerfection > 0 ? perfectionOutcome.guaranteed > 0 : false;
      const isSublime =
        hasDistinctSublimeOutcome &&
        targetCompletion > 0 &&
        targetPerfection > 0 &&
        completionOutcome.guaranteed > 1 &&
        perfectionOutcome.guaranteed > 1;

      if (isSublime) {
        sublimeChance += probability;
      } else if (hasPerfection) {
        perfectChance += probability;
      } else {
        basicChance += probability;
      }
    }
  }

  const successChance = Math.max(
    0,
    Math.min(1, 1 - Math.max(0, Math.min(1, failChance))),
  );
  return {
    completion,
    perfection,
    completionOutcomes,
    perfectionOutcomes,
    failChance: Math.max(0, Math.min(1, failChance)),
    successChance,
    basicChance: Math.max(0, Math.min(1, basicChance)),
    perfectChance: Math.max(0, Math.min(1, perfectChance)),
    sublimeChance: Math.max(0, Math.min(1, sublimeChance)),
    perfectOrBetterChance: Math.max(
      0,
      Math.min(1, perfectChance + sublimeChance),
    ),
  };
}

function isRawGoalSecuredByOutcome(
  guaranteedBands: number,
  rawGoal: number,
  baseTarget: number,
): boolean {
  if (!Number.isFinite(rawGoal) || rawGoal <= 0) {
    return true;
  }
  if (!Number.isFinite(baseTarget) || baseTarget <= 0) {
    return guaranteedBands > 0;
  }
  return (
    getThresholdForGuaranteedBonusCount(baseTarget, guaranteedBands) >= rawGoal
  );
}

/**
 * Generate a normalized cache key that buckets large progress values.
 * This improves cache hit rates significantly in late game scenarios.
 */
function getNormalizedCacheKey(
  state: CraftingState,
  completionGoal: number,
  perfectionGoal: number,
  remainingDepth: number,
  conditionType: string | undefined,
  nextConditionQueue: CraftingConditionType[],
  bucketSize: number,
): string {
  const compKey = getProgressCacheComponent(
    state.completion,
    completionGoal,
    bucketSize,
  );
  const perfKey = getProgressCacheComponent(
    state.perfection,
    perfectionGoal,
    bucketSize,
  );
  const queueKey =
    nextConditionQueue.length > 0 ? nextConditionQueue.join('|') : '-';

  return `${state.getCacheKey()}:${compKey}:${perfKey}:${remainingDepth}:${conditionType || 'n'}:${queueKey}`;
}

function getTechniqueNeedAlignment(
  techniqueType: TechniqueType | undefined,
  completionPriorityShare: number,
  perfectionPriorityShare: number,
): number {
  switch (techniqueType) {
    case 'fusion':
      return completionPriorityShare * 2 - 1;
    case 'refine':
      return perfectionPriorityShare * 2 - 1;
    default:
      return 0;
  }
}

function evaluateGenericHarmonyModifierQuality(
  mods: ReturnType<typeof getHarmonyStatModifiers>,
  completionPriorityShare: number,
  perfectionPriorityShare: number,
): number {
  const clampQuality = (value: number): number =>
    Math.max(-1, Math.min(1, value));
  const normalizeMultiplierQuality = (multiplier: number): number => {
    if (multiplier >= 1.5) return 1;
    if (multiplier <= 0) return -1;
    return (multiplier - 1) / 0.5;
  };

  let weightedTotal = 0;
  let totalWeight = 0;
  const addQuality = (quality: number, weight: number, active: boolean) => {
    if (!active || !Number.isFinite(quality) || weight <= 0) {
      return;
    }
    weightedTotal += quality * weight;
    totalWeight += weight;
  };

  const progressQuality =
    completionPriorityShare *
      normalizeMultiplierQuality(mods.intensityMultiplier) +
    perfectionPriorityShare *
      normalizeMultiplierQuality(mods.controlMultiplier);
  addQuality(
    progressQuality,
    1,
    mods.intensityMultiplier !== 1 || mods.controlMultiplier !== 1,
  );
  addQuality(
    clampQuality(mods.critChanceBonus / 25),
    1,
    mods.critChanceBonus !== 0,
  );
  addQuality(
    clampQuality(mods.successChanceBonus / 0.25),
    1,
    mods.successChanceBonus !== 0,
  );
  addQuality(
    clampQuality((100 - mods.poolCostPercentage) / 25),
    1,
    mods.poolCostPercentage !== 100,
  );
  addQuality(
    clampQuality((100 - mods.stabilityCostPercentage) / 25),
    1,
    mods.stabilityCostPercentage !== 100,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  return clampQuality(weightedTotal / totalWeight);
}

/**
 * Evaluate the quality of the current harmony sub-system state.
 *
 * Returns a value in [-1, +1] representing how productive the current
 * harmony sub-system state is for making progress:
 *   +1  = optimal (e.g., forge heat 4-6: both stats get 1.5×)
 *    0  = neutral (no harmony data, or modifiers are all 1×)
 *   -1  = terrible (e.g., forge heat 0: control is -9×)
 *
 * Uses the actual stat modifiers plus subsystem-specific state that affects
 * future move quality but is not visible in the immediate completion /
 * perfection gains alone (for example resonance target alignment and partial
 * alchemical charge progress).
 */
function evaluateHarmonySubsystemQuality(
  harmonyData: NonNullable<CraftingState['harmonyData']>,
  completionPriorityShare: number = 0.5,
  perfectionPriorityShare: number = 0.5,
): number {
  const clampQuality = (value: number): number =>
    Math.max(-1, Math.min(1, value));
  const normalizeMultiplierQuality = (multiplier: number): number => {
    if (multiplier >= 1.5) return 1;
    if (multiplier <= 0) return -1;
    return (multiplier - 1) / 0.5;
  };

  // Forge works: use heat-based modifiers directly.
  if (harmonyData.forgeWorks) {
    const heat = harmonyData.forgeWorks.heat;
    const mods = getHarmonyStatModifiers(harmonyData, 'forge');
    const weightedMultiplierQuality =
      completionPriorityShare *
        normalizeMultiplierQuality(mods.intensityMultiplier) +
      perfectionPriorityShare *
        normalizeMultiplierQuality(mods.controlMultiplier);
    const turnsToSweetSpot =
      heat < 4 ? Math.ceil((4 - heat) / 2) : heat > 6 ? heat - 6 : 0;
    const correctionPressure =
      heat < 4
        ? turnsToSweetSpot * perfectionPriorityShare
        : turnsToSweetSpot * completionPriorityShare;
    return clampQuality(weightedMultiplierQuality - correctionPressure);
  }

  // Inscription: stacks provide a scaling bonus.
  if (harmonyData.inscribedPatterns) {
    const mods = getHarmonyStatModifiers(harmonyData, 'inscription');
    return clampQuality((mods.controlMultiplier - 1) * 5);
  }

  if (harmonyData.alchemicalArts) {
    const mods = getHarmonyStatModifiers(harmonyData, 'alchemical');
    const modifierQuality = evaluateGenericHarmonyModifierQuality(
      mods,
      completionPriorityShare,
      perfectionPriorityShare,
    );
    const charges = harmonyData.alchemicalArts.charges;
    const recommended = harmonyData.recommendedTechniqueTypes ?? [];
    if (charges.length === 0 || recommended.length === 0) {
      return modifierQuality;
    }

    const setupProgress = Math.max(0, Math.min(1, charges.length / 2));
    const bestRecommendedAlignment = Math.max(
      ...recommended.map((type) =>
        getTechniqueNeedAlignment(
          type,
          completionPriorityShare,
          perfectionPriorityShare,
        ),
      ),
    );
    const setupQuality = clampQuality(setupProgress * bestRecommendedAlignment);

    return modifierQuality === 0
      ? setupQuality
      : clampQuality((modifierQuality + setupQuality) / 2);
  }

  if (harmonyData.resonance) {
    const mods = getHarmonyStatModifiers(harmonyData, 'resonance');
    const modifierQuality = evaluateGenericHarmonyModifierQuality(
      mods,
      completionPriorityShare,
      perfectionPriorityShare,
    );
    const resonanceState = harmonyData.resonance;
    const currentAlignment = getTechniqueNeedAlignment(
      resonanceState.resonance,
      completionPriorityShare,
      perfectionPriorityShare,
    );
    let quality =
      resonanceState.resonance === undefined
        ? modifierQuality
        : clampQuality((modifierQuality + currentAlignment) / 2);

    if (
      resonanceState.pendingResonance &&
      resonanceState.pendingCount > 0 &&
      resonanceState.pendingResonance !== resonanceState.resonance
    ) {
      const pendingAlignment = getTechniqueNeedAlignment(
        resonanceState.pendingResonance,
        completionPriorityShare,
        perfectionPriorityShare,
      );
      const discountedSwitchQuality = (currentAlignment + pendingAlignment) / 2;
      quality = clampQuality((quality + discountedSwitchQuality) / 2);
    }

    return quality;
  }

  return 0;
}

function getGoalPriorityWeights(
  completionNeedShare: number,
  perfectionNeedShare: number,
  completionGoal: number,
  perfectionGoal: number,
  goalPriorityBias: number = DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
): {
  completionWeight: number;
  perfectionWeight: number;
} {
  let completionWeight = 1 + completionNeedShare;
  let perfectionWeight = 1 + perfectionNeedShare;

  if (!(completionGoal > 0 && perfectionGoal > 0)) {
    return { completionWeight, perfectionWeight };
  }

  const normalizedBias = clampSearchGoalPriorityBias(goalPriorityBias);
  if (normalizedBias === 0) {
    return { completionWeight, perfectionWeight };
  }

  const shift =
    (normalizedBias / SEARCH_GOAL_PRIORITY_BIAS_MAX) *
    SCORING.GOAL_PRIORITY_WEIGHT_SHIFT;
  completionWeight = Math.max(0.25, completionWeight + shift);
  perfectionWeight = Math.max(0.25, perfectionWeight - shift);

  return { completionWeight, perfectionWeight };
}

/**
 * Score a state based on progress toward targets.
 *
 * Architecture:
 * 1. Compute a normalized progress score (0–1 per dimension, weighted by need).
 * 2. Add a discrete bonus when targets are met (sized relative to total target
 *    magnitude so it never dominates small-target crafts or gets dwarfed by
 *    large-target ones).
 * 3. Value buffs by their expected future return (buff turns × bonus × stat).
 * 4. Score resources (qi, stability) as "future turns of progress they enable",
 *    so a stabilize that wastes resources competes fairly with a progress skill.
 * 5. Apply survivability as a separate layer: only penalise when stability is
 *    actually threatening craft death, using the real cost of the cheapest
 *    available progress skill rather than hardcoded thresholds.
 *
 * @param state - Current crafting state
 * @param targetCompletion - Base target completion value
 * @param targetPerfection - Base target perfection value
 * @param isSublimeCraft - Whether this is sublime/harmony crafting (allows exceeding targets)
 * @param targetMultiplier - Multiplier for sublime targets (default 2.0 for sublime, higher for equipment)
 * @param trainingMode - Whether this is a training craft (more aggressive risk tolerance)
 */
function scoreState(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number,
  isSublimeCraft: boolean = false,
  targetMultiplier: number = 2.0,
  trainingMode: boolean = false,
  maxCompletionCap?: number,
  maxPerfectionCap?: number,
  ctx: ScoringContext = DEFAULT_SCORING_CONTEXT,
  goalPriorityBias: number = DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
): number {
  if (targetCompletion === 0 && targetPerfection === 0) {
    return Math.min(state.completion, state.perfection);
  }

  // ── effective goals ──────────────────────────────────────────────────
  const effectiveCompTarget = isSublimeCraft
    ? targetCompletion * targetMultiplier
    : targetCompletion;
  const effectivePerfTarget = isSublimeCraft
    ? targetPerfection * targetMultiplier
    : targetPerfection;
  const effectiveCompGoal =
    maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)
      ? Math.min(effectiveCompTarget, maxCompletionCap)
      : effectiveCompTarget;
  const effectivePerfGoal =
    maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)
      ? Math.min(effectivePerfTarget, maxPerfectionCap)
      : effectivePerfTarget;
  const baseCompGoal =
    maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)
      ? Math.min(targetCompletion, maxCompletionCap)
      : targetCompletion;
  const basePerfGoal =
    maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)
      ? Math.min(targetPerfection, maxPerfectionCap)
      : targetPerfection;
  const effectiveCompProgress = getProgressTowardRawGoal(
    state.completion,
    effectiveCompGoal,
    targetCompletion,
  );
  const effectivePerfProgress = getProgressTowardRawGoal(
    state.perfection,
    effectivePerfGoal,
    targetPerfection,
  );
  const baseCompProgress = getProgressTowardRawGoal(
    state.completion,
    baseCompGoal,
    targetCompletion,
  );
  const basePerfProgress = getProgressTowardRawGoal(
    state.perfection,
    basePerfGoal,
    targetPerfection,
  );
  const baseTargetsMet =
    (targetCompletion <= 0 || state.completion >= targetCompletion) &&
    (targetPerfection <= 0 || state.perfection >= targetPerfection);

  // ── remaining work metrics ───────────────────────────────────────────
  const compRemaining =
    effectiveCompGoal > 0
      ? Math.max(0, effectiveCompGoal - effectiveCompProgress)
      : 0;
  const perfRemaining =
    effectivePerfGoal > 0
      ? Math.max(0, effectivePerfGoal - effectivePerfProgress)
      : 0;
  const totalRemaining = compRemaining + perfRemaining;
  const compNeedShare =
    totalRemaining > 0 ? compRemaining / totalRemaining : 0.5;
  const perfNeedShare =
    totalRemaining > 0 ? perfRemaining / totalRemaining : 0.5;
  const compNeedPct =
    effectiveCompGoal > 0
      ? Math.max(0, Math.min(1, compRemaining / effectiveCompGoal))
      : 0;
  const perfNeedPct =
    effectivePerfGoal > 0
      ? Math.max(0, Math.min(1, perfRemaining / effectivePerfGoal))
      : 0;
  const remainingWorkPct = Math.max(
    compNeedPct,
    perfNeedPct,
    (compNeedPct + perfNeedPct) / 2,
  );
  const estimatedProgressPerTurn = estimateWeightedProgressPerTurn(
    compNeedShare,
    perfNeedShare,
    ctx,
  );
  const estimatedTurnsRemaining = estimateTurnsRemainingFromContext(
    compRemaining,
    perfRemaining,
    compNeedShare,
    perfNeedShare,
    ctx,
  );
  const baseCompRemaining =
    baseCompGoal > 0 ? Math.max(0, baseCompGoal - baseCompProgress) : 0;
  const basePerfRemaining =
    basePerfGoal > 0 ? Math.max(0, basePerfGoal - basePerfProgress) : 0;
  const baseTotalRemaining = baseCompRemaining + basePerfRemaining;
  const baseCompNeedShare =
    baseTotalRemaining > 0 ? baseCompRemaining / baseTotalRemaining : 0.5;
  const basePerfNeedShare =
    baseTotalRemaining > 0 ? basePerfRemaining / baseTotalRemaining : 0.5;
  const baseCompNeedPct =
    baseCompGoal > 0
      ? Math.max(0, Math.min(1, baseCompRemaining / baseCompGoal))
      : 0;
  const basePerfNeedPct =
    basePerfGoal > 0
      ? Math.max(0, Math.min(1, basePerfRemaining / basePerfGoal))
      : 0;
  const baseRemainingWorkPct = Math.max(
    baseCompNeedPct,
    basePerfNeedPct,
    (baseCompNeedPct + basePerfNeedPct) / 2,
  );
  const baseEstimatedTurnsRemaining = estimateTurnsRemainingFromContext(
    baseCompRemaining,
    basePerfRemaining,
    baseCompNeedShare,
    basePerfNeedShare,
    ctx,
  );
  const stepPenaltyWeight = Math.max(
    SCORING.STEP_PENALTY,
    estimatedProgressPerTurn * SCORING.STEP_PENALTY_PROGRESS_FRACTION,
  );

  // ── 1. progress score (primary) ──────────────────────────────────────
  const { completionWeight, perfectionWeight } = getGoalPriorityWeights(
    compNeedShare,
    perfNeedShare,
    effectiveCompGoal,
    effectivePerfGoal,
    goalPriorityBias,
  );
  const totalPriorityWeight = completionWeight + perfectionWeight;
  const completionPriorityShare =
    totalPriorityWeight > 0 ? completionWeight / totalPriorityWeight : 0.5;
  const perfectionPriorityShare =
    totalPriorityWeight > 0 ? perfectionWeight / totalPriorityWeight : 0.5;
  let score =
    effectiveCompProgress * completionWeight +
    effectivePerfProgress * perfectionWeight;

  // ── 2. target-met bonus (scaled to target magnitude) ─────────────────
  const totalTargetMagnitude = Math.max(
    1,
    effectiveCompGoal + effectivePerfGoal,
  );
  const baseTargetMagnitude = Math.max(
    1,
    Math.max(0, baseCompGoal) + Math.max(0, basePerfGoal),
  );
  const targetMetBonus = totalTargetMagnitude * SCORING.TARGET_MET_MULTIPLIER;

  const sublimeTargetsMet =
    isSublimeCraft &&
    (effectiveCompGoal <= 0 || state.completion >= effectiveCompGoal) &&
    (effectivePerfGoal <= 0 || state.perfection >= effectivePerfGoal);
  const modeTargetsMet = isSublimeCraft ? sublimeTargetsMet : baseTargetsMet;
  const resourceRemainingWorkPct = baseTargetsMet
    ? remainingWorkPct
    : baseRemainingWorkPct;
  const resourceEstimatedTurnsRemaining = baseTargetsMet
    ? estimatedTurnsRemaining
    : baseEstimatedTurnsRemaining;
  const resourceEstimatedProgressPerTurn = baseTargetsMet
    ? estimatedProgressPerTurn
    : estimateWeightedProgressPerTurn(
        baseCompNeedShare,
        basePerfNeedShare,
        ctx,
      );
  const survivabilityTargetMagnitude = baseTargetsMet
    ? totalTargetMagnitude
    : baseTargetMagnitude;

  if (sublimeTargetsMet) {
    score += targetMetBonus * SCORING.SUBLIME_MET_EXTRA;
    score += state.qi * SCORING.RESOURCE_TIEBREAKER;
    score += state.stability * SCORING.RESOURCE_TIEBREAKER;
    score -= state.step * stepPenaltyWeight;
  } else if (baseTargetsMet) {
    score += targetMetBonus;
    score += state.qi * SCORING.RESOURCE_TIEBREAKER;
    score += state.stability * SCORING.RESOURCE_TIEBREAKER;
    score -= state.step * stepPenaltyWeight;
    if (isSublimeCraft) {
      const compBeyondBase = Math.max(0, effectiveCompProgress - baseCompGoal);
      const perfBeyondBase = Math.max(0, effectivePerfProgress - basePerfGoal);
      score +=
        (compBeyondBase + perfBeyondBase) * SCORING.SUBLIME_BEYOND_BASE_WEIGHT;
    }
  }

  if (!modeTargetsMet) {
    // ── 3. buff valuation (when targets not yet met) ──────────────────
    if (state.hasControlBuff()) {
      const controlBuffBoost =
        (state.controlBuffMultiplier - 1) *
        SCORING.BUFF_VALUE_PER_MULTIPLIER_POINT;
      score +=
        state.controlBuffTurns *
        controlBuffBoost *
        (SCORING.BUFF_NEED_FLOOR + perfectionPriorityShare) *
        remainingWorkPct;
    }
    if (state.hasIntensityBuff()) {
      const intensityBuffBoost =
        (state.intensityBuffMultiplier - 1) *
        SCORING.BUFF_VALUE_PER_MULTIPLIER_POINT;
      score +=
        state.intensityBuffTurns *
        intensityBuffBoost *
        (SCORING.BUFF_NEED_FLOOR + completionPriorityShare) *
        remainingWorkPct;
    }

    // ── 4. resource value (qi & stability as future-progress enablers) ─
    // Qi is only valuable when it is a bottleneck for progress turns.
    // This prevents overvaluing turn-consuming qi restores when progress
    // skills are already qi-free.
    if (ctx.avgQiCostPerTurn > 0 && estimatedTurnsRemaining > 0) {
      const estimatedQiNeeded =
        resourceEstimatedTurnsRemaining * ctx.avgQiCostPerTurn;
      const qiShortfall = Math.max(0, estimatedQiNeeded - state.qi);
      if (qiShortfall > 0) {
        const turnsShortByQi = qiShortfall / ctx.avgQiCostPerTurn;
        score -= turnsShortByQi * resourceEstimatedProgressPerTurn;
      }
    }

    score +=
      state.stability *
      (SCORING.STABILITY_BASE_WEIGHT +
        resourceRemainingWorkPct * SCORING.STABILITY_WORK_WEIGHT);

    // Step efficiency: prefer shorter paths to target completion.
    // Without this, the tree search sees no cost to "stabilize now,
    // progress later" vs "progress now", which can cause stabilize
    // spirals where the optimizer delays progress indefinitely.
  }

  if (!modeTargetsMet) {
    score -= state.step * stepPenaltyWeight;
  }

  // ── 5. overshoot penalty ─────────────────────────────────────────────
  if (!isSublimeCraft) {
    const normalCompLimit =
      maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)
        ? Math.min(targetCompletion, maxCompletionCap)
        : targetCompletion;
    const normalPerfLimit =
      maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)
        ? Math.min(targetPerfection, maxPerfectionCap)
        : targetPerfection;
    const compOver =
      normalCompLimit > 0 ? Math.max(0, state.completion - normalCompLimit) : 0;
    const perfOver =
      normalPerfLimit > 0 ? Math.max(0, state.perfection - normalPerfLimit) : 0;
    score -= (compOver + perfOver) * SCORING.OVERSHOOT_PENALTY_WEIGHT;
  } else {
    const sublimeCompLimit =
      maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)
        ? Math.min(effectiveCompTarget, maxCompletionCap)
        : effectiveCompTarget;
    const sublimePerfLimit =
      maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)
        ? Math.min(effectivePerfTarget, maxPerfectionCap)
        : effectivePerfTarget;
    const compOver =
      sublimeCompLimit > 0
        ? Math.max(0, state.completion - sublimeCompLimit)
        : 0;
    const perfOver =
      sublimePerfLimit > 0
        ? Math.max(0, state.perfection - sublimePerfLimit)
        : 0;
    score -= (compOver + perfOver) * SCORING.OVERSHOOT_PENALTY_WEIGHT;
  }

  // Hard-cap violation penalty
  if (maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)) {
    score -=
      Math.max(0, state.completion - maxCompletionCap) *
      SCORING.HARD_CAP_PENALTY_WEIGHT;
  }
  if (maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)) {
    score -=
      Math.max(0, state.perfection - maxPerfectionCap) *
      SCORING.HARD_CAP_PENALTY_WEIGHT;
  }

  // ── 6. survivability ────────────────────────────────────────────────
  // Once the active mode goals are met, the craft is done. Until then, low
  // runway still matters, including sublime continuation after base success.
  if (!modeTargetsMet) {
    // Stability threshold derived from actual avg stability cost per turn.
    // At full remaining work: threshold ≈ (base + scale) × avgCost turns of runway.
    // At zero remaining work: threshold ≈ base × avgCost.
    const thresholdBase = trainingMode
      ? SCORING.STABILITY_THRESHOLD_TURNS_BASE_TRAINING
      : SCORING.STABILITY_THRESHOLD_TURNS_BASE;
    const thresholdScale = trainingMode
      ? SCORING.STABILITY_THRESHOLD_TURNS_SCALE_TRAINING
      : SCORING.STABILITY_THRESHOLD_TURNS_SCALE;
    const stabilityThreshold =
      (thresholdBase + resourceRemainingWorkPct * thresholdScale) *
      ctx.avgStabilityCostPerTurn;

    const penaltyFraction = trainingMode
      ? SCORING.STABILITY_PENALTY_FRACTION_TRAINING
      : SCORING.STABILITY_PENALTY_FRACTION;
    const penaltyFloor = trainingMode
      ? SCORING.STABILITY_PENALTY_FLOOR_TRAINING
      : SCORING.STABILITY_PENALTY_FLOOR;
    const stabilityPenaltyWeight = Math.max(
      penaltyFloor,
      survivabilityTargetMagnitude * penaltyFraction,
    );

    if (state.stability < stabilityThreshold) {
      const stabilityRisk =
        (stabilityThreshold - state.stability) / stabilityThreshold;
      score -= stabilityRisk * stabilityRisk * stabilityPenaltyWeight;
    }

    // Hard cliff: craft dead at 0 stability.
    if (state.stability <= 0) {
      score -= totalTargetMagnitude * SCORING.DEATH_PENALTY_MULTIPLIER;
    } else if (state.stability <= SCORING.NEAR_DEATH_STABILITY) {
      score -=
        (SCORING.NEAR_DEATH_STABILITY - state.stability) *
        stabilityPenaltyWeight;
    }

    // Runway penalty: penalize states where estimated turns to finish
    // exceeds stability runway.  Proportional and uncapped — the penalty
    // scales with the severity of the shortfall.
    const estimatedRunwayTurns =
      ctx.avgStabilityCostPerTurn > 0
        ? Math.floor(Math.max(0, state.stability) / ctx.avgStabilityCostPerTurn)
        : Infinity;
    if (resourceEstimatedTurnsRemaining > estimatedRunwayTurns) {
      const gap = resourceEstimatedTurnsRemaining - estimatedRunwayTurns;
      const gapFraction = trainingMode
        ? SCORING.RUNWAY_GAP_FRACTION_TRAINING
        : SCORING.RUNWAY_GAP_FRACTION;
      score -= gap * survivabilityTargetMagnitude * gapFraction;
    }
  }

  // ── 7. toxicity & harmony ──────────────────────────────────────────
  if (state.maxToxicity > 0 && state.hasDangerousToxicity()) {
    score -= totalTargetMagnitude * SCORING.TOXICITY_PENALTY_FRACTION;
  }
  if (isSublimeCraft) {
    if (!modeTargetsMet) {
      const normalizedHarmony = Math.max(-1, Math.min(1, state.harmony / 100));
      score +=
        normalizedHarmony *
        remainingWorkPct *
        totalTargetMagnitude *
        SCORING.HARMONY_BONUS_WEIGHT;
    }

    // Harmony sub-system quality: value being in a productive harmony
    // state (e.g., forge heat 4-6 where both stats get 1.5×) vs a
    // terrible one (heat 0 where control is -9×, or heat 10 where
    // intensity is -9×).  This lets the tree search see that fusion
    // now (raising heat from 0→2) enables future refine, even though
    // fusion itself doesn't advance perfection.
    if (!modeTargetsMet && state.harmonyData) {
      const quality = evaluateHarmonySubsystemQuality(
        state.harmonyData,
        completionPriorityShare,
        perfectionPriorityShare,
      );
      score +=
        quality *
        remainingWorkPct *
        totalTargetMagnitude *
        SCORING.HARMONY_SUBSYSTEM_QUALITY_WEIGHT;
    }
  }

  return score;
}

function scoreFinishedOutcome(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number,
  isSublimeCraft: boolean = false,
  targetMultiplier: number = 2.0,
  maxCompletionCap?: number,
  maxPerfectionCap?: number,
  ctx: ScoringContext = DEFAULT_SCORING_CONTEXT,
  goalPriorityBias: number = DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
): number {
  if (targetCompletion === 0 && targetPerfection === 0) {
    return Math.min(state.completion, state.perfection);
  }

  const effectiveCompTarget = isSublimeCraft
    ? targetCompletion * targetMultiplier
    : targetCompletion;
  const effectivePerfTarget = isSublimeCraft
    ? targetPerfection * targetMultiplier
    : targetPerfection;
  const effectiveCompGoal =
    maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)
      ? Math.min(effectiveCompTarget, maxCompletionCap)
      : effectiveCompTarget;
  const effectivePerfGoal =
    maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)
      ? Math.min(effectivePerfTarget, maxPerfectionCap)
      : effectivePerfTarget;
  const baseCompGoal =
    maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)
      ? Math.min(targetCompletion, maxCompletionCap)
      : targetCompletion;
  const basePerfGoal =
    maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)
      ? Math.min(targetPerfection, maxPerfectionCap)
      : targetPerfection;
  const totalTargetMagnitude = Math.max(
    1,
    effectiveCompGoal + effectivePerfGoal,
  );
  const effectiveCompProgress = getProgressTowardRawGoal(
    state.completion,
    effectiveCompGoal,
    targetCompletion,
  );
  const effectivePerfProgress = getProgressTowardRawGoal(
    state.perfection,
    effectivePerfGoal,
    targetPerfection,
  );
  const remainingCompletion = Math.max(
    0,
    effectiveCompGoal - effectiveCompProgress,
  );
  const remainingPerfection = Math.max(
    0,
    effectivePerfGoal - effectivePerfProgress,
  );
  const totalRemaining = remainingCompletion + remainingPerfection;
  const compNeedShare =
    totalRemaining > 0 ? remainingCompletion / totalRemaining : 0.5;
  const perfNeedShare =
    totalRemaining > 0 ? remainingPerfection / totalRemaining : 0.5;
  const { completionWeight, perfectionWeight } = getGoalPriorityWeights(
    compNeedShare,
    perfNeedShare,
    effectiveCompGoal,
    effectivePerfGoal,
    goalPriorityBias,
  );
  const stepPenaltyWeight = Math.max(
    SCORING.STEP_PENALTY,
    ctx.avgGainPerTurn * SCORING.STEP_PENALTY_PROGRESS_FRACTION,
  );
  const targetMetBonus = totalTargetMagnitude * SCORING.TARGET_MET_MULTIPLIER;
  const completionOutcomes = buildBonusTierOutcomeDistribution(
    state.completion,
    targetCompletion,
  );
  const perfectionOutcomes = buildBonusTierOutcomeDistribution(
    state.perfection,
    targetPerfection,
  );

  let expectedScore = 0;
  for (const completionOutcome of completionOutcomes) {
    for (const perfectionOutcome of perfectionOutcomes) {
      const probability =
        completionOutcome.probability * perfectionOutcome.probability;
      if (probability <= 0) {
        continue;
      }

      const craftSucceeded =
        targetCompletion <= 0 || completionOutcome.guaranteed > 0;
      if (!craftSucceeded) {
        expectedScore += probability * -totalTargetMagnitude;
        continue;
      }

      const resolvedCompProgress = craftSucceeded
        ? getProgressTowardRawGoal(
            completionOutcome.threshold,
            effectiveCompGoal,
            targetCompletion,
          )
        : 0;
      const resolvedPerfProgress = getProgressTowardRawGoal(
        perfectionOutcome.threshold,
        effectivePerfGoal,
        targetPerfection,
      );

      let outcomeScore =
        resolvedCompProgress * completionWeight +
        resolvedPerfProgress * perfectionWeight;
      const finishedCompShortfall = Math.max(
        0,
        effectiveCompGoal - resolvedCompProgress,
      );
      const finishedPerfShortfall = Math.max(
        0,
        effectivePerfGoal - resolvedPerfProgress,
      );
      outcomeScore -=
        (finishedCompShortfall + finishedPerfShortfall) *
        SCORING.FINISHED_UNMET_PENALTY_WEIGHT;

      expectedScore += probability * outcomeScore;
    }
  }

  const currentBaseTargetsMet =
    (baseCompGoal <= 0 || state.completion >= baseCompGoal) &&
    (basePerfGoal <= 0 || state.perfection >= basePerfGoal);
  const currentModeTargetsMet =
    isSublimeCraft &&
    (effectiveCompGoal <= 0 || state.completion >= effectiveCompGoal) &&
    (effectivePerfGoal <= 0 || state.perfection >= effectivePerfGoal);

  if (currentModeTargetsMet) {
    expectedScore += targetMetBonus * SCORING.SUBLIME_MET_EXTRA;
  } else if (currentBaseTargetsMet) {
    expectedScore += targetMetBonus;
    if (isSublimeCraft) {
      const compBeyondBase = Math.max(0, effectiveCompProgress - baseCompGoal);
      const perfBeyondBase = Math.max(0, effectivePerfProgress - basePerfGoal);
      expectedScore +=
        (compBeyondBase + perfBeyondBase) * SCORING.SUBLIME_BEYOND_BASE_WEIGHT;
    }
  }

  return expectedScore - state.step * stepPenaltyWeight;
}

function calculateFinishSuccessChance(
  state: CraftingState,
  targetCompletion: number,
): number {
  return evaluateCraftEndOutcomeDistribution({
    state,
    targetCompletion,
    targetPerfection: 0,
    hasDistinctSublimeOutcome: false,
  }).successChance;
}

function calculateRecommendationGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig>,
): {
  expectedGains: GainPreview;
  immediateGains: GainPreview;
  effectiveCosts: ActionCostPreview;
} {
  const expected = calculateDisplayedSkillGains(
    state,
    skill,
    config,
    conditionEffects,
  );
  const immediate = calculateDisplayedSkillGains(
    state,
    skill,
    config,
    conditionEffects,
    { includeExpectedValue: false },
  );
  const costs = calculateEffectiveActionCosts(
    state,
    skill,
    config.minStability,
    conditionEffects,
    config,
  );

  return {
    expectedGains: {
      completion: expected.completion,
      perfection: expected.perfection,
      stability: expected.stability,
    },
    immediateGains: {
      completion: immediate.completion,
      perfection: immediate.perfection,
      stability: immediate.stability,
    },
    effectiveCosts: {
      qi: costs.qiCost,
      stability: costs.stabilityCost,
    },
  };
}

interface SearchMoveCandidate {
  skill: SkillDefinition;
  nextState: CraftingState;
  searchState: CraftingState;
  orderingScore: number;
  immediateProgress: number;
  requiresProbabilisticSurvival: boolean;
  unsafeWithGuaranteedSafeAlternative?: boolean;
  projectedSuccessChance?: number;
}

function applySurvivabilityFloorToState(
  displayState: CraftingState,
  survivabilityFloor: ReturnType<
    typeof calculateActionSurvivabilityFloor
  > | null,
): CraftingState {
  if (!survivabilityFloor) {
    return displayState;
  }

  const clampedStability = Math.max(
    0,
    Math.min(displayState.stability, survivabilityFloor.stability),
  );
  const floorPenalty = Math.min(
    displayState.initialMaxStability,
    Math.max(
      0,
      displayState.initialMaxStability - survivabilityFloor.maxStability,
    ),
  );

  if (
    clampedStability === displayState.stability &&
    floorPenalty === displayState.stabilityPenalty
  ) {
    return displayState;
  }

  const nativeVariables = displayState.nativeVariables
    ? {
        ...displayState.nativeVariables,
        stability: clampedStability,
        maxstability: survivabilityFloor.maxStability,
        stabilitypenalty: floorPenalty,
      }
    : displayState.nativeVariables;

  return displayState.copy({
    stability: clampedStability,
    stabilityPenalty: floorPenalty,
    nativeVariables,
  });
}

function shouldUseSurvivabilityFloorForContinuation(params: {
  currentStability: number;
  displayStability: number;
  floorStability: number;
  goalsMetAfterAction: boolean;
  baseSuccessSecuredAfterAction: boolean;
  hasGuaranteedSafeStabilize: boolean;
  minimumGuaranteedContinuationStability: number;
}): boolean {
  const {
    currentStability,
    displayStability,
    floorStability,
    goalsMetAfterAction,
    baseSuccessSecuredAfterAction,
    hasGuaranteedSafeStabilize,
    minimumGuaranteedContinuationStability,
  } = params;
  const hasProbabilisticRunwayGap = floorStability < displayStability;
  const runwayGuardThreshold = Math.max(
    SCORING.NEAR_DEATH_STABILITY,
    Math.ceil(minimumGuaranteedContinuationStability),
  );

  if (goalsMetAfterAction) {
    return false;
  }
  if (currentStability > runwayGuardThreshold || displayStability <= 0) {
    return false;
  }

  // If a guaranteed-safe stabilize exists, do not let an immediate floor-death
  // branch masquerade as a live continuation line just because EV-only recovery
  // procs would keep it alive. Without that stabilize alternative, sublime
  // overcraft lines may still intentionally accept the immediate risk.
  if (floorStability <= 0) {
    return hasGuaranteedSafeStabilize || !baseSuccessSecuredAfterAction;
  }

  if (
    hasGuaranteedSafeStabilize &&
    hasProbabilisticRunwayGap &&
    floorStability < minimumGuaranteedContinuationStability
  ) {
    return true;
  }

  return (
    !baseSuccessSecuredAfterAction &&
    currentStability <= 1 &&
    hasProbabilisticRunwayGap
  );
}

function shouldDeprioritizeAgainstGuaranteedSafeStabilize(params: {
  currentStability: number;
  displayStability: number;
  floorStability: number;
  goalsMetAfterAction: boolean;
  hasGuaranteedSafeStabilize: boolean;
  minimumGuaranteedContinuationStability: number;
}): boolean {
  const {
    currentStability,
    displayStability,
    floorStability,
    goalsMetAfterAction,
    hasGuaranteedSafeStabilize,
    minimumGuaranteedContinuationStability,
  } = params;
  const runwayGuardThreshold = Math.max(
    SCORING.NEAR_DEATH_STABILITY,
    Math.ceil(minimumGuaranteedContinuationStability),
  );

  if (
    goalsMetAfterAction ||
    !hasGuaranteedSafeStabilize ||
    currentStability > runwayGuardThreshold
  ) {
    return false;
  }

  if (floorStability <= 0) {
    return true;
  }

  return floorStability < minimumGuaranteedContinuationStability;
}

function hasGuaranteedSafeStabilizeAction(
  state: CraftingState,
  availableSkills: SkillDefinition[],
  config: OptimizerConfig,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig>,
  currentCondition: CraftingConditionType,
): boolean {
  return availableSkills.some((skill) => {
    if (skill.type !== 'stabilize' || isFinishAction(skill)) {
      return false;
    }
    const floor = calculateActionSurvivabilityFloor(
      state,
      skill,
      config,
      conditionEffects,
      currentCondition,
    );
    return (floor?.stability ?? 0) > 0;
  });
}

interface TranspositionCacheEntry {
  score: number;
  bestMove: string;
}

type TranspositionCache = Map<string, TranspositionCacheEntry>;

function computeScoreTieWindow(totalTargetMagnitude: number): number {
  // Treat sub-resource-tiebreak differences as effectively equal so tiny
  // floating-point noise does not flip move choices.
  return Math.max(1e-6, totalTargetMagnitude * SCORING.RESOURCE_TIEBREAKER * 2);
}

function shouldUnsafeYieldToSafeRecommendation(
  unsafeRecommendation: SkillRecommendation,
  safeRecommendation: SkillRecommendation,
): boolean {
  // Guaranteed-safe stabilize and other live continuations should still outrank
  // low-floor lines, but do not let Finish Craft jump ahead of a materially
  // better continuation solely because that continuation was marked unsafe.
  return !isFinishAction(safeRecommendation.skill);
}

function rankRecommendations(
  scored: SkillRecommendation[],
  scoreTieWindow: number = 0,
  unsafeKeys: ReadonlySet<string> = new Set(),
  tieBreaker?: (a: SkillRecommendation, b: SkillRecommendation) => number,
): SkillRecommendation[] {
  if (scored.length <= 1) {
    return scored;
  }

  const sorted = [...scored].sort((a, b) => {
    const aUnsafe = unsafeKeys.has(a.skill.key);
    const bUnsafe = unsafeKeys.has(b.skill.key);
    if (aUnsafe !== bUnsafe) {
      const unsafeRecommendation = aUnsafe ? a : b;
      const safeRecommendation = aUnsafe ? b : a;
      if (
        shouldUnsafeYieldToSafeRecommendation(
          unsafeRecommendation,
          safeRecommendation,
        )
      ) {
        return aUnsafe ? 1 : -1;
      }
    }

    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > scoreTieWindow) {
      return scoreDiff;
    }

    if (tieBreaker) {
      const tieDiff = tieBreaker(a, b);
      if (tieDiff !== 0) {
        return tieDiff > 0 ? -1 : 1;
      }
    } else {
      const aProgress =
        Math.max(0, a.immediateGains.completion) +
        Math.max(0, a.immediateGains.perfection);
      const bProgress =
        Math.max(0, b.immediateGains.completion) +
        Math.max(0, b.immediateGains.perfection);
      const progressDiff = bProgress - aProgress;
      if (progressDiff !== 0) {
        return progressDiff;
      }
    }

    return a.skill.key.localeCompare(b.skill.key);
  });
  if (sorted.length <= 2) {
    return sorted;
  }

  const result: SkillRecommendation[] = [sorted[0]];
  const remaining = sorted.slice(1);
  const usedTypes = new Set<string>([sorted[0].skill.type]);

  while (remaining.length > 0) {
    const topScore = remaining[0].score;
    const tieGroupEnd = remaining.findIndex(
      (candidate) =>
        topScore - candidate.score > DIVERSITY_TIEBREAK_SCORE_WINDOW,
    );
    const tieGroupLength = tieGroupEnd === -1 ? remaining.length : tieGroupEnd;
    const diverseIndex = remaining
      .slice(0, tieGroupLength)
      .findIndex((candidate) => !usedTypes.has(candidate.skill.type));
    const pickIndex = diverseIndex >= 0 ? diverseIndex : 0;
    const [next] = remaining.splice(pickIndex, 1);
    result.push(next);
    usedTypes.add(next.skill.type);
  }

  return result;
}

/**
 * Generate reasoning text for why a skill is recommended.
 */
function generateReasoning(
  skill: SkillDefinition,
  state: CraftingState,
  gains: { completion: number; perfection: number; stability: number },
  targetCompletion: number,
  targetPerfection: number,
): string {
  if (isFinishAction(skill)) {
    return 'Best available option';
  }

  const reasons: string[] = [];

  // Check if we need stability
  if (skill.type === 'stabilize') {
    if (state.stability <= 20) {
      reasons.push('Low stability - must restore');
    } else {
      reasons.push('Restore stability for more actions');
    }
  }

  // Check buff usage
  if (state.hasControlBuff() && skill.scalesWithControl) {
    reasons.push('Control buff active - maximize perfection');
  }
  if (state.hasIntensityBuff() && skill.scalesWithIntensity) {
    reasons.push('Intensity buff active - maximize completion');
  }

  // Check if skill grants buff
  if (skill.buffDuration > 0) {
    if (skill.buffType === BuffType.CONTROL) {
      reasons.push('Grants control buff for next turns');
    } else if (skill.buffType === BuffType.INTENSITY) {
      reasons.push('Grants intensity buff for next turns');
    }
  }

  // Check progress needs
  if (targetCompletion > 0 && targetPerfection > 0) {
    const needsCompletion = state.completion < targetCompletion;
    const needsPerfection = state.perfection < targetPerfection;

    if (gains.completion > 0 && needsCompletion) {
      reasons.push(`+${gains.completion} completion toward target`);
    }
    if (gains.perfection > 0 && needsPerfection) {
      reasons.push(`+${gains.perfection} perfection toward target`);
    }
  } else {
    if (gains.completion > 0) {
      reasons.push(`+${gains.completion} completion`);
    }
    if (gains.perfection > 0) {
      reasons.push(`+${gains.perfection} perfection`);
    }
  }

  // Disciplined Touch special case
  if (skill.isDisciplinedTouch) {
    reasons.push('Converts buffs to both completion and perfection');
  }

  return reasons.length > 0 ? reasons.join('; ') : 'Best available option';
}

function generateFinishReasoning(successChance: number): string {
  const successPct = Math.round(successChance * 100);
  if (successPct >= 100) {
    return 'Guaranteed craft success available now';
  }
  return `End the craft now for ${successPct}% success chance`;
}

/**
 * Greedy search - evaluates each skill's immediate impact.
 * Fast but may not find optimal solution.
 *
 * Now uses game-accurate condition effects.
 */
export function greedySearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  currentConditionType?: CraftingConditionType,
  searchConfig: Partial<SearchConfig> = {},
): SearchResult {
  const cfg: SearchConfig = { ...DEFAULT_SEARCH_CONFIG, ...searchConfig };
  // Extract settings from config
  const isSublime = config.isSublimeCraft || false;
  const targetMult = config.targetMultiplier || 2.0;
  const isTraining = config.trainingMode || false;
  const scoringCtx = buildScoringContext(
    config,
    state,
    normalizeConditionType(currentConditionType),
  );
  const effectiveCompTarget = isSublime
    ? targetCompletion * targetMult
    : targetCompletion;
  const effectivePerfTarget = isSublime
    ? targetPerfection * targetMult
    : targetPerfection;
  const effectiveCompGoal =
    config.maxCompletion !== undefined && Number.isFinite(config.maxCompletion)
      ? Math.min(effectiveCompTarget, config.maxCompletion)
      : effectiveCompTarget;
  const effectivePerfGoal =
    config.maxPerfection !== undefined && Number.isFinite(config.maxPerfection)
      ? Math.min(effectivePerfTarget, config.maxPerfection)
      : effectivePerfTarget;
  const modeCompGoal = isSublime ? effectiveCompGoal : targetCompletion;
  const modePerfGoal = isSublime ? effectivePerfGoal : targetPerfection;
  const scoreTieWindow = computeScoreTieWindow(
    Math.max(1, effectiveCompGoal + effectivePerfGoal),
  );
  const normalizedCurrentCondition =
    normalizeConditionType(currentConditionType);
  const getFinishAction = (
    candidate: CraftingState,
  ): (SkillRecommendation & UnsafeCandidateClassification) | null => {
    if (
      candidate.stability <= 0 ||
      goalsMet(candidate, modeCompGoal, modePerfGoal)
    ) {
      return null;
    }
    const projectedSuccessChance = calculateFinishSuccessChance(
      candidate,
      targetCompletion,
    );
    if (projectedSuccessChance <= 0) {
      return null;
    }

    return {
      skill: FINISH_CRAFT_SKILL,
      expectedGains: { ...ZERO_GAINS },
      immediateGains: { ...ZERO_GAINS },
      effectiveCosts: { ...ZERO_COSTS },
      score: scoreFinishedOutcome(
        candidate,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        config.maxCompletion,
        config.maxPerfection,
        scoringCtx,
        cfg.goalPriorityBias,
      ),
      reasoning: generateFinishReasoning(projectedSuccessChance),
      projectedSuccessChance,
      endsCraft: true,
      isTerminal: false,
      isTerminalUnmet: false,
      requiresProbabilisticSurvival: false,
    };
  };

  // Check if active goals are already met.
  if (goalsMet(state, modeCompGoal, modePerfGoal)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: false,
      targetsMet: true,
    };
  }

  const finishAction = getFinishAction(state);

  // Check if terminal state
  if (
    isTerminalState(state, config, normalizedCurrentCondition) &&
    !finishAction
  ) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
      blockedReasons: getBlockedSkillReasons(
        state,
        config,
        normalizedCurrentCondition,
      ),
    };
  }

  // Get condition effects for current condition
  const conditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCurrentCondition,
  );
  const recommendationTieMetricCache = new Map<
    string,
    CandidateTieBreakMetrics
  >();
  const getRecommendationTieMetrics = (
    recommendation: SkillRecommendation,
  ): CandidateTieBreakMetrics => {
    const cached = recommendationTieMetricCache.get(recommendation.skill.key);
    if (cached) {
      return cached;
    }

    const displayState = isFinishAction(recommendation.skill)
      ? state
      : (applySkill(
          state,
          recommendation.skill,
          config,
          conditionEffects,
          targetCompletion,
          normalizedCurrentCondition,
        ) ?? state);
    const metrics: CandidateTieBreakMetrics = {
      immediateProgress: calculateImmediateProgressTowardGoals(
        state,
        displayState,
        modeCompGoal,
        modePerfGoal,
        targetCompletion,
        targetPerfection,
      ),
      isStabilize: recommendation.skill.type === 'stabilize',
      requiresProbabilisticSurvival:
        recommendation.requiresProbabilisticSurvival === true,
      qiSpent: Math.max(0, state.qi - displayState.qi),
      skillKey: recommendation.skill.key,
    };
    recommendationTieMetricCache.set(recommendation.skill.key, metrics);
    return metrics;
  };
  const compareRecommendationTies = (
    a: SkillRecommendation,
    b: SkillRecommendation,
  ): number =>
    compareTieBreakMetrics(
      getRecommendationTieMetrics(a),
      getRecommendationTieMetrics(b),
    );

  const availableSkills = getAvailableSkills(
    state,
    config,
    normalizedCurrentCondition,
  );
  const hasGuaranteedSafeStabilize = hasGuaranteedSafeStabilizeAction(
    state,
    availableSkills,
    config,
    conditionEffects,
    normalizedCurrentCondition,
  );
  const minimumGuaranteedContinuationStability = hasGuaranteedSafeStabilize
    ? Math.max(1, scoringCtx.avgStabilityCostPerTurn)
    : 0;
  const evaluatedMoves: Array<
    SkillRecommendation & UnsafeCandidateClassification
  > = [];
  const unsafeRecommendationKeys = new Set<string>();

  for (const skill of availableSkills) {
    const displayState = applySkill(
      state,
      skill,
      config,
      conditionEffects,
      targetCompletion,
      normalizedCurrentCondition,
    );
    if (displayState === null) continue;
    const goalsMetAfterAction = goalsMet(
      displayState,
      modeCompGoal,
      modePerfGoal,
    );
    const baseSuccessSecuredAfterAction = goalsMet(
      displayState,
      targetCompletion,
      targetPerfection,
    );
    const survivabilityFloor = calculateActionSurvivabilityFloor(
      state,
      skill,
      config,
      conditionEffects,
      normalizedCurrentCondition,
    );
    const floorStability =
      survivabilityFloor?.stability ?? displayState.stability;
    const unsafeWithGuaranteedSafeAlternative =
      shouldDeprioritizeAgainstGuaranteedSafeStabilize({
        currentStability: state.stability,
        displayStability: displayState.stability,
        floorStability,
        goalsMetAfterAction,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      });
    if (unsafeWithGuaranteedSafeAlternative) {
      unsafeRecommendationKeys.add(skill.key);
    }
    const requiresProbabilisticSurvival =
      shouldUseSurvivabilityFloorForContinuation({
        currentStability: state.stability,
        displayStability: displayState.stability,
        floorStability,
        goalsMetAfterAction,
        baseSuccessSecuredAfterAction,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      });
    const newState = requiresProbabilisticSurvival
      ? applySurvivabilityFloorToState(displayState, survivabilityFloor)
      : displayState;

    const { expectedGains, immediateGains, effectiveCosts } =
      calculateRecommendationGains(state, skill, config, conditionEffects);
    const terminalState = classifyTerminalState(
      newState,
      config,
      normalizedCurrentCondition,
      modeCompGoal,
      modePerfGoal,
    );
    const score = terminalState.isTerminal
      ? scoreFinishedOutcome(
          newState,
          targetCompletion,
          targetPerfection,
          isSublime,
          targetMult,
          config.maxCompletion,
          config.maxPerfection,
          scoringCtx,
          cfg.goalPriorityBias,
        )
      : scoreState(
          newState,
          targetCompletion,
          targetPerfection,
          isSublime,
          targetMult,
          isTraining,
          config.maxCompletion,
          config.maxPerfection,
          scoringCtx,
          cfg.goalPriorityBias,
        );
    const reasoning = generateReasoning(
      skill,
      state,
      immediateGains,
      targetCompletion,
      targetPerfection,
    );

    evaluatedMoves.push({
      skill,
      expectedGains,
      immediateGains,
      effectiveCosts,
      score,
      reasoning,
      endsCraft: terminalState.isTerminal,
      requiresProbabilisticSurvival,
      ...terminalState,
    });
  }

  if (finishAction) {
    evaluatedMoves.push(finishAction);
  }

  const scoredSkills: SkillRecommendation[] =
    filterUnfinishedTerminalCandidates(evaluatedMoves).map(
      ({ isTerminal, isTerminalUnmet, ...rec }) => rec,
    );

  const rankedSkills = rankRecommendations(
    scoredSkills,
    scoreTieWindow,
    unsafeRecommendationKeys,
    compareRecommendationTies,
  );

  if (rankedSkills.length === 0) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
      blockedReasons: getBlockedSkillReasons(
        state,
        config,
        normalizedCurrentCondition,
      ),
    };
  }

  return {
    recommendation: rankedSkills[0],
    alternativeSkills: rankedSkills.slice(1),
    isTerminal: false,
    targetsMet: false,
  };
}

/**
 * Lookahead search with memoization and performance optimizations.
 * Searches N moves ahead to find the best first move.
 *
 * Performance features:
 * - Alpha-beta pruning to cut off unpromising branches
 * - Beam search to limit branches at each level
 * - Time budget to prevent UI freezes
 * - Progress bucketing for better cache hits with large numbers
 *
 * @param state - Current crafting state
 * @param config - Optimizer config with skills and character stats
 * @param targetCompletion - Target completion value
 * @param targetPerfection - Target perfection value
 * @param depth - How many moves to look ahead
 * @param currentConditionType - Current condition type for skill filtering
 * @param forecastedConditionTypes - Array of upcoming condition types for skill filtering
 * @param searchConfig - Optional search configuration for performance tuning
 */
export function lookaheadSearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  depth: number = 3,
  currentConditionType?: CraftingConditionType,
  forecastedConditionTypes: CraftingConditionType[] = [],
  searchConfig: Partial<SearchConfig> = {},
): SearchResult {
  // Merge with default search config
  const cfg: SearchConfig = { ...DEFAULT_SEARCH_CONFIG, ...searchConfig };
  const normalizedCurrentCondition =
    normalizeConditionType(currentConditionType);
  const initialConditionQueue = normalizeForecastConditionQueue(
    normalizedCurrentCondition,
    forecastedConditionTypes,
    state.harmony,
    VISIBLE_CONDITION_QUEUE_LENGTH,
  );

  // Search metrics for performance monitoring
  const metrics: NonNullable<SearchResult['searchMetrics']> = {
    nodesExplored: 0,
    cacheHits: 0,
    timeTakenMs: 0,
    depthReached: 0,
    pruned: 0,
  };
  const startTime = Date.now();

  // Extract settings from config
  const isSublime = config.isSublimeCraft || false;
  const targetMult = config.targetMultiplier || 2.0;
  const isTraining = config.trainingMode || false;
  const scoringCtx = buildScoringContext(
    config,
    state,
    normalizedCurrentCondition,
  );
  const effectiveCompTarget = isSublime
    ? targetCompletion * targetMult
    : targetCompletion;
  const effectivePerfTarget = isSublime
    ? targetPerfection * targetMult
    : targetPerfection;
  const effectiveCompGoal =
    config.maxCompletion !== undefined && Number.isFinite(config.maxCompletion)
      ? Math.min(effectiveCompTarget, config.maxCompletion)
      : effectiveCompTarget;
  const effectivePerfGoal =
    config.maxPerfection !== undefined && Number.isFinite(config.maxPerfection)
      ? Math.min(effectivePerfTarget, config.maxPerfection)
      : effectivePerfTarget;
  const modeCompGoal = isSublime ? effectiveCompGoal : targetCompletion;
  const modePerfGoal = isSublime ? effectivePerfGoal : targetPerfection;
  const scoreTieWindow = computeScoreTieWindow(
    Math.max(1, effectiveCompGoal + effectivePerfGoal),
  );
  const shouldUseNativeMctsPolicy =
    cfg.useMonteCarloTreeSearch !== false &&
    depth > 1 &&
    config.skills.length > 0 &&
    (isSublime || depth >= 16 || config.skills.length >= 8);
  const nativeMctsPolicy: NativeMctsPolicy | null = shouldUseNativeMctsPolicy
    ? getNativeMctsPolicy({
        state,
        config,
        targetCompletion,
        targetPerfection,
        currentConditionType: normalizedCurrentCondition,
        forecastedConditionTypes,
        goalPriorityBias: cfg.goalPriorityBias,
        search: {
          iterations: cfg.mctsIterations,
          rolloutDepth: Math.min(depth, cfg.mctsRolloutDepth ?? depth),
          exploration: cfg.mctsExploration,
          maxNodes: cfg.mctsMaxNodes,
          timeBudgetMs: cfg.timeBudgetMs,
        },
      })
    : null;
  if (nativeMctsPolicy) {
    metrics.mcts = {
      backend: nativeMctsPolicy.backend,
      iterations: nativeMctsPolicy.iterations,
      nodes: nativeMctsPolicy.nodes,
      rolloutDepth: nativeMctsPolicy.rolloutDepth,
      bestSkillKey: nativeMctsPolicy.bestSkillKey,
      policyCount: nativeMctsPolicy.orderedPolicies.length,
    };
  }
  const rootMctsPolicyBySkillKey =
    nativeMctsPolicy?.policyBySkillKey ?? new Map<string, never>();
  const sameConditionQueue = (
    left: CraftingConditionType[],
    right: CraftingConditionType[],
  ): boolean =>
    left.length === right.length &&
    left.every((condition, index) => condition === right[index]);
  const isRootMctsPolicyContext = (
    candidateState: CraftingState,
    conditionAtDepth: CraftingConditionType,
    conditionQueueAtDepth: CraftingConditionType[],
  ): boolean =>
    rootMctsPolicyBySkillKey.size > 0 &&
    candidateState === state &&
    normalizeConditionType(conditionAtDepth) === normalizedCurrentCondition &&
    sameConditionQueue(conditionQueueAtDepth, initialConditionQueue);
  const compareRootMctsPolicyTie = (
    aSkillKey: string,
    bSkillKey: string,
  ): number => {
    const aPolicy = rootMctsPolicyBySkillKey.get(aSkillKey)?.policy ?? 0;
    const bPolicy = rootMctsPolicyBySkillKey.get(bSkillKey)?.policy ?? 0;
    const policyDiff = aPolicy - bPolicy;
    // Ignore single-rollout noise; only use MCTS when it has a visible root
    // preference and the authoritative score already considers the moves tied.
    return Math.abs(policyDiff) >= 0.02 ? policyDiff : 0;
  };
  const targetsMetForCurrentMode = (candidate: CraftingState): boolean =>
    goalsMet(candidate, modeCompGoal, modePerfGoal);
  const compareMoveCandidatesForTie = (
    a: SearchMoveCandidate,
    b: SearchMoveCandidate,
    currentState: CraftingState,
  ): number => {
    return compareTieBreakMetrics(
      {
        immediateProgress: a.immediateProgress,
        isStabilize: a.skill.type === 'stabilize',
        requiresProbabilisticSurvival: a.requiresProbabilisticSurvival,
        qiSpent: Math.max(0, currentState.qi - a.nextState.qi),
        skillKey: a.skill.key,
      },
      {
        immediateProgress: b.immediateProgress,
        isStabilize: b.skill.type === 'stabilize',
        requiresProbabilisticSurvival: b.requiresProbabilisticSurvival,
        qiSpent: Math.max(0, currentState.qi - b.nextState.qi),
        skillKey: b.skill.key,
      },
    );
  };
  const scoreStateWithTerminalPenalty = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
  ): number => {
    if (isTerminalState(candidate, config, conditionAtDepth)) {
      return scoreFinishedOutcome(
        candidate,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        config.maxCompletion,
        config.maxPerfection,
        scoringCtx,
        cfg.goalPriorityBias,
      );
    }

    let baseScore = scoreState(
      candidate,
      targetCompletion,
      targetPerfection,
      isSublime,
      targetMult,
      isTraining,
      config.maxCompletion,
      config.maxPerfection,
      scoringCtx,
      cfg.goalPriorityBias,
    );
    const remainingCompletion = Math.max(
      0,
      modeCompGoal - candidate.completion,
    );
    const remainingPerfection = Math.max(
      0,
      modePerfGoal - candidate.perfection,
    );
    const totalRemaining = remainingCompletion + remainingPerfection;
    if (totalRemaining > 0) {
      const compNeedShare = remainingCompletion / totalRemaining;
      const perfNeedShare = remainingPerfection / totalRemaining;
      const { completionWeight, perfectionWeight } = getGoalPriorityWeights(
        compNeedShare,
        perfNeedShare,
        modeCompGoal,
        modePerfGoal,
        cfg.goalPriorityBias,
      );
      const totalPriorityWeight = completionWeight + perfectionWeight;
      const completionPriorityShare =
        totalPriorityWeight > 0 ? completionWeight / totalPriorityWeight : 0.5;
      const perfectionPriorityShare =
        totalPriorityWeight > 0 ? perfectionWeight / totalPriorityWeight : 0.5;
      const conditionEffects = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );
      let intensityScale = 1;
      let controlScale = 1;
      for (const effect of conditionEffects) {
        if (effect.kind === 'intensity' && effect.multiplier !== undefined) {
          intensityScale += effect.multiplier;
        }
        if (effect.kind === 'control' && effect.multiplier !== undefined) {
          controlScale += effect.multiplier;
        }
      }
      const conditionedPotential =
        completionPriorityShare * intensityScale +
        perfectionPriorityShare * controlScale;
      const neutralPotential =
        completionPriorityShare + perfectionPriorityShare;
      const conditionWeightedProgress = estimateWeightedProgressPerTurn(
        completionPriorityShare,
        perfectionPriorityShare,
        scoringCtx,
      );
      baseScore +=
        (conditionedPotential - neutralPotential) * conditionWeightedProgress;
    }
    return baseScore;
  };
  const buildSearchStateForContinuation = (
    currentState: CraftingState,
    skill: SkillDefinition,
    displayState: CraftingState,
    conditionEffectsAtDepth: ReturnType<typeof getConditionEffectsForConfig>,
    currentConditionAtDepth: CraftingConditionType,
    hasGuaranteedSafeStabilize: boolean,
    minimumGuaranteedContinuationStability: number = 0,
  ): {
    searchState: CraftingState;
    requiresProbabilisticSurvival: boolean;
  } => {
    if (isFinishAction(skill)) {
      return {
        searchState: displayState,
        requiresProbabilisticSurvival: false,
      };
    }

    const goalsMetAfterAction = targetsMetForCurrentMode(displayState);
    const baseSuccessSecuredAfterAction = goalsMet(
      displayState,
      targetCompletion,
      targetPerfection,
    );
    const survivabilityFloor = calculateActionSurvivabilityFloor(
      currentState,
      skill,
      config,
      conditionEffectsAtDepth,
      currentConditionAtDepth,
    );
    const floorStability =
      survivabilityFloor?.stability ?? displayState.stability;
    const requiresProbabilisticSurvival =
      shouldUseSurvivabilityFloorForContinuation({
        currentStability: currentState.stability,
        displayStability: displayState.stability,
        floorStability,
        goalsMetAfterAction,
        baseSuccessSecuredAfterAction,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      });

    return {
      searchState: requiresProbabilisticSurvival
        ? applySurvivabilityFloorToState(displayState, survivabilityFloor)
        : displayState,
      requiresProbabilisticSurvival,
    };
  };
  const getFinishAction = (
    candidate: CraftingState,
  ): SearchMoveCandidate | null => {
    if (
      candidate.stability <= 0 ||
      goalsMet(candidate, modeCompGoal, modePerfGoal)
    ) {
      return null;
    }

    const projectedSuccessChance = calculateFinishSuccessChance(
      candidate,
      targetCompletion,
    );
    if (projectedSuccessChance <= 0) {
      return null;
    }

    return {
      skill: FINISH_CRAFT_SKILL,
      nextState: candidate,
      searchState: candidate,
      orderingScore: scoreFinishedOutcome(
        candidate,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        config.maxCompletion,
        config.maxPerfection,
        scoringCtx,
        cfg.goalPriorityBias,
      ),
      immediateProgress: 0,
      requiresProbabilisticSurvival: false,
      projectedSuccessChance,
    };
  };
  const scoreStateConsideringFinish = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
  ): number => {
    const continuationScore = scoreStateWithTerminalPenalty(
      candidate,
      conditionAtDepth,
    );
    const finishCandidate = getFinishAction(candidate);
    if (!finishCandidate) {
      return continuationScore;
    }
    return Math.max(continuationScore, finishCandidate.orderingScore);
  };
  let cache: TranspositionCache = new Map();
  let acceptedCache: TranspositionCache = new Map();

  const getDeepestCachedEntry = (
    cacheToProbe: TranspositionCache,
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    maxRemainingDepth: number,
  ): TranspositionCacheEntry | undefined => {
    for (let probeDepth = maxRemainingDepth; probeDepth >= 1; probeDepth--) {
      const probeCacheKey = getNormalizedCacheKey(
        candidate,
        effectiveCompGoal,
        effectivePerfGoal,
        probeDepth,
        conditionAtDepth,
        nextConditionQueueAtDepth,
        cfg.progressBucketSize,
      );
      const probeEntry = cacheToProbe.get(probeCacheKey);
      if (probeEntry) {
        return probeEntry;
      }
    }
    return undefined;
  };

  const getCachedBestMoveKey = (
    cacheToProbe: TranspositionCache,
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    maxRemainingDepth: number,
  ): string | null =>
    getDeepestCachedEntry(
      cacheToProbe,
      candidate,
      conditionAtDepth,
      nextConditionQueueAtDepth,
      maxRemainingDepth,
    )?.bestMove || null;

  const scoreStateFromBestAvailableFrontier = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    remainingDepth: number,
  ): number => {
    const cachedScore = getDeepestCachedEntry(
      acceptedCache,
      candidate,
      conditionAtDepth,
      nextConditionQueueAtDepth,
      Math.max(0, remainingDepth - 1),
    )?.score;
    return typeof cachedScore === 'number' && Number.isFinite(cachedScore)
      ? cachedScore
      : scoreStateConsideringFinish(candidate, conditionAtDepth);
  };

  function estimatePostMoveStateScore(
    newState: CraftingState,
    skill: SkillDefinition,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
  ): number {
    if (!actionConsumesTurn(skill)) {
      return scoreStateWithTerminalPenalty(newState, conditionAtDepth);
    }

    const transitions = getConditionTransitionsWithProvider(
      conditionAtDepth,
      nextConditionQueueAtDepth,
      newState.harmony,
      cfg,
    );
    if (transitions.length === 0) {
      return scoreStateWithTerminalPenalty(newState, conditionAtDepth);
    }

    let expectedScore = 0;
    for (const transition of transitions) {
      expectedScore +=
        transition.probability *
        scoreStateWithTerminalPenalty(newState, transition.nextCondition);
    }
    return expectedScore;
  }

  function buildOrderedMoveCandidates(
    currentState: CraftingState,
    remainingDepth: number,
    currentConditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    conditionEffectsAtDepth: ReturnType<typeof getConditionEffectsForConfig>,
    useGuaranteedSafeStabilizeGate: boolean = false,
  ): SearchMoveCandidate[] {
    const availableSkills = getAvailableSkills(
      currentState,
      config,
      currentConditionAtDepth,
    );
    const hasGuaranteedSafeStabilize = useGuaranteedSafeStabilizeGate
      ? hasGuaranteedSafeStabilizeAction(
          currentState,
          availableSkills,
          config,
          conditionEffectsAtDepth,
          currentConditionAtDepth,
        )
      : false;
    const minimumGuaranteedContinuationStability =
      useGuaranteedSafeStabilizeGate && hasGuaranteedSafeStabilize
        ? Math.max(1, scoringCtx.avgStabilityCostPerTurn)
        : 0;
    const candidates: SearchMoveCandidate[] = [];

    for (const skill of availableSkills) {
      const nextState = applySkill(
        currentState,
        skill,
        config,
        conditionEffectsAtDepth,
        targetCompletion,
        currentConditionAtDepth,
      );
      if (nextState === null) {
        continue;
      }
      const { searchState, requiresProbabilisticSurvival } =
        buildSearchStateForContinuation(
          currentState,
          skill,
          nextState,
          conditionEffectsAtDepth,
          currentConditionAtDepth,
          hasGuaranteedSafeStabilize,
          minimumGuaranteedContinuationStability,
        );
      const floorStability =
        calculateActionSurvivabilityFloor(
          currentState,
          skill,
          config,
          conditionEffectsAtDepth,
          currentConditionAtDepth,
        )?.stability ?? nextState.stability;
      const unsafeWithGuaranteedSafeAlternative =
        shouldDeprioritizeAgainstGuaranteedSafeStabilize({
          currentStability: currentState.stability,
          displayStability: nextState.stability,
          floorStability,
          goalsMetAfterAction: targetsMetForCurrentMode(nextState),
          hasGuaranteedSafeStabilize,
          minimumGuaranteedContinuationStability,
        });

      const immediateProgress = calculateImmediateProgressTowardGoals(
        currentState,
        nextState,
        modeCompGoal,
        modePerfGoal,
        targetCompletion,
        targetPerfection,
      );

      candidates.push({
        skill,
        nextState,
        searchState,
        orderingScore: estimatePostMoveStateScore(
          searchState,
          skill,
          currentConditionAtDepth,
          nextConditionQueueAtDepth,
        ),
        immediateProgress,
        requiresProbabilisticSurvival,
        unsafeWithGuaranteedSafeAlternative,
      });
    }

    const finishCandidate = getFinishAction(currentState);
    if (finishCandidate) {
      candidates.push(finishCandidate);
    }

    const filteredCandidates = filterUnfinishedTerminalCandidates(
      candidates.map((candidate) => ({
        ...candidate,
        isTerminal: false,
        isTerminalUnmet: false,
      })),
    ).map(({ isTerminal, isTerminalUnmet, ...candidate }) => candidate);

    filteredCandidates.sort((a, b) => {
      const scoreDiff = b.orderingScore - a.orderingScore;
      if (Math.abs(scoreDiff) > scoreTieWindow) {
        return scoreDiff;
      }
      if (
        isRootMctsPolicyContext(
          currentState,
          currentConditionAtDepth,
          nextConditionQueueAtDepth,
        )
      ) {
        const mctsPolicyTie = compareRootMctsPolicyTie(
          a.skill.key,
          b.skill.key,
        );
        if (mctsPolicyTie !== 0) {
          return mctsPolicyTie > 0 ? -1 : 1;
        }
      }
      return compareMoveCandidatesForTie(b, a, currentState);
    });

    // Promote only previously accepted principal-variation moves. Using the
    // live in-progress cache here can let a partially explored sibling branch
    // steer beam truncation for the current frontier.
    const cachedBestMoveKey = getCachedBestMoveKey(
      acceptedCache,
      currentState,
      currentConditionAtDepth,
      nextConditionQueueAtDepth,
      Math.max(0, remainingDepth - 1),
    );
    if (cachedBestMoveKey) {
      const cachedIndex = filteredCandidates.findIndex(
        (candidate) => candidate.skill.key === cachedBestMoveKey,
      );
      if (cachedIndex > 0) {
        const [cachedCandidate] = filteredCandidates.splice(cachedIndex, 1);
        filteredCandidates.unshift(cachedCandidate);
      }
    }

    return filteredCandidates;
  }

  // Check if targets already met
  if (targetsMetForCurrentMode(state)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: false,
      targetsMet: true,
      searchMetrics: metrics,
    };
  }

  const rootFinishAction = getFinishAction(state);

  // Check if terminal state (use current condition type for filtering)
  if (
    isTerminalState(state, config, normalizedCurrentCondition) &&
    !rootFinishAction
  ) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
      searchMetrics: metrics,
    };
  }

  // Flag to signal early termination due to time/node budget
  let shouldTerminate = false;

  /**
   * Check if we should terminate search early due to budget constraints
   */
  function checkBudget(): boolean {
    if (shouldTerminate) return true;

    // Check time budget
    if (Date.now() - startTime > cfg.timeBudgetMs) {
      shouldTerminate = true;
      return true;
    }

    // Check node budget
    if (metrics.nodesExplored >= cfg.maxNodes) {
      shouldTerminate = true;
      return true;
    }

    return false;
  }

  /**
   * Count only cache-miss expansions against the node budget.
   * Cache hits are already solved subproblems and should not consume the same
   * budget as exploring a new frontier node.
   */
  function consumeNodeBudget(): boolean {
    if (metrics.nodesExplored >= cfg.maxNodes) {
      shouldTerminate = true;
      return false;
    }

    metrics.nodesExplored++;
    return true;
  }

  /**
   * Recursive search function with alpha-beta pruning
   * Uses forecasted conditions at each depth level for more accurate simulation
   *
   * @param currentState - Current state to evaluate
   * @param remainingDepth - Remaining search depth
   * @param depthIndex - Current depth index for condition lookups
   * @param alpha - Best score achievable by maximizer (for pruning)
   * @param beta - Best score achievable by minimizer (for pruning, unused in single-player)
   */
  function search(
    currentState: CraftingState,
    remainingDepth: number,
    depthIndex: number,
    currentConditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    alpha: number = -Infinity,
    beta: number = Infinity,
  ): number {
    // Check budget constraints
    if (checkBudget()) {
      return scoreStateFromBestAvailableFrontier(
        currentState,
        currentConditionAtDepth,
        nextConditionQueueAtDepth,
        remainingDepth,
      );
    }

    const stateIsTerminal =
      isTerminalState(currentState, config, currentConditionAtDepth) &&
      !getFinishAction(currentState);

    // Base case: depth exhausted or terminal
    if (remainingDepth === 0 || stateIsTerminal) {
      return scoreStateConsideringFinish(currentState, currentConditionAtDepth);
    }

    // Check if active goals are met - early termination with score.
    if (targetsMetForCurrentMode(currentState)) {
      return scoreState(
        currentState,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        isTraining,
        config.maxCompletion,
        config.maxPerfection,
        scoringCtx,
        cfg.goalPriorityBias,
      );
    }

    // Check cache with normalized key (buckets large progress values)
    const cacheKey = getNormalizedCacheKey(
      currentState,
      effectiveCompGoal,
      effectivePerfGoal,
      remainingDepth,
      currentConditionAtDepth,
      nextConditionQueueAtDepth,
      cfg.progressBucketSize,
    );
    if (cache.has(cacheKey)) {
      metrics.cacheHits++;
      return cache.get(cacheKey)!.score;
    }

    if (!consumeNodeBudget()) {
      return scoreStateFromBestAvailableFrontier(
        currentState,
        currentConditionAtDepth,
        nextConditionQueueAtDepth,
        remainingDepth,
      );
    }

    // Get condition effects for this depth.
    const conditionEffectsAtDepth = getConditionEffectsForConfig(
      config,
      currentConditionAtDepth,
    );
    const orderedCandidates = buildOrderedMoveCandidates(
      currentState,
      remainingDepth,
      currentConditionAtDepth,
      nextConditionQueueAtDepth,
      conditionEffectsAtDepth,
    );
    if (orderedCandidates.length === 0) {
      return scoreStateConsideringFinish(currentState, currentConditionAtDepth);
    }

    // Apply adaptive beam search: use narrower beam for deep searches
    const effectiveBeamWidth = cfg.useAdaptiveBeamWidth
      ? getAdaptiveBeamWidth(cfg.beamWidth, remainingDepth)
      : cfg.beamWidth;
    const beamCandidates = orderedCandidates.slice(0, effectiveBeamWidth);

    let bestScore = -Infinity;
    let bestCandidate: SearchMoveCandidate | null = null;
    let bestMoveKey = ''; // tracks which skill achieved bestScore

    for (const candidate of beamCandidates) {
      const { skill, searchState: newState } = candidate;

      let score = 0;
      if (isFinishAction(skill)) {
        score = candidate.orderingScore;
      } else if (!actionConsumesTurn(skill)) {
        score = search(
          newState,
          remainingDepth,
          depthIndex,
          currentConditionAtDepth,
          nextConditionQueueAtDepth,
          bestScore,
          beta,
        );
      } else {
        const transitions = getConditionTransitionsWithProvider(
          currentConditionAtDepth,
          nextConditionQueueAtDepth,
          newState.harmony,
          cfg,
        );
        for (const transition of transitions) {
          const branchScore = search(
            newState,
            remainingDepth - 1,
            depthIndex + 1,
            transition.nextCondition,
            transition.nextQueue,
            bestScore,
            beta,
          );
          score += transition.probability * branchScore;
        }
      }
      const scoreDelta = score - bestScore;
      const isClearImprovement = scoreDelta > scoreTieWindow;
      const isScoreTie =
        Math.abs(scoreDelta) <= scoreTieWindow && bestCandidate;
      const winsTie =
        isScoreTie &&
        compareMoveCandidatesForTie(candidate, bestCandidate!, currentState) >
          0;

      if (isClearImprovement || winsTie || bestCandidate === null) {
        bestScore = score;
        bestCandidate = candidate;
        bestMoveKey = skill.key;
      }

      // Alpha-beta pruning: if we found a score better than what the parent
      // could guarantee, we can prune this branch
      if (cfg.useAlphaBeta && bestScore >= beta) {
        metrics.pruned++;
        break;
      }
    }

    if (!Number.isFinite(bestScore)) {
      bestScore = scoreStateConsideringFinish(
        currentState,
        currentConditionAtDepth,
      );
      bestMoveKey = '';
    }

    cache.set(cacheKey, { score: bestScore, bestMove: bestMoveKey });
    return bestScore;
  }

  function evaluateFutureScoreAfterSkill(
    newState: CraftingState,
    remainingDepth: number,
    depthIndex: number,
    conditionAtDepth: CraftingConditionType,
    conditionQueueAtDepth: CraftingConditionType[],
    skill: SkillDefinition,
  ): number {
    if (isFinishAction(skill)) {
      return (
        getFinishAction(newState)?.orderingScore ??
        scoreStateConsideringFinish(newState, conditionAtDepth)
      );
    }

    if (!actionConsumesTurn(skill)) {
      return search(
        newState,
        remainingDepth,
        depthIndex,
        conditionAtDepth,
        conditionQueueAtDepth,
      );
    }

    const transitions = getConditionTransitionsWithProvider(
      conditionAtDepth,
      conditionQueueAtDepth,
      newState.harmony,
      cfg,
    );
    let expectedScore = 0;
    for (const transition of transitions) {
      const branchScore = search(
        newState,
        remainingDepth,
        depthIndex,
        transition.nextCondition,
        transition.nextQueue,
      );
      expectedScore += transition.probability * branchScore;
    }
    return expectedScore;
  }

  function getMostLikelyConditionStateAfterSkill(
    newState: CraftingState,
    conditionAtDepth: CraftingConditionType,
    conditionQueueAtDepth: CraftingConditionType[],
    skill: SkillDefinition,
  ): {
    nextCondition: CraftingConditionType;
    nextQueue: CraftingConditionType[];
  } {
    if (isFinishAction(skill) || !actionConsumesTurn(skill)) {
      return {
        nextCondition: conditionAtDepth,
        nextQueue: conditionQueueAtDepth,
      };
    }

    const transitions = getConditionTransitionsWithProvider(
      conditionAtDepth,
      conditionQueueAtDepth,
      newState.harmony,
      cfg,
    );
    const bestTransition = transitions[0];
    if (!bestTransition) {
      return {
        nextCondition: conditionAtDepth,
        nextQueue: conditionQueueAtDepth,
      };
    }
    return {
      nextCondition: bestTransition.nextCondition,
      nextQueue: bestTransition.nextQueue,
    };
  }

  /**
   * Find the optimal path (rotation) from a given state
   * Returns the sequence of skill names and the final state
   *
   * @param startState - State to start from
   * @param maxDepth - Maximum depth to search
   * @param startDepthIndex - The depth index to start from (for condition lookups)
   *
   * Uses the transposition table's bestMove entries to reconstruct the tree
   * search's actual chosen path.  Falls back to greedy evaluation for any
   * step where the cache does not contain a best-move entry.
   */
  function findOptimalPath(
    startState: CraftingState,
    maxDepth: number,
    startDepthIndex: number = 0,
    startConditionAtDepth: CraftingConditionType = normalizedCurrentCondition,
    startConditionQueueAtDepth: CraftingConditionType[] = initialConditionQueue,
  ): { path: string[]; finalState: CraftingState; finishedByChoice: boolean } {
    const path: string[] = [];
    let currentState = startState;
    let currentDepth = 0;
    let conditionAtDepth = startConditionAtDepth;
    let conditionQueueAtDepth = startConditionQueueAtDepth;
    let finishedByChoice = false;

    while (
      currentDepth < maxDepth &&
      !(
        isTerminalState(currentState, config, conditionAtDepth) &&
        !getFinishAction(currentState)
      )
    ) {
      if (targetsMetForCurrentMode(currentState)) {
        break;
      }

      const globalDepth = startDepthIndex + currentDepth;
      const conditionEffectsAtDepth = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );
      const skills = getAvailableSkills(currentState, config, conditionAtDepth);
      if (skills.length === 0) break;

      // Try to use the transposition table's recorded best move.
      // With iterative deepening, the exact remaining depth may not have
      // been searched (budget exhausted mid-iteration).  Probe backwards
      // from the deepest remaining depth to find the best available entry.
      const remainingDepth = maxDepth - currentDepth;
      let chosenSkill: SkillDefinition | null = null;
      let chosenNextState: CraftingState | null = null;

      const cachedBestMove = getCachedBestMoveKey(
        acceptedCache,
        currentState,
        conditionAtDepth,
        conditionQueueAtDepth,
        remainingDepth,
      );
      if (cachedBestMove) {
        if (cachedBestMove === FINISH_CRAFT_KEY) {
          const finishAction = getFinishAction(currentState);
          if (finishAction) {
            chosenSkill = finishAction.skill;
            chosenNextState = finishAction.searchState;
          }
        } else {
          const cachedSkill = skills.find(
            (skill) => skill.key === cachedBestMove,
          );
          if (cachedSkill) {
            const nextState = applySkill(
              currentState,
              cachedSkill,
              config,
              conditionEffectsAtDepth,
              targetCompletion,
              conditionAtDepth,
            );
            if (nextState !== null) {
              const { searchState } = buildSearchStateForContinuation(
                currentState,
                cachedSkill,
                nextState,
                conditionEffectsAtDepth,
                conditionAtDepth,
                false,
              );
              chosenSkill = cachedSkill;
              chosenNextState = searchState;
            }
          }
        }
      }

      // Fallback: greedy evaluation when cache miss or cached skill unavailable.
      if (!chosenSkill || !chosenNextState) {
        let bestScore = -Infinity;
        let bestCandidate: SearchMoveCandidate | null = null;
        const orderedFallbackCandidates = buildOrderedMoveCandidates(
          currentState,
          remainingDepth,
          conditionAtDepth,
          conditionQueueAtDepth,
          conditionEffectsAtDepth,
        );
        for (const candidate of orderedFallbackCandidates) {
          const skill = candidate.skill;
          const nextState = candidate.searchState;
          const score = evaluateFutureScoreAfterSkill(
            nextState,
            Math.max(0, remainingDepth - 1),
            globalDepth + 1,
            conditionAtDepth,
            conditionQueueAtDepth,
            skill,
          );
          const scoredCandidate: SearchMoveCandidate = {
            ...candidate,
            orderingScore: score,
          };

          const scoreDelta = score - bestScore;
          const isClearImprovement = scoreDelta > scoreTieWindow;
          const isScoreTie =
            Math.abs(scoreDelta) <= scoreTieWindow && bestCandidate;
          const winsTie =
            isScoreTie &&
            compareMoveCandidatesForTie(
              scoredCandidate,
              bestCandidate!,
              currentState,
            ) > 0;

          if (isClearImprovement || winsTie || bestCandidate === null) {
            bestScore = score;
            bestCandidate = scoredCandidate;
            chosenSkill = skill;
            chosenNextState = nextState;
          }
        }
      }

      if (!chosenSkill || !chosenNextState) {
        break;
      }

      path.push(chosenSkill.name);
      if (isFinishAction(chosenSkill)) {
        finishedByChoice = true;
        break;
      }

      const nextConditionState = getMostLikelyConditionStateAfterSkill(
        chosenNextState,
        conditionAtDepth,
        conditionQueueAtDepth,
        chosenSkill,
      );

      currentState = chosenNextState;
      conditionAtDepth = nextConditionState.nextCondition;
      conditionQueueAtDepth = nextConditionState.nextQueue;
      currentDepth++;
    }

    return { path, finalState: currentState, finishedByChoice };
  }

  /**
   * Evaluate all first moves at a specific depth.
   */
  const rootConditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCurrentCondition,
  );
  let unsafeRootRecommendationKeys = new Set<string>();
  const recommendationTieMetricCache = new Map<
    string,
    CandidateTieBreakMetrics
  >();
  const getRecommendationTieMetrics = (
    recommendation: SkillRecommendation,
  ): CandidateTieBreakMetrics => {
    const cached = recommendationTieMetricCache.get(recommendation.skill.key);
    if (cached) {
      return cached;
    }

    const displayState = isFinishAction(recommendation.skill)
      ? state
      : (applySkill(
          state,
          recommendation.skill,
          config,
          rootConditionEffects,
          targetCompletion,
          normalizedCurrentCondition,
        ) ?? state);
    const metrics: CandidateTieBreakMetrics = {
      immediateProgress: calculateImmediateProgressTowardGoals(
        state,
        displayState,
        modeCompGoal,
        modePerfGoal,
        targetCompletion,
        targetPerfection,
      ),
      isStabilize: recommendation.skill.type === 'stabilize',
      requiresProbabilisticSurvival:
        recommendation.requiresProbabilisticSurvival === true,
      qiSpent: Math.max(0, state.qi - displayState.qi),
      skillKey: recommendation.skill.key,
    };
    recommendationTieMetricCache.set(recommendation.skill.key, metrics);
    return metrics;
  };
  const compareRecommendations = (
    a: SkillRecommendation,
    b: SkillRecommendation,
  ): number => {
    const aUnsafe = unsafeRootRecommendationKeys.has(a.skill.key);
    const bUnsafe = unsafeRootRecommendationKeys.has(b.skill.key);
    if (aUnsafe !== bUnsafe) {
      const unsafeRecommendation = aUnsafe ? a : b;
      const safeRecommendation = aUnsafe ? b : a;
      if (
        shouldUnsafeYieldToSafeRecommendation(
          unsafeRecommendation,
          safeRecommendation,
        )
      ) {
        return aUnsafe ? 1 : -1;
      }
    }

    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > scoreTieWindow) {
      return scoreDiff;
    }

    const mctsPolicyTie = compareRootMctsPolicyTie(a.skill.key, b.skill.key);
    if (mctsPolicyTie !== 0) {
      return mctsPolicyTie > 0 ? -1 : 1;
    }

    const tieDiff = compareTieBreakMetrics(
      getRecommendationTieMetrics(a),
      getRecommendationTieMetrics(b),
    );
    if (tieDiff !== 0) {
      return tieDiff > 0 ? -1 : 1;
    }

    return a.skill.key.localeCompare(b.skill.key);
  };

  function findFollowUpSkill(
    stateAfterSkill: CraftingState,
    depthToSearch: number,
    depthIndex: number,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    useDeepLookahead: boolean = false,
  ): SkillRecommendation['followUpSkill'] | undefined {
    if (targetsMetForCurrentMode(stateAfterSkill)) {
      return undefined;
    }
    if (
      isTerminalState(stateAfterSkill, config, conditionAtDepth) &&
      !getFinishAction(stateAfterSkill)
    ) {
      return undefined;
    }

    const followUpConditionEffects = getConditionEffectsForConfig(
      config,
      conditionAtDepth,
    );
    const skills = getAvailableSkills(
      stateAfterSkill,
      config,
      conditionAtDepth,
    );
    const maxRemainingDepth = Math.max(0, depthToSearch - depthIndex);
    const cachedBestMove = getCachedBestMoveKey(
      acceptedCache,
      stateAfterSkill,
      conditionAtDepth,
      nextConditionQueueAtDepth,
      maxRemainingDepth,
    );
    if (cachedBestMove) {
      if (cachedBestMove === FINISH_CRAFT_KEY) {
        const finishAction = getFinishAction(stateAfterSkill);
        if (finishAction) {
          return {
            name: finishAction.skill.name,
            type: finishAction.skill.type,
            actionKind: finishAction.skill.actionKind,
            icon: finishAction.skill.icon,
            expectedGains: { ...ZERO_GAINS },
            immediateGains: { ...ZERO_GAINS },
            effectiveCosts: { ...ZERO_COSTS },
            projectedSuccessChance: finishAction.projectedSuccessChance,
          };
        }
      }

      const cachedSkill = skills.find((skill) => skill.key === cachedBestMove);
      if (cachedSkill) {
        const { expectedGains, immediateGains, effectiveCosts } =
          calculateRecommendationGains(
            stateAfterSkill,
            cachedSkill,
            config,
            followUpConditionEffects,
          );
        return {
          name: cachedSkill.name,
          type: cachedSkill.type,
          actionKind: cachedSkill.actionKind,
          icon: cachedSkill.icon,
          expectedGains,
          immediateGains,
          effectiveCosts,
        };
      }
    }

    const orderedFollowUpCandidates = buildOrderedMoveCandidates(
      stateAfterSkill,
      Math.max(1, maxRemainingDepth),
      conditionAtDepth,
      nextConditionQueueAtDepth,
      followUpConditionEffects,
    );
    if (orderedFollowUpCandidates.length === 0) {
      return undefined;
    }

    if (!useDeepLookahead || maxRemainingDepth <= 0) {
      const fallbackCandidate = orderedFollowUpCandidates[0];
      const followUpSkill = fallbackCandidate.skill;
      const finishProjectedSuccessChance = isFinishAction(followUpSkill)
        ? fallbackCandidate.projectedSuccessChance
        : undefined;
      const { expectedGains, immediateGains, effectiveCosts } = isFinishAction(
        followUpSkill,
      )
        ? {
            expectedGains: { ...ZERO_GAINS },
            immediateGains: { ...ZERO_GAINS },
            effectiveCosts: { ...ZERO_COSTS },
          }
        : calculateRecommendationGains(
            stateAfterSkill,
            followUpSkill,
            config,
            followUpConditionEffects,
          );
      return {
        name: followUpSkill.name,
        type: followUpSkill.type,
        actionKind: followUpSkill.actionKind,
        icon: followUpSkill.icon,
        expectedGains,
        immediateGains,
        effectiveCosts,
        projectedSuccessChance: finishProjectedSuccessChance,
      };
    }

    let bestFollowUp: SkillDefinition | null = null;
    let bestFollowUpCandidate: SearchMoveCandidate | null = null;
    let bestFollowUpScore = -Infinity;
    let bestFollowUpExpectedGains: GainPreview = {
      completion: 0,
      perfection: 0,
      stability: 0,
    };
    let bestFollowUpImmediateGains: GainPreview = {
      completion: 0,
      perfection: 0,
      stability: 0,
    };
    let bestFollowUpEffectiveCosts: ActionCostPreview = {
      qi: 0,
      stability: 0,
    };
    let bestFollowUpSuccessChance: number | undefined = undefined;

    for (const candidate of orderedFollowUpCandidates) {
      const followUp = candidate.skill;
      const nextState = candidate.searchState;

      const { expectedGains, immediateGains, effectiveCosts } = isFinishAction(
        followUp,
      )
        ? {
            expectedGains: { ...ZERO_GAINS },
            immediateGains: { ...ZERO_GAINS },
            effectiveCosts: { ...ZERO_COSTS },
          }
        : calculateRecommendationGains(
            stateAfterSkill,
            followUp,
            config,
            followUpConditionEffects,
          );
      const followUpScore = evaluateFutureScoreAfterSkill(
        nextState,
        Math.max(0, depthToSearch - 1 - depthIndex),
        depthIndex + 1,
        conditionAtDepth,
        nextConditionQueueAtDepth,
        followUp,
      );

      const scoreDelta = followUpScore - bestFollowUpScore;
      const isClearImprovement = scoreDelta > scoreTieWindow;
      const isScoreTie =
        Math.abs(scoreDelta) <= scoreTieWindow && bestFollowUpCandidate;
      const winsTie =
        isScoreTie &&
        compareMoveCandidatesForTie(
          candidate,
          bestFollowUpCandidate!,
          stateAfterSkill,
        ) > 0;

      if (isClearImprovement || winsTie || bestFollowUpCandidate === null) {
        bestFollowUpScore = followUpScore;
        bestFollowUp = followUp;
        bestFollowUpCandidate = candidate;
        bestFollowUpExpectedGains = expectedGains;
        bestFollowUpImmediateGains = immediateGains;
        bestFollowUpEffectiveCosts = effectiveCosts;
        bestFollowUpSuccessChance = candidate.projectedSuccessChance;
      }
    }

    if (!bestFollowUp) {
      return undefined;
    }

    return {
      name: bestFollowUp.name,
      type: bestFollowUp.type,
      actionKind: bestFollowUp.actionKind,
      icon: bestFollowUp.icon,
      expectedGains: bestFollowUpExpectedGains,
      immediateGains: bestFollowUpImmediateGains,
      effectiveCosts: bestFollowUpEffectiveCosts,
      projectedSuccessChance: bestFollowUpSuccessChance,
    };
  }

  function evaluateFirstMoves(
    depthToSearch: number,
    useDeepSearch: boolean,
  ): {
    recommendations: SkillRecommendation[];
    unsafeRecommendationKeys: Set<string>;
    completed: boolean;
    evaluatedDepth: number;
  } {
    const currentConditionEffects = getConditionEffectsForConfig(
      config,
      normalizedCurrentCondition,
    );
    const rootAvailableSkills = getAvailableSkills(
      state,
      config,
      normalizedCurrentCondition,
    );
    const hasGuaranteedSafeStabilize = hasGuaranteedSafeStabilizeAction(
      state,
      rootAvailableSkills,
      config,
      currentConditionEffects,
      normalizedCurrentCondition,
    );
    const minimumGuaranteedContinuationStability = hasGuaranteedSafeStabilize
      ? Math.max(1, scoringCtx.avgStabilityCostPerTurn)
      : 0;
    const orderedCandidates = buildOrderedMoveCandidates(
      state,
      depthToSearch,
      normalizedCurrentCondition,
      initialConditionQueue,
      currentConditionEffects,
      true,
    );
    const evaluatedFirstMoves: Array<
      SkillRecommendation & UnsafeCandidateClassification
    > = [];
    const unsafeRecommendationKeys = new Set<string>();

    // First pass: evaluate ALL first-level skills with basic scoring
    // This ensures we always have alternatives even if deep search times out
    for (const candidate of orderedCandidates) {
      const skill = candidate.skill;
      const newState = candidate.searchState;
      if (candidate.unsafeWithGuaranteedSafeAlternative) {
        unsafeRecommendationKeys.add(skill.key);
      }

      const { expectedGains, immediateGains, effectiveCosts } = isFinishAction(
        skill,
      )
        ? {
            expectedGains: { ...ZERO_GAINS },
            immediateGains: { ...ZERO_GAINS },
            effectiveCosts: { ...ZERO_COSTS },
          }
        : calculateRecommendationGains(
            state,
            skill,
            config,
            currentConditionEffects,
          );
      const reasoning = isFinishAction(skill)
        ? generateFinishReasoning(candidate.projectedSuccessChance ?? 0)
        : generateReasoning(
            skill,
            state,
            immediateGains,
            targetCompletion,
            targetPerfection,
          );
      const firstMoveConditionState = getMostLikelyConditionStateAfterSkill(
        newState,
        normalizedCurrentCondition,
        initialConditionQueue,
        skill,
      );
      const terminalState = isFinishAction(skill)
        ? { isTerminal: false, isTerminalUnmet: false }
        : classifyTerminalState(
            newState,
            config,
            firstMoveConditionState.nextCondition,
            modeCompGoal,
            modePerfGoal,
          );

      const immediateScore = isFinishAction(skill)
        ? candidate.orderingScore
        : estimatePostMoveStateScore(
            newState,
            skill,
            normalizedCurrentCondition,
            initialConditionQueue,
          );

      evaluatedFirstMoves.push({
        skill,
        expectedGains,
        immediateGains,
        effectiveCosts,
        score: immediateScore,
        reasoning,
        consumesBuff: skill.isDisciplinedTouch === true,
        followUpSkill: undefined,
        projectedSuccessChance: candidate.projectedSuccessChance,
        endsCraft: isFinishAction(skill) || terminalState.isTerminal,
        requiresProbabilisticSurvival: candidate.requiresProbabilisticSurvival,
        ...terminalState,
      });
    }

    const scored: SkillRecommendation[] = filterUnfinishedTerminalCandidates(
      evaluatedFirstMoves,
    ).map(({ isTerminal, isTerminalUnmet, ...rec }) => rec);
    unsafeRootRecommendationKeys = unsafeRecommendationKeys;

    if (!useDeepSearch || depthToSearch <= 1) {
      scored.sort(compareRecommendations);
      return {
        recommendations: scored,
        unsafeRecommendationKeys,
        completed: true,
        evaluatedDepth: Math.min(1, depthToSearch),
      };
    }

    // Second pass: enhance scores with deep lookahead if budget allows.
    // Follow-up generation stays out of the critical path so recommendation
    // budget is spent on first-move ranking, not auxiliary UI details.
    scored.sort(compareRecommendations);
    const deepenedRecommendations = scored.map((rec) => ({ ...rec }));

    for (const rec of deepenedRecommendations) {
      if (checkBudget()) {
        break;
      }

      const displayState = applySkill(
        state,
        rec.skill,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );
      if (displayState === null) continue;
      const { searchState } = buildSearchStateForContinuation(
        state,
        rec.skill,
        displayState,
        currentConditionEffects,
        normalizedCurrentCondition,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      );

      rec.score = evaluateFutureScoreAfterSkill(
        searchState,
        Math.max(0, depthToSearch - 1),
        1,
        normalizedCurrentCondition,
        initialConditionQueue,
        rec.skill,
      );
    }

    if (shouldTerminate) {
      return {
        recommendations: scored,
        unsafeRecommendationKeys,
        completed: false,
        evaluatedDepth: 1,
      };
    }

    deepenedRecommendations.sort(compareRecommendations);

    return {
      recommendations: deepenedRecommendations,
      unsafeRecommendationKeys,
      completed: true,
      evaluatedDepth: depthToSearch,
    };
  }

  function populateFollowUpSkills(
    recommendations: SkillRecommendation[],
    depthToSearch: number,
  ): void {
    if (recommendations.length === 0) {
      return;
    }

    const currentConditionEffects = getConditionEffectsForConfig(
      config,
      normalizedCurrentCondition,
    );
    const fallbackFollowUpCount = 3;

    for (
      let index = 0;
      index < Math.min(fallbackFollowUpCount, recommendations.length);
      index++
    ) {
      const rec = recommendations[index];
      if (isFinishAction(rec.skill)) {
        rec.followUpSkill = undefined;
        continue;
      }
      const displayStateAfterSkill = applySkill(
        state,
        rec.skill,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );
      if (displayStateAfterSkill === null) {
        continue;
      }
      const { searchState: stateAfterSkill } = buildSearchStateForContinuation(
        state,
        rec.skill,
        displayStateAfterSkill,
        currentConditionEffects,
        normalizedCurrentCondition,
        false,
      );

      const followUpConditionState = getMostLikelyConditionStateAfterSkill(
        stateAfterSkill,
        normalizedCurrentCondition,
        initialConditionQueue,
        rec.skill,
      );
      const canUseDeepLookahead = index === 0 && !checkBudget();
      rec.followUpSkill = findFollowUpSkill(
        stateAfterSkill,
        depthToSearch,
        1,
        followUpConditionState.nextCondition,
        followUpConditionState.nextQueue,
        canUseDeepLookahead,
      );
    }
  }

  const depthPlan = (() => {
    if (!cfg.useIterativeDeepening || depth <= 1) {
      return [depth];
    }
    const minDepth = Math.max(
      1,
      Math.min(cfg.iterativeDeepeningMinDepth, depth),
    );
    const depths: number[] = [];
    for (let d = minDepth; d <= depth; d++) {
      depths.push(d);
    }
    return depths;
  })();

  const baselineDepth = depth > 0 ? 1 : 0;
  const baselineResult = evaluateFirstMoves(baselineDepth, false);
  let usedDepth = baselineResult.evaluatedDepth;
  let scoredSkills: SkillRecommendation[] = baselineResult.recommendations;
  unsafeRootRecommendationKeys = baselineResult.unsafeRecommendationKeys;

  if (baselineResult.recommendations.length > 0) {
    metrics.depthReached = baselineResult.evaluatedDepth;
  }

  for (const candidateDepth of depthPlan) {
    if (candidateDepth <= baselineDepth) {
      continue;
    }
    if (checkBudget()) break;
    const candidateResult = evaluateFirstMoves(candidateDepth, true);
    const candidateSkills = candidateResult.recommendations;
    const candidateUnsafeKeys = candidateResult.unsafeRecommendationKeys;
    const iterationCompleted = candidateResult.completed;
    const evaluatedDepth = candidateResult.evaluatedDepth;

    // Preserve the last fully completed iteration. A deeper pass that hits a
    // budget limit mid-evaluation is only a partial frontier and should not
    // overwrite a fully completed shallower pass.
    if (iterationCompleted && candidateSkills.length > 0) {
      scoredSkills = candidateSkills;
      unsafeRootRecommendationKeys = candidateUnsafeKeys;
      usedDepth = evaluatedDepth;
      acceptedCache = new Map(cache);
      metrics.depthReached = evaluatedDepth;
    }

    if (shouldTerminate) {
      break;
    }
  }

  if (metrics.depthReached === 0) {
    metrics.depthReached = usedDepth;
  }

  if (scoredSkills.length === 0) {
    metrics.timeTakenMs = Date.now() - startTime;
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
      blockedReasons: getBlockedSkillReasons(
        state,
        config,
        normalizedCurrentCondition,
      ),
      searchMetrics: metrics,
    };
  }

  // Calculate quality ratings (0-100) based on score difference from best
  const bestScore = scoredSkills[0].score;
  const worstScore =
    scoredSkills.length > 1
      ? scoredSkills[scoredSkills.length - 1].score
      : bestScore;
  const scoreRange = bestScore - worstScore;

  for (const rec of scoredSkills) {
    if (scoreRange > 0) {
      rec.qualityRating = Math.round(
        ((rec.score - worstScore) / scoreRange) * 100,
      );
    } else {
      rec.qualityRating = 100; // All skills are equally good
    }
  }

  const rankedSkills = rankRecommendations(
    scoredSkills,
    scoreTieWindow,
    unsafeRootRecommendationKeys,
    (a, b) => {
      const mctsPolicyTie = compareRootMctsPolicyTie(a.skill.key, b.skill.key);
      if (mctsPolicyTie !== 0) {
        return mctsPolicyTie;
      }
      return compareTieBreakMetrics(
        getRecommendationTieMetrics(a),
        getRecommendationTieMetrics(b),
      );
    },
  );
  populateFollowUpSkills(rankedSkills, usedDepth);

  // Find the optimal rotation starting from the best first move
  const bestFirstMove = rankedSkills[0].skill;
  const currentConditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCurrentCondition,
  );
  const stateAfterFirstMoveDisplay = isFinishAction(bestFirstMove)
    ? state
    : applySkill(
        state,
        bestFirstMove,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );

  let optimalRotation: string[] = [bestFirstMove.name];
  let expectedFinalState: SearchResult['expectedFinalState'] = undefined;

  if (stateAfterFirstMoveDisplay) {
    const { searchState: stateAfterFirstMove } =
      buildSearchStateForContinuation(
        state,
        bestFirstMove,
        stateAfterFirstMoveDisplay,
        currentConditionEffects,
        normalizedCurrentCondition,
        false,
      );
    const firstMoveConditionState = getMostLikelyConditionStateAfterSkill(
      stateAfterFirstMove,
      normalizedCurrentCondition,
      initialConditionQueue,
      bestFirstMove,
    );
    const finishedByChoice = isFinishAction(bestFirstMove);
    const {
      path,
      finalState,
      finishedByChoice: pathFinishedByChoice,
    } = finishedByChoice
      ? {
          path: [] as string[],
          finalState: stateAfterFirstMove,
          finishedByChoice: true,
        }
      : findOptimalPath(
          stateAfterFirstMove,
          Math.max(0, usedDepth - 1),
          1,
          firstMoveConditionState.nextCondition,
          firstMoveConditionState.nextQueue,
        );
    optimalRotation = [bestFirstMove.name, ...path];

    // Ensure the top recommendation's follow-up matches the rotation.
    // findFollowUpSkill may diverge from the rotation under budget pressure
    // (shallow fallback), but the rotation uses cache-probed bestMove entries
    // which are more authoritative.  If the rotation's second move differs
    // from the current follow-up, update it.
    if (path.length > 0) {
      const rotationSecondSkillName = path[0];
      const topRec = rankedSkills[0];
      if (
        topRec &&
        topRec.skill.key === bestFirstMove.key &&
        (!topRec.followUpSkill ||
          topRec.followUpSkill.name !== rotationSecondSkillName)
      ) {
        const secondSkill = config.skills.find(
          (s) => s.name === rotationSecondSkillName,
        );
        if (rotationSecondSkillName === FINISH_CRAFT_NAME) {
          topRec.followUpSkill = {
            name: FINISH_CRAFT_NAME,
            type: FINISH_CRAFT_SKILL.type,
            actionKind: FINISH_CRAFT_SKILL.actionKind,
            icon: FINISH_CRAFT_SKILL.icon,
            expectedGains: { ...ZERO_GAINS },
            immediateGains: { ...ZERO_GAINS },
            effectiveCosts: { ...ZERO_COSTS },
            projectedSuccessChance:
              getFinishAction(stateAfterFirstMove)?.projectedSuccessChance,
          };
        } else if (secondSkill) {
          const secondConditionEffects = getConditionEffectsForConfig(
            config,
            firstMoveConditionState.nextCondition,
          );
          const { expectedGains, immediateGains, effectiveCosts } =
            calculateRecommendationGains(
              stateAfterFirstMove,
              secondSkill,
              config,
              secondConditionEffects,
            );
          topRec.followUpSkill = {
            name: secondSkill.name,
            type: secondSkill.type,
            actionKind: secondSkill.actionKind,
            icon: secondSkill.icon,
            expectedGains,
            immediateGains,
            effectiveCosts,
          };
        }
      }
    }

    // Calculate turns remaining (estimate based on progress needed)
    const compRemaining = Math.max(
      0,
      effectiveCompGoal - finalState.completion,
    );
    const perfRemaining = Math.max(
      0,
      effectivePerfGoal - finalState.perfection,
    );
    const totalRemaining = compRemaining + perfRemaining;
    const compNeedShare =
      totalRemaining > 0 ? compRemaining / totalRemaining : 0.5;
    const perfNeedShare =
      totalRemaining > 0 ? perfRemaining / totalRemaining : 0.5;
    const projectedSuccessChance =
      finalState.stability > 0
        ? calculateFinishSuccessChance(finalState, targetCompletion)
        : 0;
    const turnsRemaining =
      finishedByChoice || pathFinishedByChoice
        ? 0
        : estimateTurnsRemainingFromContext(
            compRemaining,
            perfRemaining,
            compNeedShare,
            perfNeedShare,
            scoringCtx,
          );

    expectedFinalState = {
      completion: finalState.completion,
      perfection: finalState.perfection,
      stability: finalState.stability,
      maxStability: finalState.maxStability,
      qi: finalState.qi,
      turnsRemaining: turnsRemaining > 0 ? turnsRemaining : 0,
      projectedSuccessChance,
    };
  }

  // Record final metrics
  metrics.timeTakenMs = Date.now() - startTime;

  return {
    recommendation: rankedSkills[0],
    alternativeSkills: rankedSkills.slice(1),
    isTerminal: false,
    targetsMet: false,
    optimalRotation,
    expectedFinalState,
    searchMetrics: metrics,
  };
}

/**
 * Type for crafting conditions (matches game's CraftingCondition type)
 */
export type CraftingConditionType = string;

/**
 * Main optimizer function - uses lookahead by default.
 *
 * @param state - Current crafting state
 * @param config - Optimizer config with character stats and skills (from game)
 * @param targetCompletion - Target completion value (from recipe)
 * @param targetPerfection - Target perfection value (from recipe)
 * @param useGreedy - Use greedy search instead of lookahead
 * @param lookaheadDepth - How many moves to look ahead
 * @param currentConditionType - Current condition type for skill filtering (e.g., 'veryPositive')
 * @param forecastedConditionTypes - Array of upcoming condition types for skill filtering
 * @param searchConfig - Optional search configuration for performance tuning
 */
export function findBestSkill(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  useGreedy: boolean = false,
  lookaheadDepth: number = 3,
  currentConditionType?: CraftingConditionType,
  forecastedConditionTypes: CraftingConditionType[] = [],
  searchConfig: Partial<SearchConfig> = {},
): SearchResult {
  if (useGreedy) {
    return greedySearch(
      state,
      config,
      targetCompletion,
      targetPerfection,
      currentConditionType,
      searchConfig,
    );
  }

  return lookaheadSearch(
    state,
    config,
    targetCompletion,
    targetPerfection,
    lookaheadDepth,
    currentConditionType,
    forecastedConditionTypes,
    searchConfig,
  );
}

// Internals exposed for isolated unit testing only — not part of the public API.
export const __testing = {
  scoreState,
  scoreFinishedOutcome,
  calculateFinishSuccessChance,
  evaluateCraftEndOutcomeDistribution,
  evaluateHarmonySubsystemQuality,
  getProgressTowardRawGoal,
  getThresholdForGuaranteedBonusCount,
  buildScoringContext,
  SCORING,
} as const;
