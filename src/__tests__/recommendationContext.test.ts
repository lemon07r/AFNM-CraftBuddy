import { DEFAULT_SETTINGS } from '../settings';
import { DEFAULT_CONFIG, CrossStepSearchCache } from '../optimizer';
import {
  buildCrossStepCacheScope,
  searchSettingsSignature,
} from '../modContent/recommendationContext';

const search = {
  timeBudgetMs: 1000,
  maxNodes: 10000,
  beamWidth: 5,
  goalPriorityBias: 0,
  overcraftAmbition: true,
  perfectionBandGoal: 0,
  completionBandCeiling: 0,
  useMonteCarloTreeSearch: false,
};

describe('recommendation context invalidation', () => {
  it('invalidates raw native availability changes', () => {
    const withGate = (minStability: number) => ({
      ...DEFAULT_CONFIG,
      skills: DEFAULT_CONFIG.skills.map((skill) => ({
        ...skill,
        nativeTechnique: { minStability },
      })),
    });
    expect(buildCrossStepCacheScope(withGate(10), 100, 100, search)).not.toBe(
      buildCrossStepCacheScope(withGate(45), 100, 100, search),
    );
  });
  it.each([
    { perfectionBandGoal: 8 },
    { completionBandCeiling: 8 },
    { overcraftAmbition: false },
    { searchThreads: 4 as const },
  ])(
    'invalidates displayed results for changed objective or backend: %j',
    (change) => {
      expect(
        searchSettingsSignature({ ...DEFAULT_SETTINGS, ...change }),
      ).not.toBe(searchSettingsSignature(DEFAULT_SETTINGS));
    },
  );

  it('keeps cosmetic settings out of the search revision', () => {
    expect(
      searchSettingsSignature({
        ...DEFAULT_SETTINGS,
        compactMode: !DEFAULT_SETTINGS.compactMode,
      }),
    ).toBe(searchSettingsSignature(DEFAULT_SETTINGS));
  });

  it.each([{ perfectionBandGoal: 8 }, { completionBandCeiling: 8 }])(
    'drops cached scores when either bar objective changes: %j',
    (change) => {
      const cache = new CrossStepSearchCache();
      const first = cache.tableFor(
        buildCrossStepCacheScope(DEFAULT_CONFIG, 100, 100, search),
      );
      first.set('some-state', { score: 100, bestMove: 'old-goal-action' });
      const next = cache.tableFor(
        buildCrossStepCacheScope(DEFAULT_CONFIG, 100, 100, {
          ...search,
          ...change,
        }),
      );
      expect(next.size).toBe(0);
      expect(next).not.toBe(first);
    },
  );

  it('invalidates costs/effects changing under an unchanged technique key', () => {
    const first = buildCrossStepCacheScope(DEFAULT_CONFIG, 100, 100, search);
    const config = {
      ...DEFAULT_CONFIG,
      skills: DEFAULT_CONFIG.skills.map((skill) => ({
        ...skill,
        stabilityCost: skill.stabilityCost + 1,
      })),
    };
    expect(buildCrossStepCacheScope(config, 100, 100, search)).not.toBe(first);
  });

  it('never includes the mutable transposition table in its own key', () => {
    const transpositionCache = new Map([
      ['key', { score: 1, bestMove: 'move' }],
    ]);
    expect(
      buildCrossStepCacheScope(DEFAULT_CONFIG, 100, 100, {
        ...search,
        transpositionCache,
      }),
    ).toBe(buildCrossStepCacheScope(DEFAULT_CONFIG, 100, 100, search));
  });
});
