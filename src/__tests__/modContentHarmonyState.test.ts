import { BuffType, CraftingState } from '../optimizer/state';
import { lookaheadSearch } from '../optimizer/search';
import type { OptimizerConfig, SkillDefinition } from '../optimizer/skills';
import { buildCanonicalNativeVariables } from '../optimizer/nativeVariables';
import { setNativeCraftingUtils } from '../optimizer/gameTypes';
import { hydrateHarmonyData } from '../modContent/harmonyState';
import { buildStateSnapshot } from '../modContent/replaySnapshot';

function createSkill(
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

function createForgeConfig(
  skills: SkillDefinition[],
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 400,
    maxStability: 60,
    maxCompletion: 200,
    maxPerfection: 200,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    defaultBuffMultiplier: 1.4,
    skills,
    isSublimeCraft: true,
    craftingType: 'forge',
    targetMultiplier: 2,
    ...overrides,
  };
}

afterEach(() => {
  setNativeCraftingUtils(undefined);
});

describe('modContent harmony hydration', () => {
  it('hydrates forge heat from native variables when progress harmony data is missing', () => {
    const buffs = new Map<string, { name: string; stacks: number }>([
      ['heat', { name: 'Heat', stacks: 0 }],
    ]);

    const result = hydrateHarmonyData({
      isSublimeCraft: true,
      craftingType: 'forge',
      progressHarmonyData: undefined,
      nativeVariables: {
        Heat: 1,
        pool: 266.9,
      },
      buffs: buffs as any,
    });

    expect(result.source).toBe('nativeVariables');
    expect(result.harmonyData?.forgeWorks?.heat).toBe(1);
    expect(result.harmonyData?.recommendedTechniqueTypes).toEqual(['fusion']);
  });

  it('hydrates forge heat from tracked buffs when native variables are unavailable', () => {
    const buffs = new Map<string, { name: string; stacks: number }>([
      ['heat', { name: 'Heat', stacks: 4 }],
    ]);

    const result = hydrateHarmonyData({
      isSublimeCraft: true,
      craftingType: 'forge',
      progressHarmonyData: undefined,
      nativeVariables: undefined,
      buffs: buffs as any,
    });

    expect(result.source).toBe('buffs');
    expect(result.harmonyData?.forgeWorks?.heat).toBe(4);
    expect(result.harmonyData?.recommendedTechniqueTypes).toEqual([
      'fusion',
    ]);
  });

  it('preserves authoritative non-forge harmony data from progressState', () => {
    const progressHarmonyData = {
      alchemicalArts: {
        charges: ['fusion', 'refine'] as const,
        lastCombo: ['fusion', 'refine', 'support'] as const,
      },
      recommendedTechniqueTypes: ['support'] as const,
      additionalData: {
        alchemicalReactionModifiers: {
          stabilityCostPercentage: 75,
        },
      },
    };

    const result = hydrateHarmonyData({
      isSublimeCraft: true,
      craftingType: 'alchemical',
      progressHarmonyData: progressHarmonyData as any,
      nativeVariables: undefined,
      buffs: undefined,
    });

    expect(result.source).toBe('progressState');
    expect(result.harmonyData).toEqual(progressHarmonyData);
    expect(result.harmonyData).not.toBe(progressHarmonyData);
  });
});

describe('canonical native variables', () => {
  it('removes mirrored state, buff, and forge-heat values while preserving supplemental stats', () => {
    const buffs = new Map<string, { name: string; stacks: number }>([
      ['tidal_current', { name: 'Tidal Current', stacks: 1 }],
    ]);

    const canonical = buildCanonicalNativeVariables({
      nativeVariables: {
        pool: 266.9,
        completion: 0,
        stability: 60,
        Heat: 1,
        comboMeter: 2,
        control: -2412,
        intensity: 252,
        resistance: 5,
        itemEffectiveness: 10,
        'Tidal Current': 1,
      },
      buffs: buffs as any,
      harmonyData: {
        forgeWorks: { heat: 1 },
        recommendedTechniqueTypes: ['fusion'],
        additionalData: {
          comboMeter: 2,
        },
      },
    });

    expect(canonical).toEqual({
      control: -2412,
      intensity: 252,
      resistance: 5,
      itemEffectiveness: 10,
    });
  });
});

describe('optimizer replay state snapshots', () => {
  it('includes harmony data and the harmony data source', () => {
    const state = new CraftingState({
      qi: 200,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      harmony: -10,
      harmonyData: {
        forgeWorks: { heat: 2 },
        recommendedTechniqueTypes: ['fusion'],
      },
    });

    const snapshot = buildStateSnapshot(state, 'nativeVariables');

    expect(snapshot).toMatchObject({
      harmony: -10,
      harmonyDataSource: 'nativeVariables',
      harmonyData: {
        forgeWorks: { heat: 2 },
        recommendedTechniqueTypes: ['fusion'],
      },
    });
  });
});

describe('integration regression - forge heat parity', () => {
  it('uses hydrated forge heat from native variables to recommend fusion before refine', () => {
    const simpleFusion = createSkill({
      name: 'Simple Fusion',
      key: 'simple_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1,
      scalesWithIntensity: true,
    });
    const simpleRefine = createSkill({
      name: 'Simple Refine',
      key: 'simple_refine',
      type: 'refine',
      qiCost: 18,
      stabilityCost: 10,
      basePerfectionGain: 1,
      scalesWithControl: true,
    });
    const config = createForgeConfig([simpleFusion, simpleRefine]);

    const buffs = new Map<string, { name: string; stacks: number }>([
      ['heat', { name: 'Heat', stacks: 0 }],
    ]);
    const { harmonyData } = hydrateHarmonyData({
      isSublimeCraft: true,
      craftingType: 'forge',
      progressHarmonyData: undefined,
      nativeVariables: { Heat: 0, pool: 400, completion: 50 },
      buffs: buffs as any,
    });

    const state = new CraftingState({
      qi: 400,
      stability: 60,
      initialMaxStability: 60,
      completion: 50,
      perfection: 0,
      harmony: 0,
      harmonyData,
      nativeVariables: buildCanonicalNativeVariables({
        nativeVariables: { Heat: 0, pool: 400, completion: 50 },
        buffs: buffs as any,
      }),
    });

    const result = lookaheadSearch(
      state,
      config,
      100,
      100,
      6,
      'neutral',
      ['neutral', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 200000, beamWidth: 8 },
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation?.skill.type).toBe('fusion');
  });

  it('ignores misbehaving native scaling for upgrade-bearing refine effects', () => {
    const nativeEvaluateScaling = jest.fn((scaling: Record<string, unknown>) => {
      return scaling.upgradeKey === 'perfection' ? 999999 : Number.NaN;
    });
    setNativeCraftingUtils({
      evaluateScaling: nativeEvaluateScaling,
    });

    const simpleFusion = createSkill({
      name: 'Simple Fusion',
      key: 'simple_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1,
      scalesWithIntensity: true,
    });
    const upgradedRefine = createSkill({
      name: 'Upgraded Refine',
      key: 'upgraded_refine',
      type: 'refine',
      qiCost: 18,
      stabilityCost: 10,
      effects: [
        {
          kind: 'perfection',
          amount: {
            value: 1,
            stat: 'control',
            upgradeKey: 'perfection',
          },
        },
      ] as any,
    });
    const config = createForgeConfig([simpleFusion, upgradedRefine]);

    const state = new CraftingState({
      qi: 400,
      stability: 60,
      initialMaxStability: 60,
      completion: 50,
      perfection: 0,
      harmony: 0,
      harmonyData: {
        forgeWorks: { heat: 0 },
        recommendedTechniqueTypes: ['fusion'],
      },
    });

    const result = lookaheadSearch(
      state,
      config,
      100,
      100,
      6,
      'neutral',
      ['neutral', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 200000, beamWidth: 8 },
    );

    expect(nativeEvaluateScaling).not.toHaveBeenCalled();
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation?.skill.key).toBe('simple_fusion');
    expect(result.recommendation?.immediateGains.perfection).toBe(0);
  });

  it('ignores misbehaving native scaling for non-upgrade refine side effects at zero heat', () => {
    const nativeEvaluateScaling = jest.fn(() => 999999);
    setNativeCraftingUtils({
      evaluateScaling: nativeEvaluateScaling,
    });

    const simpleFusion = createSkill({
      name: 'Simple Fusion',
      key: 'simple_fusion',
      type: 'fusion',
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1,
      scalesWithIntensity: true,
    });
    const vulnerableRefine = createSkill({
      name: 'Vulnerable Refine',
      key: 'vulnerable_refine',
      type: 'refine',
      qiCost: 18,
      stabilityCost: 10,
      effects: [
        {
          kind: 'perfection',
          amount: {
            value: 1,
            stat: 'control',
            upgradeKey: 'perfection',
          },
        },
        {
          kind: 'perfection',
          condition: {
            kind: 'chance',
            percentage: 10,
          },
          amount: {
            value: 0.8,
            stat: 'control',
          },
        },
      ] as any,
    });
    const config = createForgeConfig([simpleFusion, vulnerableRefine]);

    const state = new CraftingState({
      qi: 400,
      stability: 60,
      initialMaxStability: 60,
      completion: 50,
      perfection: 0,
      harmony: 0,
      harmonyData: {
        forgeWorks: { heat: 0 },
        recommendedTechniqueTypes: ['fusion'],
      },
    });

    const result = lookaheadSearch(
      state,
      config,
      100,
      100,
      6,
      'neutral',
      ['neutral', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 200000, beamWidth: 8 },
    );

    expect(nativeEvaluateScaling).not.toHaveBeenCalled();
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation?.skill.key).toBe('simple_fusion');
    expect(
      result.alternativeSkills.find((rec) => rec.skill.key === 'vulnerable_refine')
        ?.immediateGains.perfection,
    ).toBe(0);
  });
});
