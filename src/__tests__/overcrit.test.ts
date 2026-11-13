import {
  calculateExpectedCritMultiplier,
  type BuffDefinition,
} from '../optimizer/gameTypes';
import {
  CraftingState,
  buildScalingVariables,
  createStateFromGame,
} from '../optimizer/state';
import { applySkill, calculateSkillGains } from '../optimizer/skills';
import {
  serializeSearchInput,
  reviveSearchInput,
} from '../optimizer/searchBackend';
import {
  extractOvercritStats,
  extractTrackedBuffs,
} from '../modContent/craftStateExtraction';
import {
  buildStateSnapshot,
  reviveStateSnapshot,
} from '../modContent/replaySnapshot';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';
import { readEntityCritStatSignature } from '../modContent/craftStateSignature';
import {
  critCycle,
  critState,
  critWatcher,
  failedWatcher,
  held,
  momentum,
  overcritScenarios,
} from './fixtures/overcrit';

describe('0.7.20 exact crit expectation', () => {
  it.each([0, 50])('never crits at negative chance with overcrit=%s', (oc) => {
    expect(calculateExpectedCritMultiplier(-10, 200, oc)).toBe(1);
    expect(calculateExpectedCritMultiplier(-10, 200, oc)).toBe(1);
  });

  it.each([0, 0.25, 50, 90, 100, 125, 200])(
    'preserves the old formula byte-for-byte without overcrit at cc=%s',
    (cc) => {
      for (const cm of [100, 135, 150, 200]) {
        const p = Math.min(cc, 100) / 100;
        expect(calculateExpectedCritMultiplier(cc, cm, 0, 9, 100)).toBe(
          1 - p + p * ((cm + Math.max(0, cc - 100) * 3) / 100),
        );
      }
    },
  );

  it('weights floored chain thresholds by every preceding successful roll', () => {
    // cc=50: thresholds 25,12,6,3,1; E[u]=1+.25+.03+.0018+.000054+.00000054.
    expect(calculateExpectedCritMultiplier(50, 200, 50)).toBeCloseTo(
      1.78185454,
      12,
    );
    // cc=100: 50,25,12,6,3,1; growth doubles successive extra contributions.
    expect(calculateExpectedCritMultiplier(100, 200, 50, 0, 100)).toBeCloseTo(
      3.63528128,
      12,
    );
    expect(calculateExpectedCritMultiplier(0, 200, 99, 9, 100)).toBe(1);
    expect(calculateExpectedCritMultiplier(1, 200, 1)).toBe(1.01);
  });

  it('adds five multiplier points above 90 overcrit and respects cap bonus / nine-roll limit', () => {
    expect(calculateExpectedCritMultiplier(150, 150, 95, 0, 10)).toBeCloseTo(
      14.12904024199,
      12,
    );
    const expectation = (thresholds: number[]) => {
      let product = 1;
      return (
        1 +
        thresholds.reduce((sum, t) => {
          product *= t / 100;
          return sum + product;
        }, 0)
      );
    };
    const capped90 = expectation([90, 81, 72, 64, 57, 51, 45, 40, 36]);
    const capped95 = expectation([95, 90, 85, 80, 76, 72, 68, 64, 60]);
    const capped99 = expectation([99, 98, 97, 96, 95, 94, 93, 92, 91]);
    expect(calculateExpectedCritMultiplier(100, 200, 95)).toBeCloseTo(
      2.25 * capped90,
      12,
    );
    expect(calculateExpectedCritMultiplier(100, 200, 95, 5)).toBeCloseTo(
      2.25 * capped95,
      12,
    );
    expect(calculateExpectedCritMultiplier(150, 200, 200, 100)).toBeCloseTo(
      9 * capped99,
      12,
    );
    expect(calculateExpectedCritMultiplier(100, 200, 95, -5)).toBe(
      calculateExpectedCritMultiplier(100, 200, 95),
    );
  });

  it('preserves exact results across memo hits, all five inputs and bounded-cache turnover', () => {
    const inputs: Array<[number, number, number, number, number]> = [];
    for (const chance of [0, 0.25, 50, 100, 150])
      for (const multiplier of [100, 150, 200])
        for (const overcrit of [0, 25, 90, 95, 150])
          for (const cap of [-5, 0, 9])
            for (const growth of [-10, 0, 100])
              inputs.push([chance, multiplier, overcrit, cap, growth]);
    const reference = ([
      chance,
      multiplier,
      overcrit,
      capBonus,
      growth,
    ]: (typeof inputs)[number]) => {
      const p = Math.min(chance, 100) / 100;
      const c =
        (multiplier +
          Math.max(0, chance - 100) * 3 +
          Math.max(0, overcrit - 90) * 5) /
        100;
      let chain = 1;
      let probability = 1;
      let threshold = Math.min(chance, 100);
      if (overcrit > 0) {
        const cap = Math.min(
          overcrit,
          Math.min(99, 90 + Math.max(0, capBonus)),
        );
        for (let step = 0; step < 9; step++) {
          threshold = Math.floor((threshold * cap) / 100);
          if (threshold <= 0) break;
          probability *= Math.min(threshold, 100) / 100;
          chain += probability * (1 + growth / 100) ** step;
        }
      }
      return 1 - p + p * c * chain;
    };
    for (const input of [...inputs, ...inputs.reverse()]) {
      expect(calculateExpectedCritMultiplier(...input)).toBe(reference(input));
      expect(calculateExpectedCritMultiplier(...input)).toBe(reference(input));
    }
  });
});

describe('0.7.20 crit transition and trigger boundaries', () => {
  const multi = retargetSkill({
    effects: [
      { kind: 'completion', amount: { value: 100 } },
      { kind: 'perfection', amount: { value: 100 } },
      { kind: 'perfection', amount: { value: 100 } },
    ],
  });
  const transition = (state: CraftingState, skill = multi) =>
    applySkill(state, skill, retargetConfig(skill), [], 100, undefined, 100)!;

  it('prices a bar with a cycle created earlier in the technique and ticks it once', () => {
    const cycle: BuffDefinition = {
      ...critCycle,
      initialState: { actionsRemaining: '1' },
    };
    const result = transition(
      critState({ critChance: 70 }),
      retargetSkill({
        effects: [
          { kind: 'createBuff', buff: cycle, stacks: { value: 1 } },
          { kind: 'completion', amount: { value: 100 } },
        ],
      }),
    );
    expect(result.completion).toBe(220);
    expect(result.buffs.get('crit_cycle')?.internalState).toMatchObject({
      actionsRemaining: 5,
      critCycleReady: 1,
    });
  });

  it('does not tick a new cycle for a bar applied before its creation', () => {
    const cycle: BuffDefinition = {
      ...critCycle,
      initialState: { actionsRemaining: '1' },
    };
    const result = transition(
      critState({ critChance: 70 }),
      retargetSkill({
        effects: [
          { kind: 'completion', amount: { value: 100 } },
          { kind: 'createBuff', buff: cycle, stacks: { value: 1 } },
        ],
      }),
    );
    expect(result.completion).toBe(170);
    expect(result.buffs.get('crit_cycle')?.internalState).toEqual({
      actionsRemaining: 1,
    });
  });

  it('includes chain growth created before a technique bar', () => {
    const growth: BuffDefinition = {
      name: 'New growth',
      canStack: false,
      effects: [],
      overcritChainGrowth: 100,
    };
    const result = transition(
      critState({ critChance: 100, overcrit: 50 }),
      retargetSkill({
        effects: [
          { kind: 'createBuff', buff: growth, stacks: { value: 1 } },
          { kind: 'completion', amount: { value: 100 } },
        ],
      }),
    );
    expect(result.completion).toBe(
      Math.floor(100 * calculateExpectedCritMultiplier(100, 200, 50, 0, 100)),
    );
  });

  it('dispatches later buff gains to a new listener with live progress but not earlier costs', () => {
    const listener: BuffDefinition = {
      name: 'New listener',
      canStack: false,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'completionGained',
          effects: [
            { kind: 'perfection', amount: { value: 10 } },
            {
              kind: 'setState',
              key: 'received',
              value: { value: 1, eqn: 'amount' },
            },
            {
              kind: 'setState',
              key: 'percent',
              value: { value: 1, eqn: 'percentGained' },
            },
          ],
        },
        ...(['poolSpent', 'stabilitySpent'] as const).map((trigger) => ({
          trigger,
          effects: [
            {
              kind: 'setState' as const,
              key: trigger,
              value: { value: 1 },
            },
          ],
        })),
      ],
    };
    const payout: BuffDefinition = {
      name: 'Payout',
      canStack: false,
      effects: [{ kind: 'completion', amount: { value: 100 } }],
    };
    const result = transition(
      critState({ buffs: new Map([['payout', held(payout)]]) }),
      retargetSkill({
        effects: [
          { kind: 'completion', amount: { value: 100 } },
          { kind: 'createBuff', buff: listener, stacks: { value: 1 } },
        ],
      }),
    );
    expect(result.completion).toBe(200);
    expect(result.perfection).toBe(10);
    const internal = result.buffs.get('new_listener')?.internalState;
    expect(internal?.received).toBe(100);
    // setState Scaling floors values above ten, including this percentage.
    expect(internal?.percent).toBe(Math.floor(100 / 1.3));
    expect(internal?.poolSpent).toBeUndefined();
    expect(internal?.stabilitySpent).toBeUndefined();
  });

  it.each([
    'stacks',
    'creation',
    'removal',
    'internal state',
    'pool',
    'stability',
  ] as const)(
    'refreshes cached buff crit frames after changes to %s',
    (change) => {
      const mutator: BuffDefinition = {
        name: 'Mutator',
        canStack: true,
        effects: [],
      };
      const provider: BuffDefinition = {
        name: 'Provider',
        canStack: false,
        effects: [],
      };
      const literal: BuffDefinition = {
        name: 'Added crit',
        canStack: false,
        effects: [],
        stats: { critmultiplier: { value: 50 } },
      };
      let expected = 0;
      switch (change) {
        case 'stacks':
          mutator.stats = {
            critmultiplier: {
              value: 50,
              scaling: 'stacks',
              max: { value: 100 },
            },
          };
          mutator.effects = [{ kind: 'addStack', stacks: { value: 1 } }];
          expected = 300;
          break;
        case 'creation':
          mutator.effects = [
            { kind: 'createBuff', buff: literal, stacks: { value: 1 } },
          ];
          expected = 250;
          break;
        case 'removal':
          mutator.stats = literal.stats;
          mutator.effects = [{ kind: 'negate' }];
          expected = 200;
          break;
        case 'internal state':
          mutator.stats = { critmultiplier: { value: 50, scaling: 'charge' } };
          mutator.effects = [
            { kind: 'setState', key: 'charge', value: { value: 2 } },
          ];
          expected = 300;
          break;
        case 'pool':
          provider.stats = { critmultiplier: { value: 1, scaling: 'pool' } };
          mutator.effects = [{ kind: 'pool', amount: { value: -50 } }];
          expected = 250;
          break;
        case 'stability':
          provider.stats = {
            critmultiplier: { value: 1, scaling: 'stability' },
          };
          mutator.effects = [{ kind: 'stability', amount: { value: 10 } }];
          expected = 260;
          break;
      }
      const prime: BuffDefinition = {
        name: 'Prime',
        canStack: false,
        effects: [{ kind: 'completion', amount: { value: 10 } }],
      };
      const consumer: BuffDefinition = {
        name: 'Consumer',
        canStack: false,
        effects: [{ kind: 'perfection', amount: { value: 100 } }],
      };
      const state = critState({
        critChance: 100,
        buffs: new Map([
          ['prime', held(prime)],
          ['mutator', held(mutator, { charge: 1 })],
          ['provider', held(provider)],
          ['consumer', held(consumer)],
        ]),
      });
      expect(
        transition(
          state,
          retargetSkill({ qiCost: 0, stabilityCost: 0, effects: [] }),
        ).perfection,
      ).toBe(expected);
    },
  );

  it('starts dispatching a listener created during an initially listener-free action', () => {
    const listener: BuffDefinition = {
      name: 'New listener',
      canStack: false,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'actionResolved',
          effects: [{ kind: 'setState', key: 'seen', value: { value: 1 } }],
        },
      ],
    };
    const result = transition(
      critState(),
      retargetSkill({
        effects: [{ kind: 'createBuff', buff: listener, stacks: { value: 1 } }],
      }),
    );
    expect(result.buffs.get('new_listener')?.internalState?.seen).toBe(1);
  });

  it('folds base/buff crit stats and positive-held chain growth', () => {
    const buff: BuffDefinition = {
      name: 'Overcrit',
      canStack: false,
      effects: [],
      stats: {
        overcrit: { value: 50 },
        overcritCapBonus: { value: 5 },
        refinementCritChance: { value: 50 },
      },
      overcritChainGrowth: 50,
    };
    const state = critState({
      refinementCritChance: 50,
      buffs: new Map([
        ['overcrit_buff', held(buff)],
        [
          'growth',
          held({
            name: 'Growth',
            canStack: false,
            effects: [],
            overcritChainGrowth: 50,
          }),
        ],
        [
          'inactive_growth',
          held(
            {
              name: 'Inactive growth',
              canStack: false,
              effects: [],
              overcritChainGrowth: 9999,
            },
            undefined,
            0,
          ),
        ],
      ]),
    });
    const factor = calculateExpectedCritMultiplier(100, 200, 50, 5, 100);
    expect(transition(state).completion).toBe(Math.floor(100 * factor));
    expect(
      calculateSkillGains(state, multi, retargetConfig(multi)).completion,
    ).toBe(Math.floor(100 * factor));
    expect(transition(state, { ...multi, type: 'fusion' }).completion).toBe(
      100,
    );
  });

  it('applies refinement chance after masteries, never to payment or buff frames', () => {
    const skill = retargetSkill({
      ...multi,
      type: 'refine',
      masteryEntries: [{ kind: 'critchance', percentage: 20 }],
      qiCost: 0,
      effects: [{ kind: 'perfection', amount: { value: 100 } }],
    });
    const buff: BuffDefinition = {
      name: 'Payment',
      canStack: false,
      effects: [{ kind: 'completion', amount: { value: 100 } }],
      stats: { poolCostFlat: { value: 1, eqn: 'critchance' } },
    };
    const state = critState({
      critChance: 10,
      refinementCritChance: 70,
      buffs: new Map([['payment', held(buff)]]),
    });
    const result = transition(state, skill);
    expect(result.qi).toBe(90);
    expect(result.perfection).toBe(200);
    // Ordinary buffs use the entity frame, with neither mastery nor refinement.
    expect(result.completion).toBe(
      100 * calculateExpectedCritMultiplier(10, 200),
    );
  });

  it('uses plain live entity crit stats for ordinary buffs and crafting triggers, without ticking a cycle', () => {
    const payout: BuffDefinition = {
      name: 'Payout',
      canStack: false,
      effects: [{ kind: 'completion', amount: { value: 100 } }],
      triggeredEffects: [
        {
          trigger: 'actionResolved',
          effects: [{ kind: 'perfection', amount: { value: 100 } }],
        },
      ],
    };
    const state = critState({
      critChance: 10,
      overcrit: 50,
      refinementCritChance: 80,
      buffs: new Map([
        ['payout', held(payout)],
        ['cycle', held(critCycle, { actionsRemaining: 1 })],
      ]),
    });
    const skill = retargetSkill({
      masteryEntries: [
        { kind: 'critchance', percentage: 10 },
        { kind: 'critmultiplier', percentage: 100 },
      ],
    });
    const result = transition(state, skill);
    const expected = 100 * calculateExpectedCritMultiplier(10, 200, 50);
    expect(result.completion).toBe(expected);
    expect(result.perfection).toBe(expected);
    expect(result.buffs.get('cycle')?.internalState).toEqual({
      actionsRemaining: 1,
    });
  });

  it('refreshes plain buff crit stats after preceding buff mutations', () => {
    const bonus: BuffDefinition = {
      name: 'Bonus crit',
      canStack: false,
      effects: [],
      stats: { critchance: { value: 100 } },
    };
    const creator: BuffDefinition = {
      name: 'Creator',
      canStack: false,
      effects: [{ kind: 'createBuff', buff: bonus }],
    };
    const payout: BuffDefinition = {
      name: 'Payout',
      canStack: false,
      effects: [{ kind: 'perfection', amount: { value: 100 } }],
    };
    const result = transition(
      critState({
        buffs: new Map([
          ['creator', held(creator)],
          ['payout', held(payout)],
        ]),
      }),
      retargetSkill(),
    );
    expect(result.perfection).toBe(200);
  });

  it('inherits technique crit stats and action id in interceptor effects, but not from an ordinary buff caller', () => {
    const interceptor: BuffDefinition = {
      name: 'Interceptor',
      canStack: false,
      effects: [],
      craftingEffectInterceptors: [
        {
          scope: 'resource',
          appliesTo: ['stability'],
          modifier: { kind: 'multiply', value: 1 },
          effects: [{ kind: 'perfection', amount: { value: 100 } }],
        },
      ],
    };
    const state = critState({
      critChance: 50,
      refinementCritChance: 10,
      buffs: new Map([
        ['interceptor', held(interceptor)],
        ['cycle', held(critCycle, { actionsRemaining: 1 })],
      ]),
    });
    const skill = retargetSkill({
      stabilityCost: 0,
      masteryEntries: [{ kind: 'critchance', percentage: 10 }],
      effects: [{ kind: 'stability', amount: { value: 1 } }],
    });
    const result = transition(state, skill);
    expect(result.perfection).toBeCloseTo(
      100 * calculateExpectedCritMultiplier(100, 200, 10),
    );
    expect(result.buffs.get('cycle')?.internalState?.actionsRemaining).toBe(5);
    const payout: BuffDefinition = {
      name: 'Payout',
      canStack: false,
      effects: [{ kind: 'stability', amount: { value: 1 } }],
    };
    const plain = transition(
      state.copy({
        buffs: new Map([
          ...Array.from(state.buffs.entries()),
          ['payout', held(payout)],
        ]),
      }),
      { ...skill, effects: [] },
    );
    expect(plain.perfection).toBe(150);
    expect(plain.buffs.get('cycle')?.internalState).toEqual({
      actionsRemaining: 1,
    });
    const payment = transition(state, {
      ...skill,
      effects: [],
      stabilityCost: 1,
    });
    expect(payment.perfection).toBeCloseTo(
      100 * calculateExpectedCritMultiplier(80, 200, 10),
    );
    expect(payment.buffs.get('cycle')?.internalState?.actionsRemaining).toBe(5);
  });

  it('does not add refinement chance to effect-mastery frames', () => {
    const skill = retargetSkill({
      masteryEntries: [
        {
          kind: 'effect',
          effects: [{ kind: 'completion', amount: { value: 100 } }],
        },
      ],
      effects: [{ kind: 'perfection', amount: { value: 100 } }],
    });
    const result = transition(critState({ refinementCritChance: 100 }), skill);
    expect(result.completion).toBe(100);
    expect(result.perfection).toBe(200);
  });

  it.each(['refinement', 'cycle'] as const)(
    'normalizes mastery listeners using the current %s frame and action id',
    (kind) => {
      const listener: BuffDefinition = {
        name: 'Listener',
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
      const cycle: BuffDefinition = {
        ...critCycle,
        critCycle: { interval: 3, critchance: 100, overcrit: 0 },
      };
      const state = critState({
        refinementCritChance: kind === 'refinement' ? 100 : 0,
        buffs: new Map([
          ['listener', held(listener)],
          ['watcher', held(critWatcher)],
          ...(kind === 'cycle'
            ? [['cycle', held(cycle, { actionsRemaining: 1 })] as const]
            : []),
        ]),
      });
      const mastery = {
        kind: 'effect' as const,
        effects: [{ kind: 'completion' as const, amount: { value: 100 } }],
      };
      const skill = retargetSkill({
        masteryEntries: [mastery, mastery],
        effects: [],
      });
      const result = transition(state, skill);
      expect(result.completion).toBe(kind === 'cycle' ? 400 : 200);
      expect(result.buffs.get('listener')?.internalState?.received).toBe(
        result.completion,
      );
    },
  );

  it.each(['ordinary', 'triggered', 'interceptor'] as const)(
    'overlays a cycle owner stored action id in %s effects, as E4i does',
    (kind) => {
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
      const state = critState({
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
      });
      const skill = retargetSkill({
        stabilityCost: 0,
        effects:
          kind === 'interceptor'
            ? [{ kind: 'stability', amount: { value: 1 } }]
            : [],
      });
      const result = transition(state, skill);
      expect(result.perfection).toBe(200);
      expect(result.buffs.get('owner')?.internalState).toMatchObject({
        actionsRemaining: 5,
        critActionId: kind === 'interceptor' ? 9 : 7,
        critCycleReady: 1,
      });
    },
  );

  it.each(['triggered', 'interceptor'] as const)(
    'omits buff/interceptor crit in non-EV %s previews',
    (kind) => {
      const bar = { kind: 'perfection' as const, amount: { value: 100 } };
      const owner: BuffDefinition = {
        name: 'Owner',
        canStack: false,
        effects: [],
        triggeredEffects:
          kind === 'triggered'
            ? [{ trigger: 'completionGained', effects: [bar] }]
            : [],
        craftingEffectInterceptors: [
          {
            scope: 'resource',
            appliesTo: ['stability'],
            modifier: { kind: 'multiply', value: 1 },
            effects: kind === 'interceptor' ? [bar] : [],
          },
        ],
      };
      const state = critState({
        critChance: 100,
        buffs: new Map([['owner', held(owner)]]),
      });
      const skill = retargetSkill({
        stabilityCost: 0,
        effects: [
          {
            kind: kind === 'triggered' ? 'completion' : 'stability',
            amount: { value: 1 },
          },
        ],
      });
      expect(
        calculateSkillGains(state, skill, retargetConfig(skill)).perfection,
      ).toBe(200);
      expect(
        calculateSkillGains(state, skill, retargetConfig(skill), [], {
          includeExpectedValue: false,
        }).perfection,
      ).toBe(100);
    },
  );

  it('ticks a cycle once on first positive application and reuses the ready bonus on every bar', () => {
    const state = critState({
      critChance: 70,
      buffs: new Map([['cycle', held(critCycle, { actionsRemaining: 1 })]]),
    });
    const result = transition(state);
    // Ready: cc=100, oc=10, thresholds 10,1; factor 2*(1+.1+.001).
    expect(result.completion).toBe(220);
    expect(result.perfection).toBe(440);
    expect(result.buffs.get('cycle')?.internalState).toMatchObject({
      actionsRemaining: 5,
      critCycleReady: 1,
    });
    expect(state.buffs.get('cycle')?.internalState).toEqual({
      actionsRemaining: 1,
    });
    expect(
      calculateSkillGains(state, multi, retargetConfig(multi)).completion,
    ).toBe(220);
    expect(transition(result).buffs.get('cycle')?.internalState).toMatchObject({
      actionsRemaining: 4,
      critCycleReady: 0,
    });
  });

  it('shares a cycle id with effect masteries', () => {
    const state = critState({
      critChance: 70,
      buffs: new Map([['cycle', held(critCycle, { actionsRemaining: 1 })]]),
    });
    const result = transition(state, {
      ...multi,
      masteryEntries: [
        {
          kind: 'effect',
          effects: [{ kind: 'completion', amount: { value: 100 } }],
        },
      ],
    });
    expect(result.completion).toBe(440);
    expect(result.perfection).toBe(440);
    expect(result.buffs.get('cycle')?.internalState?.actionsRemaining).toBe(5);
  });

  it('ticks for positive expected applications, but not failure, nonpositive bars, or items', () => {
    const state = critState({
      critChance: 70,
      buffs: new Map([['cycle', held(critCycle, { actionsRemaining: 2 })]]),
    });
    expect(
      transition(state, { ...multi, successChance: 0.5 }).buffs.get('cycle')
        ?.internalState?.actionsRemaining,
    ).toBe(1);
    for (const skill of [
      { ...multi, successChance: 0 },
      retargetSkill({
        effects: [
          { kind: 'completion' as const, amount: { value: -10 } },
          { kind: 'perfection' as const, amount: { value: 0 } },
        ],
      }),
    ])
      expect(
        transition(state, skill).buffs.get('cycle')?.internalState,
      ).toEqual({ actionsRemaining: 2 });
    const item = {
      ...multi,
      actionKind: 'item' as const,
      itemName: 'crit_pill',
      key: 'crit_pill',
      consumesTurn: false,
    };
    const itemResult = transition(
      state.copy({ items: new Map([['crit_pill', 1]]) }),
      item,
    );
    expect(itemResult.buffs.get('cycle')?.internalState).toEqual({
      actionsRemaining: 2,
    });
    expect(itemResult.completion).toBe(170);
  });

  it('dispatches actionResolved once with arbitrary numeric payload, before the next action stat fold', () => {
    const state = critState({
      buffs: new Map([['momentum', held(momentum, { momentum: 2 })]]),
    });
    const skill = {
      ...multi,
      successChance: 0.5,
      masteryEntries: [
        {
          kind: 'effect' as const,
          effects: [{ kind: 'pool', amount: { value: 1 } }],
        },
      ],
    };
    const result = transition(state, skill);
    expect(result.buffs.get('momentum')?.internalState?.momentum).toBe(2.5);
    expect(
      transition(result, { ...multi, type: 'fusion' }).buffs.get('momentum')
        ?.internalState?.momentum,
    ).toBe(1.25);
    const control = {
      ...multi,
      effects: [
        { kind: 'perfection' as const, amount: { value: 10, stat: 'control' } },
      ],
    };
    expect(transition(result, control).perfection - result.perfection).toBe(
      125,
    );
  });

  it('fires actionFailed only on certain failure, followed by actionResolved', () => {
    const watcher: BuffDefinition = {
      ...failedWatcher,
      triggeredEffects: [
        ...failedWatcher.triggeredEffects!,
        {
          trigger: 'actionResolved',
          effects: [
            {
              kind: 'setState',
              key: 'seen',
              value: { value: 1, eqn: 'succeeded' },
            },
          ],
        },
      ],
    };
    const state = critState({ buffs: new Map([['watcher', held(watcher)]]) });
    expect(
      transition(state, { ...multi, successChance: 0 }).getBuffStacks(
        "fate's_favor",
      ),
    ).toBe(1);
    expect(
      transition(state, { ...multi, successChance: 0.5 }).getBuffStacks(
        "fate's_favor",
      ),
    ).toBe(0);
    expect(transition(state).getBuffStacks("fate's_favor")).toBe(0);
  });

  it('fires crit once per certain critting application with the boosted amount, not for uncertain branches', () => {
    const boost: BuffDefinition = {
      name: 'Boost',
      canStack: false,
      effects: [],
      stats: { completionBoost: { value: 50 } },
    };
    const state = critState({
      critChance: 100,
      buffs: new Map([
        ['watcher', held(critWatcher)],
        ['boost', held(boost)],
      ]),
    });
    const skill = {
      ...multi,
      effects: [{ kind: 'completion' as const, amount: { value: 10 } }],
    };
    const watched = transition(state, skill).buffs.get(
      'watcher',
    )?.internalState;
    expect(watched).toMatchObject({ crits: 1, amount: 30, percent: 30 });
    expect(transition(state).buffs.get('watcher')?.internalState?.crits).toBe(
      3,
    );
    expect(
      transition(state.copy({ critChance: 99 }), skill).buffs.get('watcher')
        ?.internalState,
    ).toBeUndefined();
    expect(
      transition(state, { ...skill, successChance: 0.5 }).buffs.get('watcher')
        ?.internalState,
    ).toBeUndefined();
    expect(
      transition(state, {
        ...skill,
        effects: [
          {
            ...skill.effects[0],
            condition: { kind: 'chance', percentage: 50 },
          },
        ],
      }).buffs.get('watcher')?.internalState,
    ).toBeUndefined();
  });

  it('dispatches crit for certain ordinary and nested buff bar applications with a re-entry guard', () => {
    const watcher: BuffDefinition = {
      ...critWatcher,
      triggeredEffects: [
        {
          trigger: 'crit',
          effects: [
            {
              kind: 'setState',
              key: 'crits',
              mode: 'add',
              value: { value: 1 },
            },
            { kind: 'completion', amount: { value: 5 } },
          ],
        },
      ],
    };
    const payout: BuffDefinition = {
      name: 'Payout',
      canStack: false,
      effects: [{ kind: 'perfection', amount: { value: 10 } }],
    };
    const state = critState({
      critChance: 100,
      overcrit: 10,
      buffs: new Map([
        ['watcher', held(watcher)],
        ['payout', held(payout)],
      ]),
    });
    const result = transition(state, retargetSkill());
    expect(result.buffs.get('watcher')?.internalState?.crits).toBe(1);
    expect(result.perfection).toBe(22.02);
    expect(result.completion).toBeCloseTo(11.01);
  });

  it.each(overcritScenarios())(
    'keeps preview input immutable: $name',
    ({ state, skill, config }) => {
      const before = buildStateSnapshot(state, 'missing');
      calculateSkillGains(state, skill, config);
      expect(buildStateSnapshot(state, 'missing')).toEqual(before);
    },
  );
});

describe('crit state extraction, replay, worker and cache boundaries', () => {
  it('detects each stat-only live update with the signature shared by Redux, polling and processed revisions', () => {
    const before = {
      stats: { overcrit: 0, overcritCapBonus: 0, refinementCritChance: 0 },
    };
    expect(readEntityCritStatSignature(before)).toBe(
      readEntityCritStatSignature(undefined),
    );
    for (const field of [
      'overcrit',
      'overcritCapBonus',
      'refinementCritChance',
    ]) {
      expect(
        readEntityCritStatSignature({ stats: { ...before.stats, [field]: 1 } }),
      ).not.toBe(readEntityCritStatSignature(before));
    }
  });
  it('extracts base stats, preserving full buff definitions and numeric cycle state', () => {
    expect(extractOvercritStats(undefined)).toEqual({
      overcrit: 0,
      overcritCapBonus: 0,
      refinementCritChance: 0,
    });
    const stats = extractOvercritStats({
      overcrit: 95,
      overcritCapBonus: 5,
      refinementCritChance: 20,
    });
    expect(stats).toEqual({
      overcrit: 95,
      overcritCapBonus: 5,
      refinementCritChance: 20,
    });
    const state = createStateFromGame({
      ...stats,
      pool: 100,
      stability: 50,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    expect(buildScalingVariables(state, 10, 10, 100)).toMatchObject(stats);
    const buffs = extractTrackedBuffs([
      {
        name: critCycle.name,
        canStack: false,
        icon: '',
        displayLocation: 'none',
        stats: undefined,
        effects: [],
        critCycle: critCycle.critCycle,
        stacks: 1,
        internalState: { actionsRemaining: 2 },
      },
    ]);
    expect(buffs.get('crit_cycle')).toMatchObject({
      definition: { critCycle: critCycle.critCycle },
      internalState: { actionsRemaining: 2 },
    });
  });

  it('round-trips new stats and revives absent old replay fields as zero', () => {
    const state = critState({
      overcrit: 95,
      overcritCapBonus: 5,
      refinementCritChance: 20,
    });
    const snapshot = buildStateSnapshot(state, 'missing');
    expect(reviveStateSnapshot(snapshot)).toEqual(state);
    const skill = retargetSkill();
    const wire = serializeSearchInput({
      state,
      config: retargetConfig(skill),
      targetCompletion: 100,
      targetPerfection: 100,
      currentCondition: 'neutral',
      forecast: [],
      lookaheadDepth: 2,
      searchConfig: {},
    });
    expect(reviveSearchInput(wire).state).toEqual(state);
    delete snapshot.overcrit;
    delete snapshot.overcritCapBonus;
    delete snapshot.refinementCritChance;
    expect(reviveStateSnapshot(snapshot)).toMatchObject({
      overcrit: 0,
      overcritCapBonus: 0,
      refinementCritChance: 0,
    });
    expect(state.copy()).toEqual(state);
  });

  it('keeps zero-stat keys identical and distinguishes base stats and countdown branches', () => {
    const state = critState();
    expect(state.getCacheKey()).toBe(
      state
        .copy({ overcrit: 0, overcritCapBonus: 0, refinementCritChance: 0 })
        .getCacheKey(),
    );
    for (const fields of [
      { overcrit: 1 },
      { overcritCapBonus: 1 },
      { refinementCritChance: 1 },
    ])
      expect(state.copy(fields).getCacheKey()).not.toBe(state.getCacheKey());
    expect(
      state
        .copy({
          buffs: new Map([['cycle', held(critCycle, { actionsRemaining: 1 })]]),
        })
        .getCacheKey(),
    ).not.toBe(
      state
        .copy({
          buffs: new Map([['cycle', held(critCycle, { actionsRemaining: 2 })]]),
        })
        .getCacheKey(),
    );
  });
});
