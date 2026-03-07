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
};

const TERMINAL_UNMET_PENALTY_MULTIPLIER = 4;
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
  /** Average gain per progress turn (max of intensity, control stats). */
  avgGainPerTurn: number;
  /** Average qi cost per progress turn, from available skills. */
  avgQiCostPerTurn: number;
}

/** Default scoring context used when callers don't provide one. */
const DEFAULT_SCORING_CONTEXT: ScoringContext = {
  avgStabilityCostPerTurn: 10,
  avgGainPerTurn: 16,
  avgQiCostPerTurn: 0,
};

/**
 * Build a ScoringContext from actual config values.
 * Callers that have access to OptimizerConfig should use this instead of
 * relying on DEFAULT_SCORING_CONTEXT.
 */
function buildScoringContext(config: OptimizerConfig): ScoringContext {
  const intensity = config.baseIntensity || 12;
  const control = config.baseControl || 16;
  const avgGainPerTurn = Math.max(1, intensity, control);

  // Compute average stability cost from the config's skill list.
  // Only consider turn-consuming skills that produce completion or perfection.
  const skills = config.skills || [];
  let totalStabCost = 0;
  let totalQiCost = 0;
  let count = 0;
  for (const skill of skills) {
    if (skill.type === 'stabilize' || skill.type === 'support') continue;
    const hasProgress =
      (skill.baseCompletionGain || 0) > 0 ||
      (skill.basePerfectionGain || 0) > 0;
    if (!hasProgress) continue;
    if (skill.stabilityCost > 0) {
      totalStabCost += skill.stabilityCost;
    }
    totalQiCost += Math.max(0, skill.qiCost || 0);
    count++;
  }
  const avgStabilityCostPerTurn = count > 0 ? totalStabCost / count : 10;
  const avgQiCostPerTurn = count > 0 ? totalQiCost / count : 0;

  return { avgStabilityCostPerTurn, avgGainPerTurn, avgQiCostPerTurn };
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
  if (candidates.length <= 1) {
    return candidates;
  }

  const hasSurvivableCandidate = candidates.some(
    (candidate) => !candidate.isTerminal,
  );
  if (!hasSurvivableCandidate) {
    return candidates;
  }

  const filtered = candidates.filter((candidate) => !candidate.isTerminalUnmet);
  return filtered.length > 0 ? filtered : candidates;
}

function applyTerminalUnmetPenalty(
  baseScore: number,
  totalTargetMagnitude: number,
): number {
  // Preserve meaningful differences between unfinished terminal branches,
  // especially on large-target sublime crafts, while still making any
  // "craft ended before goals were met" state materially worse.
  return baseScore - totalTargetMagnitude * TERMINAL_UNMET_PENALTY_MULTIPLIER;
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

/**
 * Evaluate the quality of the current harmony sub-system state.
 *
 * Returns a value in [-1, +1] representing how productive the current
 * harmony sub-system state is for making progress:
 *   +1  = optimal (e.g., forge heat 4-6: both stats get 1.5×)
 *    0  = neutral (no harmony data, or modifiers are all 1×)
 *   -1  = terrible (e.g., forge heat 0: control is -9×)
 *
 * Uses the actual stat modifiers from `getHarmonyStatModifiers` so this
 * works for all harmony types (forge, alchemical, inscription, resonance)
 * without hardcoding sub-system-specific logic.
 */
function evaluateHarmonySubsystemQuality(
  harmonyData: NonNullable<CraftingState['harmonyData']>,
): number {
  // Forge works: use heat-based modifiers directly.
  if (harmonyData.forgeWorks) {
    const heat = harmonyData.forgeWorks.heat;
    const mods = getHarmonyStatModifiers(harmonyData, 'forge');
    // Average the two key multipliers.  At heat 4-6 both are 1.5,
    // at heat 0 control is -9 (intensity 1), at heat 10 intensity is -9.
    const avgMult = (mods.controlMultiplier + mods.intensityMultiplier) / 2;
    // Map: avgMult=1.5 → +1, avgMult=1.0 → 0, avgMult≤0 → -1
    if (avgMult >= 1.5) return 1;
    if (avgMult <= 0) return -1;
    // Linear interpolation between 0 and 1.5
    return (avgMult - 1) / 0.5; // 1.0→0, 1.25→0.5, 1.5→1.0
  }

  // Inscription: stacks provide a scaling bonus.
  if (harmonyData.inscribedPatterns) {
    const mods = getHarmonyStatModifiers(harmonyData, 'inscription');
    return Math.min(1, (mods.controlMultiplier - 1) * 5);
  }

  // Alchemical / Resonance: use generic modifier averaging.
  // These systems have more complex state but the modifier quality
  // still captures whether the current state is productive.
  const harmonyType = harmonyData.alchemicalArts
    ? ('alchemical' as const)
    : harmonyData.resonance
      ? ('resonance' as const)
      : undefined;
  if (harmonyType) {
    const mods = getHarmonyStatModifiers(harmonyData, harmonyType);
    const avgMult = (mods.controlMultiplier + mods.intensityMultiplier) / 2;
    if (avgMult >= 1.5) return 1;
    if (avgMult <= 0) return -1;
    return (avgMult - 1) / 0.5;
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

  // ── remaining work metrics ───────────────────────────────────────────
  const compRemaining =
    effectiveCompGoal > 0
      ? Math.max(0, effectiveCompGoal - state.completion)
      : 0;
  const perfRemaining =
    effectivePerfGoal > 0
      ? Math.max(0, effectivePerfGoal - state.perfection)
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
  const estimatedTurnsRemaining =
    totalRemaining > 0 ? Math.ceil(totalRemaining / ctx.avgGainPerTurn) : 0;
  const stepPenaltyWeight = Math.max(
    SCORING.STEP_PENALTY,
    ctx.avgGainPerTurn * 0.25,
  );

  // ── 1. progress score (primary) ──────────────────────────────────────
  const compProgress =
    effectiveCompGoal > 0 ? Math.min(state.completion, effectiveCompGoal) : 0;
  const perfProgress =
    effectivePerfGoal > 0 ? Math.min(state.perfection, effectivePerfGoal) : 0;
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
    compProgress * completionWeight + perfProgress * perfectionWeight;

  // ── 2. target-met bonus (scaled to target magnitude) ─────────────────
  const totalTargetMagnitude = Math.max(
    1,
    effectiveCompGoal + effectivePerfGoal,
  );
  const targetMetBonus = totalTargetMagnitude * SCORING.TARGET_MET_MULTIPLIER;

  const baseTargetsMet =
    (targetCompletion <= 0 || state.completion >= targetCompletion) &&
    (targetPerfection <= 0 || state.perfection >= targetPerfection);
  const sublimeTargetsMet =
    isSublimeCraft &&
    (effectiveCompTarget <= 0 || state.completion >= effectiveCompTarget) &&
    (effectivePerfTarget <= 0 || state.perfection >= effectivePerfTarget);

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
      const compBeyondBase = Math.max(0, state.completion - targetCompletion);
      const perfBeyondBase = Math.max(0, state.perfection - targetPerfection);
      score +=
        (compBeyondBase + perfBeyondBase) * SCORING.SUBLIME_BEYOND_BASE_WEIGHT;
    }
  } else {
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
      const estimatedQiNeeded = estimatedTurnsRemaining * ctx.avgQiCostPerTurn;
      const qiShortfall = Math.max(0, estimatedQiNeeded - state.qi);
      if (qiShortfall > 0) {
        const turnsShortByQi = qiShortfall / ctx.avgQiCostPerTurn;
        score -= turnsShortByQi * ctx.avgGainPerTurn;
      }
    }

    score +=
      state.stability *
      (SCORING.STABILITY_BASE_WEIGHT +
        remainingWorkPct * SCORING.STABILITY_WORK_WEIGHT);

    // Step efficiency: prefer shorter paths to target completion.
    // Without this, the tree search sees no cost to "stabilize now,
    // progress later" vs "progress now", which can cause stabilize
    // spirals where the optimizer delays progress indefinitely.
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
  // When targets are already met, the craft is done — stability penalties
  // should not apply because we don't need any more turns.  This prevents
  // the optimizer from preferring Stabilize over an immediate finishing move.
  if (!baseTargetsMet) {
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
      (thresholdBase + remainingWorkPct * thresholdScale) *
      ctx.avgStabilityCostPerTurn;

    const penaltyFraction = trainingMode
      ? SCORING.STABILITY_PENALTY_FRACTION_TRAINING
      : SCORING.STABILITY_PENALTY_FRACTION;
    const penaltyFloor = trainingMode
      ? SCORING.STABILITY_PENALTY_FLOOR_TRAINING
      : SCORING.STABILITY_PENALTY_FLOOR;
    const stabilityPenaltyWeight = Math.max(
      penaltyFloor,
      totalTargetMagnitude * penaltyFraction,
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
    if (estimatedTurnsRemaining > estimatedRunwayTurns) {
      const gap = estimatedTurnsRemaining - estimatedRunwayTurns;
      const gapFraction = trainingMode
        ? SCORING.RUNWAY_GAP_FRACTION_TRAINING
        : SCORING.RUNWAY_GAP_FRACTION;
      score -= gap * totalTargetMagnitude * gapFraction;
    }
  }

  // ── 7. toxicity & harmony ──────────────────────────────────────────
  if (state.maxToxicity > 0 && state.hasDangerousToxicity()) {
    score -= totalTargetMagnitude * SCORING.TOXICITY_PENALTY_FRACTION;
  }
  if (isSublimeCraft) {
    score += state.harmony * SCORING.HARMONY_BONUS_WEIGHT;

    // Harmony sub-system quality: value being in a productive harmony
    // state (e.g., forge heat 4-6 where both stats get 1.5×) vs a
    // terrible one (heat 0 where control is -9×, or heat 10 where
    // intensity is -9×).  This lets the tree search see that fusion
    // now (raising heat from 0→2) enables future refine, even though
    // fusion itself doesn't advance perfection.
    if (!baseTargetsMet && state.harmonyData) {
      const quality = evaluateHarmonySubsystemQuality(state.harmonyData);
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
  const totalTargetMagnitude = Math.max(
    1,
    effectiveCompGoal + effectivePerfGoal,
  );
  const remainingCompletion = Math.max(0, effectiveCompGoal - state.completion);
  const remainingPerfection = Math.max(0, effectivePerfGoal - state.perfection);
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
    ctx.avgGainPerTurn * 0.25,
  );

  let score =
    Math.min(Math.max(0, state.completion), Math.max(0, effectiveCompGoal)) *
      completionWeight +
    Math.min(Math.max(0, state.perfection), Math.max(0, effectivePerfGoal)) *
      perfectionWeight;

  const targetMetBonus = totalTargetMagnitude * SCORING.TARGET_MET_MULTIPLIER;
  const baseTargetsMet =
    (targetCompletion <= 0 || state.completion >= targetCompletion) &&
    (targetPerfection <= 0 || state.perfection >= targetPerfection);
  const sublimeTargetsMet =
    isSublimeCraft &&
    (effectiveCompTarget <= 0 || state.completion >= effectiveCompTarget) &&
    (effectivePerfTarget <= 0 || state.perfection >= effectivePerfTarget);

  if (sublimeTargetsMet) {
    score += targetMetBonus * SCORING.SUBLIME_MET_EXTRA;
  } else if (baseTargetsMet) {
    score += targetMetBonus;
    if (isSublimeCraft) {
      score +=
        (Math.max(0, state.completion - targetCompletion) +
          Math.max(0, state.perfection - targetPerfection)) *
        SCORING.SUBLIME_BEYOND_BASE_WEIGHT;
    }
  }

  if (!isSublimeCraft) {
    const normalCompLimit =
      maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)
        ? Math.min(targetCompletion, maxCompletionCap)
        : targetCompletion;
    const normalPerfLimit =
      maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)
        ? Math.min(targetPerfection, maxPerfectionCap)
        : targetPerfection;
    score -=
      Math.max(0, state.completion - Math.max(0, normalCompLimit)) *
        SCORING.OVERSHOOT_PENALTY_WEIGHT +
      Math.max(0, state.perfection - Math.max(0, normalPerfLimit)) *
        SCORING.OVERSHOOT_PENALTY_WEIGHT;
  } else {
    score -=
      Math.max(0, state.completion - Math.max(0, effectiveCompGoal)) *
        SCORING.OVERSHOOT_PENALTY_WEIGHT +
      Math.max(0, state.perfection - Math.max(0, effectivePerfGoal)) *
        SCORING.OVERSHOOT_PENALTY_WEIGHT;
  }

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

  score -= state.step * stepPenaltyWeight;

  return score;
}

function calculateFinishSuccessChance(
  state: CraftingState,
  targetCompletion: number,
): number {
  if (!Number.isFinite(targetCompletion) || targetCompletion <= 0) {
    return 1;
  }
  if (!Number.isFinite(state.completion) || state.completion <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, state.completion / targetCompletion));
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
  const expected = calculateSkillGains(state, skill, config, conditionEffects);
  const immediate = calculateSkillGains(
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
  projectedSuccessChance?: number;
}

function applySurvivabilityFloorToState(
  displayState: CraftingState,
  survivabilityFloor:
    | ReturnType<typeof calculateActionSurvivabilityFloor>
    | null,
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

function rankRecommendations(
  scored: SkillRecommendation[],
  scoreTieWindow: number = 0,
): SkillRecommendation[] {
  if (scored.length <= 1) {
    return scored;
  }

  const sorted = [...scored].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > scoreTieWindow) {
      return scoreDiff;
    }

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
  const scoringCtx = buildScoringContext(config);
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
      score:
        projectedSuccessChance *
        scoreFinishedOutcome(
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

  const availableSkills = getAvailableSkills(
    state,
    config,
    normalizedCurrentCondition,
  );
  const evaluatedMoves: Array<
    SkillRecommendation & UnsafeCandidateClassification
  > = [];

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
    const goalsMetAfterAction = goalsMet(displayState, modeCompGoal, modePerfGoal);
    const survivabilityFloor = calculateActionSurvivabilityFloor(
      state,
      skill,
      config,
      conditionEffects,
      normalizedCurrentCondition,
    );
    const requiresProbabilisticSurvival =
      !goalsMetAfterAction &&
      state.stability <= SCORING.NEAR_DEATH_STABILITY &&
      displayState.stability > 0 &&
      (survivabilityFloor?.stability ?? displayState.stability) <= 0;
    const newState = requiresProbabilisticSurvival
      ? applySurvivabilityFloorToState(displayState, survivabilityFloor)
      : displayState;

    const { expectedGains, immediateGains, effectiveCosts } =
      calculateRecommendationGains(state, skill, config, conditionEffects);
    const score = scoreState(
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
    const terminalState = classifyTerminalState(
      newState,
      config,
      normalizedCurrentCondition,
      modeCompGoal,
      modePerfGoal,
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

  const rankedSkills = rankRecommendations(scoredSkills, scoreTieWindow);

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
  const metrics = {
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
  const scoringCtx = buildScoringContext(config);
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
  const targetsMetForCurrentMode = (candidate: CraftingState): boolean =>
    goalsMet(candidate, modeCompGoal, modePerfGoal);
  const compareMoveCandidatesForTie = (
    a: SearchMoveCandidate,
    b: SearchMoveCandidate,
    currentState: CraftingState,
  ): number => {
    const progressDiff = a.immediateProgress - b.immediateProgress;
    if (progressDiff !== 0) {
      return progressDiff;
    }

    const aIsStabilize = a.skill.type === 'stabilize';
    const bIsStabilize = b.skill.type === 'stabilize';
    if (aIsStabilize !== bIsStabilize) {
      return aIsStabilize ? -1 : 1;
    }

    if (
      a.requiresProbabilisticSurvival !== b.requiresProbabilisticSurvival
    ) {
      return a.requiresProbabilisticSurvival ? -1 : 1;
    }

    const qiSpentA = Math.max(0, currentState.qi - a.nextState.qi);
    const qiSpentB = Math.max(0, currentState.qi - b.nextState.qi);
    if (qiSpentA !== qiSpentB) {
      return qiSpentB - qiSpentA;
    }

    return b.skill.key.localeCompare(a.skill.key);
  };
  const scoreStateWithTerminalPenalty = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
  ): number => {
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
      baseScore +=
        (conditionedPotential - neutralPotential) * scoringCtx.avgGainPerTurn;
    }

    const { isTerminalUnmet } = classifyTerminalState(
      candidate,
      config,
      conditionAtDepth,
      modeCompGoal,
      modePerfGoal,
    );
    return isTerminalUnmet
      ? applyTerminalUnmetPenalty(
          baseScore,
          Math.max(1, effectiveCompGoal + effectivePerfGoal),
        )
      : baseScore;
  };
  const buildSearchStateForContinuation = (
    currentState: CraftingState,
    skill: SkillDefinition,
    displayState: CraftingState,
    conditionEffectsAtDepth: ReturnType<typeof getConditionEffectsForConfig>,
    currentConditionAtDepth: CraftingConditionType,
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
    const survivabilityFloor = calculateActionSurvivabilityFloor(
      currentState,
      skill,
      config,
      conditionEffectsAtDepth,
      currentConditionAtDepth,
    );
    const floorStability = survivabilityFloor?.stability ?? displayState.stability;
    const requiresProbabilisticSurvival =
      !goalsMetAfterAction &&
      currentState.stability <= SCORING.NEAR_DEATH_STABILITY &&
      displayState.stability > 0 &&
      floorStability <= 0;

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
      orderingScore:
        projectedSuccessChance *
        scoreFinishedOutcome(
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
  ): SearchMoveCandidate[] {
    const availableSkills = getAvailableSkills(
      currentState,
      config,
      currentConditionAtDepth,
    );
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
        );

      const completionBefore =
        modeCompGoal > 0
          ? Math.min(modeCompGoal, currentState.completion)
          : currentState.completion;
      const perfectionBefore =
        modePerfGoal > 0
          ? Math.min(modePerfGoal, currentState.perfection)
          : currentState.perfection;
      const completionAfter =
        modeCompGoal > 0
          ? Math.min(modeCompGoal, nextState.completion)
          : nextState.completion;
      const perfectionAfter =
        modePerfGoal > 0
          ? Math.min(modePerfGoal, nextState.perfection)
          : nextState.perfection;
      const immediateProgress =
        Math.max(0, completionAfter - completionBefore) +
        Math.max(0, perfectionAfter - perfectionBefore);

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
      return compareMoveCandidatesForTie(b, a, currentState);
    });

    const cachedBestMoveKey = getCachedBestMoveKey(
      cache,
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
      bestScore = scoreStateConsideringFinish(currentState, currentConditionAtDepth);
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
        cache,
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
  const rootNeedsCompletion =
    Number.isFinite(modeCompGoal) &&
    modeCompGoal > 0 &&
    state.completion < modeCompGoal;
  const rootNeedsPerfection =
    Number.isFinite(modePerfGoal) &&
    modePerfGoal > 0 &&
    state.perfection < modePerfGoal;
  const compareRecommendations = (
    a: SkillRecommendation,
    b: SkillRecommendation,
  ): number => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > scoreTieWindow) {
      return scoreDiff;
    }

    const aProgress =
      (rootNeedsCompletion ? Math.max(0, a.immediateGains.completion) : 0) +
      (rootNeedsPerfection ? Math.max(0, a.immediateGains.perfection) : 0);
    const bProgress =
      (rootNeedsCompletion ? Math.max(0, b.immediateGains.completion) : 0) +
      (rootNeedsPerfection ? Math.max(0, b.immediateGains.perfection) : 0);
    const progressDiff = bProgress - aProgress;
    if (progressDiff !== 0) {
      return progressDiff;
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
      cache,
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
      const { expectedGains, immediateGains, effectiveCosts } =
        isFinishAction(followUpSkill)
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

      const { expectedGains, immediateGains, effectiveCosts } =
        isFinishAction(followUp)
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
    completed: boolean;
    evaluatedDepth: number;
  } {
    const currentConditionEffects = getConditionEffectsForConfig(
      config,
      normalizedCurrentCondition,
    );
    const orderedCandidates = buildOrderedMoveCandidates(
      state,
      depthToSearch,
      normalizedCurrentCondition,
      initialConditionQueue,
      currentConditionEffects,
    );
    const evaluatedFirstMoves: Array<
      SkillRecommendation & UnsafeCandidateClassification
    > = [];

    // First pass: evaluate ALL first-level skills with basic scoring
    // This ensures we always have alternatives even if deep search times out
    for (const candidate of orderedCandidates) {
      const skill = candidate.skill;
      const newState = candidate.searchState;

      const { expectedGains, immediateGains, effectiveCosts } =
        isFinishAction(skill)
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
        requiresProbabilisticSurvival: candidate.requiresProbabilisticSurvival,
        ...terminalState,
      });
    }

    const scored: SkillRecommendation[] = filterUnfinishedTerminalCandidates(
      evaluatedFirstMoves,
    ).map(({ isTerminal, isTerminalUnmet, ...rec }) => rec);

    if (!useDeepSearch || depthToSearch <= 1) {
      scored.sort(compareRecommendations);
      return {
        recommendations: scored,
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
        completed: false,
        evaluatedDepth: 1,
      };
    }

    deepenedRecommendations.sort(compareRecommendations);

    return {
      recommendations: deepenedRecommendations,
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
    const iterationCompleted = candidateResult.completed;
    const evaluatedDepth = candidateResult.evaluatedDepth;

    // Preserve the last fully completed iteration. A deeper pass that hits a
    // budget limit mid-evaluation is only a partial frontier and should not
    // overwrite a fully completed shallower pass.
    if (iterationCompleted && candidateSkills.length > 0) {
      scoredSkills = candidateSkills;
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

  const rankedSkills = rankRecommendations(scoredSkills, scoreTieWindow);
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
    const { searchState: stateAfterFirstMove } = buildSearchStateForContinuation(
      state,
      bestFirstMove,
      stateAfterFirstMoveDisplay,
      currentConditionEffects,
      normalizedCurrentCondition,
    );
    const firstMoveConditionState = getMostLikelyConditionStateAfterSkill(
      stateAfterFirstMove,
      normalizedCurrentCondition,
      initialConditionQueue,
      bestFirstMove,
    );
    const finishedByChoice = isFinishAction(bestFirstMove);
    const { path, finalState, finishedByChoice: pathFinishedByChoice } =
      finishedByChoice
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
    const compRemaining = Math.max(0, effectiveCompGoal - finalState.completion);
    const perfRemaining = Math.max(0, effectivePerfGoal - finalState.perfection);
    const avgGainPerTurn = scoringCtx.avgGainPerTurn;
    const projectedSuccessChance =
      finalState.stability > 0
        ? calculateFinishSuccessChance(finalState, targetCompletion)
        : 0;
    const turnsRemaining =
      finishedByChoice || pathFinishedByChoice
        ? 0
        : Math.ceil((compRemaining + perfRemaining) / avgGainPerTurn);

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
  buildScoringContext,
  SCORING,
} as const;
