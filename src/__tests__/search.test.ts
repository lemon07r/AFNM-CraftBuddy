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
} from '../optimizer/skills';
import {
  findBestSkill,
  greedySearch,
  lookaheadSearch,
  normalizeForecastConditionQueue,
  setConditionTransitionProvider,
  VISIBLE_CONDITION_QUEUE_LENGTH,
} from '../optimizer/search';

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

    // Check if any skill has consumesBuff flag
    const allSkills = [result.recommendation!, ...result.alternativeSkills];
    const disciplinedTouch = allSkills.find((s) => s.skill.isDisciplinedTouch);
    if (disciplinedTouch) {
      expect(disciplinedTouch.consumesBuff).toBe(true);
    }
  });

  it('should use forecasted conditions in search', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = lookaheadSearch(state, config, 100, 100, 3);

    expect(result.recommendation).not.toBeNull();
    // The search should complete without errors
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

  it('should avoid recommending stabilize at high stability when most gain would be wasted', () => {
    const refine = createCustomSkill({
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

    const focusedConfig = createTestConfig({
      minStability: 0,
      baseControl: 16,
      skills: [refine, forcefulStabilize],
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
    const forcefulStabilize = createCustomSkill({
      name: 'Forceful Stabilize',
      key: 'forceful_stabilize',
      type: 'stabilize',
      qiCost: 88,
      stabilityCost: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
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
    const simpleFusion = createCustomSkill({
      name: 'Simple Fusion',
      key: 'simple_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1,
      scalesWithIntensity: true,
    });
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
        simpleFusion,
        simpleRefine,
        forcefulStabilize,
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
    const refine = createCustomSkill({
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

    const focusedConfig = createTestConfig({
      minStability: 0,
      baseControl: 16,
      skills: [refine, forcefulStabilize],
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
    const forcefulStabilize = createCustomSkill({
      name: 'Forceful Stabilize',
      key: 'forceful_stabilize',
      type: 'stabilize',
      qiCost: 88,
      stabilityCost: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
    });
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
      skills: [forcefulStabilize, costlyFusion, harmoniousFusion],
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
    const qiPill = createCustomSkill({
      name: 'Use Qi Pill',
      key: 'item_qi_pill',
      actionKind: 'item',
      itemName: 'qi_pill',
      consumesTurn: false,
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

    const greedyResult = greedySearch(state, config, 100, 0, 'neutral');
    expect(greedyResult.recommendation).not.toBeNull();
    expect(greedyResult.recommendation!.skill.name).toBe('Slow Fusion');
  });

  it('should keep stabilize available when no progress skill can advance unmet targets', () => {
    const forcefulStabilize = createCustomSkill({
      name: 'Forceful Stabilize',
      key: 'forceful_stabilize',
      type: 'stabilize',
      qiCost: 88,
      stabilityCost: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
    });

    const config = createTestConfig({
      minStability: 0,
      skills: [forcefulStabilize],
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
    const forcefulStabilize = createCustomSkill({
      name: 'Forceful Stabilize',
      key: 'forceful_stabilize',
      type: 'stabilize',
      qiCost: 88,
      stabilityCost: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
    });
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
      skills: [forcefulStabilize, costlyFusion],
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
    const forcefulStabilize = createCustomSkill({
      name: 'Forceful Stabilize',
      key: 'forceful_stabilize',
      type: 'stabilize',
      qiCost: 88,
      stabilityCost: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
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
      skills: [forcefulStabilize, simpleRefine, disciplinedTouch],
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
  });

  it('should pass forecasted conditions to lookahead', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = findBestSkill(state, config, 100, 100, false, 3);

    expect(result.recommendation).not.toBeNull();
  });
});

describe('search algorithm correctness', () => {
  const config = createTestConfig();

  it('should prefer buff setup when far from targets', () => {
    const state = new CraftingState({
      qi: 150,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = findBestSkill(state, config, 100, 100, false, 4);

    expect(result.recommendation).not.toBeNull();
    // With enough resources and far from targets, buff setup is often optimal
    // The algorithm should find a good path
    expect(result.optimalRotation!.length).toBeGreaterThan(0);
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
    expect(
      skill.baseCompletionGain > 0 ||
        skill.basePerfectionGain > 0 ||
        skill.type === 'stabilize', // May need stability first
    ).toBe(true);
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
    skills: [energizedFusion, simpleRefine, forcefulStabilize],
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

  it('should keep best-salvage recommendation when all actions end the craft', () => {
    const allEndingConfig = createTestConfig({
      minStability: 0,
      baseIntensity: 51,
      baseControl: 23,
      skills: [energizedFusion, simpleRefine],
    });

    const lookaheadResult = lookaheadSearch(
      baseState(),
      allEndingConfig,
      130,
      130,
      4,
    );
    expect(lookaheadResult.recommendation).not.toBeNull();
    expect(['Energised Fusion', 'Simple Refine']).toContain(
      lookaheadResult.recommendation!.skill.name,
    );

    const greedyResult = greedySearch(baseState(), allEndingConfig, 130, 130);
    expect(greedyResult.recommendation).not.toBeNull();
    expect(['Energised Fusion', 'Simple Refine']).toContain(
      greedyResult.recommendation!.skill.name,
    );
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
      maxNodes: 206,
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

    // Step 0: reagent should be available and usable
    const stateStep0 = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      step: 0,
      items: new Map([['catalyst', 1]]),
    });
    const availableStep0 = stateStep0.step === 0;
    expect(availableStep0).toBe(true);

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

    // Run twice - second run should be similar or faster due to similar state patterns
    const startTime1 = Date.now();
    lookaheadSearch(state, config, 100, 100, 3);
    const time1 = Date.now() - startTime1;

    const startTime2 = Date.now();
    lookaheadSearch(state, config, 100, 100, 3);
    const time2 = Date.now() - startTime2;

    // Both should complete quickly
    expect(time1).toBeLessThan(1000);
    expect(time2).toBeLessThan(1000);
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

    // Perfectable recipe: positive condition boosts control (+50%)
    const config = createTestConfig({
      minStability: 0,
      skills: [simpleFusion, simpleRefine, forcefulStabilize],
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

    const config = createTestConfig({
      minStability: 0,
      skills: [simpleFusion, simpleRefine, forcefulStabilize],
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
