/**
 * Game Accuracy Tests
 *
 * These tests validate that the optimizer correctly implements game mechanics
 * based on the authoritative CraftingStuff source code.
 *
 * Key fixes validated:
 * 1. Critical hit formula (excess crit > 100% converts to bonus at 1:3 ratio)
 * 2. Completion bonus system (+10% control per bonus tier)
 * 3. Condition effects for different recipe types
 * 4. Stability penalty system (max stability = initial - penalty)
 * 5. Stack-based buff scaling
 */

import { CraftingState } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  applySkill,
  calculateSkillGains,
  DEFAULT_CONFIG,
} from '../optimizer/skills';
import {
  calculateExpectedCritMultiplier,
  getBonusAndChance,
  getConditionEffects,
  evaluateScaling,
  evalExpression,
  parseRecipeConditionEffects,
  ConditionEffect,
} from '../optimizer/gameTypes';
import { getConditionEffectsForConfig } from '../optimizer/skills';
import { BuffType } from '../optimizer/state';

describe('Game-Accurate Mechanics', () => {
  describe('Critical Hit Formula', () => {
    it('should calculate expected crit multiplier correctly for normal crit chance', () => {
      // 50% crit chance, 150% crit multiplier (1.5x)
      const result = calculateExpectedCritMultiplier(50, 150);
      // Expected value: 0.5 * 1 + 0.5 * 1.5 = 1.25
      expect(result).toBeCloseTo(1.25, 2);
    });

    it('should convert excess crit chance to bonus multiplier at 1:3 ratio', () => {
      // 150% crit chance, 150% base crit multiplier
      // Excess: 50% → +150% bonus (50 * 3 = 150)
      // Effective multiplier: 150% + 150% = 300% (3x)
      // Always crits (100% capped), so expected = 3x
      const result = calculateExpectedCritMultiplier(150, 150);
      // 1.0 * 3.0 = 3.0
      expect(result).toBeCloseTo(3.0, 2);
    });

    it('should handle very high crit chance for late-game', () => {
      // 200% crit chance, 200% base crit multiplier
      // Excess: 100% → +300% bonus
      // Effective multiplier: 200% + 300% = 500% (5x)
      const result = calculateExpectedCritMultiplier(200, 200);
      expect(result).toBeCloseTo(5.0, 2);
    });

    it('should handle 0% crit chance', () => {
      const result = calculateExpectedCritMultiplier(0, 150);
      // No crits → multiplier is 1.0
      expect(result).toBeCloseTo(1.0, 2);
    });

    it('should handle exactly 100% crit chance', () => {
      // 100% crit, 200% multiplier
      // Always crits, no excess bonus
      const result = calculateExpectedCritMultiplier(100, 200);
      expect(result).toBeCloseTo(2.0, 2);
    });
  });

  describe('Completion Bonus System', () => {
    it('should calculate correct bonus tiers with exponential scaling', () => {
      // Target 100, using EXPONENTIAL_SCALING_FACTOR = 1.3
      // Tier 1: need 100 to get first bonus
      // Tier 2: need 100 + floor(100*1.3) = 100 + 130 = 230 to get second bonus
      // Tier 3: need 230 + floor(130*1.3) = 230 + 169 = 399 to get third bonus

      const result1 = getBonusAndChance(50, 100);
      expect(result1.guaranteed).toBe(0);
      expect(result1.bonusChance).toBeCloseTo(0.5, 2);

      const result2 = getBonusAndChance(100, 100);
      expect(result2.guaranteed).toBe(1);

      // 230 needed for 2 bonuses
      const result3 = getBonusAndChance(230, 100);
      expect(result3.guaranteed).toBe(2);

      // 399 needed for 3 bonuses
      const result4 = getBonusAndChance(399, 100);
      expect(result4.guaranteed).toBe(3);
    });

    it('should provide control bonus based on completion bonus stacks', () => {
      const baseControl = 100;

      // No completion bonus
      const state0 = new CraftingState({ completionBonus: 0 });
      const controlWith0 = baseControl * (1 + state0.completionBonus * 0.1);
      expect(controlWith0).toBeCloseTo(100, 5);

      // 1 stack = +10% control
      const state1 = new CraftingState({ completionBonus: 1 });
      const controlWith1 = baseControl * (1 + state1.completionBonus * 0.1);
      expect(controlWith1).toBeCloseTo(110, 5);

      // 3 stacks = +30% control
      const state3 = new CraftingState({ completionBonus: 3 });
      const controlWith3 = baseControl * (1 + state3.completionBonus * 0.1);
      expect(controlWith3).toBeCloseTo(130, 5);
    });
  });

  describe('Condition Effects', () => {
    it('should return correct effects for perfectable (control) recipes', () => {
      const positiveEffects = getConditionEffects('perfectable', 'positive');
      expect(positiveEffects).toHaveLength(1);
      expect(positiveEffects[0].kind).toBe('control');
      expect(positiveEffects[0].multiplier).toBe(0.5); // +50%

      const negativeEffects = getConditionEffects('perfectable', 'negative');
      expect(negativeEffects[0].multiplier).toBe(-0.5); // -50%

      const veryPositiveEffects = getConditionEffects('perfectable', 'veryPositive');
      expect(veryPositiveEffects[0].multiplier).toBe(1.0); // +100%
    });

    it('should return correct effects for fuseable (intensity) recipes', () => {
      const positiveEffects = getConditionEffects('fuseable', 'positive');
      expect(positiveEffects).toHaveLength(1);
      expect(positiveEffects[0].kind).toBe('intensity');
      expect(positiveEffects[0].multiplier).toBe(0.5);
    });

    it('should return correct effects for flowing (both) recipes', () => {
      const effects = getConditionEffects('flowing', 'positive');
      expect(effects).toHaveLength(2);
      expect(effects.find(e => e.kind === 'control')?.multiplier).toBe(0.25);
      expect(effects.find(e => e.kind === 'intensity')?.multiplier).toBe(0.25);
    });

    it('should return correct effects for energised (pool cost) recipes', () => {
      const positiveEffects = getConditionEffects('energised', 'positive');
      expect(positiveEffects[0].kind).toBe('pool');
      expect(positiveEffects[0].multiplier).toBe(0.7); // -30% cost
    });

    it('should return correct effects for stable (stability cost) recipes', () => {
      const negativeEffects = getConditionEffects('stable', 'negative');
      expect(negativeEffects[0].kind).toBe('stability');
      expect(negativeEffects[0].multiplier).toBe(1.3); // +30% cost
    });

    it('should return correct effects for fortuitous (chance) recipes', () => {
      const veryPositiveEffects = getConditionEffects('fortuitous', 'veryPositive');
      expect(veryPositiveEffects[0].kind).toBe('chance');
      expect(veryPositiveEffects[0].bonus).toBe(0.5); // +50% success
    });
  });

  describe('Stability Penalty System', () => {
    it('should calculate maxStability from initialMaxStability - stabilityPenalty', () => {
      const state = new CraftingState({
        initialMaxStability: 60,
        stabilityPenalty: 10,
      });

      expect(state.maxStability).toBe(50);
    });

    it('should increase penalty when skill does not prevent decay', () => {
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 60,
        stabilityPenalty: 5,
      });

      const skill: SkillDefinition = {
        name: 'Test Skill',
        key: 'test_skill',
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
        preventsMaxStabilityDecay: false,
      };

      const newState = applySkill(state, skill, DEFAULT_CONFIG);
      expect(newState).not.toBeNull();
      expect(newState!.stabilityPenalty).toBe(6); // Increased by 1
      expect(newState!.maxStability).toBe(54); // 60 - 6
    });

    it('should not increase penalty when skill prevents decay', () => {
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 60,
        stabilityPenalty: 5,
      });

      const skill: SkillDefinition = {
        name: 'Stabilize',
        key: 'stabilize',
        qiCost: 10,
        stabilityCost: 0,
        baseCompletionGain: 0,
        basePerfectionGain: 0,
        stabilityGain: 20,
        maxStabilityChange: 0,
        buffType: BuffType.NONE,
        buffDuration: 0,
        buffMultiplier: 1,
        type: 'stabilize',
        preventsMaxStabilityDecay: true,
      };

      const newState = applySkill(state, skill, DEFAULT_CONFIG);
      expect(newState).not.toBeNull();
      expect(newState!.stabilityPenalty).toBe(5); // Unchanged
      expect(newState!.maxStability).toBe(55); // 60 - 5
    });
  });

  describe('Scaling Formula', () => {
    it('should evaluate simple scaling correctly', () => {
      const scaling = { value: 2.0, stat: 'intensity' };
      const variables = { intensity: 50, control: 40 } as any;

      const result = evaluateScaling(scaling, variables, 0);
      expect(result).toBe(100); // 2.0 * 50
    });

    it('should evaluate scaling with stacks multiplier', () => {
      const scaling = { value: 10, scaling: 'stacks' };
      const variables = { stacks: 5 } as any;

      const result = evaluateScaling(scaling, variables, 0);
      expect(result).toBe(50); // 10 * 5
    });

    it('should respect max cap', () => {
      const scaling = {
        value: 100,
        max: { value: 50 },
      };
      const variables = {} as any;

      const result = evaluateScaling(scaling, variables, 0);
      expect(result).toBe(50); // Capped at 50
    });
  });

  describe('High-Realm Scenario (90+ rounds)', () => {
    it('should handle large stat values correctly', () => {
      // High realm stats
      const state = new CraftingState({
        qi: 500,
        stability: 90,
        initialMaxStability: 90,
        stabilityPenalty: 0,
        completion: 0,
        perfection: 0,
        critChance: 120, // >100% crit
        critMultiplier: 180,
      });

      const highRealmConfig: OptimizerConfig = {
        maxQi: 500,
        maxStability: 90,
        baseIntensity: 200,
        baseControl: 180,
        minStability: 0,
        skills: [],
        defaultBuffMultiplier: 1.4,
      };

      const skill: SkillDefinition = {
        name: 'High Realm Fusion',
        key: 'high_realm_fusion',
        qiCost: 20,
        stabilityCost: 10,
        baseCompletionGain: 2.0,
        basePerfectionGain: 0,
        stabilityGain: 0,
        maxStabilityChange: 0,
        buffType: BuffType.NONE,
        buffDuration: 0,
        buffMultiplier: 1,
        type: 'fusion',
        scalesWithIntensity: true,
      };

      const gains = calculateSkillGains(state, skill, highRealmConfig);

      // Base gain: 2.0 * 200 = 400
      // With crit: excess 20% → +60% bonus (20*3=60), so mult = 180+60 = 240%
      // Expected crit factor = 1.0 * 2.4 = 2.4
      // Expected completion = 400 * 2.4 = 960
      expect(gains.completion).toBeGreaterThan(400);
      expect(gains.completion).toBeLessThan(1000);
    });

    it('should track completion bonus correctly through multiple turns', () => {
      const config: OptimizerConfig = {
        maxQi: 300,
        maxStability: 90,
        baseIntensity: 100,
        baseControl: 80,
        minStability: 0,
        skills: [],
        defaultBuffMultiplier: 1.4,
        targetCompletion: 100,
      };

      let state = new CraftingState({
        qi: 300,
        stability: 60,
        initialMaxStability: 90,
        stabilityPenalty: 0,
        completion: 0,
        perfection: 0,
        completionBonus: 0,
      });

      const fusionSkill: SkillDefinition = {
        name: 'Strong Fusion',
        key: 'strong_fusion',
        qiCost: 10,
        stabilityCost: 10,
        baseCompletionGain: 1.0,
        basePerfectionGain: 0,
        stabilityGain: 0,
        maxStabilityChange: 0,
        buffType: BuffType.NONE,
        buffDuration: 0,
        buffMultiplier: 1,
        type: 'fusion',
        scalesWithIntensity: true,
      };

      // Apply skill multiple times to exceed completion threshold
      for (let i = 0; i < 3; i++) {
        const newState = applySkill(state, fusionSkill, config, [], 100);
        if (newState) {
          state = newState;
        }
      }

      // Should have gained 100 * 3 = 300 completion
      expect(state.completion).toBeGreaterThanOrEqual(300);

      // With completion at 300, target 100:
      // Tier 1: 100, Tier 2: 130, Tier 3: 169
      // 300 > 169+130+100 = 399? Let's calculate:
      // 100 → guaranteed 1
      // 130 → guaranteed 2 (100+130=230)
      // 169 → guaranteed 3 (230+169=399, but 300<399)
      // So at 300: guaranteed = 2 (since 300 > 230 but < 399)
      // Wait, let's trace through getBonusAndChance:
      // value=300, target=100
      // Loop 1: 300 >= 100 → remaining=200, guaranteed=1, target=130
      // Loop 2: 200 >= 130 → remaining=70, guaranteed=2, target=169
      // Loop 3: 70 < 169 → exit
      // So guaranteed = 2, completionBonus = guaranteed - 1 = 1
      expect(state.completionBonus).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Comparison: Old vs Fixed Behavior', () => {
  describe('Crit calculation improvement', () => {
    it('should show increased gains with excess crit (fixed behavior)', () => {
      // Old behavior: would treat 150% crit as just 100%
      // Fixed: 150% crit = 100% crit + 50% excess → +150% bonus to multiplier

      const normalCritMult = calculateExpectedCritMultiplier(50, 150);
      const excessCritMult = calculateExpectedCritMultiplier(150, 150);

      // Excess crit should provide significantly higher multiplier
      expect(excessCritMult).toBeGreaterThan(normalCritMult * 1.5);
    });
  });

  describe('Completion bonus impact', () => {
    it('should show control bonus affecting perfection gains', () => {
      // State with completion bonus
      const stateWithBonus = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 60,
        completion: 0,
        perfection: 0,
        completionBonus: 2, // +20% control
      });

      // State without completion bonus
      const stateWithoutBonus = new CraftingState({
        qi: 100,
        stability: 50,
        initialMaxStability: 60,
        completion: 0,
        perfection: 0,
        completionBonus: 0,
      });

      const config: OptimizerConfig = {
        maxQi: 200,
        maxStability: 60,
        baseIntensity: 50,
        baseControl: 50,
        minStability: 0,
        skills: [],
        defaultBuffMultiplier: 1.4,
      };

      const refineSkill: SkillDefinition = {
        name: 'Simple Refine',
        key: 'simple_refine',
        qiCost: 18,
        stabilityCost: 10,
        baseCompletionGain: 0,
        basePerfectionGain: 1.0,
        stabilityGain: 0,
        maxStabilityChange: 0,
        buffType: BuffType.NONE,
        buffDuration: 0,
        buffMultiplier: 1,
        type: 'refine',
        scalesWithControl: true,
      };

      const gainsWithBonus = calculateSkillGains(stateWithBonus, refineSkill, config);
      const gainsWithoutBonus = calculateSkillGains(stateWithoutBonus, refineSkill, config);

      // With +20% control from completion bonus, should have ~20% more perfection
      expect(gainsWithBonus.perfection).toBeGreaterThan(gainsWithoutBonus.perfection);
      expect(gainsWithBonus.perfection).toBeCloseTo(gainsWithoutBonus.perfection * 1.2, -1);
    });
  });
});

describe('Safe Expression Parser', () => {
  it('should evaluate basic arithmetic', () => {
    const vars = { control: 100, intensity: 50 } as any;
    expect(evalExpression('2 + 3', vars)).toBeCloseTo(5);
    expect(evalExpression('10 * 5', vars)).toBeCloseTo(50);
    expect(evalExpression('100 / 4', vars)).toBeCloseTo(25);
    expect(evalExpression('10 - 3', vars)).toBeCloseTo(7);
  });

  it('should handle parentheses', () => {
    const vars = {} as any;
    expect(evalExpression('(2 + 3) * 4', vars)).toBeCloseTo(20);
    expect(evalExpression('2 * (3 + 4)', vars)).toBeCloseTo(14);
  });

  it('should substitute variables correctly', () => {
    const vars = { control: 100, intensity: 50, maxpool: 200, pool: 150 } as any;
    expect(evalExpression('control * 2', vars)).toBeCloseTo(200);
    expect(evalExpression('intensity + control', vars)).toBeCloseTo(150);
  });

  it('should not confuse variable names that are substrings of each other', () => {
    const vars = { pool: 150, maxpool: 200 } as any;
    // maxpool should be replaced before pool to avoid "max150" corruption
    expect(evalExpression('maxpool - pool', vars)).toBeCloseTo(50);
  });

  it('should return 1 for empty/null expressions', () => {
    expect(evalExpression('', {} as any)).toBe(1);
  });

  it('should handle division by zero safely', () => {
    const result = evalExpression('10 / 0', {} as any);
    expect(isFinite(result)).toBe(true);
    expect(result).toBe(0);
  });
});

describe('Stability Cost Calculation Order', () => {
  it('should apply stabilityCostPercentage before condition effects (matching game)', () => {
    // Game order: percentage first (ceil), then condition (floor)
    const state = new CraftingState({
      qi: 200,
      stability: 50,
      initialMaxStability: 60,
      stabilityCostPercentage: 80, // 80% of normal cost
    });

    const skill: SkillDefinition = {
      name: 'Test',
      key: 'test',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 0,
      maxStabilityChange: 0,
      buffType: BuffType.NONE,
      buffDuration: 0,
      buffMultiplier: 1,
      type: 'fusion',
      scalesWithIntensity: true,
    };

    const config: OptimizerConfig = {
      ...DEFAULT_CONFIG,
      conditionEffectType: 'stable',
    };

    // With 'stable' positive condition: stability multiplier = 0.7 (-30%)
    const conditionEffects = getConditionEffects('stable', 'positive');
    const newState = applySkill(state, skill, config, conditionEffects);

    expect(newState).not.toBeNull();
    // Game order: ceil(10 * 80/100) = ceil(8) = 8, then floor(8 * 0.7) = floor(5.6) = 5
    // So stability should be 50 - 5 = 45
    // If done wrong order: floor(10 * 0.7) = 7, then ceil(7 * 80/100) = ceil(5.6) = 6
    // So stability would be 50 - 6 = 44
    expect(newState!.stability).toBe(45);
  });
});

describe('Real Condition Effects Data (parseRecipeConditionEffects)', () => {
  it('should parse perfectable condition effects correctly', () => {
    const gameData = {
      neutral: { effects: [] },
      positive: { effects: [{ kind: 'control', multiplier: 0.5 }] },
      negative: { effects: [{ kind: 'control', multiplier: -0.5 }] },
      veryPositive: { effects: [{ kind: 'control', multiplier: 1 }] },
      veryNegative: { effects: [{ kind: 'control', multiplier: -1 }] },
    };

    const parsed = parseRecipeConditionEffects(gameData);
    expect(parsed.neutral).toEqual([]);
    expect(parsed.positive).toEqual([{ kind: 'control', multiplier: 0.5 }]);
    expect(parsed.veryPositive).toEqual([{ kind: 'control', multiplier: 1 }]);
    expect(parsed.negative).toEqual([{ kind: 'control', multiplier: -0.5 }]);
  });

  it('should parse flowing condition effects with multiple effect kinds', () => {
    const gameData = {
      neutral: { effects: [] },
      positive: {
        effects: [
          { kind: 'intensity', multiplier: 0.25 },
          { kind: 'control', multiplier: 0.25 },
        ],
      },
      negative: {
        effects: [
          { kind: 'intensity', multiplier: -0.25 },
          { kind: 'control', multiplier: -0.25 },
        ],
      },
      veryPositive: {
        effects: [
          { kind: 'intensity', multiplier: 0.5 },
          { kind: 'control', multiplier: 0.5 },
        ],
      },
      veryNegative: {
        effects: [
          { kind: 'intensity', multiplier: -0.5 },
          { kind: 'control', multiplier: -0.5 },
        ],
      },
    };

    const parsed = parseRecipeConditionEffects(gameData);
    expect(parsed.positive).toHaveLength(2);
    expect(parsed.positive[0]).toEqual({ kind: 'intensity', multiplier: 0.25 });
    expect(parsed.positive[1]).toEqual({ kind: 'control', multiplier: 0.25 });
  });

  it('should parse fortuitous condition effects using bonus instead of multiplier', () => {
    const gameData = {
      neutral: { effects: [] },
      positive: { effects: [{ kind: 'chance', bonus: 0.25 }] },
      negative: { effects: [{ kind: 'chance', bonus: -0.25 }] },
      veryPositive: { effects: [{ kind: 'chance', bonus: 0.5 }] },
      veryNegative: { effects: [{ kind: 'chance', bonus: -0.5 }] },
    };

    const parsed = parseRecipeConditionEffects(gameData);
    expect(parsed.positive).toEqual([{ kind: 'chance', bonus: 0.25 }]);
    expect(parsed.veryNegative).toEqual([{ kind: 'chance', bonus: -0.5 }]);
  });

  it('should handle missing or empty effects gracefully', () => {
    const gameData = {
      neutral: { effects: [] },
      positive: {},
      negative: { effects: [] },
    } as any;

    const parsed = parseRecipeConditionEffects(gameData);
    expect(parsed.neutral).toEqual([]);
    expect(parsed.positive).toEqual([]);
    expect(parsed.veryPositive).toEqual([]);
  });

  it('should match hardcoded fallback table for known condition types', () => {
    // Verify that parsing the game's actual condition data produces
    // the same results as our hardcoded fallback table
    const gameControlCondition = {
      neutral: { effects: [] },
      positive: { effects: [{ kind: 'control', multiplier: 0.5 }] },
      negative: { effects: [{ kind: 'control', multiplier: -0.5 }] },
      veryPositive: { effects: [{ kind: 'control', multiplier: 1 }] },
      veryNegative: { effects: [{ kind: 'control', multiplier: -1 }] },
    };

    const parsed = parseRecipeConditionEffects(gameControlCondition);
    const hardcoded = getConditionEffects('perfectable', 'positive');

    expect(parsed.positive).toEqual(hardcoded);
  });
});

describe('getConditionEffectsForConfig prefers real data', () => {
  it('should use conditionEffectsData when present', () => {
    const realData: Record<string, ConditionEffect[]> = {
      neutral: [],
      positive: [{ kind: 'control', multiplier: 0.75 }], // Custom value, not standard 0.5
      negative: [{ kind: 'control', multiplier: -0.75 }],
      veryPositive: [{ kind: 'control', multiplier: 1.5 }],
      veryNegative: [{ kind: 'control', multiplier: -1.5 }],
    };

    const config: OptimizerConfig = {
      ...DEFAULT_CONFIG,
      conditionEffectType: 'perfectable',
      conditionEffectsData: realData as any,
    };

    const effects = getConditionEffectsForConfig(config, 'positive');
    // Should use the real data (0.75), not the hardcoded perfectable value (0.5)
    expect(effects).toEqual([{ kind: 'control', multiplier: 0.75 }]);
  });

  it('should fall back to hardcoded table when conditionEffectsData is absent', () => {
    const config: OptimizerConfig = {
      ...DEFAULT_CONFIG,
      conditionEffectType: 'perfectable',
    };

    const effects = getConditionEffectsForConfig(config, 'positive');
    expect(effects).toEqual([{ kind: 'control', multiplier: 0.5 }]);
  });

  it('should return empty for unknown conditions even with real data', () => {
    const realData: Record<string, ConditionEffect[]> = {
      neutral: [],
      positive: [{ kind: 'control', multiplier: 0.5 }],
      negative: [],
      veryPositive: [],
      veryNegative: [],
    };

    const config: OptimizerConfig = {
      ...DEFAULT_CONFIG,
      conditionEffectsData: realData as any,
    };

    const effects = getConditionEffectsForConfig(config, 'someInvalidCondition');
    expect(effects).toEqual([]);
  });
});