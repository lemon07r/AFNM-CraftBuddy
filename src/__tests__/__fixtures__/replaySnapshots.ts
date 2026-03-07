import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  replayOptimizerSnapshot,
  reviveConfigSnapshot,
  reviveStateSnapshot,
  type OptimizerReplaySnapshot,
} from '../../modContent/replaySnapshot';

export { replayOptimizerSnapshot };
export {
  reviveConfigSnapshot as reviveReplayConfig,
  reviveStateSnapshot as reviveReplayState,
};

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
    searchConfig: snapshot.input.searchConfig,
  };
}
