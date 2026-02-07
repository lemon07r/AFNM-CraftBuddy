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
  getAvailableSkills,
  calculateSkillGains,
  isTerminalState,
  getBlockedSkillReasons,
  getConditionEffectsForConfig,
} from './skills';

export interface SkillRecommendation {
  skill: SkillDefinition;
  expectedGains: {
    completion: number;
    perfection: number;
    stability: number;
  };
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
    expectedGains: {
      completion: number;
      perfection: number;
      stability: number;
    };
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
  /** Maximum time budget in milliseconds (default: 200ms) */
  timeBudgetMs: number;
  /** Maximum nodes to explore before stopping (default: 100000) */
  maxNodes: number;
  /** Beam width - max branches to explore at each level (default: 6) */
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
  timeBudgetMs: 175,
  maxNodes: 85000,
  beamWidth: 6,
  useAlphaBeta: true,
  progressBucketSize: 100,
  useIterativeDeepening: true,
  iterativeDeepeningMinDepth: 3,
  useAdaptiveBeamWidth: true,
  enableConditionBranchingAfterForecast: true,
  conditionBranchLimit: 2,
  conditionBranchMinProbability: 0.15,
};

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

/**
 * Generate a normalized cache key that buckets large progress values.
 * This improves cache hit rates significantly in late game scenarios.
 */
function getNormalizedCacheKey(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number,
  remainingDepth: number,
  conditionType: string | undefined,
  nextConditionQueue: CraftingConditionType[],
  bucketSize: number,
): string {
  // For progress values, we care about:
  // 1. Whether we've met the target (exact match matters)
  // 2. How far we are from the target (bucketed for large values)
  const compMet = state.completion >= targetCompletion;
  const perfMet = state.perfection >= targetPerfection;

  // If targets are met, we don't need fine-grained progress tracking
  const compKey = compMet
    ? 'MET'
    : bucketProgress(state.completion, bucketSize);
  const perfKey = perfMet
    ? 'MET'
    : bucketProgress(state.perfection, bucketSize);
  const queueKey =
    nextConditionQueue.length > 0 ? nextConditionQueue.join('|') : '-';

  return `${state.getCacheKey()}:${compKey}:${perfKey}:${remainingDepth}:${conditionType || 'n'}:${queueKey}`;
}

/**
 * Score a state based on progress toward targets.
 *
 * Scoring priorities:
 * 1. Progress toward completion and perfection targets (primary)
 * 2. Large bonus for meeting both targets
 * 3. Bonus for active buffs (they enable higher gains on future turns)
 * 4. Penalty for going over targets (wasted resources) - reduced/removed for sublime crafting
 * 5. Resource efficiency bonuses (qi and stability remaining)
 * 6. Penalty for risky states (low stability)
 *
 * The scoring is designed to:
 * - Strongly prefer states that meet targets
 * - Value buff setup as investment for future gains
 * - Balance progress with resource conservation
 * - For sublime crafting: encourage exceeding targets (up to multiplier limit)
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
    // No targets - maximize minimum of both (balanced progress)
    return Math.min(state.completion, state.perfection);
  }

  // For sublime crafting, the effective target is multiplied
  // This allows the optimizer to aim for higher values without penalty
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

  // Calculate progress toward each target as a percentage (0-1)
  // Guard against zero targets (e.g., recipes that only require completion OR perfection)
  const compProgressPct =
    effectiveCompGoal > 0
      ? Math.min(state.completion / effectiveCompGoal, 1)
      : 1;
  const perfProgressPct =
    effectivePerfGoal > 0
      ? Math.min(state.perfection / effectivePerfGoal, 1)
      : 1;

  // Score based on progress toward targets (primary scoring)
  // Use actual progress values for the base score
  const compProgress =
    effectiveCompGoal > 0 ? Math.min(state.completion, effectiveCompGoal) : 0;
  const perfProgress =
    effectivePerfGoal > 0 ? Math.min(state.perfection, effectivePerfGoal) : 0;
  let score = compProgress + perfProgress;

  // Large bonus for meeting both BASE targets - this is the minimum goal
  const baseTargetsMet =
    (targetCompletion <= 0 || state.completion >= targetCompletion) &&
    (targetPerfection <= 0 || state.perfection >= targetPerfection);

  // For sublime crafting, also check if we've met the extended targets
  const sublimeTargetsMet =
    isSublimeCraft &&
    (effectiveCompTarget <= 0 || state.completion >= effectiveCompTarget) &&
    (effectivePerfTarget <= 0 || state.perfection >= effectivePerfTarget);

  if (sublimeTargetsMet) {
    score += 300; // Even bigger bonus for hitting sublime targets
    score += state.qi * 0.05;
    score += state.stability * 0.05;
  } else if (baseTargetsMet) {
    score += 200; // Significant bonus for achieving the base goal

    // Additional bonus for resource efficiency when targets are met
    // Prefer paths that leave more qi and stability for safety margin
    score += state.qi * 0.05; // Bonus for remaining qi
    score += state.stability * 0.05; // Bonus for remaining stability

    // For sublime crafting, add bonus for progress beyond base targets
    if (isSublimeCraft) {
      const compBeyondBase = Math.max(0, state.completion - targetCompletion);
      const perfBeyondBase = Math.max(0, state.perfection - targetPerfection);
      // Reward progress toward sublime targets (but less than base progress)
      score += (compBeyondBase + perfBeyondBase) * 0.5;
    }
  } else {
    // Bonus for active buffs when targets not yet met
    // Buffs are valuable because they amplify future skill gains
    // The value of buffs decreases as we get closer to targets (less future turns to use them)
    const remainingWorkPct = 1 - (compProgressPct + perfProgressPct) / 2;

    if (state.hasControlBuff()) {
      // Control buff helps with perfection - value it more when perfection is needed
      const perfNeedPct = 1 - perfProgressPct;
      score += state.controlBuffTurns * 3 * perfNeedPct * remainingWorkPct;
    }
    if (state.hasIntensityBuff()) {
      // Intensity buff helps with completion - value it more when completion is needed
      const compNeedPct = 1 - compProgressPct;
      score += state.intensityBuffTurns * 3 * compNeedPct * remainingWorkPct;
    }

    // Small bonus for resource efficiency even when targets not met
    // This helps break ties between similar states
    score += state.qi * 0.01;
    score += state.stability * 0.01;
  }

  // Penalize going over targets (wasted resources)
  // For sublime crafting: no penalty until we exceed the multiplied target
  // For normal crafting: small penalty for overshooting
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
    // For sublime: only penalize if we exceed the multiplied target
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

  // Hard-cap violation penalty (strong). In normal operation applySkill clamps these,
  // but keep this as defensive scoring in case an input state already exceeds caps.
  if (maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)) {
    score -= Math.max(0, state.completion - maxCompletionCap) * 3;
  }
  if (maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)) {
    score -= Math.max(0, state.perfection - maxPerfectionCap) * 3;
  }

  // Penalty for low stability (risky state)
  // In training mode, reduce penalty since failure has no real consequences
  const stabilityThreshold = trainingMode ? 10 : 25;
  const stabilityPenaltyWeight = trainingMode ? 3 : 10;
  if (state.stability < stabilityThreshold) {
    const stabilityRisk =
      (stabilityThreshold - state.stability) / stabilityThreshold; // 0 to 1
    score -= stabilityRisk * stabilityRisk * stabilityPenaltyWeight;
  }

  // Small penalty for high toxicity in alchemy crafting
  if (state.maxToxicity > 0 && state.hasDangerousToxicity()) {
    score -= 5;
  }

  // Harmony bonus/penalty for sublime crafts
  // Higher harmony → more positive conditions → better stats over time
  if (isSublimeCraft) {
    // Harmony ranges from -100 to 100. Normalize to a scoring bonus.
    // Positive harmony is good (more positive conditions), negative is bad.
    score += state.harmony * 0.15;
  }

  return score;
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
 * Priority order:
 * 1. Stabilize skills when stability is low (<= 25)
 * 2. Buff-granting skills when no buff is active
 * 3. Buff-consuming skills (Disciplined Touch) when buffs are active
 * 4. High-gain skills (completion/perfection > 10)
 * 5. Other skills
 */
function orderSkillsForSearch(
  skills: SkillDefinition[],
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number,
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

    // Deprioritize qi-restore skills when qi is already near max
    // This prevents recommending Fairy's Blessing, Unstable Reenergisation, etc. at full qi
    if (qiNearMax) {
      const isQiRestoreSkill =
        skill.restoresQi ||
        (skill.effects || []).some(
          (effect) =>
            effect?.kind === 'pool' &&
            (effect.amount?.value ?? 0) > 0,
        );
      if (isQiRestoreSkill) {
        // Significant penalty - only use if no other options
        priority -= 500;
      }
    }

    // Item actions can unlock better follow-up turns (pool restore, emergency stability, buff setup).
    if (skill.actionKind === 'item') {
      const hasImmediateImpact = (skill.effects || []).some(
        (effect) =>
          effect?.kind === 'completion' ||
          effect?.kind === 'perfection' ||
          effect?.kind === 'stability' ||
          // Only count pool effects as valuable if qi is not near max
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

    // Medium priority: skills that address current needs
    if (needsCompletion && skill.baseCompletionGain > 0) {
      priority += skill.baseCompletionGain * 2;
    }
    if (needsPerfection && skill.basePerfectionGain > 0) {
      priority += skill.basePerfectionGain * 2;
    }

    // Bonus for using buffs effectively
    if (hasControlBuff && skill.scalesWithControl) {
      priority += 100;
    }
    if (hasIntensityBuff && skill.scalesWithIntensity) {
      priority += 100;
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
  const normalizedCurrentCondition =
    normalizeConditionType(currentConditionType);

  // Check if targets already met
  // For sublime crafting, do NOT terminate at base targets; allow optimizer to push beyond.
  if (!isSublime && targetCompletion > 0 && targetPerfection > 0) {
    if (state.targetsMet(targetCompletion, targetPerfection)) {
      return {
        recommendation: null,
        alternativeSkills: [],
        isTerminal: false,
        targetsMet: true,
      };
    }
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
  const scoredSkills: SkillRecommendation[] = [];

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

    const gains = calculateSkillGains(state, skill, config, conditionEffects);
    const score = scoreState(
      newState,
      targetCompletion,
      targetPerfection,
      isSublime,
      targetMult,
      isTraining,
      config.maxCompletion,
      config.maxPerfection,
    );
    const reasoning = generateReasoning(
      skill,
      state,
      gains,
      targetCompletion,
      targetPerfection,
    );

    scoredSkills.push({
      skill,
      expectedGains: gains,
      score,
      reasoning,
    });
  }

  // Sort by score descending
  scoredSkills.sort((a, b) => b.score - a.score);

  if (scoredSkills.length === 0) {
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
    recommendation: scoredSkills[0],
    alternativeSkills: scoredSkills.slice(1),
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
  const targetsMetForCurrentMode = (candidate: CraftingState): boolean => {
    if (isSublime) {
      return (
        (effectiveCompGoal <= 0 || candidate.completion >= effectiveCompGoal) &&
        (effectivePerfGoal <= 0 || candidate.perfection >= effectivePerfGoal)
      );
    }
    if (targetCompletion > 0 && targetPerfection > 0) {
      return candidate.targetsMet(targetCompletion, targetPerfection);
    }
    return false;
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

    // Base case: depth exhausted or terminal
    if (
      remainingDepth === 0 ||
      isTerminalState(currentState, config, currentConditionAtDepth)
    ) {
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
      targetCompletion,
      targetPerfection,
      remainingDepth,
      currentConditionAtDepth,
      nextConditionQueueAtDepth,
      cfg.progressBucketSize,
    );
    if (cache.has(cacheKey)) {
      metrics.cacheHits++;
      return cache.get(cacheKey)!;
    }

    const availableSkills = getAvailableSkills(
      currentState,
      config,
      currentConditionAtDepth,
    );
    // Apply move ordering to search promising skills first
    const orderedSkills = orderSkillsForSearch(
      availableSkills,
      currentState,
      config,
      targetCompletion,
      targetPerfection,
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

    // Get condition effects for this depth
    const conditionEffectsAtDepth = getConditionEffectsForConfig(
      config,
      currentConditionAtDepth,
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
      const skills = getAvailableSkills(currentState, config, conditionAtDepth);
      // Apply move ordering for faster path finding
      const orderedSkills = orderSkillsForSearch(
        skills,
        currentState,
        config,
        targetCompletion,
        targetPerfection,
      );
      let bestSkill: SkillDefinition | null = null;
      let bestScore = -Infinity;
      let bestNextState: CraftingState | null = null;
      let bestNextCondition: CraftingConditionType | null = null;
      let bestNextConditionQueue: CraftingConditionType[] | null = null;

      // Get condition effects for this depth
      const conditionEffectsAtDepth = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );

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
    const availableSkills = getAvailableSkills(
      state,
      config,
      normalizedCurrentCondition,
    );
    const orderedSkills = orderSkillsForSearch(
      availableSkills,
      state,
      config,
      targetCompletion,
      targetPerfection,
    );
    const scored: SkillRecommendation[] = [];

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

      const orderedFollowUpSkills = orderSkillsForSearch(
        followUpSkills,
        stateAfterSkill,
        config,
        targetCompletion,
        targetPerfection,
      );

      let bestFollowUp: SkillDefinition | null = null;
      let bestFollowUpScore = -Infinity;
      let bestFollowUpGains = { completion: 0, perfection: 0, stability: 0 };

      const followUpConditionEffects = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );

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

        const followUpGains = calculateSkillGains(
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
          : scoreState(
              nextState,
              targetCompletion,
              targetPerfection,
              config.isSublimeCraft || false,
              config.targetMultiplier || 2.0,
              isTraining,
              config.maxCompletion,
              config.maxPerfection,
            );

        if (followUpScore > bestFollowUpScore) {
          bestFollowUpScore = followUpScore;
          bestFollowUp = followUp;
          bestFollowUpGains = followUpGains;
        }
      }

      if (!bestFollowUp) return undefined;
      return {
        name: bestFollowUp.name,
        type: bestFollowUp.type,
        icon: bestFollowUp.icon,
        expectedGains: bestFollowUpGains,
      };
    }

    const currentConditionEffects = getConditionEffectsForConfig(
      config,
      normalizedCurrentCondition,
    );

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

      const gains = calculateSkillGains(
        state,
        skill,
        config,
        currentConditionEffects,
      );
      const reasoning = generateReasoning(
        skill,
        state,
        gains,
        targetCompletion,
        targetPerfection,
      );

      // Use immediate score as baseline (no deep search yet)
      const immediateScore = scoreState(
        newState,
        targetCompletion,
        targetPerfection,
        config.isSublimeCraft || false,
        config.targetMultiplier || 2.0,
        isTraining,
        config.maxCompletion,
        config.maxPerfection,
      );

      scored.push({
        skill,
        expectedGains: gains,
        score: immediateScore,
        reasoning,
        consumesBuff: skill.isDisciplinedTouch === true,
        followUpSkill: undefined, // Will be filled in second pass if budget allows
      });
    }

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
        // Deep evaluation
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

    scored.sort((a, b) => b.score - a.score);
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
    const compRemaining = Math.max(0, effectiveCompGoal - finalState.completion);
    const perfRemaining = Math.max(0, effectivePerfGoal - finalState.perfection);
    const avgGainPerTurn = 15; // Rough estimate
    const turnsRemaining = Math.ceil(
      (compRemaining + perfRemaining) / avgGainPerTurn,
    );

    expectedFinalState = {
      completion: finalState.completion,
      perfection: finalState.perfection,
      stability: finalState.stability,
      qi: finalState.qi,
      turnsRemaining: turnsRemaining > 0 ? turnsRemaining : 0,
    };
  }

  // Record final metrics
  metrics.timeTakenMs = Date.now() - startTime;

  return {
    recommendation: scoredSkills[0],
    alternativeSkills: scoredSkills.slice(1),
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
