import { CraftingState } from '../../optimizer/state';
import { retargetConfig, retargetSkill } from './runtime0717';
import type {
  BuffDefinition,
  TechniqueEffect,
} from '../../optimizer/gameTypes';

export function mechanics0719Scenarios() {
  return [
    emptyExpressionScenario(),
    successCaptureScenario(),
    ...liveProgressConditionScenarios(),
    ...stackEventScenarios(),
    ...buffGroupScenarios(),
    ...[
      { name: 'overdraft', stability: 1, cost: 10, gain: 0, tick: 7 },
      { name: 'overdraft-rescue', stability: 1, cost: 10, gain: 0, tick: 12 },
      { name: 'temporary-excess', stability: 58, cost: 0, gain: 5, tick: -5 },
      {
        name: 'fractional-cleanup',
        stability: 8,
        cost: 0,
        gain: 0,
        tick: 6.25,
      },
    ].map(({ name, stability, cost, gain, tick }) => {
      const definition: BuffDefinition = {
        name: 'Stability tick',
        canStack: true,
        effects: [{ kind: 'stability', amount: { value: tick } }],
      };
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: cost,
        effects: [{ kind: 'stability', amount: { value: gain } }],
      });
      return {
        name: `0719-${name}`,
        state: new CraftingState({
          qi: 100,
          stability,
          initialMaxStability: 60,
          buffs: new Map([
            [
              'stability_tick',
              { name: definition.name, stacks: 1, definition },
            ],
          ]),
        }),
        skill,
        config: retargetConfig(skill),
      };
    }),
  ];
}

export function emptyExpressionScenario() {
  const skill = retargetSkill({
    qiCost: 0,
    stabilityCost: 0,
    effects: [
      {
        kind: 'createBuff',
        buff: {
          name: 'Empty expression probe',
          canStack: true,
          effects: [],
          initialState: { empty: '' },
        },
        stacks: { value: 1 },
      },
    ],
  });
  return {
    name: '0719-empty-expression',
    state: new CraftingState({ qi: 100, stability: 50 }),
    skill,
    config: retargetConfig(skill),
  };
}

export function liveProgressConditionScenarios() {
  return [
    'payment',
    'earlier-stability',
    'boosted-stability',
    'completion',
    'perfection',
  ].map((edge) => {
    const bar =
      edge === 'completion' || edge === 'perfection' ? edge : 'stability';
    const earlier: TechniqueEffect[] =
      edge === 'payment'
        ? []
        : [
            {
              kind: bar,
              amount: {
                value:
                  edge === 'earlier-stability'
                    ? -15
                    : edge === 'boosted-stability'
                      ? 8
                      : 60,
              },
            },
          ];
    const condition = {
      kind: bar,
      mode:
        edge === 'payment' || edge === 'earlier-stability' ? 'less' : 'more',
      percentage: 50,
    } as const;
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: edge === 'payment' ? 15 : 0,
      preventsMaxStabilityDecay: true,
      effects: [
        ...earlier,
        { kind: 'completion', amount: { value: 7 }, condition },
        {
          kind: 'createBuff',
          buff: { name: 'Live gate', canStack: true, effects: [] },
          stacks: { value: 1 },
          condition,
        },
      ],
    });
    return {
      name: `0719-live-${edge}`,
      state: new CraftingState({
        qi: 100,
        stability: edge === 'boosted-stability' ? 20 : 40,
        initialMaxStability: 60,
        stabilityPenalty: 20,
        buffs:
          edge === 'boosted-stability'
            ? new Map([
                [
                  'stability_boost',
                  {
                    name: 'Stability boost',
                    stacks: 1,
                    definition: {
                      name: 'Stability boost',
                      effects: [],
                      stats: { stabilityBoost: { value: 100 } },
                    },
                  },
                ],
              ])
            : new Map(),
      }),
      skill,
      config: retargetConfig(skill, { maxCompletion: 900, maxPerfection: 900 }),
    };
  });
}

export function successCaptureScenario() {
  const token: BuffDefinition = {
    name: 'Capture token',
    canStack: true,
    effects: [],
  };
  const observer: BuffDefinition = {
    name: 'Capture observer',
    canStack: true,
    effects: [],
    triggeredEffects: [
      {
        trigger: 'stackLost.Capture token',
        effects: [
          {
            kind: 'createBuff',
            buff: {
              name: 'Setup certainty',
              canStack: true,
              effects: [],
              stats: { successChanceBonus: { value: 0.5 } },
            },
            stacks: { value: 1 },
          },
        ],
      },
    ],
  };
  const skill = retargetSkill({
    qiCost: 0,
    stabilityCost: 0,
    successChance: 0.5,
    buffCost: { buffName: 'capture_token', amount: 1 },
    effects: [{ kind: 'completion', amount: { value: 100 } }],
  });
  return {
    name: '0719-success-capture-after-loss',
    state: new CraftingState({
      qi: 100,
      stability: 50,
      buffs: new Map([
        ['capture_token', { name: token.name, stacks: 1, definition: token }],
        [
          'capture_observer',
          { name: observer.name, stacks: 1, definition: observer },
        ],
      ]),
    }),
    skill,
    config: retargetConfig(skill),
  };
}

export function buffGroupScenarios() {
  return [
    'all',
    'highest',
    'lowest',
    'negative',
    'source-scope',
    'random-single',
    'no-match',
  ].map((edge) => {
    const a: BuffDefinition = {
      name: 'Pill A',
      buffType: 'Pill',
      canStack: true,
      effects: [],
    };
    const b: BuffDefinition = {
      name: 'Pill B',
      buffType: 'Pill',
      canStack: true,
      maxStacks: 5,
      effects: [],
    };
    const c: BuffDefinition = {
      name: 'Pill C',
      buffType: 'Pill',
      canStack: false,
      effects: [],
    };
    const named: BuffDefinition = {
      name: 'Pill',
      buffType: 'Reagent',
      canStack: true,
      effects: [],
    };
    const wrongCase: BuffDefinition = {
      name: 'Not a pill',
      buffType: 'pill',
      canStack: true,
      effects: [],
    };
    const source: BuffDefinition = {
      name: 'Group source',
      canStack: true,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'stackGained.Pill A',
          effects: [
            {
              kind: 'setState',
              key: 'gained',
              value: { value: 1, eqn: 'amount' },
            },
          ],
        },
        {
          trigger: 'stackLost.Pill A',
          effects: [
            {
              kind: 'setState',
              key: 'lost',
              value: { value: 1, eqn: 'amount' },
            },
          ],
        },
      ],
    };
    const effect: TechniqueEffect & { kind: 'modifyBuffGroup' } = {
      kind: 'modifyBuffGroup' as const,
      group:
        edge === 'random-single'
          ? 'Pill A'
          : edge === 'no-match'
            ? 'PILL'
            : 'Pill',
      amount: { value: edge === 'negative' ? -9 : 3 },
      mode:
        edge === 'highest' || edge === 'lowest'
          ? edge
          : edge === 'random-single'
            ? ('random' as const)
            : undefined,
    };
    const skill = retargetSkill({
      qiCost: 25,
      stabilityCost: 5,
      type: 'support',
      effects: [effect],
    });
    if (edge === 'source-scope') {
      skill.effects = [];
      source.effects = [{ ...effect, amount: { value: 1, scaling: 'stacks' } }];
    }
    const buffs = new Map(
      [a, b, c, named, wrongCase, source].map((definition, index) => [
        definition.name.toLowerCase().replace(/ /g, '_'),
        {
          name: definition.name,
          stacks: [1, 4, 4, 2, 2, 3][index],
          definition,
        },
      ]),
    );
    return {
      name: `0719-group-${edge}`,
      state: new CraftingState({ qi: 100, stability: 50, buffs }),
      skill,
      config: retargetConfig(skill),
    };
  });
}

export function stackEventScenarios() {
  return [
    'capped',
    'nonstackable',
    'zero-cap',
    'negative-technique',
    'negative-buff',
    'expiry',
    'buff-cost',
    'recursive',
    'negate-zero',
  ].map((edge) => {
    const pressure: BuffDefinition = {
      name: 'Pressure',
      canStack: edge !== 'nonstackable',
      maxStacks: edge === 'zero-cap' ? 0 : 3,
      effects: [],
    };
    const observer: BuffDefinition = {
      name: 'Forge Compression observer',
      canStack: true,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'stackGained.Pressure',
          effects: [
            {
              kind: 'setState',
              key: 'gained',
              mode: 'add',
              value: { value: 1, eqn: 'amount' },
            },
          ],
        },
        {
          trigger: 'stackLost.Pressure',
          effects: [
            {
              kind: 'setState',
              key: 'lost',
              mode: 'add',
              value: { value: 1, eqn: 'amount' },
            },
            {
              kind: 'setState',
              key: 'lossCalls',
              mode: 'add',
              value: { value: 1 },
            },
          ],
        },
      ],
    };
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'createBuff', buff: pressure, stacks: { value: 5.9 } }],
    });
    const buffs = new Map([
      [
        'pressure',
        {
          name: pressure.name,
          stacks: edge === 'negate-zero' ? 0 : 3,
          definition: pressure,
        },
      ],
      ['observer', { name: observer.name, stacks: 1, definition: observer }],
    ]);
    if (edge === 'negative-technique') skill.effects![0].stacks = { value: -5 };
    if (edge === 'zero-cap') skill.effects![0].stacks = { value: 2 };
    if (['negative-buff', 'expiry', 'negate-zero'].includes(edge)) {
      skill.effects = [];
      pressure.effects =
        edge === 'negative-buff'
          ? [
              {
                kind: 'createBuff',
                buff: { ...pressure },
                stacks: { value: -5 },
              },
            ]
          : edge === 'expiry'
            ? [{ kind: 'addStack', stacks: { value: -1.9 } }]
            : [{ kind: 'negate' }];
    }
    if (edge === 'buff-cost') {
      skill.buffCost = { buffName: 'pressure', amount: 2 };
      skill.qiCost = 10;
      skill.effects = [];
      observer.triggeredEffects![1].effects.push({
        kind: 'createBuff',
        buff: {
          name: 'Payment discount',
          canStack: true,
          effects: [],
          stats: { qiCostReduction: { value: 50 } },
        },
        stacks: { value: 1 },
      });
      skill.masteryEntries = [
        {
          kind: 'effect',
          effects: [
            { kind: 'createBuff', buff: pressure, stacks: { value: 1 } },
          ],
        },
      ];
    }
    if (edge === 'recursive') {
      pressure.maxStacks = 0;
      pressure.triggeredEffects = [
        {
          trigger: 'stackGained.Pressure',
          effects: [
            { kind: 'createBuff', buff: { ...pressure }, stacks: { value: 1 } },
          ],
        },
      ];
      skill.effects![0].stacks = { value: 2 };
    }
    return {
      name: `0719-stack-${edge}`,
      state: new CraftingState({ qi: 100, stability: 50, buffs }),
      skill,
      config: retargetConfig(skill),
    };
  });
}
