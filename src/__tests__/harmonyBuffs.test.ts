import { CraftingState, type TrackedBuff } from '../optimizer/state';
import type {
  BuffDefinition,
  HarmonyType,
  HarmonyData,
} from '../optimizer/gameTypes';
import {
  getHarmonyStatModifiers,
  processHarmonyEffect,
  type HarmonyStatModifiers,
} from '../optimizer/harmony';
import {
  applySkill,
  calculateEffectiveActionCosts,
  calculateSkillGains,
} from '../optimizer/skills';
import { hydrateHarmonyData } from '../modContent/harmonyState';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

function liveBuff(
  name: string,
  stats: BuffDefinition['stats'],
  stacks = 1,
): TrackedBuff {
  return {
    name,
    stacks,
    definition: { name, canStack: false, effects: [], stats },
  };
}

const bothBars = retargetSkill({
  qiCost: 0,
  stabilityCost: 0,
  effects: [
    { kind: 'completion', amount: { value: 1, stat: 'intensity' } },
    { kind: 'perfection', amount: { value: 1, stat: 'control' } },
  ],
});

function configFor(craftingType: HarmonyType) {
  return retargetConfig(bothBars, {
    baseControl: 100,
    baseIntensity: 100,
    isSublimeCraft: true,
    craftingType,
  });
}

describe('harmony-owned live buffs', () => {
  it.each(['resonance', 'eccentricDecree'] as const)(
    'models %s once and omits its buff from future count reads',
    (type) => {
      const data: HarmonyData =
        type === 'resonance'
          ? {
              recommendedTechniqueTypes: [],
              resonance: { resonance: 'refine', strength: 3, pendingCount: 0 },
            }
          : {
              recommendedTechniqueTypes: [],
              eccentricDecree: {
                focusedBar: 'completion',
                lastCompletion: 0,
                lastPerfection: 0,
              },
            };
      const buff =
        type === 'resonance'
          ? liveBuff(
              'Resonance',
              {
                critchance: { value: 3, scaling: 'stacks' },
                successChanceBonus: { value: 0.03, scaling: 'stacks' },
              },
              3,
            )
          : liveBuff('Decree Focus', {
              intensity: { value: 0.5, stat: 'intensity' },
            });
      const key = type === 'resonance' ? 'resonance' : 'decree_focus';
      const bare = new CraftingState({
        qi: 100,
        stability: 50,
        harmonyData: data,
        critMultiplier: 200,
      });
      const state = bare.copy({ buffs: new Map([[key, buff]]) });
      const heldBuff = state.buffs.get(key);
      const config = configFor(type);
      expect(calculateSkillGains(state, bothBars, config)).toEqual(
        calculateSkillGains(bare, bothBars, config),
      );
      const next = applySkill(state, bothBars, config)!;
      expect(next).toEqual(applySkill(bare, bothBars, config));
      expect(next.buffs.has(key)).toBe(false);
      expect(state.buffs.get(key)).toBe(heldBuff);
      expect(state.buffs.get(key)).toEqual(buff);

      const countSkill = retargetSkill({
        qiCost: 0,
        stabilityCost: 0,
        effects: [{ kind: 'completion', amount: { value: 1, eqn: key } }],
      });
      expect(calculateSkillGains(state, countSkill, config).completion).toBe(0);
    },
  );

  it('counts Resonance crit chance once in buff bar crits', () => {
    const payout: BuffDefinition = {
      name: 'Payout',
      canStack: false,
      effects: [{ kind: 'completion', amount: { value: 100 } }],
    };
    const bare = new CraftingState({
      qi: 100,
      stability: 50,
      critChance: 10,
      critMultiplier: 200,
      harmonyData: {
        recommendedTechniqueTypes: [],
        resonance: { resonance: 'refine', strength: 3, pendingCount: 0 },
      },
      buffs: new Map([
        ['payout', { name: 'Payout', stacks: 1, definition: payout }],
      ]),
    });
    const resonance = liveBuff(
      'Resonance',
      {
        critchance: { value: 3, scaling: 'stacks' },
        successChanceBonus: { value: 0.03, scaling: 'stacks' },
      },
      3,
    );
    const state = bare.copy({
      buffs: new Map([...Array.from(bare.buffs), ['resonance', resonance]]),
    });
    const config = configFor('resonance');
    const withBuff = applySkill(state, bothBars, config)!;
    const modelled = applySkill(bare, bothBars, config)!;
    expect(withBuff.completion).toBe(modelled.completion);
    // Technique and payout both crit at 10 base + 9 Resonance (3 x 3 stacks)
    // chance, doubling: 2 x 100 x (1 + 0.19). A double count would give 0.28.
    expect(modelled.completion).toBeCloseTo(238, 9);
  });

  it.each(['resonance', 'eccentricDecree', 'alchemical'] as const)(
    'keeps the live %s buff without its replacing model',
    (type) => {
      const names = {
        resonance: 'Resonance',
        eccentricDecree: 'Decree Focus',
        alchemical: 'Reaction',
      };
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        buffs: new Map([
          [
            'live',
            liveBuff(names[type], {
              control: { value: 0.25, stat: 'control' },
            }),
          ],
        ]),
      });
      const config = configFor(type);
      expect(calculateSkillGains(state, bothBars, config).perfection).toBe(125);
      const unrelated = state.copy({
        harmonyData: { recommendedTechniqueTypes: [], forgeWorks: { heat: 1 } },
      });
      expect(calculateSkillGains(unrelated, bothBars, config).perfection).toBe(
        125,
      );
    },
  );

  it('adds harmony and ordinary buffs against base stats before conditions without mutating cached frames', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      harmonyData: { recommendedTechniqueTypes: [], forgeWorks: { heat: 5 } },
      buffs: new Map([
        [
          'ordinary',
          liveBuff('Ordinary', {
            control: { value: 0.2, stat: 'control' },
            intensity: { value: 0.2, stat: 'intensity' },
          }),
        ],
        [
          'heat_(perfect)',
          liveBuff('Heat (Perfect)', {
            control: { value: 0.5, stat: 'control' },
            intensity: { value: 0.5, stat: 'intensity' },
          }),
        ],
      ]),
    });
    const config = configFor('forge');
    for (let repeat = 0; repeat < 2; repeat++) {
      const neutral = calculateSkillGains(state, bothBars, config);
      expect(neutral.completion).toBe(170);
      expect(neutral.perfection).toBe(170);
      const conditioned = calculateSkillGains(state, bothBars, config, [
        { kind: 'control', multiplier: 0.5 },
        { kind: 'intensity', multiplier: 0.5 },
      ]);
      expect(conditioned.completion).toBe(255);
      expect(conditioned.perfection).toBe(255);
    }
  });

  it('strips a derived buff even when unrelated missing definitions have no lookup', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      harmonyData: {
        recommendedTechniqueTypes: [],
        eccentricDecree: {
          focusedBar: 'completion',
          lastCompletion: 0,
          lastPerfection: 0,
        },
      },
      buffs: new Map([
        [
          'decree_focus',
          liveBuff('Decree Focus', {
            intensity: { value: 0.5, stat: 'intensity' },
          }),
        ],
        ['unknown', { name: 'Unknown', stacks: 1 }],
      ]),
    });
    expect(
      calculateSkillGains(state, bothBars, configFor('eccentricDecree'))
        .completion,
    ).toBe(150);
  });

  it('replaces a stale root Reaction after a simulated reaction', () => {
    const buff = liveBuff('Reaction', {
      control: { value: -0.25, stat: 'control' },
    });
    const buffs = new Map([['reaction', buff]]);
    const root = hydrateHarmonyData({
      isSublimeCraft: true,
      craftingType: 'alchemical',
      buffs,
      progressHarmonyData: {
        recommendedTechniqueTypes: ['refine'],
        alchemicalArts: { charges: ['refine', 'support'], lastCombo: [] },
      },
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      buffs,
      harmonyData: root.harmonyData,
    });
    const heldBuff = state.buffs.get('reaction');
    const config = configFor('alchemical');
    expect(calculateSkillGains(state, bothBars, config).perfection).toBe(75);
    const next = applySkill(state, bothBars, config)!;
    expect(next.buffs.has('reaction')).toBe(false);
    expect(
      next.harmonyData?.additionalData?.alchemicalReactionModifiers,
    ).toEqual({ qiCostReduction: 25 });
    expect(calculateSkillGains(next, bothBars, config).perfection).toBe(100);
    expect(state.buffs.get('reaction')).toBe(heldBuff);
    expect(state.buffs.get('reaction')).toEqual(buff);
  });
});

const COST_REACTIONS = [
  {
    reduction: 'qiCostReduction',
    cost: 'qiCost',
    legacy: 'poolCostPercentage',
    charges: ['refine', 'support'],
  },
  {
    reduction: 'stabilityCostReduction',
    cost: 'stabilityCost',
    legacy: 'stabilityCostPercentage',
    charges: ['fusion', 'support'],
  },
] as const;

function simulatedCostReaction(
  charges: readonly ('fusion' | 'refine' | 'support')[],
): HarmonyData {
  return processHarmonyEffect(
    {
      recommendedTechniqueTypes: [],
      alchemicalArts: { charges: [...charges], lastCombo: [] },
    },
    'alchemical',
    'refine',
  ).harmonyData;
}

describe('Reaction cost reduction channels', () => {
  const paymentCases = COST_REACTIONS.flatMap((reaction) =>
    (['state', 'buff'] as const).flatMap((source) =>
      [
        { baseCost: 2, expectedCost: 1 },
        { baseCost: 7, expectedCost: 4 },
      ].map((payment) => ({ ...reaction, source, ...payment })),
    ),
  );

  it.each(paymentCases)(
    'folds $reduction from $source before the single floor for cost $baseCost',
    ({ reduction, cost, charges, source, baseCost, expectedCost }) => {
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        harmonyData: simulatedCostReaction(charges),
        ...(source === 'state'
          ? { [reduction]: 20 }
          : {
              buffs: new Map([
                [
                  'ordinary',
                  liveBuff('Ordinary', { [reduction]: { value: 20 } }),
                ],
              ]),
            }),
      });
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 0,
        [cost]: baseCost,
      });
      const config = configFor('alchemical');
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(
          calculateEffectiveActionCosts(state, skill, 0, [], config)[cost],
        ).toBe(expectedCost);
        const next = applySkill(state, skill, config)!;
        expect(
          cost === 'qiCost'
            ? state.qi - next.qi
            : state.stability - next.stability,
        ).toBe(expectedCost);
      }
    },
  );

  it.each(['technique', 'buff'] as const)(
    'reduces a negative stability %s effect of -8 to -6',
    (source) => {
      const effect = { kind: 'stability', amount: { value: -8 } } as const;
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        harmonyData: simulatedCostReaction(['fusion', 'support']),
        buffs:
          source === 'buff'
            ? new Map([
                [
                  'loss',
                  {
                    name: 'Loss',
                    stacks: 1,
                    definition: {
                      name: 'Loss',
                      canStack: false,
                      effects: [effect],
                    },
                  },
                ],
              ])
            : new Map(),
      });
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 0,
        effects: source === 'technique' ? [effect] : [],
      });
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(
          applySkill(state, skill, configFor('alchemical'))!.stability,
        ).toBe(44);
      }
    },
  );

  it.each(COST_REACTIONS)(
    'prices hydrated and simulated $reduction reactions identically',
    ({ reduction, cost, charges }) => {
      const buffs = new Map([
        ['reaction', liveBuff('Reaction', { [reduction]: { value: 25 } })],
        ['ordinary', liveBuff('Ordinary', { [reduction]: { value: 20 } })],
      ]);
      const hydrated = hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'alchemical',
        buffs,
      });
      const state = new CraftingState({ qi: 100, stability: 50, buffs });
      const config = configFor('alchemical');
      for (const baseCost of [2, 7]) {
        const skill = retargetSkill({
          qiCost: 0,
          stabilityCost: 0,
          [cost]: baseCost,
        });
        const simulated = state.copy({
          harmonyData: simulatedCostReaction(charges),
        });
        const expected = calculateEffectiveActionCosts(
          simulated,
          skill,
          0,
          [],
          config,
        );
        expect(
          calculateEffectiveActionCosts(
            state.copy({ harmonyData: hydrated.harmonyData }),
            skill,
            0,
            [],
            config,
          ),
        ).toEqual(expected);
        expect(expected[cost]).toBe(baseCost === 2 ? 1 : 4);
        // The ordinary live-stat path is the runtime-equivalent reference.
        expect(
          calculateEffectiveActionCosts(state, skill, 0, [], config),
        ).toEqual(expected);
      }
    },
  );

  it.each(COST_REACTIONS)(
    'normalizes legacy $legacy saved modifiers without leaking them into outputs',
    ({ reduction, cost, legacy }) => {
      const harmonyData: HarmonyData = {
        recommendedTechniqueTypes: [],
        alchemicalArts: { charges: [], lastCombo: [] },
        additionalData: { alchemicalReactionModifiers: { [legacy]: 75 } },
      };
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        [reduction]: 20,
        harmonyData,
      });
      const canonical = state.copy({
        harmonyData: {
          ...harmonyData,
          additionalData: { alchemicalReactionModifiers: { [reduction]: 25 } },
        },
      });
      const config = configFor('alchemical');
      for (const baseCost of [2, 7]) {
        const skill = retargetSkill({
          qiCost: 0,
          stabilityCost: 0,
          [cost]: baseCost,
        });
        const expected = calculateEffectiveActionCosts(
          canonical,
          skill,
          0,
          [],
          config,
        );
        expect(
          calculateEffectiveActionCosts(state, skill, 0, [], config),
        ).toEqual(expected);
        expect(expected[cost]).toBe(baseCost === 2 ? 1 : 4);
      }
      const mods = getHarmonyStatModifiers(harmonyData, 'alchemical');
      expect(mods).toEqual(
        getHarmonyStatModifiers(canonical.harmonyData, 'alchemical'),
      );
      expect(mods).not.toHaveProperty(legacy);
      const next = processHarmonyEffect(harmonyData, 'alchemical', 'support');
      expect(
        next.harmonyData.additionalData?.alchemicalReactionModifiers,
      ).toEqual({
        [reduction]: 25,
      });
      expect(next.statModifiers).toEqual(mods);
      expect(harmonyData.additionalData?.alchemicalReactionModifiers).toEqual({
        [legacy]: 75,
      });
    },
  );
});

const REACTIONS: Array<{
  stats: NonNullable<BuffDefinition['stats']>;
  modifiers: Partial<HarmonyStatModifiers>;
}> = [
  {
    stats: { stabilityCostReduction: { value: 25 } },
    modifiers: { stabilityCostReduction: 25 },
  },
  {
    stats: { intensity: { value: 0.25, stat: 'intensity' } },
    modifiers: { intensityMultiplier: 1.25 },
  },
  {
    stats: { control: { value: 0.25, stat: 'control' } },
    modifiers: { controlMultiplier: 1.25 },
  },
  { stats: { critchance: { value: 25 } }, modifiers: { critChanceBonus: 25 } },
  {
    stats: { qiCostReduction: { value: 25 } },
    modifiers: { qiCostReduction: 25 },
  },
  {
    stats: { successChanceBonus: { value: 0.25 } },
    modifiers: { successChanceBonus: 0.25 },
  },
  {
    stats: { control: { value: -0.25, stat: 'control' } },
    modifiers: { controlMultiplier: 0.75 },
  },
];

describe('root Reaction hydration', () => {
  it.each(REACTIONS)(
    'hydrates literal $stats to $modifiers, preserving existing state',
    ({ stats, modifiers }) => {
      const progressHarmonyData: HarmonyData = {
        recommendedTechniqueTypes: ['fusion'],
        alchemicalArts: { charges: ['fusion'], lastCombo: [] },
        additionalData: { other: 3 },
      };
      const buffs = new Map([['reaction', liveBuff('Reaction', stats)]]);
      const result = hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'alchemical',
        progressHarmonyData,
        buffs,
      });
      expect(result.source).toBe('progressState');
      expect(result.harmonyData?.additionalData).toEqual({
        other: 3,
        alchemicalReactionModifiers: modifiers,
      });
      expect(result.harmonyData?.alchemicalArts).toEqual(
        progressHarmonyData.alchemicalArts,
      );
      expect(progressHarmonyData.additionalData).toEqual({ other: 3 });
      const fallback = hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'alchemical',
        buffs,
      });
      expect(fallback.source).toBe('buffs');
      expect(
        fallback.harmonyData?.additionalData?.alchemicalReactionModifiers,
      ).toEqual(modifiers);
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        buffs,
        harmonyData: result.harmonyData,
      });
      const config = configFor('alchemical');
      expect(calculateSkillGains(state, bothBars, config)).toEqual(
        calculateSkillGains(state.copy({ buffs: new Map() }), bothBars, config),
      );
    },
  );

  it.each([
    { control: { value: 0.5, stat: 'control' } },
    { control: { value: 0.25, stat: 'intensity' } },
    { control: { value: 0.25, stat: 'control', eqn: '1' } },
    { control: { value: 0.25, stat: 'control', scaling: 'stacks' } },
    { control: { value: 0.25, stat: 'control' }, critchance: { value: 25 } },
  ] satisfies Array<BuffDefinition['stats']>)(
    'keeps unknown Reaction payloads in the live buff path: %j',
    (stats) => {
      const buffs = new Map([['reaction', liveBuff('Reaction', stats)]]);
      const result = hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'alchemical',
        buffs,
        progressHarmonyData: { recommendedTechniqueTypes: [] },
      });
      expect(
        result.harmonyData?.additionalData?.alchemicalReactionModifiers,
      ).toBeUndefined();
      const state = new CraftingState({
        qi: 100,
        stability: 50,
        buffs,
        harmonyData: result.harmonyData,
      });
      const withLive = calculateSkillGains(
        state,
        bothBars,
        configFor('alchemical'),
      );
      expect(withLive.perfection).toBeGreaterThan(100);
      expect(
        applySkill(state, bothBars, configFor('alchemical'))!.buffs.has(
          'reaction',
        ),
      ).toBe(true);
    },
  );

  it('does not replace already modelled modifiers or hydrate outside alchemical sublime crafts', () => {
    const buffs = new Map([
      [
        'reaction',
        liveBuff('Reaction', { control: { value: -0.25, stat: 'control' } }),
      ],
    ]);
    const data: HarmonyData = {
      recommendedTechniqueTypes: [],
      additionalData: {
        alchemicalReactionModifiers: { intensityMultiplier: 1.25 },
      },
    };
    expect(
      hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'alchemical',
        buffs,
        progressHarmonyData: data,
      }).harmonyData,
    ).toEqual(data);
    expect(
      hydrateHarmonyData({
        isSublimeCraft: false,
        craftingType: 'alchemical',
        buffs,
      }).harmonyData,
    ).toBeUndefined();
    expect(
      hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'resonance',
        buffs,
      }).harmonyData,
    ).toBeUndefined();
  });
});
