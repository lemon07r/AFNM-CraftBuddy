import { CraftingState } from '../state';

import { getBonusAndChance } from '../gameTypes';

import {
  bandLadderSum,
  tierForBands,
  type OutcomeBands,
  type OutcomeTier,
  buildOutcomeBands,
  TIER_REQUIREMENTS,
  bandThreshold,
} from '../outcome';

export {
  deriveBandGoals,
  hasAnyActiveGoal,
  goalsMet,
  calculateImmediateProgressTowardGoals,
  calculateFinishSuccessChance,
  evaluateCraftEndOutcomeDistribution,
  getProgressTowardRawGoal,
  getThresholdForGuaranteedBonusCount,
};

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

  return bandLadderSum(target, Math.max(0, Math.floor(guaranteedCount)));
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

      const tier = tierForBands(
        targetCompletion > 0 ? completionOutcome.guaranteed : 1,
        targetPerfection > 0 ? perfectionOutcome.guaranteed : 0,
        hasDistinctSublimeOutcome &&
          targetCompletion > 0 &&
          targetPerfection > 0,
      );
      if (tier === 'failed') {
        failChance += probability;
      } else if (tier === 'sublime') {
        sublimeChance += probability;
      } else if (tier === 'perfect') {
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

/**
 * Band-threshold goals for scoring and search termination.
 *
 * `targetMultiplier` is retained on scorer signatures for compatibility and
 * diagnostics only — it no longer drives goal derivation. Goals come from the
 * runtime band ladder (`bandThreshold` / `TIER_REQUIREMENTS`).
 */
interface BandGoals {
  baseCompGoal: number;
  basePerfGoal: number;
  effectiveCompGoal: number;
  effectivePerfGoal: number;
  bands: OutcomeBands;
  targetTier: OutcomeTier;
}

function clampGoalByCap(goal: number, cap: number | undefined): number {
  if (cap !== undefined && Number.isFinite(cap) && cap > 0) {
    return Math.min(goal, cap);
  }
  return goal;
}

function deriveBandGoals(
  targetCompletion: number,
  targetPerfection: number,
  isSublimeCraft: boolean = false,
  maxCompletionCap?: number,
  maxPerfectionCap?: number,
  perfectionBandGoal?: number,
  completionBandCeiling?: number,
): BandGoals {
  const bands = buildOutcomeBands({
    targetCompletion,
    targetPerfection,
    isSublimeCraft,
    maxCompletionCap,
    maxPerfectionCap,
    perfectionBandGoal,
    completionBandCeiling,
  });
  const targetTier = bands.targetTier;
  const perfectReq = TIER_REQUIREMENTS.perfect;
  const targetReq = TIER_REQUIREMENTS[targetTier];

  // Perfect-tier (1-band) goals — the base success floor.
  const baseCompGoal = clampGoalByCap(
    targetCompletion > 0
      ? bandThreshold(targetCompletion, perfectReq.completion)
      : 0,
    maxCompletionCap,
  );
  const basePerfGoal = clampGoalByCap(
    targetPerfection > 0
      ? bandThreshold(targetPerfection, perfectReq.perfection)
      : 0,
    maxPerfectionCap,
  );

  // Target-tier goals (perfect or sublime). A cap below the band threshold
  // genuinely blocks that tier — keep the clamp.
  const effectiveCompGoal = clampGoalByCap(
    targetCompletion > 0
      ? bandThreshold(targetCompletion, targetReq.completion)
      : 0,
    maxCompletionCap,
  );
  // User perfection ambition only ever *raises* the goal, and only above the
  // tier requirement: the tier gate still comes from TIER_REQUIREMENTS, so
  // asking for more stars adds work to chase rather than changing what counts
  // as success. The cap clamp still applies - the game can never bank past it.
  const ambitionPerfBands = bands.ambitionPerfectionBands;
  const perfGoalBands =
    ambitionPerfBands !== undefined && ambitionPerfBands > targetReq.perfection
      ? ambitionPerfBands
      : targetReq.perfection;
  const effectivePerfGoal = clampGoalByCap(
    targetPerfection > 0 ? bandThreshold(targetPerfection, perfGoalBands) : 0,
    maxPerfectionCap,
  );

  return {
    baseCompGoal,
    basePerfGoal,
    effectiveCompGoal,
    effectivePerfGoal,
    bands,
    targetTier,
  };
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
