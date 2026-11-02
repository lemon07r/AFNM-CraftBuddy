/** Pure settings and score-context signatures used by recommendation caching. */
import type { OptimizerConfig, SearchConfig } from '../optimizer';
import type { CraftBuddySettings } from '../settings';
import { serializeCanonicalValue } from './craftStateSignature';

export type LastSearchSettings = Pick<
  CraftBuddySettings,
  | 'lookaheadDepth'
  | 'searchTimeBudgetMs'
  | 'searchMaxNodes'
  | 'searchBeamWidth'
  | 'searchGoalPriorityBias'
  | 'optimizerEngine'
  | 'overcraftAmbition'
  | 'perfectionBandGoal'
  | 'completionBandCeiling'
>;

export function snapshotSearchSettings(
  settings: CraftBuddySettings,
): LastSearchSettings {
  return {
    lookaheadDepth: settings.lookaheadDepth,
    searchTimeBudgetMs: settings.searchTimeBudgetMs,
    searchMaxNodes: settings.searchMaxNodes,
    searchBeamWidth: settings.searchBeamWidth,
    searchGoalPriorityBias: settings.searchGoalPriorityBias,
    optimizerEngine: settings.optimizerEngine,
    overcraftAmbition: settings.overcraftAmbition,
    perfectionBandGoal: settings.perfectionBandGoal,
    completionBandCeiling: settings.completionBandCeiling,
  };
}

export function areSearchSettingsStale(
  settings: CraftBuddySettings,
  previous: LastSearchSettings | null,
): boolean {
  if (!previous) return false;
  const current = snapshotSearchSettings(settings);
  return (Object.keys(current) as (keyof LastSearchSettings)[]).some(
    (key) => current[key] !== previous[key],
  );
}

/** Budget fields change exploration, not the meaning of a cached score. */
export function buildCrossStepCacheScope(
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number,
  searchConfig: Pick<
    SearchConfig,
    | 'goalPriorityBias'
    | 'overcraftAmbition'
    | 'perfectionBandGoal'
    | 'completionBandCeiling'
  >,
): string {
  return serializeCanonicalValue({
    targets: [targetCompletion, targetPerfection],
    caps: [config.maxCompletion ?? null, config.maxPerfection ?? null],
    stats: [
      config.maxQi,
      config.maxStability,
      config.baseIntensity,
      config.baseControl,
      config.defaultBuffMultiplier,
    ],
    flags: [
      config.isSublimeCraft === true,
      config.trainingMode === true,
      config.targetMultiplier ?? null,
      config.conditionEffectType ?? null,
      config.craftingType ?? null,
      config.pillsPerRound ?? null,
    ],
    roster: (config.skills ?? [])
      .map((skill) => skill.key)
      .sort()
      .join('|'),
    scoring: [
      searchConfig.goalPriorityBias,
      searchConfig.overcraftAmbition !== false,
      searchConfig.perfectionBandGoal,
      searchConfig.completionBandCeiling,
    ],
  });
}
