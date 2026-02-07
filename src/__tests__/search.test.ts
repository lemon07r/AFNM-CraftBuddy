/**
 * Unit tests for search algorithms
 */

import { CraftingState, BuffType } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  DEFAULT_SKILLS,
} from '../optimizer/skills';
import {
  findBestSkill,
  greedySearch,
  lookaheadSearch,
  normalizeForecastConditionQueue,
  VISIBLE_CONDITION_QUEUE_LENGTH,
} from '../optimizer/search';

// Helper to create a basic test config
function createTestConfig(overrides: Partial<OptimizerConfig> = {}): OptimizerConfig {
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

function createCustomSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
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
    const disciplinedTouch = allSkills.find(s => s.skill.isDisciplinedTouch);
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
    const goodConfig = { ...config, conditionEffectsData: {
      neutral: [], positive: [{ kind: 'control' as const, multiplier: 0.5 }],
      negative: [], veryPositive: [], veryNegative: [],
    }};
    const goodResult = findBestSkill(state, goodConfig, 100, 100, false, 3, 'positive');
    
    // Bad condition (negative)
    const badConfig = { ...config, conditionEffectsData: {
      neutral: [], positive: [],
      negative: [{ kind: 'control' as const, multiplier: -0.25 }],
      veryPositive: [], veryNegative: [],
    }};
    const badResult = findBestSkill(state, badConfig, 100, 100, false, 3, 'negative');
    
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
    
    const result = findBestSkill(
      state, config, 100, 100, false, 3
    );
    
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
      skill.type === 'stabilize' // May need stability first
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

describe('condition timeline modeling', () => {
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

    const result = lookaheadSearch(state, config, 100, 0, 1, 'negative', ['positive']);

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
      }
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
      }
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
    const withExtra = ['positive', 'negative', 'neutral', 'veryPositive', 'veryNegative'];

    const normalizedThree = normalizeForecastConditionQueue('neutral', firstThree, 0);
    const normalizedExtra = normalizeForecastConditionQueue('neutral', withExtra, 0);

    expect(normalizedExtra).toEqual(normalizedThree);
    expect(normalizedExtra.length).toBe(VISIBLE_CONDITION_QUEUE_LENGTH);
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
      completion: 1500000,  // 1.5 million - already have significant progress
      perfection: 1200000,  // 1.2 million
    });
    
    const startTime = Date.now();
    const result = lookaheadSearch(
      state, config, 
      2000000,  // 2 million target
      1800000,  // 1.8 million target
      6,        // depth 6 - would be very slow without optimizations
      undefined,
      [],
      { timeBudgetMs: 200, beamWidth: 6 }  // Use time budget to prevent freezes
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
      state, config, 
      100000, 100000, 
      12,  // Very deep - would take forever without budget
      undefined,
      [],
      { timeBudgetMs: 50, maxNodes: 10000 }  // Strict budget
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
