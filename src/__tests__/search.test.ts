/**
 * Unit tests for search algorithms
 */

import { CraftingState, BuffType } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  DEFAULT_SKILLS,
  calculateSkillGains,
  getAvailableSkills,
  getConditionEffectsForConfig,
} from '../optimizer/skills';
import {
  findBestSkill,
  greedySearch,
  lookaheadSearch,
  normalizeForecastConditionQueue,
  setConditionTransitionProvider,
  VISIBLE_CONDITION_QUEUE_LENGTH,
  __testing,
} from '../optimizer/search';
import {
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from './__fixtures__/replaySnapshots';
import { createForcefulOvercapReplayInput } from './__fixtures__/forcefulOvercapReplay';

const {
  scoreState,
  scoreFinishedOutcome,
  calculateFinishSuccessChance,
  evaluateCraftEndOutcomeDistribution,
  evaluateHarmonySubsystemQuality,
  getProgressTowardRawGoal,
  getThresholdForGuaranteedBonusCount,
  SCORING,
} = __testing;

// Helper to create a basic test config
function createTestConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 194,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 10,
    skills: DEFAULT_SKILLS,
    defaultBuffMultiplier: 1.4,
    ...overrides,
  };
}

function createCustomSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    name: 'Custom Skill',
    key: 'custom_skill',
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
    ...overrides,
  };
}

function createTutorialConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  const simpleFusion = createCustomSkill({
    name: 'Simple Fusion',
    key: 'simple_fusion',
    type: 'fusion',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 1,
    scalesWithIntensity: true,
  });
  const simpleRefine = createCustomSkill({
    name: 'Simple Refine',
    key: 'simple_refine',
    type: 'refine',
    qiCost: 18,
    stabilityCost: 10,
    basePerfectionGain: 1,
    scalesWithControl: true,
  });
  const forcefulStabilize = createCustomSkill({
    name: 'Forceful Stabilize',
    key: 'forceful_stabilize',
    type: 'stabilize',
    qiCost: 88,
    stabilityCost: 0,
    stabilityGain: 40,
    preventsMaxStabilityDecay: true,
  });

  return createTestConfig({
    minStability: 0,
    skills: [simpleFusion, simpleRefine, forcefulStabilize],
    ...overrides,
  });
}

// ── Shared skill definitions ────────────────────────────────────────────────
// Reusable skill constants matching game data (DEFAULT_SKILLS in skills.ts).
// Tests that need custom variants should still use createCustomSkill().
const SIMPLE_FUSION = createCustomSkill({
  name: 'Simple Fusion',
  key: 'simple_fusion',
  type: 'fusion',
  qiCost: 0,
  stabilityCost: 10,
  baseCompletionGain: 1,
  scalesWithIntensity: true,
});
const SIMPLE_REFINE = createCustomSkill({
  name: 'Simple Refine',
  key: 'simple_refine',
  type: 'refine',
  qiCost: 18,
  stabilityCost: 10,
  basePerfectionGain: 1,
  scalesWithControl: true,
});
const STABILIZE = createCustomSkill({
  name: 'Stabilize',
  key: 'stabilize',
  type: 'stabilize',
  qiCost: 10,
  stabilityCost: 0,
  stabilityGain: 20,
  preventsMaxStabilityDecay: true,
});
// Forceful Stabilize: 88 qi for +40 stability.  High cost makes it
// wasteful when stability is near max, but essential when it's the
// only stabilize option.  Values from user-reported game data.
const FORCEFUL_STABILIZE = createCustomSkill({
  name: 'Forceful Stabilize',
  key: 'forceful_stabilize',
  type: 'stabilize',
  qiCost: 88,
  stabilityCost: 0,
  stabilityGain: 40,
  preventsMaxStabilityDecay: true,
});

describe('greedySearch', () => {
  const config = createTestConfig();

  it('should return targetsMet when targets are already met', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      completion: 100,
      perfection: 100,
    });

    const result = greedySearch(state, config, 100, 100);

    expect(result.targetsMet).toBe(true);
    expect(result.recommendation).toBeNull();
  });

  it('should return isTerminal when no skills can be applied', () => {
    const state = new CraftingState({
      qi: 0,
      stability: 0,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 100, 100);

    expect(result.isTerminal).toBe(true);
    expect(result.recommendation).toBeNull();
  });

  it('should recommend a skill when resources are available', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 100, 100);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill).toBeDefined();
    expect(result.recommendation!.expectedGains).toBeDefined();
    expect(result.recommendation!.reasoning).toBeDefined();
  });

  it('should expose immediate gains separately from projected EV gains', () => {
    const critFusion = createCustomSkill({
      name: 'Crit Fusion',
      key: 'crit_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1.0,
      scalesWithIntensity: true,
    });
    const critConfig = createTestConfig({
      baseIntensity: 12,
      baseControl: 16,
      skills: [critFusion],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      critChance: 150,
      critMultiplier: 150,
    });

    const result = greedySearch(state, critConfig, 100, 0);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.immediateGains.completion).toBe(12);
    expect(result.recommendation!.expectedGains.completion).toBeGreaterThan(
      result.recommendation!.immediateGains.completion,
    );
  });

  it('should cap displayed stabilize gains to the actual post-action headroom', () => {
    const config = createTestConfig({
      maxStability: 58,
      skills: [FORCEFUL_STABILIZE],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 31,
      initialMaxStability: 58,
      stabilityPenalty: 3,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 2, 'neutral', []);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe('forceful_stabilize');
    expect(result.recommendation!.immediateGains.stability).toBe(24);
    expect(result.recommendation!.expectedGains.stability).toBe(24);
  });

  it('should build scoring context from live skill gains instead of raw base stats', () => {
    const config = createTestConfig({
      maxQi: 300,
      baseIntensity: 80,
      baseControl: 100,
      skills: [
        createCustomSkill({
          name: 'Heavy Fusion',
          key: 'heavy_fusion',
          type: 'fusion',
          stabilityCost: 15,
          qiCost: 12,
          effects: [
            { kind: 'completion', amount: { value: 3, stat: 'intensity' } },
          ],
        }),
        createCustomSkill({
          name: 'Heavy Refine',
          key: 'heavy_refine',
          type: 'refine',
          stabilityCost: 18,
          qiCost: 14,
          effects: [
            { kind: 'perfection', amount: { value: 4, stat: 'control' } },
          ],
        }),
      ],
    });
    const state = new CraftingState({
      qi: 300,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const ctx = __testing.buildScoringContext(config, state, 'neutral');

    expect(ctx.avgCompletionGainPerTurn).toBe(240);
    expect(ctx.avgPerfectionGainPerTurn).toBe(400);
    expect(ctx.avgGainPerTurn).toBe(320);
    expect(ctx.avgStabilityCostPerTurn).toBe(16.5);
    expect(ctx.avgQiCostPerTurn).toBe(13);
  });

  it('should provide alternative skills', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 100, 100);

    expect(result.alternativeSkills.length).toBeGreaterThan(0);
  });

  it('should prioritize completion when perfection is met', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 50,
      perfection: 100, // Already met
    });

    const result = greedySearch(state, config, 100, 100);

    expect(result.recommendation).not.toBeNull();
    // Should recommend a fusion skill for completion
    const skill = result.recommendation!.skill;
    expect(skill.type === 'fusion' || skill.baseCompletionGain > 0).toBe(true);
  });

  it('should prioritize perfection when completion is met', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100, // Already met
      perfection: 50,
    });

    const result = greedySearch(state, config, 100, 100);

    expect(result.recommendation).not.toBeNull();
    // Should recommend a refine skill for perfection
    const skill = result.recommendation!.skill;
    expect(skill.type === 'refine' || skill.basePerfectionGain > 0).toBe(true);
  });

  it('should handle a perfection-only target without division by zero', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 0, 100);

    expect(result.recommendation).not.toBeNull();
    const skill = result.recommendation!.skill;
    expect(skill.type === 'refine' || skill.basePerfectionGain > 0).toBe(true);
  });

  it('should still return a non-terminal recommendation when stability is low but above 0', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 15, // Low stability
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 100, 100);

    expect(result.recommendation).not.toBeNull();
    expect(result.isTerminal).toBe(false);
  });
});

describe('lookaheadSearch', () => {
  const config = createTestConfig();

  afterEach(() => {
    setConditionTransitionProvider(undefined);
  });

  it('should return targetsMet when targets are already met', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      completion: 100,
      perfection: 100,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.targetsMet).toBe(true);
    expect(result.recommendation).toBeNull();
  });

  it('should return targetsMet for completion-only crafts when completion target is reached', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      completion: 100,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 0, 3);

    expect(result.targetsMet).toBe(true);
    expect(result.recommendation).toBeNull();
  });

  it('should return targetsMet for perfection-only crafts when perfection target is reached', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      completion: 0,
      perfection: 100,
    });

    const result = lookaheadSearch(state, config, 0, 100, 3);

    expect(result.targetsMet).toBe(true);
    expect(result.recommendation).toBeNull();
  });

  it('should return isTerminal when no skills can be applied', () => {
    const state = new CraftingState({
      qi: 0,
      stability: 0,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.isTerminal).toBe(true);
    expect(result.recommendation).toBeNull();
  });

  it('should recommend a skill when resources are available', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill).toBeDefined();
  });

  it('should provide optimal rotation', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.optimalRotation).toBeDefined();
    expect(result.optimalRotation!.length).toBeGreaterThan(0);
    // First skill in rotation should match recommendation
    expect(result.optimalRotation![0]).toBe(result.recommendation!.skill.name);
  });

  it('should provide expected final state', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.expectedFinalState).toBeDefined();
    expect(result.expectedFinalState!.completion).toBeGreaterThan(0);
  });

  it('should calculate quality ratings for alternatives', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    // Best recommendation should have 100% quality
    expect(result.recommendation!.qualityRating).toBe(100);

    // Alternatives should have quality ratings
    if (result.alternativeSkills.length > 0) {
      for (const alt of result.alternativeSkills) {
        expect(alt.qualityRating).toBeDefined();
        expect(alt.qualityRating).toBeLessThanOrEqual(100);
        expect(alt.qualityRating).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('should provide a fallback follow-up suggestion when budget is exhausted', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(
      state,
      config,
      100000,
      100000,
      8,
      undefined,
      [],
      { maxNodes: 1, timeBudgetMs: 1000 },
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.followUpSkill).toBeDefined();
  });

  it('should detect buff-consuming skills', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      controlBuffTurns: 2,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    // With an active control buff, Disciplined Touch should appear in results
    const allSkills = [result.recommendation!, ...result.alternativeSkills];
    const disciplinedTouch = allSkills.find((s) => s.skill.isDisciplinedTouch);
    expect(disciplinedTouch).toBeDefined();
    expect(disciplinedTouch!.consumesBuff).toBe(true);
  });

  it('should use forecasted conditions in search', () => {
    const perfectableConfig = createTutorialConfig({
      conditionEffectType: 'perfectable' as any,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const posResult = lookaheadSearch(
      state,
      perfectableConfig,
      0,
      100,
      3,
      'neutral',
      ['positive', 'positive', 'positive'],
    );
    const negResult = lookaheadSearch(
      state,
      perfectableConfig,
      0,
      100,
      3,
      'neutral',
      ['negative', 'negative', 'negative'],
    );
    expect(posResult.recommendation).not.toBeNull();
    expect(negResult.recommendation).not.toBeNull();
    expect(posResult.recommendation!.skill.name).toBe('Simple Refine');
    expect(negResult.recommendation!.skill.name).toBe('Simple Refine');
    expect(posResult.recommendation!.score).toBeGreaterThan(
      negResult.recommendation!.score,
    );
  });

  it('should break exact root ties toward the unmet goal instead of overshooting a secured one', () => {
    const config = createTestConfig({
      minStability: 0,
      conditionEffectType: 'perfectable' as any,
      skills: [SIMPLE_FUSION, SIMPLE_REFINE, STABILIZE],
    });
    const state = new CraftingState({
      qi: 138,
      stability: 30,
      initialMaxStability: 60,
      completion: 60,
      perfection: 16,
    });

    const result = lookaheadSearch(
      state,
      config,
      50,
      50,
      6,
      'negative',
      ['negative', 'negative', 'negative'],
      {
        timeBudgetMs: 500,
        maxNodes: 200000,
        beamWidth: 8,
      },
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe('simple_refine');
  });

  it('should handle different lookahead depths', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // Test different depths
    for (const depth of [1, 2, 3, 4]) {
      const result = lookaheadSearch(state, config, 100, 100, depth);
      expect(result.recommendation).not.toBeNull();
    }
  });

  it('should perform iterative deepening when enabled', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 6, undefined, [], {
      useIterativeDeepening: true,
      iterativeDeepeningMinDepth: 3,
      timeBudgetMs: 500,
      maxNodes: 200000,
    });

    expect(result.recommendation).not.toBeNull();
    expect(result.searchMetrics).toBeDefined();
    expect(result.searchMetrics!.depthReached).toBeGreaterThanOrEqual(3);
    expect(result.searchMetrics!.depthReached).toBeLessThanOrEqual(6);
  });

  it('should keep the last fully completed iterative-deepening pass when node budget stops deeper search', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // With the shared iterative-deepening cache, this node budget now reaches
    // the depth-5 frontier instead of stalling at depth 4.
    const stableDepthFour = lookaheadSearch(
      state,
      config,
      100,
      100,
      4,
      undefined,
      [],
      {
        useIterativeDeepening: false,
        timeBudgetMs: 100000,
        maxNodes: 10000000,
      },
    );
    const stableDepthFive = lookaheadSearch(
      state,
      config,
      100,
      100,
      5,
      undefined,
      [],
      {
        useIterativeDeepening: false,
        timeBudgetMs: 100000,
        maxNodes: 10000000,
      },
    );
    const interruptedDeepening = lookaheadSearch(
      state,
      config,
      100,
      100,
      6,
      undefined,
      [],
      {
        useIterativeDeepening: true,
        iterativeDeepeningMinDepth: 3,
        timeBudgetMs: 100000,
        maxNodes: 12000,
      },
    );

    expect(stableDepthFour.recommendation).not.toBeNull();
    expect(stableDepthFive.recommendation).not.toBeNull();
    expect(interruptedDeepening.recommendation).not.toBeNull();
    expect(
      interruptedDeepening.searchMetrics!.depthReached,
    ).toBeGreaterThanOrEqual(4);
    expect(
      interruptedDeepening.searchMetrics!.depthReached,
    ).toBeLessThanOrEqual(6);
    const stableAtReportedDepth = lookaheadSearch(
      state,
      config,
      100,
      100,
      interruptedDeepening.searchMetrics!.depthReached,
      undefined,
      [],
      {
        useIterativeDeepening: false,
        timeBudgetMs: 100000,
        maxNodes: 10000000,
      },
    );
    expect(stableAtReportedDepth.recommendation).not.toBeNull();
    expect(interruptedDeepening.recommendation!.skill.key).toBe(
      stableAtReportedDepth.recommendation!.skill.key,
    );
    expect(interruptedDeepening.recommendation!.score).toBeCloseTo(
      stableAtReportedDepth.recommendation!.score,
      10,
    );
  });

  it('should report only the baseline completed depth when budget interrupts the first deep pass', () => {
    const immediateA = createCustomSkill({
      name: 'Immediate A',
      key: 'immediate_a',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.8,
      scalesWithControl: true,
    });
    const immediateB = createCustomSkill({
      name: 'Immediate B',
      key: 'immediate_b',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.7,
      scalesWithControl: true,
    });
    const immediateC = createCustomSkill({
      name: 'Immediate C',
      key: 'immediate_c',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.6,
      scalesWithControl: true,
    });
    const setup = createCustomSkill({
      name: 'Setup',
      key: 'setup',
      type: 'support',
      qiCost: 0,
      stabilityCost: 10,
      effects: [
        {
          kind: 'createBuff',
          buff: { name: 'charge', canStack: true, effects: [] },
          stacks: { value: 1 },
        },
      ],
    });
    const payoff = createCustomSkill({
      name: 'Payoff',
      key: 'payoff',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 8,
      scalesWithControl: true,
      buffRequirement: { buffName: 'charge', amount: 1 },
    });

    const focusedConfig = createTestConfig({
      minStability: 0,
      baseControl: 16,
      baseIntensity: 16,
      skills: [immediateA, immediateB, immediateC, setup, payoff],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(
      state,
      focusedConfig,
      0,
      100,
      3,
      'neutral',
      [],
      {
        useIterativeDeepening: true,
        iterativeDeepeningMinDepth: 3,
        timeBudgetMs: 100000,
        maxNodes: 20,
        beamWidth: 6,
      },
    );

    const baselineDepthOne = lookaheadSearch(
      state,
      focusedConfig,
      0,
      100,
      1,
      'neutral',
      [],
      {
        useIterativeDeepening: false,
        timeBudgetMs: 100000,
        maxNodes: 100000,
        beamWidth: 6,
      },
    );

    expect(result.recommendation).not.toBeNull();
    expect(baselineDepthOne.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe(
      baselineDepthOne.recommendation!.skill.key,
    );
    expect(result.searchMetrics!.depthReached).toBe(1);
  });

  it('should avoid recommending stabilize at high stability when most gain would be wasted', () => {
    const focusedConfig = createTestConfig({
      minStability: 0,
      baseControl: 16,
      skills: [SIMPLE_REFINE, FORCEFUL_STABILIZE],
    });

    // At 40/58 stability, stabilize would restore only 18 effective stability
    // for 88 qi - extremely wasteful compared to using refine
    const state = new CraftingState({
      qi: 154,
      stability: 40,
      initialMaxStability: 58,
      completion: 211,
      perfection: 44,
      completionBonus: 2,
    });

    // Both greedy and lookahead should avoid wasteful stabilize
    const greedyResult = greedySearch(state, focusedConfig, 50, 100);
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.name).toBe('Simple Refine');

    for (const depth of [3, 4, 5]) {
      const result = lookaheadSearch(state, focusedConfig, 50, 100, depth);
      expect(result.recommendation).not.toBeNull();
      expect(result.recommendation!.skill.name).toBe('Simple Refine');
    }
  });

  it('should avoid recommending stabilize at high stability with full skill set', () => {
    // Use default skills which include Stabilize (10 qi, 20 stability)
    const config = createTestConfig({
      minStability: 0,
    });

    // At 40/58 stability, stabilize wastes most of its gain (only 18 effective)
    const state = new CraftingState({
      qi: 154,
      stability: 40,
      initialMaxStability: 58,
      completion: 20,
      perfection: 10,
    });

    for (const depth of [3, 4, 5]) {
      const result = lookaheadSearch(state, config, 50, 100, depth);
      expect(result.recommendation).not.toBeNull();
      expect(result.recommendation!.skill.type).not.toBe('stabilize');
    }

    const greedyResult = greedySearch(state, config, 50, 100);
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.type).not.toBe('stabilize');
  });

  it('should not recommend expensive stabilize when stability is near max', () => {
    // Forceful Stabilize: 88 qi for 40 stability gain, but at 40/58 only 18 is effective
    // This is the user's exact scenario - 88 qi for 18 effective stability is terrible value
    const cyclingRefine = createCustomSkill({
      name: 'Cycling Refine',
      key: 'cycling_refine',
      type: 'refine',
      qiCost: 10,
      stabilityCost: 10,
      basePerfectionGain: 0.75,
      scalesWithControl: true,
      buffType: BuffType.INTENSITY,
      buffDuration: 2,
      buffMultiplier: 1.4,
    });
    const cyclingFusion = createCustomSkill({
      name: 'Cycling Fusion',
      key: 'cycling_fusion',
      type: 'fusion',
      qiCost: 10,
      stabilityCost: 10,
      baseCompletionGain: 0.75,
      scalesWithIntensity: true,
      buffType: BuffType.CONTROL,
      buffDuration: 2,
      buffMultiplier: 1.4,
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [
        SIMPLE_FUSION,
        SIMPLE_REFINE,
        FORCEFUL_STABILIZE,
        cyclingRefine,
        cyclingFusion,
      ],
    });

    // User's exact scenario: 40/58 stability, 154 qi
    const state = new CraftingState({
      qi: 154,
      stability: 40,
      initialMaxStability: 58,
      completion: 211,
      perfection: 44,
      completionBonus: 2,
    });

    for (const depth of [3, 4, 5, 6]) {
      const result = lookaheadSearch(state, config, 50, 100, depth);
      expect(result.recommendation).not.toBeNull();
      // Should NOT recommend Forceful Stabilize at 40/58 stability
      expect(result.recommendation!.skill.name).not.toBe('Forceful Stabilize');
    }

    const greedyResult = greedySearch(state, config, 50, 100);
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.name).not.toBe(
      'Forceful Stabilize',
    );
  });

  it('should avoid recommending stabilize at full stability when direct perfection is stronger', () => {
    const focusedConfig = createTestConfig({
      minStability: 0,
      baseControl: 16,
      skills: [SIMPLE_REFINE, FORCEFUL_STABILIZE],
    });

    const state = new CraftingState({
      qi: 154,
      stability: 60,
      initialMaxStability: 60,
      completion: 211,
      perfection: 44,
      completionBonus: 2,
    });

    const result = lookaheadSearch(state, focusedConfig, 50, 100, 4);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Simple Refine');
  });

  it('should block wasteful stabilize when a target-advancing skill is available', () => {
    const costlyFusion = createCustomSkill({
      name: 'Costly Fusion',
      key: 'costly_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 20,
      baseCompletionGain: 0.5,
      scalesWithIntensity: true,
    });
    const harmoniousFusion = createCustomSkill({
      name: 'Harmonious Fusion',
      key: 'harmonious_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 4,
      scalesWithIntensity: true,
      conditionRequirement: 'positive',
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [FORCEFUL_STABILIZE, costlyFusion, harmoniousFusion],
      conditionEffectsData: {
        neutral: [],
        positive: [{ kind: 'intensity' as const, multiplier: 1 }],
        negative: [],
        veryPositive: [],
        veryNegative: [],
      },
    });

    // Repro: at 40/58 stability, lookahead can overvalue forceful stabilize
    // to "wait" for positive condition despite an available progress move.
    const state = new CraftingState({
      qi: 177,
      stability: 40,
      initialMaxStability: 60,
      stabilityPenalty: 2, // 40/58
      completion: 45,
      perfection: 60,
    });

    for (const depth of [3, 4, 5]) {
      const result = lookaheadSearch(state, config, 60, 60, depth, 'neutral', [
        'positive',
        'neutral',
        'neutral',
      ]);
      expect(result.recommendation).not.toBeNull();
      expect(result.recommendation!.skill.name).toBe('Costly Fusion');
    }
  });

  it('should block pure qi-restore stalls when a progress skill can advance targets', () => {
    // A qi pill that CONSUMES a turn is a stall action — the optimizer should
    // prefer the progress skill.  (Free-action qi pills are correctly
    // recommended first since they're strictly beneficial.)
    const qiPill = createCustomSkill({
      name: 'Use Qi Pill',
      key: 'item_qi_pill',
      actionKind: 'item',
      itemName: 'qi_pill',
      consumesTurn: true,
      type: 'support',
      restoresQi: true,
      qiRestore: 60,
      effects: [
        {
          kind: 'pool',
          amount: { value: 60 },
        } as any,
      ],
    });
    const slowFusion = createCustomSkill({
      name: 'Slow Fusion',
      key: 'slow_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 20,
      baseCompletionGain: 0.2,
      scalesWithIntensity: true,
    });

    const config = createTestConfig({
      minStability: 0,
      maxQi: 200,
      skills: [qiPill, slowFusion],
      pillsPerRound: 1,
    });
    const state = new CraftingState({
      qi: 20,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      items: new Map([['qi_pill', 1]]),
    });

    for (const depth of [2, 3, 4]) {
      const result = lookaheadSearch(
        state,
        config,
        100,
        0,
        depth,
        'neutral',
        [],
      );
      expect(result.recommendation).not.toBeNull();
      expect(result.recommendation!.skill.name).toBe('Slow Fusion');
    }

    // Greedy search is intentionally myopic and may still prefer the qi pill
    // in this setup; enforce this anti-stall invariant on lookahead mode,
    // which powers in-game recommendations.
    const greedyResult = greedySearch(state, config, 100, 0, 'neutral');
    expect(greedyResult.recommendation).not.toBeNull();
  });

  it('should keep stabilize available when no progress skill can advance unmet targets', () => {
    const config = createTestConfig({
      minStability: 0,
      skills: [FORCEFUL_STABILIZE],
    });
    const state = new CraftingState({
      qi: 154,
      stability: 40,
      initialMaxStability: 58,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 4, 'neutral', []);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Forceful Stabilize');
  });

  it('should allow stabilize when dynamic critical stability indicates immediate runway risk', () => {
    const costlyFusion = createCustomSkill({
      name: 'Costly Fusion',
      key: 'costly_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 20,
      baseCompletionGain: 0.5,
      scalesWithIntensity: true,
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [FORCEFUL_STABILIZE, costlyFusion],
    });
    const state = new CraftingState({
      qi: 177,
      stability: 18,
      initialMaxStability: 60,
      stabilityPenalty: 2,
      completion: 45,
      perfection: 60,
    });

    for (const depth of [2, 3, 4, 5]) {
      const result = lookaheadSearch(state, config, 60, 60, depth);
      expect(result.recommendation).not.toBeNull();
      expect(result.recommendation!.skill.name).toBe('Forceful Stabilize');
    }
  });

  it('should avoid forceful stabilize at 20/56 when a direct finisher is available', () => {
    const disciplinedTouch = createCustomSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      type: 'refine',
      qiCost: 10,
      stabilityCost: 0,
      basePerfectionGain: 1,
      scalesWithControl: true,
      isDisciplinedTouch: true,
    });

    const config = createTestConfig({
      minStability: 0,
      baseControl: 16,
      skills: [FORCEFUL_STABILIZE, SIMPLE_REFINE, disciplinedTouch],
    });
    const state = new CraftingState({
      qi: 157,
      stability: 20,
      initialMaxStability: 60,
      stabilityPenalty: 4, // 20/56
      completion: 80,
      perfection: 79,
    });

    for (const depth of [3, 4, 5]) {
      const result = lookaheadSearch(state, config, 80, 80, depth, 'neutral', [
        'neutral',
        'positive',
        'neutral',
      ]);
      expect(result.recommendation).not.toBeNull();
      expect(result.recommendation!.skill.name).not.toBe('Forceful Stabilize');
      expect(
        ['Simple Refine', 'Disciplined Touch'].includes(
          result.recommendation!.skill.name,
        ),
      ).toBe(true);
    }
  });
});

describe('finish craft policy', () => {
  const energizedFusion = createCustomSkill({
    name: 'Energised Fusion',
    key: 'energized_fusion',
    type: 'fusion',
    qiCost: 0,
    stabilityCost: 17,
    baseCompletionGain: 3.5,
    scalesWithIntensity: true,
  });
  const simpleRefine = createCustomSkill({
    name: 'Simple Refine',
    key: 'simple_refine_finish_policy',
    type: 'refine',
    qiCost: 18,
    stabilityCost: 17,
    basePerfectionGain: 1,
    scalesWithControl: true,
  });

  it('prefers a final fusion when it converts a risky finish into a guaranteed success', () => {
    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 51,
      baseControl: 23,
      skills: [energizedFusion, simpleRefine],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 17,
      initialMaxStability: 60,
      completion: 90,
      perfection: 40,
    });

    const result = lookaheadSearch(state, config, 130, 130, 4);
    const finishCraft = result.alternativeSkills.find(
      (recommendation) => recommendation.skill.actionKind === 'finish',
    );

    expect(result.recommendation?.skill.name).toBe('Energised Fusion');
    expect(result.recommendation?.skill.actionKind).not.toBe('finish');
    expect(finishCraft).toBeDefined();
    expect(finishCraft!.projectedSuccessChance).toBeCloseTo(90 / 130);
  });

  it('keeps pursuing a guaranteed completion line when it is better than finishing early', () => {
    const config = createTutorialConfig({
      conditionEffectType: 'perfectable' as any,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 45,
      perfection: 45,
    });

    const result = lookaheadSearch(state, config, 50, 50, 3);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).not.toBe('Finish Craft');
    expect(result.recommendation!.projectedSuccessChance).toBeUndefined();
  });

  it('shifts completion vs perfection lines according to the goal priority bias', () => {
    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 20,
      baseControl: 20,
      skills: [
        createCustomSkill({
          name: 'Focused Fusion',
          key: 'focused_fusion_priority_bias',
          type: 'fusion',
          qiCost: 0,
          stabilityCost: 1,
          baseCompletionGain: 1.5,
          scalesWithIntensity: true,
        }),
        createCustomSkill({
          name: 'Focused Refine',
          key: 'focused_refine_priority_bias',
          type: 'refine',
          qiCost: 0,
          stabilityCost: 1,
          basePerfectionGain: 1,
          scalesWithControl: true,
        }),
      ],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 40,
      initialMaxStability: 60,
      completion: 70,
      perfection: 40,
    });

    const balanced = lookaheadSearch(state, config, 100, 100, 1);
    const completionBiased = lookaheadSearch(
      state,
      config,
      100,
      100,
      1,
      'neutral',
      [],
      { goalPriorityBias: 100 },
    );
    const perfectionBiased = lookaheadSearch(
      state,
      config,
      100,
      100,
      1,
      'neutral',
      [],
      { goalPriorityBias: -100 },
    );

    expect(balanced.recommendation?.skill.key).toBe(
      'focused_refine_priority_bias',
    );
    expect(completionBiased.recommendation?.skill.key).toBe(
      'focused_fusion_priority_bias',
    );
    expect(perfectionBiased.recommendation?.skill.key).toBe(
      'focused_refine_priority_bias',
    );
  });

  it('keeps Finish Craft available when no skill can be used but the craft is still alive', () => {
    const config = createTestConfig({
      minStability: 0,
      skills: [
        createCustomSkill({
          name: 'Costly Refine',
          key: 'costly_refine',
          type: 'refine',
          qiCost: 20,
          stabilityCost: 10,
          basePerfectionGain: 1,
          scalesWithControl: true,
        }),
      ],
    });
    const state = new CraftingState({
      qi: 0,
      stability: 1,
      initialMaxStability: 60,
      completion: 60,
      perfection: 10,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.isTerminal).toBe(false);
    expect(result.recommendation?.skill.name).toBe('Finish Craft');
    expect(result.recommendation?.projectedSuccessChance).toBeCloseTo(0.6);
    expect(result.recommendation?.endsCraft).toBe(true);
  });

  it('does not offer Finish Craft after the craft is already dead', () => {
    const config = createTestConfig({
      minStability: 0,
      skills: [energizedFusion, simpleRefine],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 0,
      initialMaxStability: 60,
      completion: 90,
      perfection: 40,
    });

    const result = lookaheadSearch(state, config, 130, 130, 4);

    expect(result.isTerminal).toBe(true);
    expect(result.recommendation).toBeNull();
  });

  it('marks regular technique recommendations that would end the craft', () => {
    const finalPolish = createCustomSkill({
      name: 'Final Polish',
      key: 'final_polish',
      type: 'support',
      qiCost: 0,
      stabilityCost: 5,
      baseCompletionGain: 60,
      basePerfectionGain: 60,
    });
    const config = createTestConfig({
      minStability: 0,
      skills: [finalPolish],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 5,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 50, 50, 3);

    expect(result.recommendation?.skill.name).toBe('Final Polish');
    expect(result.recommendation?.endsCraft).toBe(true);
  });

  it('can continue below the sublime target when one more refine secures a perfect finish', () => {
    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 51,
      baseControl: 23,
      skills: [energizedFusion, simpleRefine],
      isSublimeCraft: true,
      targetMultiplier: 2,
      maxCompletion: 260,
      maxPerfection: 260,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 17,
      initialMaxStability: 60,
      completion: 130,
      perfection: 110,
    });

    const result = lookaheadSearch(state, config, 130, 130, 4);
    const finishCraft = result.alternativeSkills.find(
      (recommendation) => recommendation.skill.actionKind === 'finish',
    );

    expect(result.targetsMet).toBe(false);
    expect(result.recommendation?.skill.name).toBe('Simple Refine');
    expect(finishCraft).toBeDefined();
    expect(finishCraft!.projectedSuccessChance).toBe(1);
  });

  it('scores fifth-tier sublime finish quality above a weaker early finish', () => {
    const fifthTierThreshold = getThresholdForGuaranteedBonusCount(100, 5);
    const fourthTierThreshold = getThresholdForGuaranteedBonusCount(100, 4);
    const fifthTierState = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: fifthTierThreshold,
      perfection: fifthTierThreshold,
    });
    const fourthTierState = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: fourthTierThreshold,
      perfection: fourthTierThreshold,
    });

    const fifthTierOutcome = evaluateCraftEndOutcomeDistribution({
      state: fifthTierState,
      targetCompletion: 100,
      targetPerfection: 100,
      hasDistinctSublimeOutcome: true,
    });
    const fifthTierScore = scoreFinishedOutcome(
      fifthTierState,
      100,
      100,
      true,
      5,
    );
    const fourthTierScore = scoreFinishedOutcome(
      fourthTierState,
      100,
      100,
      true,
      5,
    );

    expect(fifthTierThreshold).toBeGreaterThan(fourthTierThreshold);
    expect(fifthTierOutcome.successChance).toBe(1);
    expect(fifthTierOutcome.sublimeChance).toBe(1);
    expect(fifthTierScore).toBeGreaterThan(fourthTierScore + 100);
  });

  it('sets up False Fusion-style intensity before spending a completion push', () => {
    const falseFusionSetup = createCustomSkill({
      name: 'False Fusion',
      key: 'false_fusion_setup',
      type: 'support',
      qiCost: 0,
      stabilityCost: 1,
      effects: [
        {
          kind: 'createBuff' as const,
          stacks: { value: 1 },
          buff: {
            name: 'False Fusion',
            canStack: true,
            maxStacks: 1,
            stats: { intensity: { value: 100 } },
            effects: [],
            onFusion: [{ kind: 'negate' as const }],
          },
        },
      ],
    });
    const completionPush = createCustomSkill({
      name: 'Completion Push',
      key: 'completion_push',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 1,
      baseCompletionGain: 1,
      scalesWithIntensity: true,
    });
    const quickPush = createCustomSkill({
      name: 'Quick Push',
      key: 'quick_push',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 1,
      baseCompletionGain: 2,
      scalesWithIntensity: true,
    });
    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 20,
      baseControl: 20,
      skills: [falseFusionSetup, completionPush, quickPush],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 0,
      perfection: 100,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe('false_fusion_setup');
    expect(result.recommendation!.followUpSkill?.name).toBe('Completion Push');
    expect(result.optimalRotation?.slice(0, 2)).toEqual([
      'False Fusion',
      'Completion Push',
    ]);
    expect(result.expectedFinalState?.completion).toBeGreaterThanOrEqual(100);
  });

  it('stabilizes before chasing sublime progress when base success is already secured but runway is gone', () => {
    const stabilize = createCustomSkill({
      name: 'Forceful Stabilize',
      key: 'forceful_stabilize_sublime_runway',
      type: 'stabilize',
      qiCost: 0,
      stabilityCost: 0,
      stabilityGain: 20,
      preventsMaxStabilityDecay: true,
    });
    const riskyFusion = createCustomSkill({
      name: 'Risky Fusion',
      key: 'risky_fusion_sublime_runway',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 20,
    });
    const riskyRefine = createCustomSkill({
      name: 'Risky Refine',
      key: 'risky_refine_sublime_runway',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 20,
    });
    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 1,
      baseControl: 1,
      skills: [stabilize, riskyFusion, riskyRefine],
      isSublimeCraft: true,
      targetMultiplier: 2,
      maxCompletion: 200,
      maxPerfection: 200,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 5,
      initialMaxStability: 40,
      completion: 100,
      perfection: 100,
    });

    const result = lookaheadSearch(state, config, 100, 100, 4);
    const finishCraft = result.alternativeSkills.find(
      (recommendation) => recommendation.skill.actionKind === 'finish',
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Forceful Stabilize');
    expect(finishCraft).toBeDefined();
    expect(finishCraft!.projectedSuccessChance).toBe(1);
  });
});

describe('craft-end ladder modeling', () => {
  it('uses the game bonus ladders for finish-time sublime odds', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 200,
      perfection: 200,
    });

    const outcome = evaluateCraftEndOutcomeDistribution({
      state,
      targetCompletion: 100,
      targetPerfection: 100,
      hasDistinctSublimeOutcome: true,
    });

    const secondTierChance = 100 / 130;
    expect(outcome.successChance).toBe(1);
    expect(outcome.basicChance).toBe(0);
    expect(outcome.sublimeChance).toBeCloseTo(
      secondTierChance * secondTierChance,
      5,
    );
    expect(outcome.perfectChance).toBeCloseTo(
      1 - secondTierChance * secondTierChance,
      5,
    );
    expect(outcome.perfectOrBetterChance).toBe(1);
  });

  it('maps overcraft progress through the real ladder instead of a raw linear bar', () => {
    expect(getThresholdForGuaranteedBonusCount(100, 2)).toBe(230);
    expect(getProgressTowardRawGoal(150, 200, 100)).toBeGreaterThan(150);
    expect(getProgressTowardRawGoal(200, 200, 100)).toBeCloseTo(200, 5);
  });

  it('weights sublime finish bonuses by resolved craft-end bands', () => {
    const partialSecondBand = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 200,
      perfection: 200,
    });
    const guaranteedSecondBand = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 230,
      perfection: 230,
    });

    const partialScore = scoreFinishedOutcome(
      partialSecondBand,
      100,
      100,
      true,
      2,
    );
    const guaranteedScore = scoreFinishedOutcome(
      guaranteedSecondBand,
      100,
      100,
      true,
      2,
    );

    expect(guaranteedScore).toBeGreaterThan(partialScore + 50);
  });

  it('treats a last-step refine as a forced craft resolution instead of a dead branch', () => {
    const lastRefine = createCustomSkill({
      name: 'Last Refine',
      key: 'last_refine',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithIntensity: false,
      scalesWithControl: false,
      effects: [{ kind: 'perfection' as const, amount: { value: 50 } }],
    });
    const stabilize = createCustomSkill({
      name: 'Stabilize',
      key: 'stabilize_last_step',
      type: 'stabilize',
      qiCost: 0,
      stabilityCost: 0,
      stabilityGain: 20,
      preventsMaxStabilityDecay: true,
    });
    const config = createTestConfig({
      minStability: 0,
      skills: [lastRefine, stabilize],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 10,
      initialMaxStability: 60,
      completion: 100,
      perfection: 50,
    });

    const result = lookaheadSearch(state, config, 100, 100, 2);

    expect(result.recommendation?.skill.key).toBe('last_refine');
  });

  it('scores finished outcomes from resolved probabilities instead of re-multiplying success chance', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 90,
      perfection: 40,
    });

    const finishChance = calculateFinishSuccessChance(state, 130);
    const finishedScore = scoreFinishedOutcome(state, 130, 130);

    expect(finishChance).toBeCloseTo(90 / 130, 5);
    expect(finishedScore).toBeGreaterThan(0);
  });

  it('keeps a healthy live resonance frontier above a shallow partial finish', () => {
    const scoringCtx = {
      avgStabilityCostPerTurn: 13.5,
      avgCompletionGainPerTurn: 2681.5,
      avgPerfectionGainPerTurn: 3195,
      avgGainPerTurn: 3250,
      avgQiCostPerTurn: 3,
    };
    const liveState = new CraftingState({
      qi: 275,
      stability: 46,
      initialMaxStability: 60,
      stabilityPenalty: 2,
      completion: 4378,
      perfection: 115,
      critChance: 11,
      critMultiplier: 145,
      successChanceBonus: 0,
      maxToxicity: 190,
      harmony: 3,
      harmonyData: {
        recommendedTechniqueTypes: ['fusion'],
        resonance: {
          resonance: 'fusion',
          strength: 2,
          pendingCount: 0,
        },
      },
      step: 4,
    });
    const partialFinishState = new CraftingState({
      qi: 335,
      stability: 10,
      initialMaxStability: 60,
      stabilityPenalty: 3,
      completion: 7339,
      perfection: 0,
      critChance: 11,
      critMultiplier: 145,
      successChanceBonus: 0,
      maxToxicity: 190,
      harmony: 0,
      harmonyData: {
        recommendedTechniqueTypes: ['fusion'],
        resonance: {
          resonance: 'fusion',
          strength: 2,
          pendingCount: 0,
        },
      },
      step: 4,
    });

    const liveScore = scoreState(
      liveState,
      38980,
      38980,
      true,
      2.3,
      false,
      89654,
      89654,
      scoringCtx,
      75,
    );
    const finishedScore = scoreFinishedOutcome(
      partialFinishState,
      38980,
      38980,
      true,
      2.3,
      89654,
      89654,
      scoringCtx,
      75,
    );

    expect(finishedScore).toBeLessThan(liveScore);
  });
});

describe('findBestSkill', () => {
  const config = createTestConfig();

  it('should use greedy search when specified', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = findBestSkill(state, config, 100, 100, true);

    expect(result.recommendation).not.toBeNull();
    // Greedy search doesn't provide optimal rotation
    expect(result.optimalRotation).toBeUndefined();
  });

  it('should use lookahead search by default', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = findBestSkill(state, config, 100, 100, false, 3);

    expect(result.recommendation).not.toBeNull();
    // Lookahead search provides optimal rotation
    expect(result.optimalRotation).toBeDefined();
  });

  it('should apply condition multiplier', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // Good condition (positive)
    const goodConfig = {
      ...config,
      conditionEffectsData: {
        neutral: [],
        positive: [{ kind: 'control' as const, multiplier: 0.5 }],
        negative: [],
        veryPositive: [],
        veryNegative: [],
      },
    };
    const goodResult = findBestSkill(
      state,
      goodConfig,
      100,
      100,
      false,
      3,
      'positive',
    );

    // Bad condition (negative)
    const badConfig = {
      ...config,
      conditionEffectsData: {
        neutral: [],
        positive: [],
        negative: [{ kind: 'control' as const, multiplier: -0.25 }],
        veryPositive: [],
        veryNegative: [],
      },
    };
    const badResult = findBestSkill(
      state,
      badConfig,
      100,
      100,
      false,
      3,
      'negative',
    );

    // Both should return valid recommendations
    expect(goodResult.recommendation).not.toBeNull();
    expect(badResult.recommendation).not.toBeNull();
    // Positive condition (boosted control) should produce a higher score than negative
    expect(goodResult.recommendation!.score).toBeGreaterThan(
      badResult.recommendation!.score,
    );
  });

  it('should pass forecasted conditions to lookahead', () => {
    const perfectableConfig = createTutorialConfig({
      conditionEffectType: 'perfectable' as any,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const posResult = findBestSkill(
      state,
      perfectableConfig,
      0,
      100,
      false,
      3,
      'neutral',
      ['positive', 'positive', 'positive'],
    );
    const negResult = findBestSkill(
      state,
      perfectableConfig,
      0,
      100,
      false,
      3,
      'neutral',
      ['negative', 'negative', 'negative'],
    );
    expect(posResult.recommendation).not.toBeNull();
    expect(negResult.recommendation).not.toBeNull();
    expect(posResult.recommendation!.skill.name).toBe('Simple Refine');
    expect(negResult.recommendation!.skill.name).toBe('Simple Refine');
    expect(posResult.recommendation!.score).toBeGreaterThan(
      negResult.recommendation!.score,
    );
  });
});

describe('search algorithm correctness', () => {
  const config = createTestConfig();

  it('should prefer buff setup when far from targets', () => {
    const setup = createCustomSkill({
      name: 'Setup',
      key: 'setup',
      type: 'support',
      qiCost: 0,
      stabilityCost: 10,
      effects: [
        {
          kind: 'createBuff',
          buff: { name: 'charge', canStack: true, effects: [] },
          stacks: { value: 1 },
        },
      ],
    });
    const payoff = createCustomSkill({
      name: 'Payoff',
      key: 'payoff',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 8,
      scalesWithControl: true,
      buffRequirement: { buffName: 'charge', amount: 1 },
    });
    const immediate = createCustomSkill({
      name: 'Immediate',
      key: 'immediate',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 3,
      scalesWithControl: true,
    });
    const buffSetupConfig = createTestConfig({
      minStability: 0,
      baseControl: 16,
      baseIntensity: 16,
      skills: [setup, payoff, immediate],
    });
    const state = new CraftingState({
      qi: 150,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = findBestSkill(state, buffSetupConfig, 0, 100, false, 4);

    expect(result.recommendation).not.toBeNull();
    const rec = result.recommendation!.skill;
    const rotation = result.optimalRotation!;
    expect(rotation.length).toBeGreaterThan(0);
    expect(rec.key).toBe('setup');
    expect(rotation[0]).toBe('Setup');
  });

  it('should prefer direct gains when close to targets', () => {
    const state = new CraftingState({
      qi: 50,
      stability: 30,
      initialMaxStability: 40,
      completion: 90,
      perfection: 90,
    });

    const result = findBestSkill(state, config, 100, 100, false, 3);

    expect(result.recommendation).not.toBeNull();
    // Close to targets, should prefer skills that directly add progress
    const skill = result.recommendation!.skill;
    expect(skill.baseCompletionGain > 0 || skill.basePerfectionGain > 0).toBe(
      true,
    );
  });

  it('should handle edge case of exactly meeting targets', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100,
      perfection: 100,
    });

    const result = findBestSkill(state, config, 100, 100);

    expect(result.targetsMet).toBe(true);
  });

  it('should handle edge case of exceeding targets', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 150,
      perfection: 120,
    });

    const result = findBestSkill(state, config, 100, 100);

    expect(result.targetsMet).toBe(true);
  });
});

describe('tutorial regression scenarios', () => {
  const tutorialConfig = createTutorialConfig();

  it('should not recommend stabilize at full stability when both progress bars are unmet', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, tutorialConfig, 100, 100, 4);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).not.toBe('stabilize');
  });

  it('should prioritize refine when completion is met but perfection is behind', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 100,
      perfection: 0,
    });

    const result = lookaheadSearch(state, tutorialConfig, 100, 100, 4);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Simple Refine');
  });

  it('should prioritize fusion when perfection is met but completion is behind', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 100,
    });

    const result = lookaheadSearch(state, tutorialConfig, 100, 100, 4);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Simple Fusion');
  });

  it('should allow stabilize when progress skills are unavailable', () => {
    const cooldowns = new Map<string, number>([
      ['simple_fusion', 2],
      ['simple_refine', 2],
    ]);
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      cooldowns,
    });

    const result = lookaheadSearch(state, tutorialConfig, 100, 100, 4);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).toBe('stabilize');
  });

  it('should never pick stabilize at full stability when an available progress skill advances unmet targets', () => {
    const qiValues = [90, 120, 160, 194];
    const completionValues = [0, 20, 60, 99];
    const perfectionValues = [0, 20, 60, 99];

    for (const qi of qiValues) {
      for (const completion of completionValues) {
        for (const perfection of perfectionValues) {
          const state = new CraftingState({
            qi,
            stability: 60,
            initialMaxStability: 60,
            completion,
            perfection,
          });

          const available = getAvailableSkills(
            state,
            tutorialConfig,
            'neutral',
          );
          const hasUsefulProgress = available.some((skill) => {
            if (skill.type === 'stabilize') return false;
            const gains = calculateSkillGains(state, skill, tutorialConfig, []);
            const helpsCompletion = completion < 100 && gains.completion > 0;
            const helpsPerfection = perfection < 100 && gains.perfection > 0;
            return helpsCompletion || helpsPerfection;
          });

          if (!hasUsefulProgress) continue;

          const result = lookaheadSearch(
            state,
            tutorialConfig,
            100,
            100,
            3,
            'neutral',
            [],
          );

          expect(result.recommendation).not.toBeNull();
          expect(result.recommendation!.skill.type).not.toBe('stabilize');
        }
      }
    }
  });

  it('should deprioritize stabilize in greedy search at full stability', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 50,
      perfection: 50,
    });

    const result = greedySearch(state, tutorialConfig, 100, 100, 'neutral');
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).not.toBe('stabilize');
  });

  it('should treat runtime-reported 0 cost percentages as neutral baseline (same as 100)', () => {
    const baseState = {
      qi: 162,
      stability: 30,
      initialMaxStability: 60,
      stabilityPenalty: 3, // 30/57 effective runway
      completion: 20,
      perfection: 10,
    };
    const forecast = ['positive', 'veryPositive', 'neutral'];
    const searchConfig = { timeBudgetMs: 700, maxNodes: 200000, beamWidth: 10 };

    const zeroPercentState = new CraftingState({
      ...baseState,
      poolCostPercentage: 0,
      stabilityCostPercentage: 0,
    });
    const neutralPercentState = new CraftingState({
      ...baseState,
      poolCostPercentage: 100,
      stabilityCostPercentage: 100,
    });

    const zeroResult = lookaheadSearch(
      zeroPercentState,
      tutorialConfig,
      60,
      60,
      8,
      'neutral',
      forecast,
      searchConfig,
    );
    const neutralResult = lookaheadSearch(
      neutralPercentState,
      tutorialConfig,
      60,
      60,
      8,
      'neutral',
      forecast,
      searchConfig,
    );

    expect(zeroResult.recommendation).not.toBeNull();
    expect(neutralResult.recommendation).not.toBeNull();
    expect(zeroResult.recommendation!.skill.name).toBe(
      neutralResult.recommendation!.skill.name,
    );
    expect(zeroResult.recommendation!.score).toBeCloseTo(
      neutralResult.recommendation!.score,
      8,
    );
  });

  it('should break near-equal ties toward progress before forceful stabilize', () => {
    const snapshotLikeConfig = createTestConfig({
      maxQi: 180,
      baseIntensity: 10,
      baseControl: 10,
      minStability: 0,
      skills: [SIMPLE_FUSION, SIMPLE_REFINE, FORCEFUL_STABILIZE],
    });
    const state = new CraftingState({
      qi: 162,
      stability: 30,
      initialMaxStability: 60,
      stabilityPenalty: 3, // 30/57
      completion: 20,
      perfection: 10,
      step: 3,
    });

    const result = lookaheadSearch(
      state,
      snapshotLikeConfig,
      60,
      60,
      36,
      'neutral',
      ['positive', 'veryPositive', 'neutral'],
      { timeBudgetMs: 5000, maxNodes: 2000000, beamWidth: 10 },
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).not.toBe('stabilize');
    expect(result.recommendation!.followUpSkill).toBeDefined();
    expect(result.recommendation!.followUpSkill!.type).not.toBe('stabilize');
    expect(result.optimalRotation?.[1]).not.toBe('Forceful Stabilize');
  });

  it('should not recommend forceful stabilize follow-up at 30/57 stability with realistic budget', () => {
    // Exact reproduction of user-reported bug: at 30/57 stability the follow-up
    // suggests Forceful Stabilize (88 qi for +40 stability) even though
    // stability is adequate for 2-3 more progress turns.  The positive and
    // veryPositive conditions should be used for progress, not wasted on stabilize.
    const snapshotConfig = createTestConfig({
      maxQi: 180,
      baseIntensity: 10,
      baseControl: 10,
      minStability: 0,
      skills: [SIMPLE_FUSION, SIMPLE_REFINE, FORCEFUL_STABILIZE],
    });
    const state = new CraftingState({
      qi: 162,
      stability: 30,
      initialMaxStability: 60,
      stabilityPenalty: 3, // 30/57
      completion: 20,
      perfection: 10,
      step: 3,
    });

    // User's actual search budget is 1200ms.  Use a higher budget (3s) to
    // account for test runner overhead (parallel tests reduce available CPU).
    // The search will still hit its budget limit since depth 36 is far too
    // deep to complete in 3s, exercising the budget-constrained code paths.
    const result = lookaheadSearch(
      state,
      snapshotConfig,
      60,
      60,
      36,
      'neutral',
      ['positive', 'veryPositive', 'neutral'],
      { timeBudgetMs: 3000, maxNodes: 250000, beamWidth: 10 },
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).not.toBe('stabilize');
    // The follow-up should not waste the positive condition on stabilize
    if (result.recommendation!.followUpSkill) {
      expect(result.recommendation!.followUpSkill.type).not.toBe('stabilize');
    }
    // Second move in rotation should not be Forceful Stabilize
    if (result.optimalRotation && result.optimalRotation.length > 1) {
      expect(result.optimalRotation[1]).not.toBe('Forceful Stabilize');
    }
  });

  it('should prefer progress over forceful stabilize in the live overcap replay state', () => {
    const input = createForcefulOvercapReplayInput();

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      input.searchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const forcefulStabilize = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'forceful_stabilize',
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe('invasive_refine');
    expect(forcefulStabilize).toBeDefined();
    expect(forcefulStabilize!.immediateGains.stability).toBe(24);
    expect(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === 'invasive_refine',
      ),
    ).toBeLessThan(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === 'forceful_stabilize',
      ),
    );
  });
});

describe('survivability-first recommendation gate', () => {
  const energizedFusion = createCustomSkill({
    name: 'Energised Fusion',
    key: 'energised_fusion',
    type: 'fusion',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 1,
    scalesWithIntensity: true,
  });

  const baseState = () =>
    new CraftingState({
      qi: 131,
      stability: 10,
      initialMaxStability: 60,
      stabilityPenalty: 5, // 10/55
      completion: 79,
      perfection: 63,
    });

  const baseConfig = createTestConfig({
    minStability: 0,
    baseIntensity: 51,
    baseControl: 23,
    skills: [energizedFusion, SIMPLE_REFINE, FORCEFUL_STABILIZE],
  });

  it('should prefer forceful stabilize over craft-ending fusion in lookahead search', () => {
    for (const depth of [2, 3, 4, 5]) {
      const result = lookaheadSearch(
        baseState(),
        baseConfig,
        130,
        130,
        depth,
        'negative',
        [],
      );
      expect(result.recommendation).not.toBeNull();
      expect(result.recommendation!.skill.name).toBe('Forceful Stabilize');
    }
  });

  it('should prefer forceful stabilize over craft-ending fusion in greedy search', () => {
    const result = greedySearch(baseState(), baseConfig, 130, 130, 'negative');
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Forceful Stabilize');
  });

  it('should block unfinished ending moves when a non-stabilize survivable move exists', () => {
    const safeRefine = createCustomSkill({
      name: 'Safe Refine',
      key: 'safe_refine',
      type: 'refine',
      qiCost: 10,
      stabilityCost: 5,
      basePerfectionGain: 0.5,
      scalesWithControl: true,
    });
    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 51,
      baseControl: 23,
      skills: [energizedFusion, safeRefine],
    });

    const result = lookaheadSearch(baseState(), config, 130, 130, 4);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).not.toBe('Energised Fusion');
  });

  it('should still keep a craft-ending finisher eligible when it meets active goals', () => {
    const result = lookaheadSearch(baseState(), baseConfig, 130, 63, 4);
    expect(result.recommendation).not.toBeNull();
    const recommendedNames = [
      result.recommendation!.skill.name,
      ...result.alternativeSkills.map((rec) => rec.skill.name),
    ];
    expect(recommendedNames).toContain('Energised Fusion');
  });

  it('should keep the best craft-ending salvage move when every option resolves immediately', () => {
    const allEndingConfig = createTestConfig({
      minStability: 0,
      baseIntensity: 51,
      baseControl: 23,
      skills: [energizedFusion, SIMPLE_REFINE],
    });

    const lookaheadResult = lookaheadSearch(
      baseState(),
      allEndingConfig,
      130,
      130,
      4,
    );
    expect(lookaheadResult.recommendation).not.toBeNull();
    expect(lookaheadResult.recommendation!.skill.name).toBe('Energised Fusion');
    expect(lookaheadResult.recommendation!.skill.actionKind).not.toBe('finish');

    const greedyResult = greedySearch(baseState(), allEndingConfig, 130, 130);
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.name).toBe('Energised Fusion');
    expect(greedyResult.recommendation!.skill.actionKind).not.toBe('finish');
  });
});

describe('recommendation ranking policy', () => {
  it('should keep higher-score alternatives ahead of lower-score alternatives', () => {
    const topFusion = createCustomSkill({
      name: 'Top Fusion',
      key: 'top_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 3,
      scalesWithIntensity: true,
    });
    const midFusion = createCustomSkill({
      name: 'Mid Fusion',
      key: 'mid_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 2,
      scalesWithIntensity: true,
    });
    const weakRefine = createCustomSkill({
      name: 'Weak Refine',
      key: 'weak_refine',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.2,
      scalesWithControl: true,
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [topFusion, midFusion, weakRefine],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 100, 0, 'neutral');

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Top Fusion');
    expect(result.alternativeSkills).toHaveLength(2);
    expect(result.alternativeSkills[0].skill.name).toBe('Mid Fusion');
    expect(result.alternativeSkills[1].skill.name).toBe('Weak Refine');
  });

  it('should use diversity as a tie-break when alternatives are near-equal', () => {
    const topFusion = createCustomSkill({
      name: 'Top Fusion',
      key: 'top_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1.8,
      basePerfectionGain: 1.8,
      scalesWithIntensity: true,
      scalesWithControl: true,
    });
    const fusionAlt = createCustomSkill({
      name: 'Fusion Alt',
      key: 'fusion_alt',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1.0,
      scalesWithIntensity: true,
    });
    const refineAlt = createCustomSkill({
      name: 'Refine Alt',
      key: 'refine_alt',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 1.0,
      scalesWithControl: true,
    });

    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 16,
      baseControl: 16,
      skills: [topFusion, fusionAlt, refineAlt],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 100, 100, 'neutral');

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Top Fusion');
    expect(result.alternativeSkills).toHaveLength(2);
    expect(
      Math.abs(
        result.alternativeSkills[0].score - result.alternativeSkills[1].score,
      ),
    ).toBeLessThanOrEqual(1);
    expect(result.alternativeSkills[0].skill.type).toBe('refine');
    expect(result.alternativeSkills[1].skill.type).toBe('fusion');
  });
});

describe('top follow-up consistency', () => {
  it('should provide a top follow-up when a legal next step exists under tight budget', () => {
    const immediateA = createCustomSkill({
      name: 'Immediate A',
      key: 'immediate_a',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.8,
      scalesWithControl: true,
    });
    const immediateB = createCustomSkill({
      name: 'Immediate B',
      key: 'immediate_b',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.7,
      scalesWithControl: true,
    });
    const immediateC = createCustomSkill({
      name: 'Immediate C',
      key: 'immediate_c',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.6,
      scalesWithControl: true,
    });
    const setup = createCustomSkill({
      name: 'Setup',
      key: 'setup',
      type: 'support',
      qiCost: 0,
      stabilityCost: 10,
      effects: [
        {
          kind: 'createBuff',
          buff: { name: 'charge', canStack: true, effects: [] },
          stacks: { value: 1 },
        },
      ],
    });
    const payoff = createCustomSkill({
      name: 'Payoff',
      key: 'payoff',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 8,
      scalesWithControl: true,
      buffRequirement: { buffName: 'charge', amount: 1 },
    });

    const config = createTestConfig({
      minStability: 0,
      baseControl: 16,
      baseIntensity: 16,
      skills: [immediateA, immediateB, immediateC, setup, payoff],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 0, 100, 3, 'neutral', [], {
      maxNodes: 500,
      beamWidth: 6,
    });

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Setup');
    expect(result.recommendation!.followUpSkill).toBeDefined();
    expect(result.recommendation!.followUpSkill!.name).toBe('Payoff');
  });
});

describe('condition timeline modeling', () => {
  afterEach(() => {
    setConditionTransitionProvider(undefined);
  });

  it('should respect the current root condition instead of using first forecast condition', () => {
    const negativeOnly = createCustomSkill({
      name: 'Negative Burst',
      key: 'negative_burst',
      type: 'fusion',
      baseCompletionGain: 40,
      conditionRequirement: 'negative',
    });
    const positiveOnly = createCustomSkill({
      name: 'Positive Burst',
      key: 'positive_burst',
      type: 'fusion',
      baseCompletionGain: 60,
      conditionRequirement: 'positive',
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [negativeOnly, positiveOnly],
    });

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 0, 1, 'negative', [
      'positive',
    ]);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Negative Burst');
  });

  it('should report follow-up effective costs using the next condition', () => {
    const progress = createCustomSkill({
      name: 'Progress',
      key: 'progress',
      type: 'fusion',
      qiCost: 10,
      stabilityCost: 1,
      baseCompletionGain: 1,
      scalesWithIntensity: true,
    });

    const config = createTestConfig({
      minStability: 0,
      baseIntensity: 10,
      baseControl: 10,
      skills: [progress],
      conditionEffectsData: {
        neutral: [],
        positive: [],
        negative: [{ kind: 'pool', multiplier: 2 }],
        veryPositive: [],
        veryNegative: [],
      },
    });

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(
      state,
      config,
      100,
      0,
      2,
      'neutral',
      ['negative', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 50000, beamWidth: 4 },
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.effectiveCosts.qi).toBe(10);
    expect(result.recommendation!.followUpSkill).toBeDefined();
    expect(result.recommendation!.followUpSkill!.effectiveCosts.qi).toBe(20);
  });

  it('should project likely future conditions beyond forecast using harmony', () => {
    const setup = createCustomSkill({
      name: 'Setup',
      key: 'setup',
      type: 'support',
      qiCost: 0,
      baseCompletionGain: 0,
    });
    const direct = createCustomSkill({
      name: 'Direct Push',
      key: 'direct_push',
      type: 'fusion',
      qiCost: 10,
      baseCompletionGain: 5,
    });
    const negativeBurst = createCustomSkill({
      name: 'Negative Burst',
      key: 'negative_burst',
      type: 'fusion',
      qiCost: 10,
      baseCompletionGain: 100,
      conditionRequirement: 'negative',
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [setup, direct, negativeBurst],
    });

    const state = new CraftingState({
      qi: 10,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      harmony: -100,
    });

    const result = lookaheadSearch(state, config, 100, 0, 2, 'neutral', []);

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Setup');
  });

  it('should handle probability-weighted branching configuration beyond forecast', () => {
    const setup = createCustomSkill({
      name: 'Setup',
      key: 'setup',
      type: 'support',
      qiCost: 0,
      baseCompletionGain: 0,
    });
    const directNeutral = createCustomSkill({
      name: 'Direct Neutral Push',
      key: 'direct_neutral_push',
      type: 'fusion',
      qiCost: 0,
      baseCompletionGain: 60,
      conditionRequirement: 'neutral',
    });
    const positiveBurst = createCustomSkill({
      name: 'Positive Burst',
      key: 'positive_burst',
      type: 'fusion',
      qiCost: 0,
      baseCompletionGain: 100,
      conditionRequirement: 'positive',
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [setup, directNeutral, positiveBurst],
    });

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      harmony: 0, // positive/negative split when forecast is exhausted
    });

    const branchingResult = lookaheadSearch(
      state,
      config,
      100,
      0,
      2,
      'neutral',
      [],
      {
        enableConditionBranchingAfterForecast: true,
        conditionBranchLimit: 2,
        conditionBranchMinProbability: 0.01,
      },
    );
    expect(branchingResult.recommendation).not.toBeNull();
    expect(branchingResult.searchMetrics).toBeDefined();
    expect(branchingResult.searchMetrics!.nodesExplored).toBeGreaterThan(0);

    const deterministicResult = lookaheadSearch(
      state,
      config,
      100,
      0,
      2,
      'neutral',
      [],
      {
        enableConditionBranchingAfterForecast: false,
      },
    );
    expect(deterministicResult.recommendation).not.toBeNull();
    expect(deterministicResult.searchMetrics).toBeDefined();
    expect(deterministicResult.searchMetrics!.nodesExplored).toBeGreaterThan(0);
  });

  it('should normalize forecast queues to the fixed lookahead length', () => {
    const normalized = normalizeForecastConditionQueue('neutral', [], 0);
    expect(normalized.length).toBe(VISIBLE_CONDITION_QUEUE_LENGTH);
  });

  it('should ignore forecast entries beyond the visible 3-condition queue', () => {
    const firstThree = ['positive', 'negative', 'neutral'];
    const withExtra = [
      'positive',
      'negative',
      'neutral',
      'veryPositive',
      'veryNegative',
    ];

    const normalizedThree = normalizeForecastConditionQueue(
      'neutral',
      firstThree,
      0,
    );
    const normalizedExtra = normalizeForecastConditionQueue(
      'neutral',
      withExtra,
      0,
    );

    expect(normalizedExtra).toEqual(normalizedThree);
    expect(normalizedExtra.length).toBe(VISIBLE_CONDITION_QUEUE_LENGTH);
  });

  it('should normalize unknown condition names to lowercase', () => {
    const normalized = normalizeForecastConditionQueue(
      'Primed' as any,
      ['Glowing', 'neutral', 'Primed'] as any,
      0,
    );

    expect(normalized).toEqual(['glowing', 'neutral', 'primed']);
  });

  it('should use condition transition provider when available', () => {
    const transitionProvider = jest.fn(
      (currentCondition: any, nextConditions: any) => {
        const queue = Array.isArray(nextConditions)
          ? nextConditions.slice(1)
          : [];
        return [
          {
            nextCondition: nextConditions[0] ?? currentCondition,
            nextQueue: [...queue, 'positive'],
            probability: 1,
          },
        ];
      },
    );
    setConditionTransitionProvider(transitionProvider as any);

    const setup = createCustomSkill({
      name: 'Setup',
      key: 'setup',
      type: 'support',
      qiCost: 0,
      baseCompletionGain: 0,
    });
    const follow = createCustomSkill({
      name: 'Follow',
      key: 'follow',
      type: 'fusion',
      qiCost: 0,
      baseCompletionGain: 50,
      conditionRequirement: 'positive',
    });

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const providerConfig = createTestConfig({
      minStability: 0,
      skills: [setup, follow],
    });

    const result = lookaheadSearch(state, providerConfig, 50, 0, 2, 'neutral', [
      'neutral',
      'neutral',
      'neutral',
    ]);
    expect(result.recommendation).not.toBeNull();
    expect(transitionProvider).toHaveBeenCalled();
  });

  it('should fall back to local transitions when provider throws', () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    setConditionTransitionProvider(() => {
      throw new Error('transition provider failure');
    });

    const fallbackConfig = createTestConfig();
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    try {
      const result = lookaheadSearch(
        state,
        fallbackConfig,
        100,
        100,
        2,
        'neutral',
        ['positive', 'negative', 'neutral'],
      );
      expect(result.recommendation).not.toBeNull();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('should preserve search depth for non-turn item actions', () => {
    const setupItem = createCustomSkill({
      name: 'Use Focus Pill',
      key: 'item_focus_pill',
      actionKind: 'item',
      itemName: 'focus_pill',
      consumesTurn: false,
      type: 'support',
      buffType: BuffType.CONTROL,
      buffDuration: 2,
      buffMultiplier: 3,
    });
    const refine = createCustomSkill({
      name: 'Refine Push',
      key: 'refine_push',
      type: 'refine',
      basePerfectionGain: 1,
      scalesWithControl: true,
    });

    const config = createTestConfig({
      minStability: 0,
      baseControl: 20,
      skills: [setupItem, refine],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      items: new Map([['focus_pill', 1]]),
    });

    const result = lookaheadSearch(state, config, 0, 100, 1, 'neutral', []);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Use Focus Pill');
  });

  it('should continue sublime projections beyond base targets', () => {
    const dualProgress = createCustomSkill({
      name: 'Dual Step',
      key: 'dual_step',
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      baseCompletionGain: 100,
      basePerfectionGain: 100,
    });

    const sublimeConfig = createTestConfig({
      minStability: 0,
      skills: [dualProgress],
      isSublimeCraft: true,
      targetMultiplier: 2.0,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(
      state,
      sublimeConfig,
      100,
      100,
      2,
      'neutral',
      [],
    );
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.followUpSkill?.name).toBe('Dual Step');
    expect(result.optimalRotation).toEqual(['Dual Step', 'Dual Step']);
    expect(result.expectedFinalState).toBeDefined();
    expect(result.expectedFinalState!.completion).toBeGreaterThanOrEqual(200);
    expect(result.expectedFinalState!.perfection).toBeGreaterThanOrEqual(200);
  });

  it('should deplete item inventory across lookahead turns', () => {
    const pill = createCustomSkill({
      name: 'Use Qi Pill',
      key: 'item_qi_pill',
      actionKind: 'item',
      itemName: 'qi_pill',
      consumesTurn: false,
      type: 'support',
      qiRestore: 50,
      restoresQi: true,
    });
    const fusion = createCustomSkill({
      name: 'Fusion',
      key: 'fusion',
      type: 'fusion',
      qiCost: 40,
      stabilityCost: 10,
      baseCompletionGain: 30,
      scalesWithIntensity: false,
    });

    const config = createTestConfig({
      minStability: 0,
      maxQi: 200,
      skills: [pill, fusion],
      pillsPerRound: 1,
    });
    const state = new CraftingState({
      qi: 10,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      items: new Map([['qi_pill', 1]]),
    });

    const result = lookaheadSearch(state, config, 100, 0, 3, 'neutral', []);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.name).toBe('Use Qi Pill');
  });

  it('should deprioritize qi-restore skills when qi is near max', () => {
    const qiPill = createCustomSkill({
      name: 'Fairy Blessing',
      key: 'item_fairy_blessing',
      actionKind: 'item',
      itemName: 'fairy_blessing',
      consumesTurn: false,
      type: 'support',
      restoresQi: true,
      qiRestore: 50,
      effects: [
        {
          kind: 'pool',
          amount: { value: 50 },
        } as any,
      ],
    });
    const fusion = createCustomSkill({
      name: 'Simple Fusion',
      key: 'simple_fusion',
      type: 'fusion',
      qiCost: 10,
      stabilityCost: 10,
      baseCompletionGain: 20,
      scalesWithIntensity: false,
    });

    const config = createTestConfig({
      minStability: 0,
      maxQi: 100,
      skills: [qiPill, fusion],
      pillsPerRound: 1,
    });

    // State with qi at 95% of max - should NOT recommend qi restore
    const stateNearMax = new CraftingState({
      qi: 95,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      items: new Map([['fairy_blessing', 1]]),
    });

    const result = lookaheadSearch(
      stateNearMax,
      config,
      100,
      0,
      2,
      'neutral',
      [],
    );
    expect(result.recommendation).not.toBeNull();
    // Should recommend Fusion, not Fairy Blessing, because qi is near max
    expect(result.recommendation!.skill.name).toBe('Simple Fusion');
  });

  it('should respect reagent step-zero restriction in lookahead', () => {
    const reagent = createCustomSkill({
      name: 'Use Catalyst',
      key: 'item_catalyst',
      actionKind: 'item',
      itemName: 'catalyst',
      consumesTurn: false,
      reagentOnlyAtStepZero: true,
      type: 'support',
      stabilityGain: 30,
    });
    const fusion = createCustomSkill({
      name: 'Fusion',
      key: 'fusion',
      type: 'fusion',
      stabilityCost: 10,
      baseCompletionGain: 20,
      scalesWithIntensity: false,
    });

    const configWithReagent = createTestConfig({
      minStability: 0,
      skills: [reagent, fusion],
    });

    // Step 0: reagent should be available and recommended (free +30 stability)
    const stateStep0 = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      step: 0,
      items: new Map([['catalyst', 1]]),
    });
    const resultStep0 = lookaheadSearch(
      stateStep0,
      configWithReagent,
      100,
      0,
      2,
      'neutral',
      [],
    );
    expect(resultStep0.recommendation).not.toBeNull();
    expect(resultStep0.recommendation!.skill.name).toBe('Use Catalyst');

    // Step 1: reagent should be blocked -- only Fusion available
    const stateStep1 = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      step: 1,
      items: new Map([['catalyst', 1]]),
    });
    const resultStep1 = lookaheadSearch(
      stateStep1,
      configWithReagent,
      100,
      0,
      2,
      'neutral',
      [],
    );
    expect(resultStep1.recommendation).not.toBeNull();
    expect(resultStep1.recommendation!.skill.name).toBe('Fusion');
  });

  it('should respect pills-per-round limit in mixed technique+item sequences', () => {
    const pill1 = createCustomSkill({
      name: 'Use Pill A',
      key: 'item_pill_a',
      actionKind: 'item',
      itemName: 'pill_a',
      consumesTurn: false,
      type: 'support',
      stabilityGain: 10,
    });
    const pill2 = createCustomSkill({
      name: 'Use Pill B',
      key: 'item_pill_b',
      actionKind: 'item',
      itemName: 'pill_b',
      consumesTurn: false,
      type: 'support',
      stabilityGain: 10,
    });
    const fusion = createCustomSkill({
      name: 'Fusion',
      key: 'fusion',
      type: 'fusion',
      stabilityCost: 10,
      baseCompletionGain: 20,
      scalesWithIntensity: false,
    });

    const configOnePill = createTestConfig({
      minStability: 0,
      skills: [pill1, pill2, fusion],
      pillsPerRound: 1,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      items: new Map([
        ['pill_a', 2],
        ['pill_b', 2],
      ]),
    });

    const result = lookaheadSearch(
      state,
      configOnePill,
      100,
      0,
      2,
      'neutral',
      [],
    );
    expect(result.recommendation).not.toBeNull();
    // After using one pill, the second should not be available until a technique advances the turn
    expect(result.optimalRotation).toBeDefined();
    // Verify we don't see two pills in a row (pillsPerRound=1 blocks that)
    const rotation = result.optimalRotation!;
    for (let i = 0; i < rotation.length - 1; i++) {
      const isItem = rotation[i].startsWith('Use Pill');
      const nextIsItem = rotation[i + 1].startsWith('Use Pill');
      expect(isItem && nextIsItem).toBe(false);
    }
  });
});

describe('search performance', () => {
  const config = createTestConfig();

  it('should complete depth-3 search in reasonable time', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const startTime = Date.now();
    const result = lookaheadSearch(state, config, 100, 100, 3);
    const endTime = Date.now();

    expect(result.recommendation).not.toBeNull();
    // Should complete in under 1 second
    expect(endTime - startTime).toBeLessThan(1000);
  });

  it('should complete depth-4 search in reasonable time', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const startTime = Date.now();
    const result = lookaheadSearch(state, config, 100, 100, 4);
    const endTime = Date.now();

    expect(result.recommendation).not.toBeNull();
    // Should complete in under 2 seconds
    expect(endTime - startTime).toBeLessThan(2000);
  });

  it('should benefit from memoization', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // Run a single search at depth 4 — the tree should encounter the same
    // state via different skill orderings and reuse cached scores.
    const result = lookaheadSearch(state, config, 100, 100, 4);

    expect(result.searchMetrics).toBeDefined();
    expect(result.searchMetrics!.cacheHits).toBeGreaterThan(0);
  });

  it('should handle large late-game numbers efficiently', () => {
    // Simulate late-game scenario with very large completion/perfection targets
    const state = new CraftingState({
      qi: 500,
      stability: 50,
      initialMaxStability: 60,
      completion: 1500000, // 1.5 million - already have significant progress
      perfection: 1200000, // 1.2 million
    });

    const startTime = Date.now();
    const result = lookaheadSearch(
      state,
      config,
      2000000, // 2 million target
      1800000, // 1.8 million target
      6, // depth 6 - would be very slow without optimizations
      undefined,
      [],
      { timeBudgetMs: 200, beamWidth: 6 }, // Use time budget to prevent freezes
    );
    const endTime = Date.now();

    // Should complete within time budget (with some margin)
    expect(endTime - startTime).toBeLessThan(500);

    // Should still provide a recommendation
    expect(result.recommendation).not.toBeNull();

    // Should have search metrics
    expect(result.searchMetrics).toBeDefined();
    expect(result.searchMetrics!.nodesExplored).toBeGreaterThan(0);
  });

  it('should respect time budget and not freeze UI', () => {
    const state = new CraftingState({
      qi: 200,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // Very deep search with strict time budget
    const startTime = Date.now();
    const result = lookaheadSearch(
      state,
      config,
      100000,
      100000,
      12, // Very deep - would take forever without budget
      undefined,
      [],
      { timeBudgetMs: 50, maxNodes: 10000 }, // Strict budget
    );
    const endTime = Date.now();

    // Should terminate within reasonable time (budget + overhead)
    expect(endTime - startTime).toBeLessThan(500);

    // Should still provide best result found so far
    expect(result.recommendation).not.toBeNull();
  });

  it('should report search metrics', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.searchMetrics).toBeDefined();
    expect(result.searchMetrics!.nodesExplored).toBeGreaterThan(0);
    expect(result.searchMetrics!.timeTakenMs).toBeGreaterThanOrEqual(0);
    expect(result.searchMetrics!.depthReached).toBe(3);
  });
});

describe('Regression: core optimizer bugs', () => {
  // Bug (a): Tutorial scenario — positive condition on perfectable recipe should
  // prefer Simple Refine (scales with control, boosted by condition) over Simple Fusion.
  it('should recommend Simple Refine on positive condition for perfectable recipe', () => {
    // Perfectable recipe: positive condition boosts control (+50%)
    const config = createTestConfig({
      minStability: 0,
      skills: [SIMPLE_FUSION, SIMPLE_REFINE, FORCEFUL_STABILIZE],
      conditionEffectType: 'perfectable' as any,
    });

    // Both completion and perfection needed equally, plenty of resources
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // On positive condition, control is boosted so Simple Refine gives more perfection.
    // The optimizer should prefer Refine to capitalize on the condition bonus.
    const greedyResult = greedySearch(state, config, 50, 50, 'positive');
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.name).toBe('Simple Refine');

    const lookaheadResult = lookaheadSearch(
      state,
      config,
      50,
      50,
      3,
      'positive',
    );
    expect(lookaheadResult.recommendation).not.toBeNull();
    expect(lookaheadResult.recommendation!.skill.name).toBe('Simple Refine');
  });

  // Bug (b): Stability critically low — stabilize should be recommended when all
  // progress skills would reduce stability to or below minStability (ending the craft).
  it('should recommend stabilize when all progress skills would end the craft', () => {
    const config = createTestConfig({
      minStability: 0,
      skills: [SIMPLE_FUSION, SIMPLE_REFINE, FORCEFUL_STABILIZE],
    });

    // Stability is 10 — using any progress skill costs 10 stability, leaving 0 (= minStability).
    // This would end the craft. Stabilize should be recommended instead.
    const state = new CraftingState({
      qi: 194,
      stability: 10,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const greedyResult = greedySearch(state, config, 50, 50);
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.type).toBe('stabilize');

    const lookaheadResult = lookaheadSearch(state, config, 50, 50, 3);
    expect(lookaheadResult.recommendation).not.toBeNull();
    expect(lookaheadResult.recommendation!.skill.type).toBe('stabilize');
  });

  // Bug (c): stall penalties should not deprioritise stabilize
  // when all non-stabilize skills would end the craft.
  it('should not filter stabilize when it is the only survival option', () => {
    const simpleFusion = createCustomSkill({
      name: 'Simple Fusion',
      key: 'simple_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 15,
      baseCompletionGain: 1,
      scalesWithIntensity: true,
    });
    const expensiveRefine = createCustomSkill({
      name: 'Expensive Refine',
      key: 'expensive_refine',
      type: 'refine',
      qiCost: 18,
      stabilityCost: 15,
      basePerfectionGain: 1,
      scalesWithControl: true,
    });
    const stabilize = createCustomSkill({
      name: 'Stabilize',
      key: 'stabilize',
      type: 'stabilize',
      qiCost: 50,
      stabilityCost: 0,
      stabilityGain: 30,
      preventsMaxStabilityDecay: true,
    });

    const config = createTestConfig({
      minStability: 5,
      skills: [simpleFusion, expensiveRefine, stabilize],
    });

    // Stability is 15 — using any progress skill (cost 15) leaves stability at 0,
    // which is below minStability (5). Only stabilize keeps the craft alive.
    const state = new CraftingState({
      qi: 194,
      stability: 15,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // Both greedy and lookahead should recommend stabilize
    const greedyResult = greedySearch(state, config, 50, 50);
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.type).toBe('stabilize');

    const lookaheadResult = lookaheadSearch(state, config, 50, 50, 3);
    expect(lookaheadResult.recommendation).not.toBeNull();
    expect(lookaheadResult.recommendation!.skill.type).toBe('stabilize');
  });
});

// ---------------------------------------------------------------------------
// Isolated scoreState unit tests
// ---------------------------------------------------------------------------

describe('scoreState (isolated)', () => {
  it('should return higher score for more completion progress', () => {
    const low = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 20,
      perfection: 0,
    });
    const high = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 40,
      perfection: 0,
    });
    expect(scoreState(high, 100, 100)).toBeGreaterThan(
      scoreState(low, 100, 100),
    );
  });

  it('should give large bonus when base targets are met', () => {
    const unmet = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 99,
      perfection: 100,
    });
    const met = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100,
      perfection: 100,
    });
    const diff = scoreState(met, 100, 100) - scoreState(unmet, 100, 100);
    // Target-met bonus = totalTargetMagnitude × SCORING.TARGET_MET_MULTIPLIER
    // = 200 × 2 = 400.  Diff is ~400 minus the small progress-score delta
    // from the 1-point completion gap, so conservatively > 75% of 400.
    const expectedBonus = 200 * SCORING.TARGET_MET_MULTIPLIER;
    expect(diff).toBeGreaterThan(expectedBonus * 0.75);
  });

  it('should not apply stability penalty when targets are met', () => {
    const lowStab = new CraftingState({
      qi: 100,
      stability: 5,
      initialMaxStability: 60,
      completion: 100,
      perfection: 100,
    });
    const highStab = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100,
      perfection: 100,
    });
    const diff = scoreState(highStab, 100, 100) - scoreState(lowStab, 100, 100);
    // Only tiny tiebreaker difference (stability * 0.001), not a real penalty
    expect(diff).toBeLessThan(1);
  });

  it('should penalize low stability when targets are NOT met', () => {
    const lowStab = new CraftingState({
      qi: 100,
      stability: 5,
      initialMaxStability: 60,
      completion: 50,
      perfection: 50,
    });
    const highStab = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 50,
      perfection: 50,
    });
    const diff = scoreState(highStab, 100, 100) - scoreState(lowStab, 100, 100);
    // With targets (100,100), totalTargetMagnitude=200, avgStabCost=10, avgGain=16:
    // lowStab(5): quadratic ~60 + near-death 5×90=450 + runway 7×200×0.1=140 ≈ 650
    // highStab(50): runway 2×200×0.1=40 only.  Diff ≈ 610.
    expect(diff).toBeGreaterThan(100);
  });

  it('should prefer shorter paths (lower step count) when targets are met', () => {
    const short = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100,
      perfection: 100,
      step: 5,
    });
    const long = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100,
      perfection: 100,
      step: 10,
    });
    expect(scoreState(short, 100, 100)).toBeGreaterThan(
      scoreState(long, 100, 100),
    );
  });

  it('should penalize overshoot beyond targets', () => {
    const exact = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100,
      perfection: 100,
    });
    const over = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 150,
      perfection: 150,
    });
    expect(scoreState(exact, 100, 100)).toBeGreaterThan(
      scoreState(over, 100, 100),
    );
  });

  it('should value buffs proportionally to remaining work', () => {
    // Far from targets: buff should be valuable
    const farWithBuff = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      controlBuffTurns: 2,
      controlBuffMultiplier: 1.4,
    });
    const farNoBuff = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const farDiff =
      scoreState(farWithBuff, 100, 100) - scoreState(farNoBuff, 100, 100);

    // Close to targets: buff should be less valuable
    const closeWithBuff = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 90,
      perfection: 90,
      controlBuffTurns: 2,
      controlBuffMultiplier: 1.4,
    });
    const closeNoBuff = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 90,
      perfection: 90,
    });
    const closeDiff =
      scoreState(closeWithBuff, 100, 100) - scoreState(closeNoBuff, 100, 100);

    expect(farDiff).toBeGreaterThan(closeDiff);
  });

  it('should apply runway penalty when stability insufficient for remaining work', () => {
    const lowRunway = new CraftingState({
      qi: 100,
      stability: 10,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const highRunway = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const diff =
      scoreState(highRunway, 100, 100) - scoreState(lowRunway, 100, 100);
    // lowRunway(10): quadratic ~51 + runway 12×200×0.1=240 ≈ 291 total
    // highRunway(50): runway 8×200×0.1=160 only.  Diff ≈ 131.
    expect(diff).toBeGreaterThan(35);
  });

  it('should handle zero targets gracefully', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 50,
      perfection: 30,
    });
    const score = scoreState(state, 0, 0);
    // When both targets are 0, returns min(completion, perfection)
    expect(score).toBe(30);
  });

  it('should handle completion-only targets', () => {
    const met = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 100,
      perfection: 0,
    });
    const unmet = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 50,
      perfection: 0,
    });
    // perfectionTarget <= 0, so targets should be considered met at completion=100
    expect(scoreState(met, 100, 0)).toBeGreaterThan(scoreState(unmet, 100, 0));
  });

  it('replays the full skyfall bow snapshot contract without returning to fusion at heat six', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'skyfall-bow-heat-regression.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      input.searchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const explosiveFusion = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'explosive_fusion',
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe(
      'explosive_fusion',
    );
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).not.toBe('fusion');
    expect(explosiveFusion).toBeDefined();
    expect(result.recommendation!.score).toBeGreaterThan(
      explosiveFusion!.score,
    );
  });

  it('replays the low-stability step-before snapshot and now prefers guaranteed stabilization', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'low-stability-step-before.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      input.searchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const corruptedStabilization = allRecommendations.find(
      (recommendation) =>
        recommendation.skill.key === 'corrupted_stabilization',
    );
    const forcefulStabilize = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'forceful_stabilize',
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe(
      'corrupted_stabilization',
    );
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe('forceful_stabilize');
    expect(forcefulStabilize).toBeDefined();
    expect(corruptedStabilization).toBeDefined();
    expect(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === 'forceful_stabilize',
      ),
    ).toBeLessThan(
      allRecommendations.findIndex(
        (recommendation) =>
          recommendation.skill.key === 'corrupted_stabilization',
      ),
    );
  });

  it('replays the low-stability regression snapshot and keeps invasive refine as a risky lower-ranked alternative', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'low-stability-regression.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      input.searchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const invasiveRefine = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'invasive_refine',
    );
    const forcefulStabilize = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'forceful_stabilize',
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe('invasive_refine');
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe('forceful_stabilize');
    expect(result.recommendation!.skill.type).toBe('stabilize');
    expect(forcefulStabilize).toBeDefined();
    expect(invasiveRefine).toBeDefined();
    expect((invasiveRefine as any).requiresProbabilisticSurvival).toBe(true);
    expect(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === 'forceful_stabilize',
      ),
    ).toBeLessThan(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === 'invasive_refine',
      ),
    );
  });

  it('values aligned resonance strength as productive harmony quality', () => {
    const quality = evaluateHarmonySubsystemQuality(
      {
        resonance: {
          resonance: 'refine',
          strength: 5,
          pendingCount: 0,
        },
        recommendedTechniqueTypes: ['refine'],
      },
      0.2,
      0.8,
    );

    expect(quality).toBeGreaterThan(0.4);
  });

  it('values a pending resonance switch toward the needed type above staying on the wrong type', () => {
    const stuckOnFusion = evaluateHarmonySubsystemQuality(
      {
        resonance: {
          resonance: 'fusion',
          strength: 3,
          pendingCount: 0,
        },
        recommendedTechniqueTypes: ['fusion'],
      },
      0.2,
      0.8,
    );
    const pendingRefineSwitch = evaluateHarmonySubsystemQuality(
      {
        resonance: {
          resonance: 'fusion',
          strength: 3,
          pendingResonance: 'refine',
          pendingCount: 1,
        },
        recommendedTechniqueTypes: ['fusion'],
      },
      0.2,
      0.8,
    );

    expect(pendingRefineSwitch).toBeGreaterThan(stuckOnFusion);
  });

  it('values partial alchemical charge progress when the valid next charge matches missing work', () => {
    const quality = evaluateHarmonySubsystemQuality(
      {
        alchemicalArts: {
          charges: ['fusion', 'fusion'],
          lastCombo: [],
        },
        recommendedTechniqueTypes: ['refine'],
      },
      0.15,
      0.85,
    );

    expect(quality).toBeGreaterThan(0.4);
  });

  it('values forge heat by normalized distance from the sweet spot', () => {
    const heatZero = evaluateHarmonySubsystemQuality(
      {
        forgeWorks: { heat: 0 },
        recommendedTechniqueTypes: ['fusion'],
      },
      0.2,
      0.8,
    );
    const heatOne = evaluateHarmonySubsystemQuality(
      {
        forgeWorks: { heat: 1 },
        recommendedTechniqueTypes: ['fusion'],
      },
      0.2,
      0.8,
    );
    const heatFour = evaluateHarmonySubsystemQuality(
      {
        forgeWorks: { heat: 4 },
        recommendedTechniqueTypes: ['fusion'],
      },
      0.2,
      0.8,
    );

    expect(heatOne).toBeGreaterThan(heatZero);
    expect(heatFour).toBeGreaterThan(heatOne);
  });

  it('values partial inscription block progress before the next stack is awarded', () => {
    const noBlockProgress = evaluateHarmonySubsystemQuality(
      {
        inscribedPatterns: {
          currentBlock: ['stabilize', 'support', 'fusion', 'refine', 'refine'],
          completedBlocks: 0,
          stacks: 0,
        },
        recommendedTechniqueTypes: [
          'stabilize',
          'support',
          'fusion',
          'refine',
          'refine',
        ],
      },
      0.5,
      0.5,
    );
    const partialBlockProgress = evaluateHarmonySubsystemQuality(
      {
        inscribedPatterns: {
          currentBlock: ['fusion', 'refine', 'refine'],
          completedBlocks: 0,
          stacks: 0,
        },
        recommendedTechniqueTypes: ['fusion', 'refine', 'refine'],
      },
      0.5,
      0.5,
    );

    expect(partialBlockProgress).toBeGreaterThan(noBlockProgress);
  });

  it('replays the user resonance snapshot and prefers refine over explosive fusion', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'user-report-resonance-regression.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);
    const stableSearchConfig = {
      ...input.searchConfig,
      timeBudgetMs: Math.max(input.searchConfig.timeBudgetMs ?? 0, 4000),
      maxNodes: Math.max(input.searchConfig.maxNodes ?? 0, 750000),
    };

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      stableSearchConfig,
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe(
      'explosive_fusion',
    );
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).toBe('refine');
    expect(result.recommendation!.skill.key).toBe('focused_refine');
  });

  it('replays the user alchemical sequence snapshot and respects the refine-only harmony step', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'user-report-alchemical-sequence.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);
    const stableSearchConfig = {
      ...input.searchConfig,
      timeBudgetMs: Math.max(input.searchConfig.timeBudgetMs ?? 0, 1000),
      maxNodes: Math.max(input.searchConfig.maxNodes ?? 0, 400000),
    };

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      stableSearchConfig,
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe('invasive_fusion');
    expect(input.state.harmonyData?.recommendedTechniqueTypes).toEqual([
      'refine',
    ]);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).toBe('refine');
    expect(result.recommendation!.skill.type).not.toBe('fusion');
    expect(result.recommendation!.skill.type).not.toBe('stabilize');
  });

  it('replays the premature-finish proc-floor snapshot and keeps proc-dependent refine behind safe stabilization', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'premature-finish-proc-floor.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      input.searchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const invasiveRefine = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'invasive_refine',
    );
    const forcefulStabilize = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'forceful_stabilize',
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe('invasive_refine');
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.key).toBe('forceful_stabilize');
    expect(result.recommendation!.skill.type).toBe('stabilize');
    expect(forcefulStabilize).toBeDefined();
    expect(invasiveRefine).toBeDefined();
    expect((invasiveRefine as any).requiresProbabilisticSurvival).toBe(true);
    expect(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === 'forceful_stabilize',
      ),
    ).toBeLessThan(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === 'invasive_refine',
      ),
    );
  });

  it('replays the user runway snapshot and keeps pushing progress instead of finishing early', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'user-report-premature-finish-runway.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);
    const stableSearchConfig = {
      ...input.searchConfig,
      timeBudgetMs: Math.max(input.searchConfig.timeBudgetMs ?? 0, 4000),
      maxNodes: Math.max(input.searchConfig.maxNodes ?? 0, 750000),
    };

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      stableSearchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const finishCraft = allRecommendations.find(
      (recommendation) => recommendation.skill.key === '__finish_craft__',
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe(
      '__finish_craft__',
    );
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.actionKind).not.toBe('finish');
    expect(finishCraft).toBeDefined();
    expect(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === '__finish_craft__',
      ),
    ).toBeGreaterThan(0);
  });

  it('replays the user fairy recovery snapshot and ranks live continuation above Finish Craft', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'user-report-fairy-recovery.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);
    const stableSearchConfig = {
      ...input.searchConfig,
      timeBudgetMs: Math.max(input.searchConfig.timeBudgetMs ?? 0, 4000),
      maxNodes: Math.max(input.searchConfig.maxNodes ?? 0, 750000),
    };

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      stableSearchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const finishCraft = allRecommendations.find(
      (recommendation) => recommendation.skill.key === '__finish_craft__',
    );
    const fairyRecovery = allRecommendations.find(
      (recommendation) => recommendation.skill.key === "fairy's_blessing",
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe(
      '__finish_craft__',
    );
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.actionKind).not.toBe('finish');
    expect([
      'delayed_fusion',
      "fairy's_blessing",
      'overbearing_stabilization',
    ]).toContain(result.recommendation!.skill.key);
    expect(finishCraft).toBeDefined();
    expect(fairyRecovery).toBeDefined();
    expect(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === "fairy's_blessing",
      ),
    ).toBeLessThan(
      allRecommendations.findIndex(
        (recommendation) => recommendation.skill.key === '__finish_craft__',
      ),
    );
  });

  it('replays the forge heat runway snapshot at heat two and prioritizes heat recovery over support setup', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'forge-heat-runway-step-2.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      input.searchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const focus = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'focus',
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe('focus');
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).toBe('fusion');
    expect(result.recommendation!.skill.key).not.toBe('focus');
    expect(focus).toBeDefined();
    expect(result.recommendation!.score).toBeGreaterThan(focus!.score);
  });

  it('replays the forge heat runway snapshot at heat one and no longer walks forge heat to zero', () => {
    const snapshot = loadOptimizerReplaySnapshot(
      'forge-heat-runway-step-3.snapshot.json',
    );
    const input = getReplaySearchInput(snapshot);

    const result = lookaheadSearch(
      input.state,
      input.config,
      input.targetCompletion,
      input.targetPerfection,
      input.lookaheadDepth,
      input.currentCondition,
      input.forecastConditions as any,
      input.searchConfig,
    );

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const unstableReEnergisation = allRecommendations.find(
      (recommendation) =>
        recommendation.skill.key === 'unstable_re-energisation',
    );

    expect(snapshot.output?.recommendation?.skill?.key).toBe(
      'unstable_re-energisation',
    );
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.skill.type).toBe('fusion');
    expect(result.recommendation!.skill.key).not.toBe(
      'unstable_re-energisation',
    );
    expect(unstableReEnergisation).toBeDefined();
    expect(result.recommendation!.score).toBeGreaterThan(
      unstableReEnergisation!.score,
    );
  });
});
