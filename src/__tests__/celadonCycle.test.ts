import { CraftingState, type TrackedBuff } from '../optimizer/state';
import { applySkillOutcomes } from '../optimizer/skills';
import { findBestSkill } from '../optimizer/search';
import type { BuffDefinition, TechniqueType } from '../optimizer/gameTypes';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';
import { celadonCycle, embers } from './fixtures/celadonCycle';

const key = (name: string) => name.toLowerCase().replace(/ /g, '_');
const actions = (
  ['fusion', 'refine', 'support', 'stabilize'] as TechniqueType[]
).map((type) =>
  retargetSkill({ key: type, name: type, type, qiCost: 10, stabilityCost: 5 }),
);
const config = retargetConfig(actions[0], {
  skills: actions,
  maxQi: 200,
  maxCompletion: 1000,
  maxPerfection: 1000,
  isSublimeCraft: true,
  craftingType: 'formless',
});
function state(cycle = celadonCycle, ready = 0) {
  const buffs = new Map<string, TrackedBuff>([
    ['celadon_cycle', { name: cycle.name, stacks: 1, definition: cycle }],
  ]);
  for (const ember of embers.slice(0, ready))
    buffs.set(key(ember.name), {
      name: ember.name,
      stacks: 1,
      definition: ember,
    });
  return new CraftingState({
    qi: 100,
    stability: 40,
    initialMaxStability: 60,
    harmony: 33,
    harmonyData: { recommendedTechniqueTypes: [] },
    buffs,
  });
}
const apply = (s: CraftingState, action = actions[0]) =>
  applySkillOutcomes(s, action, config, [], 100, 'neutral', 100);
function permutations<T>(items: T[]): T[][] {
  return items.length
    ? items.flatMap((v, i) =>
        permutations(items.filter((_, j) => i !== j)).map((rest) => [
          v,
          ...rest,
        ]),
      )
    : [[]];
}

test.each(
  permutations([0, 1, 2, 3]).map((order) => [order.join(''), order] as const),
)('all action orders pay once and consume all embers: %s', (_label, order) => {
  let s = state();
  const original = s;
  for (const index of order) {
    const result = apply(s, actions[index]);
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes).toHaveLength(1);
    s = result.outcomes[0].state;
  }
  expect(s.qi).toBe(80);
  expect(s.stability).toBe(30);
  expect(embers.every((e) => s.getBuffStacks(key(e.name)) === 0)).toBe(true);
  expect(original.buffs.size).toBe(1);
  for (const index of order) s = apply(s, actions[index]).outcomes[0].state;
  expect(s.qi).toBe(60);
  expect(s.stability).toBe(20);
  expect(s.buffs.size).toBe(1);
});
test('repeating one action does not repeatedly gain a non-stacking ember or pay a cycle', () => {
  let s = state();
  for (let i = 0; i < 4; i++) s = apply(s).outcomes[0].state;
  expect(s.getBuffStacks('fusion_ember')).toBe(1);
  expect(s.qi).toBe(60);
  expect(s.stability).toBe(20);
});
test('action-type buff effects still award embers after failed techniques', () => {
  let s = state();
  for (const action of actions)
    s = apply(s, { ...action, successChance: 0 }).outcomes[0].state;
  expect(s.qi).toBe(80);
  expect(s.stability).toBe(30);
  expect(s.buffs.size).toBe(1);
});
test.each([
  [3, 1],
  [1, 0],
])(
  'payout preserves stability overdraft: starting %s -> %s',
  (initial, expected) => {
    const result = apply(state(celadonCycle, 3).copy({ stability: initial }), {
      ...actions[3],
      stabilityCost: 12,
    });
    expect(result.outcomes[0].state.stability).toBe(expected);
  },
);
test('chance-gated fourth ember remains two whole outcomes, including the fatal branch', () => {
  const cycle: BuffDefinition = {
    ...celadonCycle,
    onStabilize: [
      {
        ...celadonCycle.onStabilize![0],
        condition: { kind: 'chance', percentage: 50 },
      },
    ],
  };
  const result = apply(state(cycle, 3).copy({ stability: 3 }), actions[3]);
  expect(result.unresolvedProbability).toBe(0);
  expect(
    result.outcomes.map((o) => [o.probability, o.state.stability]).sort(),
  ).toEqual([
    [0.5, 0],
    [0.5, 8],
  ]);
});
test('caps do not prevent consumption, and payout does not restore maximum stability', () => {
  const result = apply(
    state(celadonCycle, 3).copy({ qi: 200, stability: 60 }),
    { ...actions[3], qiCost: 0, stabilityCost: 0 },
  ).outcomes[0].state;
  expect(result.qi).toBe(200);
  expect(result.stability).toBe(59);
  expect(result.maxStability).toBe(59);
  expect(result.buffs.size).toBe(1);
});
test('technique creation triggers before the later action-type buff grants the next-cycle ember', () => {
  const action = {
    ...actions[0],
    effects: [
      { kind: 'createBuff' as const, buff: embers[3], stacks: { value: 1 } },
    ],
  };
  const result = apply(state(celadonCycle, 3), action).outcomes[0].state;
  expect(result.qi).toBe(110);
  expect(result.stability).toBe(45);
  expect(result.getBuffStacks('fusion_ember')).toBe(1);
  expect(result.getBuffStacks('stability_ember')).toBe(0);
});
test('production search can recommend an action with Celadon equipped', () => {
  const result = findBestSkill(
    state(),
    config,
    100,
    100,
    false,
    2,
    'neutral',
    [],
    { maxNodes: 2000, timeBudgetMs: 60000 },
  );
  expect(result.recommendation).not.toBeNull();
  expect(result.recommendation?.planning?.transitionUnresolvedProbability).toBe(
    0,
  );
});
test.each(['stackGained.Unknown Ember', 'stackLost.Fusion Ember'])(
  'unmodeled stack event remains unresolved: %s',
  (trigger) => {
    const cycle = {
      ...celadonCycle,
      triggeredEffects: [{ trigger, effects: [] }],
    };
    expect(apply(state(cycle))).toMatchObject({
      outcomes: [],
      unresolvedProbability: 1,
    });
  },
);

test('payout uses current maximum Qi after an earlier buff changes it', () => {
  const grow: BuffDefinition = {
    name: 'Grow',
    canStack: false,
    effects: [],
    onStabilize: [
      {
        kind: 'createBuff',
        buff: {
          name: 'Larger Pool',
          canStack: false,
          effects: [],
          stats: { maxpool: { value: 100 } },
        },
        stacks: { value: 1 },
      },
    ],
  };
  const s = state(celadonCycle, 3);
  const buffs = new Map<string, TrackedBuff>([
    ['grow', { name: 'Grow', stacks: 1, definition: grow }],
    ...Array.from(s.buffs),
  ]);
  const result = apply(s.copy({ qi: 195, buffs }), { ...actions[3], qiCost: 0 })
    .outcomes[0].state;
  expect(result.qi).toBe(225);
});
test('payout respects current Qi and stability boost stats', () => {
  const s = state(celadonCycle, 3);
  const boost: BuffDefinition = {
    name: 'Boost',
    canStack: false,
    effects: [],
    stats: { qiBoost: { value: 25 }, stabilityBoost: { value: 20 } },
  };
  const result = apply(
    s.copy({
      buffs: new Map([
        ...Array.from(s.buffs),
        ['boost', { name: 'Boost', stacks: 1, definition: boost }],
      ]),
    }),
    actions[3],
  ).outcomes[0].state;
  expect(result.qi).toBe(115);
  expect(result.stability).toBe(47);
});
test.each([195, 200])(
  'poolRestored publishes the actual capped payout, including zero: %s',
  (qi) => {
    const observer: BuffDefinition = {
      name: 'Observer',
      canStack: false,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'poolRestored',
          effects: [
            {
              kind: 'setState',
              key: 'calls',
              mode: 'add',
              value: { value: 1 },
            },
            {
              kind: 'setState',
              key: 'received',
              mode: 'add',
              value: { value: 1, scaling: 'amount' },
            },
          ],
        },
      ],
    };
    const s = state(celadonCycle, 3);
    const result = apply(
      s.copy({
        qi,
        buffs: new Map([
          ...Array.from(s.buffs),
          ['observer', { name: 'Observer', stacks: 1, definition: observer }],
        ]),
      }),
      { ...actions[3], qiCost: 0 },
    ).outcomes[0].state;
    expect(result.qi).toBe(200);
    expect(result.buffs.get('observer')?.internalState).toEqual({
      calls: 1,
      received: 200 - qi,
    });
  },
);
test('per-event/per-owner guard matches nested cycle events without infinite recursion', () => {
  const bridge: BuffDefinition = {
    name: 'Bridge',
    canStack: false,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'poolRestored',
        effects: [
          { kind: 'createBuff', buff: embers[0], stacks: { value: -1 } },
          { kind: 'createBuff', buff: embers[0], stacks: { value: 1 } },
        ],
      },
    ],
  };
  const s = state(celadonCycle, 3);
  const result = apply(
    s.copy({
      buffs: new Map([
        ...Array.from(s.buffs),
        ['bridge', { name: 'Bridge', stacks: 1, definition: bridge }],
      ]),
    }),
    actions[3],
  ).outcomes[0].state;
  expect(result.qi).toBe(130);
  expect(result.stability).toBe(55);
  expect(embers.every((e) => result.getBuffStacks(key(e.name)) === 0)).toBe(
    true,
  );
});
test('unverified stack-trigger programs remain unresolved', () => {
  const changed = {
    ...celadonCycle,
    triggeredEffects: [
      {
        trigger: 'stackGained.Fusion Ember',
        effects: [{ kind: 'stability' as const, amount: { value: 100 } }],
      },
    ],
  };
  expect(apply(state(changed))).toMatchObject({
    outcomes: [],
    unresolvedProbability: 1,
  });
});

test('downstream stability-restored handlers observe the post-payout stability', () => {
  const observer: BuffDefinition = {
    name: 'Observer',
    canStack: false,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'stabilityRestored',
        effects: [
          {
            kind: 'setState',
            key: 'seen',
            value: { value: 1 },
            condition: { kind: 'condition', condition: 'stability >= 45' },
          },
        ],
      },
    ],
  };
  const s = state(celadonCycle, 3);
  const result = apply(
    s.copy({
      buffs: new Map([
        ...Array.from(s.buffs),
        ['observer', { name: 'Observer', stacks: 1, definition: observer }],
      ]),
    }),
    actions[3],
  ).outcomes[0].state;
  expect(result.buffs.get('observer')?.internalState?.seen).toBe(1);
});
