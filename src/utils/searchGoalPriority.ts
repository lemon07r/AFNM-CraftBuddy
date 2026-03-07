export const SEARCH_GOAL_PRIORITY_BIAS_MIN = -100;
export const SEARCH_GOAL_PRIORITY_BIAS_MAX = 100;
export const SEARCH_GOAL_PRIORITY_BIAS_STEP = 25;
export const DEFAULT_SEARCH_GOAL_PRIORITY_BIAS = 0;

export function clampSearchGoalPriorityBias(
  value: number,
  fallback: number = DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const snapped =
    Math.round(numeric / SEARCH_GOAL_PRIORITY_BIAS_STEP) *
    SEARCH_GOAL_PRIORITY_BIAS_STEP;
  return Math.max(
    SEARCH_GOAL_PRIORITY_BIAS_MIN,
    Math.min(SEARCH_GOAL_PRIORITY_BIAS_MAX, snapped),
  );
}

export function formatSearchGoalPriorityBias(value: number): string {
  const bias = clampSearchGoalPriorityBias(value);
  if (bias === 0) {
    return 'Balanced';
  }

  const direction = bias > 0 ? 'Completion' : 'Perfection';
  return `${direction} ${Math.abs(bias)}%`;
}
