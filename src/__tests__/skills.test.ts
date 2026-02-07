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
  calculateEffectiveActionCosts,
  setNativeCanUseActionProvider,
} from '../optimizer/skills';

// Helper to create a basic test config
function createTestConfig(overrides: Partial<OptimizerConfig> = {}): OptimizerConfig {
  return {
    maxQi: 194,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
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
    
    expect(canApplySkill(state, skill, 0)).toBe(true);
  });

  it('should reject skill when qi is insufficient', () => {
    const state = new CraftingState({
      qi: 5,
      stability: 50,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    expect(canApplySkill(state, skill, 0)).toBe(false);
  });

  it('should allow skill when stability is above 0 even if effective cost crosses minStability', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 15,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    // Matches game canUseAction: only checks current stability > 0.
    expect(canApplySkill(state, skill, 10)).toBe(true);
  });

  it('should allow skill when stability exactly meets the provided minimum after cost', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 20,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    
    // 20 - 10 = 10, which equals minStability
    expect(canApplySkill(state, skill, 10)).toBe(true);
  });

  it('should allow using skills until stability reaches 0 (not below 0)', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 10,
    });
    const skill = createTestSkill({ qiCost: 0, stabilityCost: 10 });

    // 10 - 10 = 0 is allowed.
    expect(canApplySkill(state, skill, 0)).toBe(true);

    // Game allows attempting actions while current stability is above 0;
    // apply step clamps resulting stability at 0.
    const tooExpensive = createTestSkill({ qiCost: 0, stabilityCost: 11 });
    expect(canApplySkill(state, tooExpensive, 0)).toBe(true);
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
    
    expect(canApplySkill(state, skill, 0)).toBe(false);
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

  it('should treat balanced as neutral for condition-gated skills', () => {
    const state = new CraftingState({ qi: 100, stability: 50 });
    const skill = createTestSkill({
      conditionRequirement: 'neutral',
    });

    expect(canApplySkill(state, skill, 0, 0, 'balanced')).toBe(true);
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

  it('should reject skill when condition-modified qi cost exceeds available qi', () => {
    const state = new CraftingState({
      qi: 12,
      stability: 50,
      poolCostPercentage: 120,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 0 });
    const conditionEffects = [{ kind: 'pool' as const, multiplier: 1.3 }];

    // Effective Qi cost: floor(floor(10 * 1.3) * 1.2) = floor(13 * 1.2) = 15
    expect(canApplySkill(state, skill, 0, 0, undefined, conditionEffects)).toBe(false);
  });

  it('should allow skill even when condition-modified stability cost exceeds available stability', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 10,
      stabilityCostPercentage: 120,
    });
    const skill = createTestSkill({ qiCost: 0, stabilityCost: 1 });
    const conditionEffects = [{ kind: 'stability' as const, multiplier: 1.6 }];

    // Game canUseAction does not reject based on projected post-action stability.
    expect(canApplySkill(state, skill, 9, 0, undefined, conditionEffects)).toBe(true);
  });
});

describe('native canUseAction precheck integration', () => {
  afterEach(() => {
    setNativeCanUseActionProvider(undefined);
  });

  it('should apply native precheck for simulated (non-root) states', () => {
    const provider = jest.fn(() => false);
    setNativeCanUseActionProvider(provider);

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      history: ['previous action'],
    });
    const skill = createTestSkill({
      nativeTechnique: { name: 'Test Skill' },
    });

    expect(canApplySkill(state, skill, 0, 0, 'neutral')).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('should seed native precheck variables from state.nativeVariables', () => {
    const provider = jest.fn((context: any) => context.variables.customFlag === 7);
    setNativeCanUseActionProvider(provider);

    const state = new CraftingState({
      qi: 90,
      stability: 40,
      nativeVariables: {
        customFlag: 7,
        maxpool: 500,
      },
    });
    const skill = createTestSkill({
      nativeTechnique: { name: 'Test Skill' },
    });

    expect(canApplySkill(state, skill, 0, 0, 'neutral')).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0].variables.maxpool).toBe(500);
    expect(provider.mock.calls[0][0].variables.pool).toBe(90);
  });

  it('should pass current condition through applySkill to native precheck', () => {
    const provider = jest.fn((context: any) => context.currentCondition === 'positive');
    setNativeCanUseActionProvider(provider);

    const state = new CraftingState({
      qi: 100,
      stability: 50,
    });
    const skill = createTestSkill({
      nativeTechnique: { name: 'Test Skill' },
    });
    const config = createTestConfig({ minStability: 0, skills: [skill] });

    const nextState = applySkill(state, skill, config, [], 0, 'positive');
    expect(nextState).not.toBeNull();
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0].currentCondition).toBe('positive');
  });

  it('should propagate nativeVariables through applySkill state transitions', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      nativeVariables: {
        customFlag: 11,
        pool: 100,
        step: 0,
      },
    });
    const skill = createTestSkill({
      qiCost: 10,
      stabilityCost: 0,
    });
    const config = createTestConfig({ minStability: 0, skills: [skill] });

    const nextState = applySkill(state, skill, config, [], 0, 'neutral');
    expect(nextState).not.toBeNull();
    expect(nextState?.nativeVariables?.customFlag).toBe(11);
    expect(nextState?.nativeVariables?.pool).toBe(90);
    expect(nextState?.nativeVariables?.step).toBe(1);
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

describe('calculateEffectiveActionCosts', () => {
  it('should match game rounding for stability costs (negative-delta path)', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 10,
      stabilityCostPercentage: 120,
    });
    const skill = createTestSkill({ qiCost: 0, stabilityCost: 1 });
    const conditionEffects = [{ kind: 'stability' as const, multiplier: 1.6 }];

    const costs = calculateEffectiveActionCosts(state, skill, 0, conditionEffects);
    expect(costs.stabilityCost).toBe(2);
  });

  it('should apply pool cost modifiers in game order', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      poolCostPercentage: 80,
    });
    const skill = createTestSkill({ qiCost: 17, stabilityCost: 0 });
    const conditionEffects = [{ kind: 'pool' as const, multiplier: 1.3 }];

    // floor(floor(17 * 1.3) * 0.8) = floor(22 * 0.8) = 17
    const costs = calculateEffectiveActionCosts(state, skill, 0, conditionEffects);
    expect(costs.qiCost).toBe(17);
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

  it('should prefer full effect definitions when provided', () => {
    const state = new CraftingState();
    const skill = createTestSkill({
      // Deliberately wrong legacy scalar fields.
      baseCompletionGain: 999,
      basePerfectionGain: 999,
      scalesWithControl: true,
      scalesWithIntensity: true,
      effects: [
        { kind: 'completion', amount: { value: 1, stat: 'intensity' } },
        { kind: 'perfection', amount: { value: 1, stat: 'control' } },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    expect(gains.completion).toBe(12);
    expect(gains.perfection).toBe(16);
  });

  it('should clamp predicted completion/perfection gains to remaining cap room', () => {
    const configWithCaps = createTestConfig({
      maxCompletion: 40,
      maxPerfection: 55,
    });
    const state = new CraftingState({
      completion: 35,
      perfection: 52,
    });
    const skill = createTestSkill({
      type: 'support',
      baseCompletionGain: 20,
      basePerfectionGain: 20,
      scalesWithControl: false,
      scalesWithIntensity: false,
    });

    const gains = calculateSkillGains(state, skill, configWithCaps);
    expect(gains.completion).toBe(5);
    expect(gains.perfection).toBe(3);
  });

  it('should apply additive mastery upgrades to matching scaling upgradeKey', () => {
    const state = new CraftingState();
    const skill = createTestSkill({
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      effects: [
        { kind: 'completion', amount: { value: 1, stat: 'intensity', upgradeKey: 'fusion_gain' } },
      ] as any,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'fusion_gain', change: 0.5 },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // (1 + 0.5) * 12 intensity = 18
    expect(gains.completion).toBe(18);
  });

  it('should apply multiplicative mastery upgrades to matching scaling upgradeKey', () => {
    const state = new CraftingState();
    const skill = createTestSkill({
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      effects: [
        { kind: 'completion', amount: { value: 1, stat: 'intensity', upgradeKey: 'fusion_gain' } },
      ] as any,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'fusion_gain', change: 0.5, shouldMultiply: true },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // Absolute multiplier semantics: 1 * 0.5 * 12 = 6
    expect(gains.completion).toBe(6);
  });

  it('should respect mastery upgrade conditions', () => {
    const state = new CraftingState({
      completion: 0,
    });
    const conditionedConfig = createTestConfig({
      targetCompletion: 100,
    });
    const skill = createTestSkill({
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      effects: [
        { kind: 'completion', amount: { value: 1, stat: 'intensity', upgradeKey: 'fusion_gain' } },
      ] as any,
      masteryEntries: [
        {
          kind: 'upgrade',
          upgradeKey: 'fusion_gain',
          change: 1,
          condition: { kind: 'completion', mode: 'more', percentage: 80 },
        },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, conditionedConfig);
    // condition not met, no upgrade applied
    expect(gains.completion).toBe(12);
  });

  it('should apply upgrades on nested max scaling values', () => {
    const state = new CraftingState();
    const skill = createTestSkill({
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'completion',
          amount: {
            value: 3,
            stat: 'intensity',
            max: { value: 2, stat: 'intensity', upgradeKey: 'cap_gain' },
          },
        },
      ] as any,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'cap_gain', change: 1 },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // Raw = 3*12 = 36; upgraded cap = (2+1)*12 = 36
    expect(gains.completion).toBe(36);
  });

  it('should only apply upgrades to direct numeric properties of the matched object', () => {
    const state = new CraftingState();
    const skill = createTestSkill({
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'completion',
          amount: {
            value: 4,
            stat: 'intensity',
            upgradeKey: 'parent_only',
            max: { value: 2, stat: 'intensity' },
          },
        },
      ] as any,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'parent_only', change: 1 },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // Parent value upgraded to 5, but max remains 2*12 => capped at 24.
    expect(gains.completion).toBe(24);
  });

  it('should recurse to nested objects and upgrade their direct numeric fields when keys match', () => {
    const state = new CraftingState({
      completion: 2,
    });
    const skill = createTestSkill({
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'completion',
          amount: {
            value: 1,
            stat: 'intensity',
            customScaling: {
              scaling: 'completion',
              multiplier: 0.5,
              upgradeKey: 'custom_scale',
            },
          },
        },
      ] as any,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'custom_scale', change: 0.5 },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // customScaling.multiplier upgraded from 0.5 to 1.0:
    // 1 * 12 * (1 + 1.0 * 2) = 36
    expect(gains.completion).toBe(36);
  });

  it('should apply upgrades to buff stat scaling during gain calculation', () => {
    const buff = {
      name: 'mastery_boost',
      canStack: false,
      effects: [],
      stats: {
        control: { value: 10, upgradeKey: 'buff_control' },
      },
    };
    const state = new CraftingState({
      buffs: new Map([['mastery_boost', { name: 'mastery_boost', stacks: 1, definition: buff as any }]]),
    });
    const skill = createTestSkill({
      baseCompletionGain: 0,
      basePerfectionGain: 1,
      type: 'refine',
      scalesWithControl: true,
      scalesWithIntensity: false,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'buff_control', change: 5 },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // base control 16 + upgraded buff control (10 + 5) = 31
    expect(gains.perfection).toBe(31);
  });
});

describe('applySkill', () => {
  const config = createTestConfig();

  it('should deduct qi and stability costs', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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

  it('should clamp resulting completion/perfection to configured caps', () => {
    const configWithCaps = createTestConfig({
      maxCompletion: 40,
      maxPerfection: 60,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 39,
      perfection: 59,
    });
    const skill = createTestSkill({
      type: 'support',
      baseCompletionGain: 10,
      basePerfectionGain: 10,
      scalesWithControl: false,
      scalesWithIntensity: false,
      qiCost: 0,
      stabilityCost: 0,
    });

    const newState = applySkill(state, skill, configWithCaps);
    expect(newState).not.toBeNull();
    expect(newState!.completion).toBe(40);
    expect(newState!.perfection).toBe(60);
  });

  it('should decay max stability by 1 unless prevented', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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
      initialMaxStability: 60,
    });
    const skill = createTestSkill({
      maxStabilityChange: -5,
      preventsMaxStabilityDecay: true, // Prevent normal decay to isolate effect
    });
    
    const newState = applySkill(state, skill, config);
    
    expect(newState).not.toBeNull();
    expect(newState!.maxStability).toBe(55); // 60 - 5
  });

  it('should clamp max-stability penalty after maxStabilityChange adjustments', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 20,
      initialMaxStability: 60,
      stabilityPenalty: 58,
    });
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      maxStabilityChange: -10,
      preventsMaxStabilityDecay: true,
    });

    const newState = applySkill(state, skill, config);
    expect(newState).not.toBeNull();
    expect(newState!.stabilityPenalty).toBe(60);
    expect(newState!.maxStability).toBe(0);
  });

  it('should cap stability at max stability', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 55,
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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

  it('should restore max stability to initial max when skill requests full restore', () => {
    // State with penalty (initialMaxStability: 60, penalty: 30 → initialMaxStability: 30)
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60, // initialMaxStability
      stabilityPenalty: 30, // current penalty
    });

    expect(state.maxStability).toBe(30); // 60 - 30 = 30

    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      restoresMaxStabilityToFull: true,
    });

    const newState = applySkill(state, skill, config);

    expect(newState).not.toBeNull();
    // Penalty is reset to 0, so max stability = initialMaxStability
    expect(newState!.stabilityPenalty).toBe(0);
    expect(newState!.maxStability).toBe(60); // restored to initial
  });

  it('should apply toxicity cleanse', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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
      initialMaxStability: 60,
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

  it('should return null when modified costs become unaffordable', () => {
    const state = new CraftingState({
      qi: 12,
      stability: 10,
      initialMaxStability: 60,
      poolCostPercentage: 120,
      stabilityCostPercentage: 120,
    });
    const skill = createTestSkill({
      qiCost: 10,
      stabilityCost: 1,
    });
    const conditionEffects = [
      { kind: 'pool' as const, multiplier: 1.3 },
      { kind: 'stability' as const, multiplier: 1.6 },
    ];

    const newState = applySkill(state, skill, config, conditionEffects);
    expect(newState).toBeNull();
  });

  it('should add skill to history', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
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
      stability: 0,
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
      initialMaxStability: 60,
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
    
    // Good condition (+50% control)
    const gains = calculateSkillGains(state, skill, config, [{ kind: 'control', multiplier: 0.5 }]);
    
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

describe('buff per-turn effects', () => {
  const config = createTestConfig();

  it('should execute per-turn buff effects after technique', () => {
    const empowerBuff = {
      name: 'empower',
      canStack: true,
      maxStacks: 10,
      effects: [
        { kind: 'completion' as const, amount: { value: 5 } },
      ],
      onFusion: [
        { kind: 'completion' as const, amount: { value: 3 } },
      ],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([['empower', { name: 'empower', stacks: 2, definition: empowerBuff }]]),
    });
    const skill = createTestSkill({
      type: 'fusion',
      baseCompletionGain: 1.0,
      basePerfectionGain: 0,
      qiCost: 5,
      stabilityCost: 3,
    });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    // Skill gain: 1.0 * 12(intensity) = 12
    // Buff per-turn: 5 (effects) + 3 (onFusion) = 8
    // Total completion: 12 + 8 = 20
    expect(result!.completion).toBe(20);
  });

  it('should scale buff effects with stacks', () => {
    const pressureBuff = {
      name: 'pressure',
      canStack: true,
      maxStacks: 5,
      effects: [
        { kind: 'completion' as const, amount: { value: 2, stat: 'stacks' } },
      ],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([['pressure', { name: 'pressure', stacks: 3, definition: pressureBuff }]]),
    });
    const skill = createTestSkill({
      type: 'fusion',
      baseCompletionGain: 1.0,
      basePerfectionGain: 0,
      qiCost: 5,
      stabilityCost: 3,
    });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    // Skill gain: floor(1.0 * 12) = 12
    // Buff: value=2 * stacks=3 = 6
    // Total: 18
    expect(result!.completion).toBe(18);
  });

  it('should not apply action-type effects for wrong action type', () => {
    const buff = {
      name: 'test',
      canStack: true,
      effects: [],
      onFusion: [{ kind: 'completion' as const, amount: { value: 10 } }],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([['test', { name: 'test', stacks: 1, definition: buff }]]),
    });
    const skill = createTestSkill({
      type: 'refine',
      baseCompletionGain: 1.0,
      basePerfectionGain: 0,
      qiCost: 5,
      stabilityCost: 3,
      scalesWithControl: true,
    });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    // Skill: floor(1.0 * 16(control)) = 16, no onFusion effect (skill is refine)
    expect(result!.completion).toBe(16);
  });

  it('should apply stability and pool buff effects', () => {
    const buff = {
      name: 'regen',
      canStack: true,
      effects: [
        { kind: 'stability' as const, amount: { value: 5 } },
        { kind: 'pool' as const, amount: { value: -10 } },
      ],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 30,
      initialMaxStability: 60,
      buffs: new Map([['regen', { name: 'regen', stacks: 1, definition: buff }]]),
    });
    const skill = createTestSkill({
      qiCost: 5,
      stabilityCost: 3,
    });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    // Stability: 30 - 3(cost) + 5(buff) = 32
    expect(result!.stability).toBe(32);
    // Qi: 100 - 5(cost) - 10(buff drain) = 85
    expect(result!.qi).toBe(85);
  });

  it('should create buffs from buff createBuff effects', () => {
    const createdBuff = {
      name: 'Empower',
      canStack: true,
      maxStacks: 10,
      effects: [],
    };
    const generator = {
      name: 'generator',
      canStack: true,
      effects: [
        {
          kind: 'createBuff' as const,
          buff: createdBuff,
          stacks: { value: 2 },
        },
      ],
    };

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([['generator', { name: 'generator', stacks: 1, definition: generator }]]),
    });
    const skill = createTestSkill({ qiCost: 0, stabilityCost: 0 });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    expect(result!.getBuffStacks('empower')).toBe(2);
  });

  it('should apply addStack and negate buff effects', () => {
    const pressure = {
      name: 'pressure',
      canStack: true,
      maxStacks: 5,
      effects: [{ kind: 'addStack' as const, stacks: { value: 1 } }],
    };
    const temporary = {
      name: 'temporary',
      canStack: true,
      effects: [{ kind: 'negate' as const }],
    };

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([
        ['pressure', { name: 'pressure', stacks: 2, definition: pressure }],
        ['temporary', { name: 'temporary', stacks: 1, definition: temporary }],
      ]),
    });
    const skill = createTestSkill({ qiCost: 0, stabilityCost: 0 });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    expect(result!.getBuffStacks('pressure')).toBe(3);
    expect(result!.hasBuff('temporary')).toBe(false);
  });

  it('should apply mastery upgrades to buff per-turn scaling', () => {
    const upgradedBuff = {
      name: 'upgraded_tick',
      canStack: true,
      maxStacks: 10,
      effects: [
        { kind: 'completion' as const, amount: { value: 1, stat: 'stacks', upgradeKey: 'buff_tick' } },
      ],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([['upgraded_tick', { name: 'upgraded_tick', stacks: 2, definition: upgradedBuff }]]),
    });
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithIntensity: false,
      scalesWithControl: false,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'buff_tick', change: 2, shouldMultiply: true },
      ] as any,
    });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    // upgraded value = 1 * 2 = 2; stacks = 2 => +4 completion
    expect(result!.completion).toBe(4);
  });
});
