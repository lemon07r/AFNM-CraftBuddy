import { CraftingState } from '../state';

import {
  OptimizerConfig,
  isTerminalState,
  SkillDefinition,
  getConditionEffectsForConfig,
  calculateSkillGains,
  applySkill,
  calculateActionSurvivabilityFloor,
} from '../skills';

import type {
  CraftingConditionType,
  TerminalStateClassification,
  ActionSurvivabilityFloor,
  SkillRecommendation,
} from './types';

import { hasAnyActiveGoal, goalsMet } from './goals';

import { SCORING } from './scoring';

export {
  hasGuaranteedSafeStabilizeAction,
  hasFatalTechniqueFailure,
  shouldDeprioritizeAgainstGuaranteedSafeStabilize,
  shouldUseSurvivabilityFloorForContinuation,
  applySurvivabilityFloorToState,
  classifyTerminalState,
};

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

function applySurvivabilityFloorToState(
  displayState: CraftingState,
  survivabilityFloor: ActionSurvivabilityFloor,
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

  // Do not let an immediate floor-death branch masquerade as a live
  // continuation line just because EV-only recovery procs would keep it alive.
  if (floorStability <= 0) {
    return hasGuaranteedSafeStabilize || !baseSuccessSecuredAfterAction;
  }

  if (
    hasGuaranteedSafeStabilize &&
    hasProbabilisticRunwayGap &&
    floorStability < minimumGuaranteedContinuationStability
  ) {
    return !baseSuccessSecuredAfterAction;
  }

  return (
    !baseSuccessSecuredAfterAction &&
    currentStability <= 1 &&
    hasProbabilisticRunwayGap
  );
}

/** EV progress cannot secure a craft that ends below target on technique failure. */
function hasFatalTechniqueFailure(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig>,
  currentCondition: CraftingConditionType,
  targetCompletion: number,
  targetPerfection: number,
): boolean {
  // Expected stability can stay positive when success restores stability, so
  // the failure transition is the only reliable test.
  if (skill.actionKind === 'item') return false;
  const expected = calculateSkillGains(state, skill, config, conditionEffects);
  const onSuccess = calculateSkillGains(
    state,
    skill,
    config,
    conditionEffects,
    {
      successChance: 1,
    },
  );
  if (
    expected.completion >= onSuccess.completion &&
    expected.perfection >= onSuccess.perfection
  )
    return false;
  // Use the real transition: masteries still run, payment still happens and
  // guaranteed buff/harmony effects can secure the goal even on failure.
  const failure = applySkill(
    state,
    skill,
    config,
    conditionEffects,
    targetCompletion,
    currentCondition,
    targetPerfection,
    { successChance: 0 },
  );
  return (
    failure !== null &&
    failure.stability <= 0 &&
    !goalsMet(failure, targetCompletion, targetPerfection)
  );
}

function shouldDeprioritizeAgainstGuaranteedSafeStabilize(params: {
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

  if (baseSuccessSecuredAfterAction) {
    return false;
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
    if (skill.type !== 'stabilize') {
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

/**
 * Orders recommendations so a viable guaranteed-safe line outranks a line
 * that only survives probabilistically. A safe line that certainly ends the
 * craft below target is not viable: it ranks with the gambles by score, and
 * without any viable safe line candidates keep score order, so a certain
 * failure never beats a winnable gamble. When no line is unsafe, candidates
 * also keep score order. The result does not depend on input order.
 */
export function orderRecommendationsBySafety<T extends SkillRecommendation>(
  recommendations: readonly T[],
  compareByScore: (a: T, b: T) => number,
  isUnsafe: (recommendation: T) => boolean,
): T[] {
  const live = [...recommendations];
  const yieldsToViableLine = (recommendation: T): boolean =>
    isUnsafe(recommendation) || recommendation.endsCraftBelowTarget === true;
  const applySafetyTier =
    live.some(isUnsafe) &&
    live.some((recommendation) => !yieldsToViableLine(recommendation));
  live.sort((a, b) => {
    if (applySafetyTier) {
      const aYields = yieldsToViableLine(a);
      if (aYields !== yieldsToViableLine(b)) return aYields ? 1 : -1;
    }
    return compareByScore(a, b);
  });
  return live;
}
