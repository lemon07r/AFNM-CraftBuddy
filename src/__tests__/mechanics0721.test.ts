import { CraftingState } from '../optimizer';
import { applySkill } from '../optimizer/skills';
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
      Harmony__forge: 1,
    });
    expect(buildCraftContextVariables(undefined, undefined)).toEqual({
      Condition__Balanced: 1,
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
});
