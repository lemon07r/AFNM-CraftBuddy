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
  calculateEffectiveActionCosts,
  getAvailableSkills,
  calculateSkillGains,
  isTerminalState,
  getBlockedSkillReasons,
  getConditionEffectsForConfig,
} from './skills';
import { getHarmonyStatModifiers } from './harmony';

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
    icon?: string;
    expectedGains: GainPreview;
    immediateGains: GainPreview;
    effectiveCosts: ActionCostPreview;
  };
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
  };
  /** Search performance metrics */
  searchMetrics?: {
    nodesExplored: number;
    cacheHits: number;
    timeTakenMs: number;
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
  /** Maximum nodes to explore before stopping (default: 200000) */
  maxNodes: number;
  /** Beam width - max branches to explore at each level (default: 8) */
  beamWidth: number;
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
   * Adaptive beam width based on remaining stability/rounds (default: true).
   * Narrows beam for deeper searches to stay within budget.
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
  useAlphaBeta: true,
  progressBucketSize: 100,
  useIterativeDeepening: true,
  iterativeDeepeningMinDepth: 3,
  useAdaptiveBeamWidth: true,
  enableConditionBranchingAfterForecast: true,
  conditionBranchLimit: 2,
  conditionBranchMinProbability: 0.15,
};

const TERMINAL_UNMET_SCORE_FLOOR = -1_000_000;
const TERMINAL_UNMET_SCORE_TIEBREAK_WINDOW = 100_000;
const DIVERSITY_TIEBREAK_SCORE_WINDOW = 1;

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
 * Calculate adaptive beam width based on remaining depth.
 * For deep searches (high realm), we narrow the beam to stay performant.
 */
function getAdaptiveBeamWidth(
  baseBeamWidth: number,
  remainingDepth: number,
  totalDepth: number,
): number {
  if (totalDepth <= 6) {
    // Short crafts: use full beam
    return baseBeamWidth;
  }

  // For deep searches, reduce beam width progressively
  // Early moves: wider exploration; deeper moves: narrower
  const depthRatio = remainingDepth / totalDepth;
  if (depthRatio > 0.7) {
    return baseBeamWidth;
  } else if (depthRatio > 0.4) {
    return Math.max(3, Math.floor(baseBeamWidth * 0.75));
  } else {
    return Math.max(2, Math.floor(baseBeamWidth * 0.5));
  }
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
  if (skill.consumesTurn !== undefined) {
    return skill.consumesTurn;
  }
  return skill.actionKind !== 'item';
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

function filterUnfinishedTerminalCandidates<
  T extends TerminalStateClassification,
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

function applyTerminalUnmetPenalty(baseScore: number): number {
  const tieBreak = Math.max(
    -TERMINAL_UNMET_SCORE_TIEBREAK_WINDOW,
    Math.min(TERMINAL_UNMET_SCORE_TIEBREAK_WINDOW, baseScore),
  );
  return TERMINAL_UNMET_SCORE_FLOOR + tieBreak;
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
    ? 'alchemical' as const
    : harmonyData.resonance
      ? 'resonance' as const
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
  const compWeight = 1 + compNeedShare;
  const perfWeight = 1 + perfNeedShare;
  let score = compProgress * compWeight + perfProgress * perfWeight;

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
        (SCORING.BUFF_NEED_FLOOR + perfNeedShare) *
        remainingWorkPct;
    }
    if (state.hasIntensityBuff()) {
      const intensityBuffBoost =
        (state.intensityBuffMultiplier - 1) *
        SCORING.BUFF_VALUE_PER_MULTIPLIER_POINT;
      score +=
        state.intensityBuffTurns *
        intensityBuffBoost *
        (SCORING.BUFF_NEED_FLOOR + compNeedShare) *
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
  orderingScore: number;
  immediateProgress: number;
}
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
): SearchResult {
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

  // Check if active goals are already met.
  if (goalsMet(state, modeCompGoal, modePerfGoal)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: false,
      targetsMet: true,
    };
  }

  // Check if terminal state
  if (isTerminalState(state, config, normalizedCurrentCondition)) {
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
    SkillRecommendation & TerminalStateClassification
  > = [];

  for (const skill of availableSkills) {
    const newState = applySkill(
      state,
      skill,
      config,
      conditionEffects,
      targetCompletion,
      normalizedCurrentCondition,
    );
    if (newState === null) continue;

    const { expectedGains, immediateGains, effectiveCosts } =
      calculateRecommendationGains(
        state,
        skill,
        config,
        conditionEffects,
      );
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
      ...terminalState,
    });
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
        compNeedShare * intensityScale + perfNeedShare * controlScale;
      const neutralPotential = compNeedShare + perfNeedShare;
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
    return isTerminalUnmet ? applyTerminalUnmetPenalty(baseScore) : baseScore;
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
        orderingScore: estimatePostMoveStateScore(
          nextState,
          skill,
          currentConditionAtDepth,
          nextConditionQueueAtDepth,
        ),
        immediateProgress,
      });
    }

    candidates.sort((a, b) => {
      const scoreDiff = b.orderingScore - a.orderingScore;
      if (Math.abs(scoreDiff) > scoreTieWindow) {
        return scoreDiff;
      }
      return compareMoveCandidatesForTie(b, a, currentState);
    });
    return candidates;
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

  // Check if terminal state (use current condition type for filtering)
  if (isTerminalState(state, config, normalizedCurrentCondition)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
      searchMetrics: metrics,
    };
  }

  // Transposition table: cacheKey -> best score and best move found.
  // Storing bestMove enables findOptimalPath() to reconstruct the tree
  // search's actual chosen path instead of greedily re-deciding at each step.
  const cache = new Map<string, { score: number; bestMove: string }>();

  // Flag to signal early termination due to time/node budget
  let shouldTerminate = false;
  let activeDepth = depth;

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
    metrics.nodesExplored++;

    // Check budget constraints
    if (checkBudget()) {
      return scoreStateWithTerminalPenalty(
        currentState,
        currentConditionAtDepth,
      );
    }

    const stateIsTerminal = isTerminalState(
      currentState,
      config,
      currentConditionAtDepth,
    );

    // Base case: depth exhausted or terminal
    if (remainingDepth === 0 || stateIsTerminal) {
      return scoreStateWithTerminalPenalty(
        currentState,
        currentConditionAtDepth,
      );
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

    // Get condition effects for this depth.
    const conditionEffectsAtDepth = getConditionEffectsForConfig(
      config,
      currentConditionAtDepth,
    );
    const orderedCandidates = buildOrderedMoveCandidates(
      currentState,
      currentConditionAtDepth,
      nextConditionQueueAtDepth,
      conditionEffectsAtDepth,
    );
    if (orderedCandidates.length === 0) {
      return scoreStateWithTerminalPenalty(
        currentState,
        currentConditionAtDepth,
      );
    }

    // Apply adaptive beam search: use narrower beam for deep searches
    const effectiveBeamWidth = cfg.useAdaptiveBeamWidth
      ? getAdaptiveBeamWidth(cfg.beamWidth, remainingDepth, activeDepth)
      : cfg.beamWidth;
    const beamCandidates = orderedCandidates.slice(0, effectiveBeamWidth);

    let bestScore = -Infinity;
    let bestCandidate: SearchMoveCandidate | null = null;
    let bestMoveKey = ''; // tracks which skill achieved bestScore

    for (const candidate of beamCandidates) {
      const { skill, nextState: newState } = candidate;

      let score = 0;
      if (!actionConsumesTurn(skill)) {
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
      bestScore = scoreStateWithTerminalPenalty(
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
    if (!actionConsumesTurn(skill)) {
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
  ): { path: string[]; finalState: CraftingState } {
    const path: string[] = [];
    let currentState = startState;
    let currentDepth = 0;
    let conditionAtDepth = startConditionAtDepth;
    let conditionQueueAtDepth = startConditionQueueAtDepth;

    while (
      currentDepth < maxDepth &&
      !isTerminalState(currentState, config, conditionAtDepth)
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

      for (let probeDepth = remainingDepth; probeDepth >= 1; probeDepth--) {
        const probeCacheKey = getNormalizedCacheKey(
          currentState,
          effectiveCompGoal,
          effectivePerfGoal,
          probeDepth,
          conditionAtDepth,
          conditionQueueAtDepth,
          cfg.progressBucketSize,
        );
        const probeEntry = cache.get(probeCacheKey);
        if (probeEntry && probeEntry.bestMove) {
          const cachedSkill = skills.find((s) => s.key === probeEntry.bestMove);
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
              chosenSkill = cachedSkill;
              chosenNextState = nextState;
              break; // deepest available entry is most authoritative
            }
          }
        }
      }

      // Fallback: greedy evaluation when cache miss or cached skill unavailable.
      if (!chosenSkill || !chosenNextState) {
        let bestScore = -Infinity;
        let bestCandidate: SearchMoveCandidate | null = null;
        for (const skill of skills) {
          const nextState = applySkill(
            currentState,
            skill,
            config,
            conditionEffectsAtDepth,
            targetCompletion,
            conditionAtDepth,
          );
          if (nextState === null) continue;

          const score = evaluateFutureScoreAfterSkill(
            nextState,
            Math.max(0, remainingDepth - 1),
            globalDepth + 1,
            conditionAtDepth,
            conditionQueueAtDepth,
            skill,
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
          const candidate: SearchMoveCandidate = {
            skill,
            nextState,
            orderingScore: score,
            immediateProgress:
              Math.max(0, completionAfter - completionBefore) +
              Math.max(0, perfectionAfter - perfectionBefore),
          };

          const scoreDelta = score - bestScore;
          const isClearImprovement = scoreDelta > scoreTieWindow;
          const isScoreTie =
            Math.abs(scoreDelta) <= scoreTieWindow && bestCandidate;
          const winsTie =
            isScoreTie &&
            compareMoveCandidatesForTie(
              candidate,
              bestCandidate!,
              currentState,
            ) > 0;

          if (isClearImprovement || winsTie || bestCandidate === null) {
            bestScore = score;
            bestCandidate = candidate;
            chosenSkill = skill;
            chosenNextState = nextState;
          }
        }
      }

      if (!chosenSkill || !chosenNextState) {
        break;
      }

      const nextConditionState = getMostLikelyConditionStateAfterSkill(
        chosenNextState,
        conditionAtDepth,
        conditionQueueAtDepth,
        chosenSkill,
      );

      path.push(chosenSkill.name);
      currentState = chosenNextState;
      conditionAtDepth = nextConditionState.nextCondition;
      conditionQueueAtDepth = nextConditionState.nextQueue;
      currentDepth++;
    }

    return { path, finalState: currentState };
  }

  /**
   * Evaluate all first moves at a specific depth.
   */
  function evaluateFirstMoves(depthToSearch: number): SkillRecommendation[] {
    activeDepth = depthToSearch;
    const currentConditionEffects = getConditionEffectsForConfig(
      config,
      normalizedCurrentCondition,
    );
    const orderedCandidates = buildOrderedMoveCandidates(
      state,
      normalizedCurrentCondition,
      initialConditionQueue,
      currentConditionEffects,
    );
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
    const evaluatedFirstMoves: Array<
      SkillRecommendation & TerminalStateClassification
    > = [];

    function findFollowUpSkill(
      stateAfterSkill: CraftingState,
      depthIndex: number,
      conditionAtDepth: CraftingConditionType,
      nextConditionQueueAtDepth: CraftingConditionType[],
      useDeepLookahead: boolean = true,
    ): SkillRecommendation['followUpSkill'] | undefined {
      if (targetsMetForCurrentMode(stateAfterSkill)) {
        return undefined;
      }
      if (isTerminalState(stateAfterSkill, config, conditionAtDepth)) {
        return undefined;
      }

      const followUpConditionEffects = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );

      // Consult the transposition table first.  The tree search already
      // evaluated this state and recorded its best move — using it here
      // ensures the follow-up matches the tree search's verdict instead
      // of diverging under budget pressure (see AGENTS.md anti-pattern #7).
      //
      // With iterative deepening, the exact remaining depth for this state
      // may not have been searched at the current iteration (budget
      // exhausted).  Walk backwards through depths to find the best
      // available cache entry — deeper is more authoritative.
      const skills = getAvailableSkills(
        stateAfterSkill,
        config,
        conditionAtDepth,
      );
      const maxRemainingDepth = Math.max(0, depthToSearch - depthIndex);
      let cachedBestMove: string | null = null;
      for (let probeDepth = maxRemainingDepth; probeDepth >= 1; probeDepth--) {
        const probeCacheKey = getNormalizedCacheKey(
          stateAfterSkill,
          effectiveCompGoal,
          effectivePerfGoal,
          probeDepth,
          conditionAtDepth,
          nextConditionQueueAtDepth,
          cfg.progressBucketSize,
        );
        const probeEntry = cache.get(probeCacheKey);
        if (probeEntry && probeEntry.bestMove) {
          cachedBestMove = probeEntry.bestMove;
          break; // deepest available entry is most authoritative
        }
      }
      if (cachedBestMove) {
        const cachedSkill = skills.find((s) => s.key === cachedBestMove);
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
            icon: cachedSkill.icon,
            expectedGains,
            immediateGains,
            effectiveCosts,
          };
        }
      }

      // Fallback: re-evaluate when the cache has no entry for this state
      // (e.g., cache miss due to bucketing or the state was never searched).
      const orderedFollowUpCandidates = buildOrderedMoveCandidates(
        stateAfterSkill,
        conditionAtDepth,
        nextConditionQueueAtDepth,
        followUpConditionEffects,
      );
      if (orderedFollowUpCandidates.length === 0) return undefined;

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

      for (const candidate of orderedFollowUpCandidates) {
        const followUp = candidate.skill;
        const nextState = candidate.nextState;

        const { expectedGains, immediateGains, effectiveCosts } =
          calculateRecommendationGains(
            stateAfterSkill,
            followUp,
            config,
            followUpConditionEffects,
          );
        const followUpScore = useDeepLookahead
          ? evaluateFutureScoreAfterSkill(
              nextState,
              Math.max(0, depthToSearch - 1 - depthIndex),
              depthIndex + 1,
              conditionAtDepth,
              nextConditionQueueAtDepth,
              followUp,
            )
          : estimatePostMoveStateScore(
              nextState,
              followUp,
              conditionAtDepth,
              nextConditionQueueAtDepth,
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
        }
      }

      if (!bestFollowUp) return undefined;
      return {
        name: bestFollowUp.name,
        type: bestFollowUp.type,
        icon: bestFollowUp.icon,
        expectedGains: bestFollowUpExpectedGains,
        immediateGains: bestFollowUpImmediateGains,
        effectiveCosts: bestFollowUpEffectiveCosts,
      };
    }

    // First pass: evaluate ALL first-level skills with basic scoring
    // This ensures we always have alternatives even if deep search times out
    for (const candidate of orderedCandidates) {
      const skill = candidate.skill;
      const newState = candidate.nextState;

      const { expectedGains, immediateGains, effectiveCosts } =
        calculateRecommendationGains(
          state,
          skill,
          config,
          currentConditionEffects,
        );
      const reasoning = generateReasoning(
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
      const terminalState = classifyTerminalState(
        newState,
        config,
        firstMoveConditionState.nextCondition,
        modeCompGoal,
        modePerfGoal,
      );

      const immediateScore = estimatePostMoveStateScore(
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
        followUpSkill: undefined, // Will be filled in second pass if budget allows
        ...terminalState,
      });
    }

    const scored: SkillRecommendation[] = filterUnfinishedTerminalCandidates(
      evaluatedFirstMoves,
    ).map(({ isTerminal, isTerminalUnmet, ...rec }) => rec);

    // Second pass: enhance scores with deep lookahead if budget allows
    // Process skills in order of their immediate score (best first)
    scored.sort(compareRecommendations);
    const fallbackFollowUpCount = 3;

    for (let index = 0; index < scored.length; index++) {
      const rec = scored[index];

      const newState = applySkill(
        state,
        rec.skill,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );
      if (newState === null) continue;

      const firstMoveConditionState = getMostLikelyConditionStateAfterSkill(
        newState,
        normalizedCurrentCondition,
        initialConditionQueue,
        rec.skill,
      );

      const hasBudgetForDeepSearch = !checkBudget();
      if (hasBudgetForDeepSearch) {
        rec.score = evaluateFutureScoreAfterSkill(
          newState,
          Math.max(0, depthToSearch - 1),
          1,
          normalizedCurrentCondition,
          initialConditionQueue,
          rec.skill,
        );
      }

      // Always try to provide a follow-up suggestion for top-ranked skills.
      // If budget is exhausted, fall back to immediate scoring instead of lookahead.
      const hasBudgetForDeepFollowUp = !checkBudget();
      const shouldApplyFallback = index < fallbackFollowUpCount;
      if (hasBudgetForDeepFollowUp || shouldApplyFallback) {
        rec.followUpSkill = findFollowUpSkill(
          newState,
          1,
          firstMoveConditionState.nextCondition,
          firstMoveConditionState.nextQueue,
          hasBudgetForDeepFollowUp,
        );
      }

      if (!hasBudgetForDeepFollowUp && !shouldApplyFallback) {
        break;
      }
    }

    scored.sort(compareRecommendations);

    const topRecommendation = scored[0];
    if (topRecommendation && !topRecommendation.followUpSkill) {
      const stateAfterTopRecommendation = applySkill(
        state,
        topRecommendation.skill,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );
      if (stateAfterTopRecommendation !== null) {
        const topConditionState = getMostLikelyConditionStateAfterSkill(
          stateAfterTopRecommendation,
          normalizedCurrentCondition,
          initialConditionQueue,
          topRecommendation.skill,
        );
        const canUseDeepTopFollowUp = !checkBudget();
        topRecommendation.followUpSkill = findFollowUpSkill(
          stateAfterTopRecommendation,
          1,
          topConditionState.nextCondition,
          topConditionState.nextQueue,
          canUseDeepTopFollowUp,
        );
      }
    }

    return scored;
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

  let usedDepth = depthPlan[0] ?? depth;
  let scoredSkills: SkillRecommendation[] = [];
  for (const candidateDepth of depthPlan) {
    if (checkBudget()) break;
    const candidateSkills = evaluateFirstMoves(candidateDepth);
    if (candidateSkills.length > 0) {
      scoredSkills = candidateSkills;
      usedDepth = candidateDepth;
      metrics.depthReached = candidateDepth;
    }
    if (shouldTerminate) break;
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

  // Ensure subsequent path reconstruction uses the same depth profile
  // as the depth that produced the selected recommendation set.
  activeDepth = usedDepth;

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

  // Find the optimal rotation starting from the best first move
  const bestFirstMove = scoredSkills[0].skill;
  const currentConditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCurrentCondition,
  );
  const stateAfterFirstMove = applySkill(
    state,
    bestFirstMove,
    config,
    currentConditionEffects,
    targetCompletion,
    normalizedCurrentCondition,
  );

  let optimalRotation: string[] = [bestFirstMove.name];
  let expectedFinalState: SearchResult['expectedFinalState'] = undefined;

  if (stateAfterFirstMove) {
    const firstMoveConditionState = getMostLikelyConditionStateAfterSkill(
      stateAfterFirstMove,
      normalizedCurrentCondition,
      initialConditionQueue,
      bestFirstMove,
    );
    // Find the rest of the optimal path, starting from depth index 1 (after first move)
    const { path, finalState } = findOptimalPath(
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
      const topRec = scoredSkills[0];
      if (
        topRec &&
        topRec.skill.key === bestFirstMove.key &&
        (!topRec.followUpSkill ||
          topRec.followUpSkill.name !== rotationSecondSkillName)
      ) {
        const secondSkill = config.skills.find(
          (s) => s.name === rotationSecondSkillName,
        );
        if (secondSkill) {
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
    const avgGainPerTurn = scoringCtx.avgGainPerTurn;
    const turnsRemaining = Math.ceil(
      (compRemaining + perfRemaining) / avgGainPerTurn,
    );

    expectedFinalState = {
      completion: finalState.completion,
      perfection: finalState.perfection,
      stability: finalState.stability,
      maxStability: finalState.maxStability,
      qi: finalState.qi,
      turnsRemaining: turnsRemaining > 0 ? turnsRemaining : 0,
    };
  }

  // Record final metrics
  metrics.timeTakenMs = Date.now() - startTime;
  const rankedSkills = rankRecommendations(scoredSkills, scoreTieWindow);

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
