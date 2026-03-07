import { BuffType, CraftingState } from '../optimizer/state';
import { findBestSkill, lookaheadSearch } from '../optimizer/search';
import {
  applySkill,
  calculateSkillGains,
  getConditionEffectsForConfig,
  type OptimizerConfig,
  type SkillDefinition,
} from '../optimizer/skills';
import { buildCanonicalNativeVariables } from '../optimizer/nativeVariables';
import { setNativeCraftingUtils } from '../optimizer/gameTypes';
import { hydrateHarmonyData } from '../modContent/harmonyState';
import {
  buildConfigSnapshot,
  buildStateSnapshot,
  replayOptimizerSnapshot,
  reviveConfigSnapshot,
  reviveStateSnapshot,
} from '../modContent/replaySnapshot';
import {
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from './__fixtures__/replaySnapshots';

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
    expect(result.harmonyData?.recommendedTechniqueTypes).toEqual(['fusion']);
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

  it('preserves active buff definitions needed for replay parity', () => {
    const state = new CraftingState({
      qi: 200,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      buffs: new Map([
        [
          'tidal_current',
          {
            name: 'Tidal Current',
            stacks: 1,
            definition: {
              name: 'Tidal Current',
              canStack: true,
              stats: {
                control: {
                  value: 20,
                },
              },
              effects: [],
            },
          },
        ],
      ]),
    });

    const snapshot = buildStateSnapshot(state, 'progressState');

    expect(snapshot).toMatchObject({
      buffs: {
        tidal_current: {
          name: 'Tidal Current',
          stacks: 1,
          definition: {
            name: 'Tidal Current',
            stats: {
              control: {
                value: 20,
              },
            },
          },
        },
      },
    });
  });

  it('preserves mastery and granted buff data in config snapshots', () => {
    const config = createForgeConfig([
      createSkill({
        name: 'Mastered Refine',
        key: 'mastered_refine',
        type: 'refine',
        basePerfectionGain: 1,
        scalesWithControl: true,
        nativeTechnique: {
          name: 'Mastered Refine',
          currentCooldown: 0,
        },
        mastery: {
          controlBonus: 0.25,
        },
        masteryEntries: [
          {
            kind: 'upgrade',
            upgradeKey: 'perfection',
            change: 0.5,
          },
        ],
        grantedBuff: {
          name: 'Refinement Edge',
          canStack: true,
          stats: {
            control: {
              value: 10,
            },
          },
          effects: [],
        },
      }),
    ]);

    const snapshot = buildConfigSnapshot(config);

    expect((snapshot.skills as Record<string, unknown>[])[0]).toMatchObject({
      key: 'mastered_refine',
      mastery: {
        controlBonus: 0.25,
      },
      masteryEntries: [
        {
          kind: 'upgrade',
          upgradeKey: 'perfection',
          change: 0.5,
        },
      ],
      grantedBuff: {
        name: 'Refinement Edge',
      },
      nativeTechnique: {
        name: 'Mastered Refine',
        currentCooldown: 0,
      },
    });
  });

  it('round-trips runtime-shaped config and state without changing the recommendation', () => {
    const config = createForgeConfig([
      createSkill({
        name: 'Heat Builder',
        key: 'heat_builder',
        type: 'fusion',
        qiCost: 0,
        stabilityCost: 10,
        baseCompletionGain: 1,
        scalesWithIntensity: true,
      }),
      createSkill({
        name: 'Mastered Refine',
        key: 'mastered_refine',
        type: 'refine',
        qiCost: 0,
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
        masteryEntries: [
          {
            kind: 'upgrade',
            upgradeKey: 'perfection',
            change: 0.5,
          },
        ],
      }),
    ]);
    const state = new CraftingState({
      qi: 200,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      harmony: 50,
      buffs: new Map([
        [
          'tidal_current',
          {
            name: 'Tidal Current',
            stacks: 1,
            definition: {
              name: 'Tidal Current',
              canStack: true,
              stats: {
                control: {
                  value: 50,
                },
              },
              effects: [],
            },
          },
        ],
      ]),
      harmonyData: {
        forgeWorks: { heat: 5 },
        recommendedTechniqueTypes: ['refine'],
      },
    });

    const direct = lookaheadSearch(
      state,
      config,
      100,
      100,
      4,
      'neutral',
      ['neutral', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 100000, beamWidth: 8 },
    );

    const replayed = lookaheadSearch(
      reviveStateSnapshot(buildStateSnapshot(state, 'progressState')),
      reviveConfigSnapshot(buildConfigSnapshot(config)),
      100,
      100,
      4,
      'neutral',
      ['neutral', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 100000, beamWidth: 8 },
    );

    expect(direct.recommendation?.skill.key).toBe('mastered_refine');
    expect(replayed.recommendation?.skill.key).toBe(
      direct.recommendation?.skill.key,
    );
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

  it('still recommends fusion at heat=0 for snapshot-style invasive skills', () => {
    const invasiveFusion = createSkill({
      name: 'Invasive Fusion',
      key: 'invasive_fusion',
      type: 'fusion',
      qiCost: 12,
      stabilityCost: 17,
      successChance: 1,
      baseCompletionGain: 3.5,
      buffType: 1 as any,
      buffDuration: 5,
      buffMultiplier: 1.1,
      scalesWithIntensity: true,
      effects: [
        {
          kind: 'completion',
          amount: {
            value: 3.5,
            stat: 'intensity',
            upgradeKey: 'completion',
          },
        },
        {
          kind: 'createBuff',
          condition: {
            kind: 'chance',
            percentage: 25,
          },
          buff: {
            name: 'Fusion Invasion',
            canStack: false,
            stats: {
              intensity: {
                value: -0.3,
                stat: 'intensity',
                upgradeKey: 'debuffIntensity',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: { value: -1 },
              },
            ],
            stacks: 1,
            displayLocation: 'avatar',
          },
          stacks: { value: 3 },
        },
        {
          kind: 'completion',
          condition: {
            kind: 'chance',
            percentage: 10,
          },
          amount: {
            value: 0.8,
            stat: 'intensity',
          },
        },
      ] as any,
    });
    const invasiveRefine = createSkill({
      name: 'Invasive Refine',
      key: 'invasive_refine',
      type: 'refine',
      qiCost: 12,
      stabilityCost: 17,
      successChance: 1,
      basePerfectionGain: 0.8,
      buffType: 1 as any,
      buffDuration: 5,
      buffMultiplier: 1.1,
      scalesWithControl: true,
      effects: [
        {
          kind: 'perfection',
          amount: {
            value: 3.5,
            stat: 'control',
            upgradeKey: 'perfection',
          },
        },
        {
          kind: 'createBuff',
          condition: {
            kind: 'chance',
            percentage: 25,
          },
          buff: {
            name: 'Refinement Invasion',
            canStack: false,
            stats: {
              control: {
                value: -0.3,
                stat: 'control',
                upgradeKey: 'debuffControl',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: { value: -1 },
              },
            ],
            stacks: 1,
            displayLocation: 'avatar',
          },
          stacks: { value: 3 },
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
    const config = createForgeConfig([invasiveFusion, invasiveRefine], {
      maxQi: 266.9,
      maxCompletion: 45537,
      maxPerfection: 45537,
      maxToxicity: 160,
      baseIntensity: 253,
      baseControl: 269,
      defaultBuffMultiplier: 1.1,
      targetMultiplier: 17.58185328185328,
      targetCompletion: 2590,
      targetPerfection: 2590,
      conditionEffectsData: {
        neutral: [],
        positive: [
          { kind: 'intensity', multiplier: 0.25 },
          { kind: 'control', multiplier: 0.25 },
        ],
        negative: [
          { kind: 'intensity', multiplier: -0.25 },
          { kind: 'control', multiplier: -0.25 },
        ],
        veryPositive: [
          { kind: 'intensity', multiplier: 0.5 },
          { kind: 'control', multiplier: 0.5 },
        ],
        veryNegative: [
          { kind: 'intensity', multiplier: -0.5 },
          { kind: 'control', multiplier: -0.5 },
        ],
      } as any,
    });

    const state = new CraftingState({
      qi: 266.9,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
      critChance: 8,
      critMultiplier: 135,
      successChanceBonus: 0,
      poolCostPercentage: 100,
      stabilityCostPercentage: 100,
      toxicity: 0,
      maxToxicity: 160,
      harmony: 0,
      harmonyData: {
        forgeWorks: { heat: 0 },
        recommendedTechniqueTypes: ['fusion'],
      },
      buffs: new Map<string, { name: string; stacks: number }>([
        ['heat', { name: 'Heat', stacks: 0 }],
      ]),
    });

    const result = lookaheadSearch(
      state,
      config,
      2590,
      2590,
      24,
      'neutral',
      ['positive', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 200000, beamWidth: 7 },
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation?.skill.key).toBe('invasive_fusion');
    expect(result.alternativeSkills[0]?.skill.key).toBe('invasive_refine');
  });

  it('ignores misbehaving native scaling for upgrade-bearing refine effects', () => {
    const nativeEvaluateScaling = jest.fn(
      (scaling: Record<string, unknown>) => {
        return scaling.upgradeKey === 'perfection' ? 999999 : Number.NaN;
      },
    );
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
      result.alternativeSkills.find(
        (rec) => rec.skill.key === 'vulnerable_refine',
      )?.immediateGains.perfection,
    ).toBe(0);
  });

  it('does not flatten late forge overcraft branches into a heat-overshooting fusion tie', () => {
    const fixture = loadOptimizerReplaySnapshot(
      'skyfall-bow-heat-regression.snapshot.json',
    );
    const replayed = replayOptimizerSnapshot(fixture);
    const {
      state,
      config,
      currentCondition,
      forecastConditions,
      targetCompletion,
      targetPerfection,
    } = getReplaySearchInput(fixture);
    const { result } = replayed;

    const allRecommendations = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter(
      (
        recommendation,
      ): recommendation is NonNullable<typeof result.recommendation> =>
        Boolean(recommendation),
    );
    const explosiveFusionRecommendation = allRecommendations.find(
      (recommendation) => recommendation.skill.key === 'explosive_fusion',
    );

    expect(result.recommendation).not.toBeNull();
    expect(fixture.output?.recommendation?.skill?.key).toBe('explosive_fusion');
    expect(state.harmonyData?.forgeWorks?.heat).toBe(6);
    expect(state.harmonyData?.recommendedTechniqueTypes).toEqual([
      'refine',
      'support',
      'stabilize',
    ]);
    expect(result.recommendation?.skill.type).not.toBe('fusion');
    expect(explosiveFusionRecommendation).toBeDefined();
    expect(result.recommendation!.score).toBeGreaterThan(
      explosiveFusionRecommendation!.score,
    );

    const nextState = applySkill(
      state,
      result.recommendation!.skill,
      config,
      getConditionEffectsForConfig(config, currentCondition),
      targetCompletion,
      currentCondition,
    );

    expect(nextState).not.toBeNull();
    expect(nextState?.harmonyData?.forgeWorks?.heat).toBeLessThanOrEqual(6);
  });

  it('replays the reported skyfall bow forge opener with fusion before invasive refine', () => {
    // Regression from the 2026-03-07 live snapshot: a forge sublime craft at
    // authoritative heat=0 was reported as opening with Invasive Refine even
    // though forge heat should zero all refine gains until fusion raises it.
    const invasiveFusion = createSkill({
      name: 'Invasive Fusion',
      key: 'invasive_fusion',
      type: 'fusion',
      qiCost: 12,
      stabilityCost: 17,
      successChance: 1,
      baseCompletionGain: 3.5,
      buffType: BuffType.CONTROL,
      buffDuration: 5,
      buffMultiplier: 1.1,
      scalesWithIntensity: true,
      restoresQi: true,
      qiRestore: 5,
      effects: [
        {
          kind: 'completion',
          amount: {
            value: 3.5,
            stat: 'intensity',
            upgradeKey: 'completion',
          },
        },
        {
          kind: 'createBuff',
          condition: {
            kind: 'chance',
            percentage: 25,
          },
          buff: {
            name: 'Fusion Invasion',
            canStack: false,
            stats: {
              intensity: {
                value: -0.3,
                stat: 'intensity',
                upgradeKey: 'debuffIntensity',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: {
                  value: -1,
                },
              },
            ],
            stacks: 1,
            displayLocation: 'player',
          },
          stacks: {
            value: 3,
          },
        },
        {
          kind: 'pool',
          condition: {
            kind: 'chance',
            percentage: 15,
          },
          amount: {
            value: 5,
          },
        } as any,
        {
          kind: 'createBuff',
          buff: {
            name: 'Intensifying (6%)',
            canStack: true,
            stats: {
              intensity: {
                value: 0.06,
                stat: 'intensity',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: {
                  value: -1,
                },
              },
            ],
            stacks: 1,
            maxStacks: 2,
            onFusion: [],
            onRefine: [],
            displayLocation: 'player',
          },
          stacks: {
            value: 1,
          },
        },
        {
          kind: 'createBuff',
          condition: {
            kind: 'chance',
            percentage: 20,
          },
          buff: {
            name: 'Controlling Enhancement',
            canStack: true,
            stats: {
              control: {
                value: 0.1,
                stat: 'control',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: {
                  value: -1,
                },
              },
            ],
            stacks: 1,
            onFusion: [],
            onRefine: [],
            displayLocation: 'player',
            maxStacks: 5,
          },
          stacks: {
            value: 5,
          },
        },
      ] as any,
    });
    const invasiveRefine = createSkill({
      name: 'Invasive Refine',
      key: 'invasive_refine',
      type: 'refine',
      qiCost: 12,
      stabilityCost: 17,
      successChance: 1,
      basePerfectionGain: 0.8,
      buffType: BuffType.CONTROL,
      buffDuration: 5,
      buffMultiplier: 1.1,
      scalesWithControl: true,
      effects: [
        {
          kind: 'perfection',
          amount: {
            value: 3.5,
            stat: 'control',
            upgradeKey: 'perfection',
          },
        },
        {
          kind: 'createBuff',
          condition: {
            kind: 'chance',
            percentage: 25,
          },
          buff: {
            name: 'Refinement Invasion',
            canStack: false,
            stats: {
              control: {
                value: -0.3,
                stat: 'control',
                upgradeKey: 'debuffControl',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: {
                  value: -1,
                },
              },
            ],
            stacks: 1,
            displayLocation: 'player',
          },
          stacks: {
            value: 3,
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
        {
          kind: 'createBuff',
          buff: {
            name: 'Controlling (10%)',
            canStack: true,
            stats: {
              control: {
                value: 0.1,
                stat: 'control',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: {
                  value: -1,
                },
              },
            ],
            stacks: 1,
            maxStacks: 2,
            onFusion: [],
            onRefine: [],
            displayLocation: 'player',
          },
          stacks: {
            value: 1,
          },
        },
        {
          kind: 'createBuff',
          condition: {
            kind: 'chance',
            percentage: 20,
          },
          buff: {
            name: 'Controlling Enhancement',
            canStack: true,
            stats: {
              control: {
                value: 0.1,
                stat: 'control',
              },
            },
            effects: [
              {
                kind: 'addStack',
                stacks: {
                  value: -1,
                },
              },
            ],
            stacks: 1,
            onFusion: [],
            onRefine: [],
            displayLocation: 'player',
            maxStacks: 5,
          },
          stacks: {
            value: 5,
          },
        },
      ] as any,
    });
    const config = createForgeConfig([invasiveFusion, invasiveRefine], {
      maxQi: 266.9,
      maxStability: 60,
      maxCompletion: 45537,
      maxPerfection: 45537,
      baseIntensity: 253,
      baseControl: 269,
      defaultBuffMultiplier: 1.1,
      maxToxicity: 160,
      targetMultiplier: 17.58185328185328,
      targetCompletion: 2590,
      targetPerfection: 2590,
      conditionEffectsData: {
        neutral: [],
        positive: [
          { kind: 'intensity', multiplier: 0.25 },
          { kind: 'control', multiplier: 0.25 },
        ],
        negative: [
          { kind: 'intensity', multiplier: -0.25 },
          { kind: 'control', multiplier: -0.25 },
        ],
        veryPositive: [
          { kind: 'intensity', multiplier: 0.5 },
          { kind: 'control', multiplier: 0.5 },
        ],
        veryNegative: [
          { kind: 'intensity', multiplier: -0.5 },
          { kind: 'control', multiplier: -0.5 },
        ],
      },
    });
    const state = new CraftingState({
      qi: 266.9,
      stability: 60,
      initialMaxStability: 60,
      stabilityPenalty: 0,
      completion: 0,
      perfection: 0,
      critChance: 8,
      critMultiplier: 135,
      successChanceBonus: 0,
      poolCostPercentage: 100,
      stabilityCostPercentage: 100,
      toxicity: 0,
      maxToxicity: 160,
      harmony: 0,
      harmonyData: {
        forgeWorks: { heat: 0 },
        recommendedTechniqueTypes: ['fusion'],
      },
      buffs: new Map([
        [
          'heat',
          {
            name: 'Heat',
            stacks: 1,
            definition: {
              name: 'Heat',
              canStack: false,
              stats: {
                control: {
                  value: -10,
                  stat: 'control',
                },
              },
              effects: [],
              onFusion: [],
              onRefine: [],
              stacks: 1,
            },
          },
        ],
        [
          'tidal_current',
          {
            name: 'Tidal Current',
            stacks: 1,
            definition: {
              name: 'Tidal Current',
              canStack: false,
              effects: [],
              onFusion: [],
              onRefine: [
                {
                  kind: 'createBuff',
                  buff: {
                    name: 'Tidal Pressure',
                    canStack: true,
                    stats: {
                      control: {
                        value: 0.092,
                        stat: 'control',
                        scaling: 'stacks',
                      },
                      intensity: {
                        value: 0.092,
                        stat: 'intensity',
                        scaling: 'stacks',
                      },
                    },
                    effects: [],
                    onFusion: [],
                    onRefine: [],
                    onStabilize: [{ kind: 'negate' }],
                    stacks: 1,
                  },
                  stacks: {
                    value: 1,
                  },
                },
              ],
              stacks: 1,
            },
          },
        ],
      ]),
      nativeVariables: {
        resistance: 5,
        itemEffectiveness: 10,
        control: -2421,
        intensity: 253,
        critchance: 8,
        critmultiplier: 135,
        successChanceBonus: 0,
      },
      step: 0,
    });

    const directRefineGains = calculateSkillGains(
      state,
      invasiveRefine,
      config,
      [],
      { includeExpectedValue: false },
    );

    const result = findBestSkill(
      state,
      config,
      2590,
      2590,
      false,
      24,
      'neutral',
      ['positive', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 200000, beamWidth: 7 },
    );

    const refineRecommendation = [
      result.recommendation,
      ...result.alternativeSkills,
    ]
      .filter(
        (
          recommendation,
        ): recommendation is NonNullable<typeof result.recommendation> =>
          Boolean(recommendation),
      )
      .find((recommendation) => recommendation.skill.key === 'invasive_refine');

    expect(directRefineGains.perfection).toBe(0);
    expect(refineRecommendation?.immediateGains.perfection).toBe(0);
    expect(refineRecommendation?.expectedGains.perfection).toBe(0);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation?.skill.key).toBe('invasive_fusion');
    expect(result.recommendation?.skill.type).toBe('fusion');
  });
});
