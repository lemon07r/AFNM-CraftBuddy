import type { SearchConfig } from './types';

import { DEFAULT_SEARCH_GOAL_PRIORITY_BIAS } from '../../utils/searchGoalPriority';

export { DEFAULT_SEARCH_CONFIG, getAdaptiveBeamWidth };

/** Default search configuration — generous budget for turn-based gameplay */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  timeBudgetMs: 2000,
  maxNodes: 750000,
  beamWidth: 10,
  goalPriorityBias: DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  progressBucketSize: 100,
  useIterativeDeepening: true,
  iterativeDeepeningMinDepth: 3,
  useAdaptiveBeamWidth: true,
  enableConditionBranchingAfterForecast: true,
  conditionBranchLimit: 2,
  conditionBranchMinProbability: 0.15,
  overcraftAmbition: true,
  perfectionBandGoal: 0,
  completionBandCeiling: 0,
};

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
