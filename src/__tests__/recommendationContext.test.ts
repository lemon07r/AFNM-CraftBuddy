import {
  areSearchSettingsStale,
  snapshotSearchSettings,
  buildCrossStepCacheScope,
} from '../modContent/recommendationContext';
import { DEFAULT_SETTINGS, getSearchConfig } from '../settings';
import type { OptimizerConfig } from '../optimizer';

describe('recommendation context', () => {
  const searchConfig = getSearchConfig();
  const config: OptimizerConfig = {
    maxQi: 100,
    maxStability: 60,
    baseIntensity: 10,
    baseControl: 10,
    minStability: 0,
    defaultBuffMultiplier: 1,
    skills: [],
  };

  it.each([
    { overcraftAmbition: false },
    { perfectionBandGoal: 3 },
    { completionBandCeiling: 2 },
  ])(
    'invalidates recommendations and cached scores when ambition changes: %j',
    (change) => {
      const settings = { ...DEFAULT_SETTINGS };
      const previous = snapshotSearchSettings(settings);
      expect(areSearchSettingsStale(settings, previous)).toBe(false);
      Object.assign(settings, change);
      expect(areSearchSettingsStale(settings, previous)).toBe(true);
      expect(
        buildCrossStepCacheScope(config, 100, 100, {
          ...searchConfig,
          ...change,
        }),
      ).not.toBe(buildCrossStepCacheScope(config, 100, 100, searchConfig));
    },
  );

  it('ignores UI changes and exploration budgets in the score-cache scope', () => {
    const settings = { ...DEFAULT_SETTINGS, overlayOpacity: 0.5 };
    expect(
      areSearchSettingsStale(
        settings,
        snapshotSearchSettings(DEFAULT_SETTINGS),
      ),
    ).toBe(false);
    expect(areSearchSettingsStale(settings, null)).toBe(false);
    const lowerBudget = { ...searchConfig, maxNodes: 1 };
    expect(buildCrossStepCacheScope(config, 100, 100, lowerBudget)).toBe(
      buildCrossStepCacheScope(config, 100, 100, searchConfig),
    );
  });
});
