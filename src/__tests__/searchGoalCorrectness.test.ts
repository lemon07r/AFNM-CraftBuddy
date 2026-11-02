import { CraftingState } from '../optimizer/state';
import { __testing } from '../optimizer/search';
import { findBestSkill } from '../optimizer/search';
import { BuffType } from '../optimizer/state';
import { DEFAULT_CONFIG, type SkillDefinition } from '../optimizer/skills';

describe('effective goal work', () => {
  const scoreLive = (state: CraftingState) =>
    __testing.scoreState(
      state,
      100,
      100,
      false,
      2,
      false,
      1000,
      1000,
      undefined,
      0,
      false,
      3,
    );
  const scoreResolved = (state: CraftingState) =>
    __testing.scoreFinishedOutcome(
      state,
      100,
      100,
      false,
      2,
      1000,
      1000,
      undefined,
      0,
      false,
      3,
    );

  it('values a perfection buff while requested ambition remains after securing the tier', () => {
    const state = new CraftingState({
      completion: 100,
      perfection: 100,
      qi: 100,
      stability: 100,
      initialMaxStability: 100,
    });
    const buffed = new CraftingState({
      ...state,
      controlBuffTurns: 3,
      controlBuffMultiplier: 1.4,
    });
    expect(scoreLive(buffed)).toBeGreaterThan(scoreLive(state));
  });

  it('charges permanent effective-goal shortfall without changing the secured tier', () => {
    const state = new CraftingState({
      completion: 100,
      perfection: 100,
      qi: 100,
      stability: 0,
      initialMaxStability: 100,
    });
    const further = new CraftingState({ ...state, perfection: 150 });
    expect(scoreResolved(further) - scoreResolved(state)).toBeCloseTo(
      50 * __testing.SCORING.FINISHED_UNMET_PENALTY_WEIGHT,
      8,
    );
  });
});

describe('joint productive-action runway', () => {
  const context = {
    avgCompletionGainPerTurn: 16,
    avgPerfectionGainPerTurn: 16,
    avgGainPerTurn: 32,
    avgStabilityCostPerTurn: 10,
    avgQiCostPerTurn: 0,
    progressRates: [{ completion: 16, perfection: 16 }],
  };

  it('counts a dual-bar action once, not once per bar', () => {
    expect(__testing.estimateTurnsRemainingFromContext(100, 100, context)).toBe(
      7,
    );
  });

  it('respects the slower binding bar and single-bar work', () => {
    const asymmetric = {
      ...context,
      avgPerfectionGainPerTurn: 4,
      avgGainPerTurn: 20,
      progressRates: [{ completion: 16, perfection: 4 }],
    };
    expect(
      __testing.estimateTurnsRemainingFromContext(100, 100, asymmetric),
    ).toBe(25);
    expect(
      __testing.estimateTurnsRemainingFromContext(0, 100, asymmetric),
    ).toBe(25);
    expect(
      __testing.estimateTurnsRemainingFromContext(100, 0, asymmetric),
    ).toBe(7);
    expect(__testing.estimateTurnsRemainingFromContext(0, 0, asymmetric)).toBe(
      0,
    );
  });

  it('does not assume separate single-bar actions can run simultaneously', () => {
    expect(
      __testing.estimateTurnsRemainingFromContext(100, 100, {
        ...context,
        avgGainPerTurn: 16,
        progressRates: [
          { completion: 16, perfection: 0 },
          { completion: 0, perfection: 16 },
        ],
      }),
    ).toBe(13);
  });

  it('does not let a fast completion technique cover slow independent perfection work', () => {
    const separate = {
      ...context,
      avgCompletionGainPerTurn: 100,
      avgPerfectionGainPerTurn: 10,
      avgGainPerTurn: 80,
      progressRates: [
        { completion: 100, perfection: 0 },
        { completion: 0, perfection: 10 },
      ],
    };
    expect(
      __testing.estimateTurnsRemainingFromContext(100, 100, separate),
    ).toBe(11);
  });

  it('uses a feasible mixture when a joint action does not match the remaining bar ratio', () => {
    const mixed = {
      ...context,
      avgCompletionGainPerTurn: 100,
      avgPerfectionGainPerTurn: 20,
      avgGainPerTurn: 100,
      progressRates: [
        { completion: 100, perfection: 0 },
        { completion: 20, perfection: 20 },
      ],
    };
    expect(__testing.estimateTurnsRemainingFromContext(200, 100, mixed)).toBe(
      6,
    );
  });

  it.each([1, 2, 4, 6, 8])(
    'chooses progress over capped Restore at depth %s',
    (depth) => {
      const progress: SkillDefinition = {
        key: 'progress',
        name: 'Progress',
        type: 'fusion',
        qiCost: 0,
        stabilityCost: 10,
        baseCompletionGain: 16,
        basePerfectionGain: 16,
        stabilityGain: 0,
        maxStabilityChange: 0,
        buffType: BuffType.NONE,
        buffDuration: 0,
        buffMultiplier: 1,
        preventsMaxStabilityDecay: true,
      };
      const restore: SkillDefinition = {
        ...progress,
        key: 'restore',
        name: 'Restore',
        type: 'stabilize',
        stabilityCost: 0,
        baseCompletionGain: 0,
        basePerfectionGain: 0,
        stabilityGain: 30,
      };
      const config = {
        ...DEFAULT_CONFIG,
        minStability: 0,
        maxStability: 60,
        maxQi: 100,
        maxCompletion: 1000,
        maxPerfection: 1000,
        skills: [progress, restore],
      };
      const state = new CraftingState({
        qi: 100,
        stability: 60,
        initialMaxStability: 60,
      });
      const result = findBestSkill(
        state,
        config,
        100,
        100,
        false,
        depth,
        'neutral',
        [],
        {
          useIterativeDeepening: false,
          useMonteCarloTreeSearch: false,
          timeBudgetMs: 1e9,
          maxNodes: 1000000,
        },
      );
      expect(result.recommendation?.skill.key).toBe('progress');
    },
  );
});
