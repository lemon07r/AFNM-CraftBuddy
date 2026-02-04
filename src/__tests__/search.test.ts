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
      stability: 10,
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
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const result = greedySearch(state, config, 0, 100);

    expect(result.recommendation).not.toBeNull();
    const skill = result.recommendation!.skill;
    expect(skill.type === 'refine' || skill.basePerfectionGain > 0).toBe(true);
  });

  it('should recommend stabilize when stability is low', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 15, // Low stability
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    const result = greedySearch(state, config, 100, 100);
    
    expect(result.recommendation).not.toBeNull();
    // Should recommend stabilize skill
    const skill = result.recommendation!.skill;
    expect(skill.type).toBe('stabilize');
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
      stability: 10,
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
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    // Forecasted conditions: good, bad, neutral
    const forecastedConditions = [1.5, 0.75, 1.0];
    
    const result = lookaheadSearch(state, config, 100, 100, 3, 1.0, forecastedConditions);
    
    expect(result.recommendation).not.toBeNull();
    // The search should complete without errors
  });

  it('should handle different lookahead depths', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    // Test different depths
    for (const depth of [1, 2, 3, 4]) {
      const result = lookaheadSearch(state, config, 100, 100, depth);
      expect(result.recommendation).not.toBeNull();
    }
  });
});

describe('findBestSkill', () => {
  const config = createTestConfig();

  it('should use greedy search when specified', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    const result = findBestSkill(state, config, 100, 100, 1.0, true);
    
    expect(result.recommendation).not.toBeNull();
    // Greedy search doesn't provide optimal rotation
    expect(result.optimalRotation).toBeUndefined();
  });

  it('should use lookahead search by default', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    const result = findBestSkill(state, config, 100, 100, 1.0, false, 3);
    
    expect(result.recommendation).not.toBeNull();
    // Lookahead search provides optimal rotation
    expect(result.optimalRotation).toBeDefined();
  });

  it('should apply condition multiplier', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    // Good condition (1.5x multiplier)
    const goodResult = findBestSkill(state, config, 100, 100, 1.5, false, 3);
    
    // Bad condition (0.75x multiplier)
    const badResult = findBestSkill(state, config, 100, 100, 0.75, false, 3);
    
    // Both should return valid recommendations
    expect(goodResult.recommendation).not.toBeNull();
    expect(badResult.recommendation).not.toBeNull();
  });

  it('should pass forecasted conditions to lookahead', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    const forecastedConditions = [1.25, 1.0, 0.75];
    
    const result = findBestSkill(
      state, config, 100, 100, 1.0, false, 3, forecastedConditions
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
      maxStability: 60,
      completion: 0,
      perfection: 0,
    });
    
    const result = findBestSkill(state, config, 100, 100, 1.0, false, 4);
    
    expect(result.recommendation).not.toBeNull();
    // With enough resources and far from targets, buff setup is often optimal
    // The algorithm should find a good path
    expect(result.optimalRotation!.length).toBeGreaterThan(0);
  });

  it('should prefer direct gains when close to targets', () => {
    const state = new CraftingState({
      qi: 50,
      stability: 30,
      maxStability: 40,
      completion: 90,
      perfection: 90,
    });
    
    const result = findBestSkill(state, config, 100, 100, 1.0, false, 3);
    
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
      maxStability: 60,
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
      maxStability: 60,
      completion: 150,
      perfection: 120,
    });
    
    const result = findBestSkill(state, config, 100, 100);
    
    expect(result.targetsMet).toBe(true);
  });
});

describe('search performance', () => {
  const config = createTestConfig();

  it('should complete depth-3 search in reasonable time', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
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
      maxStability: 60,
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
      maxStability: 60,
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
});
