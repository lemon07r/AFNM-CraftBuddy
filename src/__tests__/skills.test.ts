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
  calculateActionSurvivabilityFloor,
  calculateSkillGains,
  calculateDisplayedSkillGains,
  getAvailableSkills,
  isTerminalState,
  getEffectiveQiCost,
  getEffectiveStabilityCost,
  calculateEffectiveActionCosts,
  setNativeCanUseActionProvider,
  techniqueDisplayName,
} from '../optimizer/skills';
import { evaluateScaling, type ScalingVariables } from '../optimizer/gameTypes';

// Helper to create a basic test config
function createTestConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
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
function createTestSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
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
    expect(canApplySkill(state, skill, 0, 0, undefined, conditionEffects)).toBe(
      false,
    );
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
    expect(canApplySkill(state, skill, 9, 0, undefined, conditionEffects)).toBe(
      true,
    );
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
    const provider = jest.fn(
      (context: any) => context.variables.customFlag === 7,
    );
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

  it('should derive completion/perfection percentages from the game bonus ladders', () => {
    const provider = jest.fn((context: any) => {
      expect(context.variables.completionpercentage).toBe(176);
      expect(context.variables.perfectionpercentage).toBe(138);
      return true;
    });
    setNativeCanUseActionProvider(provider);

    const state = new CraftingState({
      qi: 90,
      stability: 40,
      completion: 200,
      perfection: 150,
      nativeVariables: {
        maxcompletion: 100,
        maxperfection: 100,
      },
    });
    const skill = createTestSkill({
      nativeTechnique: { name: 'Test Skill' },
    });

    expect(canApplySkill(state, skill, 0, 0, 'neutral')).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('should pass current condition through applySkill to native precheck', () => {
    const provider = jest.fn(
      (context: any) => context.currentCondition === 'positive',
    );
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

  it('should preserve only supplemental nativeVariables through applySkill state transitions', () => {
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
    expect(nextState?.nativeVariables?.pool).toBeUndefined();
    expect(nextState?.nativeVariables?.step).toBeUndefined();
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

    // Runtime getStabilityCost: `n = -e; if (pct) n = ceil(n * pct / 100); return -n`,
    // and condition multipliers scale the percentage before that single ceil:
    // pct = 120 * 1.6 = 192 -> -ceil(-1 * 1.92) = 1.
    const costs = calculateEffectiveActionCosts(
      state,
      skill,
      0,
      conditionEffects,
    );
    expect(costs.stabilityCost).toBe(1);
  });

  it('should apply pool cost modifiers in game order', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      poolCostPercentage: 80,
    });
    const skill = createTestSkill({ qiCost: 17, stabilityCost: 0 });
    const conditionEffects = [{ kind: 'pool' as const, multiplier: 1.3 }];

    // Runtime getPoolCost applies a single floor over the combined percentage:
    // floor(17 * (80 * 1.3) / 100) = floor(17 * 1.04) = 17
    const costs = calculateEffectiveActionCosts(
      state,
      skill,
      0,
      conditionEffects,
    );
    expect(costs.qiCost).toBe(17);
  });

  it('should treat runtime 0 percentage modifiers as neutral cost baseline', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      poolCostPercentage: 0,
      stabilityCostPercentage: 0,
    });
    const skill = createTestSkill({ qiCost: 17, stabilityCost: 9 });

    const costs = calculateEffectiveActionCosts(state, skill, 0, []);
    expect(costs.qiCost).toBe(17);
    expect(costs.stabilityCost).toBe(9);
  });

  it('should add poolCostFlat before percentage modifiers', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      poolCostFlat: 3,
      poolCostPercentage: 80,
    });
    const skill = createTestSkill({ qiCost: 17, stabilityCost: 0 });
    const conditionEffects = [{ kind: 'pool' as const, multiplier: 1.3 }];

    const costs = calculateEffectiveActionCosts(
      state,
      skill,
      0,
      conditionEffects,
    );
    // floor((17 + 3) * (80 * 1.3) / 100) = floor(20 * 1.04) = 20
    expect(costs.qiCost).toBe(20);
  });

  it('should apply poolCostFlat before the percentage, not after', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      poolCostFlat: 3,
      poolCostPercentage: 50,
    });
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 0 });

    const costs = calculateEffectiveActionCosts(state, skill, 0, []);
    // Runtime getPoolCost: `r = max(0, 10 + 3); r = floor(13 * 50 / 100) = 6`.
    // Applying the flat afterwards would give floor(10 * 0.5) + 3 = 8.
    expect(costs.qiCost).toBe(6);
  });

  it('should include buff-derived pool cost modifiers when config is provided', () => {
    const skill = createTestSkill({
      key: 'forceful_stabilize',
      qiCost: 62,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      type: 'stabilize',
      scalesWithIntensity: false,
      scalesWithControl: false,
    });
    const state = new CraftingState({
      qi: 420,
      stability: 39,
      initialMaxStability: 59,
      poolCostPercentage: 100,
      buffs: new Map([
        [
          'energising_(12%)',
          {
            name: 'energising_(12%)',
            stacks: 1,
            definition: {
              name: 'Energising (12%)',
              canStack: true,
              effects: [],
              stats: {
                poolCostPercentage: { value: 88 },
              },
            },
          },
        ],
      ]),
    });
    const config = createTestConfig({
      skills: [skill],
    });

    const neutral = calculateEffectiveActionCosts(state, skill, 0, [], config);
    expect(neutral.qiCost).toBe(54); // floor(62 * 0.88)

    const energized = calculateEffectiveActionCosts(
      state,
      skill,
      0,
      [{ kind: 'pool', multiplier: 0.5 }],
      config,
    );
    expect(energized.qiCost).toBe(27); // floor(floor(62 * 0.5) * 0.88)
  });

  it('should include buff-derived poolCostFlat modifiers when config is provided', () => {
    const skill = createTestSkill({
      qiCost: 20,
      stabilityCost: 0,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      buffs: new Map([
        [
          'soft_cap',
          {
            name: 'Soft Cap',
            stacks: 2,
            definition: {
              name: 'Soft Cap',
              canStack: true,
              effects: [],
              stats: {
                poolCostFlat: { value: 2 },
              },
            },
          },
        ],
      ]),
    });

    const costs = calculateEffectiveActionCosts(
      state,
      skill,
      0,
      [],
      createTestConfig({ skills: [skill] }),
    );

    expect(costs.qiCost).toBe(22);
  });

  it('should hydrate missing active buff definitions from config skill data', () => {
    const forceful = createTestSkill({
      key: 'forceful_stabilize',
      name: 'Forceful Stabilize',
      qiCost: 62,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 40,
      type: 'stabilize',
      scalesWithIntensity: false,
      scalesWithControl: false,
    });
    const sourceSkill = createTestSkill({
      key: 'source_skill',
      name: 'Source Skill',
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithIntensity: false,
      scalesWithControl: false,
      effects: [
        {
          kind: 'createBuff',
          buff: {
            name: 'Energising (12%)',
            canStack: true,
            effects: [],
            stats: {
              poolCostPercentage: { value: 88 },
            },
          },
          stacks: { value: 1 },
        },
      ] as any,
    });
    const config = createTestConfig({
      skills: [forceful, sourceSkill],
    });
    const state = new CraftingState({
      qi: 420,
      stability: 39,
      initialMaxStability: 59,
      poolCostPercentage: 100,
      buffs: new Map([
        [
          'energising_(12%)',
          {
            name: 'energising_(12%)',
            stacks: 1,
          },
        ],
      ]),
    });

    const costs = calculateEffectiveActionCosts(state, forceful, 0, [], config);
    expect(costs.qiCost).toBe(54);
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

  it('should hydrate missing active buff definitions for perfection scaling gains', () => {
    const perfectionSkill = createTestSkill({
      key: 'perfection_skill',
      name: 'Perfection Skill',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithControl: true,
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'perfection',
          amount: { value: 1, stat: 'control' },
        },
      ] as any,
    });
    const sourceSkill = createTestSkill({
      key: 'source_skill',
      name: 'Source Skill',
      type: 'support',
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithControl: false,
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'createBuff',
          buff: {
            name: 'Control Aura',
            canStack: true,
            stats: {
              control: { value: 0.5, stat: 'control' },
            },
            effects: [],
          },
          stacks: { value: 1 },
        },
      ] as any,
    });
    const configWithSource = createTestConfig({
      skills: [perfectionSkill, sourceSkill],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      perfection: 0,
      buffs: new Map([
        [
          'control_aura',
          {
            name: 'control_aura',
            stacks: 1,
          },
        ],
      ]),
    });

    const gains = calculateSkillGains(
      state,
      perfectionSkill,
      configWithSource,
      [],
      {
        includeExpectedValue: false,
      },
    );

    // Base control is 16 from createTestConfig. Buff adds 50% of control (+8),
    // so the skill's perfection amount (1.0 * control) should be 24.
    expect(gains.perfection).toBe(24);
    expect(gains.completion).toBe(0);
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

  it('should clamp displayed stability gains to the post-action max stability headroom', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 31,
      initialMaxStability: 58,
      stabilityPenalty: 3,
    });
    const skill = createTestSkill({
      name: 'Forceful Stabilize',
      key: 'forceful_stabilize',
      qiCost: 88,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 40,
      type: 'stabilize',
      scalesWithIntensity: false,
      preventsMaxStabilityDecay: true,
    });

    const raw = calculateSkillGains(state, skill, config);
    const displayed = calculateDisplayedSkillGains(state, skill, config);

    expect(raw.stability).toBe(40);
    expect(displayed.stability).toBe(24);
  });

  it('should respect restored max stability when clamping displayed stability gains', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 40,
      initialMaxStability: 60,
      stabilityPenalty: 10,
    });
    const skill = createTestSkill({
      name: 'Restoring Stabilize',
      key: 'restoring_stabilize',
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 20,
      type: 'stabilize',
      scalesWithIntensity: false,
      preventsMaxStabilityDecay: true,
      restoresMaxStabilityToFull: true,
    });

    const displayed = calculateDisplayedSkillGains(state, skill, config);

    expect(displayed.stability).toBe(20);
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
        {
          kind: 'completion',
          amount: { value: 1, stat: 'intensity', upgradeKey: 'fusion_gain' },
        },
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
        {
          kind: 'completion',
          amount: { value: 1, stat: 'intensity', upgradeKey: 'fusion_gain' },
        },
      ] as any,
      masteryEntries: [
        {
          kind: 'upgrade',
          upgradeKey: 'fusion_gain',
          change: 0.5,
          shouldMultiply: true,
        },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // Runtime applyUpgradeMasteries: `r.shouldMultiply ? e[i] = a + a * r.change : ...`,
    // i.e. a relative increase, so 1 * (1 + 0.5) * 12 intensity = 18.
    expect(gains.completion).toBe(18);
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
        {
          kind: 'completion',
          amount: { value: 1, stat: 'intensity', upgradeKey: 'fusion_gain' },
        },
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

  it('should leave nested fields outside the runtime whitelist untouched', () => {
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
    // Runtime applyUpgradeMasteries only rewrites fields named `amount`,
    // `value` or `cooldown`, so `customScaling.multiplier` is never touched:
    // 1 * 12 * (1 + 0.5 * 2) = 24.
    expect(gains.completion).toBe(24);
  });

  it('should recurse to nested objects and upgrade their whitelisted numeric fields', () => {
    const state = new CraftingState();
    const skill = createTestSkill({
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'completion',
          amount: {
            value: 5,
            stat: 'intensity',
            max: { value: 2, stat: 'intensity', upgradeKey: 'nested_cap' },
          },
        },
      ] as any,
      masteryEntries: [
        { kind: 'upgrade', upgradeKey: 'nested_cap', change: 1 },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // Nested `value` is whitelisted: cap becomes (2 + 1) * 12 = 36,
    // which caps the raw 5 * 12 = 60.
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
      buffs: new Map([
        [
          'mastery_boost',
          { name: 'mastery_boost', stacks: 1, definition: buff as any },
        ],
      ]),
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

  it('should apply hydrated active buff per-turn effects from config definitions', () => {
    const turnSkill = createTestSkill({
      key: 'turn_skill',
      name: 'Turn Skill',
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithControl: false,
      scalesWithIntensity: false,
    });
    const sourceSkill = createTestSkill({
      key: 'source_skill',
      name: 'Source Skill',
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithControl: false,
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'createBuff',
          buff: {
            name: 'Transient Buff',
            canStack: true,
            stats: {},
            effects: [
              {
                kind: 'addStack',
                stacks: { value: -1 },
              },
            ],
          },
          stacks: { value: 1 },
        },
      ] as any,
    });
    const configWithSource = createTestConfig({
      skills: [turnSkill, sourceSkill],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([
        [
          'transient_buff',
          {
            name: 'transient_buff',
            stacks: 2,
          },
        ],
      ]),
    });

    const newState = applySkill(state, turnSkill, configWithSource);
    expect(newState).not.toBeNull();
    expect(newState!.getBuffStacks('transient_buff')).toBe(1);
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

  it('should not double-count legacy qiRestore when pool effect data exists', () => {
    const state = new CraftingState({
      qi: 50,
      stability: 50,
      initialMaxStability: 60,
    });

    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      successChance: 0.5,
      restoresQi: true,
      qiRestore: 50,
      effects: [
        {
          kind: 'pool',
          amount: { value: 50, stat: undefined },
        } as any,
      ],
    });

    const newState = applySkill(state, skill, createTestConfig({ maxQi: 200 }));

    expect(newState).not.toBeNull();
    // Expected-value pool effect only: +25 (not +50 legacy + +25 effect).
    expect(newState!.qi).toBe(75);
  });

  it('should clamp qi to maxQi after pool effects are applied', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
    });

    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [
        {
          kind: 'pool',
          amount: { value: 50, stat: undefined },
        } as any,
      ],
    });

    const newState = applySkill(state, skill, createTestConfig({ maxQi: 100 }));

    expect(newState).not.toBeNull();
    expect(newState!.qi).toBe(100);
  });

  it('should scale max-pool-based qi restores using active maxpool buffs', () => {
    const harmoniousExpansion = {
      name: 'Harmonious Expansion',
      canStack: true,
      effects: [],
      onFusion: [],
      onRefine: [],
      stacks: 1,
      displayLocation: 'none',
      stats: {
        maxpool: { value: 0.05, stat: 'maxpool', scaling: 'stacks' },
        poolCostPercentage: {
          value: 1,
          stat: undefined,
          eqn: '100 - (stacks * 5)',
        },
      },
    } as any;
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([
        [
          'harmonious_expansion',
          {
            name: 'harmonious_expansion',
            stacks: 2,
            definition: harmoniousExpansion,
          },
        ],
      ]),
    });
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      type: 'support',
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'pool',
          amount: { value: 0.13, stat: 'maxpool' },
        } as any,
      ],
    });

    const newState = applySkill(state, skill, createTestConfig({ maxQi: 200 }));

    expect(newState).not.toBeNull();
    expect(newState!.qi).toBe(128);
  });

  it('should clamp qi against buffed maxpool when maxpool buffs are active', () => {
    const harmoniousExpansion = {
      name: 'Harmonious Expansion',
      canStack: true,
      effects: [],
      onFusion: [],
      onRefine: [],
      stacks: 1,
      displayLocation: 'none',
      stats: {
        maxpool: { value: 0.05, stat: 'maxpool', scaling: 'stacks' },
      },
    } as any;
    const state = new CraftingState({
      qi: 190,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([
        [
          'harmonious_expansion',
          {
            name: 'harmonious_expansion',
            stacks: 2,
            definition: harmoniousExpansion,
          },
        ],
      ]),
    });
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      type: 'support',
      scalesWithIntensity: false,
      effects: [
        {
          kind: 'pool',
          amount: { value: 50, stat: undefined },
        } as any,
      ],
    });

    const newState = applySkill(state, skill, createTestConfig({ maxQi: 200 }));

    expect(newState).not.toBeNull();
    expect(newState!.qi).toBe(220);
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

  it('should apply multi-turn toxicity cleansing from active buff effects and expire the buff', () => {
    const detoxBuff = {
      name: 'Detoxifying',
      canStack: true,
      // Runtime changeToxicity: `t.stats.toxicity -= amount`, so a positive
      // amount cleanses (the tooltip reads "cleanse toxicity by X").
      effects: [
        { kind: 'changeToxicity' as const, amount: { value: 5 } },
        { kind: 'addStack' as const, stacks: { value: -1 } },
      ],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      toxicity: 50,
      buffs: new Map([
        [
          'detoxifying',
          {
            name: 'Detoxifying',
            stacks: 2,
            definition: detoxBuff,
          },
        ],
      ]),
    });
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      scalesWithIntensity: false,
      type: 'support',
    });

    const firstTurn = applySkill(state, skill, config);
    expect(firstTurn).not.toBeNull();
    expect(firstTurn!.toxicity).toBe(45);
    expect(firstTurn!.getBuffStacks('detoxifying')).toBe(1);

    const secondTurn = applySkill(firstTurn!, skill, config);
    expect(secondTurn).not.toBeNull();
    expect(secondTurn!.toxicity).toBe(40);
    expect(secondTurn!.getBuffStacks('detoxifying')).toBe(0);
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
    const hasSimpleFusion = available.some((s) => s.key === 'simple_fusion');
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

// Runtime 0.7.5 'Disciplined Touch':
//   effects: [
//     { kind: 'perfection', amount: { value: .5, stat: 'intensity', upgradeKey: 'perfection' } },
//     { kind: 'completion',  amount: { value: .5, stat: 'intensity', upgradeKey: 'perfection' } },
//   ]
// Both halves scale off intensity, so control never feeds the perfection half.
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
    // Perfection: 0.5 * 12 (base intensity too) = 6
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(6);
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
    // Perfection: 0.5 * 16 (same buffed intensity) = 8
    expect(gains.completion).toBe(8);
    expect(gains.perfection).toBe(8);
  });

  it('should not apply control buff to perfection gains', () => {
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
    // The control buff is irrelevant here: perfection also reads intensity,
    // so 0.5 * 12 = 6.
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(6);
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
    // Perfection: 0.5 * 16 = 8 (the control buff does not contribute)
    expect(gains.completion).toBe(8);
    expect(gains.perfection).toBe(8);
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

  it('should ignore control condition multipliers for perfection', () => {
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
    const gains = calculateSkillGains(state, skill, config, [
      { kind: 'control', multiplier: 0.5 },
    ]);

    // Completion: 0.5 * 12 = 6 (intensity not affected by a control condition)
    // Perfection: 0.5 * 12 = 6 for the same reason
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(6);
  });

  it('should apply harmony modifiers to gains', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      intensityBuffTurns: 0,
      controlBuffTurns: 0,
      harmonyData: {
        forgeWorks: { heat: 5 },
        recommendedTechniqueTypes: [],
      },
    });
    const harmonyConfig = createTestConfig({ craftingType: 'forge' as any });
    const skill = createTestSkill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      baseCompletionGain: 0.5,
      basePerfectionGain: 0.5,
      isDisciplinedTouch: true,
      scalesWithIntensity: true,
    });

    const gains = calculateSkillGains(state, skill, harmonyConfig);

    // Forge heat 5 gives 1.5x control and 1.5x intensity
    // Completion: 0.5 * floor(12 * 1.5) = 0.5 * 18 = 9
    // Perfection: 0.5 * floor(12 * 1.5) = 0.5 * 18 = 9
    expect(gains.completion).toBe(9);
    expect(gains.perfection).toBe(9);
  });

  it('should not apply mastery control bonus to perfection gains', () => {
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
      mastery: { controlBonus: 0.25 },
    });

    const gains = calculateSkillGains(state, skill, config);

    // Control with mastery: 16 * 1.25 = 20, but neither half reads control.
    // Completion: 0.5 * 12 = 6, Perfection: 0.5 * 12 = 6
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(6);
  });

  it('should scale perfection off intensity when control and intensity differ', () => {
    const lopsidedConfig = createTestConfig({
      baseControl: 40,
      baseIntensity: 12,
    });
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

    const gains = calculateSkillGains(state, skill, lopsidedConfig);

    // Both effects use `stat: 'intensity'`, so control 40 is ignored.
    expect(gains.completion).toBe(6);
    expect(gains.perfection).toBe(6);
    expect(gains.perfection).toBe(gains.completion);
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
      effects: [{ kind: 'completion' as const, amount: { value: 5 } }],
      onFusion: [{ kind: 'completion' as const, amount: { value: 3 } }],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([
        ['empower', { name: 'empower', stacks: 2, definition: empowerBuff }],
      ]),
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
      buffs: new Map([
        ['pressure', { name: 'pressure', stacks: 3, definition: pressureBuff }],
      ]),
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
      buffs: new Map([
        ['regen', { name: 'regen', stacks: 1, definition: buff }],
      ]),
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
      buffs: new Map([
        ['generator', { name: 'generator', stacks: 1, definition: generator }],
      ]),
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
        {
          kind: 'completion' as const,
          amount: { value: 1, stat: 'stacks', upgradeKey: 'buff_tick' },
        },
      ],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      buffs: new Map([
        [
          'upgraded_tick',
          { name: 'upgraded_tick', stacks: 2, definition: upgradedBuff },
        ],
      ]),
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
        {
          kind: 'upgrade',
          upgradeKey: 'buff_tick',
          change: 2,
          shouldMultiply: true,
        },
      ] as any,
    });

    const result = applySkill(state, skill, config);
    expect(result).not.toBeNull();
    // Relative multiply: upgraded value = 1 + 1 * 2 = 3; stacks = 2 => +6
    expect(result!.completion).toBe(6);
  });
});

describe('Restoring Brilliance stability gain bug', () => {
  it('should calculate correct stability gain from effects (32, not 9)', () => {
    const state = new CraftingState({
      qi: 394,
      stability: 24,
      initialMaxStability: 60,
      stabilityPenalty: 4,
      completion: 32812,
      perfection: 3884,
      critChance: 23,
      critMultiplier: 185,
      successChanceBonus: 0,
      poolCostPercentage: 100,
      stabilityCostPercentage: 100,
      step: 6,
    });

    const restoringBrilliance = createTestSkill({
      name: 'Restoring Brilliance',
      key: 'restoring_brilliance',
      type: 'stabilize',
      qiCost: 0,
      stabilityCost: 0,
      successChance: 1,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 1,
      maxStabilityChange: 1,
      scalesWithControl: false,
      scalesWithIntensity: false,
      preventsMaxStabilityDecay: true,
      restoresMaxStabilityToFull: true,
      effects: [
        {
          kind: 'stability' as any,
          amount: { value: 32.5, upgradeKey: 'stability' },
        },
        { kind: 'maxStability' as any, amount: { value: 1 } },
        {
          kind: 'stability' as any,
          condition: { kind: 'chance' as any, percentage: 18 },
          amount: { value: 1 },
        },
      ],
    });

    const testConfig = createTestConfig({
      maxQi: 458,
      maxStability: 60,
      maxCompletion: 38980,
      maxPerfection: 38980,
      baseIntensity: 2108,
      baseControl: 1686,
      targetCompletion: 38980,
      targetPerfection: 38980,
    });

    // Without expected value (immediate gains) - should be 32 (floor of 32.5)
    const immediate = calculateSkillGains(
      state,
      restoringBrilliance,
      testConfig,
      [],
      {
        includeExpectedValue: false,
      },
    );
    expect(immediate.stability).toBe(32);

    // With expected value - 32.5 * 1 + 1 * 0.18 = 32.68, floor = 32
    const expected = calculateSkillGains(
      state,
      restoringBrilliance,
      testConfig,
      [],
    );
    expect(expected.stability).toBe(32);
  });

  it('should keep chance-based stabilization out of the guaranteed survival floor', () => {
    const corruptedStabilizationBuff = {
      name: 'Corrupted Stabilization',
      canStack: true,
      effects: [
        { kind: 'addStack' as const, stacks: { value: -1 } },
        {
          kind: 'stability' as const,
          condition: { kind: 'chance' as const, percentage: 75 },
          amount: { value: 7 },
        },
      ],
      onFusion: [],
      onRefine: [],
      onStabilize: [],
    };

    const riskyRefine = createTestSkill({
      name: 'Risky Refine',
      key: 'risky_refine',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithIntensity: false,
      scalesWithControl: false,
      effects: [{ kind: 'perfection' as const, amount: { value: 100 } }],
    });

    const state = new CraftingState({
      qi: 100,
      stability: 1,
      initialMaxStability: 60,
      buffs: new Map([
        [
          'corrupted_stabilization',
          {
            name: 'Corrupted Stabilization',
            stacks: 8,
            definition: corruptedStabilizationBuff,
          },
        ],
      ]),
    });
    const config = createTestConfig({
      skills: [riskyRefine],
    });

    const nextState = applySkill(state, riskyRefine, config, [], 0, 'neutral');
    const survivabilityFloor = calculateActionSurvivabilityFloor(
      state,
      riskyRefine,
      config,
      [],
      'neutral',
    );

    expect(nextState).not.toBeNull();
    expect(nextState!.stability).toBe(5.25);
    expect(survivabilityFloor).toEqual({
      stability: 0,
      maxStability: 59,
      survivalProbability: 0.75,
    });
  });
});

describe('expression-gated buff intensity (False Fusion / Strive for Completion)', () => {
  it('contributes 0 intensity while completion <= maxcompletion and full value once over cap', () => {
    const scaling = {
      value: 1,
      stat: 'intensity',
      eqn: 'completion > maxcompletion',
    };

    const baseVars: ScalingVariables = {
      control: 10,
      intensity: 40,
      critchance: 0,
      critmultiplier: 150,
      pool: 100,
      maxpool: 100,
      toxicity: 0,
      maxtoxicity: 100,
      resistance: 0,
      itemEffectiveness: 100,
      pillsPerRound: 1,
      poolCostFlat: 0,
      poolCostPercentage: 100,
      stabilityCostPercentage: 100,
      successChanceBonus: 0,
      stacks: 0,
      maxcompletion: 100,
      maxperfection: 100,
      completion: 100,
      perfection: 50,
    };

    const atCap = evaluateScaling(scaling, baseVars, 0);
    const overCap = evaluateScaling(
      scaling,
      { ...baseVars, completion: 101 },
      0,
    );
    const underCap = evaluateScaling(
      scaling,
      { ...baseVars, completion: 99 },
      0,
    );

    expect(underCap).toBe(0);
    expect(atCap).toBe(0);
    expect(overCap).toBe(40);
  });

  it('binds maxcompletion in technique scaling variables used by buff stats', () => {
    const striveBuff = {
      name: 'Strive for Completion',
      canStack: true,
      maxStacks: 1,
      stats: {
        intensity: {
          value: 1,
          stat: 'intensity',
          eqn: 'completion > maxcompletion',
        },
      },
      effects: [],
    };
    const intensityRefine = createTestSkill({
      name: 'Intensity Refine',
      key: 'intensity_refine_gate',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      scalesWithIntensity: true,
      scalesWithControl: false,
      effects: [
        {
          kind: 'perfection',
          amount: { value: 1, stat: 'intensity' },
        },
      ],
    });

    const underCapState = new CraftingState({
      qi: 100,
      stability: 40,
      completion: 100,
      perfection: 0,
      buffs: new Map([
        [
          'strive_for_completion',
          {
            name: 'Strive for Completion',
            stacks: 1,
            definition: striveBuff,
          },
        ],
      ]),
    });
    const overCapState = new CraftingState({
      qi: 100,
      stability: 40,
      completion: 101,
      perfection: 0,
      buffs: new Map([
        [
          'strive_for_completion',
          {
            name: 'Strive for Completion',
            stacks: 1,
            definition: striveBuff,
          },
        ],
      ]),
    });
    const config = createTestConfig({
      baseIntensity: 40,
      baseControl: 10,
      targetCompletion: 100,
      targetPerfection: 100,
      skills: [intensityRefine],
    });

    const underGains = calculateSkillGains(
      underCapState,
      intensityRefine,
      config,
      [],
    );
    const overGains = calculateSkillGains(
      overCapState,
      intensityRefine,
      config,
      [],
    );

    // Without the gate, intensity is 40 → perfection 40.
    // With the gate open, intensity doubles to 80 → perfection 80.
    expect(underGains.perfection).toBeCloseTo(40, 5);
    expect(overGains.perfection).toBeCloseTo(80, 5);
  });
});

describe('success chance and progress headroom interaction', () => {
  // Regression guard for the `user-report-resonance-regression` finding.
  //
  // The 0.7.5 runtime applies a technique's progress only on success (the
  // completion applier `fms` does a plain `r.completion += e`), so the expected
  // gain of an unreliable technique is `p * min(gain, headroom)`.
  //
  // The old model computed `min(p * gain, headroom)`, which let the headroom
  // clamp swallow the failure risk entirely whenever the raw gain overshot the
  // remaining bar. A 50%-success burst then looked like a guaranteed bar-filler
  // and outranked reliable alternatives.
  const overshootingSkill = (successChance: number): SkillDefinition =>
    createTestSkill({
      key: 'explosive_burst',
      qiCost: 0,
      stabilityCost: 10,
      successChance,
      baseCompletionGain: 5,
      scalesWithIntensity: true,
      type: 'fusion',
    });

  function gainsAt(successChance: number): number {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 900,
    });
    const config = createTestConfig({
      baseIntensity: 400,
      // Headroom is 100 while the raw gain is 5 * 400 = 2000.
      maxCompletion: 1000,
    });
    return calculateSkillGains(state, overshootingSkill(successChance), config, [])
      .completion;
  }

  it('weights an overshooting gain by success chance instead of hiding it behind the cap', () => {
    // Raw 2000 clamped to the 100 headroom, then weighted: 0.5 * 100 = 50.
    expect(gainsAt(0.5)).toBe(50);
    expect(gainsAt(0.65)).toBe(65);
  });

  it('still reports the full headroom for a guaranteed technique', () => {
    expect(gainsAt(1)).toBe(100);
  });

  it('scales monotonically with success chance once the gain overshoots', () => {
    const samples = [0.1, 0.25, 0.5, 0.75, 1].map(gainsAt);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });

  it('never exceeds the remaining headroom', () => {
    for (const chance of [0.1, 0.5, 0.65, 1]) {
      expect(gainsAt(chance)).toBeLessThanOrEqual(100);
    }
  });
});

describe('techniqueDisplayName', () => {
  // 0.7.6 renamed False Fusion to "Strive for Completion" through `displayName`
  // alone; `name` still reads `False Fusion` and every key derives from it.
  it('prefers the display name the game supplies', () => {
    expect(
      techniqueDisplayName({
        name: 'False Fusion',
        displayName: 'Strive for Completion',
      }),
    ).toBe('Strive for Completion');
  });

  it('falls back to the internal name when none is supplied', () => {
    expect(techniqueDisplayName({ name: 'Simple Fusion' })).toBe(
      'Simple Fusion',
    );
  });

  it('treats a blank display name as absent', () => {
    expect(
      techniqueDisplayName({ name: 'Simple Fusion', displayName: '   ' }),
    ).toBe('Simple Fusion');
  });
});
