import { CraftingState, type TrackedBuff } from '../../optimizer/state';
import type { BuffDefinition } from '../../optimizer/gameTypes';
import { retargetConfig, retargetSkill } from './runtime0717';

export const critCycle: BuffDefinition = {
  name: 'Crit cycle',
  canStack: false,
  effects: [],
  critCycle: { interval: 5, critchance: 30, overcrit: 10 },
};

export const momentum: BuffDefinition = {
  name: 'Momentum',
  canStack: false,
  effects: [],
  stats: { control: { value: 0.1, stat: 'control', eqn: 'momentum' } },
  triggeredEffects: [
    {
      trigger: 'actionResolved',
      effects: [
        {
          kind: 'setState',
          key: 'momentum',
          value: {
            value: 1,
            eqn: 'isRefinement ? momentum + succeeded : momentum / 2',
          },
        },
      ],
    },
  ],
};

export const critWatcher: BuffDefinition = {
  name: 'Crit watcher',
  canStack: false,
  effects: [],
  triggeredEffects: [
    {
      trigger: 'crit',
      effects: [
        { kind: 'setState', key: 'crits', mode: 'add', value: { value: 1 } },
        { kind: 'setState', key: 'amount', value: { value: 1, eqn: 'amount' } },
        {
          kind: 'setState',
          key: 'percent',
          value: { value: 1, eqn: 'percentGained' },
        },
      ],
    },
  ],
};

export const fate: BuffDefinition = {
  name: "Fate's Favor",
  canStack: true,
  effects: [],
};
export const failedWatcher: BuffDefinition = {
  name: 'Failure watcher',
  canStack: false,
  effects: [],
  triggeredEffects: [
    {
      trigger: 'actionFailed',
      effects: [{ kind: 'createBuff', buff: fate, stacks: { value: 1 } }],
    },
  ],
};

export function critState(
  overrides: ConstructorParameters<typeof CraftingState>[0] = {},
): CraftingState {
  return new CraftingState({
    qi: 100,
    stability: 50,
    critMultiplier: 200,
    ...overrides,
  });
}

export function held(
  definition: BuffDefinition,
  internalState?: Record<string, number>,
  stacks = 1,
): TrackedBuff {
  return { name: definition.name, definition, stacks, internalState };
}

export function overcritScenarios() {
  const multi = retargetSkill({
    effects: [
      { kind: 'completion', amount: { value: 100 } },
      { kind: 'perfection', amount: { value: 100 } },
      { kind: 'perfection', amount: { value: 100 } },
    ],
  });
  const scenarios: Array<{
    name: string;
    state: CraftingState;
    skill: typeof multi;
    config: ReturnType<typeof retargetConfig>;
  }> = [];
  const add = (name: string, state: CraftingState, skill = multi) => {
    scenarios.push({
      name: `0720-crit-${name}`,
      state,
      skill,
      config: retargetConfig(skill),
    });
  };
  add('chain', critState({ critChance: 50, overcrit: 50 }));
  add(
    'cap-growth',
    critState({
      critChance: 150,
      overcrit: 95,
      overcritCapBonus: 9,
      buffs: new Map([
        [
          'growth',
          held({
            name: 'Growth',
            canStack: false,
            effects: [],
            overcritChainGrowth: 25,
          }),
        ],
      ]),
    }),
  );
  const ready = critState({
    critChance: 70,
    buffs: new Map([
      ['crit_cycle', held(critCycle, { actionsRemaining: 1 })],
      ['crit_watcher', held(critWatcher)],
    ]),
  });
  add('cycle-ready', ready);
  add(
    'cycle-countdown',
    ready.copy({
      buffs: new Map([
        ['crit_cycle', held(critCycle, { actionsRemaining: 5 })],
      ]),
    }),
  );
  add('cycle-weighted', ready, { ...multi, successChance: 0.5 });
  add('cycle-failure', ready, { ...multi, successChance: 0 });
  add(
    'cycle-no-bar',
    ready,
    retargetSkill({ effects: [{ kind: 'pool', amount: { value: 5 } }] }),
  );
  add('item-no-cycle', ready.copy({ items: new Map([['crit_pill', 1]]) }), {
    ...multi,
    key: 'crit_pill',
    name: 'Crit pill',
    actionKind: 'item',
    itemName: 'crit_pill',
    consumesTurn: false,
  });
  add('refinement', critState({ refinementCritChance: 100 }), multi);
  const listeners = critState({
    buffs: new Map([
      ['momentum', held(momentum, { momentum: 2 })],
      ['failure_watcher', held(failedWatcher)],
    ]),
  });
  add('resolved-weighted', listeners, { ...multi, successChance: 0.5 });
  add('failed-certain', listeners, { ...multi, successChance: 0 });
  add('resolved-nonrefine', listeners, { ...multi, type: 'fusion' });
  const listener: BuffDefinition = {
    name: 'Bar listener',
    canStack: false,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'completionGained',
        effects: [
          {
            kind: 'setState',
            key: 'received',
            mode: 'add',
            value: { value: 1, eqn: 'amount' },
          },
        ],
      },
    ],
  };
  const mastery = {
    kind: 'effect' as const,
    effects: [{ kind: 'completion' as const, amount: { value: 100 } }],
  };
  for (const kind of ['refinement', 'cycle']) {
    add(
      `mastery-listener-${kind}`,
      critState({
        refinementCritChance: kind === 'refinement' ? 100 : 0,
        buffs: new Map([
          ['bar_listener', held(listener)],
          ['crit_watcher', held(critWatcher)],
          ...(kind === 'cycle'
            ? [
                [
                  'crit_cycle',
                  held(
                    {
                      ...critCycle,
                      critCycle: { interval: 3, critchance: 100, overcrit: 0 },
                    },
                    { actionsRemaining: 1 },
                  ),
                ] as const,
              ]
            : []),
        ]),
      }),
      retargetSkill({ masteryEntries: [mastery, mastery], effects: [] }),
    );
  }
  for (const kind of ['ordinary', 'triggered', 'interceptor']) {
    const bar = { kind: 'perfection' as const, amount: { value: 100 } };
    const owner: BuffDefinition = {
      ...critCycle,
      critCycle: { interval: 5, critchance: 100, overcrit: 0 },
      effects: kind === 'ordinary' ? [bar] : [],
      triggeredEffects:
        kind === 'triggered'
          ? [{ trigger: 'actionResolved', effects: [bar] }]
          : [],
      craftingEffectInterceptors:
        kind === 'interceptor'
          ? [
              {
                scope: 'resource',
                appliesTo: ['stability'],
                modifier: { kind: 'multiply', value: 1 },
                effects: [
                  {
                    kind: 'setState',
                    key: 'critActionId',
                    value: { value: 9 },
                  },
                  bar,
                ],
              },
            ]
          : [],
    };
    add(
      `owner-id-${kind}`,
      critState({
        buffs: new Map([
          [
            'owner',
            held(owner, {
              actionsRemaining: 5,
              critActionId: 7,
              critCycleReady: 1,
            }),
          ],
        ]),
      }),
      retargetSkill({
        stabilityCost: 0,
        effects:
          kind === 'interceptor'
            ? [{ kind: 'stability', amount: { value: 1 } }]
            : [],
      }),
    );
  }
  return scenarios;
}
