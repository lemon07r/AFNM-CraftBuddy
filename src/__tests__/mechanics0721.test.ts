import { CraftingState } from '../optimizer';
import { applySkill, calculateSkillGains } from '../optimizer/skills';
import type { BuffDefinition } from '../optimizer/gameTypes';
import { buildCraftContextVariables } from '../optimizer/nativeVariables';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

// Lanternheart Flame as shipped in AFNM 0.7.21: the refine gate reads the
// runtime's `Condition: <label>` flag variable through zu().
const kindledBrilliance: BuffDefinition = {
  name: 'Kindled Brilliance',
  canStack: true,
  stats: {
    critchance: { value: 3, scaling: 'stacks' },
    overcrit: { value: 1, scaling: 'stacks' },
  },
  effects: [],
};

const lanternheartFlame: BuffDefinition = {
  name: 'Lanternheart Flame',
  canStack: false,
  effects: [],
  onRefine: [
    {
      kind: 'createBuff',
      buff: kindledBrilliance,
      stacks: { value: 1 },
      condition: { kind: 'condition', condition: 'Condition__Harmonious' },
    },
    {
      kind: 'createBuff',
      buff: kindledBrilliance,
      stacks: { value: 3 },
      condition: { kind: 'condition', condition: 'Condition__Brilliant' },
    },
  ],
};

function flameState(): CraftingState {
  return new CraftingState({
    qi: 100,
    stability: 50,
    buffs: new Map([
      [
        'lanternheart_flame',
        {
          name: 'Lanternheart Flame',
          stacks: 1,
          definition: lanternheartFlame,
        },
      ],
    ]),
  });
}

function refineUnder(condition: string, type: 'refine' | 'fusion' = 'refine') {
  const skill = retargetSkill({ type });
  const next = applySkill(
    flameState(),
    skill,
    retargetConfig(skill),
    [],
    100,
    condition,
    100,
  );
  expect(next).not.toBeNull();
  return next!.getBuffStacks('kindled_brilliance');
}

describe('AFNM 0.7.21 runtime condition variables', () => {
  it('names the flags exactly as the runtime zu() sanitizer does', () => {
    expect(buildCraftContextVariables('positive', 'forge')).toEqual({
      Condition__Harmonious: 1,
      Harmony__Forge_Works: 1,
    });
    expect(buildCraftContextVariables(undefined, undefined)).toEqual({
      Condition__Balanced: 1,
    });
    expect(buildCraftContextVariables('neutral', 'alchemical')).toEqual({
      Condition__Balanced: 1,
      Harmony__Alchemical_Arts: 1,
    });
    expect(buildCraftContextVariables('veryNegative', undefined)).toEqual({
      Condition__Corrupted: 1,
    });
  });

  it.each([
    ['neutral', 0],
    ['positive', 1],
    ['veryPositive', 3],
    ['negative', 0],
    ['veryNegative', 0],
  ])(
    'grants Lanternheart Flame stacks on refine while %s',
    (condition, stacks) => {
      expect(refineUnder(condition)).toBe(stacks);
    },
  );

  it('accepts display labels for the action condition', () => {
    expect(refineUnder('Harmonious')).toBe(1);
  });

  it('ignores non-refine actions', () => {
    expect(refineUnder('veryPositive', 'fusion')).toBe(0);
  });

  it('previews condition-gated technique gains like the transition', () => {
    const skill = retargetSkill({
      effects: [
        {
          kind: 'completion',
          amount: { value: 20 },
          condition: { kind: 'condition', condition: 'Condition__Harmonious' },
        },
      ],
    });
    const config = retargetConfig(skill);
    const state = new CraftingState({ qi: 100, stability: 50 });
    for (const [condition, expected] of [
      ['positive', 20],
      ['neutral', 0],
    ] as const) {
      const preview = calculateSkillGains(state, skill, config, [], {
        currentCondition: condition,
      });
      const next = applySkill(state, skill, config, [], 100, condition, 100)!;
      expect(preview.completion).toBe(expected);
      expect(next.completion - state.completion).toBe(expected);
    }
  });

  it('prices condition-gated chance masteries with the action condition', () => {
    const discount: BuffDefinition = {
      name: 'Harmonious discount',
      canStack: false,
      effects: [],
      stats: { poolCostPercentage: { value: 50 } },
    };
    const skill = retargetSkill({
      qiCost: 40,
      stabilityCost: 0,
      effects: [],
      masteryEntries: [
        {
          kind: 'effect',
          condition: { kind: 'condition', condition: 'Condition__Harmonious' },
          effects: [
            {
              kind: 'createBuff',
              buff: discount,
              stacks: { value: 1 },
              condition: { kind: 'chance', percentage: 50 },
            },
          ],
        },
      ],
    });
    const config = retargetConfig(skill);
    const qiAfter = (condition: string): number =>
      applySkill(
        new CraftingState({ qi: 100, stability: 50 }),
        skill,
        config,
        [],
        100,
        condition,
        100,
      )!.qi;
    // Realized branches pay 20 (discount) or 40, so the expected payment is 30.
    expect(qiAfter('positive')).toBe(70);
    expect(qiAfter('neutral')).toBe(60);
  });
});
