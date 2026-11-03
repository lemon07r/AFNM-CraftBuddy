import { CraftingState } from '../state';

import {
  OptimizerConfig,
  isTerminalState,
  getBlockedSkillReasons,
  getConditionEffectsForConfig,
  applySkill,
  getAvailableSkills,
  calculateActionSurvivabilityFloor,
} from '../skills';

import type {
  CraftingConditionType,
  SearchConfig,
  SearchResult,
  CandidateTieBreakMetrics,
  SkillRecommendation,
  UnsafeCandidateClassification,
} from './types';

import {
  withOutcomeProjection,
  calculateRecommendationGains,
  generateReasoning,
  populateSetupHints,
} from './presentation';

import { DEFAULT_SEARCH_CONFIG } from './config';

import { buildScoringContext } from './scoringContext';

import { normalizeConditionType } from './conditions';

import {
  deriveBandGoals,
  goalsMet,
  calculateImmediateProgressTowardGoals,
} from './goals';

import {
  computeScoreTieWindow,
  compareTieBreakMetrics,
  rankRecommendations,
} from './ranking';

import { willAutoFinish } from '../outcome';

import {
  hasGuaranteedSafeStabilizeAction,
  hasFatalTechniqueFailure,
  shouldDeprioritizeAgainstGuaranteedSafeStabilize,
  shouldUseSurvivabilityFloorForContinuation,
  applySurvivabilityFloorToState,
  classifyTerminalState,
} from './safety';

import { scoreFinishedOutcome, scoreState } from './scoring';

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
  return withOutcomeProjection(
    runGreedySearch(
      state,
      config,
      targetCompletion,
      targetPerfection,
      currentConditionType,
      searchConfig,
    ),
    state,
    config,
    targetCompletion,
    targetPerfection,
  );
}

function runGreedySearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number,
  currentConditionType: CraftingConditionType | undefined,
  searchConfig: Partial<SearchConfig>,
): SearchResult {
  const cfg: SearchConfig = { ...DEFAULT_SEARCH_CONFIG, ...searchConfig };
  // Extract settings from config
  const isSublime = config.isSublimeCraft || false;
  // targetMultiplier retained for diagnostics/compat; goals use band thresholds.
  const targetMult = config.targetMultiplier || 2.0;
  const isTraining = config.trainingMode || false;
  const scoringCtx = buildScoringContext(
    config,
    state,
    normalizeConditionType(currentConditionType),
  );
  const bandGoals = deriveBandGoals(
    targetCompletion,
    targetPerfection,
    isSublime,
    config.maxCompletion,
    config.maxPerfection,
    cfg.perfectionBandGoal,
    cfg.completionBandCeiling,
  );
  const {
    baseCompGoal,
    basePerfGoal,
    effectiveCompGoal,
    effectivePerfGoal,
    bands: outcomeBands,
  } = bandGoals;
  const modeCompGoal = effectiveCompGoal;
  const modePerfGoal = effectivePerfGoal;
  const scoreTieWindow = computeScoreTieWindow(
    Math.max(1, effectiveCompGoal + effectivePerfGoal),
  );
  const normalizedCurrentCondition =
    normalizeConditionType(currentConditionType);
  const stateWillAutoFinish = (candidate: CraftingState): boolean =>
    willAutoFinish(candidate, outcomeBands);
  if (stateWillAutoFinish(state)) {
    return {
      status: 'autoResolved',
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: goalsMet(state, modeCompGoal, modePerfGoal),
    };
  }

  // Goals banked but craft still live (e.g. caps above tier flats): keep searching.

  // Check if terminal state
  if (isTerminalState(state, config, normalizedCurrentCondition)) {
    return {
      status: 'blocked',
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: goalsMet(state, modeCompGoal, modePerfGoal),
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

    const displayState =
      applySkill(
        state,
        recommendation.skill,
        config,
        conditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      ) ?? state;
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
    const fatalTechniqueFailure = hasFatalTechniqueFailure(
      state,
      skill,
      config,
      conditionEffects,
      normalizedCurrentCondition,
      targetCompletion,
      targetPerfection,
    );
    const unsafeWithGuaranteedSafeAlternative =
      fatalTechniqueFailure ||
      shouldDeprioritizeAgainstGuaranteedSafeStabilize({
        currentStability: state.stability,
        displayStability: displayState.stability,
        floorStability,
        goalsMetAfterAction,
        baseSuccessSecuredAfterAction,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      });
    if (unsafeWithGuaranteedSafeAlternative) {
      unsafeRecommendationKeys.add(skill.key);
    }
    const requiresProbabilisticSurvival =
      fatalTechniqueFailure ||
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
      calculateRecommendationGains(
        state,
        skill,
        config,
        conditionEffects,
        displayState,
      );
    const terminalState = classifyTerminalState(
      newState,
      config,
      normalizedCurrentCondition,
      modeCompGoal,
      modePerfGoal,
    );
    const endsByAutoFinish = stateWillAutoFinish(newState);
    // Auto-resolved and blocked successors have final bars. A playable
    // goal-met state keeps the live scorer for resonance/overcraft continuation.
    const score =
      endsByAutoFinish || terminalState.isTerminal
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
            cfg.overcraftAmbition,
            cfg.perfectionBandGoal,
            cfg.completionBandCeiling,
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
            cfg.overcraftAmbition,
            cfg.perfectionBandGoal,
            cfg.completionBandCeiling,
          );
    const reasoning = generateReasoning(
      skill,
      state,
      expectedGains,
      targetCompletion,
      targetPerfection,
      { endsCraft: endsByAutoFinish },
    );

    evaluatedMoves.push({
      skill,
      expectedGains,
      immediateGains,
      effectiveCosts,
      score,
      reasoning,
      endsCraft: endsByAutoFinish,
      endsCraftBelowTarget:
        (endsByAutoFinish || terminalState.isTerminal) &&
        !goalsMet(newState, targetCompletion, targetPerfection),
      requiresProbabilisticSurvival,
      ...terminalState,
    });
  }

  const scoredSkills: SkillRecommendation[] = evaluatedMoves.map(
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
      status: 'blocked',
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: goalsMet(state, modeCompGoal, modePerfGoal),
      blockedReasons: getBlockedSkillReasons(
        state,
        config,
        normalizedCurrentCondition,
      ),
    };
  }

  populateSetupHints(
    rankedSkills,
    state,
    config,
    targetCompletion,
    normalizedCurrentCondition,
  );

  return {
    status: 'live',
    recommendation: rankedSkills[0],
    alternativeSkills: rankedSkills.slice(1),
    isTerminal: false,
    targetsMet: goalsMet(state, modeCompGoal, modePerfGoal),
  };
}
