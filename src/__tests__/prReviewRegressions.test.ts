import {
  serializeCanonicalValue,
  readLiveCraftStateSignature,
} from '../modContent/craftStateSignature';
import { constrainedSearch } from '../optimizer/constrainedPlanner';
import { mergePartitionedResults } from '../optimizer/searchBackend';
import { findBestSkill } from '../optimizer/search';
import { CraftingState } from '../optimizer/state';
import { resolvePlanningGoals, willAutoFinish } from '../optimizer/outcome';
import { retargetSkill, retargetConfig } from './fixtures/runtime0717';
import { projectNativeAutoUseBranches } from '../optimizer/nativeAutoUsePlan';
import { extractNativeAutoUsePlan } from '../modContent/nativeAutoUseExtraction';
import type { CraftingEntity, ProgressState } from 'afnm-types';

const skill = retargetSkill({
  key: 'progress',
  name: 'Progress',
  stabilityCost: 10,
  baseCompletionGain: 10,
});
const state = () =>
  new CraftingState({
    qi: 100,
    stability: 50,
    initialMaxStability: 100,
    maxToxicity: 100,
    items: new Map([['calm', 2]]),
  });
const item = {
  ...skill,
  key: 'calm',
  name: 'Calm',
  actionKind: 'item' as const,
  consumesTurn: false,
  itemName: 'calm',
  stabilityCost: 0,
  baseCompletionGain: 0,
  effects: [
    {
      kind: 'createBuff' as const,
      buff: {
        name: 'Calm',
        canStack: false,
        stats: {
          stabilityCostReduction: { value: 50 },
          resistance: { value: 50 },
        },
        effects: [],
      },
      stacks: { value: 4 },
    },
  ],
};
const config = () =>
  retargetConfig(skill, {
    maxCompletion: 100,
    maxPerfection: 100,
    pillsPerRound: 1,
    nativeAutoUsePlan: {
      slots: [{ item: 'Calm' }],
      items: { Calm: { action: item, toxicityBeforeResistance: 10 } },
      initialUsage: {},
      baseResistance: 0,
    },
  });
const search = (cfg = config(), initial = state()) =>
  constrainedSearch(initial, cfg, 100, 100, 1, 'neutral', [], {
    maxNodes: 1000,
    timeBudgetMs: 10000,
  });

describe('PR review regressions', () => {
  test.each([
    [1, false],
    [4, false],
    [96, false],
    [4, true],
  ] as const)(
    'rejects a provably inert full-bar restore at horizon %i (native PRD: %s)',
    (depth, native) => {
      const gamble = {
        ...skill,
        key: 'gamble',
        qiCost: 100,
        stabilityCost: 60,
        baseCompletionGain: 100,
        successChance: 0.5,
      };
      const restore = {
        ...skill,
        key: 'restore',
        qiCost: 1,
        stabilityCost: 0,
        baseCompletionGain: 0,
        stabilityGain: 40,
        preventsMaxStabilityDecay: true,
      };
      const cfg = retargetConfig(gamble, {
        skills: [gamble, restore],
        maxCompletion: 100,
        maxPerfection: 0,
        targetPerfection: 0,
        techniqueSuccessModel: native ? 'prd' : 'independent',
      });
      const result = findBestSkill(
        new CraftingState({
          qi: 100,
          stability: 60,
          initialMaxStability: 60,
          nativeVariables: native ? {} : undefined,
        }),
        cfg,
        100,
        0,
        false,
        depth,
        'neutral',
        [],
        { maxNodes: 10000, timeBudgetMs: 10000 },
      );
      expect(result.recommendation?.skill.key).toBe('gamble');
      expect(result.recommendation?.requiresProbabilisticSurvival).toBe(true);
      expect(
        result.alternativeSkills.some((r) => r.skill.key === 'restore'),
      ).toBe(false);
    },
  );
  test('retains full-bar recovery when waiting unlocks a cooldown', () => {
    const progress = {
      ...skill,
      qiCost: 0,
      stabilityCost: 60,
      baseCompletionGain: 100,
    };
    const restore = {
      ...skill,
      key: 'restore',
      qiCost: 1,
      stabilityCost: 0,
      baseCompletionGain: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
    };
    const cfg = retargetConfig(progress, {
      skills: [progress, restore],
      maxCompletion: 100,
      maxPerfection: 0,
      targetPerfection: 0,
    });
    const result = findBestSkill(
      new CraftingState({
        qi: 100,
        stability: 60,
        initialMaxStability: 60,
        cooldowns: new Map([[progress.key, 1]]),
      }),
      cfg,
      100,
      0,
      false,
      4,
      'neutral',
      [],
      { maxNodes: 10000, timeBudgetMs: 10000 },
    );
    expect(result.recommendation?.skill.key).toBe('restore');
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
  });
  test('retains a full-bar recovery that grants a useful buff', () => {
    const restore = {
      ...item,
      key: 'buff_restore',
      actionKind: 'skill' as const,
      consumesTurn: true,
      itemName: undefined,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
    };
    const cfg = retargetConfig(restore, {
      skills: [restore],
      maxCompletion: 100,
      maxPerfection: 100,
    });
    expect(
      search(cfg, state().copy({ stability: 100 })).recommendation?.skill.key,
    ).toBe('buff_restore');
  });
  test('does not prune recovery when a future effect reads the turn number', () => {
    const progress = {
      ...skill,
      effects: [
        {
          kind: 'completion' as const,
          amount: { value: 1, eqn: 'step * 100' },
        },
      ],
    };
    const restore = {
      ...skill,
      key: 'restore',
      qiCost: 1,
      stabilityCost: 0,
      baseCompletionGain: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
    };
    const cfg = retargetConfig(progress, {
      skills: [progress, restore],
      maxCompletion: 100,
      maxPerfection: 100,
    });
    const result = search(cfg, state().copy({ stability: 100 }));
    expect(
      [result.recommendation, ...result.alternativeSkills].some(
        (r) => r?.skill.key === 'restore',
      ),
    ).toBe(true);
  });
  test.each([-100, 0, 100])(
    'honors goal priority bias %i only after safety',
    (bias) => {
      const completion = {
        ...skill,
        key: 'completion',
        baseCompletionGain: 30,
      };
      const perfection = {
        ...skill,
        key: 'perfection',
        baseCompletionGain: 0,
        basePerfectionGain: 20,
      };
      const cfg = retargetConfig(completion, {
        skills: [completion, perfection],
        maxCompletion: 100,
        maxPerfection: 100,
      });
      const run = (skills = cfg.skills) =>
        findBestSkill(
          state(),
          { ...cfg, skills },
          100,
          100,
          false,
          1,
          'neutral',
          [],
          { goalPriorityBias: bias, maxNodes: 1000, timeBudgetMs: 10000 },
        );
      expect(run().recommendation?.skill.key).toBe(
        bias < 0 ? 'perfection' : 'completion',
      );
      const unsafe = {
        ...completion,
        key: 'unsafe',
        stabilityCost: 100,
        baseCompletionGain: 1000,
      };
      expect(run([unsafe, perfection]).recommendation?.skill.key).toBe(
        'perfection',
      );
    },
  );
  test.each([
    [1, '1'],
    [null, 'none'],
    [undefined, null],
    [{ a: 'x,b=y' }, { a: 'x', b: 'y' }],
    [['a,b'], ['a', 'b']],
    [{ 'a=b': 'c' }, { a: 'b=c' }],
  ])('canonical signatures distinguish %p from %p', (a, b) => {
    expect(serializeCanonicalValue(a)).not.toBe(serializeCanonicalValue(b));
  });
  test('canonical signatures ignore object key insertion order', () => {
    expect(serializeCanonicalValue({ a: 1, b: [true] })).toBe(
      serializeCanonicalValue({ b: [true], a: 1 }),
    );
  });
  test('nested companion overrides invalidate a live signature', () => {
    const root = {
      crafting: {
        player: { stats: { pool: 100 }, buffs: [], techniques: [] },
        progressState: { step: 1, stability: 50 },
        recipeStats: { stability: 100 },
      },
      game: { gameEvent: { craftingTeamUpOverride: { name: 'First' } } },
    };
    const store = { getState: () => root };
    const before = readLiveCraftStateSignature(store);
    expect(before.ok).toBe(true);
    root.game.gameEvent.craftingTeamUpOverride.name = 'Second';
    expect(readLiveCraftStateSignature(store)).not.toEqual(before);
  });
  test('explicit zero caps agree on goal attainment and actual termination', () => {
    const cfg = retargetConfig(skill, { maxCompletion: 0, maxPerfection: 0 });
    const goals = resolvePlanningGoals(cfg, 100, 100);
    expect(goals.completion).toBe(0);
    expect(goals.perfection).toBe(0);
    expect(willAutoFinish(state(), goals.bands)).toBe(true);
    expect(search(cfg)).toMatchObject({
      isTerminal: true,
      targetsMet: true,
      recommendation: null,
    });
  });
  test('a zero native item allowance stays zero', () => {
    const projected = projectNativeAutoUseBranches(
      state(),
      { ...config(), pillsPerRound: 0 },
      'neutral',
    );
    expect(projected.unresolvedProbability).toBe(0);
    expect(projected.outcomes[0].state.items.get('calm')).toBe(2);
    expect(projected.outcomes[0].state.toxicity).toBe(0);
  });
  test('preview prices the technique after native cost reduction and separates gains from costs', () => {
    const result = search();
    expect(result.recommendation?.effectiveCosts.stability).toBe(5);
    expect(result.recommendation?.expectedGains.stability).toBe(0);
    expect(result.recommendation?.immediateGains.stability).toBe(0);
  });
  test('preview combines stochastic native pre-use branches without discarding probability', () => {
    const cfg = config();
    cfg.nativeAutoUsePlan!.items.Calm.action = {
      ...item,
      effects: item.effects.map((effect) => ({
        ...effect,
        condition: { kind: 'chance' as const, percentage: 50 },
      })),
    };
    const result = search(cfg);
    expect(result.recommendation?.effectiveCosts.stability).toBe(7.5);
    expect(result.recommendation?.expectedGains.stability).toBe(0);
    expect(
      result.recommendation?.planning?.transitionUnresolvedProbability,
    ).toBe(0);
  });
  test('direct stability restoration is displayed separately from its payment', () => {
    const restore = { ...skill, stabilityGain: 20, baseCompletionGain: 0 };
    const result = search(retargetConfig(restore));
    expect(result.recommendation?.expectedGains.stability).toBe(20);
    expect(result.recommendation?.effectiveCosts.stability).toBe(10);
  });
  test('unknown native rules produce an explicit pause, never an executable recommendation', () => {
    const cfg = config();
    cfg.nativeAutoUsePlan!.slots[0].rule = {
      conditions: [{ condition: 'Unknown rule', check: '>', value: 0 }],
    };
    const result = search(cfg);
    expect(result.recommendation).toBeNull();
    expect(result.isTerminal).toBe(false);
    expect(result.blockedReasons?.some((r) => r.reason === 'unresolved')).toBe(
      true,
    );
    const merged = mergePartitionedResults([
      { ...result, blockedReasons: [] },
      result,
    ]);
    expect(merged.recommendation).toBeNull();
    expect(merged.blockedReasons?.some((r) => r.reason === 'unresolved')).toBe(
      true,
    );
  });
  test('exhausting the root budget is reported separately from unavailable actions', () => {
    const cfg = config();
    cfg.skills = [skill, { ...skill, key: 'other' }];
    const result = constrainedSearch(state(), cfg, 100, 100, 1, 'neutral', [], {
      maxNodes: 1,
      timeBudgetMs: 10000,
    });
    expect(result.recommendation).toBeNull();
    expect(result.blockedReasons?.some((r) => r.reason === 'budget')).toBe(
      true,
    );
  });
});

describe('0.7.18 native-selector contracts disputed in review', () => {
  test('registry is an ordered array and only crafting pills are eligible', () => {
    const extract = (pillKind: string) =>
      extractNativeAutoUsePlan(
        {
          player: {
            player: {
              currentCraftingAutoUseLoadout: { slots: [{ item: 'Calm' }] },
            },
          },
        },
        { stats: { resistance: 0 }, realm: 'mundane' } as CraftingEntity,
        { pillTracking: {} } as ProgressState,
        [{ name: 'Calm', stacks: 1 }],
        {
          Calm: { kind: 'pill', pillKind, effects: item.effects, realm: 'any' },
        },
        [{ name: 'First' }, { name: 'Second' }],
      );
    expect(extract('crafting').plan?.recipeConditionNames).toEqual([
      'First',
      'Second',
    ]);
    expect(extract('combat').plan).toBeUndefined();
  });
  test.each([
    [{ condition: 'Stability', check: '<', value: 60 }, 1],
    [{ conditions: [{ condition: 'Stability', check: '<', value: 40 }] }, 0],
    [
      {
        blocks: [
          { conditions: [{ condition: 'Stability', check: '<', value: 60 }] },
        ],
        rootOperator: 'AND',
      },
      1,
    ],
    [
      {
        blocks: [
          {
            conditions: [
              { condition: 'Stability', check: '<', value: 40 },
              { condition: 'Step', check: '==', value: 0 },
            ],
          },
        ],
        rootOperator: 'OR',
      },
      0,
    ],
  ])('decodes native condition/check/value slots: %p', (rule, consumed) => {
    const cfg = config();
    cfg.nativeAutoUsePlan!.slots[0].rule = rule;
    const result = projectNativeAutoUseBranches(state(), cfg, 'neutral');
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes[0].state.consumedPillsThisTurn).toBe(consumed);
  });
  test('skips active nonstacking effects and folds resistance exactly once', () => {
    const cfg = config();
    const first = projectNativeAutoUseBranches(state(), cfg, 'neutral')
      .outcomes[0].state;
    const next = first.copy({ consumedPillsThisTurn: 0 });
    expect(
      projectNativeAutoUseBranches(
        next,
        cfg,
        'neutral',
      ).outcomes[0].state.items.get('calm'),
    ).toBe(1);
    cfg.nativeAutoUsePlan!.items.Calm.action = { ...item, effects: [] };
    expect(
      projectNativeAutoUseBranches(next, cfg, 'neutral').outcomes[0].state
        .toxicity,
    ).toBe(15);
  });
});
