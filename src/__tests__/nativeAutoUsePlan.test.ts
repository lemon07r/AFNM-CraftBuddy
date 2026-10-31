import {
  CraftingState,
  BuffType,
  DEFAULT_CONFIG,
  projectNativeAutoUseBranches,
  type NativeAutoUsePlan,
  type SkillDefinition,
  type OptimizerConfig,
} from '../optimizer';
import { applySkill } from '../optimizer/skills';
import { extractNativeAutoUsePlan } from '../modContent/nativeAutoUseExtraction';
import type { CraftingEntity, ProgressState } from 'afnm-types';

const pill: SkillDefinition = {
  key: 'item_calm',
  name: 'Use Calm',
  itemName: 'calm',
  actionKind: 'item',
  consumesTurn: false,
  qiCost: 0,
  stabilityCost: 0,
  baseCompletionGain: 0,
  basePerfectionGain: 0,
  stabilityGain: 0,
  maxStabilityChange: 0,
  buffType: BuffType.NONE,
  buffDuration: 0,
  buffMultiplier: 1,
  successChance: 1,
  type: 'support',
  effects: [
    {
      kind: 'createBuff',
      buff: {
        name: 'Calm',
        canStack: false,
        stats: { stabilityCostReduction: { value: 50 } },
        effects: [],
      },
      stacks: { value: 4 },
    },
  ],
};
const plan = (
  overrides: Partial<NativeAutoUsePlan> = {},
): NativeAutoUsePlan => ({
  slots: [{ item: 'Calm' }],
  items: { Calm: { action: pill, toxicityBeforeResistance: 10 } },
  baseResistance: 0,
  initialUsage: {},
  ...overrides,
});
const config = (nativeAutoUsePlan = plan()): OptimizerConfig => ({
  ...DEFAULT_CONFIG,
  maxQi: 100,
  maxStability: 100,
  maxToxicity: 100,
  targetCompletion: 100,
  targetPerfection: 100,
  pillsPerRound: 2,
  nativeAutoUsePlan,
});
const state = (): CraftingState =>
  new CraftingState({
    qi: 100,
    stability: 15,
    initialMaxStability: 100,
    maxToxicity: 100,
    items: new Map([['calm', 2]]),
    step: 3,
  });

describe('native pre-technique planning', () => {
  it('applies a configured cost reduction before technique payment, without spending a turn', () => {
    const projected = projectNativeAutoUseBranches(
      state(),
      config(),
      'neutral',
    );
    expect(projected.unresolvedProbability).toBe(0);
    const beforeTechnique = projected.outcomes[0].state;
    expect(beforeTechnique.step).toBe(3);
    expect(beforeTechnique.stability).toBe(15);
    expect(beforeTechnique.getBuffStacks('calm')).toBe(4);
    expect(beforeTechnique.items.get('calm')).toBe(1);
    expect(beforeTechnique.consumedPillsThisTurn).toBe(1);
    const skill = {
      ...pill,
      actionKind: 'skill' as const,
      consumesTurn: true,
      itemName: undefined,
      key: 'fusion',
      name: 'Fusion',
      stabilityCost: 20,
      effects: [],
      type: 'fusion' as const,
    };
    expect(applySkill(beforeTechnique, skill, config())?.stability).toBe(5);
    expect(applySkill(state(), skill, config())?.stability).toBe(0);
  });

  it('does not reconsume an already-active nonstacking buff', () => {
    const first = projectNativeAutoUseBranches(state(), config(), 'neutral')
      .outcomes[0].state;
    const next = projectNativeAutoUseBranches(
      first.copy({ step: 4, consumedPillsThisTurn: 0 }),
      config(),
      'neutral',
    );
    expect(next.outcomes[0].state.items.get('calm')).toBe(1);
    expect(next.outcomes[0].state.consumedPillsThisTurn).toBe(0);
  });

  it('evaluates legacy and block rules from the simulated state on each turn', () => {
    const cfg = config(
      plan({
        slots: [
          {
            item: 'Calm',
            rule: {
              blocks: [
                {
                  conditions: [
                    { condition: 'Stability', check: '<', value: 20 },
                    { condition: 'Step', check: '==', value: 8 },
                  ],
                },
              ],
              rootOperator: 'AND',
            },
          },
        ],
      }),
    );
    expect(
      projectNativeAutoUseBranches(state(), cfg, 'neutral').outcomes[0].state
        .consumedPillsThisTurn,
    ).toBe(1);
    expect(
      projectNativeAutoUseBranches(
        state().copy({ stability: 80 }),
        cfg,
        'neutral',
      ).outcomes[0].state.consumedPillsThisTurn,
    ).toBe(0);
    expect(
      projectNativeAutoUseBranches(
        state().copy({ stability: 80, step: 8 }),
        cfg,
        'neutral',
      ).outcomes[0].state.consumedPillsThisTurn,
    ).toBe(1);
  });

  it('reports unsupported conditions as unresolved, never as a promised rescue', () => {
    const cfg = config(
      plan({
        slots: [
          {
            item: 'Calm',
            rule: {
              conditions: [
                { condition: 'Recipe Condition', check: '==', value: 2 },
              ],
            },
          },
        ],
      }),
    );
    expect(projectNativeAutoUseBranches(state(), cfg, 'neutral')).toEqual({
      outcomes: [],
      unresolvedProbability: 1,
    });
  });

  it('evaluates Recipe Condition against the serialized runtime registry order', () => {
    const cfg = config(
      plan({
        recipeConditionNames: ['First', 'Second'],
        recipeConditionName: 'Second',
        slots: [
          {
            item: 'Calm',
            rule: {
              conditions: [
                { condition: 'Recipe Condition', check: '==', value: 1 },
              ],
            },
          },
        ],
      }),
    );
    expect(
      projectNativeAutoUseBranches(state(), cfg, 'neutral').outcomes[0].state
        .consumedPillsThisTurn,
    ).toBe(1);
    cfg.nativeAutoUsePlan!.recipeConditionName = 'First';
    expect(
      projectNativeAutoUseBranches(state(), cfg, 'neutral').outcomes[0].state
        .consumedPillsThisTurn,
    ).toBe(0);
  });

  it('bounds combined item branches and keeps all omitted probability explicit', () => {
    const action = {
      ...pill,
      effects: [
        {
          kind: 'stability' as const,
          amount: { value: 1 },
          condition: { kind: 'chance' as const, percentage: 50 },
        },
      ],
    };
    const cfg = {
      ...config(
        plan({
          slots: Array.from({ length: 7 }, () => ({ item: 'Calm' })),
          items: { Calm: { action, toxicityBeforeResistance: 0 } },
        }),
      ),
      pillsPerRound: 7,
    };
    const distribution = projectNativeAutoUseBranches(
      state().copy({ items: new Map([['calm', 7]]) }),
      cfg,
      'neutral',
    );
    expect(distribution.outcomes.length).toBeLessThanOrEqual(64);
    expect(distribution.unresolvedProbability).toBeGreaterThan(0);
    expect(
      distribution.outcomes.reduce(
        (sum, outcome) => sum + outcome.probability,
        distribution.unresolvedProbability,
      ),
    ).toBeCloseTo(1);
  });

  it('scales toxicity by resistance and honors the shared per-turn budget', () => {
    const cfg = config(plan({ baseResistance: 50 }));
    expect(
      projectNativeAutoUseBranches(state(), cfg, 'neutral').outcomes[0].state
        .toxicity,
    ).toBe(5);
    expect(
      projectNativeAutoUseBranches(
        state().copy({ consumedPillsThisTurn: 2 }),
        cfg,
        'neutral',
      ).outcomes[0].state.items.get('calm'),
    ).toBe(2);
    expect(
      projectNativeAutoUseBranches(
        state().copy({ toxicity: 98 }),
        cfg,
        'neutral',
      ).outcomes[0].state.items.get('calm'),
    ).toBe(2);
  });

  it('selects with original resistance but recomputes toxicity payment between items', () => {
    const resistancePill = {
      ...pill,
      key: 'item_resistance',
      name: 'Use Resistance',
      itemName: 'resistance',
      effects: [
        {
          kind: 'createBuff' as const,
          buff: {
            name: 'Resistance Aid',
            canStack: false,
            stats: { resistance: { value: 50 } },
            effects: [],
          },
          stacks: { value: 4 },
        },
      ],
    };
    const cfg = config(
      plan({
        slots: [{ item: 'Resistance' }, { item: 'Calm' }],
        items: {
          Resistance: { action: resistancePill, toxicityBeforeResistance: 10 },
          Calm: { action: pill, toxicityBeforeResistance: 10 },
        },
      }),
    );
    const projected = projectNativeAutoUseBranches(
      state().copy({
        items: new Map([
          ['resistance', 1],
          ['calm', 1],
        ]),
      }),
      cfg,
      'neutral',
    );
    expect(projected.unresolvedProbability).toBe(0);
    expect(projected.outcomes[0].state.toxicity).toBe(15);
  });

  it('keeps stochastic item effects as separate outcomes', () => {
    const action = {
      ...pill,
      effects: [
        {
          kind: 'stability' as const,
          amount: { value: 20 },
          condition: { kind: 'chance' as const, percentage: 50 },
        },
      ],
    };
    const cfg = config(
      plan({ items: { Calm: { action, toxicityBeforeResistance: 0 } } }),
    );
    const distribution = projectNativeAutoUseBranches(state(), cfg, 'neutral');
    expect(distribution.unresolvedProbability).toBe(0);
    expect(
      distribution.outcomes
        .map((o) => [o.state.stability, o.probability])
        .sort((a, b) => a[0] - b[0]),
    ).toEqual([
      [15, 0.5],
      [35, 0.5],
    ]);
  });

  it('retains training inventory while enforcing the per-craft maxCount', () => {
    const cfg = {
      ...config(plan({ slots: [{ item: 'Calm', maxCount: 1 }] })),
      trainingMode: true,
    };
    const first = projectNativeAutoUseBranches(state(), cfg, 'neutral')
      .outcomes[0].state;
    expect(first.items.get('calm')).toBe(2);
    const next = first.copy({
      buffs: new Map(),
      step: 4,
      consumedPillsThisTurn: 0,
    });
    expect(
      projectNativeAutoUseBranches(next, cfg, 'neutral').outcomes[0].state
        .consumedPillsThisTurn,
    ).toBe(0);
  });
});

describe('native plan extraction', () => {
  const entity = {
    stats: { resistance: 20 },
    realm: 'bodyForging',
  } as CraftingEntity;
  const progress = { pillTracking: { Calm: 2 } } as unknown as ProgressState;
  const root = {
    player: {
      player: {
        currentCraftingAutoUseLoadout: {
          slots: [{ item: 'Calm', maxCount: 4 }],
        },
      },
    },
  };
  const items = {
    Calm: {
      kind: 'pill',
      pillKind: 'crafting',
      realm: 'qiCondensation',
      toxicity: 10,
      effects: pill.effects,
    },
  };

  it('includes non-quick-access loadout inventory and actual realm/toxicity data', () => {
    const result = extractNativeAutoUsePlan(
      root,
      entity,
      progress,
      [{ name: 'Calm', stacks: 3 }],
      items,
    );
    expect(result.inventoryCounts.get('calm')).toBe(3);
    expect(result.plan?.items.Calm.toxicityBeforeResistance).toBe(16);
    expect(result.plan?.initialUsage.Calm).toBe(2);
    expect(result.plan?.baseResistance).toBe(20);
  });

  it('does not fabricate behavior for a loadout item missing from the registry', () => {
    const result = extractNativeAutoUsePlan(
      root,
      entity,
      progress,
      [{ name: 'Calm', stacks: 1 }],
      {},
    );
    expect(result.plan?.unsupportedReason).toContain('Calm');
  });
});
