/**
 * CraftBuddy - Search Algorithms
 *
 * Implements greedy and lookahead search algorithms to find the optimal
 * next skill to use during crafting.
 *
 * Performance optimizations:
 * - Move ordering: Search promising skills first (buff skills when no buff, high-gain skills)
 * - Memoization: Cache search results by state key with progress bucketing for large numbers
 * - Beam search: Limit branches explored at each depth level
 * - Early termination: Stop when targets are met
 * - Time budget: Prevent UI freezes with configurable time limits
 * - Iterative deepening: For 90+ round scenarios, start shallow and deepen
 */

import { CraftingState } from './state';

import { OptimizerConfig } from './skills';

import type {
  CraftingConditionType,
  SearchConfig,
  SearchResult,
} from './search/types';

import { greedySearch } from './search/greedy';

import { lookaheadSearch } from './search/lookahead';

import { getNormalizedCacheKey } from './search/cacheKey';

import { getGeneratedConditionDistribution } from './search/conditions';

import { scoreState, scoreFinishedOutcome, SCORING } from './search/scoring';

import {
  deriveBandGoals,
  calculateFinishSuccessChance,
  evaluateCraftEndOutcomeDistribution,
  getProgressTowardRawGoal,
  getThresholdForGuaranteedBonusCount,
} from './search/goals';

import { evaluateHarmonySubsystemQuality } from './search/harmonyScoring';

import {
  buildScoringContext,
  estimateTurnsRemainingFromContext,
} from './search/scoringContext';

import { rankRecommendations } from './search/ranking';

export type {
  SkillRecommendation,
  SetupForHint,
  OutcomeBarStatus,
  OutcomeProjection,
  SearchResult,
  SearchConfig,
  ConditionTransitionProvider,
  CraftingConditionType,
} from './search/types';

export {
  VISIBLE_CONDITION_QUEUE_LENGTH,
  setConditionTransitionProvider,
  normalizeForecastConditionQueue,
} from './search/conditions';

export { orderRecommendationsBySafety } from './search/safety';

export { recomputeQualityRatings } from './search/ranking';

export { greedySearch } from './search/greedy';

export { lookaheadSearch } from './search/lookahead';

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
  getNormalizedCacheKey,
  getGeneratedConditionDistribution,
  scoreState,
  scoreFinishedOutcome,
  deriveBandGoals,
  calculateFinishSuccessChance,
  evaluateCraftEndOutcomeDistribution,
  evaluateHarmonySubsystemQuality,
  getProgressTowardRawGoal,
  getThresholdForGuaranteedBonusCount,
  buildScoringContext,
  estimateTurnsRemainingFromContext,
  rankRecommendations,
  SCORING,
} as const;
