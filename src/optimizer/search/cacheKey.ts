import { CraftingState } from '../state';

import type { CraftingConditionType } from './types';

export { getNormalizedCacheKey };

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

  const key = `${state.getCacheKey()}:${compKey}:${perfKey}:${remainingDepth}:${conditionType || 'n'}:${queueKey}`;
  // Generic interceptor expressions can read the full step, not just Su's phase.
  const intercepted = Array.from(state.buffs.values()).some(
    (buff) => buff.definition?.craftingEffectInterceptors?.length,
  );
  return intercepted ? `${key}:step:${state.step}` : key;
}
