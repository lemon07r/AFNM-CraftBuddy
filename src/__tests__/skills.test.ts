/**
 * Unit tests for skills module
 */

import { CraftingState, BuffType } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  DEFAULT_SKILLS,
  DEFAULT_CONFIG,
  canApplySkill,
  applySkill,
  calculateSkillGains,
  getAvailableSkills,
  isTerminalState,
  getEffectiveQiCost,
  getEffectiveStabilityCost,
} from '../optimizer/skills';

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

// Helper to create a basic skill
function createTestSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'Test Skill',
    key: 'test_skill',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 12,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
    ...overrides,
  };
}

describe('canApplySkill', () => {
  it('should allow skill when resources are sufficient', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    expect(canApplySkill(state, skill, 10)).toBe(true);
  });

  it('should reject skill when qi is insufficient', () => {
    const state = new CraftingState({
      qi: 5,
      stability: 50,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    expect(canApplySkill(state, skill, 10)).toBe(false);
  });

  it('should reject skill when stability would drop below minimum', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 15,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    // 15 - 10 = 5, which is below minStability of 10
    expect(canApplySkill(state, skill, 10)).toBe(false);
  });

  it('should allow skill when stability exactly meets minimum after cost', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 20,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    // 20 - 10 = 10, which equals minStability
    expect(canApplySkill(state, skill, 10)).toBe(true);
  });

  it('should reject skill on cooldown', () => {
    const cooldowns = new Map<string, number>();
    cooldowns.set('test_skill', 2);
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      cooldowns,
    });
    const skill = createTestSkill({ key: 'test_skill' });
    
    expect(canApplySkill(state, skill, 10)).toBe(false);
  });

  it('should treat excellent/brilliant as veryPositive for condition-gated skills', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
    });

    const skill = createTestSkill({
      conditionRequirement: 'veryPositive',
    });

    expect(canApplySkill(state, skill, 10, 0, 'excellent')).toBe(true);
    expect(canApplySkill(state, skill, 10, 0, 'brilliant')).toBe(true);
  });

  it('should not allow positive-only condition skills during veryPositive conditions', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
    });

    const skill = createTestSkill({
      conditionRequirement: 'positive',
    });

    expect(canApplySkill(state, skill, 10, 0, 'harmonious')).toBe(true);
    expect(canApplySkill(state, skill, 10, 0, 'brilliant')).toBe(false);
  });

  it('should reject skill when toxicity would exceed max', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      toxicity: 90,
      maxToxicity: 100,
    });
    const skill = createTestSkill({ toxicityCost: 15 });
    
    // 90 + 15 = 105, which exceeds maxToxicity of 100
    expect(canApplySkill(state, skill, 10, 100)).toBe(false);
  });

  it('should allow skill when toxicity stays within max', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      toxicity: 80,
      maxToxicity: 100,
    });
    const skill = createTestSkill({ toxicityCost: 15 });
    
    // 80 + 15 = 95, which is within maxToxicity of 100
    expect(canApplySkill(state, skill, 10, 100)).toBe(true);
  });
});

describe('getEffectiveQiCost', () => {
  it('should return base cost when no mastery', () => {
    const skill = createTestSkill({ qiCost: 10 });
    expect(getEffectiveQiCost(skill)).toBe(10);
  });

  it('should apply mastery cost reduction', () => {
    const skill = createTestSkill({
      qiCost: 10,
      mastery: { poolCostReduction: 3 },
    });
    expect(getEffectiveQiCost(skill)).toBe(7);
  });

  it('should not go below zero', () => {
    const skill = createTestSkill({
      qiCost: 5,
      mastery: { poolCostReduction: 10 },
    });
    expect(getEffectiveQiCost(skill)).toBe(0);
  });
});

describe('getEffectiveStabilityCost', () => {
  it('should return base cost when no mastery', () => {
    const skill = createTestSkill({ stabilityCost: 10 });
    expect(getEffectiveStabilityCost(skill)).toBe(10);
  });

  it('should apply mastery cost reduction', () => {
    const skill = createTestSkill({
      stabilityCost: 10,
      mastery: { stabilityCostReduction: 2 },
    });
    expect(getEffectiveStabilityCost(skill)).toBe(8);
  });
});

describe('calculateSkillGains', () => {
  const config = createTestConfig();

  it('should calculate fusion skill gains with intensity scaling', () => {
    const state = new CraftingState({ intensityBuffTurns: 0 });
    const skill = createTestSkill({
      baseCompletionGain: 1.0, // Multiplier value from game data
      basePerfectionGain: 0,
      type: 'fusion',
      scalesWithIntensity: true,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Base intensity 12, multiplier 1.0, so 1.0 * 12 = 12
    expect(gains.completion).toBe(12);
    expect(gains.perfection).toBe(0);
  });

  it('should calculate refine skill gains with control scaling', () => {
    const state = new CraftingState({ controlBuffTurns: 0 });
    const skill = createTestSkill({
      baseCompletionGain: 0,
      basePerfectionGain: 1.0, // Multiplier value from game data
      type: 'refine',
      scalesWithControl: true,
      scalesWithIntensity: false,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Base control 16, multiplier 1.0, so 1.0 * 16 = 16
    expect(gains.completion).toBe(0);
    expect(gains.perfection).toBe(16);
  });

  it('should apply control buff to refine skills', () => {
    const state = new CraftingState({
      controlBuffTurns: 2,
      controlBuffMultiplier: 1.4,
    });
    const skill = createTestSkill({
      baseCompletionGain: 0,
      basePerfectionGain: 1.0, // Multiplier value from game data
      type: 'refine',
      scalesWithControl: true,
      scalesWithIntensity: false,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Control with buff: 16 * 1.4 = 22.4
    // Perfection: 1.0 * 22.4 = 22 (floored)
    expect(gains.perfection).toBe(22);
  });

  it('should apply intensity buff to fusion skills', () => {
    const state = new CraftingState({
      intensityBuffTurns: 2,
      intensityBuffMultiplier: 1.4,
    });
    const skill = createTestSkill({
      baseCompletionGain: 1.0, // Multiplier value from game data
      basePerfectionGain: 0,
      type: 'fusion',
      scalesWithIntensity: true,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Intensity with buff: 12 * 1.4 = 16.8
    // Completion: 1.0 * 16.8 = 16 (floored)
    expect(gains.completion).toBe(16);
  });

  it('should apply mastery bonuses to scaling', () => {
    const state = new CraftingState({ controlBuffTurns: 0 });
    const skill = createTestSkill({
      baseCompletionGain: 0,
      basePerfectionGain: 1.0, // Multiplier value from game data
      type: 'refine',
      scalesWithControl: true,
      scalesWithIntensity: false,
      mastery: { controlBonus: 0.25 }, // +25% control
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Base control 16 * 1.25 = 20
    // Perfection: 1.0 * 20 = 20
    expect(gains.perfection).toBe(20);
  });

  it('should calculate stabilize skill gains', () => {
    const state = new CraftingState();
    const skill = createTestSkill({
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 20,
      type: 'stabilize',
      scalesWithIntensity: false,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    expect(gains.completion).toBe(0);
    expect(gains.perfection).toBe(0);
    expect(gains.stability).toBe(20);
  });
});

describe('applySkill', () => {
  const config = createTestConfig();

  it('should deduct qi and stability costs', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.qi).toBe(90);
    expect(newState!.stability).toBe(40);
  });

  it('should add completion and perfection gains', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      completion: 20,
      perfection: 10,
    });
    const skill = createTestSkill({
      baseCompletionGain: 1.0, // Multiplier value from game data
      basePerfectionGain: 0,
      type: 'fusion',
      scalesWithIntensity: true,
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    // 1.0 * 12 (base intensity) = 12, so 20 + 12 = 32
    expect(newState!.completion).toBe(32);
    expect(newState!.perfection).toBe(10); // unchanged
  });

  it('should decay max stability by 1 unless prevented', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
    });
    const skill = createTestSkill({ preventsMaxStabilityDecay: false });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.maxStability).toBe(59); // 60 - 1
  });

  it('should not decay max stability when skill prevents it', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
    });
    const skill = createTestSkill({ preventsMaxStabilityDecay: true });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.maxStability).toBe(60); // unchanged
  });

  it('should apply max stability change from skill', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
    });
    const skill = createTestSkill({
      maxStabilityChange: -5,
      preventsMaxStabilityDecay: true, // Prevent normal decay to isolate effect
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.maxStability).toBe(55); // 60 - 5
  });

  it('should cap stability at max stability', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 55,
      maxStability: 60,
    });
    const skill = createTestSkill({
      stabilityGain: 20,
      stabilityCost: 0,
      preventsMaxStabilityDecay: true,
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    // 55 + 20 = 75, but capped at maxStability 60
    expect(newState!.stability).toBe(60);
  });

  it('should grant control buff', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      controlBuffTurns: 0,
    });
    const skill = createTestSkill({
      buffType: BuffType.CONTROL,
      buffDuration: 2,
      buffMultiplier: 1.4,
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.controlBuffTurns).toBe(2);
    expect(newState!.controlBuffMultiplier).toBe(1.4);
  });

  it('should grant intensity buff', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      intensityBuffTurns: 0,
    });
    const skill = createTestSkill({
      buffType: BuffType.INTENSITY,
      buffDuration: 3,
      buffMultiplier: 1.5,
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.intensityBuffTurns).toBe(3);
    expect(newState!.intensityBuffMultiplier).toBe(1.5);
  });

  it('should decrement existing buff turns', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      controlBuffTurns: 2,
      intensityBuffTurns: 1,
    });
    const skill = createTestSkill({ buffType: BuffType.NONE });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.controlBuffTurns).toBe(1); // 2 - 1
    expect(newState!.intensityBuffTurns).toBe(0); // 1 - 1
  });

  it('should add toxicity cost', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      toxicity: 20,
    });
    const skill = createTestSkill({ toxicityCost: 15 });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.toxicity).toBe(35); // 20 + 15
  });

  it('should restore qi when skill provides qiRestore', () => {
    const state = new CraftingState({
      qi: 50,
      stability: 50,
      maxStability: 60,
    });

    const skill = createTestSkill({
      qiCost: 0,
      restoresQi: true,
      qiRestore: 25,
    });

    const newState = applySkill(state, skill, config);

    expect(newState).not.toBeNull();
    expect(newState!.qi).toBe(75);
  });

  it('should restore max stability to config max when skill requests full restore', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 30,
    });

    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      restoresMaxStabilityToFull: true,
    });

    const newState = applySkill(state, skill, config);

    expect(newState).not.toBeNull();
    expect(newState!.maxStability).toBe(config.maxStability);
  });

  it('should apply toxicity cleanse', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      toxicity: 50,
    });
    const skill = createTestSkill({ toxicityCleanse: 20 });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.toxicity).toBe(30); // 50 - 20
  });

  it('should set cooldown when skill has one', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
    });
    const skill = createTestSkill({
      key: 'cooldown_skill',
      cooldown: 3,
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.getCooldown('cooldown_skill')).toBe(3);
  });

  it('should decrement existing cooldowns', () => {
    const cooldowns = new Map<string, number>();
    cooldowns.set('other_skill', 2);
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      cooldowns,
    });
    const skill = createTestSkill({ key: 'test_skill' });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.getCooldown('other_skill')).toBe(1); // 2 - 1
  });

  it('should return null when skill cannot be applied', () => {
    const state = new CraftingState({
      qi: 5, // Not enough qi
      stability: 50,
    });
    const skill = createTestSkill({ qiCost: 10 });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).toBeNull();
  });

  it('should add skill to history', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      history: ['previous_skill'],
    });
    const skill = createTestSkill({ name: 'New Skill' });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.history).toEqual(['previous_skill', 'New Skill']);
  });
});

describe('getAvailableSkills', () => {
  it('should return skills that can be applied', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
    });
    const config = createTestConfig();
    
    const available = getAvailableSkills(state, config);
    
    expect(available.length).toBeGreaterThan(0);
    // All returned skills should be applicable
    for (const skill of available) {
      expect(canApplySkill(state, skill, config.minStability)).toBe(true);
    }
  });

  it('should exclude skills that cannot be applied', () => {
    const state = new CraftingState({
      qi: 5, // Very low qi
      stability: 50,
    });
    const config = createTestConfig();
    
    const available = getAvailableSkills(state, config);
    
    // Should only include skills with 0 qi cost
    for (const skill of available) {
      expect(skill.qiCost).toBe(0);
    }
  });

  it('should exclude skills on cooldown', () => {
    const cooldowns = new Map<string, number>();
    cooldowns.set('simple_fusion', 2);
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      cooldowns,
    });
    const config = createTestConfig();
    
    const available = getAvailableSkills(state, config);
    
    // Should not include the skill on cooldown
    const hasSimpleFusion = available.some(s => s.key === 'simple_fusion');
    expect(hasSimpleFusion).toBe(false);
  });
});

describe('isTerminalState', () => {
  it('should return true when no skills can be applied', () => {
    const state = new CraftingState({
      qi: 0,
      stability: 10, // At minimum
    });
    const config = createTestConfig();
    
    expect(isTerminalState(state, config)).toBe(true);
  });

  it('should return false when skills can be applied', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
    });
    const config = createTestConfig();
    
    expect(isTerminalState(state, config)).toBe(false);
  });
});

describe('Disciplined Touch accuracy', () => {
  const config = createTestConfig();

  it('should calculate gains using skill multipliers with intensity', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      intensityBuffTurns: 0,
      controlBuffTurns: 0,
    });
    const skill = createTestSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      baseCompletionGain: 0.5, // Multiplier for completion
      basePerfectionGain: 0.5, // Multiplier for perfection
      isDisciplinedTouch: true,
      scalesWithIntensity: true,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Completion: 0.5 * 12 (base intensity) = 6
    // Perfection: 0.5 * 16 (base control) = 8
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(8);
  });

  it('should apply intensity buff to completion gains', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      intensityBuffTurns: 2,
      intensityBuffMultiplier: 1.4,
      controlBuffTurns: 0,
    });
    const skill = createTestSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      baseCompletionGain: 0.5,
      basePerfectionGain: 0.5,
      isDisciplinedTouch: true,
      scalesWithIntensity: true,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Intensity with buff: 12 * 1.4 = 16.8 -> 16 (floored)
    // Completion: 0.5 * 16 = 8
    // Perfection: 0.5 * 16 (base control, no buff) = 8
    expect(gains.completion).toBe(8);
    expect(gains.perfection).toBe(8);
  });

  it('should apply control buff to perfection gains', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      intensityBuffTurns: 0,
      controlBuffTurns: 2,
      controlBuffMultiplier: 1.4,
    });
    const skill = createTestSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      baseCompletionGain: 0.5,
      basePerfectionGain: 0.5,
      isDisciplinedTouch: true,
      scalesWithIntensity: true,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Completion: 0.5 * 12 (base intensity, no buff) = 6
    // Control with buff: 16 * 1.4 = 22.4 -> 22 (floored)
    // Perfection: 0.5 * 22 = 11
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(11);
  });

  it('should apply both buffs when active', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      intensityBuffTurns: 2,
      intensityBuffMultiplier: 1.4,
      controlBuffTurns: 2,
      controlBuffMultiplier: 1.4,
    });
    const skill = createTestSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      baseCompletionGain: 0.5,
      basePerfectionGain: 0.5,
      isDisciplinedTouch: true,
      scalesWithIntensity: true,
    });
    
    const gains = calculateSkillGains(state, skill, config);
    
    // Intensity with buff: 12 * 1.4 = 16.8 -> 16 (floored)
    // Completion: 0.5 * 16 = 8
    // Control with buff: 16 * 1.4 = 22.4 -> 22 (floored)
    // Perfection: 0.5 * 22 = 11
    expect(gains.completion).toBe(8);
    expect(gains.perfection).toBe(11);
  });

  it('should consume all buffs when applied', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      maxStability: 60,
      controlBuffTurns: 2,
      intensityBuffTurns: 3,
    });
    const skill = createTestSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      baseCompletionGain: 0.5,
      basePerfectionGain: 0.5,
      isDisciplinedTouch: true,
      scalesWithIntensity: true,
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    // Both buffs should be consumed (set to 0)
    expect(newState!.controlBuffTurns).toBe(0);
    expect(newState!.intensityBuffTurns).toBe(0);
  });

  it('should apply condition multiplier to control for perfection', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      intensityBuffTurns: 0,
      controlBuffTurns: 0,
    });
    const skill = createTestSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      baseCompletionGain: 0.5,
      basePerfectionGain: 0.5,
      isDisciplinedTouch: true,
      scalesWithIntensity: true,
    });
    
    // Good condition (1.5x multiplier)
    const gains = calculateSkillGains(state, skill, config, 1.5);
    
    // Completion: 0.5 * 12 = 6 (intensity not affected by condition)
    // Control with condition: 16 * 1.5 = 24
    // Perfection: 0.5 * 24 = 12
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(12);
  });
});

describe('canApplySkill edge cases', () => {
  it('should allow skill with 0 stability cost when stability is below minStability', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 5, // Below minStability of 10
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 0 });
    
    // Stability is 5 (below minStability=10), but skill costs 0 stability
    // Should be allowed because 5 - 0 = 5 is not checked when stabilityCost is 0
    expect(canApplySkill(state, skill, 10)).toBe(true);
  });

  it('should allow stabilize skill when stability is critically low', () => {
    const state = new CraftingState({
      qi: 10,
      stability: 3, // Critically low
    });
    // Stabilize skill: 0 stability cost, restores stability
    const skill = createTestSkill({ 
      qiCost: 10, 
      stabilityCost: 0,
      stabilityGain: 20,
      type: 'stabilize',
    });
    
    expect(canApplySkill(state, skill, 10)).toBe(true);
  });

  it('should block all skills when qi is 0 and all skills cost qi', () => {
    const state = new CraftingState({
      qi: 0,
      stability: 50,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 0 });
    
    expect(canApplySkill(state, skill, 10)).toBe(false);
  });
});
