import { CraftingState, type TrackedBuff } from '../optimizer/state';
import type {
  BuffDefinition,
  HarmonyType,
  HarmonyData,
} from '../optimizer/gameTypes';
import type { HarmonyStatModifiers } from '../optimizer/harmony';
import { applySkill, calculateSkillGains } from '../optimizer/skills';
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
    ).toEqual({ poolCostPercentage: 75 });
    expect(calculateSkillGains(next, bothBars, config).perfection).toBe(100);
    expect(state.buffs.get('reaction')).toBe(heldBuff);
    expect(state.buffs.get('reaction')).toEqual(buff);
  });
});

const REACTIONS: Array<{
  stats: NonNullable<BuffDefinition['stats']>;
  modifiers: Partial<HarmonyStatModifiers>;
}> = [
  {
    stats: { stabilityCostReduction: { value: 25 } },
    modifiers: { stabilityCostPercentage: 75 },
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
    modifiers: { poolCostPercentage: 75 },
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
