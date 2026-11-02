import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  replayOptimizerSnapshot,
  reviveConfigSnapshot,
  reviveStateSnapshot,
  type OptimizerReplaySnapshot,
} from '../../modContent/replaySnapshot';
import { DEFAULT_SEARCH_GOAL_PRIORITY_BIAS } from '../../utils/searchGoalPriority';

export { replayOptimizerSnapshot };
export {
  reviveConfigSnapshot as reviveReplayConfig,
  reviveStateSnapshot as reviveReplayState,
};

/**
 * Clock limit for fixed-work searches: high enough that the node budget always
 * stops the search first, so results don't depend on machine speed.
 */
export const FIXED_WORK_CLOCK_MS = 600_000;

/**
 * Freeze `Date.now()` (the search's only clock) so time budgets never stop a
 * search: results then depend on node budgets alone, not on runner speed.
 * Timers stay real. Tests that exercise the time budget opt back in with
 * `jest.useRealTimers()`.
 */
export function freezeSearchClock(): void {
  jest.useFakeTimers({
    now: 1_700_000_000_000,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
}

export function withFixedWork<T extends object>(
  searchConfig: T,
  maxNodes: number,
): T & { timeBudgetMs: number; maxNodes: number } {
  return { ...searchConfig, timeBudgetMs: FIXED_WORK_CLOCK_MS, maxNodes };
}

export function loadOptimizerReplaySnapshot(
  filename: string,
): OptimizerReplaySnapshot {
  const fixturePath = path.join(__dirname, 'replay-snapshots', filename);
  return JSON.parse(
    readFileSync(fixturePath, 'utf8'),
  ) as OptimizerReplaySnapshot;
}

export function getReplaySearchInput(snapshot: OptimizerReplaySnapshot): {
  config: ReturnType<typeof reviveConfigSnapshot>;
  state: ReturnType<typeof reviveStateSnapshot>;
  currentCondition: string;
  forecastConditions: string[];
  targetCompletion: number;
  targetPerfection: number;
  lookaheadDepth: number;
  searchConfig: typeof snapshot.input.searchConfig;
} {
  const searchConfig =
    snapshot.input.searchConfig.goalPriorityBias === undefined
      ? {
          ...snapshot.input.searchConfig,
          goalPriorityBias: DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
        }
      : snapshot.input.searchConfig;

  return {
    config: reviveConfigSnapshot(snapshot.input.config),
    state: reviveStateSnapshot(snapshot.input.state),
    currentCondition: snapshot.input.conditions.current || 'neutral',
    forecastConditions:
      snapshot.input.conditions.normalizedForecast ||
      snapshot.input.conditions.forecast ||
      [],
    targetCompletion: snapshot.input.targets.completion,
    targetPerfection: snapshot.input.targets.perfection,
    lookaheadDepth: snapshot.input.lookaheadDepth,
    searchConfig,
  };
}
