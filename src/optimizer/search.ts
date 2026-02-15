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

interface GainPreview {
  completion: number;
  perfection: number;
  stability: number;
}

export interface SkillRecommendation {
  skill: SkillDefinition;
  /** Projected expected-value gain (includes RNG EV). */
  expectedGains: GainPreview;
  /** Immediate tooltip-style gain (without RNG EV multipliers). */
  immediateGains: GainPreview;
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

/** Default search configuration tuned via benchmark for accuracy + responsiveness */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  timeBudgetMs: 500,
  maxNodes: 200000,
  beamWidth: 8,
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
  // Bonus sized so it is roughly 2× the total target magnitude — large enough
  // to clearly separate "met" from "almost met" but proportional to the craft.
  const targetMetBonus = totalTargetMagnitude * 2;

  const baseTargetsMet =
    (targetCompletion <= 0 || state.completion >= targetCompletion) &&
    (targetPerfection <= 0 || state.perfection >= targetPerfection);
  const sublimeTargetsMet =
    isSublimeCraft &&
    (effectiveCompTarget <= 0 || state.completion >= effectiveCompTarget) &&
    (effectivePerfTarget <= 0 || state.perfection >= effectivePerfTarget);

  if (sublimeTargetsMet) {
    score += targetMetBonus * 1.5;
    // Tiny resource tiebreaker — just enough to distinguish otherwise-equal
    // completions, but never enough to justify an extra turn of stabilize.
    score += state.qi * 0.001;
    score += state.stability * 0.001;
    // Prefer earlier completion: penalise each turn spent so that a path
    // finishing in 1 turn beats an equivalent path finishing in 2 turns.
    score -= state.step * 0.5;
  } else if (baseTargetsMet) {
    score += targetMetBonus;
    score += state.qi * 0.001;
    score += state.stability * 0.001;
    score -= state.step * 0.5;
    if (isSublimeCraft) {
      const compBeyondBase = Math.max(0, state.completion - targetCompletion);
      const perfBeyondBase = Math.max(0, state.perfection - targetPerfection);
      score += (compBeyondBase + perfBeyondBase) * 0.5;
    }
  } else {
    // ── 3. buff valuation (when targets not yet met) ──────────────────
    if (state.hasControlBuff()) {
      const controlBuffBoost = (state.controlBuffMultiplier - 1) * 25;
      score +=
        state.controlBuffTurns *
        controlBuffBoost *
        (0.5 + perfNeedShare) *
        remainingWorkPct;
    }
    if (state.hasIntensityBuff()) {
      const intensityBuffBoost = (state.intensityBuffMultiplier - 1) * 25;
      score +=
        state.intensityBuffTurns *
        intensityBuffBoost *
        (0.5 + compNeedShare) *
        remainingWorkPct;
    }

    // ── 4. resource value (qi & stability as future-progress enablers) ─
    score += state.qi * 0.05;
    score += state.stability * (0.01 + remainingWorkPct * 0.01);
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
    score -= (compOver + perfOver) * 0.3;
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
    score -= (compOver + perfOver) * 0.3;
  }

  // Hard-cap violation penalty
  if (maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)) {
    score -= Math.max(0, state.completion - maxCompletionCap) * 3;
  }
  if (maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)) {
    score -= Math.max(0, state.perfection - maxPerfectionCap) * 3;
  }

  // ── 6. survivability ────────────────────────────────────────────────
  // When targets are already met, the craft is done — stability penalties
  // should not apply because we don't need any more turns.  This prevents
  // the optimizer from preferring Stabilize over an immediate finishing move.
  if (!baseTargetsMet) {
    const stabilityThreshold = trainingMode
      ? 8 + remainingWorkPct * 8
      : 14 + remainingWorkPct * 26;
    const stabilityPenaltyWeight = trainingMode
      ? Math.max(8, totalTargetMagnitude * 0.08)
      : Math.max(45, totalTargetMagnitude * 0.45);
    if (state.stability < stabilityThreshold) {
      const stabilityRisk =
        (stabilityThreshold - state.stability) / stabilityThreshold;
      score -= stabilityRisk * stabilityRisk * stabilityPenaltyWeight;
    }

    // Hard cliff: craft dead at 0 stability.
    if (state.stability <= 0) {
      score -= targetMetBonus;
    } else if (state.stability <= 10) {
      score -=
        (10 - state.stability) * Math.max(8, totalTargetMagnitude * 0.08);
    }

    // Runway penalty: avoid lines that lack enough stability to finish.
    const estimatedTurnsRemaining =
      remainingWorkPct > 0
        ? Math.ceil(remainingWorkPct * (isSublimeCraft ? 14 : 10))
        : 0;
    const estimatedRunwayTurns = Math.floor(Math.max(0, state.stability) / 10);
    if (estimatedTurnsRemaining > estimatedRunwayTurns) {
      const gap = estimatedTurnsRemaining - estimatedRunwayTurns;
      const maxRunwayPenalty = trainingMode ? 10 : 40;
      score -= Math.min(gap * (trainingMode ? 2 : 5), maxRunwayPenalty);
    }
  }

  // ── 7. toxicity & harmony ──────────────────────────────────────────
  if (state.maxToxicity > 0 && state.hasDangerousToxicity()) {
    score -= 5;
  }
  if (isSublimeCraft) {
    score += state.harmony * 0.15;
  }

  return score;
}

function calculateRecommendationGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig>,
): { expectedGains: GainPreview; immediateGains: GainPreview } {
  const expected = calculateSkillGains(state, skill, config, conditionEffects);
  const immediate = calculateSkillGains(
    state,
    skill,
    config,
    conditionEffects,
    { includeExpectedValue: false },
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
  };
}

function hasUnmetTarget(
  state: CraftingState,
  completionGoal: number,
  perfectionGoal: number,
): { needsCompletion: boolean; needsPerfection: boolean } {
  return {
    needsCompletion:
      Number.isFinite(completionGoal) &&
      completionGoal > 0 &&
      state.completion < completionGoal,
    needsPerfection:
      Number.isFinite(perfectionGoal) &&
      perfectionGoal > 0 &&
      state.perfection < perfectionGoal,
  };
}

interface ActionCandidateContext {
  skill: SkillDefinition;
  immediateGains: GainPreview;
  effectiveCosts: ReturnType<typeof calculateEffectiveActionCosts>;
  consumesTurn: boolean;
  turnStabilitySpend: number;
  advancesTargetsNow: boolean;
  isImmediateFinisher: boolean;
}

interface StallActionContext {
  candidates: ActionCandidateContext[];
  hasTargetAdvancingProgressOption: boolean;
  hasImmediateFinisher: boolean;
  criticalStability: number;
}

function computeDynamicCriticalStability(
  candidates: ActionCandidateContext[],
  minStability: number,
): number {
  const minimumFallback = Math.max(
    1,
    Math.floor(Math.max(0, minStability || 0)) + 1,
  );
  const advancingTurnSpends = candidates
    .filter(
      (candidate) => candidate.advancesTargetsNow && candidate.consumesTurn,
    )
    .map((candidate) => candidate.turnStabilitySpend)
    .filter((spend) => Number.isFinite(spend) && spend > 0);

  if (advancingTurnSpends.length === 0) {
    return minimumFallback;
  }

  const minSpend = Math.min(...advancingTurnSpends);
  return Math.max(minimumFallback, Math.ceil(minSpend));
}

function buildStallActionContext(
  state: CraftingState,
  skills: SkillDefinition[],
  config: OptimizerConfig,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig>,
  completionGoal: number,
  perfectionGoal: number,
): StallActionContext {
  const needs = hasUnmetTarget(state, completionGoal, perfectionGoal);

  const candidates: ActionCandidateContext[] = skills.map((skill) => {
    const immediateGains = calculateSkillGains(
      state,
      skill,
      config,
      conditionEffects,
      {
        includeExpectedValue: false,
      },
    );
    const effectiveCosts = calculateEffectiveActionCosts(
      state,
      skill,
      config.minStability,
      conditionEffects,
    );
    const consumesTurn = actionConsumesTurn(skill);
    const turnStabilitySpend = Math.max(0, effectiveCosts.stabilityCost);
    const advancesTargetsNow =
      (needs.needsCompletion && immediateGains.completion > 0) ||
      (needs.needsPerfection && immediateGains.perfection > 0);
    const completionAfter = state.completion + immediateGains.completion;
    const perfectionAfter = state.perfection + immediateGains.perfection;
    const isImmediateFinisher =
      (!needs.needsCompletion || completionAfter >= completionGoal) &&
      (!needs.needsPerfection || perfectionAfter >= perfectionGoal);

    return {
      skill,
      immediateGains,
      effectiveCosts,
      consumesTurn,
      turnStabilitySpend,
      advancesTargetsNow,
      isImmediateFinisher,
    };
  });

  const hasTargetAdvancingProgressOption = candidates.some(
    (candidate) => candidate.advancesTargetsNow,
  );
  const hasImmediateFinisher = candidates.some(
    (candidate) =>
      candidate.advancesTargetsNow && candidate.isImmediateFinisher,
  );

  return {
    candidates,
    hasTargetAdvancingProgressOption,
    hasImmediateFinisher,
    criticalStability: computeDynamicCriticalStability(
      candidates,
      config.minStability,
    ),
  };
}

function restoresQi(skill: SkillDefinition): boolean {
  return (
    skill.restoresQi === true ||
    (skill.qiRestore ?? 0) > 0 ||
    (skill.effects || []).some(
      (effect) => effect?.kind === 'pool' && (effect.amount?.value ?? 0) > 0,
    )
  );
}

function hasMeaningfulNonQiEffects(skill: SkillDefinition): boolean {
  if (skill.buffDuration > 0 || skill.buffType !== BuffType.NONE) {
    return true;
  }
  return (skill.effects || []).some((effect) => {
    const kind = effect?.kind;
    return (
      kind === 'completion' ||
      kind === 'perfection' ||
      kind === 'stability' ||
      kind === 'maxStability' ||
      kind === 'createBuff' ||
      kind === 'cleanseToxicity'
    );
  });
}

function isWastefulStabilize(
  state: CraftingState,
  candidate: ActionCandidateContext,
  criticalStability: number,
  hasImmediateFinisher: boolean,
  allProgressWouldEndCraft: boolean = false,
): boolean {
  const { skill, immediateGains, effectiveCosts } = candidate;
  if (skill.type !== 'stabilize') {
    return false;
  }

  // Never wasteful when all progress skills would end the craft — stabilize is the only survival option.
  if (allProgressWouldEndCraft) {
    return false;
  }

  // Dynamic emergency floor derived from currently available progress actions.
  if (state.stability <= criticalStability) {
    return false;
  }

  const maxRecoverable = Math.max(0, state.maxStability - state.stability);
  const nominalGain = Math.max(
    1,
    skill.stabilityGain || Math.max(0, immediateGains.stability),
  );
  const effectiveGain = Math.max(
    0,
    Math.min(Math.max(0, immediateGains.stability), maxRecoverable),
  );
  const wasteRatio = Math.max(0, 1 - effectiveGain / nominalGain);
  const qiPerEffectiveStability =
    effectiveGain > 0 ? effectiveCosts.qiCost / effectiveGain : Infinity;

  if (hasImmediateFinisher && qiPerEffectiveStability >= 1.8) {
    return true;
  }

  // Consider both clamp waste and absolute qi efficiency.
  return (
    wasteRatio >= 0.35 ||
    (wasteRatio >= 0.2 && qiPerEffectiveStability >= 2) ||
    qiPerEffectiveStability >= 2.2
  );
}

function isPureQiRecoveryStallAction(
  candidate: ActionCandidateContext,
): boolean {
  const { skill, immediateGains } = candidate;
  if (!restoresQi(skill)) {
    return false;
  }

  const hasDirectProgress =
    immediateGains.completion > 0 || immediateGains.perfection > 0;
  const hasStabilityImpact = immediateGains.stability > 0;
  if (hasDirectProgress || hasStabilityImpact) {
    return false;
  }

  return !hasMeaningfulNonQiEffects(skill);
}

/**
 * Compute soft ordering penalties for counterproductive stall actions.
 *
 * Instead of hard-filtering skills out of the search tree (which is
 * irreversible and can remove the optimal move), this returns a penalty
 * map that `orderSkillsForSearch` folds into its priority scoring.
 * Penalised skills sink to the bottom of the move ordering and are
 * likely pruned by beam width — but they remain available if the beam
 * is wide enough or if no better option exists.
 */
function computeStallPenalties(
  state: CraftingState,
  skills: SkillDefinition[],
  config: OptimizerConfig,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig>,
  completionGoal: number,
  perfectionGoal: number,
): Map<string, number> {
  const penalties = new Map<string, number>();

  if (skills.length <= 1) {
    return penalties;
  }

  const { needsCompletion, needsPerfection } = hasUnmetTarget(
    state,
    completionGoal,
    perfectionGoal,
  );
  if (!needsCompletion && !needsPerfection) {
    return penalties;
  }

  const context = buildStallActionContext(
    state,
    skills,
    config,
    conditionEffects,
    completionGoal,
    perfectionGoal,
  );
  if (!context.hasTargetAdvancingProgressOption) {
    return penalties;
  }

  // Check if ALL progress skills that advance targets would end the craft
  // (i.e., post-stability would be at or below minStability).
  // When true, stabilize must never be penalised — it's the only survival option.
  const allProgressWouldEndCraft = context.candidates
    .filter((c) => c.advancesTargetsNow && c.consumesTurn)
    .every((c) => {
      const postStability = state.stability - c.turnStabilitySpend;
      return postStability <= (config.minStability || 0);
    });

  // Large penalty that pushes skills below all normal priority scores
  // but doesn't make them -Infinity (so they're still reachable).
  const STALL_PENALTY = -2000;

  for (const candidate of context.candidates) {
    if (candidate.advancesTargetsNow) {
      continue;
    }

    if (
      isWastefulStabilize(
        state,
        candidate,
        context.criticalStability,
        context.hasImmediateFinisher,
        allProgressWouldEndCraft,
      )
    ) {
      penalties.set(candidate.skill.key, STALL_PENALTY);
      continue;
    }

    if (isPureQiRecoveryStallAction(candidate)) {
      penalties.set(candidate.skill.key, STALL_PENALTY);
    }
  }

  return penalties;
}

function rankRecommendations(
  scored: SkillRecommendation[],
): SkillRecommendation[] {
  if (scored.length <= 1) {
    return scored;
  }

  const sorted = [...scored].sort((a, b) => b.score - a.score);
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
 * Move ordering heuristic - orders skills to search most promising first.
 * This improves search efficiency by finding good solutions early.
 *
 * Uses condition-modified gains so that condition bonuses influence which
 * skills are explored first (and thus which survive beam-width pruning).
 *
 * Priority order:
 * 1. Stabilize skills when stability is low (<= 25)
 * 2. Buff-granting skills when no buff is active
 * 3. Buff-consuming skills (Disciplined Touch) when buffs are active
 * 4. High-gain skills (using condition-adjusted gains)
 * 5. Other skills
 */
function orderSkillsForSearch(
  skills: SkillDefinition[],
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig> = [],
  stallPenalties: Map<string, number> = new Map(),
): SkillDefinition[] {
  const needsCompletion = state.completion < targetCompletion;
  const needsPerfection = state.perfection < targetPerfection;
  const hasControlBuff = state.hasControlBuff();
  const hasIntensityBuff = state.hasIntensityBuff();
  const lowStability = state.stability <= 25;

  // Check if qi is at or near max (within 10% of max)
  const qiNearMax = config.maxQi > 0 && state.qi >= config.maxQi * 0.9;

  // Score each skill for ordering (higher = search first)
  const scored = skills.map((skill) => {
    let priority = 0;

    // Highest priority: stabilize when low
    if (lowStability && skill.type === 'stabilize') {
      priority += 1000;
    }

    // High priority: buff-consuming skills when buffs active
    if (skill.isDisciplinedTouch && (hasControlBuff || hasIntensityBuff)) {
      priority += 500;
    }

    // Deprioritize stabilize skills when stability is already at or near max
    if (skill.type === 'stabilize') {
      if (state.stability >= state.maxStability) {
        priority -= 500;
      } else {
        // Penalize stabilize when most of the gain would be wasted (clamped by maxStability)
        const effectiveGain = Math.min(
          skill.stabilityGain || 0,
          state.maxStability - state.stability,
        );
        const nominalGain = skill.stabilityGain || 1;
        const wasteRatio = 1 - effectiveGain / nominalGain; // 0 = no waste, 1 = all wasted
        if (wasteRatio > 0.3) {
          priority -= Math.round(wasteRatio * 400);
        }
      }
    }

    // Deprioritize qi-restore skills when qi is already near max
    if (qiNearMax) {
      const isQiRestoreSkill =
        skill.restoresQi ||
        (skill.effects || []).some(
          (effect) =>
            effect?.kind === 'pool' && (effect.amount?.value ?? 0) > 0,
        );
      if (isQiRestoreSkill) {
        priority -= 500;
      }
    }

    // Item actions can unlock better follow-up turns
    if (skill.actionKind === 'item') {
      const hasImmediateImpact = (skill.effects || []).some(
        (effect) =>
          effect?.kind === 'completion' ||
          effect?.kind === 'perfection' ||
          effect?.kind === 'stability' ||
          (effect?.kind === 'pool' && !qiNearMax) ||
          effect?.kind === 'createBuff',
      );
      if (hasImmediateImpact) {
        priority += 320;
      }
      if (skill.toxicityCost && state.maxToxicity > 0) {
        const toxicityHeadroom = Math.max(
          0,
          state.maxToxicity - state.toxicity,
        );
        if (toxicityHeadroom <= skill.toxicityCost * 2) {
          priority -= 200;
        }
      }
    }

    // High priority: buff-granting skills when no buff
    if (skill.buffDuration > 0) {
      if (
        skill.buffType === BuffType.CONTROL &&
        !hasControlBuff &&
        needsPerfection
      ) {
        priority += 400;
      }
      if (
        skill.buffType === BuffType.INTENSITY &&
        !hasIntensityBuff &&
        needsCompletion
      ) {
        priority += 400;
      }
    }

    // Use condition-adjusted gains for progress priority so that condition
    // bonuses steer the beam toward the right skills.
    const gains = calculateSkillGains(state, skill, config, conditionEffects, {
      includeExpectedValue: false,
    });
    if (needsCompletion && gains.completion > 0) {
      priority += gains.completion * 2;
    }
    if (needsPerfection && gains.perfection > 0) {
      priority += gains.perfection * 2;
    }

    // Bonus for using buffs effectively
    if (hasControlBuff && skill.scalesWithControl) {
      priority += 100;
    }
    if (hasIntensityBuff && skill.scalesWithIntensity) {
      priority += 100;
    }

    // Apply stall-action penalties (soft replacement for hard filtering).
    const stallPenalty = stallPenalties.get(skill.key);
    if (stallPenalty !== undefined) {
      priority += stallPenalty;
    }

    return { skill, priority };
  });

  // Sort by priority descending
  scored.sort((a, b) => b.priority - a.priority);

  return scored.map((s) => s.skill);
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
  const stallPenalties = computeStallPenalties(
    state,
    availableSkills,
    config,
    conditionEffects,
    modeCompGoal,
    modePerfGoal,
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

    const { expectedGains, immediateGains } = calculateRecommendationGains(
      state,
      skill,
      config,
      conditionEffects,
    );
    const score =
      scoreState(
        newState,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        isTraining,
        config.maxCompletion,
        config.maxPerfection,
      ) + (stallPenalties.get(skill.key) ?? 0);
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
      score,
      reasoning,
      ...terminalState,
    });
  }

  const scoredSkills: SkillRecommendation[] =
    filterUnfinishedTerminalCandidates(evaluatedMoves).map(
      ({ isTerminal, isTerminalUnmet, ...rec }) => rec,
    );

  const rankedSkills = rankRecommendations(scoredSkills);

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
  const orderingCompGoal =
    effectiveCompGoal > 0 ? effectiveCompGoal : targetCompletion;
  const orderingPerfGoal =
    effectivePerfGoal > 0 ? effectivePerfGoal : targetPerfection;
  const targetsMetForCurrentMode = (candidate: CraftingState): boolean =>
    goalsMet(candidate, modeCompGoal, modePerfGoal);
  const scoreStateWithTerminalPenalty = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
  ): number => {
    const baseScore = scoreState(
      candidate,
      targetCompletion,
      targetPerfection,
      isSublime,
      targetMult,
      isTraining,
      config.maxCompletion,
      config.maxPerfection,
    );
    const { isTerminalUnmet } = classifyTerminalState(
      candidate,
      config,
      conditionAtDepth,
      modeCompGoal,
      modePerfGoal,
    );
    return isTerminalUnmet ? applyTerminalUnmetPenalty(baseScore) : baseScore;
  };

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

  // Memoization cache: cacheKey -> best score achievable from that state
  const cache = new Map<string, number>();

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
      return cache.get(cacheKey)!;
    }

    // Get condition effects for this depth.
    const conditionEffectsAtDepth = getConditionEffectsForConfig(
      config,
      currentConditionAtDepth,
    );

    const availableSkills = getAvailableSkills(
      currentState,
      config,
      currentConditionAtDepth,
    );
    const stallPenaltiesAtDepth = computeStallPenalties(
      currentState,
      availableSkills,
      config,
      conditionEffectsAtDepth,
      modeCompGoal,
      modePerfGoal,
    );
    // Apply move ordering to search promising skills first
    const orderedSkills = orderSkillsForSearch(
      availableSkills,
      currentState,
      config,
      orderingCompGoal,
      orderingPerfGoal,
      conditionEffectsAtDepth,
      stallPenaltiesAtDepth,
    );

    // Apply adaptive beam search: use narrower beam for deep searches
    const effectiveBeamWidth = cfg.useAdaptiveBeamWidth
      ? getAdaptiveBeamWidth(cfg.beamWidth, remainingDepth, activeDepth)
      : cfg.beamWidth;
    const beamSkills = orderedSkills.slice(0, effectiveBeamWidth);

    let bestScore = scoreState(
      currentState,
      targetCompletion,
      targetPerfection,
      isSublime,
      targetMult,
      isTraining,
      config.maxCompletion,
      config.maxPerfection,
    );

    for (const skill of beamSkills) {
      const newState = applySkill(
        currentState,
        skill,
        config,
        conditionEffectsAtDepth,
        targetCompletion,
        currentConditionAtDepth,
      );
      if (newState === null) continue;

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
      if (score > bestScore) {
        bestScore = score;
      }

      // Alpha-beta pruning: if we found a score better than what the parent
      // could guarantee, we can prune this branch
      if (cfg.useAlphaBeta && bestScore >= beta) {
        metrics.pruned++;
        break;
      }
    }

    cache.set(cacheKey, bestScore);
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
      // Check if active goals are met
      if (targetsMetForCurrentMode(currentState)) {
        break;
      }

      const globalDepth = startDepthIndex + currentDepth;
      const conditionEffectsAtDepth = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );
      const skills = getAvailableSkills(currentState, config, conditionAtDepth);
      const stallPenaltiesAtDepth = computeStallPenalties(
        currentState,
        skills,
        config,
        conditionEffectsAtDepth,
        modeCompGoal,
        modePerfGoal,
      );
      // Apply move ordering for faster path finding
      const orderedSkills = orderSkillsForSearch(
        skills,
        currentState,
        config,
        orderingCompGoal,
        orderingPerfGoal,
        conditionEffectsAtDepth,
        stallPenaltiesAtDepth,
      );
      let bestSkill: SkillDefinition | null = null;
      let bestScore = -Infinity;
      let bestNextState: CraftingState | null = null;
      let bestNextCondition: CraftingConditionType | null = null;
      let bestNextConditionQueue: CraftingConditionType[] | null = null;

      for (const skill of orderedSkills) {
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
          maxDepth - currentDepth - 1,
          globalDepth + 1,
          conditionAtDepth,
          conditionQueueAtDepth,
          skill,
        );
        const nextConditionState = getMostLikelyConditionStateAfterSkill(
          nextState,
          conditionAtDepth,
          conditionQueueAtDepth,
          skill,
        );
        if (score > bestScore) {
          bestScore = score;
          bestSkill = skill;
          bestNextState = nextState;
          bestNextCondition = nextConditionState.nextCondition;
          bestNextConditionQueue = nextConditionState.nextQueue;
        }
      }

      if (
        bestSkill &&
        bestNextState &&
        bestNextCondition &&
        bestNextConditionQueue
      ) {
        path.push(bestSkill.name);
        currentState = bestNextState;
        conditionAtDepth = bestNextCondition;
        conditionQueueAtDepth = bestNextConditionQueue;
        currentDepth++;
      } else {
        break;
      }
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
    const availableSkills = getAvailableSkills(
      state,
      config,
      normalizedCurrentCondition,
    );
    const firstMoveStallPenalties = computeStallPenalties(
      state,
      availableSkills,
      config,
      currentConditionEffects,
      modeCompGoal,
      modePerfGoal,
    );
    const orderedSkills = orderSkillsForSearch(
      availableSkills,
      state,
      config,
      orderingCompGoal,
      orderingPerfGoal,
      currentConditionEffects,
      firstMoveStallPenalties,
    );
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

      const followUpSkills = getAvailableSkills(
        stateAfterSkill,
        config,
        conditionAtDepth,
      );
      if (followUpSkills.length === 0) return undefined;

      const followUpConditionEffects = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );
      const followUpStallPenalties = computeStallPenalties(
        stateAfterSkill,
        followUpSkills,
        config,
        followUpConditionEffects,
        modeCompGoal,
        modePerfGoal,
      );

      const orderedFollowUpSkills = orderSkillsForSearch(
        followUpSkills,
        stateAfterSkill,
        config,
        orderingCompGoal,
        orderingPerfGoal,
        followUpConditionEffects,
        followUpStallPenalties,
      );

      let bestFollowUp: SkillDefinition | null = null;
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

      for (const followUp of orderedFollowUpSkills) {
        const nextState = applySkill(
          stateAfterSkill,
          followUp,
          config,
          followUpConditionEffects,
          targetCompletion,
          conditionAtDepth,
        );
        if (nextState === null) continue;

        const { expectedGains, immediateGains } = calculateRecommendationGains(
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
          : scoreStateWithTerminalPenalty(nextState, conditionAtDepth);

        if (followUpScore > bestFollowUpScore) {
          bestFollowUpScore = followUpScore;
          bestFollowUp = followUp;
          bestFollowUpExpectedGains = expectedGains;
          bestFollowUpImmediateGains = immediateGains;
        }
      }

      if (!bestFollowUp) return undefined;
      return {
        name: bestFollowUp.name,
        type: bestFollowUp.type,
        icon: bestFollowUp.icon,
        expectedGains: bestFollowUpExpectedGains,
        immediateGains: bestFollowUpImmediateGains,
      };
    }

    // First pass: evaluate ALL first-level skills with basic scoring
    // This ensures we always have alternatives even if deep search times out
    for (const skill of orderedSkills) {
      const newState = applySkill(
        state,
        skill,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );
      if (newState === null) continue;

      const { expectedGains, immediateGains } = calculateRecommendationGains(
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

      // Use immediate score as baseline (no deep search yet)
      const immediateScore =
        scoreStateWithTerminalPenalty(
          newState,
          firstMoveConditionState.nextCondition,
        ) + (firstMoveStallPenalties.get(skill.key) ?? 0);

      evaluatedFirstMoves.push({
        skill,
        expectedGains,
        immediateGains,
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
    scored.sort((a, b) => b.score - a.score);
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
        // Deep evaluation — apply stall penalty so that deprioritised
        // actions don't outrank progress skills purely via tree score.
        rec.score =
          evaluateFutureScoreAfterSkill(
            newState,
            Math.max(0, depthToSearch - 1),
            1,
            normalizedCurrentCondition,
            initialConditionQueue,
            rec.skill,
          ) + (firstMoveStallPenalties.get(rec.skill.key) ?? 0);
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

    scored.sort((a, b) => b.score - a.score);

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

    // Calculate turns remaining (estimate based on progress needed)
    const compRemaining = Math.max(
      0,
      effectiveCompGoal - finalState.completion,
    );
    const perfRemaining = Math.max(
      0,
      effectivePerfGoal - finalState.perfection,
    );
    const avgGainPerTurn = 15; // Rough estimate
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
  const rankedSkills = rankRecommendations(scoredSkills);

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
