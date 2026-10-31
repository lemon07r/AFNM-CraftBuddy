import { applySkillOutcomes } from '../optimizer/skills';
import { CraftingState } from '../optimizer/state';
import { retargetSkill, retargetConfig } from './fixtures/runtime0717';
import { prdCoefficient } from '../optimizer/stochastic';
import {
  calculateExpectedCritMultiplier,
  setNativeCraftingUtils,
} from '../optimizer/gameTypes';

test('failure pays costs but does not receive a fractional success or buff', () => {
  const skill = retargetSkill({
    successChance: 0.5,
    stabilityCost: 10,
    effects: [
      { kind: 'completion', amount: { value: 200 } },
      {
        kind: 'createBuff',
        stacks: { value: 1 },
        buff: { name: 'Reward', canStack: true, effects: [] },
      },
    ],
  });
  const result = applySkillOutcomes(
    new CraftingState({ qi: 100, stability: 10 }),
    skill,
    retargetConfig(skill),
    [],
    100,
    'neutral',
    100,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(
    result.outcomes
      .map((o) => [o.probability, o.state.completion, o.state.stability])
      .sort(),
  ).toEqual([
    [0.5, 0, 0],
    [0.5, 200, 0],
  ]);
  expect(
    result.outcomes.find((o) => o.state.completion === 0)?.state.buffs.size,
  ).toBe(0);
});

test('independent critical gains preserve four attainable bar outcomes', () => {
  const skill = retargetSkill({
    effects: [
      { kind: 'completion', amount: { value: 10 } },
      { kind: 'perfection', amount: { value: 10 } },
    ],
  });
  const state = new CraftingState({
    qi: 100,
    stability: 50,
    critChance: 50,
    critMultiplier: 200,
  });
  const result = applySkillOutcomes(state, skill, retargetConfig(skill));
  expect(result.unresolvedProbability).toBe(0);
  expect(
    result.outcomes.map((o) => [o.state.completion, o.state.perfection]).sort(),
  ).toEqual([
    [10, 10],
    [10, 20],
    [20, 10],
    [20, 20],
  ]);
  expect(result.outcomes.every((o) => o.probability === 0.25)).toBe(true);
});

test('mastery proc persists as a whole buff and changes actual payment', () => {
  const skill = retargetSkill({
    stabilityCost: 10,
    masteryEntries: [
      {
        kind: 'effect',
        effects: [
          {
            kind: 'createBuff',
            condition: { kind: 'chance', percentage: 50 },
            stacks: { value: 1 },
            buff: {
              name: 'Discount',
              canStack: true,
              effects: [],
              stats: { stabilityCostReduction: { value: 50 } },
            },
          },
        ],
      },
    ],
  });
  const result = applySkillOutcomes(
    new CraftingState({ qi: 100, stability: 6 }),
    skill,
    retargetConfig(skill),
  );
  expect(
    result.outcomes
      .map((o) => [
        o.probability,
        o.state.stability,
        o.state.getBuffStacks('discount'),
      ])
      .sort(),
  ).toEqual([
    [0.5, 0, 0],
    [0.5, 1, 1],
  ]);
});

test('truncated enumeration retains missing probability instead of inventing certainty', () => {
  const skill = retargetSkill({
    successChance: 0.5,
    effects: [{ kind: 'completion', amount: { value: 10 } }],
  });
  const result = applySkillOutcomes(
    new CraftingState({ qi: 100, stability: 50 }),
    skill,
    retargetConfig(skill),
    [],
    100,
    'neutral',
    100,
    1,
  );
  expect(
    result.outcomes.reduce((sum, o) => sum + o.probability, 0) +
      result.unresolvedProbability,
  ).toBeCloseTo(1);
  expect(result.unresolvedProbability).toBe(0.5);
});

test('stability overdraft is not erased before a later buff restore', () => {
  const skill = retargetSkill({ stabilityCost: 10 });
  const state = new CraftingState({
    qi: 100,
    stability: 5,
    buffs: new Map([
      [
        'regen',
        {
          name: 'regen',
          stacks: 1,
          definition: {
            name: 'Regen',
            canStack: false,
            effects: [{ kind: 'stability', amount: { value: 3 } }],
          },
        },
      ],
    ]),
  });
  const result = applySkillOutcomes(state, skill, retargetConfig(skill));
  expect(result.outcomes[0].state.stability).toBe(0);
});

test('known failure streak uses PRD probability and resets on success', () => {
  const skill = retargetSkill({
    key: 'probe',
    successChance: 0.5,
    baseCompletionGain: 100,
  });
  const state = new CraftingState({
    qi: 100,
    stability: 50,
    nativeVariables: { prd_failures_probe: 1 },
  });
  const result = applySkillOutcomes(
    state,
    skill,
    retargetConfig(skill, { techniqueSuccessModel: 'prd' }),
  );
  const success = result.outcomes.find((o) => o.state.completion > 0)!;
  expect(prdCoefficient(0.5)).toBeCloseTo(0.302103025, 7);
  expect(success.probability).toBeCloseTo(2 * prdCoefficient(0.5));
  expect(success.state.nativeVariables?.prd_failures_probe).toBe(0);
  expect(
    result.outcomes.find((o) => o.state.completion === 0)?.state.nativeVariables
      ?.prd_failures_probe,
  ).toBe(2);
});

test('hidden carried PRD streak is explicitly probability-uncertain', () => {
  const skill = retargetSkill({ successChance: 0.5, baseCompletionGain: 100 });
  const result = applySkillOutcomes(
    new CraftingState({ qi: 100, stability: 50 }),
    skill,
    retargetConfig(skill, { techniqueSuccessModel: 'prd' }),
  );
  expect(result.probabilityUncertain).toBe(true);
  expect(result.outcomes).toHaveLength(2);
});

test('overcrit chains branch with whole multiplier counts', () => {
  const skill = retargetSkill({
    effects: [{ kind: 'completion', amount: { value: 10 } }],
  });
  const state = new CraftingState({
    qi: 100,
    stability: 50,
    critChance: 100,
    critMultiplier: 200,
    nativeVariables: { base_overcrit: 50 },
  });
  const result = applySkillOutcomes(state, skill, retargetConfig(skill));
  expect(result.unresolvedProbability).toBe(0);
  expect(
    result.outcomes.find((o) => o.state.completion === 20)?.probability,
  ).toBeCloseTo(0.5);
  expect(
    result.outcomes.find((o) => o.state.completion === 40)?.probability,
  ).toBeCloseTo(0.5 * 0.75);
  expect(result.outcomes.reduce((p, o) => p + o.probability, 0)).toBeCloseTo(1);
});

test('EV preview does not call the native RNG helper', () => {
  const roll = jest.fn(() => ({ multiplier: 1, critCount: 0, didCrit: false }));
  setNativeCraftingUtils({ calculateCraftingOvercrit: roll });
  try {
    expect(calculateExpectedCritMultiplier(50, 150)).toBe(1.25);
    expect(roll).not.toHaveBeenCalled();
  } finally {
    setNativeCraftingUtils(undefined);
  }
});

test('failure triggers create an ordinary whole buff before turn ticks', () => {
  const skill = retargetSkill({ successChance: 0 });
  const favor = {
    name: "Fate's Favor",
    canStack: true,
    effects: [],
    stats: { successChanceBonus: { value: 0.03, scaling: 'stacks' } },
  };
  const state = new CraftingState({
    qi: 100,
    stability: 50,
    buffs: new Map([
      [
        'flame',
        {
          name: 'flame',
          stacks: 1,
          definition: {
            name: 'Flame',
            canStack: false,
            effects: [],
            triggeredEffects: [
              {
                trigger: 'actionFailed',
                effects: [
                  { kind: 'createBuff', buff: favor, stacks: { value: 1 } },
                ],
              },
            ],
          },
        },
      ],
    ]),
  });
  const result = applySkillOutcomes(state, skill, retargetConfig(skill));
  expect(result.outcomes[0].state.getBuffStacks("fate's_favor")).toBe(1);
});

test('boosts round each separate bar application before summing', () => {
  const skill = retargetSkill({
    effects: [
      { kind: 'completion', amount: { value: 10 } },
      { kind: 'completion', amount: { value: 10 } },
    ],
  });
  const state = new CraftingState({
    qi: 100,
    stability: 50,
    buffs: new Map([
      [
        'boost',
        {
          name: 'boost',
          stacks: 1,
          definition: {
            name: 'Boost',
            canStack: false,
            effects: [],
            stats: { completionBoost: { value: 15 } },
          },
        },
      ],
    ]),
  });
  expect(
    applySkillOutcomes(state, skill, retargetConfig(skill)).outcomes[0].state
      .completion,
  ).toBe(22);
});
