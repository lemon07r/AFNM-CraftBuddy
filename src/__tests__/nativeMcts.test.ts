import { BuffType, CraftingState } from '../optimizer/state';
import { OptimizerConfig, SkillDefinition } from '../optimizer/skills';
import { __testing as nativeMctsTesting } from '../optimizer/nativeMcts';

function createSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    name: 'Simple Fusion',
    key: 'simple_fusion',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 1,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    type: 'fusion',
    scalesWithIntensity: true,
    ...overrides,
  };
}

function createConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 120,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    defaultBuffMultiplier: 1.4,
    skills: [createSkill()],
    ...overrides,
  };
}

describe('native MCTS bridge', () => {
  it('serializes condition effects into compact Rust input', () => {
    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig({
        conditionEffectsData: {
          neutral: [],
          positive: [
            { kind: 'control', multiplier: 0.5 },
            { kind: 'pool', multiplier: 0.75 },
            { kind: 'chance', bonus: 0.1 },
          ],
          negative: [],
          veryPositive: [],
          veryNegative: [],
        },
      }),
      targetCompletion: 100,
      targetPerfection: 80,
      currentConditionType: 'positive',
      forecastedConditionTypes: ['neutral'],
    });

    expect(input.condition_effects.positive).toMatchObject({
      control_multiplier: 1.5,
      pool_cost_multiplier: 0.75,
      success_chance_bonus: 0.1,
    });
  });

  it('serializes harmony subsystem state with snake_case fields for Rust', () => {
    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({
        qi: 100,
        stability: 60,
        harmony: 20,
        harmonyData: {
          alchemicalArts: {
            charges: ['fusion', 'refine'],
            lastCombo: ['fusion', 'refine', 'support'],
          },
          recommendedTechniqueTypes: ['support'],
          additionalData: {
            alchemicalReactionModifiers: {
              poolCostPercentage: 75,
              successChanceBonus: 0.25,
            },
          },
        },
      }),
      config: createConfig({
        isSublimeCraft: true,
        craftingType: 'alchemical',
      }),
      targetCompletion: 100,
      targetPerfection: 80,
    });

    expect(input.state.harmony_data.alchemical_arts).toEqual({
      charges: ['fusion', 'refine'],
      last_combo: ['fusion', 'refine', 'support'],
    });
    expect(input.state.harmony_data.alchemical_reaction_modifiers).toEqual({
      pool_cost_percentage: 75,
      success_chance_bonus: 0.25,
    });
  });

  it('honors low explicit MCTS budgets for short searches', () => {
    const input = nativeMctsTesting.buildNativeMctsInput({
      state: new CraftingState({ qi: 100, stability: 60 }),
      config: createConfig(),
      targetCompletion: 100,
      targetPerfection: 80,
      search: {
        iterations: 48,
        maxNodes: 240,
        timeBudgetMs: 150,
      },
    });

    expect(input.search.iterations).toBe(48);
    expect(input.search.max_nodes).toBe(240);
    expect(nativeMctsTesting.deriveMctsIterations({ timeBudgetMs: 150 })).toBe(
      64,
    );
  });
});
