import { CraftingState } from '../optimizer/state';
import { applySkillOutcomes } from '../optimizer/skills';
import { findBestSkill } from '../optimizer/search';
import { projectNativeAutoUseBranches } from '../optimizer/nativeAutoUsePlan';
import { initHarmonyData } from '../optimizer/harmony';
import { HARMONY_TYPES } from '../optimizer/harmonyRegistry';
import type { BuffDefinition } from '../optimizer/gameTypes';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

test.each(['history', '_cacheKey'])(
  'nested %s counters remain distinct in stochastic policy caches',
  (key) => {
    const buff: BuffDefinition = {
      name: 'Counter',
      canStack: false,
      effects: [],
      onStabilize: [
        {
          kind: 'setState',
          key,
          value: { value: 0 },
          condition: { kind: 'chance', percentage: 50 },
        },
      ],
      onFusion: [
        { kind: 'completion', amount: { value: 100, eqn: key } },
        { kind: 'perfection', amount: { value: 100, eqn: key } },
      ],
    };
    const setup = retargetSkill({
      key: 'setup',
      type: 'stabilize',
      stabilityCost: 1,
      cooldown: 20,
      preventsMaxStabilityDecay: true,
    });
    const finish = retargetSkill({
      key: 'finish',
      type: 'fusion',
      stabilityCost: 1,
      preventsMaxStabilityDecay: true,
    });
    const config = retargetConfig(setup, {
      skills: [setup, finish],
      maxCompletion: 100,
      maxPerfection: 100,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 2,
      cooldowns: new Map([['finish', 1]]),
      buffs: new Map([
        [
          'counter',
          {
            name: 'Counter',
            stacks: 1,
            definition: buff,
            internalState: { [key]: 1 },
          },
        ],
      ]),
    });
    const children = applySkillOutcomes(
      state,
      setup,
      config,
      [],
      100,
      'neutral',
      100,
    );
    expect(
      children.outcomes
        .map((o) => o.state.buffs.get('counter')?.internalState?.[key])
        .sort(),
    ).toEqual([0, 1]);
    const result = findBestSkill(
      state,
      config,
      100,
      100,
      false,
      3,
      'neutral',
      [],
      { timeBudgetMs: 60000, maxNodes: 1000 },
    );
    expect(result.recommendation?.skill.key).toBe('setup');
    expect(
      result.recommendation?.planning?.goalProbabilityLowerBound,
    ).toBeCloseTo(0.5);
    expect(
      result.recommendation?.planning?.prematureEndProbability,
    ).toBeCloseTo(0.5);
  },
);

const refine = retargetSkill({
  key: 'refine',
  type: 'refine',
  stabilityCost: 2,
  preventsMaxStabilityDecay: true,
  effects: [
    { kind: 'completion', amount: { value: 120 } },
    { kind: 'perfection', amount: { value: 120 } },
  ],
});
const cfg = retargetConfig(refine, {
  isSublimeCraft: true,
  craftingType: 'resonance',
  maxCompletion: 230,
  maxPerfection: 230,
});
test('missing Resonance data cannot certify a two-action route that its penalty ends early', () => {
  const missing = new CraftingState({ qi: 100, stability: 5, step: 1 });
  expect(applySkillOutcomes(missing, refine, cfg)).toMatchObject({
    outcomes: [],
    unresolvedProbability: 1,
  });
  const result = findBestSkill(
    missing,
    cfg,
    100,
    100,
    false,
    3,
    'neutral',
    [],
    {
      maxNodes: 1000,
      timeBudgetMs: 60000,
      completionBandCeiling: 2,
      perfectionBandGoal: 2,
    },
  );
  expect(result.recommendation).toBeNull();
  expect(
    result.blockedReasons?.some(
      (r) => r.reason === 'unresolved' && r.details.includes('harmony'),
    ),
  ).toBe(true);
  const observed = new CraftingState({
    qi: 100,
    stability: 5,
    step: 1,
    harmonyData: {
      recommendedTechniqueTypes: ['fusion'],
      resonance: { resonance: 'fusion', strength: 0, pendingCount: 0 },
    },
  });
  const real = applySkillOutcomes(observed, refine, cfg);
  expect(real.unresolvedProbability).toBe(0);
  expect(
    real.outcomes.every(
      (o) => o.state.stability === 0 && o.state.completion < 230,
    ),
  ).toBe(true);
});
test.each(HARMONY_TYPES)(
  'requires established %s state, and accepts initialized state',
  (craftingType) => {
    const config = { ...cfg, craftingType };
    expect(
      applySkillOutcomes(
        new CraftingState({ qi: 100, stability: 60, step: 1 }),
        refine,
        config,
      ).unresolvedProbability,
    ).toBe(1);
    expect(
      applySkillOutcomes(
        new CraftingState({
          qi: 100,
          stability: 60,
          step: 1,
          harmonyData: initHarmonyData(craftingType, 200),
        }),
        refine,
        config,
      ).unresolvedProbability,
    ).toBe(0);
  },
);
test('a midcraft empty harmony envelope cannot substitute for missing Resonance counters', () => {
  const state = new CraftingState({
    qi: 100,
    stability: 60,
    step: 1,
    harmonyData: { recommendedTechniqueTypes: [] },
  });
  expect(applySkillOutcomes(state, refine, cfg).unresolvedProbability).toBe(1);
});
test.each([undefined, null, {}, { name: 42 }, { name: '' }])(
  'malformed native createBuff payload pauses: %j',
  (buff) => {
    const item = retargetSkill({
      actionKind: 'item',
      itemName: 'pill',
      effects: [{ kind: 'createBuff', buff } as never],
    });
    const state = new CraftingState({
      qi: 100,
      stability: 60,
      items: new Map([['pill', 1]]),
    });
    const config = retargetConfig(refine, {
      nativeAutoUsePlan: {
        slots: [{ item: 'Pill' }],
        items: { Pill: { action: item, toxicityBeforeResistance: 0 } },
        initialUsage: {},
        baseResistance: 0,
      },
    });
    expect(projectNativeAutoUseBranches(state, config)).toMatchObject({
      outcomes: [],
      unresolvedProbability: 1,
    });
    // The registry scan must also tolerate malformed names in an unselected
    // item while evaluating a different, well-shaped selected slot.
    config.nativeAutoUsePlan!.items.Good = {
      action: retargetSkill({
        actionKind: 'item',
        itemName: 'good',
        effects: [],
      }),
      toxicityBeforeResistance: 0,
    };
    config.nativeAutoUsePlan!.slots = [
      {
        item: 'Good',
        rule: {
          conditions: [{ condition: 'Unknown Buff', check: '>', value: 0 }],
        },
      },
    ];
    const registryState = state.copy({ items: new Map([['good', 1]]) });
    expect(projectNativeAutoUseBranches(registryState, config)).toMatchObject({
      outcomes: [],
      unresolvedProbability: 1,
    });
  },
);
