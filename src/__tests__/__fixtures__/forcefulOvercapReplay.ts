import { CraftingState, BuffType } from '../../optimizer/state';
import type { OptimizerConfig, SkillDefinition } from '../../optimizer/skills';

interface ForcefulOvercapReplayInput {
  config: OptimizerConfig;
  state: CraftingState;
  currentCondition: string;
  forecastConditions: string[];
  targetCompletion: number;
  targetPerfection: number;
  lookaheadDepth: number;
  searchConfig: {
    timeBudgetMs: number;
    maxNodes: number;
    beamWidth: number;
    goalPriorityBias: number;
  };
}

function createSkill(
  overrides: Partial<SkillDefinition> &
    Pick<SkillDefinition, 'name' | 'key' | 'type'>,
): SkillDefinition {
  return {
    actionKind: 'skill',
    qiCost: 0,
    stabilityCost: 0,
    successChance: 1,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    scalesWithControl: false,
    scalesWithIntensity: false,
    isDisciplinedTouch: false,
    preventsMaxStabilityDecay: false,
    toxicityCost: 0,
    toxicityCleanse: 0,
    cooldown: 0,
    restoresQi: false,
    qiRestore: 0,
    restoresMaxStabilityToFull: false,
    reagentOnlyAtStepZero: false,
    ...overrides,
  };
}

export function createForcefulOvercapReplayInput(): ForcefulOvercapReplayInput {
  const config: OptimizerConfig = {
    maxQi: 338,
    maxStability: 58,
    maxCompletion: 56603,
    maxPerfection: 56603,
    baseIntensity: 241,
    baseControl: 249,
    minStability: 0,
    defaultBuffMultiplier: 1.1,
    pillsPerRound: 1,
    maxToxicity: 160,
    craftingType: 'forge',
    conditionEffectType: undefined,
    conditionEffectsData: {
      neutral: [],
      positive: [{ kind: 'control', multiplier: 0.5 }],
      negative: [{ kind: 'control', multiplier: -0.5 }],
      veryPositive: [{ kind: 'control', multiplier: 1 }],
      veryNegative: [{ kind: 'control', multiplier: -1 }],
    } as any,
    isSublimeCraft: true,
    targetMultiplier: 17.57857142857143,
    targetCompletion: 3220,
    targetPerfection: 3220,
    trainingMode: false,
    skills: [
      createSkill({
        name: 'Invasive Refine',
        key: 'invasive_refine',
        type: 'refine',
        qiCost: 12,
        stabilityCost: 17,
        basePerfectionGain: 0.8,
        scalesWithControl: true,
        effects: [
          { kind: 'perfection', amount: { value: 3.5, stat: 'control' } },
        ],
      }),
      createSkill({
        name: 'Explosive Refinement',
        key: 'explosive_refinement',
        type: 'refine',
        qiCost: 0,
        stabilityCost: 10,
        successChance: 0.4,
        baseCompletionGain: 0.1,
        basePerfectionGain: 1.5,
        scalesWithControl: true,
        effects: [
          { kind: 'completion', amount: { value: 0.1, stat: 'intensity' } },
          { kind: 'perfection', amount: { value: 3, stat: 'control' } },
        ],
      }),
      createSkill({
        name: 'Invasive Fusion',
        key: 'invasive_fusion',
        type: 'fusion',
        qiCost: 12,
        stabilityCost: 17,
        baseCompletionGain: 0.8,
        scalesWithIntensity: true,
        effects: [
          { kind: 'completion', amount: { value: 3.5, stat: 'intensity' } },
        ],
      }),
      createSkill({
        name: 'Explosive Fusion',
        key: 'explosive_fusion',
        type: 'fusion',
        qiCost: 0,
        stabilityCost: 10,
        successChance: 0.4,
        baseCompletionGain: 1.5,
        scalesWithIntensity: true,
        effects: [
          { kind: 'completion', amount: { value: 4.5, stat: 'intensity' } },
        ],
      }),
      createSkill({
        name: 'Delayed Refine',
        key: 'delayed_refine',
        type: 'refine',
        qiCost: 18,
        stabilityCost: 5,
        baseCompletionGain: 0.8,
        scalesWithIntensity: true,
        preventsMaxStabilityDecay: true,
        cooldown: 4,
        effects: [
          {
            kind: 'completion',
            condition: { kind: 'chance', percentage: 10 },
            amount: { value: 0.8, stat: 'intensity' },
          },
        ],
      }),
      createSkill({
        name: 'Forceful Stabilize',
        key: 'forceful_stabilize',
        type: 'stabilize',
        qiCost: 88,
        stabilityCost: 0,
        basePerfectionGain: 0.1,
        stabilityGain: 40,
        scalesWithControl: true,
        preventsMaxStabilityDecay: true,
        effects: [
          { kind: 'stability', amount: { value: 40 } },
          { kind: 'perfection', amount: { value: 0.1, stat: 'control' } },
        ],
      }),
      createSkill({
        name: 'Desperate Stabilize',
        key: 'desperate_stabilize',
        type: 'stabilize',
        qiCost: 0,
        stabilityCost: 10,
        successChance: 0.5,
        basePerfectionGain: 0.06,
        stabilityGain: 30,
        scalesWithControl: true,
        preventsMaxStabilityDecay: true,
        effects: [
          { kind: 'stability', amount: { value: 30 } },
          { kind: 'perfection', amount: { value: 0.06, stat: 'control' } },
        ],
      }),
      createSkill({
        name: 'Unstable Re-energisation',
        key: 'unstable_re-energisation',
        type: 'support',
        qiCost: 0,
        stabilityCost: 5,
        successChance: 0.5,
        baseCompletionGain: 0.6,
        scalesWithIntensity: true,
        restoresQi: true,
        qiRestore: 50,
        cooldown: 10,
        effects: [
          { kind: 'pool', amount: { value: 50 } },
          {
            kind: 'completion',
            condition: { kind: 'chance', percentage: 10 },
            amount: { value: 0.6, stat: 'intensity' },
          },
        ],
      }),
      createSkill({
        name: 'Focus',
        key: 'focus',
        type: 'support',
        qiCost: 10,
        stabilityCost: 1,
        preventsMaxStabilityDecay: true,
        cooldown: 1,
        effects: [
          {
            kind: 'createBuff',
            buff: {
              name: 'Focus',
              canStack: true,
              effects: [],
              onFusion: [],
              onRefine: [],
              stacks: 1,
              displayLocation: 'player',
            } as any,
            stacks: { value: 1 },
          },
        ],
      }),
    ],
  };

  const state = new CraftingState({
    qi: 230,
    stability: 31,
    initialMaxStability: 58,
    stabilityPenalty: 3,
    completion: 2026,
    perfection: 0,
    critChance: 8,
    critMultiplier: 135,
    successChanceBonus: 0,
    poolCostPercentage: 100,
    stabilityCostPercentage: 100,
    controlBuffTurns: 0,
    intensityBuffTurns: 0,
    controlBuffMultiplier: 1.4,
    intensityBuffMultiplier: 1.4,
    toxicity: 0,
    maxToxicity: 160,
    harmony: 20,
    harmonyData: {
      recommendedTechniqueTypes: ['refine', 'support', 'stabilize'],
      forgeWorks: { heat: 5 },
    },
    step: 4,
    completionBonus: 0,
    consumedPillsThisTurn: 0,
    cooldowns: new Map([
      ['delayed_fusion', 1],
      ['corrupted_stabilization', 8],
    ]),
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
              control: { value: 0.5, stat: 'control' },
              intensity: { value: 0.5, stat: 'intensity' },
            },
            effects: [],
            onFusion: [],
            onRefine: [],
            stacks: 1,
            displayLocation: 'none',
          },
        },
      ],
      [
        'fusion_invasion',
        {
          name: 'Fusion Invasion',
          stacks: 2,
          definition: {
            name: 'Fusion Invasion',
            canStack: false,
            stats: {
              intensity: { value: -0.3, stat: 'intensity' },
            },
            effects: [{ kind: 'addStack', stacks: { value: -1 } }],
            stacks: 2,
            displayLocation: 'avatar',
          },
        },
      ],
      [
        'focusing_(4%)',
        {
          name: 'Focusing (4%)',
          stacks: 1,
          definition: {
            name: 'Focusing (4%)',
            canStack: true,
            stats: { critchance: { value: 4 } },
            effects: [{ kind: 'addStack', stacks: { value: -1 } }],
            stacks: 1,
            maxStacks: 2,
            onFusion: [],
            onRefine: [],
            displayLocation: 'none',
          },
        },
      ],
      [
        'corrupted_stabilization',
        {
          name: 'Corrupted Stabilization',
          stacks: 8,
          definition: {
            name: 'Corrupted Stabilization',
            canStack: true,
            effects: [
              { kind: 'addStack', stacks: { value: -1 } },
              {
                kind: 'stability',
                condition: { kind: 'chance', percentage: 75 },
                amount: { value: 7 },
              },
            ],
            onFusion: [],
            onRefine: [],
            stacks: 8,
            displayLocation: 'stabilityLeft',
          },
        },
      ],
    ]) as any,
    nativeVariables: {
      control: 373,
      intensity: 289,
      critchance: 12,
      critmultiplier: 135,
      successChanceBonus: 0,
    },
  });

  return {
    config,
    state,
    currentCondition: 'neutral',
    forecastConditions: ['positive', 'neutral', 'neutral'],
    targetCompletion: 3220,
    targetPerfection: 3220,
    lookaheadDepth: 64,
    searchConfig: {
      timeBudgetMs: 4500,
      maxNodes: 2000000,
      beamWidth: 5,
      goalPriorityBias: 0,
    },
  };
}
