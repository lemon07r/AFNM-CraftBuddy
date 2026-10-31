import { CraftingState } from '../optimizer/state';
import {
  applySkill,
  applySkillOutcomes,
  canApplySkill,
} from '../optimizer/skills';
import { constrainedSearch } from '../optimizer/constrainedPlanner';
import type { BuffDefinition, TechniqueEffect } from '../optimizer/gameTypes';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';
import qiOracle from './fixtures/qiResourceOracle.json';

const pool = (value: number) => ({
  kind: 'pool' as const,
  amount: { value },
});
const initial = () => new CraftingState({ qi: 95, stability: 20 });
const opener = (effects: TechniqueEffect[] = [pool(20)]) =>
  retargetSkill({
    key: 'opener',
    name: 'Opener',
    qiCost: 10,
    stabilityCost: 10,
    cooldown: 10,
    masteryEntries: [{ kind: 'effect', effects }],
    effects: [{ kind: 'completion', amount: { value: 50 } }],
  });
const configFor = (skill: ReturnType<typeof retargetSkill>) =>
  retargetConfig(skill, {
    maxQi: 100,
    maxCompletion: 100,
    maxPerfection: 0,
    targetPerfection: 0,
  });

test.each([0, 0.5, 1])(
  'mastery recovery caps before payment on every success branch (%s)',
  (successChance) => {
    const skill = { ...opener(), successChance };
    const cfg = configFor(skill);
    const result = applySkillOutcomes(
      initial(),
      skill,
      cfg,
      [],
      100,
      'neutral',
      0,
    );
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes.length).toBe(successChance === 0.5 ? 2 : 1);
    for (const outcome of result.outcomes) expect(outcome.state.qi).toBe(90);
    if (successChance === 1)
      expect(applySkill(initial(), skill, cfg, [], 100, 'neutral', 0)?.qi).toBe(
        90,
      );
  },
);

test.each([
  ['restore then spend', [20, -10], 80],
  ['spend then restore', [-10, 20], 90],
  ['floor then recover', [-200, 20], 10],
  ['two capped restores', [20, 20], 90],
] as const)('ordered mastery pool effects: %s', (_name, amounts, expected) => {
  for (const separate of [false, true]) {
    const skill = opener(amounts.map(pool));
    if (separate)
      skill.masteryEntries = amounts.map((amount) => ({
        kind: 'effect',
        effects: [pool(amount)],
      }));
    const result = applySkillOutcomes(
      initial(),
      skill,
      configFor(skill),
      [],
      100,
      'neutral',
      0,
    );
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].state.qi).toBe(expected);
  }
});

test.each(['technique', 'buff'] as const)(
  'each %s resource effect clamps in order',
  (phase) => {
    const skill = retargetSkill({
      qiCost: 10,
      effects: phase === 'technique' ? [pool(20), pool(-10)] : [],
    });
    const definition: BuffDefinition = {
      name: 'Resource probe',
      canStack: false,
      effects: [],
      onRefine: [pool(20), pool(-10)],
    };
    const state =
      phase === 'buff'
        ? initial().copy({
            buffs: new Map([
              ['probe', { name: definition.name, stacks: 1, definition }],
            ]),
          })
        : initial();
    const result = applySkillOutcomes(
      state,
      skill,
      configFor(skill),
      [],
      100,
      'neutral',
      0,
    );
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes[0].state.qi).toBe(90);
  },
);

test('a capped mastery cannot certify an unaffordable 100-Qi continuation', () => {
  const first = opener();
  const finish = retargetSkill({
    key: 'finish',
    name: 'Finish',
    qiCost: 100,
    stabilityCost: 10,
    effects: [{ kind: 'completion', amount: { value: 50 } }],
  });
  const cfg = { ...configFor(first), skills: [first, finish] };
  const next = applySkillOutcomes(initial(), first, cfg, [], 100, 'neutral', 0)
    .outcomes[0].state;
  expect(canApplySkill(next, finish, 0, 100, 'neutral', [], 1, cfg)).toBe(
    false,
  );
  const result = constrainedSearch(initial(), cfg, 100, 0, 3, 'neutral', [], {
    maxNodes: 1000,
    timeBudgetMs: 60000,
  });
  expect(result.recommendation?.planning?.goalProbabilityLowerBound ?? 0).toBe(
    0,
  );
  expect(result.expectedFinalState).toBeUndefined();
});

test('resource triggers observe capped deltas and the post-change pool', () => {
  const definition: BuffDefinition = {
    name: 'Observer',
    canStack: false,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'poolRestored',
        effects: [
          {
            kind: 'setState',
            key: 'restored',
            mode: 'add',
            value: { value: 1, eqn: 'amount' },
          },
          { kind: 'setState', key: 'seen', value: { value: 1, eqn: 'pool' } },
        ],
      },
    ],
  };
  const state = initial().copy({
    buffs: new Map([
      ['observer', { name: definition.name, stacks: 1, definition }],
    ]),
  });
  const skill = opener();
  const result = applySkillOutcomes(
    state,
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(
    result.outcomes[0].state.getBuff('observer')?.internalState,
  ).toMatchObject({ restored: 5, seen: 100 });
});

const largerPool: BuffDefinition = {
  name: 'Larger Pool',
  canStack: false,
  effects: [],
  stats: { maxpool: { value: 100 } },
};
const growPool: TechniqueEffect = {
  kind: 'createBuff',
  buff: largerPool,
  stacks: { value: 1 },
};

test('mastery progress scaling retains the captured pool as well as pool effects', () => {
  const skill = opener();
  skill.masteryEntries = [
    { kind: 'effect', effects: [pool(20)] },
    {
      kind: 'effect',
      effects: [{ kind: 'completion', amount: { value: 1, eqn: 'pool' } }],
    },
  ];
  skill.effects = [];
  const result = applySkillOutcomes(
    initial(),
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.completion).toBe(95);
});

type QiOracleCase = [
  'mastery' | 'technique' | 'buff' | 'item',
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
test.each(qiOracle.cases as QiOracleCase[])(
  'native WLc oracle: %s Qi=%s boost=%s effects=%s,%s',
  (phase, qi, boost, a, b, expectedQi, signature, lastPool) => {
    const effects = [pool(a), pool(b)];
    const skill = retargetSkill({
      qiCost: phase === 'item' ? 0 : 10,
      stabilityCost: phase === 'item' ? 0 : 1,
      ...(phase === 'item'
        ? {
            actionKind: 'item' as const,
            consumesTurn: false,
            itemName: 'probe',
          }
        : {}),
      ...(phase === 'mastery'
        ? { masteryEntries: [{ kind: 'effect', effects }] }
        : phase === 'technique' || phase === 'item'
          ? { effects }
          : {}),
    });
    const definition: BuffDefinition = {
      name: 'Oracle observer',
      canStack: false,
      effects: [],
      stats: { qiBoost: { value: boost } },
      ...(phase === 'buff' ? { onRefine: effects } : {}),
      triggeredEffects: (['poolRestored', 'poolSpent'] as const).map(
        (trigger, index) => ({
          trigger,
          effects: [
            {
              kind: 'setState' as const,
              key: 'signature',
              value: {
                value: 1,
                eqn: `signature * 1000 + ${(index + 1) * 200} + amount * 2`,
              },
            },
            {
              kind: 'setState' as const,
              key: 'lastPool',
              value: { value: 1, eqn: 'pool * 2' },
            },
          ],
        }),
      ),
    };
    const state = new CraftingState({
      qi,
      stability: 60,
      items: new Map([['probe', 1]]),
      buffs: new Map([
        [
          'observer',
          {
            name: definition.name,
            stacks: 1,
            definition,
            internalState: { signature: 0, lastPool: 0 },
          },
        ],
      ]),
    });
    const result = applySkillOutcomes(
      state,
      skill,
      configFor(skill),
      [],
      100,
      'neutral',
      0,
    );
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].state.qi).toBe(expectedQi);
    expect(result.outcomes[0].state.getBuff('observer')?.internalState).toEqual(
      { signature, lastPool },
    );
  },
);

test('mastery entries retain their captured pool cap before payment recomputes stats', () => {
  const skill = opener();
  skill.masteryEntries = [
    { kind: 'effect', effects: [growPool] },
    { kind: 'effect', effects: [pool(20)] },
  ];
  const result = applySkillOutcomes(
    initial(),
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.qi).toBe(90);
});

test('mastery pool conditions read the captured frame after an earlier recovery', () => {
  const skill = opener();
  skill.masteryEntries = [
    { kind: 'effect', effects: [pool(20)] },
    {
      kind: 'effect',
      condition: { kind: 'condition', condition: 'pool == 95' },
      effects: [pool(-10)],
    },
  ];
  const result = applySkillOutcomes(
    initial(),
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.qi).toBe(80);
});

test('buff recovery reads the cap created by technique effects', () => {
  const skill = retargetSkill({ qiCost: 10, effects: [growPool] });
  const definition: BuffDefinition = {
    name: 'Recovery',
    canStack: false,
    effects: [],
    onRefine: [pool(20)],
  };
  const state = initial().copy({
    buffs: new Map([
      ['recovery', { name: definition.name, stacks: 1, definition }],
    ]),
  });
  const result = applySkillOutcomes(
    state,
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.qi).toBe(105);
});

test('payment handlers run before technique resource effects', () => {
  const skill = retargetSkill({ qiCost: 10, effects: [pool(-50)] });
  const definition: BuffDefinition = {
    name: 'Payment Recovery',
    canStack: false,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'poolSpent',
        effects: [
          {
            ...pool(20),
            condition: { kind: 'condition', condition: 'pool == 85' },
          },
        ],
      },
    ],
  };
  const state = initial().copy({
    buffs: new Map([
      ['recovery', { name: definition.name, stacks: 1, definition }],
    ]),
  });
  const result = applySkillOutcomes(
    state,
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.qi).toBe(50);
});

test('Qi capping does not erase stability overdraft before restoration', () => {
  const skill = retargetSkill({
    qiCost: 10,
    stabilityCost: 12,
    effects: [{ kind: 'stability', amount: { value: 10 } }],
  });
  const result = applySkillOutcomes(
    initial().copy({ stability: 3 }),
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.stability).toBe(1);
});

test('Qi-payment handlers see stability before the stability payment', () => {
  const skill = retargetSkill({ qiCost: 10, stabilityCost: 10 });
  const definition: BuffDefinition = {
    name: 'Payment observer',
    canStack: false,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'poolSpent',
        effects: [
          {
            ...pool(20),
            condition: { kind: 'condition', condition: 'stability == 20' },
          },
        ],
      },
    ],
  };
  const state = initial().copy({
    buffs: new Map([
      ['observer', { name: definition.name, stacks: 1, definition }],
    ]),
  });
  const result = applySkillOutcomes(
    state,
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.qi).toBe(100);
  expect(result.outcomes[0].state.stability).toBe(10);
});

test.each([false, true])(
  'pool handlers see only prior technique stability effects (restore first: %s)',
  (restoreFirst) => {
    const recovery: TechniqueEffect = {
      kind: 'stability',
      amount: { value: 10 },
    };
    const skill = retargetSkill({
      qiCost: 10,
      stabilityCost: 10,
      effects: restoreFirst ? [recovery, pool(20)] : [pool(20), recovery],
    });
    const definition: BuffDefinition = {
      name: 'Pool observer',
      canStack: false,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'poolRestored',
          effects: [
            {
              kind: 'completion',
              amount: { value: 100 },
              condition: { kind: 'condition', condition: 'stability == 20' },
            },
          ],
        },
      ],
    };
    const state = initial().copy({
      buffs: new Map([
        ['observer', { name: definition.name, stacks: 1, definition }],
      ]),
    });
    const result = applySkillOutcomes(
      state,
      skill,
      configFor(skill),
      [],
      100,
      'neutral',
      0,
    );
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes[0].state.completion).toBe(restoreFirst ? 100 : 0);
    expect(result.outcomes[0].state.stability).toBe(20);
  },
);

test('a lowered cap does not alter spending, but the next restore reports its actual negative delta', () => {
  const shrink: BuffDefinition = {
    name: 'Smaller Pool',
    canStack: false,
    effects: [],
    stats: { maxpool: { value: -50 } },
  };
  const observer: BuffDefinition = {
    name: 'Observer',
    canStack: false,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'poolSpent',
        effects: [
          {
            kind: 'setState',
            key: 'afterPayment',
            value: { value: 1, eqn: 'pool' },
          },
        ],
      },
      {
        trigger: 'poolRestored',
        effects: [
          {
            kind: 'setState',
            key: 'restoreDelta',
            value: { value: 1, eqn: 'amount' },
          },
        ],
      },
    ],
  };
  const skill = opener([
    { kind: 'createBuff', buff: shrink, stacks: { value: 1 } },
  ]);
  skill.effects = [pool(20)];
  const state = initial().copy({
    buffs: new Map([
      ['observer', { name: observer.name, stacks: 1, definition: observer }],
    ]),
  });
  const result = applySkillOutcomes(
    state,
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.qi).toBe(50);
  expect(result.outcomes[0].state.getBuff('observer')?.internalState).toEqual({
    afterPayment: 85,
    restoreDelta: -35,
  });
});

test('a probabilistic capped mastery retains its unaffordable continuation branch', () => {
  const first = opener([
    { ...pool(20), condition: { kind: 'chance', percentage: 50 } },
  ]);
  const finish = retargetSkill({
    key: 'finish',
    qiCost: 90,
    stabilityCost: 10,
    effects: [{ kind: 'completion', amount: { value: 50 } }],
  });
  const cfg = { ...configFor(first), skills: [first, finish] };
  const state = initial().copy({ cooldowns: new Map([['finish', 1]]) });
  const distribution = applySkillOutcomes(
    state,
    first,
    cfg,
    [],
    100,
    'neutral',
    0,
  );
  expect(distribution.unresolvedProbability).toBe(0);
  expect(
    distribution.outcomes.map((o) => [o.state.qi, o.probability]).sort(),
  ).toEqual([
    [85, 0.5],
    [90, 0.5],
  ]);
  const result = constrainedSearch(state, cfg, 100, 0, 3, 'neutral', [], {
    maxNodes: 1000,
    timeBudgetMs: 60000,
  });
  expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(0.5);
  expect(result.expectedFinalState).toBeUndefined();
});

test('manual items retain fractional Qi until the technique turn ends', () => {
  const item = retargetSkill({
    key: 'micro',
    name: 'Micro',
    itemName: 'micro',
    actionKind: 'item',
    consumesTurn: false,
    qiCost: 0,
    stabilityCost: 0,
    effects: [pool(0.5)],
  });
  const finish = retargetSkill({
    key: 'finish',
    name: 'Finish',
    qiCost: 91,
    stabilityCost: 10,
    effects: [{ kind: 'completion', amount: { value: 100 } }],
  });
  const cfg = { ...configFor(item), pillsPerRound: 2, skills: [item, finish] };
  const state = new CraftingState({
    qi: 90,
    stability: 10,
    items: new Map([['micro', 2]]),
  });
  const next = applySkillOutcomes(state, item, cfg, [], 100, 'neutral', 0)
    .outcomes[0].state;
  expect(next.qi).toBe(90.5);
  const result = constrainedSearch(state, cfg, 100, 0, 3, 'neutral', [], {
    maxNodes: 1000,
    timeBudgetMs: 60000,
  });
  expect(result.recommendation?.skill.key).toBe('micro');
  expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
  expect(result.expectedFinalState?.qi).toBe(0);
});

test.each([false, true])(
  'progress-dependent resource callbacks require a supported event order (bar first: %s)',
  (barFirst) => {
    const progress: TechniqueEffect = {
      kind: 'completion',
      amount: { value: 50 },
    };
    const skill = retargetSkill({
      qiCost: 10,
      stabilityCost: 10,
      effects: barFirst ? [progress, pool(20)] : [pool(20), progress],
    });
    const definition: BuffDefinition = {
      name: 'Progress observer',
      canStack: false,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'poolRestored',
          effects: [
            {
              kind: 'completion',
              amount: { value: 50 },
              condition: { kind: 'condition', condition: 'completion == 0' },
            },
          ],
        },
      ],
    };
    const state = initial().copy({
      buffs: new Map([
        ['observer', { name: definition.name, stacks: 1, definition }],
      ]),
    });
    const cfg = configFor(skill);
    const distribution = applySkillOutcomes(
      state,
      skill,
      cfg,
      [],
      100,
      'neutral',
      0,
    );
    if (barFirst) {
      expect(distribution.unresolvedProbability).toBe(1);
      expect(distribution.outcomes).toEqual([]);
      expect(distribution.unsupportedReason).toMatch(/progress.*order/i);
      const result = constrainedSearch(state, cfg, 100, 0, 2, 'neutral', [], {
        maxNodes: 100,
        timeBudgetMs: 60000,
      });
      expect(result.recommendation).toBeNull();
      expect(result.expectedFinalState).toBeUndefined();
    } else {
      expect(distribution.unresolvedProbability).toBe(0);
      expect(distribution.outcomes[0].state.completion).toBe(100);
    }
  },
);

test('a later technique effect cannot read an unmodeled updated progress bar', () => {
  const skill = retargetSkill({
    effects: [
      { kind: 'completion', amount: { value: 50 } },
      {
        kind: 'completion',
        amount: { value: 50 },
        condition: { kind: 'completion', mode: 'less', percentage: 50 },
      },
    ],
  });
  const result = applySkillOutcomes(
    initial(),
    skill,
    configFor(skill),
    [],
    100,
    'neutral',
    0,
  );
  expect(result.unresolvedProbability).toBe(1);
  expect(result.outcomes).toEqual([]);
});
