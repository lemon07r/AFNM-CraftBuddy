import { CraftingState } from '../optimizer/state';
import { applySkillOutcomes, canApplySkill } from '../optimizer/skills';
import { isSupportedCraftingExpression } from '../optimizer/gameTypes';
import { projectNativeAutoUseBranches } from '../optimizer/nativeAutoUsePlan';
import { findBestSkill } from '../optimizer/search';
import { buildOutcomeSummary } from '../utils/outcomeSummary';
import { retargetSkill, retargetConfig } from './fixtures/runtime0717';

const finish = retargetSkill({
  key: 'finish',
  qiCost: 10,
  stabilityCost: 10,
  effects: [{ kind: 'completion', amount: { value: 100 } }],
});
const config = retargetConfig(finish, {
  maxCompletion: 100,
  maxPerfection: 0,
  targetPerfection: 0,
});
const state = () =>
  new CraftingState({ qi: 100, stability: 60, maxToxicity: 100 });
const outcomes = (s = state(), skill = finish) =>
  applySkillOutcomes(
    s,
    skill,
    { ...config, skills: [skill] },
    [],
    100,
    'neutral',
    0,
  );

test('unresolved active buff definitions prevent certification', () => {
  const s = state().copy({
    buffs: new Map([['unknown', { name: 'Unknown', stacks: 1 }]]),
  });
  expect(outcomes(s)).toMatchObject({ outcomes: [], unresolvedProbability: 1 });
});
test('an active buff resolved from the roster remains supported', () => {
  const buff = { name: 'Known', canStack: false, effects: [] };
  const skill = { ...finish, grantedBuff: buff };
  const s = state().copy({
    buffs: new Map([['known', { name: 'Known', stacks: 1 }]]),
  });
  expect(outcomes(s, skill).unresolvedProbability).toBe(0);
});
test.each([
  '{}',
  '{x:1}',
  'floor',
  '1,2',
  'null',
  'min()',
  '1e999',
  '++stacks',
  'stacks-- + 1',
])('rejects nonnumeric or malformed expression %s', (eqn) => {
  expect(isSupportedCraftingExpression(eqn)).toBe(false);
  expect(
    outcomes(state(), {
      ...finish,
      effects: [{ kind: 'completion', amount: { value: 100, eqn } }],
    }).unresolvedProbability,
  ).toBe(1);
});
test.each([
  '',
  '1.5 + stacks * 2',
  'floor(stacks / 2)',
  'min(1,max(2,3))',
  '(stacks > 2) and (pool < 10)',
  '!stacks || true',
  '1e-3',
  '-2 ** 2',
])('keeps supported syntax or JS rejection for %s', (eqn) => {
  expect(isSupportedCraftingExpression(eqn)).toBe(eqn !== '-2 ** 2');
});
const pill = retargetSkill({
  key: 'pill',
  itemName: 'pill',
  actionKind: 'item',
  consumesTurn: false,
  qiCost: 0,
  stabilityCost: 0,
  effects: [{ kind: 'futureEffect' } as never],
});
const nativeConfig = {
  ...config,
  nativeAutoUsePlan: {
    slots: [{ item: 'Pill' }],
    items: { Pill: { action: pill, toxicityBeforeResistance: 0 } },
    initialUsage: {},
    baseResistance: 0,
  },
};
test('unsupported out-of-stock native item does not block a technique', () => {
  expect(
    projectNativeAutoUseBranches(state(), nativeConfig, 'neutral')
      .unresolvedProbability,
  ).toBe(0);
});
test('unsupported selected native item still blocks certification', () => {
  expect(
    projectNativeAutoUseBranches(
      state().copy({ items: new Map([['pill', 1]]) }),
      nativeConfig,
      'neutral',
    ),
  ).toMatchObject({ outcomes: [], unresolvedProbability: 1 });
});
test.each(['rule', 'budget', 'toxicity', 'maxCount'] as const)(
  'unselected unsupported native item: %s',
  (cause) => {
    const s = state().copy({ items: new Map([['pill', 1]]) });
    const cfg = {
      ...nativeConfig,
      pillsPerRound: cause === 'budget' ? 0 : 1,
      nativeAutoUsePlan: {
        ...nativeConfig.nativeAutoUsePlan,
        slots: [
          {
            item: 'Pill',
            maxCount: cause === 'maxCount' ? 1 : undefined,
            rule:
              cause === 'rule'
                ? { conditions: [{ condition: 'Step', check: '>', value: 10 }] }
                : undefined,
          },
        ],
        initialUsage: { Pill: cause === 'maxCount' ? 1 : 0 },
        items: {
          Pill: {
            action: pill,
            toxicityBeforeResistance: cause === 'toxicity' ? 101 : 0,
          },
        },
      },
    };
    expect(
      projectNativeAutoUseBranches(s, cfg, 'neutral').unresolvedProbability,
    ).toBe(0);
  },
);
test('unrecognised native selector rule remains unresolved', () => {
  const cfg = {
    ...nativeConfig,
    nativeAutoUsePlan: {
      ...nativeConfig.nativeAutoUsePlan,
      slots: [
        {
          item: 'Pill',
          rule: {
            conditions: [{ condition: 'Unknown', check: '>', value: 10 }],
          },
        },
      ],
    },
  };
  expect(
    projectNativeAutoUseBranches(
      state().copy({ items: new Map([['pill', 1]]) }),
      cfg,
      'neutral',
    ).unresolvedProbability,
  ).toBe(1);
});
test('native buff payment absent from the projected transition is unresolved', () => {
  const skill = {
    ...finish,
    nativeTechnique: { buffCost: { buff: { name: 'Known' }, amount: 1 } },
  };
  const s = state().copy({
    buffs: new Map([
      [
        'known',
        {
          name: 'Known',
          stacks: 1,
          definition: { name: 'Known', canStack: true, effects: [] },
        },
      ],
    ]),
  });
  expect(outcomes(s, skill).unresolvedProbability).toBe(1);
  expect(
    outcomes(s, { ...skill, buffCost: { buffName: 'known', amount: 1 } })
      .unresolvedProbability,
  ).toBe(0);
});
test.each([
  { firstActionOnly: true },
  { minStability: 60 },
  { conditionRequirement: 'positive' },
  { buffRequirement: { buff: { name: 'Missing' }, amount: 1 } },
  {
    disableAtMaxStacks: true,
    effects: [
      {
        kind: 'createBuff',
        stacks: { value: 1 },
        buff: { name: 'Full', maxStacks: 1, canStack: true, effects: [] },
      },
    ],
  },
])('native gate prevents a verified transition: %j', (nativeTechnique) => {
  const s = state().copy({
    step: 1,
    buffs: new Map([
      [
        'full',
        {
          name: 'Full',
          stacks: 1,
          definition: {
            name: 'Full',
            maxStacks: 1,
            canStack: true,
            effects: [],
          },
        },
      ],
    ]),
  });
  const skill = { ...finish, nativeTechnique };
  expect(canApplySkill(s, skill, 0, 100, 'neutral', [], 1, config)).toBe(false);
  expect(outcomes(s, skill).outcomes).toHaveLength(0);
});
test('known native gates allow legal states and use simulated cooldowns', () => {
  const skill = {
    ...finish,
    nativeTechnique: {
      firstActionOnly: true,
      minStability: 45,
      currentCooldown: 2,
    },
  };
  expect(outcomes(state(), skill).unresolvedProbability).toBe(0);
  expect(outcomes(state(), skill).outcomes.length).toBeGreaterThan(0);
  expect(
    outcomes(state().copy({ cooldowns: new Map([['finish', 1]]) }), skill)
      .outcomes,
  ).toHaveLength(0);
});
test.each([
  { futureGate: true },
  { minStability: '45' },
  { firstActionOnly: 'yes' },
  { buffCost: { buff: { name: 'A' }, amount: '1' } },
])('unknown native shape remains unresolved: %j', (nativeTechnique) => {
  expect(
    outcomes(state(), { ...finish, nativeTechnique }).unresolvedProbability,
  ).toBe(1);
});
test('terminal unmet goals are already displayed as stopped', () => {
  const result = findBestSkill(
    state().copy({ stability: 0 }),
    config,
    100,
    0,
    false,
    2,
    'neutral',
    [],
    { maxNodes: 100, timeBudgetMs: 10000 },
  );
  expect(result.recommendation).toBeNull();
  expect(
    buildOutcomeSummary({ projection: result.outcomeProjection })
      ?.requestedGoals?.status,
  ).toBe('Selected goals not reached');
});
