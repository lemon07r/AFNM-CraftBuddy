import { BuffType, CraftingState } from '../optimizer/state';
import {
  applySkill,
  calculateActionSurvivabilityFloor,
  getConditionEffectsForConfig,
  getSurvivalConditionedState,
  type OptimizerConfig,
  type SkillDefinition,
} from '../optimizer/skills';
import {
  __testing,
  greedySearch,
  lookaheadSearch,
  setConditionTransitionProvider,
} from '../optimizer/search';
import {
  applySurvivabilityFloorToState,
  weightContinuationBySurvival,
  conditionContinuationOnSurvival,
} from '../optimizer/search/safety';
import { StabilityProjection } from '../optimizer/stability';
import { getNormalizedCacheKey } from '../optimizer/search/cacheKey';
import type { TranspositionCache } from '../optimizer/search/types';
import {
  freezeSearchClock,
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from './__fixtures__/replaySnapshots';

freezeSearchClock();

function createScenario(probability: number) {
  const safe: SkillDefinition = {
    name: 'Safe',
    key: 'safe',
    qiCost: 0,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    type: 'support',
  };
  const gamble: SkillDefinition = {
    ...safe,
    name: 'Gamble',
    key: 'gamble',
    stabilityCost: 10,
    stabilityGain: 20,
    successChance: probability,
    baseCompletionGain: 80,
    cooldown: 99,
  };
  const config: OptimizerConfig = {
    maxQi: 100,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    defaultBuffMultiplier: 1.4,
    maxCompletion: 1000,
    maxPerfection: 1000,
    isSublimeCraft: true,
    skills: [gamble, safe],
  };
  const state = new CraftingState({
    qi: 100,
    stability: 10,
    initialMaxStability: 60,
    completion: 100,
    perfection: 100,
  });
  const apply = (from: CraftingState, skill: SkillDefinition) =>
    applySkill(from, skill, config, [], 100, 'neutral')!;
  const context = __testing.buildScoringContext(config, state, 'neutral');
  const liveScore = (candidate: CraftingState) =>
    __testing.scoreState(
      candidate,
      100,
      100,
      true,
      2,
      false,
      1000,
      1000,
      context,
    );
  const finishedScore = (candidate: CraftingState) =>
    __testing.scoreFinishedOutcome(
      candidate,
      100,
      100,
      true,
      2,
      1000,
      1000,
      context,
    );
  const afterGamble = apply(state, gamble);
  const floor = calculateActionSurvivabilityFloor(
    state,
    gamble,
    config,
    [],
    'neutral',
  )!;
  const floorState = applySurvivabilityFloorToState(afterGamble, floor);
  const survivingGamble = getSurvivalConditionedState(afterGamble);
  return {
    state,
    config,
    safe,
    gamble,
    apply,
    liveScore,
    finishedScore,
    afterGamble,
    survivingGamble,
    floor,
    floorState,
  };
}

describe('survival-weighted continuation', () => {
  beforeEach(() => {
    // Keep the synthetic horizon deterministic, including the cache keys.
    setConditionTransitionProvider(() => [
      { nextCondition: 'neutral', nextQueue: [], probability: 1 },
    ]);
  });
  afterEach(() => setConditionTransitionProvider(undefined));

  it.each([0.5, 0.99])(
    'prices the floor-ending branch without collapsing the live state (p=%s)',
    (probability) => {
      const s = createScenario(probability);
      const safeScore = s.liveScore(s.apply(s.state, s.safe));
      const continuationScore = s.liveScore(s.survivingGamble);
      const terminalScore = s.finishedScore(s.floorState);
      expect(s.floor).toMatchObject({
        stability: 0,
        survivalProbability: probability,
      });
      expect(s.afterGamble.stability).toBeGreaterThan(0);
      expect(s.afterGamble.stability).toBe(Math.floor(20 * probability));
      expect(s.survivingGamble.stability).toBe(20);
      expect(continuationScore).toBeGreaterThan(safeScore);
      const weightedScore =
        probability * continuationScore + (1 - probability) * terminalScore;
      if (probability === 0.5) {
        expect(weightedScore).toBeLessThan(safeScore);
      } else {
        expect(weightedScore).toBeGreaterThan(safeScore);
      }

      const greedy = greedySearch(s.state, s.config, 100, 100, 'neutral');
      for (const depth of [0, 1, 2, 3]) {
        const result =
          depth === 0
            ? greedy
            : lookaheadSearch(
                s.state,
                s.config,
                100,
                100,
                depth,
                'neutral',
                [],
                {
                  timeBudgetMs: 1e9,
                  maxNodes: 10000,
                  useIterativeDeepening: false,
                  useAdaptiveBeamWidth: false,
                  beamWidth: 1,
                },
              );
        const recommendations = [
          result.recommendation!,
          ...result.alternativeSkills,
        ];
        const gamble = recommendations.find(
          (rec) => rec.skill.key === 'gamble',
        )!;
        expect(result.recommendation?.skill.key).toBe(
          probability === 0.5 ? 'safe' : 'gamble',
        );
        expect(gamble.requiresProbabilisticSurvival).toBe(false);
        expect(gamble.endsCraft).toBe(false);

        let continuation = s.survivingGamble;
        for (let turn = 1; turn < depth; turn++) {
          continuation = s.apply(continuation, s.safe);
        }
        expect(gamble.score).toBeCloseTo(
          probability * s.liveScore(continuation) +
            (1 - probability) * terminalScore,
          8,
        );
        if (depth > 0) {
          expect(result.optimalRotation).toEqual(
            probability === 0.5
              ? Array.from({ length: depth }, () => 'Safe')
              : ['Gamble', ...Array.from({ length: depth - 1 }, () => 'Safe')],
          );
          // Projection remains EV, not the conditioned search resource state.
          expect(result.expectedFinalState?.stability).toBe(
            probability === 0.5 ? s.state.stability : s.afterGamble.stability,
          );
        }
      }
    },
  );

  it('keeps child cache entries unweighted across unchanged-state and next-step reuse', () => {
    const s = createScenario(0.5);
    const table: TranspositionCache = new Map();
    const options = {
      timeBudgetMs: 1e9,
      maxNodes: 10000,
      useIterativeDeepening: false,
      useAdaptiveBeamWidth: false,
      beamWidth: 2,
      transpositionCache: table,
    };
    const search = (root: CraftingState, depth: number) =>
      lookaheadSearch(root, s.config, 100, 100, depth, 'neutral', [], options);
    const first = search(s.state, 3);
    const childKey = getNormalizedCacheKey(
      s.survivingGamble,
      230,
      230,
      2,
      'neutral',
      [],
      100,
    );
    const finalContinuation = s.apply(
      s.apply(s.survivingGamble, s.safe),
      s.safe,
    );
    expect(table.get(childKey)?.score).toBeCloseTo(
      s.liveScore(finalContinuation),
      8,
    );
    const repeated = search(s.state, 3);
    expect(repeated.searchMetrics?.crossStepHits).toBeGreaterThan(0);
    expect(repeated.recommendation).toEqual(first.recommendation);
    expect(repeated.alternativeSkills).toEqual(first.alternativeSkills);

    const advanced = s.apply(s.state, s.safe);
    const reused = search(advanced, 2);
    const fresh = lookaheadSearch(
      advanced,
      s.config,
      100,
      100,
      2,
      'neutral',
      [],
      { ...options, transpositionCache: undefined },
    );
    expect(reused.searchMetrics?.crossStepHits).toBeGreaterThan(0);
    expect(reused.recommendation).toEqual(fresh.recommendation);
    expect(reused.alternativeSkills).toEqual(fresh.alternativeSkills);
  });

  it.each([
    { collapsed: true, endsCraft: false, stability: 0, probability: 0.5 },
    { collapsed: false, endsCraft: true, stability: 0, probability: 0.5 },
    { collapsed: false, endsCraft: false, stability: 1, probability: 0.5 },
    { collapsed: false, endsCraft: false, stability: 0, probability: 0 },
    { collapsed: false, endsCraft: false, stability: 0, probability: 1 },
  ])('does not reweight excluded candidates: %o', (testCase) => {
    const s = createScenario(testCase.probability);
    const scoreEnd = jest.fn(() => 100);
    expect(
      weightContinuationBySurvival(
        1000,
        s.afterGamble,
        {
          ...s.floor,
          stability: testCase.stability,
          survivalProbability: testCase.probability,
        },
        testCase.collapsed,
        testCase.endsCraft,
        scoreEnd,
      ),
    ).toBe(1000);
    expect(scoreEnd).not.toHaveBeenCalled();
    expect(
      conditionContinuationOnSurvival(
        s.afterGamble,
        {
          ...s.floor,
          stability: testCase.stability,
          survivalProbability: testCase.probability,
        },
        testCase.collapsed,
        testCase.endsCraft,
      ),
    ).toBe(s.afterGamble);
  });

  it('continues the forge gamble at surviving stability 4, not display EV 3', () => {
    const input = getReplaySearchInput(
      loadOptimizerReplaySnapshot('forge-heat-runway-step-2.snapshot.json'),
    );
    const skill = input.config.skills.find(
      (candidate) => candidate.key === 'delayed_fusion',
    )!;
    const effects = getConditionEffectsForConfig(
      input.config,
      input.currentCondition,
    );
    const display = applySkill(
      input.state,
      skill,
      input.config,
      effects,
      input.targetCompletion,
      input.currentCondition,
    )!;
    const floor = calculateActionSurvivabilityFloor(
      input.state,
      skill,
      input.config,
      effects,
      input.currentCondition,
      display,
    );
    expect(floor).toEqual({
      stability: 0,
      maxStability: 52,
      survivalProbability: 0.75,
    });
    const displayNativeVariables = { ...display.nativeVariables };
    const continuation = conditionContinuationOnSurvival(
      display,
      floor,
      false,
      false,
    );
    expect(display.stability).toBe(3);
    expect(continuation.stability).toBe(4);
    expect(continuation.completion).toBe(display.completion);
    expect(continuation.perfection).toBe(display.perfection);
    expect(continuation.nativeVariables?.stability).toBe(4);
    expect(continuation.nativeVariables?.stabilitypenalty).toBe(
      continuation.stabilityPenalty,
    );
    expect(continuation.nativeVariables?.maxstability).toBe(
      continuation.maxStability,
    );
    expect(display.nativeVariables).toEqual(displayNativeVariables);
    expect(display.stability).toBe(3);
  });

  it('conditions stability and penalty on the same cleaned surviving outcomes', () => {
    const projection = new StabilityProjection(0, 0);
    projection.change(4, 2, 0.75);
    const result = projection.finish(60, false, true);
    expect(result.stability).toBe(3);
    expect(result.penalty).toBe(1.5);
    expect(result.survivalConditioned).toEqual({
      stability: 4,
      stabilityPenalty: 2,
    });
    expect(result.floor.survivalProbability).toBe(0.75);
  });

  it('uses retained survival branches across a collapsed EV boundary', () => {
    const projection = new StabilityProjection(0, 0);
    projection.changeExpectedTechnique(3, 4, 0.75);
    const inherited = new StabilityProjection(
      projection.meanStability(),
      0,
      projection,
    );
    const result = inherited.finish(60, false, true);
    expect(result.stability).toBe(3);
    expect(result.floor.survivalProbability).toBe(0.75);
    expect(result.survivalConditioned).toEqual({
      stability: 4,
      stabilityPenalty: 0,
    });
  });
});
